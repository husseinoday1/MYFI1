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
import { debtLifecycle, goalLifecycle, reopenCompletionCommitments } from '../../lib/trackerLifecycle';
import { buildEntityCurrencyFields, normalizeCurrencyCode } from '../../lib/financialCoreV2';
import { getLedgerNamespace } from '../../lib/activeLedgerRepository';
import {
  commitEntityChangesV7,
  commitFinancialTransactionV7,
} from '../../lib/financialLedgerV7Repository';

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
    set(s => {
      let nextName = null;
      let reopenedLink = null;
      const debts = s.debts.map(d => {
        if (d.id !== id) return d;
        const next = normalizeDebtItems([{ ...d, ...patch, currencyCode: d.currencyCode || patch.currencyCode }], d.scope, d.currencyCode || get().cfg.currency)[0];
        nextName = next.name;
        if (d.status === 'settled' && next.status === 'active') {
          reopenedLink = {
            linkedType: next.direction === 'receivable' ? 'receivable' : 'debt',
            linkedId: id,
            endReason: 'debt_settled',
          };
        }
        return {
          ...next,
          ...(d.status === 'settled' && next.status === 'active' ? { reopenedAt: today() } : {}),
        };
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
      return {
        debts,
        trans,
        commitments: reopenedLink
          ? reopenCompletionCommitments(s.commitments, [reopenedLink])
          : s.commitments,
      };
    });
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
  },

  deleteDebt: async (id) => {
    set(s => ({
      debts: s.debts.filter(d => d.id !== id),
      trans: s.trans.filter(t => !((t.isDebtPayment || t.isDebtOrigin) && t.debtId === id)),
      commitments: s.commitments.filter(item => !(
        (item.linkedType === 'debt' || item.linkedType === 'receivable') && item.linkedId === id
      )),
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
    const availableBalance = getWalletAvailableBalances(
      normalizeWallets(get().wallets, get().cfg.currency),
      get().trans,
      get().cfg.currency,
      get().cfg.defaultWalletId,
    ).find(wallet => wallet.id === txWalletId)?.availableBalance;
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
    const title = `${isReceivable ? 'تحصيل دين لي' : 'سداد دين عليّ'} — ${debt ? debt.name : ''}`;
    const paymentTx = {
      ...transactionMeta,
      id: uid(), title, amt: currencyFields.baseAmount, ...currencyFields, cat: transactionMeta.cat || 'other', walletId: txWalletId,
      dateISO: entryDate, ts: Date.now(), balanceWarning,
      scope: normalizeScope(transactionMeta.scope || debt.scope, getEntryScope(get().cfg)),
      flowType: isReceivable ? FLOW_TYPES.RECEIVABLE_COLLECTION : FLOW_TYPES.DEBT_PAYMENT,
      transactionTag: transactionMeta.transactionTag || (isReceivable ? 'debt_receivable' : 'debt_owed'),
      isDebtPayment: true, debtId, paymentId: payId,
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
    set(s => {
      let nextName = null;
      let reopenedLink = null;
      const goals = s.goals.map(g => {
        if (g.id !== id) return g;
        const next = normalizeGoalItems([{ ...g, ...patch, currencyCode: g.currencyCode || patch.currencyCode }], g.scope, g.currencyCode || get().cfg.currency)[0];
        nextName = next.name;
        if (g.status === 'settled' && next.status === 'active') {
          reopenedLink = { linkedType: 'goal', linkedId: id, endReason: 'goal_completed' };
        }
        return { ...next, ...goalLifecycle(next, next.cur, today()) };
      });
      const trans = patch.name
        ? s.trans.map(t => (
            t.isGoalSaving && t.goalId === id
              ? { ...t, title: `توفير — ${nextName || ''}` }
              : t
          ))
        : s.trans;
      return {
        goals,
        trans,
        commitments: reopenedLink
          ? reopenCompletionCommitments(s.commitments, [reopenedLink])
          : s.commitments,
      };
    });
    await get().saveLocal();
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
  },

  deleteGoal: async (id) => {
    set(s => ({
      goals: s.goals.filter(g => g.id !== id),
      trans: s.trans.filter(t => !(t.isGoalSaving && t.goalId === id)),
      commitments: s.commitments.filter(item => !(item.linkedType === 'goal' && item.linkedId === id)),
    }));
    await get().saveLocal({ force: true });
    get().scheduleCloudSync?.({ reason: 'tracker_change' });
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
    const availableBalance = getWalletAvailableBalances(
      normalizeWallets(get().wallets, get().cfg.currency),
      get().trans,
      get().cfg.currency,
      get().cfg.defaultWalletId,
    ).find(wallet => wallet.id === txWalletId)?.availableBalance;
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
    const savingTx = {
      ...transactionMeta,
      id: uid(), title: transactionMeta.title || `توفير — ${goal ? goal.name : ''}`, amt: 0, allocationAmount: n,
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
