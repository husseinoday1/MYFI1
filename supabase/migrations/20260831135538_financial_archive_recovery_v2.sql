-- MYFI Phase 12-A — immutable, owner-bound cold-archive snapshots.
--
-- This is deliberately separate from financial_bootstrap_rows_v2: finalized
-- Bootstrap manifests are immutable and older ones contain no archive rows.
-- It never advances a ledger restore epoch and does not mutate any Bootstrap.

create table if not exists public.financial_archive_snapshot_sessions_v2 (
  ledger_id text not null references public.financial_ledgers_v2(ledger_id) on delete cascade,
  restore_epoch bigint not null check (restore_epoch > 0),
  snapshot_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  expected_generation bigint not null check (expected_generation >= 0),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  expected_row_count integer not null check (expected_row_count between 0 and 1000000),
  status text not null default 'staging'
    check (status in ('staging','uploading','finalized','aborted')),
  device_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  primary key (ledger_id, restore_epoch, snapshot_id)
);

create table if not exists public.financial_archive_snapshot_rows_v2 (
  ledger_id text not null,
  restore_epoch bigint not null,
  snapshot_id text not null,
  row_ordinal integer not null check (row_ordinal > 0),
  row_type text not null check (row_type in ('archive_year','archive_transaction')),
  row_key text not null,
  row_hash text not null check (row_hash ~ '^[0-9a-f]{64}$'),
  payload_text text not null,
  created_at timestamptz not null default now(),
  primary key (ledger_id, restore_epoch, snapshot_id, row_ordinal),
  unique (ledger_id, restore_epoch, snapshot_id, row_type, row_key),
  foreign key (ledger_id, restore_epoch, snapshot_id)
    references public.financial_archive_snapshot_sessions_v2(ledger_id, restore_epoch, snapshot_id)
    on delete cascade
);

create table if not exists public.financial_archive_heads_v2 (
  ledger_id text not null references public.financial_ledgers_v2(ledger_id) on delete cascade,
  restore_epoch bigint not null check (restore_epoch > 0),
  archive_generation bigint not null check (archive_generation > 0),
  snapshot_id text not null,
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  expected_row_count integer not null check (expected_row_count between 0 and 1000000),
  finalized_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (ledger_id, restore_epoch),
  foreign key (ledger_id, restore_epoch, snapshot_id)
    references public.financial_archive_snapshot_sessions_v2(ledger_id, restore_epoch, snapshot_id)
    on delete restrict
);

create index if not exists financial_archive_snapshot_sessions_v2_owner_idx
  on public.financial_archive_snapshot_sessions_v2(owner_user_id, status, created_at);
create index if not exists financial_archive_snapshot_rows_v2_page_idx
  on public.financial_archive_snapshot_rows_v2(ledger_id, restore_epoch, snapshot_id, row_ordinal);

alter table public.financial_archive_snapshot_sessions_v2 enable row level security;
alter table public.financial_archive_snapshot_rows_v2 enable row level security;
alter table public.financial_archive_heads_v2 enable row level security;

revoke all on public.financial_archive_snapshot_sessions_v2 from anon, authenticated;
revoke all on public.financial_archive_snapshot_rows_v2 from anon, authenticated;
revoke all on public.financial_archive_heads_v2 from anon, authenticated;

