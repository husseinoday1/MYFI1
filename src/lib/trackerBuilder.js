import { normalizeDate, today } from './dateCore';

export const TRACKER_BUILDER_VERSION = 1;
export const TRACKER_TEMPLATES = Object.freeze([
  'installment', 'subscription', 'debt_owed', 'debt_receivable', 'savings_goal', 'spending_cap', 'custom',
]);
export const TRACKER_CALCULATIONS = Object.freeze([
  'total_remaining', 'recurring_amount', 'category_cap', 'savings_target', 'balance_threshold',
]);
export const TRACKER_PAYMENT_FLOWS = Object.freeze(['expense', 'income', 'transfer', 'none']);
export const TRACKER_SOURCE_KINDS = Object.freeze(['all_wallets', 'wallets', 'bank_account', 'categories', 'party', 'manual']);

const safeText = (value, fallback = '') => String(value || '').trim().slice(0, 80) || fallback;
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const positiveNumber = value => Math.max(0, safeNumber(value));
const uniqueIds = values => [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const enumValue = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;

const defaultTemplate = template => ({
  installment: { calculation: 'total_remaining', paymentFlow: 'expense', sourceKind: 'wallets' },
  subscription: { calculation: 'recurring_amount', paymentFlow: 'expense', sourceKind: 'wallets' },
  debt_owed: { calculation: 'total_remaining', paymentFlow: 'expense', sourceKind: 'party' },
  debt_receivable: { calculation: 'total_remaining', paymentFlow: 'income', sourceKind: 'party' },
  savings_goal: { calculation: 'savings_target', paymentFlow: 'transfer', sourceKind: 'wallets' },
  spending_cap: { calculation: 'category_cap', paymentFlow: 'none', sourceKind: 'categories' },
  custom: { calculation: 'total_remaining', paymentFlow: 'expense', sourceKind: 'manual' },
}[template] || { calculation: 'total_remaining', paymentFlow: 'none', sourceKind: 'manual' });

export const normalizeTrackerTypeDefinition = (source = {}, { walletIds = [], categoryIds = [] } = {}) => {
  const id = safeText(source.id);
  const template = enumValue(source.template, TRACKER_TEMPLATES, 'custom');
  const defaults = defaultTemplate(template);
  const availableWallets = new Set(uniqueIds(walletIds));
  const availableCategories = new Set(uniqueIds(categoryIds));
  const sourceKind = enumValue(source.source?.kind || source.sourceKind, TRACKER_SOURCE_KINDS, defaults.sourceKind);
  const linkedWalletIds = uniqueIds(source.source?.walletIds || source.walletIds).filter(value => !availableWallets.size || availableWallets.has(value));
  const linkedCategoryIds = uniqueIds(source.source?.categoryIds || source.categoryIds).filter(value => !availableCategories.size || availableCategories.has(value));
  const calculation = enumValue(source.calculation?.kind || source.calculationKind, TRACKER_CALCULATIONS, defaults.calculation);
  const paymentFlow = enumValue(source.paymentTemplate?.flow || source.paymentFlow, TRACKER_PAYMENT_FLOWS, defaults.paymentFlow);
  return {
    id,
    version: TRACKER_BUILDER_VERSION,
    name: safeText(source.name, 'متابعة مالية'),
    nameEn: safeText(source.nameEn),
    icon: safeText(source.icon, 'analytics-outline'),
    color: /^#[0-9a-f]{6}$/i.test(String(source.color || '')) ? String(source.color) : '#16A26A',
    template,
    source: {
      kind: sourceKind,
      walletIds: sourceKind === 'wallets' || sourceKind === 'bank_account' ? linkedWalletIds : [],
      categoryIds: sourceKind === 'categories' ? linkedCategoryIds : [],
      partyId: sourceKind === 'party' ? safeText(source.source?.partyId || source.partyId) || null : null,
    },
    calculation: {
      kind: calculation,
      limit: positiveNumber(source.calculation?.limit ?? source.limit),
      cycle: enumValue(source.calculation?.cycle || source.cycle, ['monthly', 'quarterly', 'annual', 'none'], 'none'),
    },
    paymentTemplate: {
      flow: paymentFlow,
      walletId: safeText(source.paymentTemplate?.walletId || source.paymentWalletId) || null,
      categoryId: safeText(source.paymentTemplate?.categoryId || source.paymentCategoryId) || null,
      amountMode: enumValue(source.paymentTemplate?.amountMode || source.amountMode, ['entered', 'remaining', 'fixed'], 'entered'),
      fixedAmount: positiveNumber(source.paymentTemplate?.fixedAmount ?? source.fixedAmount),
    },
    alerts: {
      due: source.alerts?.due === true,
      threshold: source.alerts?.threshold === true,
      overdue: source.alerts?.overdue === true,
      completed: source.alerts?.completed === true,
    },
    status: enumValue(source.status, ['active', 'paused', 'archived'], 'active'),
    createdAt: validDate(source.createdAt) ? source.createdAt : today(),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
  };
};

export const normalizeTrackerItem = (source = {}, { typeIds = [] } = {}) => {
  const knownTypes = new Set(uniqueIds(typeIds));
  const typeId = safeText(source.typeId);
  return {
    id: safeText(source.id),
    typeId: knownTypes.size && !knownTypes.has(typeId) ? '' : typeId,
    name: safeText(source.name, 'عنصر متابعة'),
    targetAmount: positiveNumber(source.targetAmount ?? source.target),
    currentAmount: positiveNumber(source.currentAmount ?? source.current),
    dueISO: validDate(source.dueISO || source.dueDate) ? normalizeDate(source.dueISO || source.dueDate) : null,
    status: enumValue(source.status, ['active', 'paused', 'completed', 'archived', 'needs_review'], 'active'),
    paymentTransactionIds: uniqueIds(source.paymentTransactionIds),
    reconciledTransactionIds: uniqueIds(source.reconciledTransactionIds),
    createdAt: validDate(source.createdAt) ? source.createdAt : today(),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : null,
  };
};

export const validateTrackerDefinition = (definition = {}) => {
  const errors = [];
  if (!definition.id) errors.push('tracker_type_id_required');
  if (!safeText(definition.name)) errors.push('tracker_type_name_required');
  if (definition.source?.kind === 'wallets' && !(definition.source.walletIds || []).length) errors.push('tracker_type_wallet_source_required');
  if (definition.source?.kind === 'categories' && !(definition.source.categoryIds || []).length) errors.push('tracker_type_category_source_required');
  if (definition.paymentTemplate?.amountMode === 'fixed' && !(positiveNumber(definition.paymentTemplate?.fixedAmount) > 0)) errors.push('tracker_type_fixed_payment_amount_required');
  return { ok: errors.length === 0, errors };
};

export const validateTrackerItem = (item = {}, definition = null) => {
  const errors = [];
  if (!item.id) errors.push('tracker_item_id_required');
  if (!item.typeId) errors.push('tracker_item_type_required');
  if (definition?.id && item.typeId !== definition.id) errors.push('tracker_item_type_mismatch');
  if (definition?.calculation?.kind !== 'category_cap' && !(item.targetAmount > 0)) errors.push('tracker_item_target_required');
  return { ok: errors.length === 0, errors };
};

export const collectTrackerReferenceImpact = ({ trackerTypes = [], trackerItems = [], walletId = null, categoryId = null } = {}) => {
  const affectedTypes = (Array.isArray(trackerTypes) ? trackerTypes : []).filter(type => (
    (walletId && type?.source?.walletIds?.includes(walletId))
    || (walletId && type?.paymentTemplate?.walletId === walletId)
    || (categoryId && type?.source?.categoryIds?.includes(categoryId))
    || (categoryId && type?.paymentTemplate?.categoryId === categoryId)
  ));
  const typeIds = new Set(affectedTypes.map(item => item.id));
  return {
    types: affectedTypes.map(item => ({ id: item.id, name: item.name })),
    items: (Array.isArray(trackerItems) ? trackerItems : [])
      .filter(item => typeIds.has(item?.typeId))
      .map(item => ({ id: item.id, typeId: item.typeId, name: item.name })),
  };
};

export const buildTrackerPaymentDraft = ({ definition = {}, item = {}, amount = 0, dateISO = today(), note = '' } = {}) => {
  const definitionCheck = validateTrackerDefinition(definition);
  const itemCheck = validateTrackerItem(item, definition);
  if (!definitionCheck.ok || !itemCheck.ok) return { ok: false, reason: 'tracker_payment_invalid_reference' };
  const flow = definition.paymentTemplate?.flow;
  if (flow === 'none') return { ok: false, reason: 'tracker_payment_not_supported' };
  const remaining = Math.max(0, positiveNumber(item.targetAmount) - positiveNumber(item.currentAmount));
  const requested = definition.paymentTemplate?.amountMode === 'remaining'
    ? remaining
    : definition.paymentTemplate?.amountMode === 'fixed'
      ? positiveNumber(definition.paymentTemplate?.fixedAmount)
      : positiveNumber(amount);
  if (!(requested > 0)) return { ok: false, reason: 'tracker_payment_amount_required' };
  return {
    ok: true,
    draft: {
      type: flow === 'income' ? 'inc' : flow === 'transfer' ? 'transfer' : 'exp',
      flowType: flow,
      amt: requested,
      dateISO: validDate(dateISO) ? normalizeDate(dateISO) : today(),
      walletId: definition.paymentTemplate?.walletId || definition.source?.walletIds?.[0] || null,
      cat: definition.paymentTemplate?.categoryId || definition.source?.categoryIds?.[0] || 'other',
      title: `${definition.name}: ${item.name}`,
      note: safeText(note),
      trackerTypeId: definition.id,
      trackerItemId: item.id,
      transactionTag: 'tracker_payment',
    },
  };
};
