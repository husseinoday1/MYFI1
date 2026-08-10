import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeWorkspaceStates, sameWorkspaceData } from '../multiDeviceSync';
import { supabase } from '../../lib/supabase';
import { STORAGE, DEF_CATS, DEF_CFG, DEF_NOTIF, LEGACY_STORAGE_KEYS } from '../../lib/constants';
import { normalizedPreviewEnabled, normalizedShadowEnabled } from '../../lib/databaseMode';
import { compareSnapshots, loadNormalizedSnapshot } from '../../lib/normalizedRepository';
import {
  GUEST_NAMESPACE,
  clearVaultSnapshot,
  getOrCreateDeviceId,
  namespaceForUser,
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

const RESET_MARKER_PREFIX = 'MYFI_INTENTIONAL_RESET_V1';
const syncBaseNamespace = namespace => `sync-base:${String(namespace || GUEST_NAMESPACE)}`;
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
    const current = get();
    const nextId = user?.id || null;
    const currentId = current.user?.id || null;
    const namespace = namespaceForUser(user);
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
      const guest = await readVaultSnapshot(GUEST_NAMESPACE);
      const guestPreview = buildGuestTransferPreview(get(), guest.snapshot);
      set({
        pendingGuestTransfer: guestPreview.hasData,
        guestTransferPreview: guestPreview.hasData ? guestPreview : null,
      });
    }
  },
  setOnline: (v)    => set({ online: v }),

  loadLocal: async (namespace = GUEST_NAMESPACE, { allowLegacy = namespace === GUEST_NAMESPACE } = {}) => {
    try {
      let { snapshot, recovered, backupIndex } = await readVaultSnapshot(namespace);
      const resetMarker = await readResetMarker(namespace);
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
      const cleanDemo = dedupeWorkspaceData({ ...current, localUpdatedAt: updatedAt, dirty: nextDirty });
      const demoSnapshot = snapshotFromState(cleanDemo, { updatedAt, dirty: nextDirty });
      await AsyncStorage.setItem(STORAGE.DEMO_DATA, JSON.stringify(demoSnapshot));
      set({
        trans: cleanDemo.trans,
        debts: cleanDemo.debts,
        goals: cleanDemo.goals,
        wallets: cleanDemo.wallets,
        commitments: cleanDemo.commitments,
        cats: cleanDemo.cats,
        cfg: cleanDemo.cfg,
        localUpdatedAt: updatedAt,
        dirty: nextDirty,
      });
      return;
    }
    const next = { ...current, localUpdatedAt: updatedAt, dirty: nextDirty };
    const clean = dedupeWorkspaceData(next);
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

  syncCloud: async (options = {}) => {
    const queued = syncQueue.then(async () => {
      const initial = get();
      if (!initial.user || initial.cfg.demoMode || !initial.workspaceReady) return false;
      const syncUserId = initial.user.id;

      set({ syncing: true, lastSyncError: null });

      try {
        const namespace = initial.workspaceNamespace || namespaceForUser(initial.user);
        const baseNamespace = syncBaseNamespace(namespace);
        const deviceId = await getOrCreateDeviceId();
        const { snapshot: baseSnapshot } = await readVaultSnapshot(baseNamespace);
        let baseState = baseSnapshot
          ? stateFromSnapshot(baseSnapshot, initial.cfg)
          : null;
        let pendingSyncConflict = null;

        const persistSynced = async ({ revision, syncedAt, syncConflict = null }) => {
          if (get().user?.id !== syncUserId) return false;
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

          await writeVaultSnapshot(namespace, finalSnapshot, { force: empty });
          await writeVaultSnapshot(baseNamespace, finalSnapshot, { force: true });

          if (empty) {
            await writeResetMarker(namespace, { pendingCloudSync: false });
          }

          baseState = stateFromSnapshot(finalSnapshot, finalState.cfg);
          return true;
        };

        const applyMergedState = async ({ remoteState, cloudRevision }) => {
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
        };

        // Four attempts are enough to absorb a second device writing during
        // this sync without creating an endless retry loop.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (get().user?.id !== syncUserId) return false;
          const currentBeforePull = get();

          const { data: cloud, error: fetchError } = await supabase
            .from('user_data')
            .select('*')
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
              await applyMergedState({ remoteState, cloudRevision });

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

              await applyMergedState({ remoteState, cloudRevision });

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

          if (result?.accepted) {
            const revision = Number(result.revision || expectedRevision + 1);
            const syncedAt = result.updated_at || new Date().toISOString();
            return persistSynced({ revision, syncedAt, syncConflict: pendingSyncConflict });
          }

          // Another phone wrote between our pull and push. Keep our merged
          // state, pull its newest revision on the next loop, merge again,
          // and retry instead of asking the user to throw one side away.
          set({
            online: true,
            dirty: true,
            cloudRevision: Number(result?.revision || cloudRevision),
            syncConflict: null,
            lastSyncError: attempt < 3 ? null : 'sync_race_retry_required',
          });
        }

        return false;
      } catch (e) {
        console.error('[STORE] multi-device sync', e);
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
    const namespace = namespaceForUser(current.user);
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
    const accountHasData = hasMeaningfulLocalData({
      trans: current.trans,
      debts: current.debts,
      goals: current.goals,
      wallets: current.wallets,
      commitments: current.commitments,
    });
    if (!accountHasData) {
      set({
        ...guest,
        user: current.user,
        workspaceNamespace: namespaceForUser(current.user),
        workspaceReady: true,
        dirty: true,
        cloudRevision: current.cloudRevision,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        lastMergeRollback: rollback,
        syncConflict: null,
      });
    } else {
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
        if (referencedGuestWalletIds.has(item.id) && !currentWalletIds.has(item.id)) return true;
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
        currency: current.cfg.currency,
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
        workspaceNamespace: namespaceForUser(current.user),
        workspaceReady: true,
        dirty: true,
        cloudRevision: current.cloudRevision,
        pendingGuestTransfer: false,
        guestTransferPreview: null,
        lastMergeRollback: rollback,
        syncConflict: null,
      });
    }
    await get().saveLocal({ dirty: true, force: true });
    await clearVaultSnapshot(GUEST_NAMESPACE);
    const synced = await get().syncCloud();
    return { ok: synced || true, reason: 'merged', rollbackAvailable: true, preview };
  },

  dismissGuestTransfer: () => set({ pendingGuestTransfer: false, guestTransferPreview: null }),

  restoreLastMergeRollback: async () => {
    const current = get();
    const namespace = current.workspaceNamespace || namespaceForUser(current.user);
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
