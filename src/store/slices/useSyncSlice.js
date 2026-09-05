// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
// MYFI_PERFORMANCE_DATA_PERSISTENCE_V5_1_1
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SQLiteStorage from 'expo-sqlite/kv-store';
import { flushLedgerWrites } from '../../lib/ledgerDatabase';
import { enqueueNativeKvOperation } from '../../lib/nativeKvQueue';
import {
  getFinancialMaintenanceSnapshot,
  isFinancialMaintenanceBlocked,
  promoteActiveFinancialMaintenancePresentation,
  runFinancialMaintenanceTask,
} from '../../lib/financialMaintenanceBarrier';
import { canonicalWorkspaceCfg, mergeWorkspaceStates, sameWorkspaceData } from '../multiDeviceSync';
import { mergeCloudWorkspaceCfg } from '../../lib/cloudWorkspaceMetadata.js';
import {
  acquireAutomaticSyncInteractionHold,
  isAutomaticSyncInteractionHeld,
  releaseAutomaticSyncInteractionHold,
} from '../../lib/automaticSyncInteractionHold';
import {
  isNeverRetrySyncError,
  isTransientCloudSyncError,
  syncDiagnosticCode,
} from '../../lib/syncErrorClassification';
import { supabase } from '../../lib/supabase';
import { STORAGE, DEF_CATS, DEF_CFG, DEF_NOTIF, LEGACY_STORAGE_KEYS, normalizeCfg } from '../../lib/constants';
import { normalizedPreviewEnabled, normalizedShadowEnabled } from '../../lib/databaseMode';
import { legacyUserDataMirrorPlanV1 } from '../../lib/p13LegacyMirrorGate';
import { requestMaintenanceResumeSync, consumeMaintenanceResumeSignal } from '../../lib/financialMaintenanceResumeSignal';
import {
  acknowledgeLedgerOutbox,
  activeLedgerSupported,
  clearLedgerNamespace,
  drainLedgerOutbox,
  getLedgerDataHealth,
  getLedgerNamespace,
  replaceLedgerSnapshot,
  flushLedgerMirror,
} from '../../lib/activeLedgerRepository';
import { accountIdentityPatch, ensureProfileIdentity } from '../../lib/accountIdentity';
import { accountIdFromWorkspaceNamespace, resolveWorkspaceTransition, workspaceNamespaceForSession } from '../../lib/accountWorkspace';
import { readPerformanceSnapshot, schedulePerformanceSnapshotWrite } from '../../dev/performanceTestStorage';
import { exportColdArchives, getColdArchiveNamespace, replaceColdArchives } from '../../lib/localArchiveRepository';
import { runFinancialOperationalCutoverV7, runFinancialShadowMigrationV7 } from '../../lib/financialLedgerV7Migration';
import {
  getFinancialWorkspaceStateV7,
  readFinancialWorkspaceV7,
  reconcileFinancialWorkspaceV7,
  cloneFinancialWorkspaceV7,
  clearFinancialWorkspaceV7,
  proveFinancialLedgerInvariantsV7,
  commitEntityChangesV7,
  persistFinancialLocalPreferencesV7,
  activateFinancialSyncProtocolV2V8,
  readFinancialSyncProtocolV8,
  resetFinancialV2ShadowValidationStateV8,
  inspectFinancialEmptyShellV8,
  recordFinancialCloudRecoveryV8,
  adoptUnbootstrappedCloudLedgerIdentityV8,
} from '../../lib/financialLedgerV7Repository';
import { compareSnapshots, loadNormalizedSnapshot } from '../../lib/normalizedRepository';
import { syncFinancialMutationsV7 } from '../../lib/financialMutationSync';
import { syncFinancialMutationsV2 } from '../../lib/financialMutationSyncV2';
import { bootstrapFinancialLedgerV2 } from '../../lib/financialBootstrapV2';
import { fetchVerifiedFinancialCloudRecoverySourceV2 } from '../../lib/financialCloudRecoveryV2';
import { recoverVerifiedBootstrapWithArchiveV2 } from '../../lib/financialBootstrapRecoveryCoordinatorV2';
import {
  confirmPreparedCloudConflictRecoveryV1,
  hasActiveV2ConflictRecoveryIntentV1,
  prepareVerifiedCloudConflictRecoveryV1,
  resumePreparedCloudConflictRecoveryV1,
} from '../../lib/financialV2ConflictRecoveryV1';
import {
  cloudWorkspaceRevisionFromConflictsV1,
  discardStaleWorkspaceCommandsV1,
  inspectStaleWorkspaceConflictV1,
} from '../../lib/financialV2StaleCommandRecoveryV1';
import {
  GUEST_NAMESPACE,
  clearVaultSnapshot,
  getOrCreateDeviceId,
  readVaultSnapshot,
  writeVaultSnapshot,
} from '../../lib/secureVault';
import {
  cloudSnapshot,
  dedupeWorkspaceData,
  financialDataCount,
  hasCurrencySensitiveFinancialData,
  snapshotFromState,
  stateFromSnapshot,
  uid,
} from '../domain';

let syncQueue = Promise.resolve();
let scheduledSyncTimer = null;
let scheduledSyncReason = 'local_change';
let scheduledSyncAttempt = 0;
let transientSyncRetryTimer = null;
let transientSyncRetryAttempt = 0;
// A local save is the boundary where the user has finished an edit. Wait for a
// quiet period so several completed edits become one cloud round-trip; never
// start cloud work while a form is still being edited (forms only save on their
// explicit save/confirm action).
const POST_EDIT_SYNC_QUIET_PERIOD_MS = 1200;
const SCHEDULED_SYNC_DELAYS_MS = [POST_EDIT_SYNC_QUIET_PERIOD_MS, 3000, 10000, 30000];
const TRANSIENT_SYNC_RETRY_DELAYS_MS = [1500, 5000, 15000, 30000];

// Classification moved to src/lib/syncErrorClassification.js. It used to match
// /\b502\b/ against the whole error text, so an incidental "502" anywhere in a 5xx
// HTML body made an unrelated failure look transient.
//
// Circuit breaker: once the retry ladder is exhausted, stop arming retries at all
// for a cooldown instead of re-entering the ladder on the next trigger.
const SYNC_CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;
let syncCircuitOpenUntil = 0;

const isSyncCircuitOpen = () => Date.now() < syncCircuitOpenUntil;

// Retry logs record why, but a raw 5xx body is headers and edge metadata; keep the
// short sanitised code instead.
const transientSyncErrorText = error => syncDiagnosticCode(
  error?.message || error?.code || error || '',
) || 'sync_failed';

const resetTransientCloudRetry = () => {
  syncCircuitOpenUntil = 0;
  transientSyncRetryAttempt = 0;
  if (transientSyncRetryTimer) clearTimeout(transientSyncRetryTimer);
  transientSyncRetryTimer = null;
};

const armTransientCloudRetry = (get, syncUserId, error) => {
  // Defence in depth: these can never be resolved by resending the same payload.
  if (isNeverRetrySyncError(error)) return false;
  if (isSyncCircuitOpen()) return false;
  if (!isTransientCloudSyncError(error)) return false;
  if (transientSyncRetryAttempt >= TRANSIENT_SYNC_RETRY_DELAYS_MS.length) {
    syncCircuitOpenUntil = Date.now() + SYNC_CIRCUIT_COOLDOWN_MS;
    console.warn('[P19_FINAL_TRANSIENT_RETRY_EXHAUSTED]', JSON.stringify({
      attempts: transientSyncRetryAttempt,
      reason: transientSyncErrorText(error),
    }));
    return false;
  }

  const attempt = transientSyncRetryAttempt + 1;
  const delayMs = TRANSIENT_SYNC_RETRY_DELAYS_MS[transientSyncRetryAttempt];
  transientSyncRetryAttempt = attempt;
  if (transientSyncRetryTimer) clearTimeout(transientSyncRetryTimer);

  console.warn('[P19_FINAL_TRANSIENT_RETRY]', JSON.stringify({
    attempt,
    delayMs,
    reason: transientSyncErrorText(error),
  }));

  transientSyncRetryTimer = setTimeout(() => {
    transientSyncRetryTimer = null;
    const current = get();
    if (!current.user
        || current.user.id !== syncUserId
        || current.cfg.demoMode
        || !current.workspaceReady
        || isAutomaticSyncInteractionHeld()
        || isFinancialMaintenanceBlocked()) {
      return;
    }
    Promise.resolve(current.syncCloud?.({ reason: 'transient_retry' })).catch(() => {});
  }, delayMs);
  return true;
};
const FRESH_TEST_MODE = process.env.EXPO_PUBLIC_FRESH_TEST === '1';
const FRESH_TEST_NAMESPACE = 'fresh-test-new-user';

const RESET_MARKER_PREFIX = 'MYFI_INTENTIONAL_RESET_V1';
const ACTIVE_LOCAL_LEDGER_NAMESPACE_KEY = 'MYFI_ACTIVE_LOCAL_LEDGER_NAMESPACE_V1';
const ACTIVE_LOCAL_LEDGER_CONTEXT_KEY = 'MYFI_ACTIVE_LOCAL_LEDGER_CONTEXT_V1';
const ACTIVE_LOCAL_LEDGER_CONTEXT_VERSION = 2;
const R04_OPERATIONAL_CUTOVER_ENABLED = true;

// P19-001: the active local ledger identity must be durable without network or
// Supabase session resolution. Native platforms use SQLite KV as the primary
// pointer store; AsyncStorage is retained only as a rollback/migration mirror.
const activeLedgerIdentityStorage = Platform.OS === 'web' ? AsyncStorage : SQLiteStorage;
const activeLedgerIdentityKeys = [
  ACTIVE_LOCAL_LEDGER_CONTEXT_KEY,
  ACTIVE_LOCAL_LEDGER_NAMESPACE_KEY,
];

const localIdentityFromState = state => accountIdentityPatch({
  displayName: state?.cfg?.displayName || state?.cfg?.name,
  username: state?.cfg?.username,
  phone: state?.cfg?.phone,
  avatarUri: state?.cfg?.avatarUri,
  avatarPath: state?.cfg?.avatarPath,
});

const parseLedgerContext = raw => {
  try {
    return { value: raw ? JSON.parse(raw) : {}, corrupt: false };
  } catch {
    return { value: {}, corrupt: true };
  }
};

const readActiveLedgerIdentityRows = async storage => {
  if (typeof storage?.multiGet === 'function') {
    return storage.multiGet(activeLedgerIdentityKeys);
  }
  return Promise.all(activeLedgerIdentityKeys.map(async key => [key, await storage.getItem(key)]));
};

const writeActiveLedgerIdentityRows = async (storage, rows) => {
  if (typeof storage?.multiSet === 'function') {
    await storage.multiSet(rows);
    return;
  }
  await Promise.all(rows.map(([key, value]) => storage.setItem(key, value)));
};

const decodeActiveLocalLedgerRows = rows => {
  const values = Array.isArray(rows) ? rows : [];
  const contextRaw = values.find(([key]) => key === ACTIVE_LOCAL_LEDGER_CONTEXT_KEY)?.[1] || null;
  const legacyNamespaceRaw = values.find(([key]) => key === ACTIVE_LOCAL_LEDGER_NAMESPACE_KEY)?.[1] || null;
  const parsedResult = parseLedgerContext(contextRaw);
  const parsed = parsedResult.value;
  const namespace = String(parsed.namespace || legacyNamespaceRaw || GUEST_NAMESPACE).trim() || GUEST_NAMESPACE;
  const linkedUserId = String(parsed.linkedUserId || accountIdFromWorkspaceNamespace(namespace) || '').trim() || null;
  const identity = accountIdentityPatch(parsed.identity || {});
  return {
    context: { namespace, linkedUserId, identity },
    hasValue: !!(contextRaw || legacyNamespaceRaw),
    corrupt: parsedResult.corrupt && !legacyNamespaceRaw,
  };
};

const buildActiveLocalLedgerPayload = ({ namespace, linkedUserId = null, identity = {}, updatedAt = null } = {}) => {
  const value = String(namespace || GUEST_NAMESPACE).trim() || GUEST_NAMESPACE;
  const linked = String(linkedUserId || accountIdFromWorkspaceNamespace(value) || '').trim() || null;
  return {
    version: ACTIVE_LOCAL_LEDGER_CONTEXT_VERSION,
    namespace: value,
    linkedUserId: linked,
    identity: accountIdentityPatch(identity || {}),
    updatedAt: updatedAt || new Date().toISOString(),
  };
};

const persistActiveLocalLedgerContext = async (storage, context = {}) => {
  const payload = buildActiveLocalLedgerPayload(context);
  await writeActiveLedgerIdentityRows(storage, [
    [ACTIVE_LOCAL_LEDGER_CONTEXT_KEY, JSON.stringify(payload)],
    [ACTIVE_LOCAL_LEDGER_NAMESPACE_KEY, payload.namespace],
  ]);
  return payload;
};

const readActiveLocalLedgerContextUnsafe = async () => {
  let primaryRows = null;
  let primaryError = null;
  try {
    primaryRows = await readActiveLedgerIdentityRows(activeLedgerIdentityStorage);
  } catch (error) {
    primaryError = error;
  }

  const primary = primaryRows ? decodeActiveLocalLedgerRows(primaryRows) : null;
  if (primary?.hasValue && !primary.corrupt) return primary.context;

  if (activeLedgerIdentityStorage !== AsyncStorage) {
    let legacyRows = null;
    let legacyError = null;
    try {
      legacyRows = await readActiveLedgerIdentityRows(AsyncStorage);
    } catch (error) {
      legacyError = error;
    }
    const legacy = legacyRows ? decodeActiveLocalLedgerRows(legacyRows) : null;
    if (legacy?.hasValue && !legacy.corrupt) {
      // One-time/native repair path. Failure to repair the primary pointer is
      // non-destructive; the legacy pointer still lets the correct ledger mount.
      try { await persistActiveLocalLedgerContext(activeLedgerIdentityStorage, legacy.context); } catch {}
      return legacy.context;
    }
    if (primaryError && legacyError) throw new Error('active_local_ledger_context_unavailable');
    if (primaryError && !legacy?.hasValue) throw new Error('active_local_ledger_context_unavailable');
    if (primary?.corrupt || legacy?.corrupt) throw new Error('active_local_ledger_context_corrupt');
  } else {
    if (primaryError) throw new Error('active_local_ledger_context_unavailable');
    if (primary?.corrupt) throw new Error('active_local_ledger_context_corrupt');
  }

  // A genuinely fresh install has no pointer in either store and starts Guest.
  return { namespace: GUEST_NAMESPACE, linkedUserId: null, identity: {} };
};

const readActiveLocalLedgerContext = () => (
  enqueueNativeKvOperation(readActiveLocalLedgerContextUnsafe)
);

const writeActiveLocalLedgerContextUnsafe = async ({ namespace, linkedUserId = null, identity = {} } = {}) => {
  if (FRESH_TEST_MODE) return;
  const payload = await persistActiveLocalLedgerContext(activeLedgerIdentityStorage, {
    namespace,
    linkedUserId,
    identity,
  });

  // Keep the V1 AsyncStorage mirror during the transition so rollback to the
  // previous app build does not lose the selected local ledger namespace.
  if (activeLedgerIdentityStorage !== AsyncStorage) {
    try { await persistActiveLocalLedgerContext(AsyncStorage, payload); } catch {}
  }
};

const writeActiveLocalLedgerContext = (context = {}) => (
  enqueueNativeKvOperation(() => writeActiveLocalLedgerContextUnsafe(context))
);

const readActiveLocalLedgerNamespace = async () => (await readActiveLocalLedgerContext()).namespace;
const writeActiveLocalLedgerNamespace = async namespace => {
  const current = await readActiveLocalLedgerContext();
  const value = String(namespace || GUEST_NAMESPACE).trim() || GUEST_NAMESPACE;
  await writeActiveLocalLedgerContext({
    namespace: value,
    linkedUserId: current.namespace === value
      ? current.linkedUserId
      : accountIdFromWorkspaceNamespace(value),
    identity: current.identity,
  });
};
const syncBaseNamespace = namespace => `sync-base:${String(namespace || GUEST_NAMESPACE)}`;
const SYNC_MAX_ATTEMPTS = 4;
const SYNC_CLOUD_COLUMNS = 'user_id,trans,debts,goals,wallets,commitments,cats,cfg,revision,updated_at';
const syncRetryDelay = attempt => new Promise(resolve => setTimeout(resolve, Math.min(600, 120 * (attempt + 1))));
const normalizeScheduledSyncReason = value => (
  typeof value === 'object' && value ? String(value.reason || 'local_change') : String(value || 'local_change')
);
const armScheduledCloudSync = (get, reason, attempt = 0) => {
  scheduledSyncReason = normalizeScheduledSyncReason(reason || scheduledSyncReason);
  scheduledSyncAttempt = Math.max(0, Number(attempt) || 0);
  // P19-015A2: do not start scheduled sync while maintenance is pending/active.
  if (isFinancialMaintenanceBlocked()) {
    if (scheduledSyncTimer) clearTimeout(scheduledSyncTimer);
    scheduledSyncTimer = null;
    return false;
  }
  // A finance editor owns its draft until it closes. Do not begin an automatic
  // network round-trip underneath it; its release schedules one quiet follow-up.
  if (isAutomaticSyncInteractionHeld()) {
    if (scheduledSyncTimer) clearTimeout(scheduledSyncTimer);
    scheduledSyncTimer = null;
    return false;
  }
  if (scheduledSyncTimer) clearTimeout(scheduledSyncTimer);
  const delay = SCHEDULED_SYNC_DELAYS_MS[Math.min(scheduledSyncAttempt, SCHEDULED_SYNC_DELAYS_MS.length - 1)];
  scheduledSyncTimer = setTimeout(async () => {
    scheduledSyncTimer = null;
    const current = get();
    // P19-015A2: a timer that fired after a maintenance request must stand down.
    if (isFinancialMaintenanceBlocked() || isAutomaticSyncInteractionHeld()) return;
    if (!current.user || current.cfg.demoMode || !current.workspaceReady || !current.dirty) {
      scheduledSyncAttempt = 0;
      return;
    }
    let ok = false;
    try {
      ok = !!(await current.syncCloud({ reason: scheduledSyncReason }));
    } catch (error) {
      console.warn('[STORE] scheduled sync', error);
    }
    const latest = get();
    if (!ok && latest.user && !latest.cfg.demoMode && latest.workspaceReady && latest.dirty
      && scheduledSyncAttempt < SCHEDULED_SYNC_DELAYS_MS.length - 1) {
      armScheduledCloudSync(get, scheduledSyncReason, scheduledSyncAttempt + 1);
      return;
    }
    if (ok || !latest.dirty) scheduledSyncAttempt = 0;
  }, delay);
  return true;
};
const mergeRollbackNamespace = namespace => `merge-rollback:${String(namespace || GUEST_NAMESPACE)}`;
const resetMarkerKey = namespace => `${RESET_MARKER_PREFIX}:${String(namespace || GUEST_NAMESPACE)}`;
const readResetMarker = async namespace => parseJson(await AsyncStorage.getItem(resetMarkerKey(namespace)), null);
const writeResetMarker = async (namespace, patch = {}) => {
  const current = await readResetMarker(namespace);
  const next = {
    legacyRecoveryDisabled: true,
    pendingCloudSync: false,
    resetAt: current?.resetAt || new Date().toISOString(),
    ...(current || {}),
    ...patch,
  };
  await AsyncStorage.setItem(resetMarkerKey(namespace), JSON.stringify(next));
  return next;
};


