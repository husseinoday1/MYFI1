import { FLOW_TYPES, isExpenseFlow } from './modules';
import { commitmentDueISO } from './commitments';
import { asDate } from './dateCore';
import { getTransactionIndex } from './transactionIndex';

const asAmount = (value) => {
  const n = Math.abs(Number(value || 0));
  return Number.isFinite(n) ? n : 0;
};

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const usefulTokens = (value = '') =>
  normalizeText(value)
    .split(' ')
    .filter(token => token.length >= 3);

const titleMatches = (left = '', right = '') => {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(usefulTokens(a));
  const bTokens = usefulTokens(b);
  if (!aTokens.size || !bTokens.length) return false;
  return bTokens.some(token => aTokens.has(token));
};

const amountMatches = (left, right) => {
  const a = asAmount(left);
  const b = asAmount(right);
  if (!a || !b) return false;
  const tolerance = Math.max(1, b * 0.02);
  return Math.abs(a - b) <= tolerance;
};

export const monthKeyForDate = (date = new Date()) => {
  const d = asDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const transactionMatchesCommitment = (tx = {}, commitment = {}) => {
  if (!tx || !commitment) return false;
  if (tx.commitmentId && commitment.id && tx.commitmentId === commitment.id) return true;

  const txAmount = asAmount(tx.amt);
  const commitmentAmount = asAmount(commitment.amt);
  if (!txAmount || !commitmentAmount) return false;

  const sameCategory = Boolean(
    tx.cat
    && commitment.cat
    && String(tx.cat) === String(commitment.cat),
  );
  const meaningfulCategory = sameCategory && String(tx.cat) !== 'other';
  const sameTitle = titleMatches(tx.title || tx.note, commitment.name);
  const sameAmount = amountMatches(txAmount, commitmentAmount);

  // Legacy/imported/sample transactions may not carry isCommitmentPayment.
  // Require two independent signals to keep matching conservative. Generic
  // 'other' is not treated as a strong category signal by itself.
  return (sameTitle && (sameCategory || sameAmount)) || (meaningfulCategory && sameAmount);
};

export const isFixedExpenseTransaction = (tx = {}, commitments = []) => {
  if (!isExpenseFlow(tx)) return false;
  if (
    tx?.isCommitmentPayment
    || tx?.commitmentId
    || tx?.transactionTag === 'commitment'
    || tx?.flowType === FLOW_TYPES.COMMITMENT_PAYMENT
  ) return true;

  return (Array.isArray(commitments) ? commitments : []).some(commitment => (
    commitment
    && (commitment.linkedType || 'none') === 'none'
    && transactionMatchesCommitment(tx, commitment)
  ));
};

export const fixedExpenseSpent = (rows = [], commitments = [], categoryId = null) => (
  (Array.isArray(rows) ? rows : [])
    .filter(tx => (
      (!categoryId || tx?.cat === categoryId)
      && isFixedExpenseTransaction(tx, commitments)
    ))
    .reduce((sum, tx) => sum + asAmount(tx?.amt), 0)
);

export const variableExpenseSpent = (rows = [], commitments = [], categoryId = null) => (
  (Array.isArray(rows) ? rows : [])
    .filter(tx => isEligibleVariableSpendTransaction(tx, commitments, categoryId))
    .reduce((sum, tx) => sum + asAmount(tx?.amt), 0)
);

export const isEligibleVariableSpendTransaction = (tx = {}, commitments = [], categoryId = null) => (
  (!categoryId || tx?.cat === categoryId)
  && isExpenseFlow(tx)
  && !isFixedExpenseTransaction(tx, commitments)
);

export const eligibleVariableSpendCount = (rows = [], commitments = [], categoryId = null) => (
  (Array.isArray(rows) ? rows : [])
    .filter(tx => isEligibleVariableSpendTransaction(tx, commitments, categoryId))
    .length
);

export const isMonthEligibleForForecast = (rows = [], commitments = [], { minTransactions = 3 } = {}) => (
  eligibleVariableSpendCount(rows, commitments) >= Math.max(1, Number(minTransactions) || 3)
);

export const getEligibleHistoricalVariableSpendMonths = (
  trans = [],
  date = new Date(),
  commitments = [],
  { limit = 6, minTransactions = 3 } = {},
) => {
  const currentKey = monthKeyForDate(date);
  const index = getTransactionIndex(trans);
  return index.monthKeys
    .filter(key => key < currentKey)
    .map(key => [key, index.byMonth.get(key) || []])
    .filter(([, rows]) => isMonthEligibleForForecast(rows, commitments, { minTransactions }))
    .slice(-Math.max(1, Number(limit) || 6));
};

export const getCategoryHistoricalAverageTransaction = (
  trans = [],
  date = new Date(),
  commitments = [],
  categoryId = null,
  { limit = 6, minEligibleMonths = 3 } = {},
) => {
  if (!categoryId) return { average: null, eligibleMonthCount: 0, transactionCount: 0 };
  const months = getEligibleHistoricalVariableSpendMonths(trans, date, commitments, { limit });
  const categoryMonths = months.filter(([, rows]) => eligibleVariableSpendCount(rows, commitments, categoryId) > 0);
  const rows = categoryMonths.flatMap(([, monthRows]) => (
    monthRows.filter(tx => isEligibleVariableSpendTransaction(tx, commitments, categoryId))
  ));
  const transactionCount = rows.length;
  const eligibleMonthCount = categoryMonths.length;
  if (eligibleMonthCount < Math.max(1, Number(minEligibleMonths) || 3) || transactionCount === 0) {
    return { average: null, eligibleMonthCount, transactionCount };
  }
  return {
    average: rows.reduce((sum, tx) => sum + asAmount(tx?.amt), 0) / transactionCount,
    eligibleMonthCount,
    transactionCount,
  };
};

export const outstandingExpenseCommitments = (
  commitments = [],
  currentMonthTransactions = [],
  currentMonthKey = '',
) => (
  (Array.isArray(commitments) ? commitments : []).filter(commitment => {
    if (!commitment || commitment.active === false || !asAmount(commitment.amt)) return false;
    // Debt and goal linked commitments are tracker/allocation flows, not normal expenses.
    if ((commitment.linkedType || 'none') !== 'none') return false;
    const dueMonth = String(commitmentDueISO(
      commitment,
      new Date(`${currentMonthKey}-15T12:00:00`),
    )).slice(0, 7);
    if (dueMonth > currentMonthKey) return false;
    return !(Array.isArray(currentMonthTransactions) ? currentMonthTransactions : [])
      .some(tx => transactionMatchesCommitment(tx, commitment));
  })
);

export const weightedHistoricalVariableSpend = (
  trans = [],
  date = new Date(),
  commitments = [],
  { categoryId = null, limit = 6, decay = 0.7 } = {},
) => {
  const baselineMonths = getEligibleHistoricalVariableSpendMonths(trans, date, commitments, { limit });

  const count = baselineMonths.length;
  let weighted = 0;
  let totalWeight = 0;

  baselineMonths.forEach(([, rows], index) => {
    const weight = Math.pow(decay, count - 1 - index);
    weighted += variableExpenseSpent(rows, commitments, categoryId) * weight;
    totalWeight += weight;
  });

  return {
    value: totalWeight > 0 ? weighted / totalWeight : 0,
    monthCount: count,
  };
};

export const adaptiveVariableProjection = ({
  currentSpent = 0,
  historicalSpent = 0,
  daysElapsed = 1,
  daysInMonth = 30,
  baselineMonthCount = 0,
  fallbackScaleCap = 2,
} = {}) => {
  const current = Math.max(0, Number(currentSpent) || 0);
  const historical = Math.max(0, Number(historicalSpent) || 0);
  const elapsed = Math.max(1, Math.min(Number(daysElapsed) || 1, Number(daysInMonth) || 30));
  const totalDays = Math.max(elapsed, Number(daysInMonth) || elapsed);
  const rawRunRate = current * (totalDays / elapsed);
  const progress = Math.max(0, Math.min(1, elapsed / totalDays));

  if (baselineMonthCount > 0 && historical > 0) {
    const blended = historical * (1 - progress) + rawRunRate * progress;
    return {
      projected: Math.max(current, blended),
      rawRunRate,
      historical,
      currentWeight: progress,
      historicalWeight: 1 - progress,
      basis: 'adaptive_history',
    };
  }

  const scale = Math.min(totalDays / elapsed, Math.max(1, fallbackScaleCap));
  return {
    projected: Math.max(current, current * scale),
    rawRunRate,
    historical: 0,
    currentWeight: 1,
    historicalWeight: 0,
    basis: 'capped_run_rate',
  };
};
