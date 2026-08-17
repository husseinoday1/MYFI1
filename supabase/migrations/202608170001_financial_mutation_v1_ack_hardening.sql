-- MYFI P19-003
-- Harden V1 mutation acknowledgement semantics without changing the wire shape.
-- Exact retries are acknowledged; same mutation_id with different content fails.
-- This migration is backward-compatible with current V1 clients.

create or replace function public.sync_financial_mutations_v1(
  p_mutations jsonb default '[]'::jsonb,
  p_after_sequence bigint default 0,
  p_device_id text default '',
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_count integer;
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 500));
  v_accepted jsonb := '[]'::jsonb;
  v_remote jsonb := '[]'::jsonb;
  v_latest bigint := greatest(0, coalesce(p_after_sequence, 0));
  v_existing public.financial_mutations_v1%rowtype;
  v_inserted_mutation_id text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_mutations, '[]'::jsonb)) <> 'array' then
    raise exception 'mutations_must_be_array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(coalesce(p_mutations, '[]'::jsonb));
  if v_count > 500 then
    raise exception 'mutation_batch_too_large' using errcode = '22023';
  end if;
  if length(coalesce(p_device_id, '')) > 200 then
    raise exception 'device_id_too_long' using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_mutations, '[]'::jsonb))
  loop
    if coalesce(v_item->>'mutationId', '') = ''
       or coalesce(v_item->>'entityType', '') = ''
       or coalesce(v_item->>'entityId', '') = ''
       or coalesce(v_item->>'operation', '') not in ('upsert', 'delete', 'void')
       or coalesce((v_item->>'entityRevision')::bigint, 0) <= 0
       or coalesce((v_item->>'payloadVersion')::integer, 0) <= 0 then
      raise exception 'mutation_invalid' using errcode = '22023';
    end if;

    if length(v_item->>'mutationId') > 300
       or length(v_item->>'entityType') > 100
       or length(v_item->>'entityId') > 300
       or pg_column_size(coalesce(v_item->'payload', 'null'::jsonb)) > 1048576 then
      raise exception 'mutation_limit_exceeded' using errcode = '22023';
    end if;

    v_existing := null;
    select *
      into v_existing
      from public.financial_mutations_v1
     where user_id = v_user_id
       and mutation_id = v_item->>'mutationId'
     limit 1;

    if v_existing.mutation_id is not null then
      if v_existing.entity_type is distinct from (v_item->>'entityType')
         or v_existing.entity_id is distinct from (v_item->>'entityId')
         or v_existing.operation is distinct from (v_item->>'operation')
         or v_existing.entity_revision is distinct from ((v_item->>'entityRevision')::bigint)
         or v_existing.payload_version is distinct from ((v_item->>'payloadVersion')::integer)
         or v_existing.payload is distinct from coalesce(v_item->'payload', 'null'::jsonb) then
        raise exception 'mutation_id_conflict' using errcode = '40001';
      end if;

      v_accepted := v_accepted || jsonb_build_array(v_item->>'mutationId');
      continue;
    end if;

    v_inserted_mutation_id := null;
    insert into public.financial_mutations_v1 (
      user_id, mutation_id, device_id, entity_type, entity_id, operation,
      entity_revision, payload_version, payload, created_at
    ) values (
      v_user_id,
      v_item->>'mutationId',
      coalesce(nullif(p_device_id, ''), 'unknown-device'),
      v_item->>'entityType',
      v_item->>'entityId',
      v_item->>'operation',
      (v_item->>'entityRevision')::bigint,
      (v_item->>'payloadVersion')::integer,
      coalesce(v_item->'payload', 'null'::jsonb),
      coalesce((v_item->>'createdAt')::timestamptz, now())
    )
    on conflict (user_id, mutation_id) do nothing
    returning mutation_id into v_inserted_mutation_id;

    if v_inserted_mutation_id is null then
      -- A concurrent request won the unique-key race. Re-read and verify that
      -- it is an exact idempotent retry before acknowledging it.
      v_existing := null;
      select *
        into v_existing
        from public.financial_mutations_v1
       where user_id = v_user_id
         and mutation_id = v_item->>'mutationId'
       limit 1;

      if v_existing.mutation_id is null
         or v_existing.entity_type is distinct from (v_item->>'entityType')
         or v_existing.entity_id is distinct from (v_item->>'entityId')
         or v_existing.operation is distinct from (v_item->>'operation')
         or v_existing.entity_revision is distinct from ((v_item->>'entityRevision')::bigint)
         or v_existing.payload_version is distinct from ((v_item->>'payloadVersion')::integer)
         or v_existing.payload is distinct from coalesce(v_item->'payload', 'null'::jsonb) then
        raise exception 'mutation_id_conflict' using errcode = '40001';
      end if;
    end if;

    v_accepted := v_accepted || jsonb_build_array(v_item->>'mutationId');
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'serverSequence', row.server_sequence,
           'mutationId', row.mutation_id,
           'deviceId', row.device_id,
           'entityType', row.entity_type,
           'entityId', row.entity_id,
           'operation', row.operation,
           'entityRevision', row.entity_revision,
           'payloadVersion', row.payload_version,
           'payload', row.payload,
           'createdAt', row.created_at
         ) order by row.server_sequence), '[]'::jsonb),
         coalesce(max(row.server_sequence), v_latest)
    into v_remote, v_latest
    from (
      select *
        from public.financial_mutations_v1
       where user_id = v_user_id
         and server_sequence > greatest(0, coalesce(p_after_sequence, 0))
       order by server_sequence
       limit v_limit
    ) as row;

  return jsonb_build_object(
    'acceptedMutationIds', v_accepted,
    'remoteMutations', v_remote,
    'latestSequence', v_latest,
    'hasMore', exists (
      select 1
        from public.financial_mutations_v1
       where user_id = v_user_id
         and server_sequence > v_latest
    )
  );
end;
$$;

revoke all on function public.sync_financial_mutations_v1(jsonb,bigint,text,integer) from public, anon;
grant execute on function public.sync_financial_mutations_v1(jsonb,bigint,text,integer) to authenticated;