const parseJson = (raw, fallback = null) => {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};

const stateFromFinancialV7 = (workspace, fallbackCfg = DEF_CFG) => {
  const financialWorkspace = workspace?.workspace || {};
  const ledgerTransactions = Array.isArray(workspace?.trans) ? workspace.trans : [];
  const releasedGoals = new Map(
    ledgerTransactions
      .filter(item => item?.hiddenFromHistory && item?.isGoalRelease && item?.goalId)
      .map(item => [String(item.goalId), item.dateISO || item.updatedAt || null]),
  );
  const visibleTransactions = ledgerTransactions
    .filter(item => !item?.hiddenFromHistory)
    .map(item => (
      item?.isGoalSaving && item?.goalId && releasedGoals.has(String(item.goalId))
        ? {
            ...item,
            allocationReleased: true,
            allocationReleasedAt: item.allocationReleasedAt || releasedGoals.get(String(item.goalId)),
          }
        : item
    ));
  return stateFromSnapshot({
    data: {
      trans: visibleTransactions,
      debts: workspace?.debts || [], goals: workspace?.goals || [], wallets: workspace?.wallets || [],
      commitments: workspace?.commitments || [],
      trackerTypes: workspace?.trackerTypes || [], trackerItems: workspace?.trackerItems || [],
    },
    cats: workspace?.cats?.length ? workspace.cats : DEF_CATS,
    cfg: mergeCloudWorkspaceCfg(fallbackCfg, financialWorkspace.cfg),
    notif: financialWorkspace.notif || DEF_NOTIF,
    dirty: false,
    cloudRevision: Number(financialWorkspace.cloudRevision || 0),
  });
};

const readFullFinancialStateV7 = async ({ ledgerNamespace, fallbackState = {} } = {}) => {
  if (!ledgerNamespace || !activeLedgerSupported()) return null;
  const workspace = await readFinancialWorkspaceV7({
    namespace: ledgerNamespace,
    includeArchived: false,
    transactionLimit: null,
  });
  if (!workspace) return null;
  const loaded = stateFromFinancialV7(workspace, fallbackState.cfg || DEF_CFG);
  return {
    ...fallbackState,
    ...loaded,
    user: fallbackState.user || null,
    workspaceNamespace: fallbackState.workspaceNamespace || GUEST_NAMESPACE,
    workspaceReady: fallbackState.workspaceReady !== false,
    online: fallbackState.online,
    lastSyncError: fallbackState.lastSyncError || null,
    lastSyncedAt: fallbackState.lastSyncedAt || null,
    syncConflict: fallbackState.syncConflict || null,
    financialLedgerV7Ready: true,
    financialLedgerV7Cutover: true,
  };
};

const readCanonicalWorkspaceState = async ({ workspaceNamespace = GUEST_NAMESPACE, fallbackState = {} } = {}) => {
  const namespace = String(workspaceNamespace || GUEST_NAMESPACE).trim() || GUEST_NAMESPACE;
  const ledgerNamespace = getLedgerNamespace(namespace, fallbackState.cfg || DEF_CFG);
  if (activeLedgerSupported()) {
    const ledgerState = await getFinancialWorkspaceStateV7({ namespace: ledgerNamespace });
    if (ledgerState?.source_mode === 'sqlite') {
      const full = await readFullFinancialStateV7({ ledgerNamespace, fallbackState: { ...fallbackState, workspaceNamespace: namespace } });
      if (!full) throw new Error('financial_v7_canonical_read_failed');
      return {
        source: 'sqlite_v7',
        workspaceNamespace: namespace,
        ledgerNamespace,
        state: full,
        snapshot: snapshotFromState(full),
      };
    }
  }
  const vault = await readVaultSnapshot(namespace);
  const state = vault.snapshot ? stateFromSnapshot(vault.snapshot, fallbackState.cfg || DEF_CFG) : null;
  return {
    source: 'vault',
    workspaceNamespace: namespace,
    ledgerNamespace,
    state: state ? { ...fallbackState, ...state, workspaceNamespace: namespace, workspaceReady: true } : null,
    snapshot: vault.snapshot || null,
  };
};

const restoreSnapshotAsOperationalV7 = async ({ workspaceNamespace = GUEST_NAMESPACE, snapshot, fallbackCfg = DEF_CFG } = {}) => {
  if (!snapshot || !activeLedgerSupported()) return false;
  const state = stateFromSnapshot(snapshot, fallbackCfg);
  const ledgerNamespace = getLedgerNamespace(workspaceNamespace, state.cfg || fallbackCfg);
  // P19-007: never clear the active ledger first. Operational cutover stages
  // the replacement, verifies checksum/metrics/health, then promotes it inside
  // one SQLite transaction. Until promotion succeeds the current ledger stays.
  const restored = await runFinancialOperationalCutoverV7({
    namespace: ledgerNamespace,
    workspace: state,
    coldArchives: [],
    forceReplace: true,
    resetPendingOutbox: true,
  });
  if (!restored?.ok || !restored?.cutover) {
    throw new Error(restored?.reason || 'financial_v7_snapshot_restore_failed');
  }
  return true;
};

const snapshotData = snapshot => snapshot?.data || snapshot || {};

const hasMeaningfulLocalData = (snapshot = {}) => {
  const data = snapshotData(snapshot);
  if (financialDataCount(data) > 0) return true;

  const wallets = Array.isArray(data.wallets) ? data.wallets : [];
  return wallets.some(wallet => Number(wallet?.openingBalance || 0) !== 0);
};

const recordCount = state => (
  financialDataCount(state)
  + (Array.isArray(state.wallets) ? state.wallets.length : 0)
);

const buildGuestTransferPreview = (current = {}, guestSnapshot = null) => {
  if (!hasMeaningfulLocalData(guestSnapshot)) {
    return { hasData: false, addsData: false, incomingRecords: 0, addedRecords: 0, duplicateRecords: 0 };
  }
  const guest = stateFromSnapshot(guestSnapshot, current.cfg);
  const currentClean = dedupeWorkspaceData(current);
  const merged = dedupeWorkspaceData({
    ...currentClean,
    trans: [...guest.trans, ...currentClean.trans],
    debts: [...guest.debts, ...currentClean.debts],
    goals: [...guest.goals, ...currentClean.goals],
    wallets: [...currentClean.wallets, ...guest.wallets],
    commitments: [...guest.commitments, ...currentClean.commitments],
    cats: [
      ...currentClean.cats,
      ...guest.cats.filter(item => !currentClean.cats.some(existing => existing.id === item.id)),
    ],
  });
  const incomingRecords = recordCount(guest);
  const beforeRecords = recordCount(currentClean);
  const afterRecords = recordCount(merged);
  const addedRecords = Math.max(0, afterRecords - beforeRecords);
  return {
    hasData: true,
    addsData: !sameWorkspaceData(merged, currentClean),
    incomingRecords,
    addedRecords,
    duplicateRecords: Math.max(0, incomingRecords - addedRecords),
  };
};

const saveMergeRollback = async ({ namespace, accountSnapshot, guestSnapshot, type = 'guest_transfer' }) => {
  const createdAt = new Date().toISOString();
  await writeVaultSnapshot(
    mergeRollbackNamespace(namespace),
    {
      v: 1,
      type,
      createdAt,
      accountSnapshot,
      guestSnapshot: guestSnapshot || null,
    },
    { force: true },
  );
  return { type, createdAt };
};

const firstParsedValue = async (keys, fallback = null) => {
  const rows = await AsyncStorage.multiGet(keys);
  for (const [, raw] of rows) {
    const parsed = parseJson(raw, null);
    if (parsed) return parsed;
  }
  return fallback;
};

const findLegacySnapshot = async () => {
  const recovery = await firstParsedValue(LEGACY_STORAGE_KEYS.recovery, {});
  const data = await firstParsedValue(LEGACY_STORAGE_KEYS.data, recovery.data || {});
  const settings = await firstParsedValue(LEGACY_STORAGE_KEYS.settings, recovery.cfg || null);
  const storedCats = await firstParsedValue(LEGACY_STORAGE_KEYS.cats, recovery.cats || null);
  const legacyNotifRaw = await firstParsedValue(LEGACY_STORAGE_KEYS.notif, null);
  const legacyNotif = legacyNotifRaw ? { ...DEF_NOTIF, ...legacyNotifRaw } : DEF_NOTIF;

  if (financialDataCount(data) > 0 || settings || storedCats || recovery.data) {
    return {
      v: 7,
      data,
      cfg: settings || DEF_CFG,
      cats: storedCats || DEF_CATS,
      notif: legacyNotif,
      updatedAt: recovery.updatedAt || new Date().toISOString(),
      lastSyncedAt: null,
      cloudRevision: 0,
      dirty: financialDataCount(data) > 0,
      recoveredFromLegacy: true,
    };
  }

  const keys = typeof AsyncStorage.getAllKeys === 'function' ? await AsyncStorage.getAllKeys() : [];
  const candidateKeys = keys.filter(key => /MYFI|TERRA|FINANCE|MONEY|BUDGET|DATA|BACKUP|STORE/i.test(String(key || '')));
  if (!candidateKeys.length) return null;
  const rows = await AsyncStorage.multiGet(candidateKeys);
  for (const [key, raw] of rows) {
    const parsed = parseJson(raw, null);
    const dataLike = parsed?.data || parsed;
    if (financialDataCount(dataLike) > 0) {
      return {
        v: 7,
        data: dataLike,
        cfg: parsed?.cfg || parsed?.settings || DEF_CFG,
        cats: parsed?.cats || DEF_CATS,
        notif: { ...DEF_NOTIF, ...(parsed?.notif || {}) },
        updatedAt: parsed?.updatedAt || new Date().toISOString(),
        lastSyncedAt: null,
        cloudRevision: 0,
        dirty: true,
        recoveredFromLegacy: true,
        recoveredFromKey: key,
      };
    }
  }
  return null;
};




