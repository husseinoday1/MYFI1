import { create } from 'zustand';
import { DEF_CATS, DEF_CFG, DEF_NOTIF, normalizeCfg } from '../lib/constants';
import { budgetMonthId, getBudgetMapForMonth, normalizeBudgets, setBudgetForMonth, suggestBudgetsFromHistory } from '../lib/budgets';
import { buildMyfiFlowPreview, buildMyfiFlowSavePlan } from '../lib/myfiFlow';
import { GUEST_NAMESPACE } from '../lib/secureVault';
import { getLedgerNamespace, queueLedgerStateDiff, upsertMonthlyBudgetMap } from '../lib/activeLedgerRepository';
import { commitEntityChangesV7 } from '../lib/financialLedgerV7Repository';
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
    if (!after.financialLedgerV7Cutover && (before.trans !== after.trans || before.wallets !== after.wallets)) {
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
    trackerTypes: [],
    trackerItems: [],
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
      const baseCurrencyChanging = !!(
        requestedCurrency
        && requestedCurrency !== currentCurrency
        && !baseCurrencyLocked
      );
      const currentDefaultWalletId = current.cfg?.defaultWalletId || current.wallets?.[0]?.id || null;
      // Before the first financial event the reporting currency may still be
      // changed. Keep the empty default wallet aligned with that new base so a
      // fresh IRR workspace cannot display IRR while silently paying from IQD.
      const walletsForCfg = baseCurrencyChanging
        ? (current.wallets || []).map(wallet => (
            wallet?.id === currentDefaultWalletId
            && String(wallet?.currency || currentCurrency).toUpperCase() === currentCurrency
            && Number(wallet?.openingBalance || 0) === 0
              ? {
                  ...wallet,
                  currency: requestedCurrency,
                  valuationRate: 1,
                  openingBaseBalance: 0,
                }
              : wallet
          ))
        : current.wallets;
      const newCfg = normalizeCfg({
        ...current.cfg,
        ...effectivePatch,
        enabledModules: effectivePatch.enabledModules
          ? { ...(current.cfg.enabledModules || {}), ...effectivePatch.enabledModules }
          : current.cfg.enabledModules,
      });
      const budgetMetadataChanged = Object.prototype.hasOwnProperty.call(effectivePatch, 'categoryBudgets')
        || Object.prototype.hasOwnProperty.call(effectivePatch, 'categoryBudgetsByMonth');
      if (baseCurrencyChanging) {
        const prepared = prepareWalletData({
          wallets: walletsForCfg,
          trans: current.trans,
          commitments: current.commitments,
          cfg: newCfg,
        });
        if (current.financialLedgerV7Cutover) {
          const committed = await commitEntityChangesV7({
            namespace: getLedgerNamespace(current.workspaceNamespace || GUEST_NAMESPACE, newCfg),
            changes: (prepared.wallets || []).map(wallet => ({ entityType: 'wallet', id: wallet.id, payload: wallet })),
          });
          if (committed.supported && !committed.ok) {
            return { ok: false, reason: committed.reason || 'financial_v7_wallet_config_commit_failed', currencyChanged: false };
          }
        }
        coreSet(prepared);
        await get().saveLocal();
        get().scheduleCloudSync?.('settings_financial');
        return { ok: true, reason: baseCurrencyLocked ? 'base_currency_locked' : null, currencyChanged: !baseCurrencyLocked };
      }
      coreSet({ cfg: newCfg });
      // UI/device preferences are durable locally but do not create a cloud
      // mutation. Budget entities are financial and already have explicit V7
      // mutations, so they only use this path to schedule that existing outbox.
      await get().saveLocal({ dirty: budgetMetadataChanged, localOnly: !budgetMetadataChanged });
      if (budgetMetadataChanged) get().scheduleCloudSync?.('settings_financial');
      return { ok: true, reason: baseCurrencyLocked ? 'base_currency_locked' : null, currencyChanged: !baseCurrencyLocked };
    },

    setNotif: async (patch) => {
      const newNotif = { ...get().notif, ...patch };
      coreSet({ notif: newNotif });
      await get().saveLocal({ dirty: false, localOnly: true });
    },

    setCategoryBudget: async (categoryId, amount, date = new Date()) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      const month = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const scope = get().cfg.activeScope === 'business' ? 'business' : 'personal';
      const priorMap = getBudgetMapForMonth(get().cfg.categoryBudgetsByMonth || {}, targetDate, get().cfg.categoryBudgets || {});
      const monthMap = normalizeBudgets({ ...priorMap, [categoryId]: amount });
      const categoryBudgetsByMonth = setBudgetForMonth(
        get().cfg.categoryBudgetsByMonth || {}, categoryId, amount, targetDate,
      );
      const budgetId = `${scope}:${month}:${categoryId}`;
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
        changes: [{
          entityType: 'budget', id: budgetId,
          payload: {
            id: budgetId, scope, month, categoryId, amount: Number(monthMap[categoryId] || 0),
            currencyCode: get().cfg.currency, source: 'manual', acceptedSuggestion: false,
          },
        }],
      });
      if (committed.supported && !committed.ok) return false;
      await get().setCfg({
        ...(month === currentMonth ? { categoryBudgets: monthMap } : {}),
        categoryBudgetsByMonth,
      });
      if (!get().financialLedgerV7Cutover) {
        await upsertMonthlyBudgetMap({
          namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
          scope, monthKey: month, budgets: monthMap, currency: get().cfg.currency, source: 'manual',
        });
      }
      return true;
    },

    applySuggestedBudgets: async (date = new Date()) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      const month = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const scope = get().cfg.activeScope === 'business' ? 'business' : 'personal';
      const categoryBudgets = suggestBudgetsFromHistory(get().trans, get().cats, targetDate);
      const categoryBudgetsByMonth = {
        ...(get().cfg.categoryBudgetsByMonth || {}),
        [month]: categoryBudgets,
      };
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
        changes: Object.entries(categoryBudgets).map(([categoryId, amount]) => {
          const id = `${scope}:${month}:${categoryId}`;
          return {
            entityType: 'budget', id,
            payload: {
              id, scope, month, categoryId, amount: Number(amount || 0), currencyCode: get().cfg.currency,
              source: 'suggested', acceptedSuggestion: true,
            },
          };
        }),
      });
      if (committed.supported && !committed.ok) return false;
      await get().setCfg({
        ...(month === currentMonth ? { categoryBudgets } : {}),
        categoryBudgetsByMonth,
      });
      if (!get().financialLedgerV7Cutover) {
        await upsertMonthlyBudgetMap({
          namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
          scope, monthKey: month, budgets: categoryBudgets, currency: get().cfg.currency, source: 'suggested',
        });
      }
      return categoryBudgets;
    },

    copyPreviousMonthBudgets: async (date = new Date()) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      const previousDate = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 15);
      const month = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const scope = get().cfg.activeScope === 'business' ? 'business' : 'personal';
      const sourceMap = getBudgetMapForMonth(get().cfg.categoryBudgetsByMonth || {}, previousDate, {});
      if (!Object.keys(sourceMap).length) return false;
      const categoryBudgetsByMonth = { ...(get().cfg.categoryBudgetsByMonth || {}), [month]: sourceMap };
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
        changes: Object.entries(sourceMap).map(([categoryId, amount]) => {
          const id = `${scope}:${month}:${categoryId}`;
          return {
            entityType: 'budget', id,
            payload: { id, scope, month, categoryId, amount: Number(amount || 0), currencyCode: get().cfg.currency, source: 'copied_previous' },
          };
        }),
      });
      if (committed.supported && !committed.ok) return false;
      await get().setCfg({
        ...(month === currentMonth ? { categoryBudgets: sourceMap } : {}),
        categoryBudgetsByMonth,
      });
      if (!get().financialLedgerV7Cutover) {
        await upsertMonthlyBudgetMap({
          namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
          scope, monthKey: month, budgets: sourceMap, currency: get().cfg.currency, source: 'copied_previous',
        });
      }
      return true;
    },

    clearBudgets: async (date = new Date()) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      const month = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const scope = get().cfg.activeScope === 'business' ? 'business' : 'personal';
      const priorMap = getBudgetMapForMonth(get().cfg.categoryBudgetsByMonth || {}, targetDate, get().cfg.categoryBudgets || {});
      const categoryBudgetsByMonth = { ...(get().cfg.categoryBudgetsByMonth || {}) };
      delete categoryBudgetsByMonth[month];
      const deletedAt = new Date().toISOString();
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
        changes: Object.keys(priorMap).map(categoryId => {
          const id = `${scope}:${month}:${categoryId}`;
          return { entityType: 'budget', id, deletedAt, payload: { id, scope, month, categoryId, status: 'deleted' } };
        }),
      });
      if (committed.supported && !committed.ok) return false;
      await get().setCfg({
        ...(month === currentMonth ? { categoryBudgets: {} } : {}),
        categoryBudgetsByMonth,
      });
      if (!get().financialLedgerV7Cutover) {
        await upsertMonthlyBudgetMap({
          namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
          scope, monthKey: month, budgets: {}, currency: get().cfg.currency, source: 'manual',
        });
      }
      return true;
    },

    applyMyfiFlowPlan: async ({ strategy, income, allocations, categoryBindings, date = new Date(), status = 'active' } = {}) => {
      const targetDate = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(targetDate.getTime())) return { ok: false, reason: 'flow_period_invalid' };
      const current = get();
      const preview = buildMyfiFlowPreview({
        income,
        allocations,
        categoryBindings,
        categories: current.cats,
        commitments: current.commitments,
        date: targetDate,
      });
      if (!preview.valid) return { ok: false, reason: 'flow_plan_invalid', preview };

      const period = budgetMonthId(targetDate);
      const currentMonth = budgetMonthId(new Date());
      const scope = current.cfg.activeScope === 'business' ? 'business' : 'personal';
      const previousMap = getBudgetMapForMonth(current.cfg.categoryBudgetsByMonth || {}, targetDate, current.cfg.categoryBudgets || {});
      const nextMap = normalizeBudgets({
        ...previousMap,
        ...Object.fromEntries(preview.budgetChanges.map(item => [item.categoryId, item.amount])),
      });
      const plan = buildMyfiFlowSavePlan({
        strategy,
        income,
        allocations,
        categoryBindings,
        categories: current.cats,
        period,
        status,
      });
      const categoryBudgetsByMonth = { ...(current.cfg.categoryBudgetsByMonth || {}), [period]: nextMap };
      const changes = preview.budgetChanges.map(item => ({
        entityType: 'budget',
        id: `${scope}:${period}:${item.categoryId}`,
        payload: {
          id: `${scope}:${period}:${item.categoryId}`,
          scope,
          month: period,
          categoryId: item.categoryId,
          amount: Number(item.amount || 0),
          currencyCode: current.cfg.currency,
          source: 'myfi_flow',
          acceptedSuggestion: false,
        },
      }));
      const committed = changes.length ? await commitEntityChangesV7({
        namespace: getLedgerNamespace(current.workspaceNamespace || GUEST_NAMESPACE, current.cfg),
        changes,
      }) : { ok: true, supported: false };
      if (committed.supported && !committed.ok) {
        return { ok: false, reason: committed.reason || 'flow_budget_commit_failed', preview };
      }
      const saved = await get().setCfg({
        incomeAllocationPlan: plan,
        ...(period === currentMonth ? { categoryBudgets: nextMap } : {}),
        categoryBudgetsByMonth,
      });
      if (!saved?.ok) return { ok: false, reason: 'flow_plan_save_failed', preview };
      if (!get().financialLedgerV7Cutover) {
        await upsertMonthlyBudgetMap({
          namespace: getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, get().cfg),
          scope,
          monthKey: period,
          budgets: nextMap,
          currency: get().cfg.currency,
          source: 'myfi_flow',
        });
      }
      return { ok: true, preview, plan, budgetChanges: preview.budgetChanges };
    },

    ...createSyncSlice(coreSet, get),
    ...createTransactionSlice(coreSet, get),
    ...createTrackersSlice(coreSet, get),
    ...createManagementSlice(coreSet, get),
    ...createDataSlice(coreSet, get),
  };
});
