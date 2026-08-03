import { today, normalizeDate } from '../../utils/calc';
import { getDefaultWalletId } from '../../lib/wallets';
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
          transactionTag: isReceivable ? 'debt_receivable' : 'debt_owed',
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
          transactionTag: 'saving',
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

  settleGoalDebt: async (goalId, dateISO = today()) => {
    const entryDate = normalizeDate(dateISO);
    const goal = get().goals.find(item => item.id === goalId);
    const debt = get().debts.find(item => item.id === goal?.linkedDebtId && item.direction !== 'receivable');
    const totalSaved = Number(goal?.cur || 0);
    const debtRemaining = remainingAmount(debt?.total, debt?.paid);
    if (!goal || goal.purpose !== 'debt_payoff' || goal.status === 'settled' || totalSaved < Number(goal.target || 0) || totalSaved <= 0 || totalSaved > debtRemaining) {
      return false;
    }

    const allocations = (goal.savings || []).map(saving => {
      const tx = get().trans.find(item => item.isGoalSaving && item.goalId === goalId && item.savingId === saving.id);
      return {
        amount: Math.abs(Number(saving.amt || 0)),
        walletId: tx?.walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId),
      };
    }).filter(item => item.amount > 0);
    if (allocations.reduce((sum, item) => sum + item.amount, 0) < totalSaved) return false;

    let left = totalSaved;
    const payments = [];
    allocations.forEach(allocation => {
      const amount = Math.min(left, allocation.amount);
      if (amount <= 0) return;
      payments.push({ id: uid(), amt: amount, date: entryDate, ts: Date.now(), walletId: allocation.walletId });
      left -= amount;
    });
    if (left > 0.0001) return false;

    set(s => {
      const debtPayments = payments.map(payment => ({ id: payment.id, amt: payment.amt, date: payment.date, ts: payment.ts }));
      return {
        debts: s.debts.map(item => {
          if (item.id !== debt.id) return item;
          const nextPayments = [...(item.payments || []), ...debtPayments];
          return { ...item, payments: nextPayments, paid: debtPaidTotal(item, nextPayments) };
        }),
        goals: s.goals.map(item => (
          item.id === goalId
            ? { ...item, savings: [], cur: 0, status: 'settled', settledAt: entryDate, settledAmount: totalSaved }
            : item
        )),
        commitments: s.commitments.map(item => (
          item.linkedType === 'goal' && item.linkedId === goalId ? { ...item, active: false } : item
        )),
        trans: [
          ...payments.map(payment => ({
            id: uid(),
            title: `\u0633\u062f\u0627\u062f \u062f\u064a\u0646 \u0639\u0644\u064a\u0651 - ${debt.name || ''}`,
            amt: -payment.amt,
            cat: 'other',
            walletId: payment.walletId,
            dateISO: entryDate,
            ts: payment.ts,
            scope: normalizeScope(debt.scope, getEntryScope(get().cfg)),
            flowType: FLOW_TYPES.DEBT_PAYMENT,
            transactionTag: 'debt_owed',
            isDebtPayment: true,
            debtId: debt.id,
            paymentId: payment.id,
            settledGoalId: goalId,
          })),
          ...s.trans.filter(item => !(item.isGoalSaving && item.goalId === goalId)),
        ],
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  releaseGoalSavings: async (goalId, dateISO = today()) => {
    const entryDate = normalizeDate(dateISO);
    const goal = get().goals.find(item => item.id === goalId);
    if (!goal || goal.purpose !== 'reserve' || goal.status !== 'active' || Number(goal.cur || 0) < Number(goal.target || 0)) return false;
    const releasedAmount = Number(goal.cur || 0);
    set(s => ({
      goals: s.goals.map(item => (
        item.id === goalId
          ? { ...item, savings: [], cur: 0, status: 'released', settledAt: entryDate, settledAmount: releasedAmount }
          : item
      )),
      commitments: s.commitments.map(item => (
        item.linkedType === 'goal' && item.linkedId === goalId ? { ...item, active: false } : item
      )),
      trans: s.trans.filter(item => !(item.isGoalSaving && item.goalId === goalId)),
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
});
