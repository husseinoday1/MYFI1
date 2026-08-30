import { getUpcomingCommitments } from './commitments';

export const MYFI_FLOW_VERSION = 1;
export const MYFI_FLOW_BUCKETS = ['needs', 'wants', 'savings', 'debt', 'investment'];

const finitePositive = value => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;

const normalizedPercentages = (allocations = {}) => {
  const source = allocations && typeof allocations === 'object' ? allocations : {};
  const values = Object.fromEntries(MYFI_FLOW_BUCKETS.map(key => [
    key,
    Math.max(0, Math.min(100, Math.round(Number(source[key]) || 0))),
  ]));
  const total = MYFI_FLOW_BUCKETS.reduce((sum, key) => sum + values[key], 0);
  return { values, total, valid: total === 100 };
};

const normalizedBindings = (bindings = {}, validCategoryIds = null) => {
  const source = bindings && typeof bindings === 'object' ? bindings : {};
  const allowed = validCategoryIds instanceof Set ? validCategoryIds : null;
  return Object.fromEntries(MYFI_FLOW_BUCKETS.map(bucket => {
    const seen = new Set();
    const rows = (Array.isArray(source[bucket]) ? source[bucket] : [])
      .map(row => ({
        categoryId: String(row?.categoryId || '').trim(),
        weight: finitePositive(row?.weight),
      }))
      .filter(row => row.categoryId && (!allowed || allowed.has(row.categoryId)) && !seen.has(row.categoryId) && seen.add(row.categoryId));
    const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
    return [bucket, totalWeight > 0
      ? rows.map(row => ({ ...row, weight: row.weight / totalWeight }))
      : []];
  }));
};

export const normalizeMyfiFlowPlan = (plan = {}, { categoryIds = [] } = {}) => {
  const source = plan && typeof plan === 'object' ? plan : {};
  const allocations = normalizedPercentages(source.allocations);
  const knownCategories = Array.isArray(categoryIds) && categoryIds.length ? new Set(categoryIds) : null;
  return {
    version: MYFI_FLOW_VERSION,
    strategy: ['balanced', 'debtFirst', 'saveFirst', 'custom'].includes(source.strategy) ? source.strategy : 'custom',
    income: finitePositive(source.income),
    period: /^\d{4}-\d{2}$/.test(String(source.period || '')) ? source.period : null,
    allocations: allocations.values,
    categoryBindings: normalizedBindings(source.categoryBindings, knownCategories),
    status: source.status === 'draft' ? 'draft' : 'active',
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
  };
};

export const buildMyfiFlowPreview = ({
  income = 0,
  allocations = {},
  categoryBindings = {},
  categories = [],
  commitments = [],
  date = new Date(),
} = {}) => {
  const normalized = normalizedPercentages(allocations);
  const plannedIncome = finitePositive(income);
  const categoryIds = new Set((Array.isArray(categories) ? categories : []).map(item => item?.id).filter(Boolean));
  const bindings = normalizedBindings(categoryBindings, categoryIds);
  const amounts = Object.fromEntries(MYFI_FLOW_BUCKETS.map(bucket => [
    bucket,
    roundMoney(plannedIncome * (normalized.values[bucket] / 100)),
  ]));
  const budgetChanges = Object.entries(bindings).flatMap(([bucket, rows]) => rows.map(row => ({
    categoryId: row.categoryId,
    bucket,
    amount: roundMoney(amounts[bucket] * row.weight),
  }))).reduce((map, row) => {
    map.set(row.categoryId, {
      ...row,
      amount: roundMoney((map.get(row.categoryId)?.amount || 0) + row.amount),
    });
    return map;
  }, new Map());
  const scheduledCommitments = getUpcomingCommitments(commitments, date)
    .filter(item => item.actionable)
    .map(item => ({ id: item.id, name: item.name, amount: finitePositive(item.amt), dueISO: item.dueISO }));
  const scheduledAmount = roundMoney(scheduledCommitments.reduce((sum, item) => sum + item.amount, 0));
  const essentialsGap = roundMoney(Math.max(0, scheduledAmount - amounts.needs));
  const unboundBuckets = MYFI_FLOW_BUCKETS.filter(bucket => amounts[bucket] > 0 && bindings[bucket].length === 0);

  return {
    valid: plannedIncome > 0 && normalized.valid,
    income: plannedIncome,
    allocationTotal: normalized.total,
    amounts,
    scheduledCommitments,
    scheduledAmount,
    essentialsGap,
    flexibleAmount: roundMoney(amounts.needs + amounts.wants),
    protectedAmount: roundMoney(amounts.savings + amounts.debt + amounts.investment),
    unboundBuckets,
    budgetChanges: [...budgetChanges.values()].sort((a, b) => a.categoryId.localeCompare(b.categoryId)),
  };
};

export const buildMyfiFlowSavePlan = ({
  strategy = 'custom',
  income = 0,
  allocations = {},
  categoryBindings = {},
  categories = [],
  period = null,
  status = 'active',
  updatedAt = new Date().toISOString(),
} = {}) => normalizeMyfiFlowPlan({
  strategy,
  income,
  allocations,
  categoryBindings,
  period,
  status,
  updatedAt,
}, { categoryIds: (Array.isArray(categories) ? categories : []).map(item => item?.id).filter(Boolean) });
