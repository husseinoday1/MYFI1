import { today, normalizeDate } from '../../utils/calc';
import { getDefaultWalletId, getWalletAvailableBalances, normalizeWallets } from '../../lib/wallets';
import { FLOW_TYPES, getEntryScope, normalizeScope } from '../../lib/modules';
import {
  capLinkedAmount,
  debtPaidTotal,
  goalSavedTotal,
  normalizeDebtItems,
  normalizeGoalItems,
  remainingAmount,
  uid,
} from '../domain';
import { debtLifecycle, goalLifecycle, planGoalReleaseUndoV1, reopenCompletionCommitments } from '../../lib/trackerLifecycle';
import { buildEntityCurrencyFields, normalizeCurrencyCode } from '../../lib/financialCoreV2';
import { getLedgerNamespace } from '../../lib/activeLedgerRepository';
import { commandWalletPosition } from '../../lib/financialCommandBalances';
import { buildTrackerTransactionTitle, TRANSACTION_SEMANTIC_KIND } from '../../lib/transactionSemantics';
import {
  commitEntityChangesV7,
  commitFinancialTransactionV7,
  voidFinancialTransactionsV7,
} from '../../lib/financialLedgerV7Repository';

const walletPositionForTrackerCommand = (get, walletId) => commandWalletPosition({
  cutover: !!get().financialLedgerV7Cutover,
  namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
  walletId,
  wallets: get().wallets,
  transactions: get().trans,
  currency: get().cfg.currency,
  defaultWalletId: get().cfg.defaultWalletId,
});

