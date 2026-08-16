import { roundCurrency } from './money';

export const TRANSACTION_SEMANTIC_KIND = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
  OPENING_BALANCE: 'opening_balance',
  BALANCE_ADJUSTMENT: 'balance_adjustment',
  DEBT_PAYMENT: 'debt_payment',
  RECEIVABLE_COLLECTION: 'receivable_collection',
  GOAL_ALLOCATION: 'goal_allocation',
  COMMITMENT_PAYMENT: 'commitment_payment',
});

export const getTransactionSemanticKind = (transaction = {}) => {
  const flow = String(transaction.flowType || '').trim();
  if (transaction.kind === 'transfer' || flow === 'transfer') return TRANSACTION_SEMANTIC_KIND.TRANSFER;
  if (transaction.isOpeningBalance || flow === 'opening_balance') return TRANSACTION_SEMANTIC_KIND.OPENING_BALANCE;
  if (transaction.isBalanceAdjustment || flow === 'balance_adjustment') return TRANSACTION_SEMANTIC_KIND.BALANCE_ADJUSTMENT;
  if (transaction.isGoalSaving || flow === 'goal_allocation') return TRANSACTION_SEMANTIC_KIND.GOAL_ALLOCATION;
  if (transaction.isCommitmentPayment || flow === 'commitment_payment') return TRANSACTION_SEMANTIC_KIND.COMMITMENT_PAYMENT;
  if (flow === 'receivable_collection') return TRANSACTION_SEMANTIC_KIND.RECEIVABLE_COLLECTION;
  if (transaction.isDebtPayment || flow === 'debt_payment') return TRANSACTION_SEMANTIC_KIND.DEBT_PAYMENT;
  if (flow === 'income') return TRANSACTION_SEMANTIC_KIND.INCOME;
  if (flow === 'expense') return TRANSACTION_SEMANTIC_KIND.EXPENSE;
  return Number(transaction.amt || 0) >= 0
    ? TRANSACTION_SEMANTIC_KIND.INCOME
    : TRANSACTION_SEMANTIC_KIND.EXPENSE;
};

export const getSemanticTypeLabel = (kind, lang = 'ar') => {
  const ar = lang === 'ar';
  const labels = {
    income: ar ? 'دخل' : 'Income',
    expense: ar ? 'مصروف' : 'Expense',
    transfer: ar ? 'تحويل بين المحافظ' : 'Wallet transfer',
    opening_balance: ar ? 'رصيد افتتاحي' : 'Opening balance',
    balance_adjustment: ar ? 'تسوية رصيد' : 'Balance adjustment',
    debt_payment: ar ? 'سداد دين عليّ' : 'Debt payment',
    receivable_collection: ar ? 'تحصيل دين لي' : 'Receivable collection',
    goal_allocation: ar ? 'توفير لهدف' : 'Goal saving',
    commitment_payment: ar ? 'دفع التزام' : 'Commitment payment',
  };
  return labels[kind] || (ar ? 'حركة مالية' : 'Financial movement');
};

export const buildGeneratedEntryTitle = ({ flow = 'expense', categoryLabel = '', lang = 'ar' } = {}) => {
  const income = flow === 'income' || flow === 'inc';
  const fallback = lang === 'ar' ? 'عام' : 'General';
  const prefix = lang === 'ar'
    ? (income ? 'دخل' : 'مصروف')
    : (income ? 'Income' : 'Expense');
  return `${prefix} - ${String(categoryLabel || fallback).trim() || fallback}`;
};

export const isGeneratedEntryTitle = (transaction = {}, categories = []) => {
  if (transaction.titleSource === 'generated') return true;
  if (transaction.titleSource === 'user') return false;
  const kind = getTransactionSemanticKind(transaction);
  if (![TRANSACTION_SEMANTIC_KIND.INCOME, TRANSACTION_SEMANTIC_KIND.EXPENSE].includes(kind)) return false;
  const category = categories.find(item => item.id === transaction.cat) || {};
  const labels = new Set([
    category.label,
    category.labelEn,
    'عام',
    'General',
  ].map(value => String(value || '').trim()).filter(Boolean));
  const candidates = new Set();
  labels.forEach(categoryLabel => {
    candidates.add(buildGeneratedEntryTitle({ flow: kind, categoryLabel, lang: 'ar' }));
    candidates.add(buildGeneratedEntryTitle({ flow: kind, categoryLabel, lang: 'en' }));
  });
  return candidates.has(String(transaction.title || '').trim());
};

export const buildTrackerTransactionTitle = ({
  kind,
  entityName = '',
  commitmentName = '',
  lang = 'ar',
} = {}) => {
  const semantic = getSemanticTypeLabel(kind, lang);
  const entityPart = String(entityName || '').trim();
  const primary = entityPart ? `${semantic} — ${entityPart}` : semantic;
  const commitmentPart = String(commitmentName || '').trim();
  if (!commitmentPart || kind === TRANSACTION_SEMANTIC_KIND.COMMITMENT_PAYMENT) return primary;
  const commitmentLabel = getSemanticTypeLabel(TRANSACTION_SEMANTIC_KIND.COMMITMENT_PAYMENT, lang);
  return `${commitmentLabel} — ${commitmentPart} · ${primary}`;
};

export const buildBalanceReconciliationPreview = ({ recordedBalance, actualBalance, currency = 'IQD' } = {}) => {
  const recorded = Number(recordedBalance);
  const actual = Number(actualBalance);
  if (!Number.isFinite(recorded) || !Number.isFinite(actual)) {
    return { valid: false, status: 'invalid', recordedBalance: recorded, actualBalance: actual, difference: null };
  }
  const difference = roundCurrency(actual - recorded, currency);
  return {
    valid: true,
    status: difference === 0 ? 'matched' : 'review_required',
    recordedBalance: roundCurrency(recorded, currency),
    actualBalance: roundCurrency(actual, currency),
    difference,
  };
};
