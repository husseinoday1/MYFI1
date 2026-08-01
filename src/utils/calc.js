import { isExpenseFlow, isIncomeFlow } from '../lib/modules';
import { getWalletAvailableBalances } from '../lib/wallets';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const money = (value) => Math.round(toNumber(value) * 1000) / 1000;

export const sum = (items = [], pick = (x) => x) =>
  items.reduce((total, item) => total + toNumber(pick(item)), 0);

export const calcStats = (trans = []) => {
  const inc = sum(trans.filter(isIncomeFlow), t => Math.abs(toNumber(t.amt)));
  const exp = sum(trans.filter(isExpenseFlow), t => Math.abs(toNumber(t.amt)));
  return { inc, exp, bal: inc - exp };
};

export const calcCashFlow = (trans = []) => {
  let inflow = 0;
  let outflow = 0;
  trans.forEach(tx => {
    if (tx?.kind === 'transfer') return;
    const amount = toNumber(tx?.amt);
    if (amount > 0) inflow += amount;
    else if (amount < 0) outflow += Math.abs(amount);
  });
  return {
    inflow: money(inflow),
    outflow: money(outflow),
    net: money(inflow - outflow),
  };
};

export const byMonth = (trans = [], m, y) =>
  trans.filter(t => {
    if (!t.dateISO) return false;
    const d = new Date(`${t.dateISO}T12:00:00`);
    return d.getMonth() === m && d.getFullYear() === y;
  });

export const currentStats = (trans = []) => {
  const n = new Date();
  return calcStats(byMonth(trans, n.getMonth(), n.getFullYear()));
};

export const catSpend = (trans = [], cats = []) => {
  const m = {};
  trans.filter(isExpenseFlow).forEach(t => {
    m[t.cat] = (m[t.cat] || 0) + Math.abs(toNumber(t.amt));
  });
  return cats.filter(c => m[c.id]).map(c => ({ ...c, spent: m[c.id] }));
};

export const pct = (a, b, { cap = false } = {}) => {
  if (!toNumber(b)) return 0;
  const value = Math.round((toNumber(a) / toNumber(b)) * 100);
  return cap ? Math.min(value, 100) : value;
};

export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const isISODate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

export const normalizeDate = (value, fallback = today()) =>
  isISODate(value) ? value : fallback;

export const daysInMonth = (mo, yr) => new Date(yr, mo + 1, 0).getDate();

export const prevMonth = () => {
  const now = new Date();
  return {
    month: now.getMonth() === 0 ? 11 : now.getMonth() - 1,
    year:  now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
  };
};

export const monthlyForecast = (trans = [], date = new Date()) => {
  const mo  = date.getMonth();
  const yr  = date.getFullYear();
  const day = Math.max(1, date.getDate());
  const dim = daysInMonth(mo, yr);
  const mt  = byMonth(trans, mo, yr);
  const { inc: income, exp: spent } = calcStats(mt);
  const daysLeft = Math.max(0, dim - day);
  const dailyAvg = day > 0 ? spent / day : 0;
  const projectedExpense = dailyAvg * dim;
  const projectedNet = income - projectedExpense;
  const availableToday = daysLeft > 0 ? Math.max(0, (income - spent) / (daysLeft + 1)) : Math.max(0, income - spent);

  let status = 'safe';
  if (income > 0) {
    if (projectedExpense > income) status = 'danger';
    else if (projectedExpense > income * 0.9) status = 'warning';
  } else if (spent > 0) {
    status = 'warning';
  }

  return {
    spent: money(spent),
    income: money(income),
    dailyAvg: money(dailyAvg),
    projected: money(projectedExpense),
    projectedNet: money(projectedNet),
    availableToday: money(availableToday),
    daysLeft,
    status,
  };
};

export const buildChartData = (trans, openingBalance = 0, date = new Date()) => {
  const mo  = date.getMonth();
  const yr  = date.getFullYear();
  const dim = daysInMonth(mo, yr);
  const mt  = byMonth(trans, mo, yr);
  let running = toNumber(openingBalance);
  return Array.from({ length: dim }, (_, i) => {
    const day = i + 1;
    const dt  = mt.filter(t => new Date(`${t.dateISO}T12:00:00`).getDate() === day);
    running  += sum(dt, t => t.amt);
    return { day, bal: running };
  });
};

export const recurringKey = (t = {}) =>
  t.recurringGroupId || `${t.title || ''}|${t.cat || ''}|${toNumber(t.amt)}`;

