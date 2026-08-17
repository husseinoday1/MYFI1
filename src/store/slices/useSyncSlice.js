// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
// MYFI_PERFORMANCE_DATA_PERSISTENCE_V5_1_1
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SQLiteStorage from 'expo-sqlite/kv-store';
import { mergeWorkspaceStates, sameWorkspaceData } from '../multiDeviceSync';
import { supabase } from '../../lib/supabase';
import { STORAGE, DEF_CATS, DEF_CFG, DEF_NOTIF, LEGACY_STORAGE_KEYS, normalizeCfg } from '../../lib/constants';
import { normalizedPreviewEnabled, normalizedShadowEnabled } from '../../lib/databaseMode';
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
  activateFinancialSyncProtocolV2V8,
  readFinancialSyncProtocolV8,
} from '../../lib/financialLedgerV7Repository';
import { compareSnapshots, loadNormalizedSnapshot } from '../../lib/normalizedRepository';
import { syncFinancialMutationsV7 } from '../../lib/financialMutationSync';
import { syncFinancialMutationsV2 } from '../../lib/financialMutationSyncV2';
import { bootstrapFinancialLedgerV2 } from '../../lib/financialBootstrapV2';
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
  snapshotFromState,
  stateFromSnapshot,
  uid,
} from '../domain';

let syncQueue = Promise.resolve();
let scheduledSyncTimer = null;
let scheduledSyncReason = 'local_change';
let scheduledSyncAttempt = 0;
const SCHEDULED_SYNC_DELAYS_MS = [700, 3000, 10000, 30000];
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

