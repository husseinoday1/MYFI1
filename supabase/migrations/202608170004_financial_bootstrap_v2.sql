-- MYFI P19-010 — verified, resumable V2 bootstrap protocol.
-- V2 remains inactive in the application store. This migration adds only the
-- bootstrap transport required before controlled activation.

create table if not exists public.financial_bootstrap_sessions_v2 (
  ledger_id text not null references public.financial_ledgers_v2(ledger_id) on delete cascade,
  restore_epoch bigint not null check (restore_epoch > 0),
  bootstrap_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  expected_row_count integer not null check (expected_row_count between 0 and 1000000),
  status text not null default 'staging'
    check (status in ('staging','uploading','finalized','aborted')),
  device_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  primary key (ledger_id, restore_epoch, bootstrap_id)
);

create table if not exists public.financial_bootstrap_rows_v2 (
  ledger_id text not null,
  restore_epoch bigint not null,
  bootstrap_id text not null,
  row_ordinal integer not null check (row_ordinal > 0),
  row_type text not null check (
    row_type in (
      'currency','account','exchange_rate','financial_transaction',
      'posting','transaction_link','entity','workspace_state'
    )
  ),
  row_key text not null,
  row_hash text not null check (row_hash ~ '^[0-9a-f]{64}$'),
  payload_text text not null,
  created_at timestamptz not null default now(),
  primary key (ledger_id, restore_epoch, bootstrap_id, row_ordinal),
  unique (ledger_id, restore_epoch, bootstrap_id, row_type, row_key),
  foreign key (ledger_id, restore_epoch, bootstrap_id)
    references public.financial_bootstrap_sessions_v2(ledger_id, restore_epoch, bootstrap_id)
    on delete cascade
);

create index if not exists financial_bootstrap_sessions_v2_owner_idx
  on public.financial_bootstrap_sessions_v2(owner_user_id, status, created_at);
create index if not exists financial_bootstrap_rows_v2_page_idx
  on public.financial_bootstrap_rows_v2(ledger_id, restore_epoch, bootstrap_id, row_ordinal);

alter table public.financial_bootstrap_sessions_v2 enable row level security;
alter table public.financial_bootstrap_rows_v2 enable row level security;

revoke all on public.financial_bootstrap_sessions_v2 from anon, authenticated;
revoke all on public.financial_bootstrap_rows_v2 from anon, authenticated;

-- Any restore-epoch advance invalidates the prior bootstrap. The next epoch
-- must establish a new full baseline before mutation sync can resume.
create or replace function public.clear_financial_bootstrap_on_epoch_change_v2()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.restore_epoch is distinct from old.restore_epoch then
    new.bootstrap_id := null;
    new.bootstrap_manifest_hash := null;
    new.bootstrapped_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists financial_ledgers_v2_clear_bootstrap_on_epoch_change
  on public.financial_ledgers_v2;
create trigger financial_ledgers_v2_clear_bootstrap_on_epoch_change
before update of restore_epoch on public.financial_ledgers_v2
for each row execute function public.clear_financial_bootstrap_on_epoch_change_v2();