create or replace function public.begin_financial_archive_snapshot_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_snapshot_id text,
  p_expected_generation bigint,
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
  v_head public.financial_archive_heads_v2%rowtype;
  v_session public.financial_archive_snapshot_sessions_v2%rowtype;
  v_current_generation bigint := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_ledger_id)), 0) < 16
     or coalesce(length(trim(p_snapshot_id)), 0) < 16
     or length(trim(p_snapshot_id)) > 160
     or p_restore_epoch <= 0
     or p_expected_generation < 0
     or p_expected_row_count < 0
     or p_expected_row_count > 1000000
     or lower(coalesce(p_manifest_hash, '')) !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_device_id, '')) > 200 then
    raise exception 'financial_archive_snapshot_request_invalid' using errcode = '22023';
  end if;

  -- There is no head before the first archive publication. The advisory lock
  -- serializes that first publication as well as normal generation updates.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(trim(p_ledger_id) || ':' || p_restore_epoch::text, 0)
  );

  select * into v_ledger
    from public.financial_ledgers_v2
   where ledger_id = trim(p_ledger_id)
     and owner_user_id = v_user_id
     and status = 'active'
   for update;
  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;
  if v_ledger.restore_epoch <> p_restore_epoch then
    raise exception 'restore_epoch_mismatch' using errcode = '40001';
  end if;

  select * into v_head
    from public.financial_archive_heads_v2
   where ledger_id = v_ledger.ledger_id and restore_epoch = p_restore_epoch
   for update;
  v_current_generation := coalesce(v_head.archive_generation, 0);
  if v_current_generation <> p_expected_generation then
    raise exception 'financial_archive_generation_conflict' using errcode = '40001';
  end if;

  select * into v_session
    from public.financial_archive_snapshot_sessions_v2
   where ledger_id = v_ledger.ledger_id
     and restore_epoch = p_restore_epoch
     and snapshot_id = trim(p_snapshot_id)
   for update;
  if v_session.snapshot_id is not null then
    if v_session.owner_user_id <> v_user_id
       or v_session.expected_generation <> p_expected_generation
       or v_session.manifest_hash <> lower(p_manifest_hash)
       or v_session.expected_row_count <> p_expected_row_count then
      raise exception 'financial_archive_snapshot_metadata_conflict' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'ledgerId', v_session.ledger_id,
      'restoreEpoch', v_session.restore_epoch,
      'snapshotId', v_session.snapshot_id,
      'expectedGeneration', v_session.expected_generation,
      'manifestHash', v_session.manifest_hash,
      'expectedRowCount', v_session.expected_row_count,
      'status', v_session.status,
      'idempotent', true
    );
  end if;

  if exists (
    select 1
      from public.financial_archive_snapshot_sessions_v2
     where ledger_id = v_ledger.ledger_id
       and restore_epoch = p_restore_epoch
       and status in ('staging', 'uploading')
  ) then
    raise exception 'financial_archive_snapshot_session_conflict' using errcode = '40001';
  end if;

  insert into public.financial_archive_snapshot_sessions_v2(
    ledger_id, restore_epoch, snapshot_id, owner_user_id, expected_generation,
    manifest_hash, expected_row_count, status, device_id, created_at, updated_at
  ) values (
    v_ledger.ledger_id, p_restore_epoch, trim(p_snapshot_id), v_user_id, p_expected_generation,
    lower(p_manifest_hash), p_expected_row_count, 'staging',
    coalesce(nullif(p_device_id, ''), 'unknown-device'), now(), now()
  );

  return jsonb_build_object(
    'ledgerId', v_ledger.ledger_id,
    'restoreEpoch', p_restore_epoch,
    'snapshotId', trim(p_snapshot_id),
    'expectedGeneration', p_expected_generation,
    'manifestHash', lower(p_manifest_hash),
    'expectedRowCount', p_expected_row_count,
    'status', 'staging',
    'idempotent', false
  );
end;
$$;

