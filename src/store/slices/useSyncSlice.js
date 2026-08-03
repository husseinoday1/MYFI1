import AsyncStorage from '@react-native-async-storage/async-storage';
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
  financialDataCount,
  snapshotFromState,
  stateFromSnapshot,
  uid,
} from '../domain';

let syncQueue = Promise.resolve();


const parseJson = (raw, fallback = null) => {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
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

    set({
      user: user || null,
      workspaceReady: false,
      pendingGuestTransfer: false,
      syncConflict: null,
      lastSyncError: null,
    });
    await get().loadLocal(namespace, { allowLegacy: !user });
    if (user) {
      const guest = await readVaultSnapshot(GUEST_NAMESPACE);
      set({ pendingGuestTransfer: financialDataCount(guest.snapshot?.data || guest.snapshot) > 0 });
    }
  },
  setOnline: (v)    => set({ online: v }),

  loadLocal: async (namespace = GUEST_NAMESPACE, { allowLegacy = namespace === GUEST_NAMESPACE } = {}) => {
    try {
      let { snapshot, recovered } = await readVaultSnapshot(namespace);

      if (allowLegacy && (!snapshot || financialDataCount(snapshot.data || snapshot) === 0)) {
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
        syncConflict: null,
        vaultUnreadable: false,
        vaultError: null,
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
      set({ vaultUnreadable: false, lastSyncError: null, vaultError: null });
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
      const demoSnapshot = snapshotFromState(current, { updatedAt, dirty: nextDirty });
      await AsyncStorage.setItem(STORAGE.DEMO_DATA, JSON.stringify(demoSnapshot));
      set({ localUpdatedAt: updatedAt, dirty: nextDirty });
      return;
    }
    const next = { ...current, localUpdatedAt: updatedAt, dirty: nextDirty };
    await writeVaultSnapshot(current.workspaceNamespace, snapshotFromState(next), { force });
    set({ localUpdatedAt: updatedAt, dirty: nextDirty });
  },

  syncCloud: async () => {
    const queued = syncQueue.then(async () => {
      const current = get();
      if (!current.user || current.cfg.demoMode || !current.workspaceReady) return false;
      if (!current.dirty) return true;
      set({ syncing: true, lastSyncError: null });
      try {
        const deviceId = await getOrCreateDeviceId();
        const { data, error } = await supabase.rpc('sync_user_data_v2', {
          p_expected_revision: Number(current.cloudRevision || 0),
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
        const result = Array.isArray(data) ? data[0] : data;
        if (!result?.accepted) {
          const { data: cloud, error: fetchError } = await supabase
            .from('user_data')
            .select('*')
            .eq('user_id', current.user.id)
            .maybeSingle();
          if (fetchError) throw fetchError;
          set({
            online: true,
            syncConflict: cloud ? { cloud, cloudRevision: Number(cloud.revision || result?.revision || 0) } : null,
            lastSyncError: 'sync_conflict',
          });
          return false;
        }
        const syncedAt = result.updated_at || new Date().toISOString();
        const cloudRevision = Number(result.revision || current.cloudRevision + 1);
        set({
          online: true,
          dirty: false,
          cloudRevision,
          lastSyncedAt: syncedAt,
          lastSyncError: null,
          syncConflict: null,
        });
        await writeVaultSnapshot(
          current.workspaceNamespace,
          snapshotFromState(get(), { dirty: false, cloudRevision, lastSyncedAt: syncedAt }),
        );
        return true;
      } catch (e) {
        console.error('[STORE] syncCloud', e);
        set({ online: false, lastSyncError: String(e?.message || 'sync_failed') });
        return false;
      } finally {
        set({ syncing: false });
      }
    });
    syncQueue = queued.catch(() => false);
    return queued;
  },

  loadCloud: async () => {
    const current = get();
    const { user } = current;
    if (!user || !current.workspaceReady) return false;
    set({ syncing: true, lastSyncError: null });
    try {
      const { data, error } = await supabase.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (!data) {
        if (!get().dirty) {
          set({ dirty: true, cloudRevision: 0 });
          await get().saveLocal({ dirty: true });
        }
        return await get().syncCloud();
      }
      const cloudRevision = Number(data.revision || 0);
      if (get().dirty && cloudRevision !== Number(get().cloudRevision || 0)) {
        set({
          online: true,
          syncConflict: { cloud: data, cloudRevision },
          lastSyncError: 'sync_conflict',
        });
        return false;
      }
      if (get().dirty) return await get().syncCloud();

      const accepted = stateFromSnapshot(cloudSnapshot(data, get().notif), get().cfg);
      set({
        ...accepted,
        user,
        workspaceNamespace: get().workspaceNamespace,
        workspaceReady: true,
        online: true,
        syncConflict: null,
        lastSyncError: null,
      });
      await get().saveLocal({ dirty: false });
      if (normalizedShadowEnabled) await get().previewNormalizedCloud({ baseline: accepted });
      return true;
    } catch (e) {
      console.error('[STORE] loadCloud', e);
      set({ online: false, lastSyncError: String(e?.message || 'sync_failed') });
      return false;
    } finally {
      set({ syncing: false });
    }
  },

  transferGuestToCurrent: async () => {
    const current = get();
    if (!current.user) return false;
    const { snapshot } = await readVaultSnapshot(GUEST_NAMESPACE);
    if (!snapshot || financialDataCount(snapshot.data || snapshot) === 0) {
      set({ pendingGuestTransfer: false });
      return false;
    }
    const guest = stateFromSnapshot(snapshot, current.cfg);
    const accountHasData = financialDataCount(current) > 0;
    if (!accountHasData) {
      set({
        ...guest,
        user: current.user,
        workspaceNamespace: namespaceForUser(current.user),
        workspaceReady: true,
        dirty: true,
        cloudRevision: current.cloudRevision,
        pendingGuestTransfer: false,
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
      const walletIds = remapIds(guest.wallets, current.wallets);
      const debtIds = remapIds(guest.debts, current.debts);
      const goalIds = remapIds(guest.goals, current.goals);
      const commitmentIds = remapIds(guest.commitments, current.commitments);
      const transactionIds = remapIds(guest.trans, current.trans);
      const mapWallet = id => walletIds.get(id) || id;
      const mapLinkedId = (type, id) => {
        if (type === 'debt' || type === 'receivable') return debtIds.get(id) || id;
        if (type === 'goal') return goalIds.get(id) || id;
        return id;
      };
      const guestWallets = guest.wallets.map(item => ({
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
      set({
        trans: [...guestTrans, ...current.trans],
        debts: [...guestDebts, ...current.debts],
        goals: [...guestGoals, ...current.goals],
        wallets: [...current.wallets, ...guestWallets],
        commitments: [...guestCommitments, ...current.commitments],
        cats: [...current.cats, ...guest.cats.filter(item => !knownCats.has(item.id))],
        user: current.user,
        workspaceNamespace: namespaceForUser(current.user),
        workspaceReady: true,
        dirty: true,
        cloudRevision: current.cloudRevision,
        pendingGuestTransfer: false,
        syncConflict: null,
      });
    }
    await get().saveLocal({ dirty: true });
    const synced = await get().syncCloud();
    if (synced) await clearVaultSnapshot(GUEST_NAMESPACE);
    return synced;
  },

  dismissGuestTransfer: () => set({ pendingGuestTransfer: false }),

  resolveSyncConflict: async (strategy = 'cloud') => {
    const conflict = get().syncConflict;
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