create or replace function public.begin_financial_bootstrap_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_bootstrap_id text,
  p_manifest_hash text,
  p_expected_row_count integer,
  p_device_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_ledger public.financial_ledgers_v2%rowtype;
  v_session public.financial_bootstrap_sessions_v2%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_ledger_id)),0) < 16
     or coalesce(length(trim(p_bootstrap_id)),0) < 16
     or length(p_bootstrap_id) > 160
     or p_restore_epoch <= 0
     or p_expected_row_count < 0
     or p_expected_row_count > 1000000
     or lower(coalesce(p_manifest_hash,'')) !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_id,'')) > 200 then
    raise exception 'financial_bootstrap_request_invalid' using errcode = '22023';
  end if;

  select *
    into v_ledger
    from public.financial_ledgers_v2
   where ledger_id=trim(p_ledger_id)
     and owner_user_id=v_user_id
     and status='active'
   for update;

  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;
  if v_ledger.restore_epoch <> p_restore_epoch then
    raise exception 'restore_epoch_mismatch' using errcode = '40001';
  end if;

  if v_ledger.bootstrapped_at is not null then
    if v_ledger.bootstrap_id = trim(p_bootstrap_id)
       and v_ledger.bootstrap_manifest_hash = lower(p_manifest_hash) then
      return jsonb_build_object(
        'ledgerId',v_ledger.ledger_id,
        'restoreEpoch',v_ledger.restore_epoch,
        'bootstrapId',v_ledger.bootstrap_id,
        'manifestHash',v_ledger.bootstrap_manifest_hash,
        'expectedRowCount',p_expected_row_count,
        'status','finalized',
        'idempotent',true
      );
    end if;
    raise exception 'financial_bootstrap_already_finalized' using errcode = '40001';
  end if;

  if exists (
    select 1 from public.financial_commands_v2
     where ledger_id=v_ledger.ledger_id and restore_epoch=p_restore_epoch
  ) or exists (
    select 1 from public.financial_mutations_v2
     where ledger_id=v_ledger.ledger_id and restore_epoch=p_restore_epoch
  ) or exists (
    select 1 from public.financial_entity_heads_v2
     where ledger_id=v_ledger.ledger_id and restore_epoch=p_restore_epoch
  ) then
    raise exception 'financial_bootstrap_transport_not_empty' using errcode = '40001';
  end if;

  select *
    into v_session
    from public.financial_bootstrap_sessions_v2
   where ledger_id=v_ledger.ledger_id
     and restore_epoch=p_restore_epoch
     and status in ('staging','uploading')
   order by created_at desc
   limit 1
   for update;

  if v_session.bootstrap_id is not null
     and v_session.bootstrap_id <> trim(p_bootstrap_id) then
    raise exception 'financial_bootstrap_session_conflict' using errcode = '40001';
  end if;

  insert into public.financial_bootstrap_sessions_v2(
    ledger_id,restore_epoch,bootstrap_id,owner_user_id,manifest_hash,
    expected_row_count,status,device_id,created_at,updated_at
  ) values (
    v_ledger.ledger_id,p_restore_epoch,trim(p_bootstrap_id),v_user_id,
    lower(p_manifest_hash),p_expected_row_count,'staging',
    coalesce(nullif(p_device_id,''),'unknown-device'),now(),now()
  )
  on conflict (ledger_id,restore_epoch,bootstrap_id) do nothing;

  select *
    into v_session
    from public.financial_bootstrap_sessions_v2
   where ledger_id=v_ledger.ledger_id
     and restore_epoch=p_restore_epoch
     and bootstrap_id=trim(p_bootstrap_id)
   limit 1;

  if v_session.bootstrap_id is null
     or v_session.owner_user_id <> v_user_id
     or v_session.manifest_hash <> lower(p_manifest_hash)
     or v_session.expected_row_count <> p_expected_row_count then
    raise exception 'financial_bootstrap_session_metadata_conflict' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ledgerId',v_session.ledger_id,
    'restoreEpoch',v_session.restore_epoch,
    'bootstrapId',v_session.bootstrap_id,
    'manifestHash',v_session.manifest_hash,
    'expectedRowCount',v_session.expected_row_count,
    'status',v_session.status,
    'idempotent',false
  );
end;
$$;