const runVerifiedEmptyShellCloudRecoveryV2 = async ({
  get,
  set,
  workspaceNamespace,
  ledgerNamespace,
  syncUserId,
  allowVerifiedBootstrapImport = false,
  onExclusiveTransition = null,
} = {}) => {
  let exclusivePresentationRequested = false;
  const presentExclusiveOperation = () => {
    if (exclusivePresentationRequested) return;
    exclusivePresentationRequested = true;
    try { onExclusiveTransition?.(); } catch {}
  };
  const current = get();
  if (!current.user || current.user.id !== syncUserId) {
    return { attempted: false, ok: false, reason: 'financial_cloud_recovery_session_changed' };
  }
  if (current.cfg.demoMode || !current.workspaceReady || !current.financialLedgerV7Cutover) {
    return { attempted: false, ok: true, reason: 'financial_cloud_recovery_not_eligible' };
  }

  // A successful clean-V2 identity adoption is durable even if activation later
  // hits a transient network timeout. Once the local identity matches that
  // cutover marker, every retry remains V2-only; it must never fall back to V1.
  const existingProtocol = await readFinancialSyncProtocolV8({ namespace: ledgerNamespace });
  const cutoverMarker = await readResetMarker(workspaceNamespace);
  const markerLedgerId = String(cutoverMarker?.cloudLedgerId || '').trim();
  const markerRestoreEpoch = Number(cutoverMarker?.cloudRestoreEpoch || 0);
  const durableCleanV2Cutover = cutoverMarker?.cleanV2Cutover === true
    && markerLedgerId
    && markerRestoreEpoch > 0
    && String(existingProtocol?.ledgerId || '') === markerLedgerId
    && Number(existingProtocol?.restoreEpoch || 0) === markerRestoreEpoch;

  if (durableCleanV2Cutover) {
    return {
      attempted: false,
      ok: true,
      recovered: false,
      requireV2: true,
      adopted: true,
      reason: existingProtocol?.activeProtocolVersion === 2
        ? 'financial_v2_already_active'
        : 'financial_v2_adoption_pending_activation',
      protocol: existingProtocol,
      source: {
        mode: 'v2_unbootstrapped',
        ledgerId: markerLedgerId,
        restoreEpoch: markerRestoreEpoch,
      },
    };
  }

  const wallets = Array.isArray(current.wallets) ? current.wallets : [];
  const localLooksLikeShell = financialDataCount(current) === 0
    && !hasCurrencySensitiveFinancialData(current)
    && wallets.length <= 1;
  if (!localLooksLikeShell) {
    return { attempted: false, ok: true, reason: 'financial_cloud_recovery_local_has_data' };
  }

  const shell = await inspectFinancialEmptyShellV8({ namespace: ledgerNamespace });
  if (!shell?.supported || !shell.empty) {
    return {
      attempted: false,
      ok: shell?.supported !== false,
      reason: shell?.reason || 'financial_cloud_recovery_local_not_empty_shell',
      shell,
    };
  }

  // Once this local ledger has durably activated protocol V2, an empty/setup
  // financial workspace is a valid steady state. Do not reinterpret a finalized
  // cloud bootstrap as a fresh recovery request on every restart.
  if (existingProtocol?.activeProtocolVersion === 2) {
    return {
      attempted: false,
      ok: true,
      recovered: false,
      requireV2: true,
      reason: 'financial_v2_already_active',
      protocol: existingProtocol,
      shell,
    };
  }

  set({
    financialCloudRecoveryV2: {
      status: 'checking_cloud',
      workspaceNamespace,
      ledgerNamespace,
      startedAt: new Date().toISOString(),
      error: null,
    },
  });

  const source = await fetchVerifiedFinancialCloudRecoverySourceV2({ supabase });
  if (!source?.ok) {
    const reason = String(source?.reason || 'financial_cloud_recovery_source_failed');
    set({
      financialCloudRecoveryV2: {
        status: 'failed',
        workspaceNamespace,
        ledgerNamespace,
        error: reason,
        checkedAt: new Date().toISOString(),
      },
    });
    return { attempted: true, ok: false, reason, source };
  }

  if (source.mode === 'none') {
    set({
      financialCloudRecoveryV2: {
        status: 'no_cloud_data',
        workspaceNamespace,
        ledgerNamespace,
        checkedAt: new Date().toISOString(),
        error: null,
      },
    });
    return { attempted: true, ok: true, recovered: false, source };
  }

  // A finalized V2 ledger must be imported from its verified bootstrap rows.
  // Never reinterpret it through user_data and never register/bootstrap the
  // current empty shell over it.
  if (source.mode === 'v2_bootstrap') {
    if (allowVerifiedBootstrapImport) {
      presentExclusiveOperation();
      set({
        financialCloudRecoveryV2: {
          status: 'restoring_verified_v2_bootstrap',
          workspaceNamespace,
          ledgerNamespace,
          ledgerId: source.ledgerId,
          restoreEpoch: source.restoreEpoch,
          bootstrapId: source.bootstrapId,
          error: null,
        },
      });
      const recovery = await recoverVerifiedBootstrapWithArchiveV2({
        supabase,
        namespace: ledgerNamespace,
        accountId: syncUserId,
      });
      if (!recovery?.ok) {
        const reason = String(recovery?.reason || 'financial_v2_bootstrap_recovery_failed');
        set({
          financialCloudRecoveryV2: {
            status: 'failed_v2_bootstrap_recovery',
            workspaceNamespace,
            ledgerNamespace,
            ledgerId: source.ledgerId,
            restoreEpoch: source.restoreEpoch,
            bootstrapId: source.bootstrapId,
            error: reason,
          },
        });
        return { attempted: true, ok: false, blocked: true, reason, source, recovery };
      }
      await get().loadLocal(workspaceNamespace, { allowLegacy: false, maintenanceOwned: true });
      await writeResetMarker(workspaceNamespace, {
        pendingCloudSync: false,
        localCloudRecoveryRequired: false,
        localCloudRecoveryAccountId: null,
        cloudRecoveryMode: 'v2_bootstrap',
        cloudLedgerId: recovery.ledgerId,
        cloudRestoreEpoch: recovery.restoreEpoch,
      });
      set({
        financialCloudRecoveryV2: {
          status: 'recovered_v2_bootstrap_pending_activation',
          workspaceNamespace,
          ledgerNamespace,
          ledgerId: recovery.ledgerId,
          restoreEpoch: recovery.restoreEpoch,
          restoredAt: new Date().toISOString(),
          error: null,
        },
      });
      return {
        attempted: true,
        ok: true,
        recovered: true,
        requireV2: true,
        mode: 'v2_bootstrap',
        source,
        recovery,
      };
    }
    const reason = 'financial_v2_bootstrap_import_required';
    const manualReset = cutoverMarker?.localCloudRecoveryRequired === true
      && String(cutoverMarker?.localCloudRecoveryAccountId || '') === String(syncUserId);
    set({
      financialCloudRecoveryV2: {
        status: manualReset ? 'local_data_deleted_pending_recovery' : 'blocked_v2_bootstrap_import',
        workspaceNamespace,
        ledgerNamespace,
        ledgerId: source.ledgerId,
        restoreEpoch: source.restoreEpoch,
        bootstrapId: source.bootstrapId,
        error: reason,
      },
    });
    return { attempted: true, ok: false, blocked: true, reason, source };
  }

  if (source.mode === 'v2_unbootstrapped') {
    const cloudLedgerId = String(source.ledgerId || '').trim();
    const cloudRestoreEpoch = Number(source.restoreEpoch || 0);
    if (!cloudLedgerId || cloudRestoreEpoch <= 0) {
      const reason = 'financial_v2_unbootstrapped_identity_invalid';
      set({ financialCloudRecoveryV2: { status: 'failed', workspaceNamespace, ledgerNamespace, error: reason } });
      return { attempted: true, ok: false, reason, source };
    }

    // This is no longer a routine pull: the immutable local ledger identity
    // is about to change to the verified cloud identity.
    presentExclusiveOperation();
    const adoption = await adoptUnbootstrappedCloudLedgerIdentityV8({
      namespace: ledgerNamespace,
      cloudLedgerId,
      cloudRestoreEpoch,
    });
    if (!adoption?.ok) {
      const reason = String(adoption?.reason || 'financial_v2_unbootstrapped_identity_adoption_failed');
      set({
        financialCloudRecoveryV2: {
          status: 'failed_v2_unbootstrapped_adoption',
          workspaceNamespace,
          ledgerNamespace,
          ledgerId: cloudLedgerId,
          restoreEpoch: cloudRestoreEpoch,
          error: reason,
        },
      });
      return { attempted: true, ok: false, blocked: true, reason, source, adoption };
    }

    await writeResetMarker(workspaceNamespace, {
      pendingCloudSync: false,
      legacyRecoveryDisabled: true,
      cleanV2Cutover: true,
      cloudLedgerId,
      cloudRestoreEpoch,
    });
    console.info('[P19_FINAL_V2_ADOPTED]', JSON.stringify({
      fromLedgerId: adoption.fromLedgerId || null,
      ledgerId: adoption.ledgerId,
      restoreEpoch: adoption.restoreEpoch,
      idempotent: adoption.idempotent === true,
    }));
    set({
      financialCloudRecoveryV2: {
        status: 'adopted_v2_unbootstrapped',
        workspaceNamespace,
        ledgerNamespace,
        ledgerId: adoption.ledgerId,
        restoreEpoch: adoption.restoreEpoch,
        adoptedAt: new Date().toISOString(),
        error: null,
      },
    });
    return {
      attempted: true,
      ok: true,
      recovered: false,
      requireV2: true,
      adopted: true,
      mode: 'v2_unbootstrapped',
      source,
      adoption,
    };
  }

  if (source.mode !== 'legacy_snapshot' || !source.snapshot) {
    return {
      attempted: true,
      ok: false,
      reason: 'financial_cloud_recovery_source_mode_invalid',
      source,
    };
  }

  // If an earlier attempt already reserved a different V2 ledger identity,
  // do not silently rewrite the immutable local identity. That is a dedicated
  // identity-adoption recovery path.
  if (source.reservedLedgerId && source.reservedLedgerId !== shell.ledgerId) {
    const reason = 'financial_v2_reserved_ledger_identity_adoption_required';
    set({
      financialCloudRecoveryV2: {
        status: 'blocked_reserved_ledger_identity',
        workspaceNamespace,
        ledgerNamespace,
        mode: source.mode,
        localLedgerId: shell.ledgerId,
        cloudLedgerId: source.reservedLedgerId,
        cloudRestoreEpoch: Number(source.reservedRestoreEpoch || 0),
        cloudRevision: Number(source.cloudRevision || 0),
        cloudUpdatedAt: source.cloudUpdatedAt || null,
        sourceHash: source.snapshotHash || null,
        verifiedAt: source.verifiedAt || null,
        legacyFinancialCount: Number(source.legacyFinancialCount || 0),
        walletCount: Number(source.walletCount || 0),
        bootstrapId: source.bootstrapId || null,
        error: reason,
      },
    });
    return { attempted: true, ok: false, blocked: true, reason, source, shell };
  }

  set({
    financialCloudRecoveryV2: {
      status: 'restoring_verified_legacy_snapshot',
      workspaceNamespace,
      ledgerNamespace,
      sourceHash: source.snapshotHash,
      cloudRevision: source.cloudRevision,
      verifiedAt: source.verifiedAt,
      error: null,
    },
  });

  const snapshot = {
    ...source.snapshot,
    notif: current.notif || DEF_NOTIF,
  };
  const remoteState = stateFromSnapshot(snapshot, current.cfg || DEF_CFG);

  // Only a verified legacy snapshot reaches this point. Its promotion replaces
  // the local financial workspace, so it is intentionally visible and fenced.
  presentExclusiveOperation();
  await restoreSnapshotAsOperationalV7({
    workspaceNamespace,
    snapshot,
    fallbackCfg: current.cfg || DEF_CFG,
  });

  const proof = await proveFinancialLedgerInvariantsV7({ namespace: ledgerNamespace });
  if (!proof?.ok) {
    throw new Error('financial_cloud_recovery_invariant_proof_failed');
  }

  const full = await readFullFinancialStateV7({
    ledgerNamespace,
    fallbackState: {
      ...get(),
      user: get().user,
      workspaceNamespace,
      workspaceReady: true,
    },
  });
  if (!full || !sameWorkspaceData(full, remoteState)) {
    throw new Error('financial_cloud_recovery_roundtrip_mismatch');
  }

  const syncedAt = new Date().toISOString();
  const canonicalSnapshot = snapshotFromState(full, {
    dirty: false,
    cloudRevision: source.cloudRevision,
    lastSyncedAt: syncedAt,
  });
  await writeVaultSnapshot(workspaceNamespace, canonicalSnapshot, { force: true });
  await writeVaultSnapshot(syncBaseNamespace(workspaceNamespace), canonicalSnapshot, { force: true });
  await writeResetMarker(workspaceNamespace, {
    pendingCloudSync: false,
    cloudRecoveryMode: 'legacy_snapshot',
    cloudRecoveryRevision: source.cloudRevision,
  });
  await recordFinancialCloudRecoveryV8({
    namespace: ledgerNamespace,
    mode: 'legacy_snapshot',
    sourceHash: source.snapshotHash,
    cloudRevision: source.cloudRevision,
    cloudUpdatedAt: source.cloudUpdatedAt,
    verifiedAt: source.verifiedAt,
  });

  set(state => ({
    ...full,
    user: state.user,
    workspaceNamespace,
    workspaceReady: true,
    dirty: false,
    cloudRevision: source.cloudRevision,
    lastSyncedAt: syncedAt,
    online: true,
    lastSyncError: null,
    financialLedgerV7Ready: true,
    financialLedgerV7Cutover: true,
    ledgerReady: true,
    ledgerError: null,
    financialCloudRecoveryV2: {
      status: 'recovered',
      workspaceNamespace,
      ledgerNamespace,
      mode: 'legacy_snapshot',
      sourceHash: source.snapshotHash,
      cloudRevision: source.cloudRevision,
      cloudUpdatedAt: source.cloudUpdatedAt,
      verifiedAt: source.verifiedAt,
      restoredAt: new Date().toISOString(),
      legacyFinancialCount: source.legacyFinancialCount,
      walletCount: source.walletCount,
      error: null,
    },
  }));

  return {
    attempted: true,
    ok: true,
    recovered: true,
    requireV2: true,
    mode: 'legacy_snapshot',
    source,
    proof,
  };
};

// This is deliberately a one-way optimization. It only says that recovery is
// certainly unnecessary; every uncertain/empty state still takes the existing
// visibly-blocking, verified recovery path below. Normal V2 sync therefore does
// not briefly cover the current screen simply to discover that nothing is needed.
const hasSteadyFinancialCloudRecoveryStateV2 = async ({
  get,
  workspaceNamespace,
  ledgerNamespace,
  syncUserId,
} = {}) => {
  const current = get();
  if (!current.user || current.user.id !== syncUserId) return null;
  if (current.cfg.demoMode || !current.workspaceReady || !current.financialLedgerV7Cutover) return null;

  const existingProtocol = await readFinancialSyncProtocolV8({ namespace: ledgerNamespace });
  const cutoverMarker = await readResetMarker(workspaceNamespace);
  const markerLedgerId = String(cutoverMarker?.cloudLedgerId || '').trim();
  const markerRestoreEpoch = Number(cutoverMarker?.cloudRestoreEpoch || 0);
  const durableCleanV2Cutover = cutoverMarker?.cleanV2Cutover === true
    && markerLedgerId
    && markerRestoreEpoch > 0
    && String(existingProtocol?.ledgerId || '') === markerLedgerId
    && Number(existingProtocol?.restoreEpoch || 0) === markerRestoreEpoch;
  if (durableCleanV2Cutover) return 'financial_v2_durable_cutover';

  const wallets = Array.isArray(current.wallets) ? current.wallets : [];
  const localLooksLikeShell = financialDataCount(current) === 0
    && !hasCurrencySensitiveFinancialData(current)
    && wallets.length <= 1;
  if (!localLooksLikeShell) return 'financial_cloud_recovery_local_has_data';

  const shell = await inspectFinancialEmptyShellV8({ namespace: ledgerNamespace });
  if (shell?.supported && shell.empty && existingProtocol?.activeProtocolVersion === 2) {
    return 'financial_v2_already_active';
  }
  return null;
};

const runControlledFinancialV2Activation = async ({
  get,
  set,
  workspaceNamespace,
  ledgerNamespace,
  syncUserId,
  deviceId,
} = {}) => {
  const current = get();
  if (!current.user || current.user.id !== syncUserId) {
    return { ok: false, reason: 'financial_v2_activation_session_changed' };
  }
  if (current.cfg.demoMode || !current.workspaceReady || !current.financialLedgerV7Cutover) {
    return { ok: false, reason: 'financial_v2_activation_not_eligible' };
  }

  const protocol = await readFinancialSyncProtocolV8({ namespace: ledgerNamespace });
  if (protocol?.requiresV2Recovery) {
    return {
      ok: false,
      reason: 'financial_v2_preactivation_production_cursor_recovery_required',
      v2RecoveryRequired: true,
      protocol,
    };
  }
  if (protocol?.activeProtocolVersion === 2) {
    // Never fall back to V1 after durable activation, even if evidence metadata
    // later needs repair. The active protocol is still V2 and failures are closed.
    return {
      ok: true,
      alreadyActive: true,
      protocol,
      sync: null,
    };
  }

  const failBeforeActivation = (reason, patch = {}) => {
    const message = String(reason || 'financial_v2_activation_failed_before_commit');
    set({
      financialSyncV2Activation: {
        status: 'failed_before_activation',
        workspaceNamespace,
        ledgerNamespace,
        error: message,
        checkedAt: new Date().toISOString(),
        ...patch,
      },
    });
    return { ok: false, reason: message, ...patch };
  };

  set({
    financialSyncV2Activation: {
      status: 'bootstrapping',
      workspaceNamespace,
      ledgerNamespace,
      startedAt: new Date().toISOString(),
      error: null,
    },
  });

  const bootstrap = await bootstrapFinancialLedgerV2({
    supabase,
    namespace: ledgerNamespace,
    deviceId,
  });
  if (!bootstrap?.ok) {
    return failBeforeActivation(
      bootstrap?.reason || 'financial_v2_bootstrap_failed',
      { bootstrap },
    );
  }

  const readback = bootstrap.readbackVerification;
  if (!readback?.ok
      || readback.ledgerId !== bootstrap.ledgerId
      || readback.restoreEpoch !== bootstrap.restoreEpoch
      || readback.bootstrapId !== bootstrap.bootstrapId
      || readback.manifestHash !== bootstrap.manifestHash
      || Number(readback.readBackRowCount) !== Number(bootstrap.expectedRowCount)) {
    return failBeforeActivation(
      readback?.reason || 'financial_v2_bootstrap_readback_not_verified',
      { bootstrap, readbackVerification: readback || null },
    );
  }

  if (get().user?.id !== syncUserId) {
    return failBeforeActivation(
      'financial_v2_activation_session_changed',
      { bootstrap, readbackVerification: readback },
    );
  }

  set(state => ({
    financialSyncV2Activation: {
      ...(state.financialSyncV2Activation || {}),
      status: 'validating_v2_shadow',
      bootstrapId: bootstrap.bootstrapId,
      manifestHash: bootstrap.manifestHash,
      expectedRowCount: bootstrap.expectedRowCount,
      readbackVerifiedAt: readback.verifiedAt,
      error: null,
    },
  }));

  // A previous attempt can leave a shadow cursor above commands it never
  // applied, and a 'conflict' inbox row that is checked before preflight and
  // never cleared anywhere -- together they lock every later attempt out. Start
  // this one from a clean validation slate. Its own guards make it a no-op on an
  // activated ledger or one already syncing production, so a refusal here simply
  // means there was nothing to reset and must never stop the activation.
  let shadowValidationReset = null;
  try {
    shadowValidationReset = await resetFinancialV2ShadowValidationStateV8({ namespace: ledgerNamespace });
  } catch (error) {
    shadowValidationReset = { ok: false, reason: String(error?.message || error) };
  }
  // Recorded on the activation state so a later diagnosis can tell an attempt
  // that started clean from one that inherited a previous attempt's leftovers.
  set(state => ({
    financialSyncV2Activation: {
      ...(state.financialSyncV2Activation || {}),
      shadowValidationReset,
    },
  }));

  // P19-013 separates a non-mutating shadow preflight from production apply.
  // Shadow mode may ACK local V2 outbox rows and observe complete cloud commands,
  // but it MUST NOT mutate the financial ledger or advance the production cursor.
  const shadowPasses = [];
  let validationSync = null;
  for (let pass = 1; pass <= 3; pass += 1) {
    const result = await syncFinancialMutationsV2({
      supabase,
      namespace: ledgerNamespace,
      deviceId,
      allowProductionApply: false,
    });
    shadowPasses.push({
      pass,
      ok: !!result?.ok,
      uploaded: Number(result?.uploaded || 0),
      downloaded: Number(result?.downloaded || 0),
      pendingAfterSync: Number(result?.pendingAfterSync || 0),
      cursor: Number(result?.cursor || 0),
      hasMore: result?.hasMore === true,
      reason: result?.reason || null,
    });

    if (!result?.ok) {
      return failBeforeActivation(
        result?.reason || 'financial_v2_shadow_validation_failed',
        {
          bootstrap,
          readbackVerification: readback,
          financialMutationSyncV2: result || null,
          shadowPasses,
        },
      );
    }

    const quiescent = Number(result.pendingAfterSync || 0) === 0
      && Number(result.uploaded || 0) === 0
      && Number(result.downloaded || 0) === 0
      && result.hasMore !== true;
    if (quiescent) {
      validationSync = result;
      break;
    }

    if (get().user?.id !== syncUserId) {
      return failBeforeActivation(
        'financial_v2_activation_session_changed',
        {
          bootstrap,
          readbackVerification: readback,
          financialMutationSyncV2: result,
          shadowPasses,
        },
      );
    }
  }

  if (!validationSync) {
    return failBeforeActivation(
      'financial_v2_activation_shadow_not_quiescent',
      {
        bootstrap,
        readbackVerification: readback,
        shadowPasses,
      },
    );
  }

  if (get().user?.id !== syncUserId) {
    return failBeforeActivation(
      'financial_v2_activation_session_changed',
      {
        bootstrap,
        readbackVerification: readback,
        financialMutationSyncV2: validationSync,
        shadowPasses,
      },
    );
  }

  const shadowValidatedAt = new Date().toISOString();
  set(state => ({
    financialSyncV2Activation: {
      ...(state.financialSyncV2Activation || {}),
      status: 'activating',
      shadowValidatedAt,
      validationCursor: Number(validationSync.cursor || 0),
      shadowPasses,
      error: null,
    },
  }));

  // Durable activation is the no-fallback barrier. P19-013 intentionally
  // commits this boundary BEFORE any production remote apply. If the process
  // crashes afterwards, the next launch sees protocol V2 and can only resume
  // through the V2 production cursor; it can never fall back to V1.
  const activated = await activateFinancialSyncProtocolV2V8({
    namespace: ledgerNamespace,
    bootstrapId: bootstrap.bootstrapId,
    manifestHash: bootstrap.manifestHash,
    readbackVerifiedAt: readback.verifiedAt,
    shadowValidatedAt,
    validationCursor: Number(validationSync.cursor || 0),
  });

  if (!activated?.ok || activated.activeProtocolVersion !== 2) {
    return failBeforeActivation(
      activated?.reason || 'financial_v2_activation_local_commit_failed',
      {
        bootstrap,
        readbackVerification: readback,
        financialMutationSyncV2: validationSync,
        shadowPasses,
        activated,
      },
    );
  }

  const failAfterActivation = (reason, patch = {}) => {
    const message = String(reason || 'financial_v2_production_apply_recovery_required');
    set({
      financialSyncProtocol: 2,
      financialMutationSyncProtocol: 2,
      financialSyncV2Activation: {
        status: 'active_recovery_required',
        workspaceNamespace,
        ledgerNamespace,
        ledgerId: activated.ledgerId,
        restoreEpoch: activated.restoreEpoch,
        bootstrapId: bootstrap.bootstrapId,
        manifestHash: bootstrap.manifestHash,
        readbackVerifiedAt: readback.verifiedAt,
        shadowValidatedAt,
        validationCursor: Number(validationSync.cursor || 0),
        activatedAt: activated.activatedAt,
        error: message,
        ...patch,
      },
    });
    return {
      ok: false,
      reason: message,
      v2RecoveryRequired: true,
      activated,
      bootstrap,
      readbackVerification: readback,
      shadowValidation: {
        ok: true,
        validatedAt: shadowValidatedAt,
        cursor: Number(validationSync.cursor || 0),
        passes: shadowPasses,
      },
      ...patch,
    };
  };

  set(state => ({
    financialSyncProtocol: 2,
    financialMutationSyncProtocol: 2,
    financialSyncV2Activation: {
      ...(state.financialSyncV2Activation || {}),
      status: 'applying_v2_production',
      activatedAt: activated.activatedAt,
      error: null,
    },
  }));

  // Re-read from the production cursor. Commands already observed in shadow
  // mode are deliberately downloaded again. Exact local cloud echoes are
  // no-op ACKs; true remote commands are CAS-preflighted and applied one whole
  // command per SQLite transaction together with inbox + production cursor.
  const productionPasses = [];
  let productionSync = null;
  for (let pass = 1; pass <= 3; pass += 1) {
    const result = await syncFinancialMutationsV2({
      supabase,
      namespace: ledgerNamespace,
      deviceId,
      allowProductionApply: true,
    });
    productionPasses.push({
      pass,
      ok: !!result?.ok,
      uploaded: Number(result?.uploaded || 0),
      downloaded: Number(result?.downloaded || 0),
      applied: Number(result?.applied || 0),
      pendingAfterSync: Number(result?.pendingAfterSync || 0),
      cursor: Number(result?.cursor || 0),
      hasMore: result?.hasMore === true,
      reason: result?.reason || null,
    });
    if (!result?.ok) {
      return failAfterActivation(
        result?.reason || 'financial_v2_production_apply_failed',
        { financialMutationSyncV2: result || null, productionPasses },
      );
    }
    const quiescent = Number(result.pendingAfterSync || 0) === 0
      && Number(result.uploaded || 0) === 0
      && Number(result.downloaded || 0) === 0
      && result.hasMore !== true;
    if (quiescent) {
      productionSync = result;
      break;
    }
    if (get().user?.id !== syncUserId) {
      return failAfterActivation(
        'financial_v2_activation_session_changed_after_commit',
        { financialMutationSyncV2: result, productionPasses },
      );
    }
  }

  if (!productionSync) {
    return failAfterActivation(
      'financial_v2_production_apply_not_quiescent',
      { productionPasses },
    );
  }

  set({
    financialSyncProtocol: 2,
    financialMutationSyncProtocol: 2,
    financialMutationSyncV2: productionSync,
    financialSyncV2Activation: {
      status: 'active',
      workspaceNamespace,
      ledgerNamespace,
      ledgerId: activated.ledgerId,
      restoreEpoch: activated.restoreEpoch,
      bootstrapId: bootstrap.bootstrapId,
      manifestHash: bootstrap.manifestHash,
      readbackVerifiedAt: readback.verifiedAt,
      shadowValidatedAt,
      validationCursor: Number(validationSync.cursor || 0),
      productionCursor: Number(productionSync.cursor || 0),
      activatedAt: activated.activatedAt,
      productionQuiescentAt: new Date().toISOString(),
      shadowPasses,
      productionPasses,
      error: null,
    },
  });

  console.info('[P19_FINAL_V2_ACTIVE]', JSON.stringify({
    ledgerId: activated.ledgerId,
    restoreEpoch: activated.restoreEpoch,
    bootstrapId: bootstrap.bootstrapId,
    protocol: 2,
    productionCursor: Number(productionSync.cursor || 0),
  }));

  return {
    ok: true,
    bootstrap,
    readbackVerification: readback,
    sync: productionSync,
    shadowValidation: {
      ok: true,
      validatedAt: shadowValidatedAt,
      cursor: Number(validationSync.cursor || 0),
      passes: shadowPasses,
    },
    productionCatchup: {
      ok: true,
      cursor: Number(productionSync.cursor || 0),
      passes: productionPasses,
    },
    activated,
    protocol: {
      ...activated,
      activeProtocolVersion: 2,
    },
  };

};

