export const CATEGORY_FLOWS = {
  EXPENSE: 'expense',
  INCOME: 'income',
  BOTH: 'both',
};

const KNOWN_INCOME_CATEGORIES = new Set(['salary']);
const KNOWN_EXPENSE_CATEGORIES = new Set(['food', 'rent', 'transport', 'health', 'clothes', 'entertain']);
const KNOWN_SHARED_CATEGORIES = new Set(['other']);

export const normalizeCategoryFlow = (category = {}) => {
  const flow = String(category.flow || category.type || '').toLowerCase();
  if ([CATEGORY_FLOWS.EXPENSE, CATEGORY_FLOWS.INCOME, CATEGORY_FLOWS.BOTH].includes(flow)) return flow;
  if (KNOWN_SHARED_CATEGORIES.has(category.id)) return CATEGORY_FLOWS.BOTH;
  if (KNOWN_INCOME_CATEGORIES.has(category.id)) return CATEGORY_FLOWS.INCOME;
  if (KNOWN_EXPENSE_CATEGORIES.has(category.id)) return CATEGORY_FLOWS.EXPENSE;
  return CATEGORY_FLOWS.BOTH;
};

export const categorySupportsFlow = (category = {}, flow = CATEGORY_FLOWS.EXPENSE) => {
  const normalized = normalizeCategoryFlow(category);
  return normalized === CATEGORY_FLOWS.BOTH || normalized === flow;
};

export const getCategoriesForFlow = (categories = [], flow = CATEGORY_FLOWS.EXPENSE) => {
  const list = Array.isArray(categories) ? categories : [];
  const filtered = list.filter(category => categorySupportsFlow(category, flow));
  return filtered.length ? filtered : list;
};

export const getDefaultCategoryId = (categories = [], flow = CATEGORY_FLOWS.EXPENSE) => {
  const list = getCategoriesForFlow(categories, flow);
  return list.find(category => category.id !== 'other')?.id || list.find(category => category.id === 'other')?.id || list[0]?.id || 'other';
};

export const categoryFlowLabel = (category = {}, lang = 'ar') => {
  const flow = normalizeCategoryFlow(category);
  if (lang === 'ar') {
    if (flow === CATEGORY_FLOWS.INCOME) return 'دخل';
    if (flow === CATEGORY_FLOWS.EXPENSE) return 'صرف';
    return 'مشترك';
  }
  if (flow === CATEGORY_FLOWS.INCOME) return 'Income';
  if (flow === CATEGORY_FLOWS.EXPENSE) return 'Expense';
  return 'Shared';
};