create or replace function public.upload_financial_bootstrap_rows_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_bootstrap_id text,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.financial_bootstrap_sessions_v2%rowtype;
  v_item jsonb;
  v_existing public.financial_bootstrap_rows_v2%rowtype;
  v_ordinal integer;
  v_row_type text;
  v_row_key text;
  v_row_hash text;
  v_payload_text text;
  v_computed_hash text;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'financial_bootstrap_rows_must_be_array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(coalesce(p_rows,'[]'::jsonb));
  if v_count > 200 then
    raise exception 'financial_bootstrap_chunk_too_large' using errcode = '22023';
  end if;

  select *
    into v_session
    from public.financial_bootstrap_sessions_v2
   where ledger_id=trim(p_ledger_id)
     and restore_epoch=p_restore_epoch
     and bootstrap_id=trim(p_bootstrap_id)
     and owner_user_id=v_user_id
   for update;

  if v_session.bootstrap_id is null then
    raise exception 'financial_bootstrap_session_missing' using errcode = '42501';
  end if;
  if v_session.status='aborted' then
    raise exception 'financial_bootstrap_session_aborted' using errcode = '40001';
  end if;

  for v_item in
    select item.value
      from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) as item(value)
     order by (item.value->>'ordinal')::integer
  loop
    v_ordinal := coalesce((v_item->>'ordinal')::integer,0);
    v_row_type := coalesce(v_item->>'rowType','');
    v_row_key := coalesce(v_item->>'rowKey','');
    v_row_hash := lower(coalesce(v_item->>'rowHash',''));
    v_payload_text := v_item->>'payloadText';

    if v_ordinal <= 0
       or v_ordinal > v_session.expected_row_count
       or v_row_type not in (
         'currency','account','exchange_rate','financial_transaction',
         'posting','transaction_link','entity','workspace_state'
       )
       or v_row_key=''
       or length(v_row_key) > 600
       or v_row_hash !~ '^[0-9a-f]{64}$'
       or v_payload_text is null
       or octet_length(v_payload_text) > 2097152 then
      raise exception 'financial_bootstrap_row_invalid' using errcode = '22023';
    end if;

    -- Validate JSON syntax while preserving the exact transmitted text used by
    -- the cryptographic row hash.
    perform v_payload_text::jsonb;

    v_computed_hash := encode(
      extensions.digest(
        convert_to(v_row_type || E'\n' || v_row_key || E'\n' || v_payload_text,'UTF8'),
        'sha256'
      ),
      'hex'
    );
    if v_computed_hash <> v_row_hash then
      raise exception 'financial_bootstrap_row_hash_mismatch' using errcode = '22023';
    end if;

    v_existing := null;
    select *
      into v_existing
      from public.financial_bootstrap_rows_v2
     where ledger_id=v_session.ledger_id
       and restore_epoch=v_session.restore_epoch
       and bootstrap_id=v_session.bootstrap_id
       and row_ordinal=v_ordinal
     limit 1;

    if v_existing.row_ordinal is not null then
      if v_existing.row_type <> v_row_type
         or v_existing.row_key <> v_row_key
         or v_existing.row_hash <> v_row_hash
         or v_existing.payload_text <> v_payload_text then
        raise exception 'financial_bootstrap_row_conflict' using errcode = '40001';
      end if;
      continue;
    end if;

    insert into public.financial_bootstrap_rows_v2(
      ledger_id,restore_epoch,bootstrap_id,row_ordinal,row_type,row_key,row_hash,payload_text,created_at
    ) values (
      v_session.ledger_id,v_session.restore_epoch,v_session.bootstrap_id,
      v_ordinal,v_row_type,v_row_key,v_row_hash,v_payload_text,now()
    );
  end loop;

  update public.financial_bootstrap_sessions_v2
     set status=case when status='finalized' then status else 'uploading' end,
         updated_at=now()
   where ledger_id=v_session.ledger_id
     and restore_epoch=v_session.restore_epoch
     and bootstrap_id=v_session.bootstrap_id;

  return jsonb_build_object(
    'ledgerId',v_session.ledger_id,
    'restoreEpoch',v_session.restore_epoch,
    'bootstrapId',v_session.bootstrap_id,
    'storedRowCount',(
      select count(*) from public.financial_bootstrap_rows_v2
       where ledger_id=v_session.ledger_id
         and restore_epoch=v_session.restore_epoch
         and bootstrap_id=v_session.bootstrap_id
    )
  );
end;
$$;

