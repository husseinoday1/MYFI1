-- MYFI P10-012 — proof-bound restore epoch handshake (additive draft).
-- This migration is intentionally not applied by the P10-012 implementation task.
-- It stores only opaque operation/proof identifiers, never semantic hashes, counts
-- or financial payloads.

alter table public.financial_restore_events_v2
  add column if not exists event_uuid uuid,
  add column if not exists operation_id uuid,
  add column if not exists restore_proof_digest text;

alter table public.financial_restore_events_v2
  drop constraint if exists financial_restore_events_v2_proof_binding_check;
alter table public.financial_restore_events_v2
  add constraint financial_restore_events_v2_proof_binding_check check (
    (event_uuid is null and operation_id is null and restore_proof_digest is null)
    or
    (event_uuid is not null
      and operation_id is not null
      and restore_proof_digest ~ '^[0-9a-f]{64}$')
  ) not valid;
alter table public.financial_restore_events_v2
  validate constraint financial_restore_events_v2_proof_binding_check;

create unique index if not exists financial_restore_events_v2_event_uuid_uq
  on public.financial_restore_events_v2(event_uuid)
  where event_uuid is not null;
create unique index if not exists financial_restore_events_v2_operation_id_uq
  on public.financial_restore_events_v2(operation_id)
  where operation_id is not null;
create index if not exists financial_restore_events_v2_proof_lookup_idx
  on public.financial_restore_events_v2(owner_user_id, ledger_id, to_epoch, operation_id)
  where operation_id is not null;

-- The legacy RPC remains available only for the P19 controlled-recovery diagnostic.
-- Product restore/delete operations must use a proof-bound versioned RPC.
create or replace function public.advance_financial_restore_epoch_v2(
  p_ledger_id text,
  p_expected_epoch bigint,
  p_new_epoch bigint,
  p_reason text,
  p_device_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ledger public.financial_ledgers_v2%rowtype;
  v_event public.financial_restore_events_v2%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_expected_epoch <= 0
     or p_new_epoch <> p_expected_epoch + 1
     or p_reason is distinct from 'controlled_recovery'
     or pg_catalog.length(coalesce(p_device_id, '')) > 200 then
    raise exception 'restore_epoch_request_invalid' using errcode = '22023';
  end if;

  select * into v_ledger
    from public.financial_ledgers_v2
   where ledger_id = pg_catalog.btrim(p_ledger_id)
     and owner_user_id = v_user_id
     and status = 'active'
   for update;

  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;

  if v_ledger.restore_epoch = p_new_epoch then
    select * into v_event
      from public.financial_restore_events_v2
     where ledger_id = v_ledger.ledger_id
       and to_epoch = p_new_epoch
     limit 1;
    if v_event.event_id is null
       or v_event.from_epoch <> p_expected_epoch
       or v_event.reason <> 'controlled_recovery'
       or v_event.device_id <> coalesce(nullif(p_device_id, ''), 'unknown-device')
       or v_event.operation_id is not null
       or v_event.restore_proof_digest is not null then
      raise exception 'restore_epoch_idempotency_conflict' using errcode = '40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'ledgerId', v_ledger.ledger_id,
      'fromEpoch', p_expected_epoch,
      'restoreEpoch', p_new_epoch,
      'advanced', false,
      'idempotent', true,
      'protocolVersion', v_ledger.protocol_version
    );
  end if;

  if v_ledger.restore_epoch <> p_expected_epoch then
    raise exception 'restore_epoch_conflict' using errcode = '40001';
  end if;

  update public.financial_ledgers_v2
     set restore_epoch = p_new_epoch,
         updated_at = pg_catalog.now()
   where ledger_id = v_ledger.ledger_id
     and owner_user_id = v_user_id
     and restore_epoch = p_expected_epoch;
  if not found then
    raise exception 'restore_epoch_compare_and_swap_failed' using errcode = '40001';
  end if;

  insert into public.financial_restore_events_v2 (
    ledger_id, owner_user_id, from_epoch, to_epoch, reason, device_id, created_at
  ) values (
    v_ledger.ledger_id, v_user_id, p_expected_epoch, p_new_epoch,
    'controlled_recovery', coalesce(nullif(p_device_id, ''), 'unknown-device'),
    pg_catalog.now()
  );

  return pg_catalog.jsonb_build_object(
    'ledgerId', v_ledger.ledger_id,
    'fromEpoch', p_expected_epoch,
    'restoreEpoch', p_new_epoch,
    'advanced', true,
    'idempotent', false,
    'protocolVersion', v_ledger.protocol_version
  );
end;
$$;

