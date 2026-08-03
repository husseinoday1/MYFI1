import { today, normalizeDate } from '../../utils/calc';
import { getDefaultWalletId, getWalletAvailableBalances, normalizeWallets } from '../../lib/wallets';
import { monthKey } from '../../lib/commitments';
import { FLOW_TYPES, getEntryScope, normalizeScope } from '../../lib/modules';
import { inferTransactionTag } from '../../lib/transactionTags';
import {
  capLinkedAmount,
  debtPaidTotal,
  goalSavedTotal,
  syncCommitmentPaidMonth,
  uid,
} from '../domain';

export const createTransactionSlice = (set, get) => ({
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
      transactionTag: inferTransactionTag(t),
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
    const n = Number(amount);
    const normalizedWallets = normalizeWallets(get().wallets, get().cfg.currency);
    const walletIds = new Set(normalizedWallets.map(wallet => wallet.id));
    if (!Number.isFinite(n) || n <= 0 || !fromWalletId || !toWalletId || fromWalletId === toWalletId) return false;
    if (!walletIds.has(fromWalletId) || !walletIds.has(toWalletId)) return false;
    const sourceBalance = getWalletAvailableBalances(
      normalizedWallets,
      get().trans,
      get().cfg.currency,
      get().cfg.defaultWalletId,
    ).find(wallet => wallet.id === fromWalletId)?.availableBalance;
    if (!Number.isFinite(sourceBalance) || n > sourceBalance + 0.0001) return false;
    const fromWallet = normalizedWallets.find(wallet => wallet.id === fromWalletId);
    const toWallet = normalizedWallets.find(wallet => wallet.id === toWalletId);
    const entryDate = normalizeDate(dateISO);
    const sourceScope = normalizeScope(fromWallet?.scope, getEntryScope(get().cfg));
    const targetScope = normalizeScope(toWallet?.scope, getEntryScope(get().cfg));
    set(s => ({
      trans: [
        {
          id: uid(),
          title: 'تحويل بين المحافظ',
          amt: 0,
          cat: 'other',
          kind: 'transfer',
          flowType: FLOW_TYPES.TRANSFER,
          transactionTag: 'transfer',
          scope: sourceScope,
          fromScope: sourceScope,
          toScope: targetScope,
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
    if (current.kind === 'transfer' || safePatch.kind === 'transfer') {
      const fromWalletId = safePatch.fromWalletId || current.fromWalletId;
      const toWalletId = safePatch.toWalletId || current.toWalletId;
      const transferAmount = Number(safePatch.transferAmount ?? current.transferAmount);
      const normalizedWallets = normalizeWallets(get().wallets, get().cfg.currency);
      const fromWallet = normalizedWallets.find(wallet => wallet.id === fromWalletId);
      const toWallet = normalizedWallets.find(wallet => wallet.id === toWalletId);
      if (!Number.isFinite(transferAmount) || transferAmount <= 0 || !fromWallet || !toWallet || fromWalletId === toWalletId) return false;
      const sourceScope = normalizeScope(fromWallet.scope, getEntryScope(get().cfg));
      const targetScope = normalizeScope(toWallet.scope, getEntryScope(get().cfg));
      const sourceBalance = getWalletAvailableBalances(
        normalizedWallets,
        get().trans.filter(transaction => transaction.id !== id),
        get().cfg.currency,
        get().cfg.defaultWalletId,
      ).find(wallet => wallet.id === fromWalletId)?.availableBalance;
      if (!Number.isFinite(sourceBalance) || transferAmount > sourceBalance + 0.0001) return false;
      safePatch.transferAmount = transferAmount;
      safePatch.scope = sourceScope;
      safePatch.fromScope = safePatch.scope;
      safePatch.toScope = targetScope;
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'transactionTag')) {
      safePatch.transactionTag = inferTransactionTag(safePatch);
    }
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
    return true;
  },

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
});
