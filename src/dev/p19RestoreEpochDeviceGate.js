// P20-G01 — Phase 9 disposable restore-epoch real-device acceptance gate.
// Acceptance-only code: it is inert unless EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE=1.
// It NEVER deletes financial data. It verifies that the existing destructive-operation
// interlocks fail closed, then exercises the V2 restore-epoch CAS handshake on a
// financially empty/disposable account only.

import { activeLedgerSupported, getLedgerNamespace } from '../lib/activeLedgerRepository';
import { buildFinancialBackup } from '../lib/backupData';
import {
  abortLedgerRestoreEpochV8,
  beginLedgerRestoreEpochV8,
  commitLedgerRestoreEpochV8,
  ensureLedgerSyncIdentityV8,
  readFinancialSyncProtocolV8,
  readFinancialWorkspaceV7,
  readLedgerRestoreIntentV8,
  readPendingLedgerMutationsV8,
} from '../lib/financialLedgerV7Repository';
import { resolveCloudLedgerV2, syncFinancialMutationsV2 } from '../lib/financialMutationSyncV2';
import { exportColdArchives, getColdArchiveNamespace } from '../lib/localArchiveRepository';
import { getOrCreateDeviceId } from '../lib/secureVault';
import { supabase } from '../lib/supabase';

export const P19_RESTORE_EPOCH_DEVICE_GATE_ENABLED = (
  process.env.EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE === '1'
);

const errorText = error => String(error?.message || error?.code || error || 'unknown_error');

const rows = value => (Array.isArray(value) ? value : []);
const objectSize = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0
);