create or replace function public.upload_financial_archive_snapshot_rows_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_snapshot_id text,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.financial_archive_snapshot_sessions_v2%rowtype;
  v_item jsonb;
  v_existing public.financial_archive_snapshot_rows_v2%rowtype;
  v_ordinal integer;
  v_row_type text;
  v_row_key text;
  v_row_hash text;
  v_payload_text text;
  v_computed_hash text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 200 then
    raise exception 'financial_archive_snapshot_rows_invalid' using errcode = '22023';
  end if;

  select * into v_session
    from public.financial_archive_snapshot_sessions_v2
   where ledger_id = trim(p_ledger_id)
     and restore_epoch = p_restore_epoch
     and snapshot_id = trim(p_snapshot_id)
     and owner_user_id = v_user_id
   for update;
  if v_session.snapshot_id is null then
    raise exception 'financial_archive_snapshot_session_missing' using errcode = '42501';
  end if;
  if v_session.status in ('finalized', 'aborted') then
    raise exception 'financial_archive_snapshot_not_writable' using errcode = '40001';
  end if;

  for v_item in
    select item.value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as item(value)
    order by (item.value->>'ordinal')::integer
  loop
    v_ordinal := coalesce((v_item->>'ordinal')::integer, 0);
    v_row_type := coalesce(v_item->>'rowType', '');
    v_row_key := coalesce(v_item->>'rowKey', '');
    v_row_hash := lower(coalesce(v_item->>'rowHash', ''));
    v_payload_text := v_item->>'payloadText';
    if v_ordinal <= 0
       or v_ordinal > v_session.expected_row_count
       or v_row_type not in ('archive_year', 'archive_transaction')
       or v_row_key = ''
       or length(v_row_key) > 600
       or v_row_hash !~ '^[0-9a-f]{64}$'
       or v_payload_text is null
       or octet_length(v_payload_text) > 2097152 then
      raise exception 'financial_archive_snapshot_row_invalid' using errcode = '22023';
    end if;
    perform v_payload_text::jsonb;
    v_computed_hash := encode(
      extensions.digest(convert_to(v_row_type || E'\n' || v_row_key || E'\n' || v_payload_text, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_computed_hash <> v_row_hash then
      raise exception 'financial_archive_snapshot_row_hash_mismatch' using errcode = '22023';
    end if;

    select * into v_existing
      from public.financial_archive_snapshot_rows_v2
     where ledger_id = v_session.ledger_id
       and restore_epoch = v_session.restore_epoch
       and snapshot_id = v_session.snapshot_id
       and row_ordinal = v_ordinal;
    if v_existing.row_ordinal is not null then
      if v_existing.row_type <> v_row_type
         or v_existing.row_key <> v_row_key
         or v_existing.row_hash <> v_row_hash
         or v_existing.payload_text <> v_payload_text then
        raise exception 'financial_archive_snapshot_row_conflict' using errcode = '40001';
      end if;
      continue;
    end if;

    insert into public.financial_archive_snapshot_rows_v2(
      ledger_id, restore_epoch, snapshot_id, row_ordinal, row_type, row_key, row_hash, payload_text, created_at
    ) values (
      v_session.ledger_id, v_session.restore_epoch, v_session.snapshot_id,
      v_ordinal, v_row_type, v_row_key, v_row_hash, v_payload_text, now()
    );
  end loop;

  update public.financial_archive_snapshot_sessions_v2
     set status = 'uploading', updated_at = now()
   where ledger_id = v_session.ledger_id
     and restore_epoch = v_session.restore_epoch
     and snapshot_id = v_session.snapshot_id
     and status in ('staging', 'uploading');

  return jsonb_build_object(
    'ledgerId', v_session.ledger_id,
    'restoreEpoch', v_session.restore_epoch,
    'snapshotId', v_session.snapshot_id,
    'storedRowCount', (
      select count(*) from public.financial_archive_snapshot_rows_v2
       where ledger_id = v_session.ledger_id
         and restore_epoch = v_session.restore_epoch
         and snapshot_id = v_session.snapshot_id
    )
  );
end;
$$;

create or replace function public.finalize_financial_archive_snapshot_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_snapshot_id text,
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
  v_session public.financial_archive_snapshot_sessions_v2%rowtype;
  v_head public.financial_archive_heads_v2%rowtype;
  v_count integer;
  v_min_ordinal integer;
  v_max_ordinal integer;
  v_manifest text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if lower(coalesce(p_manifest_hash, '')) !~ '^[0-9a-f]{64}$' then
    raise exception 'financial_archive_snapshot_manifest_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(trim(p_ledger_id) || ':' || p_restore_epoch::text, 0)
  );

  select * into v_ledger
    from public.financial_ledgers_v2
   where ledger_id = trim(p_ledger_id)
     and owner_user_id = v_user_id
     and status = 'active'
   for update;
  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;
  if v_ledger.restore_epoch <> p_restore_epoch then
    raise exception 'restore_epoch_mismatch' using errcode = '40001';
  end if;

  select * into v_session
    from public.financial_archive_snapshot_sessions_v2
   where ledger_id = v_ledger.ledger_id
     and restore_epoch = p_restore_epoch
     and snapshot_id = trim(p_snapshot_id)
     and owner_user_id = v_user_id
   for update;
  if v_session.snapshot_id is null then
    raise exception 'financial_archive_snapshot_session_missing' using errcode = '42501';
  end if;
  if v_session.status = 'finalized' then
    if v_session.manifest_hash <> lower(p_manifest_hash) then
      raise exception 'financial_archive_snapshot_finalized_conflict' using errcode = '40001';
    end if;
    return jsonb_build_object(
      'ledgerId', v_session.ledger_id,
      'restoreEpoch', v_session.restore_epoch,
      'snapshotId', v_session.snapshot_id,
      'archiveGeneration', v_session.expected_generation + 1,
      'manifestHash', v_session.manifest_hash,
      'expectedRowCount', v_session.expected_row_count,
      'status', 'finalized',
      'idempotent', true
    );
  end if;
  if v_session.status = 'aborted' then
    raise exception 'financial_archive_snapshot_aborted' using errcode = '40001';
  end if;
  if v_session.manifest_hash <> lower(p_manifest_hash) then
    raise exception 'financial_archive_snapshot_manifest_conflict' using errcode = '40001';
  end if;

  select count(*), min(row_ordinal), max(row_ordinal),
         encode(extensions.digest(coalesce(string_agg(row_hash, E'\n' order by row_ordinal), ''), 'sha256'), 'hex')
    into v_count, v_min_ordinal, v_max_ordinal, v_manifest
    from public.financial_archive_snapshot_rows_v2
   where ledger_id = v_session.ledger_id
     and restore_epoch = v_session.restore_epoch
     and snapshot_id = v_session.snapshot_id;
  if v_count <> v_session.expected_row_count
     or (v_count > 0 and (v_min_ordinal <> 1 or v_max_ordinal <> v_count))
     or (v_count = 0 and (v_min_ordinal is not null or v_max_ordinal is not null))
     or v_manifest <> v_session.manifest_hash then
    raise exception 'financial_archive_snapshot_finalization_proof_failed' using errcode = '40001';
  end if;

  select * into v_head
    from public.financial_archive_heads_v2
   where ledger_id = v_ledger.ledger_id and restore_epoch = p_restore_epoch
   for update;
  if coalesce(v_head.archive_generation, 0) <> v_session.expected_generation then
    raise exception 'financial_archive_generation_conflict' using errcode = '40001';
  end if;

  update public.financial_archive_snapshot_sessions_v2
     set status = 'finalized', finalized_at = now(), updated_at = now()
   where ledger_id = v_session.ledger_id
     and restore_epoch = v_session.restore_epoch
     and snapshot_id = v_session.snapshot_id;

  insert into public.financial_archive_heads_v2(
    ledger_id, restore_epoch, archive_generation, snapshot_id,
    manifest_hash, expected_row_count, finalized_at, updated_at
  ) values (
    v_session.ledger_id, v_session.restore_epoch, v_session.expected_generation + 1,
    v_session.snapshot_id, v_session.manifest_hash, v_session.expected_row_count, now(), now()
  )
  on conflict (ledger_id, restore_epoch) do update set
    archive_generation = excluded.archive_generation,
    snapshot_id = excluded.snapshot_id,
    manifest_hash = excluded.manifest_hash,
    expected_row_count = excluded.expected_row_count,
    finalized_at = excluded.finalized_at,
    updated_at = excluded.updated_at
  where public.financial_archive_heads_v2.archive_generation = v_session.expected_generation;
  if not found then
    raise exception 'financial_archive_generation_compare_and_swap_failed' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'ledgerId', v_session.ledger_id,
    'restoreEpoch', v_session.restore_epoch,
    'snapshotId', v_session.snapshot_id,
    'archiveGeneration', v_session.expected_generation + 1,
    'manifestHash', v_session.manifest_hash,
    'expectedRowCount', v_session.expected_row_count,
    'status', 'finalized',
    'idempotent', false
  );
end;
$$;

create or replace function public.get_financial_archive_head_v2(
  p_ledger_id text,
  p_restore_epoch bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_ledger public.financial_ledgers_v2%rowtype;
  v_head public.financial_archive_heads_v2%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into v_ledger
    from public.financial_ledgers_v2
   where ledger_id = trim(p_ledger_id)
     and owner_user_id = v_user_id
     and status = 'active';
  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;
  if v_ledger.restore_epoch <> p_restore_epoch then
    raise exception 'restore_epoch_mismatch' using errcode = '40001';
  end if;
  select * into v_head
    from public.financial_archive_heads_v2
   where ledger_id = v_ledger.ledger_id and restore_epoch = p_restore_epoch;
  if v_head.ledger_id is null then
    return jsonb_build_object(
      'ledgerId', v_ledger.ledger_id,
      'restoreEpoch', p_restore_epoch,
      'archivePresent', false
    );
  end if;
  return jsonb_build_object(
    'ledgerId', v_head.ledger_id,
    'restoreEpoch', v_head.restore_epoch,
    'archivePresent', true,
    'archiveGeneration', v_head.archive_generation,
    'snapshotId', v_head.snapshot_id,
    'manifestHash', v_head.manifest_hash,
    'expectedRowCount', v_head.expected_row_count,
    'finalizedAt', v_head.finalized_at
  );
end;
$$;

create or replace function public.get_financial_archive_snapshot_rows_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_snapshot_id text,
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
  v_head public.financial_archive_heads_v2%rowtype;
  v_rows jsonb;
  v_next integer;
  v_limit integer := greatest(1, least(200, coalesce(p_limit, 200)));
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_after_ordinal < 0 then
    raise exception 'financial_archive_snapshot_cursor_invalid' using errcode = '22023';
  end if;
  select * into v_ledger
    from public.financial_ledgers_v2
   where ledger_id = trim(p_ledger_id)
     and owner_user_id = v_user_id
     and status = 'active';
  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;
  if v_ledger.restore_epoch <> p_restore_epoch then
    raise exception 'restore_epoch_mismatch' using errcode = '40001';
  end if;
  select * into v_head
    from public.financial_archive_heads_v2
   where ledger_id = v_ledger.ledger_id and restore_epoch = p_restore_epoch;
  if v_head.snapshot_id is null or v_head.snapshot_id <> trim(p_snapshot_id) then
    raise exception 'financial_archive_snapshot_not_current' using errcode = '40001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ordinal', row_ordinal,
    'rowType', row_type,
    'rowKey', row_key,
    'rowHash', row_hash,
    'payloadText', payload_text
  ) order by row_ordinal), '[]'::jsonb), coalesce(max(row_ordinal), p_after_ordinal)
    into v_rows, v_next
    from (
      select * from public.financial_archive_snapshot_rows_v2
       where ledger_id = v_head.ledger_id
         and restore_epoch = v_head.restore_epoch
         and snapshot_id = v_head.snapshot_id
         and row_ordinal > p_after_ordinal
       order by row_ordinal
       limit v_limit
    ) page;

  return jsonb_build_object(
    'ledgerId', v_head.ledger_id,
    'restoreEpoch', v_head.restore_epoch,
    'archiveGeneration', v_head.archive_generation,
    'snapshotId', v_head.snapshot_id,
    'manifestHash', v_head.manifest_hash,
    'expectedRowCount', v_head.expected_row_count,
    'rows', v_rows,
    'nextOrdinal', v_next,
    'hasMore', exists(
      select 1 from public.financial_archive_snapshot_rows_v2
       where ledger_id = v_head.ledger_id
         and restore_epoch = v_head.restore_epoch
         and snapshot_id = v_head.snapshot_id
         and row_ordinal > v_next
    )
  );