create or replace function public.advance_financial_restore_epoch_v3(
  p_ledger_id text,
  p_expected_epoch bigint,
  p_new_epoch bigint,
  p_reason text,
  p_device_id text,
  p_operation_id uuid,
  p_restore_proof_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_ledger public.financial_ledgers_v2%rowtype;
  v_event public.financial_restore_events_v2%rowtype;
  v_digest text := pg_catalog.lower(pg_catalog.btrim(p_restore_proof_digest));
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_expected_epoch <= 0
     or p_new_epoch <> p_expected_epoch + 1
     or p_reason is distinct from 'backup_restore'
     or p_operation_id is null
     or p_ledger_id is null
     or pg_catalog.length(pg_catalog.btrim(p_ledger_id)) < 1
     or pg_catalog.length(pg_catalog.btrim(p_ledger_id)) > 120
     or pg_catalog.length(coalesce(p_device_id, '')) < 1
     or pg_catalog.length(p_device_id) > 200
     or v_digest is null
     or v_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'restore_epoch_proof_request_invalid' using errcode = '22023';
  end if;

  select * into v_ledger
    from public.financial_ledgers_v2
   where ledger_id = pg_catalog.btrim(p_ledger_id)
     and owner_user_id = v_user_id
     and status = 'active'
   for update;

  if v_ledger.ledger_id is null then
    raise exception 'ledger_access_denied' using errcode = '42501';
  end if;

  -- A UUID may never be reused for another ledger, epoch, device or proof.
  select * into v_event
    from public.financial_restore_events_v2
   where operation_id = p_operation_id
   limit 1;
  if v_event.event_id is not null then
    if v_event.owner_user_id <> v_user_id
       or v_event.ledger_id <> v_ledger.ledger_id
       or v_event.from_epoch <> p_expected_epoch
       or v_event.to_epoch <> p_new_epoch
       or v_event.reason <> 'backup_restore'
       or v_event.device_id <> p_device_id
       or v_event.restore_proof_digest <> v_digest
       or v_event.event_uuid is null
       or v_ledger.restore_epoch <> p_new_epoch then
      raise exception 'restore_epoch_operation_conflict' using errcode = '40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'outcome', 'already_advanced',
      'eventId', v_event.event_uuid,
      'ownerId', v_event.owner_user_id,
      'ledgerId', v_event.ledger_id,
      'fromEpoch', v_event.from_epoch,
      'toEpoch', v_event.to_epoch,
      'reason', v_event.reason,
      'deviceId', v_event.device_id,
      'operationId', v_event.operation_id,
      'restoreProofDigest', v_event.restore_proof_digest,
      'protocolVersion', v_ledger.protocol_version,
      'provedAt', v_event.created_at
    );
  end if;

  if v_ledger.restore_epoch = p_new_epoch then
    select * into v_event
      from public.financial_restore_events_v2
     where ledger_id = v_ledger.ledger_id
       and to_epoch = p_new_epoch
     limit 1;
    if v_event.event_id is null
       or v_event.owner_user_id <> v_user_id
       or v_event.operation_id <> p_operation_id
       or v_event.restore_proof_digest <> v_digest
       or v_event.from_epoch <> p_expected_epoch
       or v_event.reason <> 'backup_restore'
       or v_event.device_id <> p_device_id
       or v_event.event_uuid is null then
      raise exception 'restore_epoch_idempotency_conflict' using errcode = '40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'outcome', 'already_advanced',
      'eventId', v_event.event_uuid,
      'ownerId', v_event.owner_user_id,
      'ledgerId', v_event.ledger_id,
      'fromEpoch', v_event.from_epoch,
      'toEpoch', v_event.to_epoch,
      'reason', v_event.reason,
      'deviceId', v_event.device_id,
      'operationId', v_event.operation_id,
      'restoreProofDigest', v_event.restore_proof_digest,
      'protocolVersion', v_ledger.protocol_version,
      'provedAt', v_event.created_at
    );
  end if;

  if v_ledger.restore_epoch <> p_expected_epoch then
    raise exception 'restore_epoch_conflict' using errcode = '40001';
  end if;

  update public.financial_ledgers_v2
     set restore_epoch = p_new_epoch,
         updated_at = pg_catalog.now()
   where ledger_id = v_ledger.ledger_id
     and owner_user_id = v_user_id
     and restore_epoch = p_expected_epoch;
  if not found then
    raise exception 'restore_epoch_compare_and_swap_failed' using errcode = '40001';
  end if;

  insert into public.financial_restore_events_v2 (
    event_uuid, ledger_id, owner_user_id, from_epoch, to_epoch, reason,
    device_id, operation_id, restore_proof_digest, created_at
  ) values (
    pg_catalog.gen_random_uuid(), v_ledger.ledger_id, v_user_id,
    p_expected_epoch, p_new_epoch, 'backup_restore', p_device_id,
    p_operation_id, v_digest, pg_catalog.now()
  )
  returning * into v_event;

  return pg_catalog.jsonb_build_object(
    'outcome', 'advanced',
    'eventId', v_event.event_uuid,
    'ownerId', v_event.owner_user_id,
    'ledgerId', v_event.ledger_id,
    'fromEpoch', v_event.from_epoch,
    'toEpoch', v_event.to_epoch,
    'reason', v_event.reason,
    'deviceId', v_event.device_id,
    'operationId', v_event.operation_id,
    'restoreProofDigest', v_event.restore_proof_digest,
    'protocolVersion', v_ledger.protocol_version,
    'provedAt', v_event.created_at
  );
end;
$$;

revoke all on function public.advance_financial_restore_epoch_v2(text,bigint,bigint,text,text)
  from public, anon;
revoke all on function public.advance_financial_restore_epoch_v3(text,bigint,bigint,text,text,uuid,text)
  from public, anon;
grant execute on function public.advance_financial_restore_epoch_v2(text,bigint,bigint,text,text)
  to authenticated;
grant execute on function public.advance_financial_restore_epoch_v3(text,bigint,bigint,text,text,uuid,text)
  to authenticated;
