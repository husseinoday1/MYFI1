import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { STORAGE, DEF_CATS, DEF_CFG, DEF_NOTIF, normalizeCfg } from '../lib/constants';
import { calcStats, catSpend, today, normalizeDate } from '../utils/calc';
import { attachDefaultWalletToTransactions, getDefaultWalletId, normalizeWallets } from '../lib/wallets';
import { deferredCommitmentDueISO, monthKey, normalizeCommitments } from '../lib/commitments';
import { normalizeBudgets, suggestBudgetsFromHistory } from '../lib/budgets';
import {
  FLOW_TYPES,
  defaultScopeForProfile,
  getActiveScope,
  getEntryScope,
  normalizeLedgerTransaction,
  normalizeScope,
} from '../lib/modules';
import {
  GUEST_NAMESPACE,
  clearVaultSnapshot,
  getOrCreateDeviceId,
  hasVaultSnapshot,
  namespaceForUser,
  readVaultSnapshot,
  writeVaultSnapshot,
} from '../lib/secureVault';

const uid = () => Crypto.randomUUID();
const sumAmt = (items = []) => items.reduce((a, p) => a + Number(p.amt || 0), 0);
const debtPaidTotal = (item, payments = item?.payments || []) => Number(item?.archivedPaid || 0) + sumAmt(payments);
const goalSavedTotal = (item, savings = item?.savings || []) => Number(item?.archivedSaved || 0) + sumAmt(savings);
const remainingAmount = (total, paid) => Math.max(0, Number(total || 0) - Number(paid || 0));
const capLinkedAmount = (requested, total, paid, current = 0) => {
  const n = Math.abs(Number(requested) || 0);
  const maxAllowed = remainingAmount(total, Number(paid || 0) - Number(current || 0));
  return Math.min(n, maxAllowed);
};
const normalizeDebtItems = (items = [], fallbackScope = 'personal') =>
  (Array.isArray(items) ? items : [])
    .filter(item => item && item.id)
    .map(item => {
      const payments = (Array.isArray(item.payments) ? item.payments : [])
        .filter(payment => payment && payment.id)
        .map(payment => ({
          ...payment,
          amt: Math.abs(Number(payment.amt || 0)),
          date: normalizeDate(payment.date || payment.dateISO),
        }));
      const archivedPaid = Math.abs(Number(item.archivedPaid || 0));
      const paid = archivedPaid + (
        payments.length > 0
          ? sumAmt(payments)
          : Math.max(0, Math.abs(Number(item.paid || 0)) - archivedPaid)
      );
      const total = Math.max(Math.abs(Number(item.total || 0)), paid);
      return {
        ...item,
        scope: normalizeScope(item.scope, fallbackScope),
        total,
        paid,
        archivedPaid,
        payments,
        direction: item.direction === 'receivable' ? 'receivable' : 'owed',
        createdAt: normalizeDate(item.createdAt),
      };
    });
const normalizeGoalItems = (items = [], fallbackScope = 'personal') =>
  (Array.isArray(items) ? items : [])
    .filter(item => item && item.id)
    .map(item => {
      const savings = (Array.isArray(item.savings) ? item.savings : [])
        .filter(saving => saving && saving.id)
        .map(saving => ({
          ...saving,
          amt: Math.abs(Number(saving.amt || 0)),
          date: normalizeDate(saving.date || saving.dateISO),
        }));
      const archivedSaved = Math.abs(Number(item.archivedSaved || 0));
      const saved = archivedSaved + (
        savings.length > 0
          ? sumAmt(savings)
          : Math.max(0, Math.abs(Number(item.cur || 0)) - archivedSaved)
      );
      const target = Math.max(Math.abs(Number(item.target || 0)), saved);
      return {
        ...item,
        scope: normalizeScope(item.scope, fallbackScope),
        target,
        cur: saved,
        archivedSaved,
        savings,
        createdAt: normalizeDate(item.createdAt),
      };
    });
const latestCommitmentMonth = (trans = [], commitmentId) => {
  const months = trans
    .filter(t => t.isCommitmentPayment && t.commitmentId === commitmentId)
    .map(t => t.commitmentMonth || monthKey(t.dateISO))
    .filter(Boolean)
    .sort();
  return months[months.length - 1] || null;
};
const syncCommitmentPaidMonth = (commitments = [], trans = [], commitmentId) =>
  commitments.map(item => {
    if (commitmentId && item.id !== commitmentId) return item;
    const lastPaidMonth = latestCommitmentMonth(trans, item.id);
    return {
      ...item,
      lastPaidMonth,
      ...(item.repeatMonthly === false && !lastPaidMonth ? { active: true } : {}),
    };
  });

const yearOf = (value) => {
  const match = String(value || '').match(/^(\d{4})-\d{2}-\d{2}$/);
  return match ? Number(match[1]) : null;
};

const archivedWalletMovement = (trans = [], wallets = [], defaultWalletId = null) => {
  const movement = new Map((wallets || []).map(wallet => [wallet.id, 0]));
  trans.forEach(tx => {
    if (tx.kind === 'transfer') {
      const amount = Math.abs(Number(tx.transferAmount || 0));
      if (movement.has(tx.fromWalletId)) movement.set(tx.fromWalletId, movement.get(tx.fromWalletId) - amount);
      if (movement.has(tx.toWalletId)) movement.set(tx.toWalletId, movement.get(tx.toWalletId) + amount);
      return;
    }
    const walletId = tx.walletId || defaultWalletId;
    if (movement.has(walletId)) movement.set(walletId, movement.get(walletId) + Number(tx.amt || 0));
  });
  return movement;
};

const demoDate = (monthOffset, day) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + monthOffset, day, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const prepareWalletData = ({ wallets, trans, commitments, cfg }) => {
  const fallbackScope = defaultScopeForProfile(cfg.profileType);
  let normalizedWallets = normalizeWallets(wallets, cfg.currency).map(wallet => ({
    ...wallet,
    scope: normalizeScope(wallet.scope, fallbackScope),
  }));
  const requiredScopes = [fallbackScope];
  requiredScopes.forEach(scope => {
    if (normalizedWallets.some(wallet => wallet.scope === scope)) return;
    normalizedWallets.push({
      ...normalizeWallets([], cfg.currency)[0],
      id: scope === 'business' ? 'wallet_business' : 'wallet_personal',
      name: scope === 'business' ? 'محفظة العمل' : 'المحفظة الشخصية',
      nameEn: scope === 'business' ? 'Business wallet' : 'Personal wallet',
      scope,
    });
  });
  const defaultWalletId = getDefaultWalletId(normalizedWallets, cfg.currency, cfg.defaultWalletId);
  const normalizedTrans = (Array.isArray(trans) ? trans : [])
    .map(tx => normalizeLedgerTransaction(tx, fallbackScope));
  return {
    cfg: { ...cfg, defaultWalletId },
    wallets: normalizedWallets,
    trans: attachDefaultWalletToTransactions(normalizedTrans, normalizedWallets, cfg.currency, defaultWalletId),
    commitments: normalizeCommitments(commitments, defaultWalletId).map(item => ({
      ...item,
      scope: normalizeScope(item.scope, fallbackScope),
    })),
  };
};

const financialDataCount = (snapshot = {}) => (
  (snapshot.trans || []).length
  + (snapshot.debts || []).length
  + (snapshot.goals || []).length
  + (snapshot.commitments || []).length
);

const snapshotFromState = (state = {}, overrides = {}) => ({
  v: 7,
  data: {
    trans: state.trans || [],
    debts: state.debts || [],
    goals: state.goals || [],
    wallets: state.wallets || [],
    commitments: state.commitments || [],
  },
  cats: state.cats || DEF_CATS,
  cfg: state.cfg || DEF_CFG,
  notif: state.notif || DEF_NOTIF,
  updatedAt: overrides.updatedAt || state.localUpdatedAt || new Date().toISOString(),
  lastSyncedAt: overrides.lastSyncedAt ?? state.lastSyncedAt ?? null,
  cloudRevision: Number(overrides.cloudRevision ?? state.cloudRevision ?? 0),
  dirty: overrides.dirty ?? state.dirty ?? false,
});