end;
$$;

create or replace function public.abort_financial_archive_snapshot_v2(
  p_ledger_id text,
  p_restore_epoch bigint,
  p_snapshot_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.financial_archive_snapshot_sessions_v2%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into v_session
    from public.financial_archive_snapshot_sessions_v2
   where ledger_id = trim(p_ledger_id)
     and restore_epoch = p_restore_epoch
     and snapshot_id = trim(p_snapshot_id)
     and owner_user_id = v_user_id
   for update;
  if v_session.snapshot_id is null then
    return jsonb_build_object('aborted', false, 'missing', true);
  end if;
  if v_session.status = 'finalized' then
    raise exception 'financial_archive_snapshot_abort_after_finalize' using errcode = '40001';
  end if;
  delete from public.financial_archive_snapshot_rows_v2
   where ledger_id = v_session.ledger_id
     and restore_epoch = v_session.restore_epoch
     and snapshot_id = v_session.snapshot_id;
  update public.financial_archive_snapshot_sessions_v2
     set status = 'aborted', updated_at = now()
   where ledger_id = v_session.ledger_id
     and restore_epoch = v_session.restore_epoch
     and snapshot_id = v_session.snapshot_id;
  return jsonb_build_object(
    'ledgerId', v_session.ledger_id,
    'restoreEpoch', v_session.restore_epoch,
    'snapshotId', v_session.snapshot_id,
    'aborted', true
  );
end;
$$;

revoke all on function public.begin_financial_archive_snapshot_v2(text,bigint,text,bigint,text,integer,text)
  from public, anon;
revoke all on function public.upload_financial_archive_snapshot_rows_v2(text,bigint,text,jsonb)
  from public, anon;
revoke all on function public.finalize_financial_archive_snapshot_v2(text,bigint,text,text)
  from public, anon;
revoke all on function public.get_financial_archive_head_v2(text,bigint)
  from public, anon;
revoke all on function public.get_financial_archive_snapshot_rows_v2(text,bigint,text,integer,integer)
  from public, anon;
revoke all on function public.abort_financial_archive_snapshot_v2(text,bigint,text)
  from public, anon;

grant execute on function public.begin_financial_archive_snapshot_v2(text,bigint,text,bigint,text,integer,text)
  to authenticated;
grant execute on function public.upload_financial_archive_snapshot_rows_v2(text,bigint,text,jsonb)
  to authenticated;
grant execute on function public.finalize_financial_archive_snapshot_v2(text,bigint,text,text)
  to authenticated;
grant execute on function public.get_financial_archive_head_v2(text,bigint)
  to authenticated;
grant execute on function public.get_financial_archive_snapshot_rows_v2(text,bigint,text,integer,integer)
  to authenticated;
grant execute on function public.abort_financial_archive_snapshot_v2(text,bigint,text)
  to authenticated;
