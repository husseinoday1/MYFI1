import { monthKey } from './commitments';
import { getDefaultWalletId, getWalletBalances } from './wallets';

const amount = value => Math.abs(Number(value) || 0);

export const auditFinancialData = ({
  trans = [],
  debts = [],
  goals = [],
  commitments = [],
  wallets = [],
  currency = 'IQD',
  defaultWalletId = null,
} = {}) => {
  const issues = [];
  const walletIds = new Set(wallets.map(item => item.id));
  const transactionIds = new Set();

  trans.forEach(tx => {
    if (!tx?.id) issues.push({ code: 'transaction_missing_id', entityId: null });
    else if (transactionIds.has(tx.id)) issues.push({ code: 'duplicate_transaction', entityId: tx.id });
    else transactionIds.add(tx.id);

    if (tx?.kind === 'transfer') {
      if (!walletIds.has(tx.fromWalletId) || !walletIds.has(tx.toWalletId) || tx.fromWalletId === tx.toWalletId) {
        issues.push({ code: 'invalid_transfer_wallet', entityId: tx.id });
      }
    } else if (wallets.length && !walletIds.has(tx.walletId)) {
      issues.push({ code: 'missing_wallet', entityId: tx.id });
    }
  });

  debts.forEach(debt => {
    if (debt.originMode && debt.originMode !== 'previous') {
      const origin = trans.find(tx => tx.isDebtOrigin && tx.debtId === debt.id);
      if (!origin) issues.push({ code: 'debt_origin_missing_transaction', entityId: debt.id });
      else if (amount(origin.amt) !== amount(debt.total) || origin.dateISO !== debt.createdAt) {
        issues.push({ code: 'debt_origin_transaction_mismatch', entityId: debt.id });
      }
    }
    const paymentTotal = Number(debt.archivedPaid || 0)
      + (debt.payments || []).reduce((sum, payment) => sum + amount(payment.amt), 0);
    if (amount(debt.paid) !== paymentTotal) {
      issues.push({ code: 'debt_paid_mismatch', entityId: debt.id, expected: paymentTotal, actual: amount(debt.paid) });
    }
    (debt.payments || []).forEach(payment => {
      const linked = trans.find(tx => tx.isDebtPayment && tx.debtId === debt.id && tx.paymentId === payment.id);
      if (!linked) issues.push({ code: 'debt_payment_missing_transaction', entityId: debt.id, childId: payment.id });
      else if (amount(linked.amt) !== amount(payment.amt) || linked.dateISO !== payment.date) {
        issues.push({ code: 'debt_payment_transaction_mismatch', entityId: debt.id, childId: payment.id });
      }
    });
  });

  goals.forEach(goal => {
    const savingTotal = (goal.savings || []).reduce((sum, saving) => sum + amount(saving.amt), 0);
    if (amount(goal.cur) !== Math.min(savingTotal, amount(goal.target))) {
      issues.push({ code: 'goal_saved_mismatch', entityId: goal.id });
    }
    (goal.savings || []).forEach(saving => {
      const linked = trans.find(tx => tx.isGoalSaving && tx.goalId === goal.id && tx.savingId === saving.id);
      if (!linked) issues.push({ code: 'goal_saving_missing_transaction', entityId: goal.id, childId: saving.id });
      else if (amount(linked.allocationAmount ?? linked.amt) !== amount(saving.amt) || linked.dateISO !== saving.date) {
        issues.push({ code: 'goal_saving_transaction_mismatch', entityId: goal.id, childId: saving.id });
      }
    });
  });

  commitments.forEach(commitment => {
    const latest = trans
      .filter(tx => tx.isCommitmentPayment && tx.commitmentId === commitment.id)
      .map(tx => tx.commitmentMonth || monthKey(tx.dateISO))
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    if ((commitment.lastPaidMonth || null) !== latest) {
      issues.push({
        code: 'commitment_paid_month_mismatch',
        entityId: commitment.id,
        expected: latest,
        actual: commitment.lastPaidMonth || null,
      });
    }
  });

  const safeDefault = getDefaultWalletId(wallets, currency, defaultWalletId);
  const balances = getWalletBalances(wallets, trans, currency, safeDefault);
  balances.filter(wallet => wallet.balance < 0).forEach(wallet => {
    issues.push({ code: 'negative_wallet_balance', entityId: wallet.id, actual: wallet.balance });
  });

  return {
    ok: issues.length === 0,
    issues,
    balances,
    totalBalance: balances.reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0),
  };
};