const stateFromSnapshot = (snapshot = {}, fallbackCfg = DEF_CFG) => {
  const data = snapshot.data || snapshot;
  const cfg = normalizeCfg(snapshot.cfg || data.cfg || fallbackCfg);
  const prepared = prepareWalletData({
    wallets: data.wallets,
    trans: data.trans || [],
    commitments: data.commitments,
    cfg,
  });
  return {
    trans: prepared.trans,
    debts: normalizeDebtItems(data.debts, defaultScopeForProfile(prepared.cfg.profileType)),
    goals: normalizeGoalItems(data.goals, defaultScopeForProfile(prepared.cfg.profileType)),
    wallets: prepared.wallets,
    commitments: prepared.commitments,
    cats: snapshot.cats || data.cats || DEF_CATS,
    cfg: prepared.cfg,
    notif: { ...DEF_NOTIF, ...(snapshot.notif || data.notif || {}) },
    localUpdatedAt: snapshot.updatedAt || null,
    lastSyncedAt: snapshot.lastSyncedAt || null,
    cloudRevision: Number(snapshot.cloudRevision || 0),
    dirty: !!snapshot.dirty,
  };
};

const cloudSnapshot = (row = {}, notif = DEF_NOTIF) => ({
  v: 7,
  data: {
    trans: row.trans || [],
    debts: row.debts || [],
    goals: row.goals || [],
    wallets: row.wallets || [],
    commitments: row.commitments || [],
  },
  cats: row.cats || DEF_CATS,
  cfg: row.cfg || DEF_CFG,
  notif,
  updatedAt: row.updated_at || new Date().toISOString(),
  lastSyncedAt: row.updated_at || new Date().toISOString(),
  cloudRevision: Number(row.revision || 0),
  dirty: false,
});

let syncQueue = Promise.resolve();

