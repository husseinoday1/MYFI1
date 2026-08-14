// MYFI_TRANSACTION_INDEX_V5_3
// Lightweight in-memory index for large ledgers. The source transaction array
// stays authoritative; this cache avoids repeated full-history sorting/date
// parsing and exposes cheap aggregate selectors for Home/History/Reports.
import { isExpenseFlow, isIncomeFlow } from './modules';

const cache = new WeakMap();
const recentIndexes = [];
const RECENT_INDEX_LIMIT = 12;

const dateKeyOf = (item = {}) => {
  const iso = String(item?.dateISO || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
};

const tsOf = (item = {}) => {
  const ts = Number(item?.ts || 0);
  return Number.isFinite(ts) ? ts : 0;
};

export const compareTransactionsNewestFirst = (a = {}, b = {}) => {
  const aDate = dateKeyOf(a);
  const bDate = dateKeyOf(b);
  if (aDate !== bDate) return bDate.localeCompare(aDate);
  const tsDelta = tsOf(b) - tsOf(a);
  if (tsDelta) return tsDelta;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
};

const monthKeyOf = (item = {}) => {
  const key = String(item?.dateISO || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(key) ? key : null;
};

const yearKeyOf = (item = {}) => {
  const key = String(item?.dateISO || '').slice(0, 4);
  return /^\d{4}$/.test(key) ? key : null;
};

const isNewestFirst = rows => {
  for (let index = 1; index < rows.length; index += 1) {
    if (compareTransactionsNewestFirst(rows[index - 1], rows[index]) > 0) return false;
  }
  return true;
};

const rememberIndex = value => {
  recentIndexes.unshift(value);
  if (recentIndexes.length > RECENT_INDEX_LIMIT) recentIndexes.length = RECENT_INDEX_LIMIT;
};

const prependBaseFor = source => {
  for (const previous of recentIndexes) {
    const prior = previous?.source;
    const addedCount = source.length - (prior?.length || 0);
    if (!prior || previous.ordered !== prior || addedCount < 1 || addedCount > 16) continue;
    if (prior.length > 0) {
      const middle = Math.floor(prior.length / 2);
      if (
        source[addedCount] !== prior[0]
        || source[addedCount + middle] !== prior[middle]
        || source[source.length - 1] !== prior[prior.length - 1]
      ) continue;
    }
    let ordered = true;
    for (let index = 1; index <= addedCount; index += 1) {
      if (compareTransactionsNewestFirst(source[index - 1], source[index]) > 0) {
        ordered = false;
        break;
      }
    }
    if (ordered) return { previous, added: source.slice(0, addedCount) };
  }
  return null;
};

const buildPrependedIndex = (source, previous, added) => {
  const byMonth = new Map(previous.byMonth);
  const byYear = new Map(previous.byYear);
  const addedByMonth = new Map();
  const addedByYear = new Map();
  const recurringRows = [];
  let income = Number(previous.stats?.inc || 0);
  let expense = Number(previous.stats?.exp || 0);
  let pendingSmartReviewCount = Number(previous.pendingSmartReviewCount || 0);

  added.forEach(item => {
    const monthKey = monthKeyOf(item);
    if (monthKey) {
      const rows = addedByMonth.get(monthKey) || [];
      rows.push(item);
      addedByMonth.set(monthKey, rows);
    }
    const yearKey = yearKeyOf(item);
    if (yearKey) {
      const rows = addedByYear.get(yearKey) || [];
      rows.push(item);
      addedByYear.set(yearKey, rows);
    }
    if (item?.recurring && item?.dateISO) recurringRows.push(item);
    if (item?.smartSource && !item?.smartReviewedAt) pendingSmartReviewCount += 1;
    if (item?.kind === 'transfer') expense += Math.abs(Number(item?.feeBaseAmount || 0));
    else if (isIncomeFlow(item)) income += Math.abs(Number(item?.baseAmount ?? item?.amt ?? 0));
    else if (isExpenseFlow(item)) expense += Math.abs(Number(item?.baseAmount ?? item?.amt ?? 0));
  });

  addedByMonth.forEach((rows, key) => byMonth.set(key, [...rows, ...(byMonth.get(key) || [])]));
  addedByYear.forEach((rows, key) => byYear.set(key, [...rows, ...(byYear.get(key) || [])]));
  return {
    source,
    ordered: source,
    byMonth,
    byYear,
    monthKeys: [...byMonth.keys()].sort(),
    yearKeys: [...byYear.keys()].sort(),
    recurringRows: [...recurringRows, ...previous.recurringRows],
    pendingSmartReviewCount,
    stats: { inc: income, exp: expense, bal: income - expense },
  };
};

export const getTransactionIndex = (transactions = []) => {
  const source = Array.isArray(transactions) ? transactions : [];
  const cached = cache.get(source);
  if (cached) return cached;

  const prependBase = prependBaseFor(source);
  if (prependBase) {
    const incremental = buildPrependedIndex(source, prependBase.previous, prependBase.added);
    cache.set(source, incremental);
    rememberIndex(incremental);
    return incremental;
  }

  const rows = source.every(Boolean) ? source : source.filter(Boolean);
  const ordered = isNewestFirst(rows)
    ? rows
    : [...rows].sort(compareTransactionsNewestFirst);
  const byMonth = new Map();
  const byYear = new Map();
  const recurringRows = [];
  let income = 0;
  let expense = 0;
  let pendingSmartReviewCount = 0;

  ordered.forEach(item => {
    const monthKey = monthKeyOf(item);
    if (monthKey) {
      const monthRows = byMonth.get(monthKey);
      if (monthRows) monthRows.push(item);
      else byMonth.set(monthKey, [item]);
    }
    const yearKey = yearKeyOf(item);
    if (yearKey) {
      const yearRows = byYear.get(yearKey);
      if (yearRows) yearRows.push(item);
      else byYear.set(yearKey, [item]);
    }
    if (item?.recurring && item?.dateISO) recurringRows.push(item);
    if (item?.smartSource && !item?.smartReviewedAt) pendingSmartReviewCount += 1;
    if (item?.kind === 'transfer') expense += Math.abs(Number(item?.feeBaseAmount || 0));
    else if (isIncomeFlow(item)) income += Math.abs(Number(item?.baseAmount ?? item?.amt ?? 0));
    else if (isExpenseFlow(item)) expense += Math.abs(Number(item?.baseAmount ?? item?.amt ?? 0));
  });

  const value = {
    source,
    ordered,
    byMonth,
    byYear,
    monthKeys: [...byMonth.keys()].sort(),
    yearKeys: [...byYear.keys()].sort(),
    recurringRows,
    pendingSmartReviewCount,
    stats: { inc: income, exp: expense, bal: income - expense },
  };
  cache.set(source, value);
  rememberIndex(value);
  return value;
};

export const getTransactionsNewestFirst = transactions => getTransactionIndex(transactions).ordered;

export const getMonthTransactions = (transactions, year, monthZeroBased) => {
  const key = `${Number(year)}-${String(Number(monthZeroBased) + 1).padStart(2, '0')}`;
  return getTransactionIndex(transactions).byMonth.get(key) || [];
};

export const getMonthTransactionsByKey = (transactions, key) => (
  getTransactionIndex(transactions).byMonth.get(String(key || '')) || []
);

export const getYearTransactions = (transactions, year) => (
  getTransactionIndex(transactions).byYear.get(String(year || '')) || []
);

export const getTransactionsThroughDate = (transactions, asOfISO) => {
  const rows = getTransactionIndex(transactions).ordered;
  const cutoff = String(asOfISO || '');
  if (!cutoff || rows.length === 0) return rows;
  const firstDate = dateKeyOf(rows[0]);
  if (!firstDate || firstDate <= cutoff) return rows;
  const firstIncluded = rows.findIndex(item => {
    const date = dateKeyOf(item);
    return !date || date <= cutoff;
  });
  return firstIncluded < 0 ? [] : rows.slice(firstIncluded);
};

export const getRecentTransactions = (transactions, limit = 3, predicate = null) => {
  const count = Math.max(0, Number(limit) || 0);
  if (!count) return [];
  const rows = getTransactionIndex(transactions).ordered;
  if (typeof predicate !== 'function') return rows.slice(0, count);
  const result = [];
  for (const item of rows) {
    if (!predicate(item)) continue;
    result.push(item);
    if (result.length >= count) break;
  }
  return result;
};
