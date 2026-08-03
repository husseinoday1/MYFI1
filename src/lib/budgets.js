import { isExpenseFlow, isIncomeFlow } from './modules';

const expenseAmount = (tx) => isExpenseFlow(tx)
  ? Math.abs(Number(tx.amt))
  : 0;

export const normalizeBudgets = (budgets = {}) => Object.fromEntries(
  Object.entries(budgets || {})
    .map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
    .filter(([, value]) => value > 0),
);

const monthId = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const getBudgetRows = (trans = [], cats = [], budgets = {}, date = new Date()) => {
  const target = monthId(date);
  const spent = new Map();
  trans.forEach((tx) => {
    if (!String(tx?.dateISO || '').startsWith(target)) return;
    const amount = expenseAmount(tx);
    if (amount) spent.set(tx.cat || 'other', (spent.get(tx.cat || 'other') || 0) + amount);
  });
  const catMap = new Map(cats.map(cat => [cat.id, cat]));
  return Object.entries(normalizeBudgets(budgets)).map(([categoryId, limit]) => {
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

export const suggestBudgetsFromHistory = (trans = [], cats = [], now = new Date()) => {
  const current = monthId(now);
  const eligibleMonths = [...new Set(trans
    .map(tx => String(tx?.dateISO || '').slice(0, 7))
    .filter(key => /^\d{4}-\d{2}$/.test(key) && key < current))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 3);
  const included = new Set(eligibleMonths);
  const totals = new Map();
  trans.forEach((tx) => {
    const key = String(tx?.dateISO || '').slice(0, 7);
    const amount = expenseAmount(tx);
    if (!amount || !included.has(key)) return;
    const cat = tx.cat || 'other';
    totals.set(cat, (totals.get(cat) || 0) + amount);
  });
  const divisor = Math.max(1, eligibleMonths.length);
  const validCats = new Set(cats.map(cat => cat.id));
  return Object.fromEntries([...totals.entries()]
    .filter(([cat]) => validCats.has(cat))
    .map(([cat, total]) => [cat, Math.ceil((total / divisor) / 1000) * 1000])
    .filter(([, value]) => value > 0));
};

export const buildFinancialCoach = (trans = [], date = new Date()) => {
  const target = monthId(date);
  let income = 0;
  let expense = 0;
  trans.forEach((tx) => {
    if (!String(tx?.dateISO || '').startsWith(target)) return;
    const amount = Number(tx.amt || 0);
    if (isIncomeFlow(tx)) income += Math.abs(amount);
    else if (isExpenseFlow(tx)) expense += Math.abs(amount);
  });
  const net = income - expense;
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0;
  const status = net < 0 ? 'danger' : savingsRate < 10 ? 'warning' : 'good';
  return { income, expense, net, savingsRate, status };
};