const rehydratePreparedV2ConflictRecovery = async ({ set, namespace, accountId, cfg }) => {
  const conflictRecoveryAccountId = String(accountId || '').trim();
  if (!conflictRecoveryAccountId) return null;
  try {
    const resumedConflictRecovery = await resumePreparedCloudConflictRecoveryV1({
      namespace: getLedgerNamespace(namespace, cfg || DEF_CFG),
      accountId: conflictRecoveryAccountId,
    });
    if (resumedConflictRecovery?.found) {
      set({
        restoreSafety: {
          status: resumedConflictRecovery?.ok ? 'financial_v2_conflict_recovery_ready' : 'financial_v2_conflict_recovery_blocked',
          operation: 'financial_v2_conflict_recovery', checkedAt: new Date().toISOString(),
          checkpointId: resumedConflictRecovery?.intent?.local?.checkpointId || null,
          reason: resumedConflictRecovery?.ok ? null : String(resumedConflictRecovery?.reason || 'resume_failed'),
          // This is the path a device actually reaches after an account switch
          // -- no button is pressed -- so the classification has to be attached
          // here too, not only in prepareV2ConflictRecovery. A real device sat
          // blocked on 2026-09-05 and the manual path it never ran was the only
          // one carrying this.
          ...(resumedConflictRecovery?.intentDiagnostics
            ? { intentDiagnostics: resumedConflictRecovery.intentDiagnostics }
            : {}),
        },
      });
    }
    return resumedConflictRecovery;
  } catch {}
  return null;
};