const readActiveLocalLedgerContext = async () => {
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

const writeActiveLocalLedgerContext = async ({ namespace, linkedUserId = null, identity = {} } = {}) => {
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
  if (scheduledSyncTimer) clearTimeout(scheduledSyncTimer);
  const delay = SCHEDULED_SYNC_DELAYS_MS[Math.min(scheduledSyncAttempt, SCHEDULED_SYNC_DELAYS_MS.length - 1)];
  scheduledSyncTimer = setTimeout(async () => {
    scheduledSyncTimer = null;
    const current = get();
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
    },
    cats: workspace?.cats?.length ? workspace.cats : DEF_CATS,
    cfg: financialWorkspace.cfg || fallbackCfg,
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

  // A clean activation requires an observed quiescent V2 pass. The first pass
  // may legitimately upload post-bootstrap mutations; a later pass must prove
  // no pending local mutations and no unseen remote mutations remain.
  const shadowPasses = [];
  let validationSync = null;
  for (let pass = 1; pass <= 3; pass += 1) {
    const result = await syncFinancialMutationsV2({
      supabase,
      namespace: ledgerNamespace,
      deviceId,
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

  set({
    financialSyncProtocol: 2,
    financialMutationSyncProtocol: 2,
    financialMutationSyncV2: validationSync,
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
      activatedAt: activated.activatedAt,
      shadowPasses,
      error: null,
    },
  });

  return {
    ok: true,
    bootstrap,
    readbackVerification: readback,
    sync: validationSync,
    shadowValidation: {
      ok: true,
      validatedAt: shadowValidatedAt,
      cursor: Number(validationSync.cursor || 0),
      passes: shadowPasses,
    },
    activated,
    protocol: {
      ...activated,
      activeProtocolVersion: 2,
    },
  };
};

export const createSyncSlice = (set, get) => ({
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

  setUser: async (user, { preserveWorkspaceOnLogout = true, switchToGuest = false } = {}) => {
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
      await get().loadLocal(GUEST_NAMESPACE, { allowLegacy: false });
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
        if (profile?.patch && Object.keys(profile.patch).length) {
          set({ cfg: normalizeCfg({ ...get().cfg, ...profile.patch }) });
          await get().saveLocal({ dirty: false, force: true });
        }
      } catch (error) {
        console.warn('[STORE] profile hydrate', error);
      }
      await writeActiveLocalLedgerContext({
        namespace: get().workspaceNamespace || transition.namespace,
        linkedUserId: nextUserId,
        identity: localIdentityFromState(get()),
      });
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
      await writeActiveLocalLedgerContext({
        namespace: currentNamespace,
        linkedUserId: nextUserId,
        identity: priorIdentity,
      });
      await hydrateProfile(priorIdentity);
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
    await get().loadLocal(transition.namespace, { allowLegacy: false });
    await writeActiveLocalLedgerContext({
      namespace: transition.namespace,
      linkedUserId: nextUserId,
      identity: localIdentityFromState(get()),
    });

    const loadedIdentity = localIdentityFromState(get());
    await hydrateProfile({ ...priorIdentity, ...loadedIdentity });

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

  activateFinancialV7Cutover: async () => {
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
    const queued = syncQueue.then(async () => {
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

  loadLocal: async (requestedNamespace = null, options = {}) => {
    const namespace = requestedNamespace || await readActiveLocalLedgerNamespace();
    const allowLegacy = Object.prototype.hasOwnProperty.call(options || {}, 'allowLegacy')
      ? !!options.allowLegacy
      : namespace === GUEST_NAMESPACE;
    try {
      const resetMarker = await readResetMarker(namespace);
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
            await get().activateFinancialV7Cutover();
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

  clearAndResetVault: async () => {
    const namespace = get().workspaceNamespace || GUEST_NAMESPACE;
    try {
      await clearVaultSnapshot(namespace);
      await get().loadLocal(namespace, { allowLegacy: false });
      set({ vaultUnreadable: false, lastSyncError: null, vaultError: null, vaultRecovery: null });
      return true;
    } catch (e) {
      console.error('[STORE] clearAndResetVault', e);
      set({ lastSyncError: String(e?.message || 'reset_failed') });
      return false;
    }
  },

  saveLocal: async ({ dirty = true, force = false } = {}) => {
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
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(current.workspaceNamespace, clean.cfg),
        changes: [{
          entityType: 'workspace',
          id: 'workspace',
          payload: {
            cfg: clean.cfg,
            notif: clean.notif,
            cloudRevision: Number(clean.cloudRevision || 0),
          },
        }],
      });
      if (committed.supported && !committed.ok) {
        throw new Error(committed.reason || 'financial_v7_workspace_metadata_commit_failed');
      }
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
    const queued = syncQueue.then(async () => {
      const syncStartedAt = new Date().toISOString();
      const initial = get();
      if (!initial.user || initial.cfg.demoMode || !initial.workspaceReady) return false;
      const syncUserId = initial.user.id;

      set({ syncing: true, lastSyncError: null });

      try {
        const namespace = initial.workspaceNamespace || workspaceNamespaceForSession({ user: initial.user });
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
            // Before the durable activation marker exists, V1 remains the
            // operational fallback. A failed verification never activates V2.
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
          if (!financialMutationSync.ok) {
            // Never fall back to snapshot pull after V7 cutover. Snapshot
            // absence previously generated local void/delete mutations.
            throw new Error(financialMutationSync.reason || 'financial_v7_mutation_sync_required');
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

        const persistSynced = async ({ revision, syncedAt, syncConflict = null }) => {
          if (get().user?.id !== syncUserId) return false;
          if (await supersededByReset()) return false;
          const revisionValue = Number(revision || 0);
          const syncedAtValue = syncedAt || new Date().toISOString();
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
                payload: { cfg: finalState.cfg, notif: finalState.notif, cloudRevision: revisionValue },
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
                  })
                : await syncFinancialMutationsV7({
                    supabase,
                    namespace: getLedgerNamespace(namespace, finalState.cfg),
                    deviceId,
                  });
              if (!bridged?.ok) {
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
            p_cfg: current.cfg,
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
        if (get().user?.id === syncUserId) {
          set({
            online: false,
            lastSyncError: String(e?.message || 'sync_failed'),
          });
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

  transferGuestToCurrent: async () => {
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

  restoreLastMergeRollback: async () => {
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