export const getUpcomingRecurring = (trans = [], date = new Date()) => {
  const mo = date.getMonth();
  const yr = date.getFullYear();
  const dim = daysInMonth(mo, yr);
  const currentMonthKeys = new Set();
  const groups = new Map();

  trans.filter(t => t.recurring && t.dateISO).forEach(t => {
    const d = new Date(`${t.dateISO}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const key = recurringKey(t);
    if (d.getMonth() === mo && d.getFullYear() === yr) {
      currentMonthKeys.add(key);
      return;
    }
    if (d > new Date(yr, mo, dim, 23, 59, 59)) return;
    const previous = groups.get(key);
    if (!previous || new Date(`${previous.dateISO}T12:00:00`) < d) {
      groups.set(key, t);
    }
  });

  return [...groups.entries()]
    .filter(([key]) => !currentMonthKeys.has(key))
    .map(([key, t]) => {
      const sourceDate = new Date(`${t.dateISO}T12:00:00`);
      const expectedDay = Math.min(sourceDate.getDate() || 1, dim);
      const dueDate = new Date(yr, mo, expectedDay, 12, 0, 0);
      const dueISO = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(expectedDay).padStart(2, '0')}`;
      return {
        ...t,
        recurringGroupId: key,
        expectedDay,
        dueISO,
        dateISO: dueISO,
        daysUntil: Math.ceil((dueDate - date) / 86400000),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
};

export const debtSummary = (debts = [], direction = 'owed') => {
  const filtered = debts.filter(d => (
    direction === 'receivable'
      ? d.direction === 'receivable'
      : d.direction !== 'receivable'
  ));
  const total = sum(filtered, d => d.total);
  const paid = sum(filtered, d => d.paid);
  const remaining = sum(filtered, d => Math.max(0, toNumber(d.total) - toNumber(d.paid)));
  return {
    total: money(total),
    paid: money(paid),
    remaining: money(remaining),
    count: filtered.filter(d => Math.max(0, toNumber(d.total) - toNumber(d.paid)) > 0).length,
    progress: pct(paid, total),
  };
};

export const goalSummary = (goals = []) => {
  const target = sum(goals, g => g.target);
  const saved = sum(goals, g => g.cur);
  const remaining = sum(goals, g => Math.max(0, toNumber(g.target) - toNumber(g.cur)));
  return {
    target: money(target),
    saved: money(saved),
    remaining: money(remaining),
    count: goals.filter(g => Math.max(0, toNumber(g.target) - toNumber(g.cur)) > 0).length,
    progress: pct(saved, target),
  };
};

export const buildFinancialSnapshot = ({
  trans = [],
  debts = [],
  goals = [],
  cats = [],
  wallets = [],
  currency = 'IQD',
  defaultWalletId = null,
} = {}, date = new Date()) => {
  const monthTrans = byMonth(trans, date.getMonth(), date.getFullYear());
  const all = calcStats(trans);
  const month = calcStats(monthTrans);
  const cashFlow = calcCashFlow(monthTrans);
  const forecast = monthlyForecast(trans, date);
  const debtsInfo = debtSummary(debts);
  const receivablesInfo = debtSummary(debts, 'receivable');
  const goalsInfo = goalSummary(goals);
  const walletBalances = wallets.length
    ? getWalletAvailableBalances(wallets, trans, currency, defaultWalletId)
    : [];
  const cashBalance = wallets.length
    ? sum(walletBalances, wallet => wallet.balance)
    : sum(trans, tx => tx.kind === 'transfer' ? 0 : tx.amt);
  const reservedSavings = wallets.length
    ? sum(walletBalances, wallet => wallet.reservedBalance)
    : goalsInfo.saved;
  const availableCash = cashBalance - reservedSavings;
  const netWorth = cashBalance - debtsInfo.remaining + receivablesInfo.remaining;
  const savingsRate = month.inc > 0 ? pct(month.inc - month.exp, month.inc) : 0;

  return {
    all: {
      inc: money(all.inc),
      exp: money(all.exp),
      bal: money(all.bal),
    },
    month: {
      inc: money(month.inc),
      exp: money(month.exp),
      bal: money(month.bal),
      savingsRate,
    },
    cashFlow,
    forecast,
    debts: debtsInfo,
    receivables: receivablesInfo,
    goals: goalsInfo,
    cashBalance: money(cashBalance),
    reservedSavings: money(reservedSavings),
    availableCash: money(availableCash),
    netWorth: money(netWorth),
    health: getFinancialHealth(month, forecast, debtsInfo),
  };
};

const getFinancialHealth = (month, forecast, debts) => {
  if (forecast.status === 'danger') return 'danger';
  if (debts.remaining > Math.max(0, month.inc * 2)) return 'warning';
  if (month.inc > 0 && month.bal >= 0) return 'safe';
  if (month.exp > 0 && month.inc === 0) return 'watch';
  return 'neutral';
};
