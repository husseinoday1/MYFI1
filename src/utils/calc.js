import { getTransactionDisplayAmount, isExpenseFlow, isIncomeFlow } from '../lib/modules';
import { getWalletBalances, walletAmountToBase } from '../lib/wallets';
import { asDate, daysInMonth, isISODate, normalizeDate, today } from '../lib/dateCore';
import { getMonthTransactions, getTransactionIndex, getTransactionsThroughDate, getYearTransactions } from '../lib/transactionIndex';
export { daysInMonth, isISODate, normalizeDate, today } from '../lib/dateCore';
import {
  adaptiveVariableProjection,
  fixedExpenseSpent,
  monthKeyForDate,
  outstandingExpenseCommitments,
  weightedHistoricalVariableSpend,
} from '../lib/financialForecast';

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};


export const money = (value) => Math.round(toNumber(value) * 1000) / 1000;

export const sum = (items = [], pick = (x) => x) =>
  items.reduce((total, item) => total + toNumber(pick(item)), 0);

const statsCache = new WeakMap();

export const calcStats = (trans = []) => {
  const source = Array.isArray(trans) ? trans : [];
  const cached = statsCache.get(source);
  if (cached) return cached;
  const indexed = getTransactionIndex(source).stats;
  const value = { inc: indexed.inc, exp: indexed.exp, bal: indexed.bal };
  statsCache.set(source, value);
  return value;
};

export const calcCashFlow = (trans = []) => {
  let inflow = 0;
  let outflow = 0;
  trans.forEach(tx => {
    if (tx?.kind === 'transfer') {
      outflow += Math.abs(toNumber(tx?.feeBaseAmount));
      return;
    }
    // Moving money into a saving goal reserves cash; it is not a physical outflow.
    if (tx?.isGoalSaving || tx?.flowType === 'goal_allocation') return;
    const amount = toNumber(getTransactionDisplayAmount(tx));
    if (amount > 0) inflow += amount;
    else if (amount < 0) outflow += Math.abs(amount);
  });
  return {
    inflow: money(inflow),
    outflow: money(outflow),
    net: money(inflow - outflow),
  };
};

export const byMonth = (trans = [], m, y) => getMonthTransactions(trans, y, m);

