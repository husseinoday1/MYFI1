-- MYFI P19-012 — verified cloud recovery source for a truly empty local ledger.
-- Read-only recovery discovery. It never writes financial data and never activates V2.

create or replace function public.get_financial_cloud_recovery_source_v2()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_ledger public.financial_ledgers_v2%rowtype;
  v_has_ledger boolean := false;
  v_user public.user_data%rowtype;
  v_has_user_data boolean := false;
  v_snapshot jsonb;
  v_snapshot_text text;
  v_snapshot_hash text;
  v_expected_rows integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select *
    into v_ledger
    from public.financial_ledgers_v2
   where owner_user_id = v_user_id
     and status = 'active'
   limit 1;
  v_has_ledger := found;

  -- A finalized V2 ledger is authoritative. P19-012 deliberately does not
  -- reinterpret it through the compatibility user_data snapshot.
  if v_has_ledger and v_ledger.bootstrapped_at is not null then
    select expected_row_count
      into v_expected_rows
      from public.financial_bootstrap_sessions_v2
     where ledger_id = v_ledger.ledger_id
       and restore_epoch = v_ledger.restore_epoch
       and bootstrap_id = v_ledger.bootstrap_id
       and status = 'finalized'
     limit 1;

    if v_expected_rows is null
       or v_ledger.bootstrap_id is null
       or v_ledger.bootstrap_manifest_hash is null then
      raise exception 'financial_v2_finalized_bootstrap_evidence_missing' using errcode = '55000';
    end if;

    return jsonb_build_object(
      'mode', 'v2_bootstrap',
      'ledgerId', v_ledger.ledger_id,
      'restoreEpoch', v_ledger.restore_epoch,
      'bootstrapId', v_ledger.bootstrap_id,
      'manifestHash', v_ledger.bootstrap_manifest_hash,
      'expectedRowCount', v_expected_rows,
      'bootstrappedAt', v_ledger.bootstrapped_at
    );
  end if;

  select *
    into v_user
    from public.user_data
   where user_id = v_user_id
   limit 1;
  v_has_user_data := found;

  if not v_has_user_data then
    if v_has_ledger then
      return jsonb_build_object(
        'mode', 'v2_unbootstrapped',
        'ledgerId', v_ledger.ledger_id,
        'restoreEpoch', v_ledger.restore_epoch
      );
    end if;
    return jsonb_build_object('mode', 'none');
  end if;

  if jsonb_typeof(coalesce(v_user.trans, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_user.debts, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_user.goals, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_user.wallets, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_user.commitments, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_user.cats, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(v_user.cfg, '{}'::jsonb)) <> 'object' then
    raise exception 'legacy_cloud_snapshot_shape_invalid' using errcode = '22023';
  end if;

  v_snapshot := jsonb_build_object(
    'v', 7,
    'data', jsonb_build_object(
      'trans', coalesce(v_user.trans, '[]'::jsonb),
      'debts', coalesce(v_user.debts, '[]'::jsonb),
      'goals', coalesce(v_user.goals, '[]'::jsonb),
      'wallets', coalesce(v_user.wallets, '[]'::jsonb),
      'commitments', coalesce(v_user.commitments, '[]'::jsonb)
    ),
    'cats', coalesce(v_user.cats, '[]'::jsonb),
    'cfg', coalesce(v_user.cfg, '{}'::jsonb),
    'updatedAt', v_user.updated_at,
    'lastSyncedAt', v_user.updated_at,
    'cloudRevision', coalesce(v_user.revision, 0),
    'dirty', false
  );

  -- Hash the exact text returned to the client. The client recomputes SHA-256
  -- before parsing or restoring the snapshot.
  v_snapshot_text := v_snapshot::text;
  v_snapshot_hash := encode(
    extensions.digest(convert_to(v_snapshot_text, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'mode', 'legacy_snapshot',
    'snapshotText', v_snapshot_text,
    'snapshotHash', v_snapshot_hash,
    'cloudRevision', coalesce(v_user.revision, 0),
    'cloudUpdatedAt', v_user.updated_at,
    'legacyFinancialCount',
      jsonb_array_length(coalesce(v_user.trans, '[]'::jsonb))
      + jsonb_array_length(coalesce(v_user.debts, '[]'::jsonb))
      + jsonb_array_length(coalesce(v_user.goals, '[]'::jsonb))
      + jsonb_array_length(coalesce(v_user.commitments, '[]'::jsonb)),
    'walletCount', jsonb_array_length(coalesce(v_user.wallets, '[]'::jsonb)),
    'reservedLedgerId', case when v_has_ledger then v_ledger.ledger_id else null end,
    'reservedRestoreEpoch', case when v_has_ledger then v_ledger.restore_epoch else null end
  );
end;
$$;

revoke all on function public.get_financial_cloud_recovery_source_v2()
  from public, anon;
grant execute on function public.get_financial_cloud_recovery_source_v2()
  to authenticated;
