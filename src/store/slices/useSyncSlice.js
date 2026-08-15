// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
// MYFI_PERFORMANCE_DATA_PERSISTENCE_V5_1_1
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { workspaceNamespaceForSession } from '../../lib/accountWorkspace';
import { readPerformanceSnapshot, schedulePerformanceSnapshotWrite } from '../../dev/performanceTestStorage';
import { exportColdArchives, getColdArchiveNamespace, replaceColdArchives } from '../../lib/localArchiveRepository';
import { runFinancialShadowMigrationV7 } from '../../lib/financialLedgerV7Migration';
import {
  getFinancialWorkspaceStateV7,
  readFinancialWorkspaceV7,
  reconcileFinancialWorkspaceV7,
  cloneFinancialWorkspaceV7,
  clearFinancialWorkspaceV7,
} from '../../lib/financialLedgerV7Repository';
import { compareSnapshots, loadNormalizedSnapshot } from '../../lib/normalizedRepository';
import { syncFinancialMutationsV7 } from '../../lib/financialMutationSync';
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

  setUser: async (user) => {
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
      return;
    }

    const current = get();
    const priorIdentity = accountIdentityPatch({
      displayName: current.cfg?.displayName || current.cfg?.name,
      avatarUri: current.cfg?.avatarUri,
      avatarPath: current.cfg?.avatarPath,
    });
    const nextId = user?.id || null;
    const currentId = current.user?.id || null;
    const namespace = workspaceNamespaceForSession({ user });
    if (nextId === currentId && current.workspaceNamespace === namespace && current.workspaceReady) {
      set({ user: user || null });
      return;
    }

    // Persist the outgoing account before changing namespaces. This protects
    // offline edits when logout happens before the next scheduled save.
    if (current.user && current.workspaceReady && current.dirty && !current.cfg.demoMode) {
      await get().saveLocal({ dirty: true, force: true });
    }

    set({
      user: user || null,
      workspaceReady: false,
      pendingGuestTransfer: false,
      syncing: false,
      syncConflict: null,
      lastSyncError: null,
      guestTransferPreview: null,
    });
    await get().loadLocal(namespace, { allowLegacy: !user });
    if (user) {
      // Account identity is separate from the financial workspace. Existing
      // cloud identity wins on a new phone; a brand-new account is seeded once
      // from the device profile so name/photo follow the MYFI account.
      try {
        const profile = await ensureProfileIdentity(supabase, user, priorIdentity);
        if (profile?.patch && Object.keys(profile.patch).length) {
          set({ cfg: normalizeCfg({ ...get().cfg, ...profile.patch }) });
          await get().saveLocal({ dirty: false, force: true });
        }
      } catch (error) {
        console.warn('[STORE] profile hydrate', error);
      }

      const guest = await readVaultSnapshot(GUEST_NAMESPACE);
      const guestPreview = buildGuestTransferPreview(get(), guest.snapshot);
      set({
        pendingGuestTransfer: guestPreview.hasData,
        guestTransferPreview: guestPreview.hasData ? guestPreview : null,
      });
    }
  },
  setOnline: (v)    => set({ online: v }),

  refreshDataHealth: async () => {
    if (!activeLedgerSupported()) {
      const result = { ok: false, supported: false, issues: ['sqlite_unavailable'] };
      set({ dataHealth: result });
      return result;
    }
    try {
      await flushLedgerMirror();
      const current = get();
      const result = await getLedgerDataHealth({
        namespace: getLedgerNamespace(current.workspaceNamespace || GUEST_NAMESPACE, current.cfg),
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

  scheduleCloudSync: (reason = 'local_change') => {
    scheduledSyncAttempt = 0;
    return armScheduledCloudSync(get, reason, 0);
  },

  loadLocal: async (namespace = GUEST_NAMESPACE, { allowLegacy = namespace === GUEST_NAMESPACE } = {}) => {
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
        return true;
      }

      if (activeLedgerSupported()) {
        const v7Namespace = getLedgerNamespace(namespace, get().cfg || DEF_CFG);
        const v7State = await getFinancialWorkspaceStateV7({ namespace: v7Namespace });
        if (v7State?.source_mode === 'sqlite') {
          const v7Workspace = await readFinancialWorkspaceV7({ namespace: v7Namespace, includeArchived: false });
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
          // Transitional read adapter for screens that still issue V6 aggregate
          // queries. The source is V7 here; Vault is never used to rebuild it.
          await replaceLedgerSnapshot({
            namespace: v7Namespace,
            transactions: loadedV7.trans,
            wallets: loadedV7.wallets,
            baseCurrency: loadedV7.cfg?.currency || 'IQD',
          });
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
        } catch (ledgerError) {
          console.warn('[LEDGER] bootstrap', ledgerError);
          set({ ledgerReady: false, ledgerError: String(ledgerError?.message || ledgerError) });
        }
      } else {
        set({ ledgerReady: false, ledgerError: null, dataHealth: { ok: true, supported: false, issues: [] } });
      }
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
    if (activeLedgerSupported()) {
      const reconciled = await reconcileFinancialWorkspaceV7({
        namespace: getLedgerNamespace(current.workspaceNamespace, clean.cfg),
        workspace: clean,
      });
      if (reconciled.supported && !reconciled.ok) throw new Error(reconciled.reason || 'financial_v7_workspace_reconcile_failed');
    }
    if (activeLedgerSupported()) await flushLedgerMirror();
    await writeVaultSnapshot(current.workspaceNamespace, snapshotFromState(clean), { force });
    if (force && financialDataCount(clean) === 0) {
      await writeResetMarker(current.workspaceNamespace, { pendingCloudSync: !!current.user });
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
    const guest = await readVaultSnapshot(GUEST_NAMESPACE);
    const guestWasMeaningful = !!(guest.snapshot && hasMeaningfulLocalData(guest.snapshot));
    const rollbackGuestSnapshot = guest.snapshot && !guestWasMeaningful ? guest.snapshot : null;

    if (guestWasMeaningful) {
      const transferResult = await get().transferGuestToCurrent();
      if (transferResult === false) throw new Error('guest_workspace_merge_failed');
      current = get();
    }

    await get().saveLocal({ dirty: false, force: true });
    current = get();
    if (activeLedgerSupported()) {
      const sourceLedgerNamespace = getLedgerNamespace(accountNamespace, current.cfg);
      const targetLedgerNamespace = getLedgerNamespace(GUEST_NAMESPACE, current.cfg);
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
      ...dedupeWorkspaceData(current),
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
        // Capture a high-water mark. Mutations created while this network sync is
        // in flight get larger ids and are never accidentally acknowledged.
        const outboxAtStart = activeLedgerSupported() ? await drainLedgerOutbox(namespace, 1000) : [];
        const outboxHighWater = outboxAtStart.length ? Number(outboxAtStart[outboxAtStart.length - 1]?.id || 0) : 0;
        const deviceId = await getOrCreateDeviceId();
        let financialMutationSync = null;
        if (activeLedgerSupported() && initial.financialLedgerV7Cutover) {
          financialMutationSync = await syncFinancialMutationsV7({
            supabase,
            namespace: getLedgerNamespace(namespace, initial.cfg),
            deviceId,
          });
          if (financialMutationSync.ok && financialMutationSync.downloaded > 0) {
            const v7Workspace = await readFinancialWorkspaceV7({
              namespace: getLedgerNamespace(namespace, initial.cfg),
              includeArchived: false,
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
          // Snapshot sync below intentionally remains active as the rollback
          // bridge until mutation sync has passed a real two-device release gate.
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
          const current = get();
          set({
            dirty: false,
            cloudRevision: Number(revision || 0),
            lastSyncedAt: syncedAt || new Date().toISOString(),
            online: true,
            lastSyncError: null,
            syncConflict,
          });

          const finalState = get();
          const finalSnapshot = snapshotFromState(finalState, {
            dirty: false,
            cloudRevision: Number(revision || 0),
            lastSyncedAt: syncedAt || new Date().toISOString(),
          });
          const empty = financialDataCount(finalState) === 0;

          if (activeLedgerSupported()) {
            const reconciled = await reconcileFinancialWorkspaceV7({
              namespace: getLedgerNamespace(namespace, finalState.cfg),
              workspace: finalState,
            });
            if (reconciled.supported && !reconciled.ok) {
              throw new Error(reconciled.reason || 'financial_v7_post_sync_reconcile_failed');
            }
            if (reconciled.ok && (
              Number(reconciled.updatedTransactions || 0)
              + Number(reconciled.updatedEntities || 0)
              + Number(reconciled.voidedTransactions || 0)
            ) > 0) {
              const bridged = await syncFinancialMutationsV7({
                supabase,
                namespace: getLedgerNamespace(namespace, finalState.cfg),
                deviceId,
              });
              set({ financialMutationSync: bridged });
            }
          }

          await writeVaultSnapshot(namespace, finalSnapshot, { force: empty });
          await writeVaultSnapshot(baseNamespace, finalSnapshot, { force: true });

          if (empty) {
            await writeResetMarker(namespace, { pendingCloudSync: false });
          }

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
          if (await supersededByReset()) return false;
          const current = get();
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
              {
                ...current,
                ...merged,
                user: current.user,
              },
              {
                dirty: true,
                cloudRevision,
              },
            ),
            current.cfg,
          );

          set({
            ...normalized,
            user: current.user,
            workspaceNamespace: namespace,
            workspaceReady: true,
            online: true,
            dirty: true,
            cloudRevision,
            syncConflict: pendingSyncConflict,
            lastSyncError: null,
          });

          await writeVaultSnapshot(
            namespace,
            snapshotFromState(get(), {
              dirty: true,
              cloudRevision,
            }),
          );
          return true;
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

            if (!baseState) {
              // First run after this upgrade: neither phone has a safe common
              // merge base yet. Union both sides so current divergent data is
              // preserved, then establish a base after the successful push.
              const applied = await applyMergedState({ remoteState, cloudRevision });
              if (!applied) return false;

              if (sameWorkspaceData(get(), remoteState)) {
                return persistSynced({
                  revision: cloudRevision,
                  syncedAt: cloud.updated_at || new Date().toISOString(),
                  syncConflict: pendingSyncConflict,
                });
              }
            } else {
              const localChanged = (
                !!get().dirty
                || !sameWorkspaceData(baseState, get())
              );
              const remoteChanged = (
                cloudRevision !== Number(baseSnapshot?.cloudRevision || 0)
                || !sameWorkspaceData(baseState, remoteState)
              );

              if (!localChanged && remoteChanged) {
                pendingSyncConflict = null;
                set({
                  ...remoteState,
                  user: get().user,
                  workspaceNamespace: namespace,
                  workspaceReady: true,
                  online: true,
                  dirty: false,
                  cloudRevision,
                  syncConflict: null,
                  lastSyncError: null,
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
              if (sameWorkspaceData(get(), remoteState)) {
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
          const current = get();
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
    const current = get();
    if (!current.user) return false;
    const { snapshot } = await readVaultSnapshot(GUEST_NAMESPACE);
    if (!snapshot || !hasMeaningfulLocalData(snapshot)) {
      set({ pendingGuestTransfer: false, guestTransferPreview: null });
      return false;
    }
    const namespace = workspaceNamespaceForSession({ user: current.user });
    const rollback = await saveMergeRollback({
      namespace,
      accountSnapshot: snapshotFromState(current),
      guestSnapshot: snapshot,
      type: 'guest_transfer',
    });
    const preview = buildGuestTransferPreview(current, snapshot);
    if (!preview.addsData) {
      await clearVaultSnapshot(GUEST_NAMESPACE);
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
      if (!referencedGuestWalletIds.has(item.id)) return false;
      const existing = current.wallets.find(wallet => wallet.id === item.id);
      if (!existing) return true;
      // Same technical ID does not mean the same financial account. A guest IRR
      // wallet must not be collapsed into an account IQD wallet during sign-in.
      return String(existing.currency || current.cfg.currency).toUpperCase()
        !== String(item.currency || guest.cfg.currency).toUpperCase();
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
    set({
      ...merged,
      user: current.user,
      workspaceNamespace: workspaceNamespaceForSession({ user: current.user }),
      workspaceReady: true,
      dirty: true,
      cloudRevision: current.cloudRevision,
      pendingGuestTransfer: false,
      guestTransferPreview: null,
      lastMergeRollback: rollback,
      syncConflict: null,
    });
    await get().saveLocal({ dirty: true, force: true });
    await clearVaultSnapshot(GUEST_NAMESPACE);
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
    if (rollback.guestSnapshot) {
      await writeVaultSnapshot(GUEST_NAMESPACE, rollback.guestSnapshot, { force: true });
    } else {
      await clearVaultSnapshot(GUEST_NAMESPACE);
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