// Home's four period pills (Today/Week/Month/Year — REF-01). No new financial
// math: each period's figures are calcStats(trans) run on a date-sliced
// array, the exact function 'this month' already uses in
// buildFinancialSnapshot — only the slicing is new.
// Week start matches the app's one existing calendar convention
// (DateField.js's month grid), Saturday: (getDay() + 1) % 7 === 0.
const dayISO = (date) => {
  const safe = asDate(date);
  return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`;
};

const startOfWeekISO = (date) => {
  const safe = asDate(date);
  const offset = (safe.getDay() + 1) % 7;
  const start = new Date(safe.getFullYear(), safe.getMonth(), safe.getDate() - offset, 12, 0, 0);
  return dayISO(start);
};

const byDateRange = (trans = [], startISO, endISO) => trans.filter(tx => {
  const iso = String(tx?.dateISO || '').slice(0, 10);
  return iso && iso >= startISO && iso <= endISO;
});

export const homePeriodPills = (trans = [], date = new Date()) => {
  const safeDate = asDate(date);
  const todayISO = dayISO(safeDate);
  const weekStartISO = startOfWeekISO(safeDate);
  const monthTrans = byMonth(trans, safeDate.getMonth(), safeDate.getFullYear());
  const yearTrans = getYearTransactions(trans, safeDate.getFullYear());
  const dayStats = calcStats(byDateRange(trans, todayISO, todayISO));
  const weekStats = calcStats(byDateRange(trans, weekStartISO, todayISO));
  const monthStats = calcStats(monthTrans);
  const yearStats = calcStats(yearTrans);
  return [
    { key: 'day', inc: dayStats.inc, exp: dayStats.exp, net: money(dayStats.inc - dayStats.exp) },
    { key: 'week', inc: weekStats.inc, exp: weekStats.exp, net: money(weekStats.inc - weekStats.exp) },
    { key: 'month', inc: monthStats.inc, exp: monthStats.exp, net: money(monthStats.inc - monthStats.exp) },
    { key: 'year', inc: yearStats.inc, exp: yearStats.exp, net: money(yearStats.inc - yearStats.exp) },
  ];
};

const dateOfTransaction = (item = {}) => {
  const date = new Date(`${item?.dateISO || ''}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const currentStats = (trans = []) => {
  const n = new Date();
  return calcStats(byMonth(trans, n.getMonth(), n.getFullYear()));
};

export const catSpend = (trans = [], cats = []) => {
  const m = {};
  trans.forEach(t => {
    if (t?.kind === 'transfer') {
      const fee = Math.abs(toNumber(t?.feeBaseAmount));
      if (fee) m.other = (m.other || 0) + fee;
      return;
    }
    if (!isExpenseFlow(t)) return;
    const amount = Math.abs(toNumber(t?.baseAmount ?? t?.amt));
    m[t.cat] = (m[t.cat] || 0) + amount;
  });
  return cats.filter(c => m[c.id]).map(c => ({ ...c, spent: m[c.id] }));
};

export const pct = (a, b, { cap = false } = {}) => {
  if (!toNumber(b)) return 0;
  const value = Math.round((toNumber(a) / toNumber(b)) * 100);
  return cap ? Math.min(value, 100) : value;
};

export const prevMonth = () => {
  const now = new Date();
  return {
    month: now.getMonth() === 0 ? 11 : now.getMonth() - 1,
    year:  now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
  };
};

export const monthlyForecast = (trans = [], date = new Date(), commitments = []) => {
  const safeDate = asDate(date);
  const mo  = safeDate.getMonth();
  const yr  = safeDate.getFullYear();
  const day = Math.max(1, safeDate.getDate());
  const dim = daysInMonth(mo, yr);
  const currentMonthKey = monthKeyForDate(safeDate);
  const mt  = byMonth(trans, mo, yr);
  const { inc: income, exp: spent } = calcStats(mt);

  const fixedSpentSoFar = fixedExpenseSpent(mt, commitments);
  const variableSpentSoFar = Math.max(0, spent - fixedSpentSoFar);
  const remainingCommitments = outstandingExpenseCommitments(commitments, mt, currentMonthKey);
  const remainingCommitmentAmount = sum(remainingCommitments, c => Math.abs(toNumber(c.amt)));
  const fixedExpected = fixedSpentSoFar + remainingCommitmentAmount;

  const historicalVariable = weightedHistoricalVariableSpend(trans, safeDate, commitments, { limit: 6, decay: 0.7 });
  const variableForecast = adaptiveVariableProjection({
    currentSpent: variableSpentSoFar,
    historicalSpent: historicalVariable.value,
    daysElapsed: day,
    daysInMonth: dim,
    baselineMonthCount: historicalVariable.monthCount,
    fallbackScaleCap: 2,
  });

  const daysLeft = Math.max(0, dim - day);
  const dailyAvg = day > 0 ? variableSpentSoFar / day : 0;
  const projectedVariable = variableForecast.projected;
  const projectedExpense = fixedExpected + projectedVariable;
  const projectedNet = income - projectedExpense;
  const availableToday = daysLeft > 0
    ? Math.max(0, projectedNet / (daysLeft + 1))
    : Math.max(0, projectedNet);

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
    fixedExpected: money(fixedExpected),
    fixedSpent: money(fixedSpentSoFar),
    remainingCommitments: money(remainingCommitmentAmount),
    variableSpent: money(variableSpentSoFar),
    historicalVariable: money(historicalVariable.value),
    baselineMonthCount: historicalVariable.monthCount,
    projectedVariable: money(projectedVariable),
    forecastBasis: variableForecast.basis,
    currentWeight: variableForecast.currentWeight,
    historicalWeight: variableForecast.historicalWeight,
    projected: money(projectedExpense),
    projectedNet: money(projectedNet),
    availableToday: money(availableToday),
    daysLeft,
    status,
  };
};

