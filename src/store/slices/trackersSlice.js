import { today, normalizeDate } from '../../utils/calc';
import { getDefaultWalletId, getWalletAvailableBalances, normalizeWallets } from '../../lib/wallets';
import { monthKey } from '../../lib/commitments';
import { FLOW_TYPES, getEntryScope, normalizeScope } from '../../lib/modules';
import {
  capLinkedAmount,
  debtPaidTotal,
  goalSavedTotal,
  normalizeDebtItems,
  normalizeGoalItems,
  remainingAmount,
  syncCommitmentPaidMonth,
  uid,
} from '../domain';
import { debtLifecycle, goalLifecycle, reopenCompletionCommitments } from '../../lib/trackerLifecycle';

export const createTrackersSlice = (set, get) => ({
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
      transactionTag: originMode === 'received' ? 'debt_owed' : 'debt_receivable',
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
      let reopenedLink = null;
      const debts = s.debts.map(d => {
        if (d.id !== id) return d;
        const next = normalizeDebtItems([{ ...d, ...patch }], d.scope)[0];
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
    await get().syncCloud();
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
    await get().syncCloud();
    return true;
  },

  addPayment: async (debtId, amt) => {
    await get().payDebt(debtId, amt);
  },

  payDebt: async (debtId, amt, dateISO = today(), walletId = null, meta = {}) => {
    const entryDate = normalizeDate(dateISO);
    const txWalletId = walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const payId = uid();
    const debt = get().debts.find(d => d.id === debtId);
    if (!debt) return false;
    const n = Math.min(Math.abs(Number(amt) || 0), remainingAmount(debt.total, debt.paid));
    if (n <= 0) return false;
    const isReceivable = debt?.direction === 'receivable';
    if (!isReceivable) {
      const availableBalance = getWalletAvailableBalances(
        normalizeWallets(get().wallets, get().cfg.currency),
        get().trans,
        get().cfg.currency,
        get().cfg.defaultWalletId,
      ).find(wallet => wallet.id === txWalletId)?.availableBalance;
      if (!Number.isFinite(availableBalance) || n > availableBalance + 0.0001) return false;
    }
    const pay = { id: payId, amt: n, date: entryDate, ts: Date.now() };
    const nextPaid = debtPaidTotal(debt, [...(debt.payments || []), pay]);
    const completesDebt = debtLifecycle(debt, nextPaid, entryDate).status === 'settled';
    const signedAmt = isReceivable ? n : -n;
    const title = `${isReceivable ? 'تحصيل دين لي' : 'سداد دين عليّ'} — ${debt ? debt.name : ''}`;
    set(s => ({
      debts: s.debts.map(d => {
        if (d.id !== debtId) return d;
        const payments = [...(d.payments || []), pay];
        const paid = debtPaidTotal(d, payments);
        const next = { ...d, payments, paid };
        return { ...next, ...debtLifecycle(next, paid, entryDate) };
      }),
      commitments: completesDebt
        ? s.commitments.map(item => (
            (item.linkedType === (isReceivable ? 'receivable' : 'debt') && item.linkedId === debtId)
              ? { ...item, active: false, endedAt: entryDate, endReason: 'debt_settled' }
              : item
          ))
        : s.commitments,
      trans: [
        {
          id: uid(), title, amt: signedAmt, cat: 'other', walletId: txWalletId,
          dateISO: entryDate, ts: Date.now(),
          scope: normalizeScope(debt.scope, getEntryScope(get().cfg)),
          flowType: isReceivable ? FLOW_TYPES.RECEIVABLE_COLLECTION : FLOW_TYPES.DEBT_PAYMENT,
          transactionTag: isReceivable ? 'debt_receivable' : 'debt_owed',
          isDebtPayment: true, debtId, paymentId: payId,
          ...meta,
          ...(completesDebt
            ? { completionNotice: 'debt_ended' }
            : {}),
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
    return n;
  },

  editDebtPayment: async (debtId, paymentId, amt, dateISO = null) => {
    const debt = get().debts.find(d => d.id === debtId);
    const currentPayment = debt?.payments?.find(p => p.id === paymentId);
    const n = capLinkedAmount(amt, debt?.total, debt?.paid, currentPayment?.amt);
    if (!n) return;
    const nextPaymentDate = normalizeDate(dateISO || currentPayment?.date || today());
    const nextPayments = (debt?.payments || []).map(payment => (
      payment.id === paymentId ? { ...payment, amt: n, date: nextPaymentDate } : payment
    ));
    const nextPaid = debt ? debtPaidTotal(debt, nextPayments) : 0;
    const nextLifecycle = debt ? debtLifecycle({ ...debt, payments: nextPayments, paid: nextPaid }, nextPaid, nextPaymentDate) : {};
    const reopensDebt = debt?.status === 'settled' && nextLifecycle.status === 'active';
    let debtName = '';
    let direction = 'owed';
    set(s => {
      const debts = s.debts.map(d => {
        if (d.id !== debtId) return d;
        debtName = d.name || '';
        direction = d.direction || 'owed';
        const payments = (d.payments || []).map(p => p.id === paymentId ? { ...p, amt: n, date: nextPaymentDate } : p);
        const paid = debtPaidTotal(d, payments);
        const next = { ...d, payments, paid };
        return { ...next, ...nextLifecycle };
      });
      const trans = s.trans.map(t => (
        t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId
          ? {
              ...t,
              amt: direction === 'receivable' ? n : -n,
              title: `${direction === 'receivable' ? 'تحصيل دين لي' : 'سداد دين عليّ'} — ${debtName}`,
              completionNotice: nextLifecycle.status === 'settled' ? 'debt_ended' : undefined,
            }
          : t
      ));
      return {
        debts,
        trans,
        commitments: reopensDebt
          ? reopenCompletionCommitments(s.commitments, [{
              linkedType: debt.direction === 'receivable' ? 'receivable' : 'debt',
              linkedId: debtId,
              endReason: 'debt_settled',
            }])
          : s.commitments,
      };
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
        commitments: reopenCompletionCommitments(
          commitmentId ? syncCommitmentPaidMonth(s.commitments, trans, commitmentId) : s.commitments,
          reopensDebt ? [{
            linkedType: debt.direction === 'receivable' ? 'receivable' : 'debt',
            linkedId: debtId,
            endReason: 'debt_settled',
          }] : [],
        ),
      };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteDebtPayment: async (debtId, paymentId) => {
    const debtBefore = get().debts.find(item => item.id === debtId);
    const reopensDebt = debtBefore?.status === 'settled';
    set(s => {
      const removed = s.trans.find(t => t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId && t.isCommitmentPayment);
      const trans = s.trans.filter(t => !(t.isDebtPayment && t.debtId === debtId && t.paymentId === paymentId));
      return {
        debts: s.debts.map(d => {
        if (d.id !== debtId) return d;
        const payments = (d.payments || []).filter(p => p.id !== paymentId);
        const paid = debtPaidTotal(d, payments);
        const next = { ...d, payments, paid };
        return { ...next, ...debtLifecycle(next, paid, today()) };
      }),
        trans,
        commitments: reopenCompletionCommitments(
          removed?.commitmentId ? syncCommitmentPaidMonth(s.commitments, trans, removed.commitmentId) : s.commitments,
          reopensDebt ? [{
            linkedType: debtBefore.direction === 'receivable' ? 'receivable' : 'debt',
            linkedId: debtId,
            endReason: 'debt_settled',
          }] : [],
        ),
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
      let reopenedLink = null;
      const goals = s.goals.map(g => {
        if (g.id !== id) return g;
        const next = normalizeGoalItems([{ ...g, ...patch }], g.scope)[0];
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
    await get().syncCloud();
  },

  deleteGoal: async (id) => {
    set(s => ({
      goals: s.goals.filter(g => g.id !== id),
      trans: s.trans.filter(t => !(t.isGoalSaving && t.goalId === id)),
      commitments: s.commitments.filter(item => !(item.linkedType === 'goal' && item.linkedId === id)),
    }));
    await get().saveLocal({ force: true });
    await get().syncCloud();
  },

  addGoalSaving: async (goalId, amt) => {
    await get().saveGoal(goalId, amt);
  },

  saveGoal: async (goalId, amt, dateISO = today(), walletId = null, meta = {}) => {
    const entryDate = normalizeDate(dateISO);
    const txWalletId = walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const saveId = uid();
    const goal = get().goals.find(g => g.id === goalId);
    if (!goal) return false;
    const n = Math.min(Math.abs(Number(amt) || 0), remainingAmount(goal.target, goal.cur));
    if (n <= 0) return false;
    const availableBalance = getWalletAvailableBalances(
      normalizeWallets(get().wallets, get().cfg.currency),
      get().trans,
      get().cfg.currency,
      get().cfg.defaultWalletId,
    ).find(wallet => wallet.id === txWalletId)?.availableBalance;
    if (!Number.isFinite(availableBalance) || n > availableBalance + 0.0001) return false;
    const entry = { id: saveId, amt: n, date: entryDate, ts: Date.now() };
    const nextSaved = Math.min(goalSavedTotal(goal, [...(goal.savings || []), entry]), goal.target);
    const completesGoal = goalLifecycle(goal, nextSaved, entryDate).status === 'settled';
    set(s => ({
      goals: s.goals.map(g => {
        if (g.id !== goalId) return g;
        const savings = [...(g.savings || []), entry];
        const cur = Math.min(goalSavedTotal(g, savings), g.target);
        const next = { ...g, savings, cur };
        return { ...next, ...goalLifecycle(next, cur, entryDate) };
      }),
      commitments: completesGoal
        ? s.commitments.map(item => (
            item.linkedType === 'goal' && item.linkedId === goalId
              ? { ...item, active: false, endedAt: entryDate, endReason: 'goal_completed' }
              : item
          ))
        : s.commitments,
      trans: [
        {
          id: uid(), title: `توفير — ${goal ? goal.name : ''}`, amt: 0, allocationAmount: n, cat: 'other',
          walletId: txWalletId, dateISO: entryDate, ts: Date.now(),
          scope: normalizeScope(goal.scope, getEntryScope(get().cfg)),
          flowType: FLOW_TYPES.GOAL_ALLOCATION,
          transactionTag: 'saving',
          isGoalSaving: true, goalId, savingId: saveId,
          ...meta,
          ...(completesGoal
            ? { completionNotice: 'goal_completed' }
            : {}),
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
    return n;
  },

  releaseGoalSavings: async (goalId, dateISO = today()) => {
    const entryDate = normalizeDate(dateISO);
    const goal = get().goals.find(item => item.id === goalId);
    if (!goal || goal.purpose !== 'reserve' || !['active', 'settled'].includes(goal.status) || Number(goal.cur || 0) < Number(goal.target || 0)) return false;
    const releasedAmount = Number(goal.cur || 0);
    set(s => ({
      goals: s.goals.map(item => (
        item.id === goalId
          ? {
              ...item,
              savings: [],
              cur: 0,
              active: false,
              status: 'released',
              completedAt: item.completedAt || item.settledAt || entryDate,
              settledAt: item.settledAt || item.completedAt || entryDate,
              releasedAt: entryDate,
              settledAmount: releasedAmount,
            }
          : item
      )),
      commitments: s.commitments.map(item => (
        item.linkedType === 'goal' && item.linkedId === goalId ? { ...item, active: false } : item
      )),
      trans: s.trans.map(item => (
        item.isGoalSaving && item.goalId === goalId
          ? { ...item, allocationReleased: true, allocationReleasedAt: entryDate }
          : item
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
    const nextSavingDate = normalizeDate(dateISO || currentSaving?.date || today());
    const nextSavings = (goal?.savings || []).map(sv => sv.id === savingId ? { ...sv, amt: n, date: nextSavingDate } : sv);
    const nextCur = Math.min(goalSavedTotal(goal, nextSavings), goal?.target);
    const nextGoalLifecycle = goal
      ? goalLifecycle({ ...goal, savings: nextSavings, cur: nextCur }, nextCur, nextSavingDate)
      : {};
    const reopensGoal = goal?.status === 'settled' && nextGoalLifecycle.status === 'active';
    let goalName = '';
    set(s => {
      const goals = s.goals.map(g => {
        if (g.id !== goalId) return g;
        goalName = g.name || '';
        const savings = (g.savings || []).map(sv => sv.id === savingId ? { ...sv, amt: n, date: normalizeDate(dateISO || sv.date) } : sv);
        const cur = Math.min(goalSavedTotal(g, savings), g.target);
        const next = { ...g, savings, cur };
        return { ...next, ...goalLifecycle(next, cur, normalizeDate(dateISO || currentSaving?.date || today())) };
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
        commitments: reopenCompletionCommitments(
          commitmentId ? syncCommitmentPaidMonth(s.commitments, trans, commitmentId) : s.commitments,
          reopensGoal ? [{ linkedType: 'goal', linkedId: goalId, endReason: 'goal_completed' }] : [],
        ),
      };
    });
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteGoalSaving: async (goalId, savingId) => {
    const goalBefore = get().goals.find(item => item.id === goalId);
    const reopensGoal = goalBefore?.status === 'settled';
    set(s => {
      const removed = s.trans.find(t => t.isGoalSaving && t.goalId === goalId && t.savingId === savingId && t.isCommitmentPayment);
      const trans = s.trans.filter(t => !(t.isGoalSaving && t.goalId === goalId && t.savingId === savingId));
      return {
        goals: s.goals.map(g => {
        if (g.id !== goalId) return g;
        const savings = (g.savings || []).filter(sv => sv.id !== savingId);
        const cur = Math.min(goalSavedTotal(g, savings), g.target);
        const next = { ...g, savings, cur };
        return { ...next, ...goalLifecycle(next, cur, today()) };
      }),
        trans,
        commitments: reopenCompletionCommitments(
          removed?.commitmentId ? syncCommitmentPaidMonth(s.commitments, trans, removed.commitmentId) : s.commitments,
          reopensGoal ? [{ linkedType: 'goal', linkedId: goalId, endReason: 'goal_completed' }] : [],
        ),
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
            : (() => {
                const paid = debtPaidTotal(debt, payments);
                const next = { ...debt, payments, paid };
                return { ...next, ...debtLifecycle(next, paid, today()) };
              })();
        }),
        goals: s.goals.map(goal => {
          const savings = (goal.savings || []).filter(saving => !goalSavings.has(`${goal.id}:${saving.id}`));
          return savings.length === (goal.savings || []).length
            ? goal
            : (() => {
                const cur = Math.min(goalSavedTotal(goal, savings), goal.target);
                const next = { ...goal, savings, cur };
                return { ...next, ...goalLifecycle(next, cur, today()) };
              })();
        }),
        commitments: syncCommitmentPaidMonth(s.commitments, trans),
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },
});
