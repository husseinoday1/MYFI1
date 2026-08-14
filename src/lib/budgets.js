import { isExpenseFlow, isIncomeFlow } from './modules';

const expenseAmount = (tx) => isExpenseFlow(tx)
  ? Math.abs(Number(tx.baseAmount ?? tx.amt ?? 0))
  : 0;

export const normalizeBudgets = (budgets = {}) => Object.fromEntries(
  Object.entries(budgets || {})
    .map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
    .filter(([, value]) => value > 0),
);

export const budgetMonthId = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const normalizeMonthlyBudgets = (value = {}) => Object.fromEntries(
  Object.entries(value || {})
    .filter(([month, map]) => /^\d{4}-\d{2}$/.test(month) && map && typeof map === 'object' && !Array.isArray(map))
    .map(([month, map]) => [month, normalizeBudgets(map)])
    .filter(([, map]) => Object.keys(map).length > 0),
);

export const getBudgetMapForMonth = (budgets = {}, date = new Date(), legacyFallback = {}) => {
  const month = budgetMonthId(date);
  if (budgets && typeof budgets === 'object' && budgets[month] && typeof budgets[month] === 'object') {
    return normalizeBudgets(budgets[month]);
  }
  const looksMonthly = Object.keys(budgets || {}).some(key => /^\d{4}-\d{2}$/.test(key));
  return normalizeBudgets(looksMonthly ? legacyFallback : budgets);
};

export const setBudgetForMonth = (monthly = {}, categoryId, amount, date = new Date()) => {
  const month = budgetMonthId(date);
  const nextMonth = normalizeBudgets({
    ...(monthly?.[month] || {}),
    [categoryId]: amount,
  });
  const next = { ...normalizeMonthlyBudgets(monthly) };
  if (Object.keys(nextMonth).length) next[month] = nextMonth;
  else delete next[month];
  return next;
};

export const getBudgetRows = (trans = [], cats = [], budgets = {}, date = new Date(), legacyFallback = {}) => {
  const target = budgetMonthId(date);
  const activeBudgets = getBudgetMapForMonth(budgets, date, legacyFallback);
  const spent = new Map();
  trans.forEach((tx) => {
    if (!String(tx?.dateISO || '').startsWith(target)) return;
    const amount = expenseAmount(tx);
    if (amount) spent.set(tx.cat || 'other', (spent.get(tx.cat || 'other') || 0) + amount);
  });
  const catMap = new Map(cats.map(cat => [cat.id, cat]));
  return Object.entries(activeBudgets).map(([categoryId, limit]) => {
    const used = spent.get(categoryId) || 0;
    const ratio = limit > 0 ? used / limit : 0;
    return {
      categoryId,
      cat: catMap.get(categoryId),
      limit,
      spent: used,
      remaining: Math.max(0, limit - used),
      ratio,
      percent: Math.round(ratio * 100),
      status: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'near' : 'ok',
    };
  }).sort((a, b) => b.ratio - a.ratio);
};

export const getBudgetSummary = (rows = []) => {
  const limit = rows.reduce((sum, row) => sum + row.limit, 0);
  const spent = rows.reduce((sum, row) => sum + row.spent, 0);
  return {
    limit, spent, remaining: Math.max(0, limit - spent),
    percent: limit ? Math.round((spent / limit) * 100) : 0,
    over: rows.filter(row => row.status === 'over').length,
    near: rows.filter(row => row.status === 'near').length,
  };
};

const median = (values = []) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const robustValues = (values = []) => {
  if (values.length < 4) return values;
  const med = median(values);
  const deviations = values.map(value => Math.abs(value - med));
  const mad = median(deviations) || 0;
  if (!mad) return values;
  return values.filter(value => Math.abs(value - med) <= 3 * mad);
};

const roundSuggestion = (value) => {
  const n = Math.max(0, Number(value) || 0);
  if (n >= 100000) return Math.round(n / 5000) * 5000;
  if (n >= 10000) return Math.round(n / 1000) * 1000;
  if (n >= 1000) return Math.round(n / 100) * 100;
  return Math.round(n);
};

export const suggestBudgetsDetailedFromHistory = (trans = [], cats = [], now = new Date()) => {
  const current = budgetMonthId(now);
  const eligibleMonths = [...new Set(trans
    .map(tx => String(tx?.dateISO || '').slice(0, 7))
    .filter(key => /^\d{4}-\d{2}$/.test(key) && key < current))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 6);
  const perCategoryMonthly = new Map();
  trans.forEach((tx) => {
    const key = String(tx?.dateISO || '').slice(0, 7);
    const amount = expenseAmount(tx);
    if (!amount || !eligibleMonths.includes(key)) return;
    const cat = tx.cat || 'other';
    const monthly = perCategoryMonthly.get(cat) || new Map();
    monthly.set(key, (monthly.get(key) || 0) + amount);
    perCategoryMonthly.set(cat, monthly);
  });
  const validCats = new Set(cats.map(cat => cat.id));
  const out = {};
  for (const [cat, monthly] of perCategoryMonthly.entries()) {
    if (!validCats.has(cat)) continue;
    const raw = eligibleMonths.map(month => monthly.get(month) || 0).filter(value => value > 0);
    if (!raw.length) continue;
    const cleaned = robustValues(raw);
    const values = cleaned.length ? cleaned : raw;
    let weighted = 0;
    let weights = 0;
    eligibleMonths.forEach((month, index) => {
      const value = monthly.get(month) || 0;
      if (!value || !values.includes(value)) return;
      const weight = Math.max(1, 6 - index); // newest month weighs most
      weighted += value * weight;
      weights += weight;
    });
    const estimate = weights ? weighted / weights : median(values);
    const recent = eligibleMonths.slice(0, 3).map(month => monthly.get(month) || 0).filter(Boolean);
    const older = eligibleMonths.slice(3).map(month => monthly.get(month) || 0).filter(Boolean);
    const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : estimate;
    const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
    const trend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
    const suggested = roundSuggestion(estimate);
    out[cat] = {
      amount: suggested,
      monthsUsed: values.length,
      outliersIgnored: Math.max(0, raw.length - values.length),
      trend: trend > 0.08 ? 'up' : trend < -0.08 ? 'down' : 'stable',
      confidence: values.length >= 5 ? 'high' : values.length >= 3 ? 'medium' : 'low',
    };
  }
  return out;
};

export const suggestBudgetsFromHistory = (trans = [], cats = [], now = new Date()) => Object.fromEntries(
  Object.entries(suggestBudgetsDetailedFromHistory(trans, cats, now)).map(([cat, row]) => [cat, row.amount]),
);

export const buildFinancialCoach = (trans = [], date = new Date()) => {
  const target = budgetMonthId(date);
  let income = 0;
  let expense = 0;
  trans.forEach((tx) => {
    if (!String(tx?.dateISO || '').startsWith(target)) return;
    const amount = Number(tx.baseAmount ?? tx.amt ?? 0);
    if (isIncomeFlow(tx)) income += Math.abs(amount);
    else if (isExpenseFlow(tx)) expense += Math.abs(amount);
  });
  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  const status = net < 0 ? 'danger' : savingsRate < 10 ? 'warning' : 'good';
  return { income, expense, net, savingsRate, status };
};