export const createSyncSlice = (set, get) => ({
  // P19-015A2: shared store-level maintenance owner. Requests become pending
  // synchronously, scheduled sync is cancelled, in-flight sync is drained,
  // and A1's SQLite writer queue is quiet before the critical section starts.
  runFinancialMaintenance: async (reason, task, options = {}) => {
    if (typeof task !== 'function') throw new Error('financial_maintenance_task_required');
    const normalizedReason = String(reason || 'financial_maintenance');
    if (scheduledSyncTimer) {
      clearTimeout(scheduledSyncTimer);
      scheduledSyncTimer = null;
    }
    // Bug 1 instrumentation. Cold start measured 1.6-3.2s inside this one call
    // ('session_login_transition'), 63% of the whole launch, and the same on an almost
    // empty account — so the cost is fixed overhead here, not the size of anyone's
    // ledger. What was not known is which half: waiting for the queues to go quiet, or
    // the work the task then does.
    //
    // Measured at this boundary rather than inside setUser, because setUser is long,
    // heavily branched, and is the startup ordering this project says produced its worst
    // bugs. Narrow here first, then go deeper only where the number points.
    //
    // Durations and the reason string only. Nothing here reads a balance, an id or a row.
    const clock = Date.now();
    const marks = { reason: normalizedReason };
    // Report once, whoever gets there first. A maintenance request that fails before
    // its task ever runs is the one most worth a number, and logging only from inside
    // the task would lose exactly that case — the same way the startup marks once
    // reported nothing for a launch that threw. A missing taskMs then says plainly
    // that the task never started.
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      marks.totalMs = Date.now() - clock;
      console.log('[MYFI:MAINTENANCE_TIMING]', JSON.stringify(marks));
    };

    try {
      return await runFinancialMaintenanceTask({
        reason: normalizedReason,
        presentation: options.presentation,
        beforeEnter: async () => {
          const enterStarted = Date.now();
          // Time spent before this callback runs is time queued behind another
          // maintenance operation, which is a different problem from a slow drain.
          marks.queueWaitMs = enterStarted - clock;
          if (options.insideSync !== true) await syncQueue.catch(() => false);
          const syncDrained = Date.now();
          marks.syncDrainMs = syncDrained - enterStarted;
          await flushLedgerWrites();
          await new Promise(resolve => setTimeout(resolve, 0));
          await flushLedgerWrites();
          marks.writerFlushMs = Date.now() - syncDrained;
        },
        afterExit: async () => {
          // A migration or cutover that ran nested inside this maintenance call
          // overrides an explicit resumeSync:false -- that flag means "routine
          // work, no reason to arm a sync", not "never arm one even if the task
          // turned out to change operational state." Ordinary calls with nothing
          // to report leave the signal unset and keep today's behavior exactly.
          const forcedReason = consumeMaintenanceResumeSignal();
          if (options.resumeSync === false && !forcedReason) return;
          const current = get();
          if (current.user && !current.cfg.demoMode && current.workspaceReady && current.dirty) {
            armScheduledCloudSync(get, forcedReason || options.resumeSyncReason || normalizedReason, 0);
          }
        },
      }, async (...args) => {
        const taskStarted = Date.now();
        try {
          return await task(...args);
        } finally {
          marks.taskMs = Date.now() - taskStarted;
          report();
        }
      });
    } finally {
      report();
    }
  },

  // Deliberate follow-up to "delete this device's data". It never runs as a
  // background login recovery: the user requested the local deletion, so they
  // explicitly choose when to bring their preserved cloud copy back.
  restoreLocalDataFromCloud: async () => {
    const initial = get();
    if (!initial.user || initial.cfg?.demoMode || !initial.workspaceReady) {
      return { ok: false, reason: 'local_recovery_signin_required' };
    }
    if (!initial.online || initial.syncing) {
      return { ok: false, reason: !initial.online ? 'local_recovery_offline' : 'local_recovery_sync_in_progress' };
    }
    const workspaceNamespace = initial.workspaceNamespace || workspaceNamespaceForSession({ user: initial.user });
    const marker = await readResetMarker(workspaceNamespace);
    if (marker?.localCloudRecoveryRequired !== true
        || String(marker?.localCloudRecoveryAccountId || '') !== String(initial.user.id)) {
      return { ok: false, reason: 'local_recovery_not_requested' };
    }
    const recovery = await get().runFinancialMaintenance(
      'manual_cloud_recovery_after_local_delete',
      () => runVerifiedEmptyShellCloudRecoveryV2({
        get,
        set,
        workspaceNamespace,
        ledgerNamespace: getLedgerNamespace(workspaceNamespace, get().cfg),
        syncUserId: initial.user.id,
        allowVerifiedBootstrapImport: true,
        onExclusiveTransition: promoteActiveFinancialMaintenancePresentation,
      }),
      { resumeSync: false },
    );
    if (!recovery?.ok || !recovery?.recovered) return recovery || { ok: false, reason: 'local_recovery_failed' };

    // Promotion deliberately leaves protocol activation to the normal, proven
    // sync path. The maintenance fence has now released and the local data was
    // reloaded, so this call can bootstrap/activate without inventing a second
    // recovery protocol.
    const synced = await get().syncCloud({ reason: 'manual_cloud_recovery_activation' });
    if (!synced) return { ok: false, reason: get().lastSyncError || 'local_recovery_activation_failed', recovery };
    return { ok: true, recovered: true, recovery };
  },

  // Revision conflict repair is explicitly user-driven. Preparation only
  // creates a local checkpoint and a verified cloud candidate; confirmation is
  // a later action after the user has read what will be replaced.
  prepareV2ConflictRecovery: async () => {
    const current = get();
    if (!current.user || current.cfg?.demoMode || !current.workspaceReady) {
      return { ok: false, reason: 'financial_v2_conflict_recovery_signin_required' };
    }
    const workspaceNamespace = current.workspaceNamespace || workspaceNamespaceForSession({ user: current.user });
    const namespace = getLedgerNamespace(workspaceNamespace, current.cfg);
    const resumed = await resumePreparedCloudConflictRecoveryV1({ namespace, accountId: current.user.id });
    if (resumed.found) {
      set({
        restoreSafety: {
          status: resumed?.ok ? 'financial_v2_conflict_recovery_ready' : 'financial_v2_conflict_recovery_blocked',
          operation: 'financial_v2_conflict_recovery', checkedAt: new Date().toISOString(),
          checkpointId: resumed?.intent?.local?.checkpointId || null, reason: resumed?.ok ? null : String(resumed?.reason || 'prepare_failed'),
          // Carries which of the five intent conditions failed, so a blocked
          // device classifies itself on the Diagnostics screen instead of
          // needing a round-trip. Shape-only (booleans/version/status), never
          // the intent's contents.
          ...(resumed?.intentDiagnostics ? { intentDiagnostics: resumed.intentDiagnostics } : {}),
        },
      });
      return resumed;
    }
    if (!current.online || current.syncing || String(current.lastSyncError || '') !== 'financial_v2_revision_conflict') {
      return { ok: false, reason: 'financial_v2_conflict_recovery_not_eligible' };
    }

    // The narrow repair comes first, because it is the one that fits the only
    // conflict seen in practice: a single stale workspace command the cloud has
    // moved past. It replaces nothing, so it cannot carry a frozen snapshot back
    // over a live device. Anything wider falls through to the verified
    // cloud-replacement path below, unchanged.
    const cloudWorkspaceRevision = cloudWorkspaceRevisionFromConflictsV1(current.financialV2Conflicts?.conflicts);
    if (cloudWorkspaceRevision > 0) {
      const narrow = await inspectStaleWorkspaceConflictV1({
        namespace, accountId: current.user.id, cloudWorkspaceRevision,
      });
      if (narrow?.ok) {
        set({
          restoreSafety: {
            status: 'financial_v2_conflict_recovery_ready',
            path: 'stale_workspace_discard',
            operation: 'financial_v2_conflict_recovery', checkedAt: new Date().toISOString(),
            checkpointId: null, reason: null,
            cloudWorkspaceRevision, staleCommandCount: narrow.commands.length,
          },
        });
        return { ok: true, path: 'stale_workspace_discard', ...narrow };
      }
    }

    const result = await get().runFinancialMaintenance(
      'financial_v2_conflict_recovery_prepare',
      () => prepareVerifiedCloudConflictRecoveryV1({ supabase, namespace, accountId: current.user.id }),
      { resumeSync: false, presentation: 'blocking' },
    );
    set({
      restoreSafety: {
        status: result?.ok ? 'financial_v2_conflict_recovery_ready' : 'financial_v2_conflict_recovery_blocked',
        operation: 'financial_v2_conflict_recovery', checkedAt: new Date().toISOString(),
        checkpointId: result?.intent?.local?.checkpointId || null, reason: result?.ok ? null : String(result?.reason || 'prepare_failed'),
      },
    });
    return result;
  },

  confirmV2ConflictRecovery: async () => {
    const current = get();
    if (!current.user || current.cfg?.demoMode || !current.workspaceReady) {
      return { ok: false, reason: 'financial_v2_conflict_recovery_signin_required' };
    }
    if (current.restoreSafety?.status !== 'financial_v2_conflict_recovery_ready') {
      return { ok: false, reason: 'financial_v2_conflict_recovery_confirmation_not_ready' };
    }
    const workspaceNamespace = current.workspaceNamespace || workspaceNamespaceForSession({ user: current.user });

    // The narrow repair prepared by the branch above. It discards the proven
    // stale command and then lets an ordinary sync bring the device forward --
    // there is no promotion, no checkpoint and no activation step, because
    // nothing was replaced.
    if (current.restoreSafety?.path === 'stale_workspace_discard') {
      const discarded = await get().runFinancialMaintenance(
        'financial_v2_stale_command_repair',
        () => discardStaleWorkspaceCommandsV1({
          namespace: getLedgerNamespace(workspaceNamespace, get().cfg),
          accountId: current.user.id,
          cloudWorkspaceRevision: Number(current.restoreSafety?.cloudWorkspaceRevision || 0),
          confirmed: true,
        }),
        { resumeSync: false, presentation: 'blocking' },
      );
      if (!discarded?.ok) {
        console.warn('[V2_STALE_COMMAND_REPAIR_REJECTED]', JSON.stringify(discarded));
        set({ restoreSafety: { status: 'financial_v2_conflict_recovery_blocked', operation: 'financial_v2_conflict_recovery', checkedAt: new Date().toISOString(), reason: String(discarded?.reason || 'stale_command_repair_failed') } });
        return discarded;
      }
      set({ lastSyncError: null, financialV2Conflicts: null, restoreSafety: null });
      const synced = await get().syncCloud({ reason: 'financial_v2_stale_command_repair' });
      return {
        ...discarded, path: 'stale_workspace_discard', synced: !!synced,
        ...(synced ? {} : { pending: true, reason: get().lastSyncError || 'stale_command_repair_sync_pending' }),
      };
    }

    const result = await get().runFinancialMaintenance(
      'financial_v2_conflict_recovery_confirm',
      () => confirmPreparedCloudConflictRecoveryV1({
        supabase, namespace: getLedgerNamespace(workspaceNamespace, get().cfg), accountId: current.user.id, confirmed: true,
      }),
      { resumeSync: false, presentation: 'blocking' },
    );
    if (!result?.ok) {
      console.warn('[V2_CONFLICT_CONFIRM_REJECTED]', JSON.stringify(result));
      set({ restoreSafety: { status: 'financial_v2_conflict_recovery_blocked', operation: 'financial_v2_conflict_recovery', checkedAt: new Date().toISOString(), reason: String(result?.reason || 'promotion_failed') } });
      return result;
    }
    // The atomic local promotion deliberately leaves activation to the existing
    // V2 activation path. Reload the verified local projection first, then let
    // that single path record its own evidence and production cursor.
    await get().loadLocal(workspaceNamespace, { allowLegacy: false, maintenanceOwned: true });
    const activation = await get().activateFinancialSyncV2();
    if (!activation?.ok) {
      console.warn('[V2_CONFLICT_ACTIVATION_FAILED]', JSON.stringify(activation));
      set({ lastSyncError: activation?.reason || 'financial_v2_conflict_recovery_activation_required', restoreSafety: { status: 'financial_v2_conflict_recovery_activation_required', operation: 'financial_v2_conflict_recovery', checkedAt: new Date().toISOString() } });
      return { ...result, ok: false, pending: true, reason: activation?.reason || 'financial_v2_conflict_recovery_activation_required' };
    }
    set({ lastSyncError: null, restoreSafety: { status: 'financial_v2_conflict_recovery_complete', operation: 'financial_v2_conflict_recovery', checkedAt: new Date().toISOString() } });
    return { ...result, activated: true };
  },

  // Phase 13 Stage D — the other old reader, and the one that needed no gate.
  // It reads the dead normalized tables (`workspaces` and friends), but nothing
  // in the app calls it and the flag it needs is off unless
  // EXPO_PUBLIC_NORMALIZED_READ_MODE is set to preview/shadow, which no build
  // profile does. Two locks already, so it stays as-is; removing it is Stage E,
  // together with the tables it reads.
  previewNormalizedCloud: async ({ baseline } = {}) => {
    const current = get();
    if (!normalizedPreviewEnabled) return { ok: false, reason: 'disabled' };
    if (!current.user) return { ok: false, reason: 'signed_out' };
    set({ normalizedPreviewing: true, normalizedPreviewError: null });
    try {
      const snapshot = await loadNormalizedSnapshot({
        client: supabase,
        userId: current.user.id,
        fallbackCfg: current.cfg,
        notif: current.notif,
      });
      const comparison = compareSnapshots(baseline || snapshotFromState(get()), snapshot);
      const preview = {
        workspaceId: snapshot.normalized.workspaceId,
        checkedAt: new Date().toISOString(),
        comparison,
      };
      set({ normalizedPreview: preview, normalizedPreviewError: null });
      return { ok: true, ...preview };
    } catch (error) {
      const message = String(error?.message || 'normalized_preview_failed');
      set({ normalizedPreviewError: message });
      return { ok: false, reason: message };
    } finally {
      set({ normalizedPreviewing: false });
    }
  },

  disconnectCloudSession: async () => {
    if (FRESH_TEST_MODE) {
      await get().setUser(null);
      return { ok: true, namespace: get().workspaceNamespace || FRESH_TEST_NAMESPACE };
    }

    const current = get();
    const context = await readActiveLocalLedgerContext();
    const namespace = String(current.workspaceNamespace || context.namespace || GUEST_NAMESPACE).trim() || GUEST_NAMESPACE;
    const linkedUserId = String(
      current.user?.id
      || (context.namespace === namespace ? context.linkedUserId : '')
      || accountIdFromWorkspaceNamespace(namespace)
      || '',
    ).trim() || null;
    const identity = {
      ...(context.namespace === namespace ? context.identity : {}),
      ...localIdentityFromState(current),
    };

    try {
      if (current.workspaceReady && !current.cfg.demoMode) {
        await get().saveLocal({ dirty: current.dirty, force: true });
      }
      await writeActiveLocalLedgerContext({ namespace, linkedUserId, identity });
    } catch (error) {
      const reason = String(error?.message || 'local_logout_preservation_failed');
      set({ lastSyncError: reason });
      return { ok: false, reason, namespace };
    }

    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (error) {
      const reason = String(error?.message || 'cloud_signout_failed');
      set({ lastSyncError: reason });
      return { ok: false, reason, namespace };
    }

    await get().setUser(null);
    return { ok: true, namespace, linkedUserId };
  },

  setUser: async (user, options = {}) => {
    const {
      preserveWorkspaceOnLogout = true,
      switchToGuest = false,
      maintenanceOwned = false,
      deferProfileHydration = false,
    } = options || {};
    // P19-015A2: serialize every auth/account workspace transition with local
    // loading, migration, recovery and cutover.
    if (!maintenanceOwned) {
      const reason = user
        ? 'session_login_transition'
        : switchToGuest ? 'session_guest_transition' : 'session_logout_transition';
      return get().runFinancialMaintenance(
        reason,
        () => get().setUser(user, { ...(options || {}), maintenanceOwned: true }),
        // Session resume/account loading is ordinary local work. If it discovers
        // a migration or cutover, loadLocal promotes this same fence explicitly.
        { resumeSync: false, presentation: 'silent' },
      );
    }
    if (FRESH_TEST_MODE) {
      set({
        user: user || null,
        workspaceNamespace: FRESH_TEST_NAMESPACE,
        workspaceReady: true,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        syncing: false,
        syncConflict: null,
        lastSyncError: null,
      });
      return { ok: true, namespace: FRESH_TEST_NAMESPACE };
    }

    const current = get();
    const context = await readActiveLocalLedgerContext();
    const currentNamespace = String(current.workspaceNamespace || context.namespace || GUEST_NAMESPACE).trim() || GUEST_NAMESPACE;
    const currentLinkedUserId = String(
      current.user?.id
      || (context.namespace === currentNamespace ? context.linkedUserId : '')
      || accountIdFromWorkspaceNamespace(currentNamespace)
      || '',
    ).trim() || null;
    const nextUserId = String(user?.id || '').trim() || null;
    const currentIdentity = {
      ...(context.namespace === currentNamespace ? context.identity : {}),
      ...localIdentityFromState(current),
    };
    const transition = resolveWorkspaceTransition({
      currentNamespace,
      currentLinkedUserId,
      nextUserId,
      switchToGuest,
    });

    // Ordinary logout is a cloud-session transition only. This branch is
    // intentionally idempotent so a Supabase SIGNED_OUT event and the explicit
    // Settings action cannot race the app into Guest or another ledger.
    if (!user && !switchToGuest) {
      if (current.workspaceReady && !current.cfg.demoMode) {
        await get().saveLocal({ dirty: current.dirty, force: true });
      }
      await writeActiveLocalLedgerContext({
        namespace: transition.namespace,
        linkedUserId: transition.linkedUserId,
        identity: currentIdentity,
      });
      set(state => ({
        user: null,
        cfg: normalizeCfg({ ...state.cfg, ...currentIdentity }),
        workspaceNamespace: transition.namespace,
        workspaceReady: true,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        syncing: false,
        syncConflict: null,
        lastSyncError: null,
      }));
      return {
        ok: true,
        preserveWorkspaceOnLogout: preserveWorkspaceOnLogout !== false,
        namespace: transition.namespace,
        linkedUserId: transition.linkedUserId,
      };
    }

    if (switchToGuest) {
      set({
        user: null,
        workspaceReady: false,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        syncing: false,
        syncConflict: null,
        lastSyncError: null,
      });
      await get().loadLocal(GUEST_NAMESPACE, { allowLegacy: false, maintenanceOwned: true }); // P19-015A2 guest transition
      await writeActiveLocalLedgerContext({
        namespace: GUEST_NAMESPACE,
        linkedUserId: null,
        identity: localIdentityFromState(get()),
      });
      return { ok: true, namespace: GUEST_NAMESPACE, switchedToGuest: true };
    }

    const priorIdentity = currentLinkedUserId && currentLinkedUserId !== nextUserId
      ? {}
      : currentIdentity;

    const hydrateProfile = async (fallbackIdentity = {}) => {
      try {
        const profile = await ensureProfileIdentity(supabase, user, fallbackIdentity);
        // A delayed network profile response must never overwrite a subsequent
        // sign-out or account switch. Local identity already rendered first.
        if (get().user?.id !== nextUserId) return;
        if (profile?.patch && Object.keys(profile.patch).length) {
          set({ cfg: normalizeCfg({ ...get().cfg, ...profile.patch }) });
          await get().saveLocal({ dirty: false, force: true });
        }
      } catch (error) {
        console.warn('[STORE] profile hydrate', error);
      }
      if (get().user?.id !== nextUserId) return;
      await writeActiveLocalLedgerContext({
        namespace: get().workspaceNamespace || transition.namespace,
        linkedUserId: nextUserId,
        identity: localIdentityFromState(get()),
      });
    };

    const hydrateProfileWhenSafe = async fallbackIdentity => {
      if (!deferProfileHydration) return hydrateProfile(fallbackIdentity);
      // Startup first paint must depend on the durable local ledger, not the
      // optional cloud profile round trip. It refreshes after the UI is ready.
      Promise.resolve(hydrateProfile(fallbackIdentity)).catch(error => {
        console.warn('[STORE] deferred profile hydrate', error);
      });
      return undefined;
    };

    // Re-login to the account already linked to the mounted ledger. Do not
    // unload/reload it and do not inspect Guest data: signed-out activity was
    // activity on this same ledger, not foreign Guest data.
    if (transition.preserveCurrent && transition.namespace === currentNamespace && current.workspaceReady) {
      set({
        user,
        workspaceNamespace: currentNamespace,
        workspaceReady: true,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        syncing: false,
        syncConflict: null,
        lastSyncError: null,
      });
      await rehydratePreparedV2ConflictRecovery({
        set,
        namespace: currentNamespace,
        accountId: user.id,
        cfg: get().cfg || DEF_CFG,
      });
      await writeActiveLocalLedgerContext({
        namespace: currentNamespace,
        linkedUserId: nextUserId,
        identity: priorIdentity,
      });
      await hydrateProfileWhenSafe(priorIdentity);
      return { ok: true, namespace: currentNamespace, reusedActiveLedger: true };
    }

    if (current.user && current.workspaceReady && current.dirty && !current.cfg.demoMode) {
      await get().saveLocal({ dirty: true, force: true });
    }

    set({
      user,
      workspaceReady: false,
      pendingGuestTransfer: false,
      syncing: false,
      syncConflict: null,
      lastSyncError: null,
      guestTransferPreview: null,
    });
    await get().loadLocal(transition.namespace, { allowLegacy: false, maintenanceOwned: true }); // P19-015A2 account transition
    await writeActiveLocalLedgerContext({
      namespace: transition.namespace,
      linkedUserId: nextUserId,
      identity: localIdentityFromState(get()),
    });

    const loadedIdentity = localIdentityFromState(get());
    await hydrateProfileWhenSafe({ ...priorIdentity, ...loadedIdentity });

    if (transition.shouldOfferGuestTransfer) {
      const guest = await readCanonicalWorkspaceState({
        workspaceNamespace: GUEST_NAMESPACE,
        fallbackState: get(),
      });
      const guestPreview = buildGuestTransferPreview(get(), guest.snapshot);
      set({
        pendingGuestTransfer: guestPreview.hasData,
        guestTransferPreview: guestPreview.hasData ? guestPreview : null,
      });
    } else {
      set({ pendingGuestTransfer: false, guestTransferPreview: null });
    }

    return {
      ok: true,
      namespace: transition.namespace,
      accountSwitch: transition.accountSwitch,
      guestTransferOffered: transition.shouldOfferGuestTransfer,
    };
  },
  setOnline: (v)    => set({ online: v }),

  activateFinancialV7Cutover: async (options = {}) => {
    // P19-015A2: canonical cutover is a maintenance operation.
    if (!options?.maintenanceOwned) {
      return get().runFinancialMaintenance(
        'canonical_cutover',
        () => get().activateFinancialV7Cutover({ maintenanceOwned: true }),
        { resumeSync: false },
      );
    }
    const current = get();
    if (!R04_OPERATIONAL_CUTOVER_ENABLED || current.cfg.demoMode || !activeLedgerSupported()) {
      return { supported: false, ok: false, cutover: false, reason: 'cutover_disabled' };
    }
    const namespace = current.workspaceNamespace || GUEST_NAMESPACE;
    const ledgerNamespace = getLedgerNamespace(namespace, current.cfg);
    try {
      // Verified local checkpoint before promotion. After cutover the Vault is a
      // compatibility/recovery checkpoint only; it is no longer authoritative.
      await get().saveLocal({ dirty: current.dirty, force: true });
      const checkpoint = await readVaultSnapshot(namespace);
      const checkpointState = checkpoint?.snapshot ? stateFromSnapshot(checkpoint.snapshot, current.cfg) : null;
      if (!checkpointState || !sameWorkspaceData(current, checkpointState)) {
        return { supported: true, ok: false, cutover: false, reason: 'cutover_checkpoint_verification_failed' };
      }
      const coldArchives = await exportColdArchives(getColdArchiveNamespace(namespace, current.cfg));
      const result = await runFinancialOperationalCutoverV7({
        namespace: ledgerNamespace,
        workspace: current,
        coldArchives,
      });
      if (!result?.ok || !result?.cutover) {
        set({ financialLedgerV7Cutover: false, ledgerError: String(result?.reason || 'financial_v7_cutover_failed') });
        return result;
      }
      const promotedWorkspace = await readFinancialWorkspaceV7({
        namespace: ledgerNamespace,
        includeArchived: false,
        transactionLimit: 2000,
      });
      const boundedState = promotedWorkspace ? stateFromFinancialV7(promotedWorkspace, current.cfg) : null;
      set(state => ({
        ...(boundedState || {}),
        user: state.user,
        workspaceNamespace: namespace,
        workspaceReady: true,
        financialLedgerV7Ready: true,
        financialLedgerV7Cutover: true,
        financialLedgerV7Checksum: result.checksum || result.sourceChecksum || current.financialLedgerV7Checksum || null,
        financialLedgerV7Migration: {
          ...(current.financialLedgerV7Migration || {}),
          ok: true, cutover: true, sourceMode: 'sqlite', cutoverAt: result.cutoverAt || new Date().toISOString(),
        },
        ledgerReady: true,
        ledgerError: null,
      }));
      await writeActiveLocalLedgerNamespace(namespace);
      // §92: cutover just switched this device onto the V2 mutation-sync
      // protocol -- resume the same way restore already does, whether this
      // ran standalone or nested inside loadLocal's auto-cutover branch.
      requestMaintenanceResumeSync('canonical_cutover_resume');
      return result;
    } catch (error) {
      const reason = String(error?.message || 'financial_v7_cutover_failed');
      set({ financialLedgerV7Cutover: false, ledgerError: reason });
      return { supported: true, ok: false, cutover: false, reason };
    }
  },

  refreshDataHealth: async () => {
    if (!activeLedgerSupported()) {
      const result = { ok: false, supported: false, issues: ['sqlite_unavailable'] };
      set({ dataHealth: result });
      return result;
    }
    try {
      const current = get();
      const namespace = getLedgerNamespace(current.workspaceNamespace || GUEST_NAMESPACE, current.cfg);
      if (current.financialLedgerV7Cutover) {
        const proof = await proveFinancialLedgerInvariantsV7({ namespace });
        const result = {
          ok: !!proof?.ok,
          supported: proof?.supported !== false,
          level: proof?.ok ? 'HEALTHY' : 'BLOCKING',
          issues: proof?.issues || [],
          source: 'sqlite_v7',
        };
        set({ dataHealth: result, ledgerError: result.ok ? null : 'financial_v7_health_blocking' });
        return result;
      }
      await flushLedgerMirror();
      const result = await getLedgerDataHealth({
        namespace,
        walletIds: (current.wallets || []).map(item => item.id),
        expectedActiveCount: Array.isArray(current.trans) ? current.trans.length : null,
      });
      set({ dataHealth: result, ledgerError: null });
      return result;
    } catch (error) {
      const result = { ok: false, supported: true, issues: ['health_check_failed'] };
      set({ dataHealth: result, ledgerError: String(error?.message || error || 'health_check_failed') });
      return result;
    }
  },

  activateFinancialSyncV2: async () => {
    if (FRESH_TEST_MODE) return { ok: false, reason: 'fresh_test_disabled' };
    // P19-015A2: protocol activation must not start during maintenance.
    if (isFinancialMaintenanceBlocked()) return { ok: false, reason: 'financial_maintenance_active' };
    const queued = syncQueue.then(async () => {
      if (isFinancialMaintenanceBlocked()) return { ok: false, reason: 'financial_maintenance_active' };
      const current = get();
      if (!current.user || current.cfg.demoMode || !current.workspaceReady || !current.financialLedgerV7Cutover) {
        return { ok: false, reason: 'financial_v2_activation_not_eligible' };
      }
      const syncUserId = current.user.id;
      const workspaceNamespace = current.workspaceNamespace || workspaceNamespaceForSession({ user: current.user });
      const ledgerNamespace = getLedgerNamespace(workspaceNamespace, current.cfg);
      const deviceId = await getOrCreateDeviceId();
      return runControlledFinancialV2Activation({
        get, set, workspaceNamespace, ledgerNamespace, syncUserId, deviceId,
      });
    });
    syncQueue = queued.catch(() => false);
    return queued;
  },

  scheduleCloudSync: (reason = 'local_change') => {
    scheduledSyncAttempt = 0;
    return armScheduledCloudSync(get, reason, 0);
  },

  acquireAutomaticSyncInteractionHold: (reason = 'financial_editor') => {
    const token = acquireAutomaticSyncInteractionHold(reason);
    if (scheduledSyncTimer) {
      clearTimeout(scheduledSyncTimer);
      scheduledSyncTimer = null;
    }
    return token;
  },

  releaseAutomaticSyncInteractionHold: token => {
    const released = releaseAutomaticSyncInteractionHold(token);
    if (!released || isAutomaticSyncInteractionHeld()) return released;
    const current = get();
    if (current.user && !current.cfg.demoMode && current.workspaceReady && current.dirty) {
      armScheduledCloudSync(get, 'editor_closed', 0);
    }
    return released;
  },

  loadLocal: async (requestedNamespace = null, options = {}) => {
    // P19-015A2: local load owns schema/cutover maintenance unless an outer
    // account/restore operation already owns the same barrier.
    if (!options?.maintenanceOwned) {
      return get().runFinancialMaintenance(
        requestedNamespace ? 'local_load' : 'startup_local_load',
        () => get().loadLocal(requestedNamespace, { ...(options || {}), maintenanceOwned: true }),
        // Fast V8 reads must not cover the mounted app with a maintenance screen.
        // A real migration/cutover promotes this active fence below.
        { resumeSync: false, presentation: 'silent' },
      );
    }
    const namespace = requestedNamespace || await readActiveLocalLedgerNamespace();
    const allowLegacy = Object.prototype.hasOwnProperty.call(options || {}, 'allowLegacy')
      ? !!options.allowLegacy
      : namespace === GUEST_NAMESPACE;
    try {
      const resetMarker = await readResetMarker(namespace);
      // A signed-in user may close the app between removing this device's
      // local copy and choosing "Restore from cloud". Rehydrate the durable
      // intent before reading the empty shell so Settings can always offer
      // the explicit recovery action after a restart.
      const pendingLocalCloudRecovery = resetMarker?.localCloudRecoveryRequired === true
        && String(resetMarker?.localCloudRecoveryAccountId || '') === String(get().user?.id || '');
      if (pendingLocalCloudRecovery) {
        set({
          financialCloudRecoveryV2: {
            status: 'local_data_deleted_pending_recovery',
            workspaceNamespace: namespace,
            error: null,
          },
        });
      }
      await rehydratePreparedV2ConflictRecovery({
        set,
        namespace,
        accountId: get().user?.id,
        cfg: get().cfg || DEF_CFG,
      });
      const demoSnapshot = resetMarker?.legacyRecoveryDisabled
        ? null
        : await readPerformanceSnapshot(namespace);
      const demoCfg = demoSnapshot?.cfg || demoSnapshot?.data?.cfg || {};
      if (demoSnapshot && demoCfg.demoMode === true && demoCfg.performanceTestMode === true) {
        const loadedDemo = stateFromSnapshot(demoSnapshot, get().cfg || DEF_CFG);
        set({
          ...loadedDemo,
          workspaceNamespace: namespace,
          workspaceReady: true,
          pendingGuestTransfer: false,
          guestTransferPreview: null,
          syncConflict: null,
          lastSyncError: null,
          vaultUnreadable: false,
          vaultError: null,
          vaultRecovery: null,
        });
        if (activeLedgerSupported()) {
          try {
            const ledgerNamespace = getLedgerNamespace(namespace, loadedDemo.cfg);
            await clearFinancialWorkspaceV7({ namespace: ledgerNamespace });
            await replaceLedgerSnapshot({
              namespace: ledgerNamespace,
              transactions: loadedDemo.trans,
              wallets: loadedDemo.wallets,
              baseCurrency: loadedDemo.cfg?.currency || 'IQD',
            });
            const health = await getLedgerDataHealth({
              namespace: ledgerNamespace,
              walletIds: loadedDemo.wallets.map(item => item.id),
              expectedActiveCount: loadedDemo.trans.length,
            });
            set({ ledgerReady: true, ledgerError: null, dataHealth: health });
          } catch (ledgerError) {
            console.warn('[LEDGER] performance bootstrap', ledgerError);
            set({ ledgerReady: false, ledgerError: String(ledgerError?.message || ledgerError) });
          }
        }
        await writeActiveLocalLedgerNamespace(namespace);
        return true;
      }

      if (activeLedgerSupported()) {
        const v7Namespace = getLedgerNamespace(namespace, get().cfg || DEF_CFG);
        const v7State = await getFinancialWorkspaceStateV7({ namespace: v7Namespace });
        if (v7State?.source_mode === 'sqlite') {
          const v7Workspace = await readFinancialWorkspaceV7({ namespace: v7Namespace, includeArchived: false, transactionLimit: 2000 });
          if (!v7Workspace) throw new Error('financial_v7_cutover_read_failed');
          const loadedV7 = stateFromFinancialV7(v7Workspace, get().cfg || DEF_CFG);
          set({
            ...loadedV7,
            workspaceNamespace: namespace,
            workspaceReady: true,
            pendingGuestTransfer: false,
            guestTransferPreview: null,
            syncConflict: null,
            lastSyncError: null,
            vaultUnreadable: false,
            vaultError: null,
            vaultRecovery: null,
            ledgerReady: true,
            financialLedgerV7Ready: true,
            financialLedgerV7Cutover: true,
            financialLedgerV7Checksum: v7State.shadow_checksum || null,
            ledgerError: null,
          });
          // Phase 8: once V7 is operational, the legacy relational mirror is
          // frozen. Screens query V7 directly through the repository adapter.
          await writeActiveLocalLedgerNamespace(namespace);
          return true;
        }
      }

      let { snapshot, recovered, backupIndex } = await readVaultSnapshot(namespace);
      const allowLegacyRecovery = allowLegacy && !resetMarker?.legacyRecoveryDisabled;

      if (allowLegacyRecovery && (!snapshot || financialDataCount(snapshot.data || snapshot) === 0)) {
        const legacySnapshot = await findLegacySnapshot();
        if (legacySnapshot && financialDataCount(legacySnapshot.data || legacySnapshot) > 0) {
          snapshot = legacySnapshot;
          recovered = true;
          await writeVaultSnapshot(namespace, snapshot, { force: true });
        }
      }

      const loaded = stateFromSnapshot(snapshot || {
        data: {},
        cfg: get().cfg || DEF_CFG,
        cats: get().cats || DEF_CATS,
        notif: get().notif || DEF_NOTIF,
        dirty: false,
        cloudRevision: 0,
      });
      set({
        ...loaded,
        workspaceNamespace: namespace,
        workspaceReady: true,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        syncConflict: null,
        vaultUnreadable: false,
        vaultError: null,
        vaultRecovery: recovered
          ? { backupIndex: Number(backupIndex || 0), recoveredAt: new Date().toISOString() }
          : null,
        ...(recovered ? { lastSyncError: 'local_snapshot_recovered' } : {}),
      });
      if (activeLedgerSupported()) {
        try {
          const ledgerNamespace = getLedgerNamespace(namespace, loaded.cfg);
          const coldArchives = await exportColdArchives(getColdArchiveNamespace(namespace, loaded.cfg));
          // The existing V8 early-return above handles normal startup. Reaching
          // the legacy/shadow path means SQLite may be migrated or promoted now.
          promoteActiveFinancialMaintenancePresentation();
          const migration = await runFinancialShadowMigrationV7({
            namespace: ledgerNamespace,
            workspace: loaded,
            coldArchives,
          });
          if (migration.supported && !migration.ok) {
            set({
              financialLedgerV7Ready: false,
              financialLedgerV7Cutover: false,
              financialLedgerV7Migration: migration,
              ledgerError: String(migration.reason || 'financial_v7_shadow_parity_failed'),
            });
          } else if (migration.ok) {
            set({
              financialLedgerV7Ready: true,
              financialLedgerV7Cutover: migration.sourceMode === 'sqlite' && migration.migrationReady !== true,
              financialLedgerV7Checksum: migration.checksum || null,
              financialLedgerV7Migration: migration,
            });
            // §92: `alreadyCutover` is the routine fast path every load takes
            // once cut over -- nothing changed, no reason to arm a sync. A real
            // migration this call (first shadow build/verify, or a forced
            // re-verify) did change operational state and must resume sync the
            // same way restore already does, once this barrier fully exits.
            if (!migration.alreadyCutover) requestMaintenanceResumeSync('financial_v7_schema_migration_resume');
          }
          await replaceLedgerSnapshot({
            namespace: ledgerNamespace,
            transactions: loaded.trans,
            wallets: loaded.wallets,
            baseCurrency: loaded.cfg?.currency || 'IQD',
          });
          const health = await getLedgerDataHealth({
            namespace: ledgerNamespace,
            walletIds: loaded.wallets.map(item => item.id),
            expectedActiveCount: loaded.trans.length,
          });
          set(state => ({
            ledgerReady: true,
            ledgerError: state.financialLedgerV7Migration?.ok === false ? state.ledgerError : null,
            dataHealth: health,
          }));
          if (R04_OPERATIONAL_CUTOVER_ENABLED && migration?.ok && migration?.migrationReady === true) {
            // P19-015A2 auto-cutover reuses outer maintenance.
            await get().activateFinancialV7Cutover({ maintenanceOwned: true });
          }
        } catch (ledgerError) {
          console.warn('[LEDGER] bootstrap', ledgerError);
          set({ ledgerReady: false, ledgerError: String(ledgerError?.message || ledgerError) });
        }
      } else {
        set({ ledgerReady: false, ledgerError: null, dataHealth: { ok: true, supported: false, issues: [] } });
      }
      await writeActiveLocalLedgerNamespace(namespace);
      return !!snapshot;
    } catch (e) {
      console.error('[STORE] loadLocal', e);
      set({
        workspaceNamespace: namespace,
        workspaceReady: true,
        lastSyncError: 'vault_unreadable',
        vaultUnreadable: true,
        vaultError: String(e?.message || 'local_load_failed'),
        vaultRecovery: null,
        ledgerReady: false,
      });
      return false;
    }
  },

  retryLoadLocal: async () => {
    const namespace = get().workspaceNamespace || GUEST_NAMESPACE;
    const success = await get().loadLocal(namespace, { allowLegacy: false });
    if (!success) set({ lastSyncError: 'vault_unreadable', vaultUnreadable: true });
    return success;
  },

  clearAndResetVault: async (options = {}) => {
    // P19-015A2: vault reset is a maintenance operation.
    if (!options?.maintenanceOwned) {
      return get().runFinancialMaintenance(
        'vault_reset',
        () => get().clearAndResetVault({ maintenanceOwned: true }),
        { resumeSync: false },
      );
    }
    const namespace = get().workspaceNamespace || GUEST_NAMESPACE;
    try {
      await clearVaultSnapshot(namespace);
      await get().loadLocal(namespace, { allowLegacy: false, maintenanceOwned: true }); // P19-015A2 vault reset
      set({ vaultUnreadable: false, lastSyncError: null, vaultError: null, vaultRecovery: null });
      return true;
    } catch (e) {
      console.error('[STORE] clearAndResetVault', e);
      set({ lastSyncError: String(e?.message || 'reset_failed') });
      return false;
    }
  },

  saveLocal: async ({ dirty = true, force = false, localOnly = false } = {}) => {
    const current = get();
    const updatedAt = new Date().toISOString();
    const nextDirty = dirty ? true : current.dirty;
    if (current.cfg.demoMode) {
      // Performance fixtures are isolated, deterministic test data. Their UI
      // mutations should be immediate; coalesce the expensive full fixture
      // persistence instead of deduping and rewriting 5k-100k rows per tap.
      const demoSnapshot = snapshotFromState({ ...current, localUpdatedAt: updatedAt, dirty: nextDirty }, { updatedAt, dirty: nextDirty });
      schedulePerformanceSnapshotWrite(demoSnapshot, {
        namespace: current.workspaceNamespace || GUEST_NAMESPACE,
        tier: String(current.cfg?.performanceTestTier || ''),
      });
      set({
        localUpdatedAt: updatedAt,
        dirty: nextDirty,
      });
      return;
    }
    const next = { ...current, localUpdatedAt: updatedAt, dirty: nextDirty };
    const clean = dedupeWorkspaceData(next);
    const postCutover = !!(activeLedgerSupported() && current.financialLedgerV7Cutover);
    if (postCutover) {
      // Phase 8 invariant: Zustand contains only a bounded query cache after
      // operational cutover. Never reconcile that cache as a complete ledger
      // snapshot, otherwise older SQLite transactions could be mistaken for
      // deletions. Persist only the small workspace/config entity here; every
      // financial command/entity mutation commits to V7 at its own boundary.
      const ledgerNamespace = getLedgerNamespace(current.workspaceNamespace, clean.cfg);
      if (!localOnly) {
        const committed = await commitEntityChangesV7({
          namespace: ledgerNamespace,
          changes: [{
            entityType: 'workspace',
            id: 'workspace',
            payload: {
              cfg: canonicalWorkspaceCfg(clean.cfg),
              cloudRevision: Number(clean.cloudRevision || 0),
            },
          }],
        });
        if (committed.supported && !committed.ok) {
          throw new Error(committed.reason || 'financial_v7_workspace_metadata_commit_failed');
        }
      }
      const preferencesPersisted = await persistFinancialLocalPreferencesV7({
        namespace: ledgerNamespace, cfg: clean.cfg, notif: clean.notif,
      });
      if (!preferencesPersisted) throw new Error('financial_v7_local_preferences_persist_failed');
      if (force && financialDataCount(clean) === 0) {
        await writeResetMarker(current.workspaceNamespace, { pendingCloudSync: !!current.user });
      }
      // The pre-cutover encrypted Vault remains a recovery checkpoint. A
      // bounded cache must never overwrite it as if it were a full financial
      // snapshot. Full snapshots are produced from SQLite only at explicit
      // sync/account-lifecycle/backup boundaries.
    } else {
      if (activeLedgerSupported()) {
        const reconciled = await reconcileFinancialWorkspaceV7({
          namespace: getLedgerNamespace(current.workspaceNamespace, clean.cfg),
          workspace: clean,
        });
        if (reconciled.supported && !reconciled.ok) throw new Error(reconciled.reason || 'financial_v7_workspace_reconcile_failed');
        await flushLedgerMirror();
      }
      await writeVaultSnapshot(current.workspaceNamespace, snapshotFromState(clean), { force });
      if (force && financialDataCount(clean) === 0) {
        await writeResetMarker(current.workspaceNamespace, { pendingCloudSync: !!current.user });
      }
    }
    set({
      trans: clean.trans,
      debts: clean.debts,
      goals: clean.goals,
      wallets: clean.wallets,
      commitments: clean.commitments,
      trackerTypes: clean.trackerTypes,
      trackerItems: clean.trackerItems,
      cats: clean.cats,
      cfg: clean.cfg,
      localUpdatedAt: updatedAt,
      dirty: nextDirty,
    });
  },

  // Account deletion must never destroy the financial workspace that is
  // already stored on this device. Preserve and verify a local-only copy
  // before the cloud delete is allowed to start.
  prepareLocalWorkspaceForAccountDeletion: async () => {
    let current = get();
    if (!current.user) return { ok: true, accountNamespace: null };

    const accountNamespace = current.workspaceNamespace || workspaceNamespaceForSession({ user: current.user });
    const guest = await readCanonicalWorkspaceState({ workspaceNamespace: GUEST_NAMESPACE, fallbackState: current });
    const guestWasMeaningful = !!(guest.snapshot && hasMeaningfulLocalData(guest.snapshot));
    const rollbackGuestSnapshot = guest.snapshot && !guestWasMeaningful ? guest.snapshot : null;

    if (guestWasMeaningful) {
      const transferResult = await get().transferGuestToCurrent();
      if (transferResult === false) throw new Error('guest_workspace_merge_failed');
      current = get();
    }

    await get().saveLocal({ dirty: false, force: true });
    current = get();
    let preservationState = current;
    if (activeLedgerSupported()) {
      const sourceLedgerNamespace = getLedgerNamespace(accountNamespace, current.cfg);
      const targetLedgerNamespace = getLedgerNamespace(GUEST_NAMESPACE, current.cfg);
      const sourceState = await getFinancialWorkspaceStateV7({ namespace: sourceLedgerNamespace });
      if (sourceState?.source_mode === 'sqlite') {
        const fullSource = await readFullFinancialStateV7({
          ledgerNamespace: sourceLedgerNamespace,
          fallbackState: { ...current, workspaceNamespace: accountNamespace },
        });
        if (!fullSource) throw new Error('local_account_delete_v7_full_read_failed');
        preservationState = fullSource;
      }
      const cloned = await cloneFinancialWorkspaceV7({
        sourceNamespace: sourceLedgerNamespace,
        targetNamespace: targetLedgerNamespace,
      });
      if (cloned.supported && !cloned.ok) throw new Error(cloned.reason || 'local_account_delete_v7_clone_failed');
      const accountArchives = await exportColdArchives(getColdArchiveNamespace(accountNamespace, current.cfg));
      const archivesCloned = await replaceColdArchives(getColdArchiveNamespace(GUEST_NAMESPACE, current.cfg), accountArchives);
      if (!archivesCloned) throw new Error('local_account_delete_archive_clone_failed');
    }
    const localOnly = {
      ...dedupeWorkspaceData(preservationState),
      user: null,
      workspaceNamespace: GUEST_NAMESPACE,
      workspaceReady: true,
      dirty: false,
      cloudRevision: 0,
      lastSyncedAt: null,
      lastSyncError: null,
      syncConflict: null,
    };
    const localSnapshot = snapshotFromState(localOnly, {
      dirty: false,
      cloudRevision: 0,
      lastSyncedAt: null,
      updatedAt: new Date().toISOString(),
    });

    await writeVaultSnapshot(GUEST_NAMESPACE, localSnapshot, { force: true });
    const verified = await readVaultSnapshot(GUEST_NAMESPACE);
    const restored = verified.snapshot ? stateFromSnapshot(verified.snapshot, current.cfg) : null;
    if (!restored || !sameWorkspaceData(localOnly, restored)) {
      throw new Error('local_account_delete_preservation_failed');
    }

    // Phase 2/3 ledger is now the active relational mirror. The encrypted
    // vault remains the preservation authority for this destructive account
    // lifecycle action; a ledger mirror problem cannot invalidate that copy.
    try {
      if (activeLedgerSupported()) {
        await replaceLedgerSnapshot({
          namespace: GUEST_NAMESPACE,
          transactions: restored.trans,
          wallets: restored.wallets,
          baseCurrency: restored.cfg.currency,
        });
      }
    } catch (error) {
      console.warn('[STORE] local account-delete ledger mirror', error);
    }

    return { ok: true, accountNamespace, rollbackGuestSnapshot };
  },

  rollbackLocalWorkspaceAfterAccountDeletionFailure: async (guestSnapshot = null) => {
    try {
      if (guestSnapshot) await writeVaultSnapshot(GUEST_NAMESPACE, guestSnapshot, { force: true });
      else await clearVaultSnapshot(GUEST_NAMESPACE);
    } catch {}
    try { if (activeLedgerSupported()) await clearLedgerNamespace(GUEST_NAMESPACE); } catch {}
    try { if (activeLedgerSupported()) await clearFinancialWorkspaceV7({ namespace: GUEST_NAMESPACE }); } catch {}
    return true;
  },

  cleanupDeletedAccountLocalNamespace: async (namespace) => {
    const target = String(namespace || '').trim();
    if (!target || target === GUEST_NAMESPACE) return true;
    try { await clearVaultSnapshot(target); } catch (error) { console.warn('[STORE] deleted account vault cleanup', error); }
    try { if (activeLedgerSupported()) await clearLedgerNamespace(target); } catch (error) { console.warn('[STORE] deleted account ledger cleanup', error); }
    try { if (activeLedgerSupported()) await clearFinancialWorkspaceV7({ namespace: target }); } catch (error) { console.warn('[STORE] deleted account V7 cleanup', error); }
    try { if (activeLedgerSupported()) await replaceColdArchives(getColdArchiveNamespace(target, get().cfg), []); } catch (error) { console.warn('[STORE] deleted account archive cleanup', error); }
    return true;
  },

  syncCloud: async (options = {}) => {
    if (FRESH_TEST_MODE) return false;
    // P19-015A2: cloud sync must stand down while maintenance is requested/active.
    if (isFinancialMaintenanceBlocked()) return false;
    const queued = syncQueue.then(async () => {
      if (isFinancialMaintenanceBlocked()) return false;
      const syncStartedAt = new Date().toISOString();
      let initial = get();
      if (!initial.user || initial.cfg.demoMode || !initial.workspaceReady) return false;
      const syncUserId = initial.user.id;

      set({ syncing: true, lastSyncError: null });

      try {
        const namespace = initial.workspaceNamespace || workspaceNamespaceForSession({ user: initial.user });
        if (activeLedgerSupported() && initial.financialLedgerV7Cutover) {
          const conflictRecoveryNamespace = getLedgerNamespace(namespace, initial.cfg);
          const activeConflictRecovery = await hasActiveV2ConflictRecoveryIntentV1({
            namespace: conflictRecoveryNamespace,
            accountId: syncUserId,
          });
          if (activeConflictRecovery) throw new Error('financial_v2_conflict_recovery_active');
        }
        let cloudRecovery = null;
        if (activeLedgerSupported() && initial.financialLedgerV7Cutover) {
          // A normal sync proves its local V2 state first. Only an actually empty
          // or uncertain shell enters the blocking recovery path; settings saves
          // (language, theme, and any future preference) must never flash a
          // full-screen maintenance layer simply because they schedule a sync.
          if (getFinancialMaintenanceSnapshot().blocked) return false;
          const ledgerNamespace = getLedgerNamespace(namespace, initial.cfg);
          const steadyReason = await hasSteadyFinancialCloudRecoveryStateV2({
            get,
            workspaceNamespace: namespace,
            ledgerNamespace,
            syncUserId,
          });
          cloudRecovery = steadyReason
            ? { attempted: false, ok: true, recovered: false, reason: steadyReason }
            : await get().runFinancialMaintenance(
                'cloud_recovery',
                () => runVerifiedEmptyShellCloudRecoveryV2({
                  get,
                  set,
                  workspaceNamespace: namespace,
                  ledgerNamespace,
                  syncUserId,
                  onExclusiveTransition: promoteActiveFinancialMaintenancePresentation,
                }),
                // First inspect the remote source silently. The recovery helper
                // promotes the fence only if it will adopt an identity or restore.
                { insideSync: true, resumeSync: false, presentation: 'silent' },
              );
          if (cloudRecovery?.blocked || cloudRecovery?.ok === false) {
            throw new Error(cloudRecovery?.reason || 'financial_cloud_recovery_blocked');
          }
          if (cloudRecovery?.recovered) {
            initial = get();
          }
        }
        const baseNamespace = syncBaseNamespace(namespace);
        const cutoverBridge = !!(activeLedgerSupported() && initial.financialLedgerV7Cutover);
        const readCurrentForSnapshot = async () => {
          const ui = get();
          if (!cutoverBridge) return ui;
          const full = await readFullFinancialStateV7({
            ledgerNamespace: getLedgerNamespace(namespace, ui.cfg),
            fallbackState: { ...ui, workspaceNamespace: namespace },
          });
          if (!full) throw new Error('financial_v7_sync_full_snapshot_failed');
          return full;
        };
        const installCanonicalState = async (canonicalState, statePatch = {}) => {
          const session = get();
          if (!cutoverBridge) {
            set({
              ...canonicalState,
              user: session.user,
              workspaceNamespace: namespace,
              workspaceReady: true,
              ...statePatch,
            });
            return canonicalState;
          }
          // V7 is the financial authority after operational cutover. The legacy
          // user_data snapshot is compatibility output only; absence in that
          // snapshot is NOT a financial delete instruction. Remote financial
          // changes must arrive through explicit V7 mutations/tombstones.
          throw new Error('financial_v7_snapshot_pull_forbidden');
        };
        // Capture a high-water mark. Mutations created while this network sync is
        // in flight get larger ids and are never accidentally acknowledged.
        const outboxAtStart = activeLedgerSupported() && !cutoverBridge ? await drainLedgerOutbox(namespace, 1000) : [];
        const outboxHighWater = outboxAtStart.length ? Number(outboxAtStart[outboxAtStart.length - 1]?.id || 0) : 0;
        const deviceId = await getOrCreateDeviceId();
        const ledgerSyncNamespace = getLedgerNamespace(namespace, initial.cfg);
        let financialProtocol = activeLedgerSupported() && initial.financialLedgerV7Cutover
          ? await readFinancialSyncProtocolV8({ namespace: ledgerSyncNamespace })
          : null;
        let financialV2Active = financialProtocol?.activeProtocolVersion === 2;
        let activationFinancialSync = null;

        console.info('[P20_V2_SYNC_CONTEXT]', JSON.stringify({
          activeLedgerSupported: activeLedgerSupported(),
          financialLedgerV7Cutover: !!initial.financialLedgerV7Cutover,
          activeProtocolVersion: Number(financialProtocol?.activeProtocolVersion || 0),
          financialV2Active,
          ledgerId: financialProtocol?.ledgerId || null,
          restoreEpoch: Number(financialProtocol?.restoreEpoch || 0),
        }));

        if (activeLedgerSupported() && initial.financialLedgerV7Cutover && !financialV2Active) {
          activationFinancialSync = await runControlledFinancialV2Activation({
            get,
            set,
            workspaceNamespace: namespace,
            ledgerNamespace: ledgerSyncNamespace,
            syncUserId,
            deviceId,
          });
          if (!activationFinancialSync.ok) {
            console.warn('[P19_FINAL_V2_ACTIVATION_FAIL]', JSON.stringify({
              reason: activationFinancialSync?.reason || null,
              cloudRecoveryReason: cloudRecovery?.reason || null,
              cloudRecoveryMode: cloudRecovery?.mode || cloudRecovery?.source?.mode || null,
              requireV2: cloudRecovery?.requireV2 === true,
            }));
            if (activationFinancialSync?.v2RecoveryRequired || financialProtocol?.requiresV2Recovery) {
              throw new Error(
                activationFinancialSync.reason || 'financial_v2_production_apply_recovery_required'
              );
            }
            // A ledger whose epoch superseded a durably activated one may not drop to
            // V1 when its re-activation attempt fails. The addendum forbids automatic
            // fallback after durable activated_at; this is fail-closed instead.
            // Bounded, like the guard above it: financialProtocol is only read when
            // financialLedgerV7Cutover is true, so neither guard can see a superseded
            // epoch on a workspace that is not cut over.
            if (financialProtocol?.activationState === 'EPOCH_ACTIVATION_REQUIRED') {
              throw new Error(
                activationFinancialSync.reason || 'financial_v2_epoch_activation_required'
              );
            }
            // A ledger just restored from cloud must never drop into V1 on the
            // same attempt. Its next safe step is verified V2 bootstrap/activation.
            if (cloudRecovery?.requireV2) {
              throw new Error(
                activationFinancialSync.reason || 'financial_v2_activation_required_after_cloud_recovery'
              );
            }
            // Existing local ledgers retain the pre-activation P19-011 fallback,
            // but every such fallback is now explicit in device evidence.
            console.warn('[P19_FINAL_V1_FALLBACK]', JSON.stringify({
              reason: activationFinancialSync?.reason || 'financial_v2_activation_failed',
              cloudRecoveryReason: cloudRecovery?.reason || null,
            }));
            financialV2Active = false;
          } else {
            financialV2Active = true;
            financialProtocol = activationFinancialSync.protocol || {
              activeProtocolVersion: 2,
              activatedAt: activationFinancialSync.activated?.activatedAt || null,
            };
          }
        }

        let financialMutationSync = null;
        if (activeLedgerSupported() && initial.financialLedgerV7Cutover) {
          financialMutationSync = financialV2Active
            ? (activationFinancialSync?.sync || await syncFinancialMutationsV2({
                supabase,
                namespace: ledgerSyncNamespace,
                deviceId,
                allowProductionApply: true,
              }))
            : await syncFinancialMutationsV7({
                supabase,
                namespace: ledgerSyncNamespace,
                deviceId,
              });
          set({
            financialMutationSyncProtocol: financialV2Active ? 2 : 1,
            financialSyncProtocol: financialV2Active ? 2 : 1,
            ...(financialV2Active ? { financialMutationSyncV2: financialMutationSync } : {}),
          });
          if (financialMutationSync.ok && financialMutationSync.downloaded > 0) {
            const v7Workspace = await readFinancialWorkspaceV7({
              namespace: getLedgerNamespace(namespace, initial.cfg),
              includeArchived: false,
              transactionLimit: 2000,
            });
            const loadedV7 = stateFromFinancialV7(v7Workspace, initial.cfg);
            set(current => ({
              ...loadedV7,
              user: current.user,
              workspaceNamespace: namespace,
              workspaceReady: true,
              dirty: current.dirty || financialMutationSync.pendingAfterSync > 0,
              financialMutationSync,
              financialMutationSyncVerifiedAt: new Date().toISOString(),
            }));
          } else {
            set({ financialMutationSync });
          }
          console.info('[P20_V2_MUTATION_STATE]', JSON.stringify({
            protocol: financialV2Active ? 2 : 1,
            ok: !!financialMutationSync?.ok,
            reason: financialMutationSync?.reason || null,
            uploaded: Number(financialMutationSync?.uploaded || 0),
            downloaded: Number(financialMutationSync?.downloaded || 0),
            pendingAfterSync: Number(financialMutationSync?.pendingAfterSync || 0),
            cursor: Number(financialMutationSync?.cursor || 0),
            hasMore: financialMutationSync?.hasMore === true,
          }));
          if (!financialMutationSync.ok) {
            // Never fall back to snapshot pull after V7 cutover. Snapshot
            // absence previously generated local void/delete mutations.
            throw new Error(financialMutationSync.reason || 'financial_v7_mutation_sync_required');
          }
          if (financialV2Active) {
            console.info('[P19_FINAL_V2_SYNC_OK]', JSON.stringify({
              ledgerId: financialProtocol?.ledgerId || activationFinancialSync?.activated?.ledgerId || null,
              restoreEpoch: Number(financialProtocol?.restoreEpoch || activationFinancialSync?.activated?.restoreEpoch || 0),
              protocol: 2,
              cursor: Number(financialMutationSync.cursor || 0),
              pendingAfterSync: Number(financialMutationSync.pendingAfterSync || 0),
            }));
          }
          // Snapshot sync remains only as a compatibility mirror OUTPUT after
          // V7 cutover. Financial pull authority is the mutation protocol.
        }
        const { snapshot: baseSnapshot } = await readVaultSnapshot(baseNamespace);
        let baseState = baseSnapshot
          ? stateFromSnapshot(baseSnapshot, initial.cfg)
          : null;
        let pendingSyncConflict = null;

        const supersededByReset = async () => {
          const marker = await readResetMarker(namespace);
          if (!marker?.pendingCloudSync || financialDataCount(get()) !== 0) return false;
          return String(marker.resetAt || '') > syncStartedAt;
        };

        const persistSynced = async ({ revision, syncConflict = null }) => {
          if (get().user?.id !== syncUserId) return false;
          resetTransientCloudRetry();
          if (await supersededByReset()) return false;
          const revisionValue = Number(revision || 0);
          // This describes the successful check on *this device*, not the last
          // time another device changed cloud data. A clean manual pull therefore
          // updates the visible time without creating a cloud write.
          const syncedAtValue = new Date().toISOString();
          set({
            dirty: false,
            cloudRevision: revisionValue,
            lastSyncedAt: syncedAtValue,
            online: true,
            lastSyncError: null,
            syncConflict,
          });

          let finalState = await readCurrentForSnapshot();
          finalState = {
            ...finalState,
            dirty: false,
            cloudRevision: revisionValue,
            lastSyncedAt: syncedAtValue,
            syncConflict,
          };

          if (cutoverBridge) {
            const workspaceCommit = await commitEntityChangesV7({
              namespace: getLedgerNamespace(namespace, finalState.cfg),
              changes: [{
                entityType: 'workspace', id: 'workspace',
                payload: {
                  cfg: canonicalWorkspaceCfg(finalState.cfg),
                  cloudRevision: revisionValue,
                },
              }],
            });
            if (workspaceCommit.supported && !workspaceCommit.ok) {
              throw new Error(workspaceCommit.reason || 'financial_v7_sync_workspace_metadata_failed');
            }
            if (Number(workspaceCommit.changed || 0) > 0) {
              const bridged = financialV2Active
                ? await syncFinancialMutationsV2({
                    supabase,
                    namespace: getLedgerNamespace(namespace, finalState.cfg),
                    deviceId,
                    allowProductionApply: true,
                  })
                : await syncFinancialMutationsV7({
                    supabase,
                    namespace: getLedgerNamespace(namespace, finalState.cfg),
                    deviceId,
                  });
              if (!bridged?.ok) {
                // The server's conflict answer carries the cloud's current
                // revision for the entity it refused. That is the one fact the
                // narrow repair needs to prove a queued command is stale, and
                // this response is the only place it appears -- keep it rather
                // than reducing the whole failure to an error string.
                if (Array.isArray(bridged?.conflicts) && bridged.conflicts.length) {
                  set({
                    financialV2Conflicts: {
                      conflicts: bridged.conflicts,
                      reason: String(bridged.reason || ''),
                      observedAt: new Date().toISOString(),
                    },
                  });
                }
                throw new Error(bridged?.reason || (
                  financialV2Active ? 'financial_v2_bridge_sync_failed' : 'financial_v1_bridge_sync_failed'
                ));
              }
              set({
                financialMutationSync: bridged,
                financialMutationSyncProtocol: financialV2Active ? 2 : 1,
                ...(financialV2Active ? { financialMutationSyncV2: bridged } : {}),
              });
            }
            finalState = await readCurrentForSnapshot();
            finalState = {
              ...finalState, dirty: false, cloudRevision: revisionValue,
              lastSyncedAt: syncedAtValue, syncConflict,
            };
          } else if (activeLedgerSupported()) {
            const reconciled = await reconcileFinancialWorkspaceV7({
              namespace: getLedgerNamespace(namespace, finalState.cfg),
              workspace: finalState,
            });
            if (reconciled.supported && !reconciled.ok) {
              throw new Error(reconciled.reason || 'financial_v7_post_sync_reconcile_failed');
            }
          }

          const finalSnapshot = snapshotFromState(finalState, {
            dirty: false, cloudRevision: revisionValue, lastSyncedAt: syncedAtValue,
          });
          const empty = financialDataCount(finalState) === 0;
          // Snapshot sync is a temporary Phase-14 compatibility bridge. Build
          // it from the full SQLite projection, never from the 2k UI cache.
          await writeVaultSnapshot(namespace, finalSnapshot, { force: empty });
          await writeVaultSnapshot(baseNamespace, finalSnapshot, { force: true });

          if (empty) await writeResetMarker(namespace, { pendingCloudSync: false });
          baseState = stateFromSnapshot(finalSnapshot, finalState.cfg);
          if (outboxHighWater > 0) {
            await acknowledgeLedgerOutbox(namespace, outboxHighWater);
            const stillPending = await drainLedgerOutbox(namespace, 1);
            if (stillPending.length) {
              set({ dirty: true });
              setTimeout(() => get().scheduleCloudSync?.('outbox_followup'), 250);
            }
          }
          return true;
        };

        const applyMergedState = async ({ remoteState, cloudRevision }) => {
          if (await supersededByReset()) return null;
          const current = await readCurrentForSnapshot();
          const conflicts = [];
          const merged = mergeWorkspaceStates({
            base: baseState,
            local: current,
            remote: remoteState,
            conflicts,
          });
          pendingSyncConflict = conflicts.length
            ? {
                type: 'merged_changes',
                cloudRevision,
                at: new Date().toISOString(),
                items: conflicts.slice(0, 50),
                total: conflicts.length,
              }
            : null;

          const normalized = stateFromSnapshot(
            snapshotFromState(
              { ...current, ...merged, user: current.user },
              { dirty: true, cloudRevision },
            ),
            current.cfg,
          );

          await installCanonicalState(normalized, {
            online: true,
            dirty: true,
            cloudRevision,
            syncConflict: pendingSyncConflict,
            lastSyncError: null,
          });
          await writeVaultSnapshot(
            namespace,
            snapshotFromState(normalized, { dirty: true, cloudRevision }),
          );
          return normalized;
        };

        // Four attempts are enough to absorb a second device writing during
        // this sync without creating an endless retry loop.
        for (let attempt = 0; attempt < SYNC_MAX_ATTEMPTS; attempt += 1) {
          if (get().user?.id !== syncUserId) return false;
          const currentBeforePull = get();

          const { data: cloud, error: fetchError } = await supabase
            .from('user_data')
            .select(SYNC_CLOUD_COLUMNS)
            .eq('user_id', currentBeforePull.user.id)
            .maybeSingle();

          if (fetchError) throw fetchError;
          if (get().user?.id !== syncUserId) return false;

          const cloudRevision = Number(cloud?.revision || 0);
          const resetMarker = await readResetMarker(namespace);
          const intentionalEmptyReset = (
            !!resetMarker?.pendingCloudSync
            && financialDataCount(get()) === 0
          );

          if (cloud && !intentionalEmptyReset) {
            const remoteState = stateFromSnapshot(
              cloudSnapshot(cloud, get().notif),
              get().cfg,
            );

            if (cutoverBridge) {
              // Financial snapshot PULL is forbidden after V7 cutover. Mutation
              // sync above has already applied explicit remote upserts/deletes.
              // Compare the compatibility snapshot only; if it is stale or
              // incomplete, fall through and PUSH the full V7 projection.
              const currentV7 = await readCurrentForSnapshot();
              if (sameWorkspaceData(currentV7, remoteState)) {
                return persistSynced({
                  revision: cloudRevision,
                  syncedAt: cloud.updated_at || new Date().toISOString(),
                  syncConflict: null,
                });
              }
            } else if (!baseState) {
              // Pre-cutover compatibility path only.
              const applied = await applyMergedState({ remoteState, cloudRevision });
              if (!applied) return false;

              if (sameWorkspaceData(applied, remoteState)) {
                return persistSynced({
                  revision: cloudRevision,
                  syncedAt: cloud.updated_at || new Date().toISOString(),
                  syncConflict: pendingSyncConflict,
                });
              }
            } else {
              const localState = await readCurrentForSnapshot();
              const localChanged = (
                !!get().dirty
                || !sameWorkspaceData(baseState, localState)
              );
              const remoteChanged = (
                cloudRevision !== Number(baseSnapshot?.cloudRevision || 0)
                || !sameWorkspaceData(baseState, remoteState)
              );

              if (!localChanged && remoteChanged) {
                pendingSyncConflict = null;
                await installCanonicalState(remoteState, {
                  online: true, dirty: false, cloudRevision, syncConflict: null, lastSyncError: null,
                });
                return persistSynced({
                  revision: cloudRevision,
                  syncedAt: cloud.updated_at || new Date().toISOString(),
                });
              }

              if (!localChanged && !remoteChanged) {
                return persistSynced({
                  revision: cloudRevision,
                  syncedAt: cloud.updated_at || get().lastSyncedAt || new Date().toISOString(),
                });
              }

              const applied = await applyMergedState({ remoteState, cloudRevision });
              if (!applied) return false;

              // The remote already contains the full merged result.
              if (sameWorkspaceData(applied, remoteState)) {
                return persistSynced({
                  revision: cloudRevision,
                  syncedAt: cloud.updated_at || new Date().toISOString(),
                  syncConflict: pendingSyncConflict,
                });
              }
            }
          }

          // Cloud row missing, local changes exist, bootstrap merge produced a
          // combined state, or an intentional reset must replace cloud.
          if (get().user?.id !== syncUserId) return false;

          // Phase 13 Stage C. After cutover this row is a mirror of a projection
          // no reader is allowed to trust, so stop emitting it. The financial
          // upload and the cfg entity both happen inside persistSynced, which
          // throws if either fails -- reaching a clean state here still means
          // the work landed, it just no longer includes the mirror.
          const mirrorPlan = legacyUserDataMirrorPlanV1({
            cutoverBridge, cloudRevision, localRevision: get().cloudRevision,
          });
          if (!mirrorPlan.write) {
            return persistSynced({
              revision: mirrorPlan.settleRevision,
              syncConflict: pendingSyncConflict,
            });
          }

          const current = await readCurrentForSnapshot();
          const expectedRevision = cloudRevision;

          const { data, error } = await supabase.rpc('sync_user_data_v2', {
            p_expected_revision: expectedRevision,
            p_trans: current.trans,
            p_debts: current.debts,
            p_goals: current.goals,
            p_wallets: current.wallets,
            p_commitments: current.commitments,
            p_cats: current.cats,
            p_cfg: canonicalWorkspaceCfg(current.cfg),
            p_device_id: deviceId,
          });

          if (error) throw error;
          if (get().user?.id !== syncUserId) return false;

          const result = Array.isArray(data) ? data[0] : data;
          const resultRevision = Number(result?.revision);
          if (!result || typeof result.accepted !== 'boolean' || !Number.isFinite(resultRevision) || resultRevision < 0) {
            throw new Error('invalid_sync_rpc_response');
          }

          if (result.accepted) {
            if (resultRevision <= expectedRevision) throw new Error('invalid_sync_revision');
            const syncedAt = result.updated_at || new Date().toISOString();
            return persistSynced({ revision: resultRevision, syncedAt, syncConflict: pendingSyncConflict });
          }

          // Another phone wrote between our pull and push. Keep our merged
          // state, pull its newest revision on the next loop, merge again,
          // and retry with a short bounded delay instead of a hot retry loop.
          const finalAttempt = attempt >= SYNC_MAX_ATTEMPTS - 1;
          set({
            online: true,
            dirty: true,
            cloudRevision: resultRevision,
            syncConflict: pendingSyncConflict,
            lastSyncError: finalAttempt ? 'sync_race_retry_required' : null,
          });
          if (!finalAttempt) await syncRetryDelay(attempt);
        }

        return false;
      } catch (e) {
        // Keep the technical payload in logs without exposing a raw Supabase
        // object as an Expo in-app error toast.
        console.warn('[STORE] multi-device sync', e?.message || e?.code || 'sync_failed');
        const transientRetryScheduled = get().user?.id === syncUserId
          ? armTransientCloudRetry(get, syncUserId, e)
          : false;
        if (get().user?.id === syncUserId) {
          const syncReason = String(e?.message || 'sync_failed');
          // A revision conflict is an authenticated response from the cloud,
          // not a network outage. Keeping the device online makes the account
          // screen truthful and leaves recovery actions available.
          const revisionConflict = syncReason === 'financial_v2_revision_conflict';
          // A queued Home/read snapshot can overlap the startup sync and trip the
          // read-transaction reentrancy guard. It is logged above, but must not
          // conceal a previously authenticated V2 conflict and its repair action.
          const preserveRevisionConflict = syncReason === 'ledger_queue_reentrant_from_read_transaction'
            && String(get().lastSyncError || '') === 'financial_v2_revision_conflict';
          set({
            online: revisionConflict || preserveRevisionConflict,
            lastSyncError: preserveRevisionConflict ? 'financial_v2_revision_conflict' : syncReason,
          });
        }
        if (!transientRetryScheduled && !isTransientCloudSyncError(e)) {
          resetTransientCloudRetry();
        }
        return false;
      } finally {
        if (get().user?.id === syncUserId) set({ syncing: false });
      }
    });

    syncQueue = queued.catch(() => false);
    return queued;
  },

  loadCloud: async () => {
    if (FRESH_TEST_MODE) return false;
    const current = get();
    if (!current.user || !current.workspaceReady || current.cfg.demoMode) return false;

    // One path now handles both pull and push. This is critical on multiple
    // phones: a manual "sync" must also pull changes created elsewhere.
    return get().syncCloud({ reason: 'pull' });
  },

  transferGuestToCurrent: async (options = {}) => {
    // P19-015A2: guest merge owns the maintenance barrier.
    if (!options?.maintenanceOwned) {
      return get().runFinancialMaintenance(
        'guest_workspace_merge',
        () => get().transferGuestToCurrent({ maintenanceOwned: true }),
      );
    }
    const currentUi = get();
    if (!currentUi.user) return false;
    const namespace = workspaceNamespaceForSession({ user: currentUi.user });
    const guestSource = await readCanonicalWorkspaceState({ workspaceNamespace: GUEST_NAMESPACE, fallbackState: currentUi });
    const snapshot = guestSource.snapshot;
    if (!snapshot || !hasMeaningfulLocalData(snapshot)) {
      set({ pendingGuestTransfer: false, guestTransferPreview: null });
      return false;
    }
    const accountSource = await readCanonicalWorkspaceState({ workspaceNamespace: namespace, fallbackState: currentUi });
    const current = accountSource.state || currentUi;
    const accountSnapshot = accountSource.snapshot || snapshotFromState(current);
    const rollback = await saveMergeRollback({
      namespace,
      accountSnapshot,
      guestSnapshot: snapshot,
      type: 'guest_transfer',
    });
    const preview = buildGuestTransferPreview(current, snapshot);
    if (!preview.addsData) {
      await clearVaultSnapshot(GUEST_NAMESPACE);
      if (guestSource.source === 'sqlite_v7') {
        await clearFinancialWorkspaceV7({ namespace: guestSource.ledgerNamespace });
      }
      set({
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        lastMergeRollback: rollback,
      });
      return { ok: true, reason: 'duplicate_only', rollbackAvailable: true, preview };
    }
    const guest = stateFromSnapshot(snapshot, current.cfg);
    // Guest financial data is imported into the signed-in workspace, but the
    // account configuration (especially its base currency) remains authoritative.
    // Currency meaning travels on each wallet/transaction/tracker instead.
    const remapIds = (incoming, existing) => {
      const occupied = new Set(existing.map(item => item.id));
      const map = new Map();
      incoming.forEach(item => {
        const nextId = occupied.has(item.id) ? uid() : item.id;
        occupied.add(nextId);
        map.set(item.id, nextId);
      });
      return map;
    };
    const referencedGuestWalletIds = new Set();
    guest.trans.forEach(item => {
      if (item.walletId) referencedGuestWalletIds.add(item.walletId);
      if (item.fromWalletId) referencedGuestWalletIds.add(item.fromWalletId);
      if (item.toWalletId) referencedGuestWalletIds.add(item.toWalletId);
    });
    guest.commitments.forEach(item => {
      if (item.walletId) referencedGuestWalletIds.add(item.walletId);
    });

    const currentWalletIds = new Set(current.wallets.map(item => item.id));
    const currentDefaultWalletId = current.cfg.defaultWalletId || current.wallets[0]?.id || null;
    const guestWalletsToImport = guest.wallets.filter(item => {
      if (!item?.id) return false;
      if (Number(item.openingBalance || 0) !== 0) return true;
      // Same technical ID does not mean the same financial account. Currency
      // remains owned by the Guest wallet (item.currency || guest.cfg.currency).
      // A wallet referenced by Guest financial history is a real financial
      // account even when its technical default ID/name/currency matches a
      // wallet in the signed-in namespace. Different namespaces must never
      // collapse ownership. remapIds() below assigns a fresh ID on collision.
      if (referencedGuestWalletIds.has(item.id)) return true;
      return false;
    });

    const walletIds = remapIds(guestWalletsToImport, current.wallets);
    const debtIds = remapIds(guest.debts, current.debts);
    const goalIds = remapIds(guest.goals, current.goals);
    const commitmentIds = remapIds(guest.commitments, current.commitments);
    const transactionIds = remapIds(guest.trans, current.trans);
    const mapWallet = id => {
      if (walletIds.has(id)) return walletIds.get(id);
      if (id && currentWalletIds.has(id)) return id;
      return currentDefaultWalletId || id;
    };
    const mapLinkedId = (type, id) => {
      if (type === 'debt' || type === 'receivable') return debtIds.get(id) || id;
      if (type === 'goal') return goalIds.get(id) || id;
      return id;
    };
    const guestWallets = guestWalletsToImport.map(item => ({
      ...item,
      id: mapWallet(item.id),
      name: walletIds.get(item.id) !== item.id ? `${item.name} (${current.cfg.lang === 'ar' ? 'ضيف' : 'Guest'})` : item.name,
      nameEn: walletIds.get(item.id) !== item.id ? `${item.nameEn || item.name} (Guest)` : item.nameEn,
      currency: item.currency || current.cfg.currency,
    }));
    const guestDebts = guest.debts.map(item => ({ ...item, id: debtIds.get(item.id) || item.id }));
    const guestGoals = guest.goals.map(item => ({ ...item, id: goalIds.get(item.id) || item.id }));
    const guestCommitments = guest.commitments.map(item => ({
      ...item,
      id: commitmentIds.get(item.id) || item.id,
      walletId: mapWallet(item.walletId),
      linkedId: mapLinkedId(item.linkedType, item.linkedId),
    }));
    const guestTrans = guest.trans.map(item => ({
      ...item,
      id: transactionIds.get(item.id) || item.id,
      walletId: mapWallet(item.walletId),
      fromWalletId: mapWallet(item.fromWalletId),
      toWalletId: mapWallet(item.toWalletId),
      debtId: debtIds.get(item.debtId) || item.debtId,
      goalId: goalIds.get(item.goalId) || item.goalId,
      commitmentId: commitmentIds.get(item.commitmentId) || item.commitmentId,
    }));
    const knownCats = new Set(current.cats.map(item => item.id));
    const merged = dedupeWorkspaceData({
      ...current,
      trans: [...guestTrans, ...current.trans],
      debts: [...guestDebts, ...current.debts],
      goals: [...guestGoals, ...current.goals],
      wallets: [...current.wallets, ...guestWallets],
      commitments: [...guestCommitments, ...current.commitments],
      cats: [...current.cats, ...guest.cats.filter(item => !knownCats.has(item.id))],
    });
    if (accountSource.source === 'sqlite_v7') {
      const reconciled = await reconcileFinancialWorkspaceV7({
        namespace: accountSource.ledgerNamespace,
        workspace: merged,
      });
      if (reconciled.supported && !reconciled.ok) {
        throw new Error(reconciled.reason || 'guest_workspace_v7_merge_failed');
      }
      const boundedWorkspace = await readFinancialWorkspaceV7({
        namespace: accountSource.ledgerNamespace,
        includeArchived: false,
        transactionLimit: 2000,
      });
      const bounded = stateFromFinancialV7(boundedWorkspace, merged.cfg);
      set({
        ...bounded,
        user: current.user,
        workspaceNamespace: namespace,
        workspaceReady: true,
        dirty: true,
        cloudRevision: current.cloudRevision,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        lastMergeRollback: rollback,
        syncConflict: null,
        financialLedgerV7Ready: true,
        financialLedgerV7Cutover: true,
      });
    } else {
      set({
        ...merged,
        user: current.user,
        workspaceNamespace: namespace,
        workspaceReady: true,
        dirty: true,
        cloudRevision: current.cloudRevision,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        lastMergeRollback: rollback,
        syncConflict: null,
      });
      await get().saveLocal({ dirty: true, force: true });
    }
    await clearVaultSnapshot(GUEST_NAMESPACE);
    if (guestSource.source === 'sqlite_v7') {
      await clearFinancialWorkspaceV7({ namespace: guestSource.ledgerNamespace });
    }
    const synced = await get().syncCloud();
    return { ok: synced || true, reason: 'merged', rollbackAvailable: true, preview };
  },

  dismissGuestTransfer: () => set({ pendingGuestTransfer: false, guestTransferPreview: null }),

  restoreLastMergeRollback: async (options = {}) => {
    // P19-015A2: merge rollback is a financial restore.
    if (!options?.maintenanceOwned) {
      return get().runFinancialMaintenance(
        'merge_rollback_restore',
        () => get().restoreLastMergeRollback({ maintenanceOwned: true }),
      );
    }
    const current = get();
    const namespace = current.workspaceNamespace || workspaceNamespaceForSession({ user: current.user });
    const { snapshot: rollback } = await readVaultSnapshot(mergeRollbackNamespace(namespace));
    if (!rollback?.accountSnapshot) return false;

    const restored = stateFromSnapshot(rollback.accountSnapshot, current.cfg);
    const accountLedgerNamespace = getLedgerNamespace(namespace, restored.cfg);
    const accountLedgerState = activeLedgerSupported()
      ? await getFinancialWorkspaceStateV7({ namespace: accountLedgerNamespace })
      : null;

    if (accountLedgerState?.source_mode === 'sqlite') {
      const reconciled = await reconcileFinancialWorkspaceV7({
        namespace: accountLedgerNamespace,
        workspace: restored,
      });
      if (reconciled.supported && !reconciled.ok) return false;
      const boundedWorkspace = await readFinancialWorkspaceV7({
        namespace: accountLedgerNamespace, includeArchived: false, transactionLimit: 2000,
      });
      const bounded = stateFromFinancialV7(boundedWorkspace, restored.cfg);
      set({
        ...bounded,
        user: current.user,
        workspaceNamespace: namespace,
        workspaceReady: true,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        lastMergeRollback: null,
        syncConflict: null,
        lastSyncError: null,
        dirty: true,
        financialLedgerV7Ready: true,
        financialLedgerV7Cutover: true,
      });
    } else {
      set({
        ...restored,
        user: current.user,
        workspaceNamespace: namespace,
        workspaceReady: true,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        lastMergeRollback: null,
        syncConflict: null,
        lastSyncError: null,
        dirty: true,
      });
      await writeVaultSnapshot(namespace, snapshotFromState(get(), { dirty: true }), { force: true });
    }

    if (rollback.guestSnapshot) {
      await writeVaultSnapshot(GUEST_NAMESPACE, rollback.guestSnapshot, { force: true });
      if (activeLedgerSupported()) {
        await restoreSnapshotAsOperationalV7({
          workspaceNamespace: GUEST_NAMESPACE,
          snapshot: rollback.guestSnapshot,
          fallbackCfg: restored.cfg,
        });
      }
    } else {
      await clearVaultSnapshot(GUEST_NAMESPACE);
      if (activeLedgerSupported()) {
        await clearFinancialWorkspaceV7({ namespace: getLedgerNamespace(GUEST_NAMESPACE, restored.cfg) });
      }
    }
    await clearVaultSnapshot(mergeRollbackNamespace(namespace));
    await get().syncCloud();
    return true;
  },

  resolveSyncConflict: async (strategy = 'cloud') => {
    const conflict = get().syncConflict;
    if (strategy === 'dismiss' || (conflict && !conflict.cloud)) {
      set({ syncConflict: null });
      return true;
    }
    if (!conflict?.cloud) return false;
    if (strategy === 'local') {
      set({ cloudRevision: conflict.cloudRevision, syncConflict: null, dirty: true });
      await get().saveLocal({ dirty: true });
      return get().syncCloud();
    }
    const accepted = stateFromSnapshot(cloudSnapshot(conflict.cloud, get().notif), get().cfg);
    set({
      ...accepted,
      user: get().user,
      workspaceNamespace: get().workspaceNamespace,
      workspaceReady: true,
      syncConflict: null,
      lastSyncError: null,
    });
    await get().saveLocal({ dirty: false });
    return true;
  },
});