export const buildChartData = (trans, openingBalance = 0, date = new Date()) => {
  const safeDate = asDate(date);
  const mo  = safeDate.getMonth();
  const yr  = safeDate.getFullYear();
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
  const safeDate = asDate(date);
  const mo = safeDate.getMonth();
  const yr = safeDate.getFullYear();
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
        daysUntil: Math.ceil((dueDate - safeDate) / 86400000),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
};

export const debtSummary = (debts = [], direction = 'owed') => {
  const filtered = debts.filter(d => !d.archivedAt && (
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
  const activeGoals = goals.filter(g => !g.archivedAt && !['released', 'settled'].includes(g.status));
  const target = sum(activeGoals, g => g.target);
  const saved = sum(activeGoals, g => g.cur);
  const remaining = sum(activeGoals, g => Math.max(0, toNumber(g.target) - toNumber(g.cur)));
  return {
    target: money(target),
    saved: money(saved),
    remaining: money(remaining),
    count: activeGoals.filter(g => Math.max(0, toNumber(g.target) - toNumber(g.cur)) > 0).length,
    progress: pct(saved, target),
  };
};

const dateToISO = (date) => {
  const safe = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`;
};

const financialSnapshotAsOfISO = (date = new Date()) => {
  const raw = date instanceof Date ? date : new Date(date);
  const safe = Number.isNaN(raw.getTime()) ? new Date() : raw;
  const now = new Date();
  const currentMonth = safe.getFullYear() === now.getFullYear() && safe.getMonth() === now.getMonth();
  const asOf = currentMonth ? now : new Date(safe.getFullYear(), safe.getMonth() + 1, 0, 12);
  return dateToISO(asOf);
};

const getWalletHistoricalAvailableBalances = (
  wallets = [],
  trans = [],
  goals = [],
  currency = 'IQD',
  defaultWalletId = null,
  asOfISO = today(),
) => {
  const balances = getWalletBalances(wallets, trans, currency, defaultWalletId);
  const safeDefault = defaultWalletId && balances.some(wallet => wallet.id === defaultWalletId)
    ? defaultWalletId
    : balances[0]?.id || defaultWalletId;
  const reserved = new Map(balances.map(wallet => [wallet.id, 0]));
  const goalsById = new Map((Array.isArray(goals) ? goals : []).map(goal => [goal.id, goal]));

  (Array.isArray(trans) ? trans : []).forEach(tx => {
    if ((!tx?.isGoalSaving && tx?.flowType !== 'goal_allocation')) return;
    if (tx?.dateISO && String(tx.dateISO) > asOfISO) return;

    const goal = goalsById.get(tx.goalId);
    const releaseISO = goal?.settledAt || goal?.releasedAt || goal?.completedAt || null;
    const releasedByAsOf = !!tx?.allocationReleased && (!releaseISO || String(releaseISO) <= asOfISO);
    if (releasedByAsOf) return;

    const walletId = tx.walletId || safeDefault;
    if (!reserved.has(walletId)) return;
    reserved.set(
      walletId,
      reserved.get(walletId) + Math.abs(toNumber(tx.allocationWalletAmount ?? tx.allocationAmount ?? tx.amt ?? 0)),
    );
  });

  return balances.map(wallet => ({
    ...wallet,
    reservedBalance: reserved.get(wallet.id) || 0,
    availableBalance: toNumber(wallet.balance) - toNumber(reserved.get(wallet.id) || 0),
  }));
};

const debtDateOf = (item = {}) => (
  item.createdAt
  || item.dateISO
  || item.date
  || item.startedAt
  // Legacy debts without a creation date predate the reporting engine.
  || '1970-01-01'
);

const paymentDateOf = (item = {}) => (
  item.date
  || item.dateISO
  || item.paidAt
  || item.createdAt
  || today()
);

const debtSummaryAsOf = (debts = [], direction = 'owed', asOfISO = today()) => {
  const filtered = debts.filter(item => {
    if (!item) return false;
    const isReceivable = item.direction === 'receivable';
    if (direction === 'receivable' ? !isReceivable : isReceivable) return false;
    return String(debtDateOf(item)) <= asOfISO;
  });

  let total = 0;
  let paid = 0;
  let remaining = 0;
  let count = 0;

  filtered.forEach(item => {
    const itemTotal = Math.abs(toNumber(item.total));
    const payments = Array.isArray(item.payments) ? item.payments : [];
    const datedPayments = payments
      .filter(payment => String(paymentDateOf(payment)) <= asOfISO)
      .reduce((sumPaid, payment) => sumPaid + Math.abs(toNumber(payment.amt)), 0);
    const legacyPaid = payments.length === 0 ? Math.abs(toNumber(item.paid)) : 0;

    const archivedPaid = item.archivedAt && String(item.archivedAt) <= asOfISO
      ? Math.abs(toNumber(item.archivedPaid))
      : 0;

    const itemPaid = Math.min(itemTotal, datedPayments + legacyPaid + archivedPaid);
    const itemRemaining = Math.max(0, itemTotal - itemPaid);

    total += itemTotal;
    paid += itemPaid;
    remaining += itemRemaining;
    if (itemRemaining > 0) count += 1;
  });

  return {
    total: money(total),
    paid: money(paid),
    remaining: money(remaining),
    count,
    progress: pct(paid, total),
  };
};

export const buildFinancialSnapshot = ({
  trans = [],
  debts = [],
  goals = [],
  cats = [],
  wallets = [],
  commitments = [],
  currency = 'IQD',
  defaultWalletId = null,
  summaryOverride = null,
} = {}, date = new Date()) => {
  const safeDate = asDate(date);
  const monthTrans = byMonth(trans, safeDate.getMonth(), safeDate.getFullYear());
  const all = summaryOverride?.all || calcStats(trans);
  const month = summaryOverride?.month || calcStats(monthTrans);
  const cashFlow = calcCashFlow(monthTrans);
  const forecast = monthlyForecast(trans, safeDate, commitments);
  const asOfISO = financialSnapshotAsOfISO(safeDate);
  const debtsInfo = debtSummaryAsOf(debts, 'owed', asOfISO);
  const receivablesInfo = debtSummaryAsOf(debts, 'receivable', asOfISO);
  const goalsInfo = goalSummary(goals);
  const snapshotTrans = getTransactionsThroughDate(trans, asOfISO);
  const walletBalances = wallets.length
    ? getWalletHistoricalAvailableBalances(wallets, snapshotTrans, goals, currency, defaultWalletId, asOfISO)
    : [];
  const cashBalance = wallets.length
    ? sum(walletBalances, wallet => walletAmountToBase(wallet, wallet.balance, currency))
    : sum(snapshotTrans, tx => tx.kind === 'transfer' ? 0 : tx.amt);
  const reservedSavings = wallets.length
    ? sum(walletBalances, wallet => walletAmountToBase(wallet, wallet.reservedBalance, currency))
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

export const buildFinancialReport = ({
  trans = [],
  debts = [],
  goals = [],
  cats = [],
  wallets = [],
  commitments = [],
  currency = 'IQD',
  defaultWalletId = null,
  scope = 'month',
  summaryOverride = null,
  periodStatsOverride = null,
} = {}, date = new Date()) => {
  const safeDate = asDate(date);
  const source = Array.isArray(trans) ? trans : [];
  const periodTrans = scope === 'month'
    ? byMonth(source, safeDate.getMonth(), safeDate.getFullYear())
    : scope === 'year'
      ? source.filter(item => {
          const rowDate = dateOfTransaction(item);
          return rowDate?.getFullYear() === safeDate.getFullYear();
        })
      : source;
  const snapshot = buildFinancialSnapshot({
    trans: source,
    debts,
    goals,
    cats,
    wallets,
    commitments,
    currency,
    defaultWalletId,
    summaryOverride,
  }, safeDate);
  return {
    ...snapshot,
    periodTrans,
    stats: periodStatsOverride || calcStats(periodTrans),
    periodCashFlow: calcCashFlow(periodTrans),
  };
};

const getFinancialHealth = (month, forecast, debts) => {
  if (forecast.status === 'danger') return 'danger';
  if (debts.remaining > Math.max(0, month.inc * 2)) return 'warning';
  if (month.inc > 0 && month.bal >= 0) return 'safe';
  if (month.exp > 0 && month.inc === 0) return 'watch';
  return 'neutral';
};
