import { create } from 'zustand';
import { DEF_CATS, DEF_CFG, DEF_NOTIF, normalizeCfg } from '../lib/constants';
import { budgetMonthId, getBudgetMapForMonth, normalizeBudgets, setBudgetForMonth, suggestBudgetsFromHistory } from '../lib/budgets';
import { GUEST_NAMESPACE } from '../lib/secureVault';
import { getLedgerNamespace, queueLedgerStateDiff, upsertMonthlyBudgetMap } from '../lib/activeLedgerRepository';
import {
  hasCurrencySensitiveFinancialData,
  prepareWalletData,
} from './domain';
import { createSyncSlice } from './slices/useSyncSlice';
import { createTransactionSlice } from './slices/transactionsSlice';
import { createTrackersSlice } from './slices/trackersSlice';
import { createManagementSlice } from './slices/managementSlice';
import { createDataSlice } from './slices/dataSlice';

export const useStore = create((set, get) => {
  // Financial Core 2.0 compatibility bridge. Existing screens can keep using
  // Zustand while every transaction mutation is mirrored into the durable
  // relational ledger. The bridge is asynchronous and never blocks a UI set().
  const coreSet = (partial, replace) => {
    const before = get();
    set(partial, replace);
    const after = get();
    if (before.trans !== after.trans || before.wallets !== after.wallets) {
      queueLedgerStateDiff({
        namespace: getLedgerNamespace(after.workspaceNamespace || GUEST_NAMESPACE, after.cfg),
        beforeTransactions: before.workspaceNamespace === after.workspaceNamespace ? before.trans : [],
        afterTransactions: after.trans,
        wallets: after.wallets,
        baseCurrency: after.cfg?.currency || 'IQD',
      });
    }
  };

  return {
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
    ledgerReady: false,
    financialLedgerV7Ready: false,
    financialLedgerV7Cutover: false,
    financialLedgerV7Checksum: null,
    financialLedgerV7Migration: null,
    ledgerError: null,
    dataHealth: { ok: true, supported: true, issues: [] },
    lastDeletedTransaction: null,

    setCfg: async (patch = {}) => {
      const current = get();
      const currentCurrency = String(current.cfg?.currency || 'IQD').toUpperCase();
      const requestedCurrency = patch.currency == null ? null : String(patch.currency || '').toUpperCase();
      const baseCurrencyLocked = !!(
        requestedCurrency
        && requestedCurrency !== currentCurrency
        && hasCurrencySensitiveFinancialData(current)
      );
      const effectivePatch = baseCurrencyLocked
        ? { ...patch, currency: currentCurrency }
        : patch;
      const newCfg = normalizeCfg({
        ...current.cfg,
        ...effectivePatch,
        enabledModules: effectivePatch.enabledModules
          ? { ...(current.cfg.enabledModules || {}), ...effectivePatch.enabledModules }
          : current.cfg.enabledModules,
      });
      if (newCfg.enabledModules?.wallets || effectivePatch.defaultWalletId || effectivePatch.currency || effectivePatch.profileType || effectivePatch.activeScope) {
        const prepared = prepareWalletData({
          wallets: current.wallets,
          trans: current.trans,
          commitments: current.commitments,
          cfg: newCfg,
        });
        coreSet(prepared);
        await get().saveLocal();
        get().scheduleCloudSync?.('settings_financial');
        return { ok: true, reason: baseCurrencyLocked ? 'base_currency_locked' : null, currencyChanged: !baseCurrencyLocked };
      }
      coreSet({ cfg: newCfg });
      await get().saveLocal();
      get().scheduleCloudSync?.('settings');
      return { ok: true, reason: baseCurrencyLocked ? 'base_currency_locked' : null, currencyChanged: !baseCurrencyLocked };
    },

    setNotif: async (patch) => {
      const newNotif = { ...get().notif, ...patch };
      coreSet({ notif: newNotif });
      await get().saveLocal({ dirty: false });
    },

    setCategoryBudget: async (categoryId, amount, date = new Date()) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      const month = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const priorMap = getBudgetMapForMonth(get().cfg.categoryBudgetsByMonth || {}, targetDate, get().cfg.categoryBudgets || {});
      const monthMap = normalizeBudgets({ ...priorMap, [categoryId]: amount });
      const categoryBudgetsByMonth = setBudgetForMonth(
        get().cfg.categoryBudgetsByMonth || {}, categoryId, amount, targetDate,
      );
      await get().setCfg({
        ...(month === currentMonth ? { categoryBudgets: monthMap } : {}),
        categoryBudgetsByMonth,
      });
      await upsertMonthlyBudgetMap({
        namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
        scope: get().cfg.activeScope === 'business' ? 'business' : 'personal',
        monthKey: month, budgets: monthMap, currency: get().cfg.currency, source: 'manual',
      });
    },

    applySuggestedBudgets: async (date = new Date()) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      const month = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const categoryBudgets = suggestBudgetsFromHistory(get().trans, get().cats, targetDate);
      const categoryBudgetsByMonth = {
        ...(get().cfg.categoryBudgetsByMonth || {}),
        [month]: categoryBudgets,
      };
      await get().setCfg({
        ...(month === currentMonth ? { categoryBudgets } : {}),
        categoryBudgetsByMonth,
      });
      await upsertMonthlyBudgetMap({
        namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
        scope: get().cfg.activeScope === 'business' ? 'business' : 'personal',
        monthKey: month, budgets: categoryBudgets, currency: get().cfg.currency, source: 'suggested',
      });
      return categoryBudgets;
    },

    copyPreviousMonthBudgets: async (date = new Date()) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      const previousDate = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 15);
      const month = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const sourceMap = getBudgetMapForMonth(get().cfg.categoryBudgetsByMonth || {}, previousDate, {});
      if (!Object.keys(sourceMap).length) return false;
      const categoryBudgetsByMonth = { ...(get().cfg.categoryBudgetsByMonth || {}), [month]: sourceMap };
      await get().setCfg({
        ...(month === currentMonth ? { categoryBudgets: sourceMap } : {}),
        categoryBudgetsByMonth,
      });
      await upsertMonthlyBudgetMap({
        namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
        scope: get().cfg.activeScope === 'business' ? 'business' : 'personal',
        monthKey: month, budgets: sourceMap, currency: get().cfg.currency, source: 'copied_previous',
      });
      return true;
    },

    clearBudgets: async (date = new Date()) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      const month = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const categoryBudgetsByMonth = { ...(get().cfg.categoryBudgetsByMonth || {}) };
      delete categoryBudgetsByMonth[month];
      await get().setCfg({
        ...(month === currentMonth ? { categoryBudgets: {} } : {}),
        categoryBudgetsByMonth,
      });
      await upsertMonthlyBudgetMap({
        namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
        scope: get().cfg.activeScope === 'business' ? 'business' : 'personal',
        monthKey: month, budgets: {}, currency: get().cfg.currency, source: 'manual',
      });
    },

    ...createSyncSlice(coreSet, get),
    ...createTransactionSlice(coreSet, get),
    ...createTrackersSlice(coreSet, get),
    ...createManagementSlice(coreSet, get),
    ...createDataSlice(coreSet, get),
  };
});