export const useStore = create((set, get) => ({
  trans:   [],
  debts:   [],
  goals:   [],
  wallets: [],
  commitments: [],
  cats:    DEF_CATS,
  cfg:     DEF_CFG,
  notif:   DEF_NOTIF,
  user:    null,
  syncing: false,
  online:  true,
  lastSyncError: null,
  lastSyncedAt: null,
  workspaceNamespace: GUEST_NAMESPACE,
  workspaceReady: false,
  pendingGuestTransfer: false,
  dirty: false,
  localUpdatedAt: null,
  cloudRevision: 0,
  syncConflict: null,

  // ✅ FIX: الإعدادات تُحفظ فور التعديل
  setCfg: async (patch) => {
    const newCfg = normalizeCfg({
      ...get().cfg,
      ...patch,
      enabledModules: patch.enabledModules
        ? { ...(get().cfg.enabledModules || {}), ...patch.enabledModules }
        : get().cfg.enabledModules,
    });
    if (newCfg.enabledModules?.wallets || patch.defaultWalletId || patch.currency || patch.profileType || patch.activeScope) {
      const prepared = prepareWalletData({
        wallets: get().wallets,
        trans: get().trans,
        commitments: get().commitments,
        cfg: newCfg,
      });
      set(prepared);
      await get().saveLocal();
      await get().syncCloud();
      return;
    }
    set({ cfg: newCfg });
    await get().saveLocal();
    await get().syncCloud();
  },

  setNotif: async (patch) => {
    const newNotif = { ...get().notif, ...patch };
    set({ notif: newNotif });
    await get().saveLocal({ dirty: false });
  },

  setCategoryBudget: async (categoryId, amount) => {
    const categoryBudgets = normalizeBudgets({
      ...(get().cfg.categoryBudgets || {}),
      [categoryId]: amount,
    });
    await get().setCfg({ categoryBudgets });
  },

  applySuggestedBudgets: async () => {
    const categoryBudgets = suggestBudgetsFromHistory(get().trans, get().cats);
    await get().setCfg({ categoryBudgets });
    return categoryBudgets;
  },

  clearBudgets: async () => get().setCfg({ categoryBudgets: {} }),

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

      if (!snapshot && allowLegacy) {
        const [d, s, c, n, recoveryRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE.DATA),
          AsyncStorage.getItem(STORAGE.SETTINGS),
          AsyncStorage.getItem(STORAGE.CATS),
          AsyncStorage.getItem(STORAGE.NOTIF),
          AsyncStorage.getItem(STORAGE.RECOVERY),
        ]);
        let recovery = {};
        try { recovery = recoveryRaw ? JSON.parse(recoveryRaw) : {}; } catch {}
        let data = recovery.data || {};
        let settings = recovery.cfg || null;
        let storedCats = recovery.cats || null;
        try { if (d) data = JSON.parse(d); } catch {}
        try { if (s) settings = JSON.parse(s); } catch {}
        try { if (c) storedCats = JSON.parse(c); } catch {}
        let legacyNotif = DEF_NOTIF;
        try { legacyNotif = n ? { ...DEF_NOTIF, ...JSON.parse(n) } : DEF_NOTIF; } catch {}
        snapshot = {
          v: 7,
          data,
          cfg: settings || DEF_CFG,
          cats: storedCats || DEF_CATS,
          notif: legacyNotif,
          updatedAt: recovery.updatedAt || new Date().toISOString(),
          lastSyncedAt: null,
          cloudRevision: 0,
          dirty: financialDataCount(data) > 0,
        };
        await writeVaultSnapshot(namespace, snapshot);
        await AsyncStorage.multiRemove([
          STORAGE.DATA,
          STORAGE.SETTINGS,
          STORAGE.CATS,
          STORAGE.NOTIF,
          STORAGE.RECOVERY,
          STORAGE.ROLLBACK,
          STORAGE.LOCAL_TS,
          STORAGE.SYNC_TS,
        ]);
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
        ...(recovered ? { lastSyncError: 'local_snapshot_recovered' } : {}),
      });
      return !!snapshot;
    } catch (e) {
      console.error('[STORE] loadLocal', e);
      set({ workspaceNamespace: namespace, workspaceReady: true, lastSyncError: String(e?.message || 'local_load_failed') });
      return false;
    }
  },

  saveLocal: async ({ dirty = true } = {}) => {
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
    await writeVaultSnapshot(current.workspaceNamespace, snapshotFromState(next));
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

  addTrans: async (t) => {
    const id = uid();
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const cat = get().cats.find(item => item.id === t.cat) || get().cats.find(item => item.id === 'other') || {};
    const catLabel = (get().cfg.lang === 'ar' ? cat.label : cat.labelEn) || cat.label || cat.labelEn || '';
    const defaultTitle = Number(t.amt || 0) >= 0
      ? (get().cfg.lang === 'ar' ? `دخل - ${catLabel || 'عام'}` : `Income - ${catLabel || 'General'}`)
      : (get().cfg.lang === 'ar' ? `مصروف - ${catLabel || 'عام'}` : `Expense - ${catLabel || 'General'}`);
    const tx = {
      ...t,
      id,
      scope: normalizeScope(t.scope, getEntryScope(get().cfg)),
      flowType: t.flowType || (Number(t.amt || 0) >= 0 ? FLOW_TYPES.INCOME : FLOW_TYPES.EXPENSE),
      title: String(t.title || '').trim() || defaultTitle,
      walletId: t.walletId || defaultWalletId,
      recurringGroupId: t.recurring ? (t.recurringGroupId || t.id || id) : t.recurringGroupId,
      ts: Date.now(),
      dateISO: t.dateISO || today(),
    };
    set(s => ({ trans: [tx, ...s.trans] }));
    await get().saveLocal();
    await get().syncCloud();

  },

  duplicateTrans: async (id) => {
    const current = get().trans.find(item => item.id === id);
    if (!current || current.isDebtPayment || current.isGoalSaving || current.isCommitmentPayment) return false;
    if (current.kind === 'transfer') {
      return get().addTransfer({
        fromWalletId: current.fromWalletId,
        toWalletId: current.toWalletId,
        amount: current.transferAmount,
        dateISO: today(),
        note: current.note || '',
      });
    }
    const { id: _id, ts: _ts, dateISO: _dateISO, ...draft } = current;
    await get().addTrans({ ...draft, recurring: false, recurringGroupId: null, dateISO: today() });
    return true;
  },

  addTransfer: async ({ fromWalletId, toWalletId, amount, dateISO = today(), note = '' }) => {
    const n = Math.abs(Number(amount) || 0);
    const normalizedWallets = normalizeWallets(get().wallets, get().cfg.currency);
    const walletIds = new Set(normalizedWallets.map(wallet => wallet.id));
    if (!n || !fromWalletId || !toWalletId || fromWalletId === toWalletId) return false;
    if (!walletIds.has(fromWalletId) || !walletIds.has(toWalletId)) return false;
    const fromWallet = normalizedWallets.find(wallet => wallet.id === fromWalletId);
    const toWallet = normalizedWallets.find(wallet => wallet.id === toWalletId);
    if (normalizeScope(fromWallet?.scope) !== normalizeScope(toWallet?.scope)) return false;
    const entryDate = normalizeDate(dateISO);
    const sourceWallet = fromWallet;
    set(s => ({
      trans: [
        {
          id: uid(),
          title: 'تحويل بين المحافظ',
          amt: 0,
          cat: 'other',
          kind: 'transfer',
          flowType: FLOW_TYPES.TRANSFER,
          scope: normalizeScope(sourceWallet?.scope, getEntryScope(get().cfg)),
          transferAmount: n,
          fromWalletId,
          toWalletId,
          note,
          dateISO: entryDate,
          ts: Date.now(),
        },
        ...s.trans,
      ],
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  editTrans: async (id, patch) => {
    const current = get().trans.find(t => t.id === id);
    if (!current) return;
    const safePatch = { ...patch };
    const stopRecurringSeries = current.recurring && safePatch.recurring === false;
    const recurringGroupId = current.recurringGroupId || current.id;
    if (safePatch.recurring && !safePatch.recurringGroupId) {
      safePatch.recurringGroupId = current.recurringGroupId || current.id;
    }
    const hasAmt = Object.prototype.hasOwnProperty.call(patch, 'amt');
    const linkedDebt = current.isDebtPayment ? get().debts.find(d => d.id === current.debtId) : null;
    const currentDebtPayment = linkedDebt?.payments?.find(p => p.id === current.paymentId);
    const debtSign = linkedDebt?.direction === 'receivable' ? 1 : -1;
    const linkedGoal = current.isGoalSaving ? get().goals.find(g => g.id === current.goalId) : null;
    const currentGoalSaving = linkedGoal?.savings?.find(sv => sv.id === current.savingId);
    const requestedAmt = Math.abs(Number(safePatch.amt) || 0);
    const linkedAbsAmt = current.isDebtPayment && hasAmt
      ? capLinkedAmount(requestedAmt, linkedDebt?.total, linkedDebt?.paid, currentDebtPayment?.amt)
      : current.isGoalSaving && hasAmt
        ? capLinkedAmount(requestedAmt, linkedGoal?.target, linkedGoal?.cur, currentGoalSaving?.amt)
        : requestedAmt;
    if (hasAmt && (current.isDebtPayment || current.isGoalSaving) && linkedAbsAmt <= 0) return false;
    const nextAmt = hasAmt
      ? (current.isDebtPayment ? debtSign * linkedAbsAmt : current.isGoalSaving ? 0 : -linkedAbsAmt)
      : current.amt;
    const nextCommitmentMonth = current.isCommitmentPayment && safePatch.dateISO
      ? monthKey(safePatch.dateISO)
      : current.commitmentMonth;

    set(s => {
      const trans = s.trans.map(t => {
        if (stopRecurringSeries && (t.recurringGroupId || t.id) === recurringGroupId) {
          return t.id === id ? { ...t, ...safePatch, recurring: false } : { ...t, recurring: false };
        }
        if (t.id !== id) return t;
        if (t.isDebtPayment || t.isGoalSaving) {
          return {
            ...t,
            ...safePatch,
            amt: nextAmt,
            ...(t.isGoalSaving && hasAmt ? { allocationAmount: linkedAbsAmt } : {}),
            ...(t.isCommitmentPayment ? { commitmentMonth: nextCommitmentMonth } : {}),
          };
        }
        if (t.isCommitmentPayment) {
          return {
            ...t,
            ...safePatch,
            amt: hasAmt ? -Math.abs(Number(safePatch.amt) || 0) : t.amt,
            commitmentMonth: nextCommitmentMonth,
          };
        }
        return { ...t, ...safePatch };
      });
      return {
        trans,
        debts: current.isDebtPayment
        ? s.debts.map(d => {
            if (d.id !== current.debtId) return d;
            const payments = (d.payments || []).map(p => (
              p.id === current.paymentId
                ? { ...p, ...(hasAmt ? { amt: Math.abs(nextAmt) } : {}), ...(patch.dateISO ? { date: patch.dateISO } : {}) }
                : p
            ));
            return { ...d, payments, paid: debtPaidTotal(d, payments) };
          })
        : current.isDebtOrigin
          ? s.debts.map(d => d.id === current.debtId ? {
              ...d,
              ...(patch.dateISO ? { createdAt: patch.dateISO } : {}),
              ...(hasAmt ? { total: Math.abs(nextAmt) } : {}),
            } : d)
          : s.debts,
      goals: current.isGoalSaving
        ? s.goals.map(g => {
            if (g.id !== current.goalId) return g;
            const savings = (g.savings || []).map(sv => (
              sv.id === current.savingId
                ? { ...sv, ...(hasAmt ? { amt: Math.abs(nextAmt) } : {}), ...(patch.dateISO ? { date: patch.dateISO } : {}) }
                : sv
            ));
            return { ...g, savings, cur: Math.min(goalSavedTotal(g, savings), g.target) };
          })
        : s.goals,
        commitments: current.isCommitmentPayment
          ? syncCommitmentPaidMonth(s.commitments, trans, current.commitmentId)
          : s.commitments,
      };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  // ✅ FIX: حذف معاملة "سداد دين/توفير" يعكس الدفعة من الدين/الهدف نفسه (ترابط كامل)
  deleteTrans: async (id) => {
    const t = get().trans.find(x => x.id === id);
    set(s => {
      const trans = s.trans.filter(x => x.id !== id);
      return {
        trans,
        debts: (t && t.isDebtPayment)
        ? s.debts.map(d => {
            if (d.id !== t.debtId) return d;
            const payments = (d.payments || []).filter(p => p.id !== t.paymentId);
            const paid = debtPaidTotal(d, payments);
            return { ...d, payments, paid };
          })
        : (t && t.isDebtOrigin)
          ? s.debts.map(d => d.id === t.debtId ? { ...d, originMode: 'previous', originTransactionId: null } : d)
          : s.debts,
      goals: (t && t.isGoalSaving)
        ? s.goals.map(g => {
            if (g.id !== t.goalId) return g;
            const savings = (g.savings || []).filter(sv => sv.id !== t.savingId);
            const cur = goalSavedTotal(g, savings);
            return { ...g, savings, cur };
          })
        : s.goals,
        commitments: (t && t.isCommitmentPayment)
        ? syncCommitmentPaidMonth(s.commitments, trans, t.commitmentId)
        : s.commitments,
      };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteTransMany: async (ids = []) => {
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(Boolean));
    if (!selected.size) return false;
    set(s => {
      const removed = s.trans.filter(item => selected.has(item.id));
      const debtPayments = new Set(
        removed
          .filter(item => item.isDebtPayment)
          .map(item => `${item.debtId}:${item.paymentId}`),
      );
      const goalSavings = new Set(
        removed
          .filter(item => item.isGoalSaving)
          .map(item => `${item.goalId}:${item.savingId}`),
      );
      const trans = s.trans.filter(item => !selected.has(item.id));
      const debts = s.debts.map(debt => {
        const payments = (debt.payments || []).filter(payment => !debtPayments.has(`${debt.id}:${payment.id}`));
        return payments.length === (debt.payments || []).length
          ? debt
          : { ...debt, payments, paid: debtPaidTotal(debt, payments) };
      });
      const goals = s.goals.map(goal => {
        const savings = (goal.savings || []).filter(saving => !goalSavings.has(`${goal.id}:${saving.id}`));
        return savings.length === (goal.savings || []).length
          ? goal
          : { ...goal, savings, cur: Math.min(goalSavedTotal(goal, savings), goal.target) };
      });
      return {
        trans,
        debts,
        goals,
        commitments: syncCommitmentPaidMonth(s.commitments, trans),
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  addDebt: async (d) => {
    const scope = normalizeScope(d.scope, getEntryScope(get().cfg));
    const originMode = ['received', 'lent'].includes(d.originMode) ? d.originMode : 'previous';
    const debtId = uid();
    const originTransactionId = originMode === 'previous' ? null : uid();
    const debt = normalizeDebtItems([{
      ...d,
      scope,
      direction: d.direction || 'owed',
      id: debtId,
      paid: 0,
      payments: [],
      createdAt: normalizeDate(d.createdAt),
      originMode,
      originTransactionId,
    }], scope)[0];
    const walletId = d.walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const originAmount = originMode === 'received'
      ? Math.abs(Number(debt.total) || 0)
      : originMode === 'lent'
        ? -Math.abs(Number(debt.total) || 0)
        : 0;
    const originTx = originAmount ? {
      id: originTransactionId,
      title: originMode === 'received' ? `استلام دين عليّ — ${debt.name}` : `إنشاء دين لي — ${debt.name}`,
      amt: originAmount,
      cat: 'other',
      walletId,
      dateISO: debt.createdAt,
      ts: Date.now(),
      scope,
      flowType: originMode === 'received' ? FLOW_TYPES.DEBT_PROCEEDS : FLOW_TYPES.RECEIVABLE_CREATED,
      isDebtOrigin: true,
      debtId: debt.id,
    } : null;
    set(s => ({
      debts: [debt, ...s.debts],
      trans: originTx ? [originTx, ...s.trans] : s.trans,
    }));
    await get().saveLocal();
    await get().syncCloud();
    return debt;
  },

  editDebt: async (id, patch) => {
    set(s => {
      let nextName = null;
      const debts = s.debts.map(d => {
        if (d.id !== id) return d;
        const next = normalizeDebtItems([{ ...d, ...patch }], d.scope)[0];
        nextName = next.name;
        return next;
      });
      const trans = patch.name
        ? s.trans.map(t => (
            t.isDebtPayment && t.debtId === id
              ? {
                  ...t,
                  title: `${(debts.find(d => d.id === id)?.direction || 'owed') === 'receivable' ? 'تحصيل دين لي' : 'سداد دين عليّ'} — ${nextName || ''}`,
                }
              : t
          ))
        : s.trans;
      return { debts, trans };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  // ✅ FIX: حذف الدين يحذف معه كل معاملات السداد المرتبطة (ترابط كامل مع الرصيد/التقارير/الأرشيف)
  deleteDebt: async (id) => {
    set(s => ({
      debts: s.debts.filter(d => d.id !== id),
      trans: s.trans.filter(t => !((t.isDebtPayment || t.isDebtOrigin) && t.debtId === id)),
      commitments: s.commitments.map(item => (
        (item.linkedType === 'debt' || item.linkedType === 'receivable') && item.linkedId === id
          ? { ...item, linkedType: 'none', linkedId: null, lastPaidMonth: null }
          : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  addPayment: async (debtId, amt) => {
    await get().payDebt(debtId, amt);
  },

  // ✅ دفعة دين + معاملة مصروف بنفس الوقت (يربط الدين بالرصيد والإحصائيات)
  payDebt: async (debtId, amt, dateISO = today(), walletId = null, meta = {}) => {
    const entryDate = normalizeDate(dateISO);
    const txWalletId = walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const payId = uid();
    const debt = get().debts.find(d => d.id === debtId);
    if (!debt) return false;
    const n = Math.min(Math.abs(Number(amt) || 0), remainingAmount(debt.total, debt.paid));
    if (n <= 0) return false;
    const pay = { id: payId, amt: n, date: entryDate, ts: Date.now() };
    const isReceivable = debt?.direction === 'receivable';
    const signedAmt = isReceivable ? n : -n;
    const title = `${isReceivable ? 'تحصيل دين لي' : 'سداد دين عليّ'} — ${debt ? debt.name : ''}`;
    set(s => ({
      debts: s.debts.map(d => {
        if (d.id !== debtId) return d;
        const payments = [...(d.payments || []), pay];
        const paid = debtPaidTotal(d, payments);
        return { ...d, payments, paid };
      }),
      trans: [
        {
          id: uid(), title, amt: signedAmt, cat: 'other', walletId: txWalletId,
          dateISO: entryDate, ts: Date.now(),
          scope: normalizeScope(debt.scope, getEntryScope(get().cfg)),
          flowType: isReceivable ? FLOW_TYPES.RECEIVABLE_COLLECTION : FLOW_TYPES.DEBT_PAYMENT,
          isDebtPayment: true, debtId, paymentId: payId, ...meta,
        },
        ...s.trans,
      ],
    }));
    set(s => ({
      trans: s.trans.map(t => (
        t.isDebtPayment && t.paymentId === payId
          ? { ...t, dateISO: entryDate }
          : t
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  editDebtPayment: async (debtId, paymentId, amt, dateISO = null) => {
    const debt = get().debts.find(d => d.id === debtId);
    const currentPayment = debt?.payments?.find(p => p.id === paymentId);
    const n = capLinkedAmount(amt, debt?.total, debt?.paid, currentPayment?.amt);
    if (!n) return;
    let debtName = '';
    let direction = 'owed';
    set(s => {
      const debts = s.debts.map(d => {
        if (d.id !== debtId) return d;
        debtName = d.name || '';
        direction = d.direction || 'owed';
        const payments = (d.payments || []).map(p => p.id === paymentId ? { ...p, amt: n, date: normalizeDate(dateISO || p.date) } : p);
        return { ...d, payments, paid: debtPaidTotal(d, payments) };
      });
      const trans = s.trans.map(t => (
        t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId
          ? { ...t, amt: direction === 'receivable' ? n : -n, title: `${direction === 'receivable' ? 'تحصيل دين لي' : 'سداد دين عليّ'} — ${debtName}` }
          : t
      ));
      return { debts, trans };
    });
    set(s => {
      let commitmentId = null;
      const trans = s.trans.map(t => {
        if (!(t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId)) return t;
        const nextDate = normalizeDate(dateISO || t.dateISO);
        if (t.isCommitmentPayment) commitmentId = t.commitmentId;
        return {
          ...t,
          dateISO: nextDate,
          ...(t.isCommitmentPayment ? { commitmentMonth: monthKey(nextDate) } : {}),
        };
      });
      return {
        trans,
        commitments: commitmentId ? syncCommitmentPaidMonth(s.commitments, trans, commitmentId) : s.commitments,
      };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteDebtPayment: async (debtId, paymentId) => {
    set(s => {
      const removed = s.trans.find(t => t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId && t.isCommitmentPayment);
      const trans = s.trans.filter(t => !(t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId));
      return {
        debts: s.debts.map(d => {
        if (d.id !== debtId) return d;
        const payments = (d.payments || []).filter(p => p.id !== paymentId);
        return { ...d, payments, paid: debtPaidTotal(d, payments) };
      }),
        trans,
        commitments: removed?.commitmentId ? syncCommitmentPaidMonth(s.commitments, trans, removed.commitmentId) : s.commitments,
      };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  addGoal: async (g) => {
    const scope = normalizeScope(g.scope, getEntryScope(get().cfg));
    const goal = normalizeGoalItems([{ ...g, scope, id: uid(), cur: 0, savings: [], createdAt: normalizeDate(g.createdAt) }], scope)[0];
    set(s => ({ goals: [goal, ...s.goals] }));
    await get().saveLocal();
    await get().syncCloud();
    return goal;
  },

  editGoal: async (id, patch) => {
    set(s => {
      let nextName = null;
      const goals = s.goals.map(g => {
        if (g.id !== id) return g;
        const next = normalizeGoalItems([{ ...g, ...patch }], g.scope)[0];
        nextName = next.name;
        return next;
      });
      const trans = patch.name
        ? s.trans.map(t => (
            t.isGoalSaving && t.goalId === id
              ? { ...t, title: `توفير — ${nextName || ''}` }
              : t
          ))
        : s.trans;
      return { goals, trans };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  // ✅ FIX: حذف الهدف يحذف معه كل معاملات التوفير المرتبطة
  deleteGoal: async (id) => {
    set(s => ({
      goals: s.goals.filter(g => g.id !== id),
      trans: s.trans.filter(t => !(t.isGoalSaving && t.goalId === id)),
      commitments: s.commitments.map(item => (
        item.linkedType === 'goal' && item.linkedId === id
          ? { ...item, linkedType: 'none', linkedId: null, lastPaidMonth: null }
          : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
  },

  addGoalSaving: async (goalId, amt) => {
    await get().saveGoal(goalId, amt);
  },

  // ✅ توفير لهدف + معاملة مصروف بنفس الوقت
  saveGoal: async (goalId, amt, dateISO = today(), walletId = null, meta = {}) => {
    const entryDate = normalizeDate(dateISO);
    const txWalletId = walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const saveId = uid();
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal) return false;
    const n = Math.min(Math.abs(Number(amt) || 0), remainingAmount(goal.target, goal.cur));
    if (n <= 0) return false;
    const entry = { id: saveId, amt: n, date: entryDate, ts: Date.now() };
    set(s => ({
      goals: s.goals.map(g => {
        if (g.id !== goalId) return g;
        const savings = [...(g.savings || []), entry];
        return { ...g, savings, cur: Math.min(goalSavedTotal(g, savings), g.target) };
      }),
      trans: [
        {
          id: uid(), title: `توفير — ${goal ? goal.name : ''}`, amt: 0, allocationAmount: n, cat: 'other',
          walletId: txWalletId, dateISO: entryDate, ts: Date.now(),
          scope: normalizeScope(goal.scope, getEntryScope(get().cfg)),
          flowType: FLOW_TYPES.GOAL_ALLOCATION,
          isGoalSaving: true, goalId, savingId: saveId, ...meta,
        },
        ...s.trans,
      ],
    }));
    set(s => ({
      trans: s.trans.map(t => (
        t.isGoalSaving && t.savingId === saveId
          ? { ...t, dateISO: entryDate }
          : t
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  editGoalSaving: async (goalId, savingId, amt, dateISO = null) => {
    const goal = get().goals.find(g => g.id === goalId);
    const currentSaving = goal?.savings?.find(sv => sv.id === savingId);
    const n = capLinkedAmount(amt, goal?.target, goal?.cur, currentSaving?.amt);
    if (!n) return;
    let goalName = '';
    set(s => {
      const goals = s.goals.map(g => {
        if (g.id !== goalId) return g;
        goalName = g.name || '';
        const savings = (g.savings || []).map(sv => sv.id === savingId ? { ...sv, amt: n, date: normalizeDate(dateISO || sv.date) } : sv);
        return { ...g, savings, cur: Math.min(goalSavedTotal(g, savings), g.target) };
      });
      const trans = s.trans.map(t => (
        t.isGoalSaving && t.goalId === goalId && t.savingId === savingId
          ? { ...t, amt: 0, allocationAmount: n, title: `توفير — ${goalName}` }
          : t
      ));
      return { goals, trans };
    });
    set(s => {
      let commitmentId = null;
      const trans = s.trans.map(t => {
        if (!(t.isGoalSaving && t.goalId === goalId && t.savingId === savingId)) return t;
        const nextDate = normalizeDate(dateISO || t.dateISO);
        if (t.isCommitmentPayment) commitmentId = t.commitmentId;
        return {
          ...t,
          dateISO: nextDate,
          ...(t.isCommitmentPayment ? { commitmentMonth: monthKey(nextDate) } : {}),
        };
      });
      return {
        trans,
        commitments: commitmentId ? syncCommitmentPaidMonth(s.commitments, trans, commitmentId) : s.commitments,
      };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteGoalSaving: async (goalId, savingId) => {
    set(s => {
      const removed = s.trans.find(t => t.isGoalSaving && t.goalId === goalId && t.savingId === savingId && t.isCommitmentPayment);
      const trans = s.trans.filter(t => !(t.isGoalSaving && t.goalId === goalId && t.savingId === savingId));
      return {
        goals: s.goals.map(g => {
        if (g.id !== goalId) return g;
        const savings = (g.savings || []).filter(sv => sv.id !== savingId);
        return { ...g, savings, cur: Math.min(goalSavedTotal(g, savings), g.target) };
      }),
        trans,
        commitments: removed?.commitmentId ? syncCommitmentPaidMonth(s.commitments, trans, removed.commitmentId) : s.commitments,
      };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteTrackerPaymentsMany: async (items = []) => {
    const rows = (Array.isArray(items) ? items : []).filter(item => item?.sourceId && item?.paymentId);
    if (!rows.length) return false;
    const debtPayments = new Set(
      rows
        .filter(item => item.kind !== 'saving')
        .map(item => `${item.sourceId}:${item.paymentId}`),
    );
    const goalSavings = new Set(
      rows
        .filter(item => item.kind === 'saving')
        .map(item => `${item.sourceId}:${item.paymentId}`),
    );
    set(s => {
      const trans = s.trans.filter(item => (
        !(item.isDebtPayment && debtPayments.has(`${item.debtId}:${item.paymentId}`))
        && !(item.isGoalSaving && goalSavings.has(`${item.goalId}:${item.savingId}`))
      ));
      return {
        trans,
        debts: s.debts.map(debt => {
          const payments = (debt.payments || []).filter(payment => !debtPayments.has(`${debt.id}:${payment.id}`));
          return payments.length === (debt.payments || []).length
            ? debt
            : { ...debt, payments, paid: debtPaidTotal(debt, payments) };
        }),
        goals: s.goals.map(goal => {
          const savings = (goal.savings || []).filter(saving => !goalSavings.has(`${goal.id}:${saving.id}`));
          return savings.length === (goal.savings || []).length
            ? goal
            : { ...goal, savings, cur: Math.min(goalSavedTotal(goal, savings), goal.target) };
        }),
        commitments: syncCommitmentPaidMonth(s.commitments, trans),
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  setCats: async (cats) => {
    set({ cats });
    await get().saveLocal();
    await get().syncCloud();
  },

  addCommitment: async (item) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const next = normalizeCommitments([{
      id: uid(),
      name: item.name,
      amt: item.amt,
      day: item.day,
      firstDueISO: item.firstDueISO,
      cat: item.cat || 'other',
      walletId: item.walletId || defaultWalletId,
      linkedType: item.linkedType || 'none',
      linkedId: item.linkedId || null,
      scope: normalizeScope(item.scope, getEntryScope(get().cfg)),
      repeatMonthly: item.repeatMonthly !== false,
      active: item.active !== false,
      createdAt: today(),
    }], defaultWalletId)[0];
    if (!next || !next.amt) return false;
    set(s => ({ commitments: [next, ...normalizeCommitments(s.commitments, defaultWalletId)] }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  editCommitment: async (id, patch) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id
          ? normalizeCommitments([{ ...item, ...patch }], defaultWalletId)[0]
          : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
  },

  deferCommitment: async (id, option = 'day') => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const commitment = normalizeCommitments(get().commitments, defaultWalletId).find(item => item.id === id);
    if (!commitment || commitment.active === false) return false;
    const deferredUntilISO = deferredCommitmentDueISO(commitment, option);
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id
          ? normalizeCommitments([{ ...item, deferredUntilISO }], defaultWalletId)[0]
          : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  clearCommitmentDeferral: async (id) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id
          ? normalizeCommitments([{ ...item, deferredUntilISO: null }], defaultWalletId)[0]
          : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  deleteCommitment: async (id) => {
    set(s => ({
      commitments: s.commitments.filter(item => item.id !== id),
      trans: s.trans
        .map(t => {
          if (!(t.isCommitmentPayment && t.commitmentId === id)) return t;
          if (t.isDebtPayment || t.isGoalSaving) {
            const {
              isCommitmentPayment,
              commitmentId,
              commitmentMonth,
              commitmentLinkedType,
              commitmentLinkedId,
              ...rest
            } = t;
            return rest;
          }
          return null;
        })
        .filter(Boolean),
    }));
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteTrackersMany: async (items = []) => {
    const rows = (Array.isArray(items) ? items : []).filter(item => item?.sourceId && item?.kind);
    if (!rows.length) return false;
    const debtIds = new Set(rows.filter(item => item.kind === 'owed' || item.kind === 'receivable').map(item => item.sourceId));
    const goalIds = new Set(rows.filter(item => item.kind === 'saving').map(item => item.sourceId));
    const commitmentIds = new Set(rows.filter(item => item.kind === 'monthly').map(item => item.sourceId));
    set(s => {
      let trans = s.trans.filter(item => (
        !(item.isDebtPayment && debtIds.has(item.debtId))
        && !(item.isGoalSaving && goalIds.has(item.goalId))
      ));
      trans = trans
        .map(item => {
          if (!(item.isCommitmentPayment && commitmentIds.has(item.commitmentId))) return item;
          if (item.isDebtPayment || item.isGoalSaving) {
            const {
              isCommitmentPayment,
              commitmentId,
              commitmentMonth,
              commitmentLinkedType,
              commitmentLinkedId,
              ...rest
            } = item;
            return rest;
          }
          return null;
        })
        .filter(Boolean);
      const commitments = s.commitments
        .filter(item => !commitmentIds.has(item.id))
        .map(item => {
          const debtLinked = (item.linkedType === 'debt' || item.linkedType === 'receivable') && debtIds.has(item.linkedId);
          const goalLinked = item.linkedType === 'goal' && goalIds.has(item.linkedId);
          return debtLinked || goalLinked
            ? { ...item, linkedType: 'none', linkedId: null, lastPaidMonth: null }
            : item;
        });
      return {
        trans,
        commitments,
        debts: s.debts.filter(item => !debtIds.has(item.id)),
        goals: s.goals.filter(item => !goalIds.has(item.id)),
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  payCommitment: async (id, dateISO = today(), walletId = null) => {
    const entryDate = normalizeDate(dateISO);
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const commitment = normalizeCommitments(get().commitments, defaultWalletId).find(item => item.id === id);
    if (!commitment || !commitment.active || !commitment.amt) return false;
    const paymentWalletId = walletId || commitment.walletId || defaultWalletId;
    const paidMonth = monthKey(entryDate);
    if (commitment.lastPaidMonth === paidMonth) return false;
    const linkedType = commitment.linkedType || 'none';
    const linkedId = commitment.linkedId || null;
    const linkedMeta = {
      title: commitment.name,
      cat: commitment.cat || 'other',
      scope: normalizeScope(commitment.scope, getEntryScope(get().cfg)),
      isCommitmentPayment: true,
      commitmentId: id,
      commitmentMonth: paidMonth,
      commitmentLinkedType: linkedType,
      commitmentLinkedId: linkedId,
    };
    if ((linkedType === 'debt' || linkedType === 'receivable') && linkedId) {
      const ok = await get().payDebt(linkedId, commitment.amt, entryDate, paymentWalletId, linkedMeta);
      if (!ok) return false;
      set(s => ({
        commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
          item.id === id ? { ...item, lastPaidMonth: paidMonth, deferredUntilISO: null, active: item.repeatMonthly === false ? false : item.active } : item
        )),
      }));
      await get().saveLocal();
      await get().syncCloud();
      return true;
    }
    if (linkedType === 'goal' && linkedId) {
      const ok = await get().saveGoal(linkedId, commitment.amt, entryDate, paymentWalletId, linkedMeta);
      if (!ok) return false;
      set(s => ({
        commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
          item.id === id ? { ...item, lastPaidMonth: paidMonth, deferredUntilISO: null, active: item.repeatMonthly === false ? false : item.active } : item
        )),
      }));
      await get().saveLocal();
      await get().syncCloud();
      return true;
    }
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id ? { ...item, lastPaidMonth: paidMonth, deferredUntilISO: null, active: item.repeatMonthly === false ? false : item.active } : item
      )),
      trans: [
        {
          id: uid(),
          title: commitment.name,
          amt: -Math.abs(Number(commitment.amt) || 0),
          cat: commitment.cat || 'other',
          walletId: paymentWalletId,
          dateISO: entryDate,
          ts: Date.now(),
          scope: normalizeScope(commitment.scope, getEntryScope(get().cfg)),
          flowType: FLOW_TYPES.COMMITMENT_PAYMENT,
          isCommitmentPayment: true,
          commitmentId: id,
          commitmentMonth: paidMonth,
        },
        ...s.trans,
      ],
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  addWallet: async (wallet) => {
    const cfg = get().cfg;
    const next = {
      id: uid(),
      name: wallet.name?.trim() || 'محفظة',
      nameEn: wallet.nameEn?.trim() || wallet.name?.trim() || 'Wallet',
      type: wallet.type || 'cash',
      currency: cfg.currency,
      scope: normalizeScope(wallet.scope, getEntryScope(cfg)),
      openingBalance: Number(wallet.openingBalance || 0),
    };
    set(s => ({ wallets: [...normalizeWallets(s.wallets, cfg.currency), next] }));
    await get().saveLocal();
    await get().syncCloud();
  },

  editWallet: async (id, patch) => {
    const { currency: _ignoredCurrency, ...safePatch } = patch || {};
    set(s => ({
      wallets: normalizeWallets(s.wallets, s.cfg.currency).map(wallet => (
        wallet.id === id
          ? { ...wallet, ...safePatch, currency: s.cfg.currency, openingBalance: Number(safePatch.openingBalance ?? wallet.openingBalance ?? 0) }
          : wallet
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteWallet: async (id) => {
    const normalized = normalizeWallets(get().wallets, get().cfg.currency);
    if (normalized.length <= 1 || !normalized.some(wallet => wallet.id === id)) return false;
    const fallback = normalized.find(wallet => wallet.id !== id && wallet.id === get().cfg.defaultWalletId)
      || normalized.find(wallet => wallet.id !== id)
      || normalized[0];
    set(s => ({
      wallets: normalized.filter(wallet => wallet.id !== id),
      cfg: {
        ...s.cfg,
        defaultWalletId: s.cfg.defaultWalletId === id ? fallback.id : getDefaultWalletId(normalized.filter(wallet => wallet.id !== id), s.cfg.currency, s.cfg.defaultWalletId),
      },
      trans: s.trans.map(tx => ({
        ...tx,
        walletId: tx.walletId === id ? fallback.id : tx.walletId,
        fromWalletId: tx.fromWalletId === id ? fallback.id : tx.fromWalletId,
        toWalletId: tx.toWalletId === id ? fallback.id : tx.toWalletId,
      })).filter(tx => tx.kind !== 'transfer' || tx.fromWalletId !== tx.toWalletId),
      commitments: s.commitments.map(item => item.walletId === id ? { ...item, walletId: fallback.id } : item),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  deleteWalletsMany: async (ids = []) => {
    const normalized = normalizeWallets(get().wallets, get().cfg.currency);
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(id => normalized.some(wallet => wallet.id === id)));
    if (!selected.size || selected.size >= normalized.length) return false;
    const remaining = normalized.filter(wallet => !selected.has(wallet.id));
    const fallback = remaining.find(wallet => wallet.id === get().cfg.defaultWalletId) || remaining[0];
    set(s => ({
      wallets: remaining,
      cfg: {
        ...s.cfg,
        defaultWalletId: fallback.id,
      },
      trans: s.trans
        .map(tx => ({
          ...tx,
          walletId: selected.has(tx.walletId) ? fallback.id : tx.walletId,
          fromWalletId: selected.has(tx.fromWalletId) ? fallback.id : tx.fromWalletId,
          toWalletId: selected.has(tx.toWalletId) ? fallback.id : tx.toWalletId,
        }))
        .filter(tx => tx.kind !== 'transfer' || tx.fromWalletId !== tx.toWalletId),
      commitments: s.commitments.map(item => (
        selected.has(item.walletId) ? { ...item, walletId: fallback.id } : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  // ✅ FIX: عند حذف تصنيف، معاملاته تنتقل لـ"أخرى" بدل ما تبقى متيتمة (catId غير موجود)
  setTransCatToOther: async (catId) => {
    set(s => ({ trans: s.trans.map(t => t.cat === catId ? { ...t, cat: 'other' } : t) }));
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteCategoriesMany: async (ids = []) => {
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(id => id && id !== 'other'));
    if (!selected.size) return false;
    set(s => {
      const categoryBudgets = { ...(s.cfg.categoryBudgets || {}) };
      selected.forEach(id => delete categoryBudgets[id]);
      return {
        cats: s.cats.filter(cat => !selected.has(cat.id)),
        trans: s.trans.map(item => selected.has(item.cat) ? { ...item, cat: 'other' } : item),
        commitments: s.commitments.map(item => selected.has(item.cat) ? { ...item, cat: 'other' } : item),
        cfg: { ...s.cfg, categoryBudgets },
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  // ✅ FIX: لا يفشل أبداً — التصفير بالواجهة يصير فوراً بغض النظر عن نتيجة التخزين/المزامنة
  enterDemoMode: async () => {
    if (get().cfg.demoMode) return true;
    const current = get();
    // The real workspace is already encrypted in the vault. Demo data never overwrites it.
    const demoCfg = normalizeCfg({
      ...current.cfg,
      demoMode: true,
      profileType: 'personal',
      activeScope: 'personal',
      currency: 'IQD',
      enabledModules: {
        wallets: true,
        debtsOwed: true,
        debtsReceivable: true,
        goals: true,
        commitments: true,
        recurring: true,
        budgets: true,
      },
      categoryBudgets: { food: 450000, rent: 700000, transport: 250000 },
      defaultWalletId: 'demo_cash',
    });
    const demoWallets = [
      { id: 'demo_cash', name: 'النقد', nameEn: 'Cash', type: 'cash', currency: 'IQD', openingBalance: 1800000, scope: 'personal' },
      { id: 'demo_bank', name: 'الحساب البنكي', nameEn: 'Bank account', type: 'bank', currency: 'IQD', openingBalance: 3200000, scope: 'personal' },
    ];
    const rows = [
      ['demo_salary_0', 'راتب الشهر', 2400000, 'salary', demoDate(0, 1), 'demo_bank'],
      ['demo_rent_0', 'إيجار المنزل', -650000, 'rent', demoDate(0, 2), 'demo_bank'],
      ['demo_food_0', 'مشتريات المنزل', -185000, 'food', demoDate(0, 5), 'demo_cash'],
      ['demo_transport_0', 'وقود ومواصلات', -92000, 'transport', demoDate(0, 8), 'demo_cash'],
      ['demo_salary_1', 'راتب الشهر', 2350000, 'salary', demoDate(-1, 1), 'demo_bank'],
      ['demo_rent_1', 'إيجار المنزل', -650000, 'rent', demoDate(-1, 2), 'demo_bank'],
      ['demo_food_1', 'مطعم ومشتريات', -310000, 'food', demoDate(-1, 10), 'demo_cash'],
      ['demo_health_1', 'صيدلية', -78000, 'health', demoDate(-1, 16), 'demo_cash'],
      ['demo_salary_2', 'راتب الشهر', 2300000, 'salary', demoDate(-2, 1), 'demo_bank'],
      ['demo_rent_2', 'إيجار المنزل', -650000, 'rent', demoDate(-2, 2), 'demo_bank'],
      ['demo_food_2', 'مشتريات غذائية', -265000, 'food', demoDate(-2, 12), 'demo_cash'],
      ['demo_fun_2', 'اشتراك ترفيه', -45000, 'entertain', demoDate(-2, 18), 'demo_bank'],
    ].map(([id, title, amt, cat, dateISO, walletId], index) => ({
      id, title, amt, cat, dateISO, walletId,
      flowType: amt >= 0 ? FLOW_TYPES.INCOME : FLOW_TYPES.EXPENSE,
      scope: 'personal',
      ts: Date.now() - index * 1000,
    }));
    const debtPaymentId = 'demo_debt_payment';
    const goalSavingId = 'demo_goal_saving';
    rows.push(
      {
        id: 'demo_debt_tx', title: 'سداد دين عليّ — قرض الهاتف', amt: -100000, cat: 'other',
        dateISO: demoDate(0, 12), walletId: 'demo_bank', scope: 'personal',
        flowType: FLOW_TYPES.DEBT_PAYMENT, isDebtPayment: true,
        debtId: 'demo_debt', paymentId: debtPaymentId, ts: Date.now() - 20000,
      },
      {
        id: 'demo_goal_tx', title: 'توفير — صندوق الطوارئ', amt: 0, allocationAmount: 300000, cat: 'other',
        dateISO: demoDate(0, 14), walletId: 'demo_bank', scope: 'personal',
        flowType: FLOW_TYPES.GOAL_ALLOCATION, isGoalSaving: true,
        goalId: 'demo_goal', savingId: goalSavingId, ts: Date.now() - 21000,
      },
    );
    set({
      trans: rows,
      debts: [{
        id: 'demo_debt', name: 'قرض الهاتف', total: 600000, paid: 100000,
        archivedPaid: 0, direction: 'owed', scope: 'personal', createdAt: demoDate(-1, 3),
        payments: [{ id: debtPaymentId, amt: 100000, date: demoDate(0, 12) }],
      }],
      goals: [{
        id: 'demo_goal', name: 'صندوق الطوارئ', target: 2000000, cur: 300000,
        archivedSaved: 0, scope: 'personal', createdAt: demoDate(-2, 1),
        savings: [{ id: goalSavingId, amt: 300000, date: demoDate(0, 14) }],
      }],
      commitments: [{
        id: 'demo_commitment', name: 'اشتراك الإنترنت', amt: 60000, day: 20,
        firstDueISO: demoDate(-2, 20), cat: 'other', walletId: 'demo_bank',
        linkedType: 'none', linkedId: null, repeatMonthly: true, active: true, scope: 'personal',
      }],
      wallets: demoWallets,
      cats: DEF_CATS,
      cfg: demoCfg,
      notif: DEF_NOTIF,
    });
    await get().saveLocal();
    return true;
  },

  exitDemoMode: async () => {
    const vault = await readVaultSnapshot(get().workspaceNamespace);
    const legacyRaw = !vault.snapshot ? await AsyncStorage.getItem(STORAGE.DEMO_REAL) : null;
    if (!vault.snapshot && !legacyRaw) return false;
    try {
      const snapshot = vault.snapshot || JSON.parse(legacyRaw);
      const loaded = stateFromSnapshot(snapshot, DEF_CFG);
      set({
        ...loaded,
        workspaceNamespace: get().workspaceNamespace,
        workspaceReady: true,
      });
      await AsyncStorage.multiRemove([STORAGE.DEMO_REAL, STORAGE.DEMO_DATA]);
      return true;
    } catch {
      return false;
    }
  },

  resetAll: async () => {
    const wallets = normalizeWallets([], get().cfg.currency);
    set({
      trans: [],
      debts: [],
      goals: [],
      wallets,
      commitments: [],
      cats: DEF_CATS,
      cfg: { ...get().cfg, defaultWalletId: getDefaultWalletId(wallets, get().cfg.currency, get().cfg.defaultWalletId) },
    });
    try {
      await AsyncStorage.multiRemove([STORAGE.DATA, STORAGE.CATS]);
      await get().saveLocal();
    } catch (e) {
      console.error('[STORE] resetAll storage', e);
    }
    try {
      await get().syncCloud();
    } catch (e) {
      console.error('[STORE] resetAll sync', e);
    }
  },

  exportBackup: () => {
    const { trans, debts, goals, wallets, commitments, cats, cfg, notif } = get();
    return JSON.stringify({
      trans, debts, goals, wallets, commitments, cats, cfg, notif,
      exportedAt: new Date().toISOString(),
      v: 6,
    });
  },

  buildYearArchive: (year, requestedScope = null) => {
    const targetYear = Number(year);
    if (!Number.isInteger(targetYear) || targetYear >= new Date().getFullYear()) return null;
    const { trans, debts, goals, wallets, commitments, cats, cfg } = get();
    const fallbackScope = defaultScopeForProfile(cfg.profileType);
    const archiveScope = requestedScope || getActiveScope(cfg);
    const inArchiveScope = item => (
      archiveScope === 'all'
      || normalizeScope(item?.scope, fallbackScope) === archiveScope
    );
    const archivedTrans = trans.filter(item => yearOf(item.dateISO) === targetYear && inArchiveScope(item));
    if (!archivedTrans.length) return null;
    return {
      trans: archivedTrans,
      debts: debts.filter(inArchiveScope),
      goals: goals.filter(inArchiveScope),
      wallets: wallets.filter(inArchiveScope),
      commitments: commitments.filter(inArchiveScope),
      cats,
      archiveScope,
      cfg: {
        ...cfg,
        archiveYear: targetYear,
        archiveScope,
        archiveSummaries: undefined,
      },
    };
  },

  commitYearArchive: async (year, packageChecksum = '', requestedScope = null) => {
    const targetYear = Number(year);
    if (!Number.isInteger(targetYear) || targetYear >= new Date().getFullYear()) return false;
    const current = get();
    const fallbackScope = defaultScopeForProfile(current.cfg.profileType);
    const archiveScope = requestedScope || getActiveScope(current.cfg);
    const inArchiveScope = item => (
      archiveScope === 'all'
      || normalizeScope(item?.scope, fallbackScope) === archiveScope
    );
    const archivedTrans = current.trans.filter(item => yearOf(item.dateISO) === targetYear && inArchiveScope(item));
    if (!archivedTrans.length) return false;
    const scopedWallets = current.wallets.filter(inArchiveScope);
    const defaultWalletId = getDefaultWalletId(scopedWallets, current.cfg.currency, current.cfg.defaultWalletId);
    const movement = archivedWalletMovement(archivedTrans, scopedWallets, defaultWalletId);
    const stats = calcStats(archivedTrans);
    const categories = catSpend(archivedTrans, get().cats).map(item => ({
      id: item.id,
      label: item.label,
      labelEn: item.labelEn,
      color: item.color,
      spent: item.spent,
    }));
    const summary = {
      year: targetYear,
      scope: archiveScope,
      archivedAt: new Date().toISOString(),
      checksum: packageChecksum,
      count: archivedTrans.length,
      income: stats.inc,
      expense: stats.exp,
      net: stats.bal,
      categories,
    };
    set(state => ({
      trans: state.trans.filter(item => !(yearOf(item.dateISO) === targetYear && inArchiveScope(item))),
      wallets: state.wallets.map(wallet => ({
        ...wallet,
        openingBalance: Number(wallet.openingBalance || 0)
          + (inArchiveScope(wallet) ? Number(movement.get(wallet.id) || 0) : 0),
      })),
      debts: state.debts.map(debt => {
        if (!inArchiveScope(debt)) return debt;
        const archivedPayments = (debt.payments || []).filter(payment => yearOf(payment.date || payment.dateISO) === targetYear);
        const payments = (debt.payments || []).filter(payment => yearOf(payment.date || payment.dateISO) !== targetYear);
        const archivedPaid = Number(debt.archivedPaid || 0) + sumAmt(archivedPayments);
        return { ...debt, archivedPaid, payments, paid: archivedPaid + sumAmt(payments) };
      }),
      goals: state.goals.map(goal => {
        if (!inArchiveScope(goal)) return goal;
        const archivedSavings = (goal.savings || []).filter(saving => yearOf(saving.date || saving.dateISO) === targetYear);
        const savings = (goal.savings || []).filter(saving => yearOf(saving.date || saving.dateISO) !== targetYear);
        const archivedSaved = Number(goal.archivedSaved || 0) + sumAmt(archivedSavings);
        return { ...goal, archivedSaved, savings, cur: Math.min(goal.target, archivedSaved + sumAmt(savings)) };
      }),
      cfg: {
        ...state.cfg,
        archiveSummaries: [
          ...(state.cfg.archiveSummaries || []).filter(item => !(
            item.year === targetYear
            && (item.scope || defaultScopeForProfile(state.cfg.profileType)) === archiveScope
          )),
          summary,
        ].sort((a, b) => b.year - a.year || String(a.scope || '').localeCompare(String(b.scope || ''))),
      },
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  importBackup: async (jsonStr) => {
    let rollback = null;
    try {
      const data = JSON.parse(jsonStr);
      const current = get();
      rollback = {
        trans: current.trans,
        debts: current.debts,
        goals: current.goals,
        wallets: current.wallets,
        commitments: current.commitments,
        cats: current.cats,
        cfg: current.cfg,
        notif: current.notif,
      };
      const importedCfg = data.cfg ? normalizeCfg(data.cfg) : get().cfg;
      const prepared = prepareWalletData({
        wallets: data.wallets,
        trans: data.trans || [],
        commitments: data.commitments,
        cfg: importedCfg,
      });
      set({
        trans: prepared.trans,
        debts: normalizeDebtItems(data.debts, defaultScopeForProfile(prepared.cfg.profileType)),
        goals: normalizeGoalItems(data.goals, defaultScopeForProfile(prepared.cfg.profileType)),
        wallets: prepared.wallets,
        commitments: prepared.commitments,
        cats:  data.cats  || DEF_CATS,
        cfg:   prepared.cfg,
        notif: { ...DEF_NOTIF, ...(data.notif || {}) },
      });
      await get().saveLocal();
      await get().syncCloud();
      return true;
    } catch (e) {
      console.error('[STORE] importBackup', e);
      if (rollback) {
        set(rollback);
        try {
          await get().saveLocal();
        } catch {}
      }
      return false;
    }
  },
}));
