const currencyCodeOf = (item = {}, fallbackCurrency = 'IQD') => (
  String(item.currencyCode || item.currency || fallbackCurrency || 'IQD').trim().toUpperCase() || 'IQD'
);

const safeAmount = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
};

const upsertGroup = (map, currency, patch = {}) => {
  const current = map.get(currency) || { currency, count: 0, total: 0, paid: 0, remaining: 0, saved: 0, target: 0, amount: 0 };
  const next = { ...current, count: current.count + Number(patch.count || 0) };
  for (const key of ['total', 'paid', 'remaining', 'saved', 'target', 'amount']) {
    next[key] = Number(current[key] || 0) + Number(patch[key] || 0);
  }
  map.set(currency, next);
};

const sortedGroups = map => [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));

export const summarizeDebtCurrencies = (debts = [], direction = 'owed', fallbackCurrency = 'IQD') => {
  const groups = new Map();
  for (const item of Array.isArray(debts) ? debts : []) {
    if (!item || item.deletedAt) continue;
    const receivable = item.direction === 'receivable';
    if (direction === 'receivable' ? !receivable : receivable) continue;
    const total = safeAmount(item.total);
    const paid = Math.min(total, safeAmount(item.paid));
    const remaining = Math.max(0, total - paid);
    if (!(total > 0 || remaining > 0)) continue;
    upsertGroup(groups, currencyCodeOf(item, fallbackCurrency), { count: 1, total, paid, remaining });
  }
  return sortedGroups(groups);
};

export const summarizeGoalCurrencies = (goals = [], fallbackCurrency = 'IQD', { activeOnly = false } = {}) => {
  const groups = new Map();
  for (const item of Array.isArray(goals) ? goals : []) {
    if (!item || item.deletedAt || (activeOnly && item.active === false)) continue;
    const target = safeAmount(item.target);
    const saved = Math.min(target || safeAmount(item.cur), safeAmount(item.cur));
    const remaining = Math.max(0, target - saved);
    if (!(target > 0 || saved > 0)) continue;
    upsertGroup(groups, currencyCodeOf(item, fallbackCurrency), { count: 1, target, saved, remaining });
  }
  return sortedGroups(groups);
};

export const summarizeCommitmentCurrencies = (commitments = [], fallbackCurrency = 'IQD', { activeOnly = true } = {}) => {
  const groups = new Map();
  for (const item of Array.isArray(commitments) ? commitments : []) {
    if (!item || item.deletedAt || (activeOnly && item.active === false)) continue;
    const amount = safeAmount(item.amt);
    if (!(amount > 0)) continue;
    upsertGroup(groups, currencyCodeOf(item, fallbackCurrency), { count: 1, amount });
  }
  return sortedGroups(groups);
};

export const mergeCurrencyAmounts = (...groupSets) => {
  const map = new Map();
  for (const groups of groupSets) {
    for (const row of Array.isArray(groups) ? groups : []) {
      const currency = String(row?.currency || '').trim().toUpperCase();
      if (!currency) continue;
      upsertGroup(map, currency, { count: Number(row.count || 0), amount: Number(row.amount ?? row.remaining ?? 0) });
    }
  }
  return sortedGroups(map);
};

export const currencyGroupsAreBaseOnly = (groups = [], baseCurrency = 'IQD') => {
  const base = String(baseCurrency || 'IQD').trim().toUpperCase();
  return (Array.isArray(groups) ? groups : []).every(row => String(row?.currency || '').toUpperCase() === base);
};

export const averageGoalProgress = (goals = []) => {
  const rows = (Array.isArray(goals) ? goals : []).filter(item => item && item.active !== false && safeAmount(item.target) > 0);
  if (!rows.length) return 0;
  const total = rows.reduce((sum, item) => sum + Math.min(100, Math.max(0, (safeAmount(item.cur) / safeAmount(item.target)) * 100)), 0);
  return Math.round(total / rows.length);
};