export const createTrackersSlice = (set, get) => ({
  addDebt: async (d) => {
    const scope = normalizeScope(d.scope, getEntryScope(get().cfg));
    const originMode = ['received', 'lent'].includes(d.originMode) ? d.originMode : 'previous';
    const debtId = uid();
    const originTransactionId = originMode === 'previous' ? null : uid();
    const entityCurrency = normalizeCurrencyCode(d.currencyCode || d.currency, get().cfg.currency);
    const debt = normalizeDebtItems([{
      ...d,
      currencyCode: entityCurrency,
      scope,
      direction: d.direction || 'owed',
      id: debtId,
      paid: 0,
      payments: [],
      createdAt: normalizeDate(d.createdAt),
      originMode,
      originTransactionId,
    }], scope, entityCurrency)[0];
    const walletId = d.walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const originAmount = originMode === 'received'
      ? Math.abs(Number(debt.total) || 0)
      : originMode === 'lent'
        ? -Math.abs(Number(debt.total) || 0)
        : 0;
    let originCurrencyFields = null;
    if (originAmount) {
      try {
        originCurrencyFields = buildEntityCurrencyFields({
          entityAmount: originAmount,
          entityCurrency: debt.currencyCode,
          walletId,
          wallets: get().wallets,
          baseCurrency: get().cfg.currency,
          entityBaseRate: d.entityBaseRate,
          walletBaseRate: d.walletBaseRate ?? d.exchangeRate,
        });
      } catch (error) {
        set({ ledgerError: String(error?.message || 'debt_origin_fx_required') });
        return false;
      }
    }
    const originTx = originAmount ? {
      id: originTransactionId,
      title: originMode === 'received' ? `استلام دين عليّ — ${debt.name}` : `إنشاء دين لي — ${debt.name}`,
      amt: originCurrencyFields.baseAmount,
      ...originCurrencyFields,
      cat: 'other',
      walletId,
      dateISO: debt.createdAt,
      ts: Date.now(),
      scope,
      flowType: originMode === 'received' ? FLOW_TYPES.DEBT_PROCEEDS : FLOW_TYPES.RECEIVABLE_CREATED,
      transactionTag: originMode === 'received' ? 'debt_owed' : 'debt_receivable',
      isDebtOrigin: true,
      debtId: debt.id,
      debtComponent: 'principal',
      rateDate: debt.createdAt,
      rateSource: originCurrencyFields?.fxSnapshotSource || 'same_currency',
      idempotencyKey: `debt-origin:${originTransactionId}`,
    } : null;
    try {
      const namespace = getLedgerNamespace(get().workspaceNamespace, get().cfg);
      const entityChanges = [{ entityType: 'debt', id: debt.id, payload: debt }];
      const committed = originTx
        ? await commitFinancialTransactionV7({
            namespace, transaction: originTx, wallets: get().wallets,
            baseCurrency: get().cfg.currency, entityChanges,
          })
        : await commitEntityChangesV7({ namespace, changes: entityChanges });
      if (committed.supported && !committed.ok) return false;
      if (originTx && committed.ok) {
        originTx.id = committed.transactionId;
        originTx.storageEngineVersion = 7;
        originTx.sqliteCommittedAt = committed.committedAt || new Date().toISOString();
      }
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_debt_create_failed') });
      return false;
    }
    set(s => ({
      debts: [debt, ...s.debts],
      trans: originTx ? [originTx, ...s.trans] : s.trans,
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return debt;
  },

  editDebt: async (id, patch) => {
    const current = get().debts.find(item => item.id === id);
    if (!current) return false;
    const normalized = normalizeDebtItems([{
      ...current,
      ...patch,
      currencyCode: current.currencyCode || patch.currencyCode,
    }], current.scope, current.currencyCode || get().cfg.currency)[0];
    const nextDebt = {
      ...normalized,
      ...(current.status === 'settled' && normalized.status === 'active' ? { reopenedAt: today() } : {}),
    };
    const reopenedLink = current.status === 'settled' && nextDebt.status === 'active'
      ? {
          linkedType: nextDebt.direction === 'receivable' ? 'receivable' : 'debt',
          linkedId: id,
          endReason: 'debt_settled',
        }
      : null;
    const nextCommitments = reopenedLink
      ? reopenCompletionCommitments(get().commitments, [reopenedLink])
      : get().commitments;
    const changedCommitments = nextCommitments.filter(item => {
      const before = get().commitments.find(previous => previous.id === item.id);
      return before && JSON.stringify(before) !== JSON.stringify(item);
    });
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: [
          { entityType: 'debt', id: nextDebt.id, payload: nextDebt },
          ...changedCommitments.map(item => ({ entityType: 'commitment', id: item.id, payload: item })),
        ],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_debt_edit_failed') });
      return false;
    }
    // Renaming tracker metadata must not rewrite historical transaction titles.
    set(s => ({
      debts: s.debts.map(item => item.id === id ? nextDebt : item),
      commitments: reopenedLink ? nextCommitments : s.commitments,
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return true;
  },

  deleteDebt: async (id) => {
    const current = get();
    const debt = current.debts.find(item => item.id === id);
    if (!debt) return false;
    const linkedCommitments = current.commitments.filter(item => (
      (item.linkedType === 'debt' || item.linkedType === 'receivable') && item.linkedId === id
    ));
    const now = new Date().toISOString();
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(current.workspaceNamespace, current.cfg),
        changes: [
          { entityType: 'debt', id, payload: debt, deletedAt: now },
          ...linkedCommitments.map(item => ({ entityType: 'commitment', id: item.id, payload: item, deletedAt: now })),
        ],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_debt_delete_failed') });
      return false;
    }
    // Tracker deletion is metadata lifecycle only. Financial origin/payment rows remain immutable history.
    set(s => ({
      debts: s.debts.filter(item => item.id !== id),
      commitments: s.commitments.filter(item => !linkedCommitments.some(linked => linked.id === item.id)),
    }));
    await get().saveLocal({ force: true });
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return true;
  },

  addPayment: async (debtId, amt) => {
    await get().payDebt(debtId, amt);
  },

  payDebt: async (debtId, amt, dateISO = today(), walletId = null, meta = {}) => {
    const { financialEntityChanges = [], ...transactionMeta } = meta || {};
    const entryDate = normalizeDate(dateISO);
    const txWalletId = walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const payId = uid();
    const debt = get().debts.find(d => d.id === debtId);
    if (!debt) return false;
    const n = Math.min(Math.abs(Number(amt) || 0), remainingAmount(debt.total, debt.paid));
    if (n <= 0) return false;
    const isReceivable = debt?.direction === 'receivable';
    const signedEntityAmount = isReceivable ? n : -n;
    let currencyFields;
    try {
      currencyFields = buildEntityCurrencyFields({
        entityAmount: signedEntityAmount,
        entityCurrency: debt.currencyCode || get().cfg.currency,
        walletId: txWalletId,
        wallets: get().wallets,
        baseCurrency: get().cfg.currency,
        entityBaseRate: transactionMeta.entityBaseRate,
        walletBaseRate: transactionMeta.walletBaseRate ?? transactionMeta.exchangeRate,
      });
    } catch (error) {
      set({ ledgerError: String(error?.message || 'debt_payment_fx_required') });
      return false;
    }
    const availableBalance = (await walletPositionForTrackerCommand(get, txWalletId))?.availableBalance;
    const spendNative = isReceivable ? 0 : Math.abs(Number(currencyFields.walletAmount || 0));
    const balanceWarning = !isReceivable && spendNative > 0 && (
      !Number.isFinite(availableBalance) || spendNative > Number(availableBalance || 0) + 0.0001
    );
    const pay = {
      id: payId, amt: n, currencyCode: debt.currencyCode || get().cfg.currency, date: entryDate, ts: Date.now(),
      walletId: txWalletId, walletAmount: Math.abs(Number(currencyFields.walletAmount || 0)),
      walletCurrency: currencyFields.walletCurrency, exchangeRate: currencyFields.exchangeRate,
      entityBaseRate: currencyFields.entityBaseRate, walletBaseRate: currencyFields.walletBaseRate,
    };
    const nextPaid = debtPaidTotal(debt, [...(debt.payments || []), pay]);
    const nextDebtBase = { ...debt, payments: [...(debt.payments || []), pay], paid: nextPaid };
    const nextDebt = { ...nextDebtBase, ...debtLifecycle(nextDebtBase, nextPaid, entryDate) };
    const completesDebt = nextDebt.status === 'settled';
    const semanticKind = isReceivable
      ? TRANSACTION_SEMANTIC_KIND.RECEIVABLE_COLLECTION
      : TRANSACTION_SEMANTIC_KIND.DEBT_PAYMENT;
    const title = buildTrackerTransactionTitle({
      kind: semanticKind,
      entityName: debt.name,
      commitmentName: transactionMeta.commitmentNameSnapshot,
      lang: get().cfg.lang,
    });
    const paymentTx = {
      ...transactionMeta,
      id: uid(), title, amt: currencyFields.baseAmount, ...currencyFields, cat: transactionMeta.cat || 'other', walletId: txWalletId,
      dateISO: entryDate, ts: Date.now(), balanceWarning,
      scope: normalizeScope(transactionMeta.scope || debt.scope, getEntryScope(get().cfg)),
      flowType: isReceivable ? FLOW_TYPES.RECEIVABLE_COLLECTION : FLOW_TYPES.DEBT_PAYMENT,
      transactionTag: transactionMeta.transactionTag || (isReceivable ? 'debt_receivable' : 'debt_owed'),
      isDebtPayment: true, debtId, paymentId: payId,
      titleSource: 'generated', entityNameSnapshot: debt.name, entityTypeSnapshot: isReceivable ? 'receivable' : 'debt',
      debtComponent: 'principal',
      rateDate: transactionMeta.rateDate || entryDate,
      rateSource: transactionMeta.rateSource || currencyFields.fxSnapshotSource,
      idempotencyKey: transactionMeta.idempotencyKey || `debt-payment:${payId}`,
      ...(completesDebt ? { completionNotice: 'debt_ended' } : {}),
    };
    try {
      const committed = await commitFinancialTransactionV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        transaction: paymentTx,
        wallets: get().wallets,
        baseCurrency: get().cfg.currency,
        entityChanges: [
          { entityType: 'debt', id: nextDebt.id, payload: nextDebt },
          ...(Array.isArray(financialEntityChanges) ? financialEntityChanges : []),
        ],
      });
      if (committed.supported && !committed.ok) return false;
      if (committed.ok) {
        paymentTx.id = committed.transactionId;
        paymentTx.storageEngineVersion = 7;
        paymentTx.sqliteCommittedAt = committed.committedAt || new Date().toISOString();
      }
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_debt_payment_failed') });
      return false;
    }
    set(s => ({
      debts: s.debts.map(d => d.id === debtId ? nextDebt : d),
      commitments: completesDebt
        ? s.commitments.map(item => (
            (item.linkedType === (isReceivable ? 'receivable' : 'debt') && item.linkedId === debtId)
              ? { ...item, active: false, endedAt: entryDate, endReason: 'debt_settled' }
              : item
          ))
        : s.commitments,
      trans: [paymentTx, ...s.trans],
    }));
    set(s => ({
      trans: s.trans.map(t => (
        t.isDebtPayment && t.paymentId === payId
          ? { ...t, dateISO: entryDate }
          : t
      )),
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return n;
  },

  editDebtPayment: async (debtId, paymentId, amt, dateISO = null) => {
    const debt = get().debts.find(d => d.id === debtId);
    const currentPayment = debt?.payments?.find(p => p.id === paymentId);
    const n = capLinkedAmount(amt, debt?.total, debt?.paid, currentPayment?.amt);
    const currentTx = get().trans.find(t => t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId);
    if (!n || !currentTx) return false;
    return get().editTrans(currentTx.id, {
      amt: debt?.direction === 'receivable' ? n : -n,
      dateISO: normalizeDate(dateISO || currentPayment?.date || currentTx.dateISO || today()),
    });
  },

  deleteDebtPayment: async (debtId, paymentId) => {
    const currentTx = get().trans.find(t => t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId);
    return currentTx ? get().deleteTrans(currentTx.id) : false;
  },

  addGoal: async (g) => {
    const scope = normalizeScope(g.scope, getEntryScope(get().cfg));
    const entityCurrency = normalizeCurrencyCode(g.currencyCode || g.currency, get().cfg.currency);
    const goal = normalizeGoalItems([{ ...g, currencyCode: entityCurrency, scope, id: uid(), cur: 0, savings: [], createdAt: normalizeDate(g.createdAt) }], scope, entityCurrency)[0];
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: [{ entityType: 'goal', id: goal.id, payload: goal }],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_goal_create_failed') });
      return false;
    }
    set(s => ({ goals: [goal, ...s.goals] }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return goal;
  },

  editGoal: async (id, patch) => {
    const current = get().goals.find(item => item.id === id);
    if (!current) return false;
    const normalized = normalizeGoalItems([{
      ...current,
      ...patch,
      currencyCode: current.currencyCode || patch.currencyCode,
    }], current.scope, current.currencyCode || get().cfg.currency)[0];
    const nextGoal = { ...normalized, ...goalLifecycle(normalized, normalized.cur, today()) };
    const reopenedLink = current.status === 'settled' && nextGoal.status === 'active'
      ? { linkedType: 'goal', linkedId: id, endReason: 'goal_completed' }
      : null;
    const nextCommitments = reopenedLink
      ? reopenCompletionCommitments(get().commitments, [reopenedLink])
      : get().commitments;
    const changedCommitments = nextCommitments.filter(item => {
      const before = get().commitments.find(previous => previous.id === item.id);
      return before && JSON.stringify(before) !== JSON.stringify(item);
    });
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: [
          { entityType: 'goal', id: nextGoal.id, payload: nextGoal },
          ...changedCommitments.map(item => ({ entityType: 'commitment', id: item.id, payload: item })),
        ],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_goal_edit_failed') });
      return false;
    }
    // Tracker label edits do not rewrite historical saving transaction descriptions.
    set(s => ({
      goals: s.goals.map(item => item.id === id ? nextGoal : item),
      commitments: reopenedLink ? nextCommitments : s.commitments,
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return true;
  },

  deleteGoal: async (id) => {
    const current = get();
    const goal = current.goals.find(item => item.id === id);
    if (!goal) return false;
    const linkedCommitments = current.commitments.filter(item => item.linkedType === 'goal' && item.linkedId === id);
    const now = new Date().toISOString();
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(current.workspaceNamespace, current.cfg),
        changes: [
          { entityType: 'goal', id, payload: goal, deletedAt: now },
          ...linkedCommitments.map(item => ({ entityType: 'commitment', id: item.id, payload: item, deletedAt: now })),
        ],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_goal_delete_failed') });
      return false;
    }
    // Goal tracker removal never erases allocations/releases already posted to the ledger.
    set(s => ({
      goals: s.goals.filter(item => item.id !== id),
      commitments: s.commitments.filter(item => !linkedCommitments.some(linked => linked.id === item.id)),
    }));
    await get().saveLocal({ force: true });
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return true;
  },

  addGoalSaving: async (goalId, amt) => {
    await get().saveGoal(goalId, amt);
  },

  saveGoal: async (goalId, amt, dateISO = today(), walletId = null, meta = {}) => {
    const { financialEntityChanges = [], ...transactionMeta } = meta || {};
    const entryDate = normalizeDate(dateISO);
    const txWalletId = walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const saveId = uid();
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal) return false;
    const n = Math.min(Math.abs(Number(amt) || 0), remainingAmount(goal.target, goal.cur));
    if (n <= 0) return false;
    let allocationCurrency;
    try {
      allocationCurrency = buildEntityCurrencyFields({
        entityAmount: n,
        entityCurrency: goal.currencyCode || get().cfg.currency,
        walletId: txWalletId,
        wallets: get().wallets,
        baseCurrency: get().cfg.currency,
        entityBaseRate: transactionMeta.entityBaseRate,
        walletBaseRate: transactionMeta.walletBaseRate ?? transactionMeta.exchangeRate,
      });
    } catch (error) {
      set({ ledgerError: String(error?.message || 'goal_saving_fx_required') });
      return false;
    }
    const allocationWalletAmount = Math.abs(Number(allocationCurrency.walletAmount || 0));
    const availableBalance = (await walletPositionForTrackerCommand(get, txWalletId))?.availableBalance;
    const balanceWarning = allocationWalletAmount > 0 && (
      !Number.isFinite(availableBalance) || allocationWalletAmount > Number(availableBalance || 0) + 0.0001
    );
    const entry = {
      id: saveId, amt: n, currencyCode: goal.currencyCode || get().cfg.currency, date: entryDate, ts: Date.now(), walletId: txWalletId,
      walletAmount: allocationWalletAmount, walletCurrency: allocationCurrency.walletCurrency,
      exchangeRate: allocationCurrency.exchangeRate, entityBaseRate: allocationCurrency.entityBaseRate,
      walletBaseRate: allocationCurrency.walletBaseRate,
    };
    const nextSaved = Math.min(goalSavedTotal(goal, [...(goal.savings || []), entry]), goal.target);
    const nextGoalBase = { ...goal, savings: [...(goal.savings || []), entry], cur: nextSaved };
    const nextGoal = { ...nextGoalBase, ...goalLifecycle(nextGoalBase, nextSaved, entryDate) };
    const completesGoal = nextGoal.status === 'settled';
    const savingTitle = buildTrackerTransactionTitle({
      kind: TRANSACTION_SEMANTIC_KIND.GOAL_ALLOCATION,
      entityName: goal.name,
      commitmentName: transactionMeta.commitmentNameSnapshot,
      lang: get().cfg.lang,
    });
    const savingTx = {
      ...transactionMeta,
      id: uid(), title: savingTitle, titleSource: 'generated', entityNameSnapshot: goal.name, entityTypeSnapshot: 'goal', amt: 0, allocationAmount: n,
      entityAmount: n, entityCurrencyCode: goal.currencyCode || get().cfg.currency,
      entityBaseRate: allocationCurrency.entityBaseRate, walletBaseRate: allocationCurrency.walletBaseRate,
      allocationBaseAmount: Math.abs(Number(allocationCurrency.baseAmount || 0)),
      allocationBaseAmountMinor: Math.abs(Number(allocationCurrency.baseAmountMinor || 0)),
      allocationWalletAmount, allocationWalletAmountMinor: Math.abs(Number(allocationCurrency.walletAmountMinor || 0)),
      walletCurrency: allocationCurrency.walletCurrency,
      currencyCode: allocationCurrency.walletCurrency, baseCurrencyCode: allocationCurrency.baseCurrencyCode,
      exchangeRate: allocationCurrency.exchangeRate, walletAmount: 0, baseAmount: 0,
      balanceWarning, cat: transactionMeta.cat || 'other', walletId: txWalletId, dateISO: entryDate, ts: Date.now(),
      scope: normalizeScope(transactionMeta.scope || goal.scope, getEntryScope(get().cfg)),
      flowType: FLOW_TYPES.GOAL_ALLOCATION,
      transactionTag: transactionMeta.transactionTag || 'saving',
      isGoalSaving: true, goalId, savingId: saveId,
      rateDate: transactionMeta.rateDate || entryDate,
      rateSource: transactionMeta.rateSource || allocationCurrency.fxSnapshotSource,
      idempotencyKey: transactionMeta.idempotencyKey || `goal-saving:${saveId}`,
      ...(completesGoal ? { completionNotice: 'goal_completed' } : {}),
    };
    try {
      const committed = await commitFinancialTransactionV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        transaction: savingTx,
        wallets: get().wallets,
        baseCurrency: get().cfg.currency,
        entityChanges: [
          { entityType: 'goal', id: nextGoal.id, payload: nextGoal },
          ...(Array.isArray(financialEntityChanges) ? financialEntityChanges : []),
        ],
      });
      if (committed.supported && !committed.ok) return false;
      if (committed.ok) {
        savingTx.id = committed.transactionId;
        savingTx.storageEngineVersion = 7;
        savingTx.sqliteCommittedAt = committed.committedAt || new Date().toISOString();
      }
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_goal_saving_failed') });
      return false;
    }
    set(s => ({
      goals: s.goals.map(g => g.id === goalId ? nextGoal : g),
      commitments: completesGoal
        ? s.commitments.map(item => (
            item.linkedType === 'goal' && item.linkedId === goalId
              ? { ...item, active: false, endedAt: entryDate, endReason: 'goal_completed' }
              : item
          ))
        : s.commitments,
      trans: [savingTx, ...s.trans],
    }));
    set(s => ({
      trans: s.trans.map(t => (
        t.isGoalSaving && t.savingId === saveId
          ? { ...t, dateISO: entryDate }
          : t
      )),
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return n;
  },

  releaseGoalSavings: async (goalId, dateISO = today()) => {
    const entryDate = normalizeDate(dateISO);
    const goal = get().goals.find(item => item.id === goalId);
    if (!goal || goal.purpose !== 'reserve' || !['active', 'settled'].includes(goal.status) || Number(goal.cur || 0) < Number(goal.target || 0)) return false;
    const releasedAmount = Number(goal.cur || 0);
    const nextGoal = {
      ...goal,
      savings: [],
      cur: 0,
      active: false,
      status: 'released',
      completedAt: goal.completedAt || goal.settledAt || entryDate,
      settledAt: goal.settledAt || goal.completedAt || entryDate,
      releasedAt: entryDate,
      settledAmount: releasedAmount,
    };
    const nextCommitments = get().commitments.map(item => (
      item.linkedType === 'goal' && item.linkedId === goalId ? { ...item, active: false } : item
    ));
    const allocationMap = new Map();
    for (const saving of goal.savings || []) {
      const walletId = saving.walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
      const current = allocationMap.get(walletId) || { walletId, amount: 0, exchangeRate: saving.exchangeRate || 1 };
      current.amount += Math.abs(Number(saving.walletAmount ?? saving.amt ?? 0));
      allocationMap.set(walletId, current);
    }
    const releaseAllocations = [...allocationMap.values()].filter(item => item.amount > 0);
    if (releaseAllocations.length) {
      const releaseId = uid();
      const releaseTx = {
        id: releaseId,
        title: `تحرير التوفير — ${goal.name || ''}`,
        amt: 0,
        walletAmount: 0,
        baseAmount: 0,
        allocationAmount: releasedAmount,
        releaseAllocations,
        walletId: releaseAllocations[0].walletId,
        cat: 'other',
        dateISO: entryDate,
        ts: Date.now(),
        scope: normalizeScope(goal.scope, getEntryScope(get().cfg)),
        flowType: 'goal_release',
        isGoalRelease: true,
        goalId,
        hiddenFromHistory: true,
        rateDate: entryDate,
        rateSource: 'historical_allocation_release',
        idempotencyKey: `goal-release:${releaseId}`,
      };
      try {
        const committed = await commitFinancialTransactionV7({
          namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
          transaction: releaseTx,
          wallets: get().wallets,
          baseCurrency: get().cfg.currency,
          entityChanges: [
            { entityType: 'goal', id: nextGoal.id, payload: nextGoal },
            ...nextCommitments.filter(item => item.linkedType === 'goal' && item.linkedId === goalId)
              .map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
          ],
        });
        if (committed.supported && !committed.ok) return false;
      } catch (error) {
        set({ ledgerError: String(error?.message || 'financial_v7_goal_release_failed') });
        return false;
      }
    } else {
      try {
        const committed = await commitEntityChangesV7({
          namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
          changes: [
            { entityType: 'goal', id: nextGoal.id, payload: nextGoal },
            ...nextCommitments.filter(item => item.linkedType === 'goal' && item.linkedId === goalId)
              .map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
          ],
        });
        if (committed.supported && !committed.ok) return false;
      } catch (error) {
        set({ ledgerError: String(error?.message || 'financial_v7_goal_release_failed') });
        return false;
      }
    }
    set(s => ({
      goals: s.goals.map(item => (
        item.id === goalId ? nextGoal : item
      )),
      commitments: nextCommitments,
      trans: s.trans.map(item => (
        item.isGoalSaving && item.goalId === goalId
          ? { ...item, allocationReleased: true, allocationReleasedAt: entryDate }
          : item
      )),
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return true;
  },

  // The owner's way back from a completed-and-transferred goal. Deliberately
  // explicit: nothing calls this automatically, and it refuses rather than
  // half-applying. See planGoalReleaseUndoV1 for why a wallet check is required
  // -- releasing frees a reservation, so undoing one has to re-take it.
  undoGoalRelease: async (goalId) => {
    const state = get();
    const goal = state.goals.find(item => item.id === goalId);
    if (!goal) return { ok: false, reason: 'goal_not_found' };

    const availableById = new Map(
      getWalletAvailableBalances(state.wallets, state.trans, state.cfg.currency, state.cfg.defaultWalletId)
        .map(wallet => [wallet.id, Number(wallet.availableBalance || 0)]),
    );
    const plan = planGoalReleaseUndoV1({
      goal, transactions: state.trans, walletAvailableById: availableById,
    });
    if (!plan.ok) return plan;

    const nextGoal = {
      ...goal,
      savings: plan.savings,
      cur: plan.cur,
      status: plan.status,
      active: true,
      releasedAt: null,
      settledAmount: plan.cur,
    };
    // The release transaction is what makes stateFromFinancialV7 re-derive
    // allocationReleased on every hydration, so it has to go for the undo to
    // survive a restart. Voided, not erased, like every other deletion here.
    const releaseRows = state.trans.filter(item => item.isGoalRelease && item.goalId === goalId);

    try {
      const committed = await voidFinancialTransactionsV7({
        namespace: getLedgerNamespace(state.workspaceNamespace, state.cfg),
        transactionIds: releaseRows.map(item => item.id),
        entityChanges: [{ entityType: 'goal', id: nextGoal.id, payload: nextGoal }],
      });
      if (committed.supported && !committed.ok) {
        return { ok: false, reason: committed.reason || 'goal_release_undo_commit_failed' };
      }
    } catch (error) {
      const reason = String(error?.message || 'goal_release_undo_failed');
      set({ ledgerError: reason });
      return { ok: false, reason };
    }

    const releaseIds = new Set(releaseRows.map(item => item.id));
    set(s => ({
      goals: s.goals.map(item => (item.id === goalId ? nextGoal : item)),
      trans: s.trans
        .filter(item => !releaseIds.has(item.id))
        .map(item => (
          item.isGoalSaving && item.goalId === goalId
            ? { ...item, allocationReleased: false, allocationReleasedAt: null }
            : item
        )),
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
    return { ok: true, cur: plan.cur, reReserved: plan.reReserved };
  },

  editGoalSaving: async (goalId, savingId, amt, dateISO = null) => {
    const goal = get().goals.find(g => g.id === goalId);
    const currentSaving = goal?.savings?.find(sv => sv.id === savingId);
    const n = capLinkedAmount(amt, goal?.target, goal?.cur, currentSaving?.amt);
    const currentTx = get().trans.find(t => t.isGoalSaving && t.goalId === goalId && t.savingId === savingId);
    if (!n || !currentTx) return false;
    return get().editTrans(currentTx.id, {
      amt: n,
      dateISO: normalizeDate(dateISO || currentSaving?.date || currentTx.dateISO || today()),
    });
  },

  deleteGoalSaving: async (goalId, savingId) => {
    const currentTx = get().trans.find(t => t.isGoalSaving && t.goalId === goalId && t.savingId === savingId);
    return currentTx ? get().deleteTrans(currentTx.id) : false;
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
    const transactionIds = get().trans.filter(item => (
      (item.isDebtPayment && debtPayments.has(`${item.debtId}:${item.paymentId}`))
      || (item.isGoalSaving && goalSavings.has(`${item.goalId}:${item.savingId}`))
    )).map(item => item.id);
    return transactionIds.length ? get().deleteTransMany(transactionIds) : false;
  },
});