create or replace function public.finalize_financial_bootstrap_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_bootstrap_id text,
  p_manifest_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_ledger public.financial_ledgers_v2%rowtype;
  v_session public.financial_bootstrap_sessions_v2%rowtype;
  v_count bigint;
  v_min_ordinal integer;
  v_max_ordinal integer;
  v_manifest text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select *
    into v_ledger
    from public.financial_ledgers_v2
   where ledger_id=trim(p_ledger_id)
     and owner_user_id=v_user_id
     and status='active'
   for update;

  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;
  if v_ledger.restore_epoch <> p_restore_epoch then
    raise exception 'restore_epoch_mismatch' using errcode = '40001';
  end if;

  select *
    into v_session
    from public.financial_bootstrap_sessions_v2
   where ledger_id=v_ledger.ledger_id
     and restore_epoch=p_restore_epoch
     and bootstrap_id=trim(p_bootstrap_id)
     and owner_user_id=v_user_id
   for update;

  if v_session.bootstrap_id is null then
    raise exception 'financial_bootstrap_session_missing' using errcode = '42501';
  end if;
  if v_session.manifest_hash <> lower(coalesce(p_manifest_hash,'')) then
    raise exception 'financial_bootstrap_manifest_request_conflict' using errcode = '40001';
  end if;

  if v_ledger.bootstrapped_at is not null then
    if v_ledger.bootstrap_id=v_session.bootstrap_id
       and v_ledger.bootstrap_manifest_hash=v_session.manifest_hash then
      return jsonb_build_object(
        'ledgerId',v_ledger.ledger_id,
        'restoreEpoch',v_ledger.restore_epoch,
        'bootstrapId',v_ledger.bootstrap_id,
        'manifestHash',v_ledger.bootstrap_manifest_hash,
        'expectedRowCount',v_session.expected_row_count,
        'status','finalized',
        'idempotent',true
      );
    end if;
    raise exception 'financial_bootstrap_already_finalized' using errcode = '40001';
  end if;

  select count(*),min(row_ordinal),max(row_ordinal),
         encode(
           extensions.digest(
             convert_to(coalesce(string_agg(row_hash,E'\n' order by row_ordinal),''),'UTF8'),
             'sha256'
           ),
           'hex'
         )
    into v_count,v_min_ordinal,v_max_ordinal,v_manifest
    from public.financial_bootstrap_rows_v2
   where ledger_id=v_session.ledger_id
     and restore_epoch=v_session.restore_epoch
     and bootstrap_id=v_session.bootstrap_id;

  if v_count <> v_session.expected_row_count
     or (v_session.expected_row_count > 0 and (
       v_min_ordinal <> 1 or v_max_ordinal <> v_session.expected_row_count
     )) then
    raise exception 'financial_bootstrap_row_count_mismatch' using errcode = '40001';
  end if;
  if v_manifest <> v_session.manifest_hash then
    raise exception 'financial_bootstrap_manifest_mismatch' using errcode = '40001';
  end if;

  if exists (
    select 1 from public.financial_commands_v2
     where ledger_id=v_ledger.ledger_id and restore_epoch=p_restore_epoch
  ) or exists (
    select 1 from public.financial_mutations_v2
     where ledger_id=v_ledger.ledger_id and restore_epoch=p_restore_epoch
  ) or exists (
    select 1 from public.financial_entity_heads_v2
     where ledger_id=v_ledger.ledger_id and restore_epoch=p_restore_epoch
  ) then
    raise exception 'financial_bootstrap_transport_not_empty' using errcode = '40001';
  end if;

  update public.financial_ledgers_v2
     set bootstrap_id=v_session.bootstrap_id,
         bootstrap_manifest_hash=v_session.manifest_hash,
         bootstrapped_at=now(),
         updated_at=now()
   where ledger_id=v_ledger.ledger_id
     and owner_user_id=v_user_id
     and restore_epoch=p_restore_epoch
     and bootstrapped_at is null;

  if not found then
    raise exception 'financial_bootstrap_finalize_compare_and_swap_failed' using errcode = '40001';
  end if;

  update public.financial_bootstrap_sessions_v2
     set status='finalized',updated_at=now(),finalized_at=now()
   where ledger_id=v_session.ledger_id
     and restore_epoch=v_session.restore_epoch
     and bootstrap_id=v_session.bootstrap_id;

  return jsonb_build_object(
    'ledgerId',v_session.ledger_id,
    'restoreEpoch',v_session.restore_epoch,
    'bootstrapId',v_session.bootstrap_id,
    'manifestHash',v_session.manifest_hash,
    'expectedRowCount',v_session.expected_row_count,
    'status','finalized',
    'idempotent',false
  );
end;
$$;