const walletOpeningValue = wallet => {
  const candidates = [
    wallet?.openingBalance,
    wallet?.openingBaseBalance,
    wallet?.openingBalanceMinor,
    wallet?.openingBaseBalanceMinor,
  ];
  return candidates.reduce((max, value) => {
    const number = Math.abs(Number(value || 0));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
};

const stateFingerprint = (state, coldArchives = []) => JSON.stringify({
  workspaceNamespace: state?.workspaceNamespace || null,
  trans: rows(state?.trans).map(item => String(item?.id || '')).sort(),
  debts: rows(state?.debts).map(item => String(item?.id || '')).sort(),
  goals: rows(state?.goals).map(item => String(item?.id || '')).sort(),
  commitments: rows(state?.commitments).map(item => String(item?.id || '')).sort(),
  wallets: rows(state?.wallets).map(item => ({
    id: String(item?.id || ''),
    currency: String(item?.currency || ''),
    opening: walletOpeningValue(item),
  })).sort((a, b) => a.id.localeCompare(b.id)),
  archiveTx: rows(coldArchives)
    .flatMap(item => rows(item?.data?.trans))
    .map(item => String(item?.id || ''))
    .sort(),
  currency: String(state?.cfg?.currency || ''),
  defaultWalletId: String(state?.cfg?.defaultWalletId || ''),
  categoryBudgets: objectSize(state?.cfg?.categoryBudgets),
  categoryBudgetsByMonth: objectSize(state?.cfg?.categoryBudgetsByMonth),
});

const normalizeRpcObject = value => {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === 'object' ? value : null;
};

const disposableBlockers = ({ state, coldArchives, localWorkspace }) => {
  const blockers = [];
  if (!state?.user?.id) blockers.push('signed_in_account_required');
  if (!state?.workspaceReady) blockers.push('workspace_not_ready');
  if (!state?.financialLedgerV7Cutover) blockers.push('financial_v7_cutover_required');
  if (state?.cfg?.demoMode) blockers.push('demo_mode_not_allowed');
  if (rows(state?.trans).length) blockers.push(`transactions_present:${rows(state.trans).length}`);
  if (rows(state?.debts).length) blockers.push(`debts_present:${rows(state.debts).length}`);
  if (rows(state?.goals).length) blockers.push(`goals_present:${rows(state.goals).length}`);
  if (rows(state?.commitments).length) blockers.push(`commitments_present:${rows(state.commitments).length}`);
  if (rows(state?.wallets).length > 1) blockers.push(`multiple_wallets_present:${rows(state.wallets).length}`);
  if (rows(state?.wallets).some(wallet => walletOpeningValue(wallet) !== 0)) {
    blockers.push('nonzero_wallet_opening_balance');
  }
  const archivedTransactions = rows(coldArchives).reduce(
    (sum, item) => sum + rows(item?.data?.trans).length,
    0,
  );
  if (archivedTransactions) blockers.push(`archived_transactions_present:${archivedTransactions}`);
  if (objectSize(state?.cfg?.categoryBudgets)) blockers.push('current_budgets_present');
  if (objectSize(state?.cfg?.categoryBudgetsByMonth)) blockers.push('historical_budgets_present');

  const localTrans = rows(localWorkspace?.trans).length;
  const localDebts = rows(localWorkspace?.debts).length;
  const localGoals = rows(localWorkspace?.goals).length;
  const localCommitments = rows(localWorkspace?.commitments).length;
  if (localTrans) blockers.push(`sqlite_transactions_present:${localTrans}`);
  if (localDebts) blockers.push(`sqlite_debts_present:${localDebts}`);
  if (localGoals) blockers.push(`sqlite_goals_present:${localGoals}`);
  if (localCommitments) blockers.push(`sqlite_commitments_present:${localCommitments}`);
  return blockers;
};

// P20-G01-D1 — read-only diagnostics attached to a BLOCKED result only.
// Rationale: the 2026-08-19 device run returned reason
// 'disposable_financially_empty_account_required' with the single blocker
// 'financial_v7_cutover_required' on BOTH the real and the disposable account,
// which is not enough to tell "flag is false" from "flag was never set" from
// "SQLite workspace unreadable". This collects observed state only; it reads
// nothing new and mutates nothing.
const blockedDiagnostics = ({ state, localWorkspace, coldArchives }) => {
  const migration = state?.financialLedgerV7Migration || null;
  const count = value => (Array.isArray(value) ? value.length : null);
  return {
    activeLedgerSupported: activeLedgerSupported(),
    // Distinguishes "false" from "key absent on the store root".
    cutoverKeyPresent: Object.prototype.hasOwnProperty.call(state || {}, 'financialLedgerV7Cutover'),
    financialLedgerV7Cutover: state?.financialLedgerV7Cutover ?? null,
    financialLedgerV7Ready: state?.financialLedgerV7Ready ?? null,
    ledgerReady: state?.ledgerReady ?? null,
    ledgerError: state?.ledgerError || null,
    workspaceReady: state?.workspaceReady ?? null,
    demoMode: state?.cfg?.demoMode ?? null,
    migration: migration ? {
      supported: migration.supported ?? null,
      ok: migration.ok ?? null,
      cutover: migration.cutover ?? null,
      sourceMode: migration.sourceMode ?? null,
      migrationReady: migration.migrationReady ?? null,
      reason: migration.reason || null,
    } : null,
    storeCounts: {
      trans: count(state?.trans),
      debts: count(state?.debts),
      goals: count(state?.goals),
      commitments: count(state?.commitments),
      wallets: count(state?.wallets),
    },
    // null localWorkspace means the V7 read itself yielded nothing —
    // materially different from an empty-but-present workspace.
    sqliteWorkspacePresent: !!localWorkspace,
    sqliteCounts: {
      trans: count(localWorkspace?.trans),
      debts: count(localWorkspace?.debts),
      goals: count(localWorkspace?.goals),
      commitments: count(localWorkspace?.commitments),
      wallets: count(localWorkspace?.wallets),
    },
    coldArchiveBundles: count(coldArchives),
  };
};

export async function runP19RestoreEpochDeviceGate({ getState } = {}) {
  const startedAt = new Date().toISOString();
  const base = {
    patchId: 'P20-G01',
    gate: 'PHASE9_RESTORE_EPOCH_DEVICE_ACCEPTANCE',
    startedAt,
    acceptanceOnly: true,
    financialDataChangedByGate: false,
    sqliteSchemaChanged: false,
    secureStoreChanged: false,
    supabaseSchemaChanged: false,
  };

  if (!P19_RESTORE_EPOCH_DEVICE_GATE_ENABLED) {
    return { ...base, ok: false, blocked: true, reason: 'acceptance_build_flag_required' };
  }
  if (typeof getState !== 'function') {
    return { ...base, ok: false, blocked: true, reason: 'store_get_state_required' };
  }

  const initial = getState();
  const workspaceNamespace = String(initial?.workspaceNamespace || '').trim();
  if (!workspaceNamespace) {
    return { ...base, ok: false, blocked: true, reason: 'workspace_namespace_missing' };
  }
  const ledgerNamespace = getLedgerNamespace(workspaceNamespace, initial.cfg);
  const archiveNamespace = getColdArchiveNamespace(workspaceNamespace, initial.cfg);
  const coldArchives = await exportColdArchives(archiveNamespace);
  const localWorkspace = await readFinancialWorkspaceV7({ namespace: ledgerNamespace });

  const blockers = disposableBlockers({ state: initial, coldArchives, localWorkspace });
  if (blockers.length) {
    const evidence = {
      ...base,
      ok: false,
      blocked: true,
      reason: 'disposable_financially_empty_account_required',
      blockers,
      workspaceNamespace,
      ledgerNamespace,
      diagnostics: blockedDiagnostics({ state: initial, localWorkspace, coldArchives }),
    };
    console.warn('[P20_G01_RESTORE_EPOCH_GATE_BLOCKED]', JSON.stringify(evidence));
    return evidence;
  }

  const identity = await ensureLedgerSyncIdentityV8({ namespace: ledgerNamespace });
  const protocol = await readFinancialSyncProtocolV8({ namespace: ledgerNamespace });
  if (!identity?.ledgerId
      || protocol?.activeProtocolVersion !== 2
      || !protocol?.activatedAt
      || String(protocol?.ledgerId || '') !== String(identity.ledgerId)
      || Number(protocol?.restoreEpoch || 0) !== Number(identity.restoreEpoch || 0)) {
    return {
      ...base, ok: false, blocked: true, reason: 'active_protocol_v2_required',
      identity, protocol, workspaceNamespace, ledgerNamespace,
    };
  }

  const existingIntent = await readLedgerRestoreIntentV8({ namespace: ledgerNamespace });
  if (existingIntent) {
    return {
      ...base, ok: false, blocked: true, reason: 'existing_restore_intent_requires_recovery',
      existingIntent, workspaceNamespace, ledgerNamespace,
    };
  }

  const pending = await readPendingLedgerMutationsV8({
    namespace: ledgerNamespace,
    ledgerId: identity.ledgerId,
    restoreEpoch: identity.restoreEpoch,
    limit: 2,
  });
  if (pending.length) {
    return {
      ...base, ok: false, blocked: true, reason: 'pending_v2_mutations_must_sync_first',
      pendingCount: pending.length, workspaceNamespace, ledgerNamespace,
    };
  }

  const cloud = await resolveCloudLedgerV2({ supabase, identity });
  if (String(cloud?.ledgerId || '') !== String(identity.ledgerId)
      || Number(cloud?.restoreEpoch || 0) !== Number(identity.restoreEpoch || 0)
      || Number(cloud?.protocolVersion || 0) !== 2
      || !cloud?.bootstrappedAt) {
    return {
      ...base, ok: false, blocked: true, reason: 'cloud_v2_identity_not_ready',
      identity, cloud, workspaceNamespace, ledgerNamespace,
    };
  }

  // First prove BOTH destructive production paths are still fail-closed before
  // touching the restore epoch. These calls are expected to return false before
  // any financial state is changed.
  const beforeFingerprint = stateFingerprint(initial, coldArchives);

  if (typeof initial.resetAll !== 'function' || typeof initial.importBackup !== 'function') {
    return { ...base, ok: false, blocked: true, reason: 'destructive_interlock_api_missing' };
  }

  const resetResult = await initial.resetAll();
  if (resetResult !== false) {
    throw new Error('phase9_delete_local_interlock_not_fail_closed');
  }
  const afterReset = getState();
  if (stateFingerprint(afterReset, coldArchives) !== beforeFingerprint) {
    throw new Error('phase9_delete_local_interlock_changed_financial_state');
  }

  const backup = buildFinancialBackup({
    trans: afterReset.trans,
    debts: afterReset.debts,
    goals: afterReset.goals,
    wallets: afterReset.wallets,
    commitments: afterReset.commitments,
    cats: afterReset.cats,
    coldArchives,
    cfg: afterReset.cfg,
  });
  const restoreResult = await afterReset.importBackup(JSON.stringify(backup));
  if (restoreResult !== false) {
    throw new Error('phase9_backup_restore_interlock_not_fail_closed');
  }
  const afterRestoreInterlock = getState();
  if (stateFingerprint(afterRestoreInterlock, coldArchives) !== beforeFingerprint) {
    throw new Error('phase9_backup_restore_interlock_changed_financial_state');
  }

  const identityAfterInterlocks = await ensureLedgerSyncIdentityV8({ namespace: ledgerNamespace });
  if (String(identityAfterInterlocks?.ledgerId || '') !== String(identity.ledgerId)
      || Number(identityAfterInterlocks?.restoreEpoch || 0) !== Number(identity.restoreEpoch || 0)) {
    throw new Error('phase9_interlock_changed_ledger_identity');
  }

  const deviceId = await getOrCreateDeviceId();
  const fromEpoch = Number(identity.restoreEpoch);
  const toEpoch = fromEpoch + 1;
  const intent = await beginLedgerRestoreEpochV8({
    namespace: ledgerNamespace,
    operation: 'controlled_recovery',
  });
  if (!intent
      || String(intent.ledgerId || '') !== String(identity.ledgerId)
      || Number(intent.fromEpoch || 0) !== fromEpoch
      || Number(intent.toEpoch || 0) !== toEpoch) {
    throw new Error('phase9_local_restore_intent_invalid');
  }

  let serverAdvanced = false;
  let serverResult = null;
  try {
    const { data, error } = await supabase.rpc('advance_financial_restore_epoch_v2', {
      p_ledger_id: identity.ledgerId,
      p_expected_epoch: fromEpoch,
      p_new_epoch: toEpoch,
      p_reason: 'controlled_recovery',
      p_device_id: String(deviceId || ''),
    });
    if (error) throw error;
    serverResult = normalizeRpcObject(data);
    if (!serverResult
        || String(serverResult.ledgerId || serverResult.ledger_id || '') !== String(identity.ledgerId)
        || Number(serverResult.restoreEpoch || serverResult.restore_epoch || 0) !== toEpoch
        || Number(serverResult.protocolVersion || serverResult.protocol_version || 0) !== 2) {
      throw new Error('phase9_server_restore_epoch_response_invalid');
    }
    serverAdvanced = true;

    const committed = await commitLedgerRestoreEpochV8({
      namespace: ledgerNamespace,
      expectedFromEpoch: fromEpoch,
      toEpoch,
    });
    if (!committed
        || String(committed.ledgerId || '') !== String(identity.ledgerId)
        || Number(committed.restoreEpoch || 0) !== toEpoch) {
      throw new Error('phase9_local_restore_epoch_commit_invalid');
    }
  } catch (error) {
    // If the server did NOT advance, removing the local intent is safe.
    // If the server DID advance, preserve the intent/evidence so recovery can
    // complete the local CAS after a crash/failure; never hide split state.
    if (!serverAdvanced) {
      await abortLedgerRestoreEpochV8({ namespace: ledgerNamespace }).catch(() => {});
    }
    const failure = {
      ...base,
      ok: false,
      blocked: false,
      reason: errorText(error),
      serverAdvanced,
      ledgerId: identity.ledgerId,
      fromEpoch,
      toEpoch,
      workspaceNamespace,
      ledgerNamespace,
    };
    console.error('[P20_G01_RESTORE_EPOCH_GATE_FAIL]', JSON.stringify(failure));
    return failure;
  }

  // Everything below runs AFTER the restore epoch has already advanced on both the
  // server and the local identity. A raw throw here would escape the gate with no
  // evidence and no record that the epoch moved, which is exactly how the
  // 2026-08-19 device run advanced an epoch silently. Report split state instead.
  const postCommitFailure = (reason, extra = {}) => {
    const failure = {
      ...base,
      ok: false,
      blocked: false,
      phase: 'POST_EPOCH_COMMIT',
      reason: String(reason),
      serverAdvanced: true,
      localEpochCommitted: true,
      splitStateRequiresRecovery: true,
      ledgerId: identity.ledgerId,
      fromEpoch,
      toEpoch,
      workspaceNamespace,
      ledgerNamespace,
      ...extra,
    };
    console.error('[P20_G01_RESTORE_EPOCH_GATE_FAIL]', JSON.stringify(failure));
    return failure;
  };

  const committedIdentity = await ensureLedgerSyncIdentityV8({ namespace: ledgerNamespace });
  const remainingIntent = await readLedgerRestoreIntentV8({ namespace: ledgerNamespace });
  if (Number(committedIdentity?.restoreEpoch || 0) !== toEpoch || remainingIntent) {
    return postCommitFailure('phase9_restore_epoch_local_postcondition_failed', {
      committedIdentity,
      remainingIntent,
    });
  }

  // Shadow/no-write pull on the NEW epoch proves old-epoch mutations are not replayed.
  const shadow = await syncFinancialMutationsV2({
    supabase,
    namespace: ledgerNamespace,
    deviceId,
    maxPages: 5,
    allowProductionApply: false,
  });
  if (!shadow?.ok
      || Number(shadow.restoreEpoch || 0) !== toEpoch
      || Number(shadow.downloaded || 0) !== 0
      || Number(shadow.pendingAfterSync || 0) !== 0) {
    return postCommitFailure(`phase9_new_epoch_shadow_validation_failed:${shadow?.reason || 'unknown'}`, {
      shadow,
    });
  }

  const { data: eventRows, error: eventError } = await supabase
    .from('financial_restore_events_v2')
    .select('ledger_id,from_epoch,to_epoch,reason,device_id,created_at')
    .eq('ledger_id', identity.ledgerId)
    .eq('to_epoch', toEpoch)
    .eq('reason', 'controlled_recovery');
  if (eventError) {
    return postCommitFailure(errorText(eventError), { restoreEventQueryFailed: true });
  }
  if (!Array.isArray(eventRows) || eventRows.length !== 1
      || Number(eventRows[0]?.from_epoch || 0) !== fromEpoch) {
    return postCommitFailure('phase9_restore_event_evidence_missing', {
      restoreEventCount: Array.isArray(eventRows) ? eventRows.length : null,
    });
  }

  const finalState = getState();
  if (stateFingerprint(finalState, coldArchives) !== beforeFingerprint) {
    return postCommitFailure('phase9_restore_epoch_gate_changed_financial_state', {
      financialFingerprintChanged: true,
    });
  }

  const evidence = {
    ...base,
    ok: true,
    blocked: false,
    completedAt: new Date().toISOString(),
    workspaceNamespace,
    ledgerNamespace,
    ledgerId: identity.ledgerId,
    fromEpoch,
    toEpoch,
    protocolVersion: 2,
    deleteLocalInterlock: 'PASS_FAIL_CLOSED',
    backupRestoreInterlock: 'PASS_FAIL_CLOSED',
    localIntentCommitted: true,
    serverAdvanced: serverResult?.advanced === true || serverResult?.idempotent === true,
    serverIdempotent: serverResult?.idempotent === true,
    restoreEventCount: eventRows.length,
    oldEpochReplayDownloaded: Number(shadow.downloaded || 0),
    newEpochPendingAfterSync: Number(shadow.pendingAfterSync || 0),
    disposableAccountConsumed: true,
    nextAction: 'SIGN_OUT_DISPOSABLE_ACCOUNT_AND_VERIFY_ORIGINAL_ACCOUNT_ONLY',
  };
  console.info('[P20_G01_PHASE9_RESTORE_EPOCH_GATE_PASS]', JSON.stringify(evidence));
  return evidence;
}
