import { create } from 'zustand';
import { DEF_CATS, DEF_CFG, DEF_NOTIF, normalizeCfg } from '../lib/constants';
import { normalizeBudgets, suggestBudgetsFromHistory } from '../lib/budgets';
import { GUEST_NAMESPACE } from '../lib/secureVault';
import {
  prepareWalletData,
} from './domain';
import { createSyncSlice } from './slices/useSyncSlice';
import { createTransactionSlice } from './slices/transactionsSlice';
import { createTrackersSlice } from './slices/trackersSlice';
import { createManagementSlice } from './slices/managementSlice';
import { createDataSlice } from './slices/dataSlice';
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
  vaultUnreadable: false,
  vaultError: null,
  vaultRecovery: null,
  lastSyncedAt: null,
  auditOk: true,
  auditIssues: [],
  workspaceNamespace: GUEST_NAMESPACE,
  workspaceReady: false,
  pendingGuestTransfer: false,
  guestTransferPreview: null,
  lastMergeRollback: null,
  dirty: false,
  localUpdatedAt: null,
  cloudRevision: 0,
  syncConflict: null,
  normalizedPreview: null,
  normalizedPreviewError: null,
  normalizedPreviewing: false,

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

  ...createSyncSlice(set, get),

  ...createTransactionSlice(set, get),

  ...createTrackersSlice(set, get),

  ...createManagementSlice(set, get),

  ...createDataSlice(set, get),
}));