create or replace function public.get_financial_bootstrap_rows_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_after_ordinal integer default 0,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ledger public.financial_ledgers_v2%rowtype;
  v_session public.financial_bootstrap_sessions_v2%rowtype;
  v_limit integer := greatest(1,least(coalesce(p_limit,200),200));
  v_rows jsonb := '[]'::jsonb;
  v_next integer := greatest(0,coalesce(p_after_ordinal,0));
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select *
    into v_ledger
    from public.financial_ledgers_v2
   where ledger_id=trim(p_ledger_id)
     and owner_user_id=v_user_id
     and status='active'
   limit 1;

  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;
  if v_ledger.restore_epoch <> p_restore_epoch then
    raise exception 'restore_epoch_mismatch' using errcode = '40001';
  end if;
  if v_ledger.bootstrapped_at is null or v_ledger.bootstrap_id is null then
    raise exception 'financial_bootstrap_required' using errcode = '55000';
  end if;

  select *
    into v_session
    from public.financial_bootstrap_sessions_v2
   where ledger_id=v_ledger.ledger_id
     and restore_epoch=v_ledger.restore_epoch
     and bootstrap_id=v_ledger.bootstrap_id
     and status='finalized'
   limit 1;

  if v_session.bootstrap_id is null then
    raise exception 'financial_bootstrap_finalized_session_missing' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ordinal',r.row_ordinal,
           'rowType',r.row_type,
           'rowKey',r.row_key,
           'rowHash',r.row_hash,
           'payloadText',r.payload_text
         ) order by r.row_ordinal),'[]'::jsonb),
         coalesce(max(r.row_ordinal),v_next)
    into v_rows,v_next
    from (
      select *
        from public.financial_bootstrap_rows_v2
       where ledger_id=v_session.ledger_id
         and restore_epoch=v_session.restore_epoch
         and bootstrap_id=v_session.bootstrap_id
         and row_ordinal>greatest(0,coalesce(p_after_ordinal,0))
       order by row_ordinal
       limit v_limit
    ) r;

  return jsonb_build_object(
    'ledgerId',v_session.ledger_id,
    'restoreEpoch',v_session.restore_epoch,
    'bootstrapId',v_session.bootstrap_id,
    'manifestHash',v_session.manifest_hash,
    'expectedRowCount',v_session.expected_row_count,
    'rows',v_rows,
    'nextOrdinal',v_next,
    'hasMore',exists(
      select 1 from public.financial_bootstrap_rows_v2
       where ledger_id=v_session.ledger_id
         and restore_epoch=v_session.restore_epoch
         and bootstrap_id=v_session.bootstrap_id
         and row_ordinal>v_next
    )
  );
end;
$$;

create or replace function public.abort_financial_bootstrap_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_bootstrap_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.financial_bootstrap_sessions_v2%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select *
    into v_session
    from public.financial_bootstrap_sessions_v2
   where ledger_id=trim(p_ledger_id)
     and restore_epoch=p_restore_epoch
     and bootstrap_id=trim(p_bootstrap_id)
     and owner_user_id=v_user_id
   for update;

  if v_session.bootstrap_id is null then
    return jsonb_build_object('aborted',false,'missing',true);
  end if;
  if v_session.status='finalized' then
    raise exception 'financial_bootstrap_abort_after_finalize' using errcode = '40001';
  end if;

  delete from public.financial_bootstrap_rows_v2
   where ledger_id=v_session.ledger_id
     and restore_epoch=v_session.restore_epoch
     and bootstrap_id=v_session.bootstrap_id;

  update public.financial_bootstrap_sessions_v2
     set status='aborted',updated_at=now()
   where ledger_id=v_session.ledger_id
     and restore_epoch=v_session.restore_epoch
     and bootstrap_id=v_session.bootstrap_id;

  return jsonb_build_object(
    'ledgerId',v_session.ledger_id,
    'restoreEpoch',v_session.restore_epoch,
    'bootstrapId',v_session.bootstrap_id,
    'aborted',true
  );
end;
$$;

revoke all on function public.begin_financial_bootstrap_v2(text,bigint,text,text,integer,text)
  from public, anon;
revoke all on function public.upload_financial_bootstrap_rows_v2(text,bigint,text,jsonb)
  from public, anon;
revoke all on function public.finalize_financial_bootstrap_v2(text,bigint,text,text)
  from public, anon;
revoke all on function public.get_financial_bootstrap_rows_v2(text,bigint,integer,integer)
  from public, anon;
revoke all on function public.abort_financial_bootstrap_v2(text,bigint,text)
  from public, anon;

grant execute on function public.begin_financial_bootstrap_v2(text,bigint,text,text,integer,text)
  to authenticated;
grant execute on function public.upload_financial_bootstrap_rows_v2(text,bigint,text,jsonb)
  to authenticated;
grant execute on function public.finalize_financial_bootstrap_v2(text,bigint,text,text)
  to authenticated;
grant execute on function public.get_financial_bootstrap_rows_v2(text,bigint,integer,integer)
  to authenticated;
grant execute on function public.abort_financial_bootstrap_v2(text,bigint,text)
  to authenticated;
