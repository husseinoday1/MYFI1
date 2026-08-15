import { DEF_MODULES } from './constants';

export const PROFILE_TYPES = {
  PERSONAL: 'personal',
  BUSINESS: 'business',
  MIXED: 'personal_business',
};

export const SCOPES = {
  PERSONAL: 'personal',
  BUSINESS: 'business',
  ALL: 'all',
};

export const FLOW_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
  DEBT_PAYMENT: 'debt_payment',
  DEBT_PROCEEDS: 'debt_proceeds',
  RECEIVABLE_CREATED: 'receivable_created',
  RECEIVABLE_COLLECTION: 'receivable_collection',
  GOAL_ALLOCATION: 'goal_allocation',
  COMMITMENT_PAYMENT: 'commitment_payment',
  OPENING_BALANCE: 'opening_balance',
  BALANCE_ADJUSTMENT: 'balance_adjustment',
};

export const FEATURE_DEFINITIONS = {
  wallets: { group: 'money', dataKey: 'wallets' },
  debtsOwed: { group: 'tracker', dataKey: 'debts', direction: 'owed' },
  debtsReceivable: { group: 'tracker', dataKey: 'debts', direction: 'receivable' },
  goals: { group: 'tracker', dataKey: 'goals' },
  commitments: { group: 'tracker', dataKey: 'commitments' },
  budgets: { group: 'planning', dataKey: 'categoryBudgets' },
  recurring: { group: 'planning', dataKey: 'trans' },
};

export const getModules = (cfg = {}) => ({
  ...DEF_MODULES,
  ...(cfg.enabledModules || {}),
});

export const isFeatureEnabled = (cfg = {}, key) => getModules(cfg)[key] !== false;

export const getCommitModes = (cfg = {}) => {
  const modules = getModules(cfg);
  const modes = [];
  if (modules.debtsOwed) modes.push('debt');
  if (modules.debtsReceivable) modes.push('receivable');
  if (modules.goals) modes.push('goal');
  return modes;
};

export const getTrackerKinds = (cfg = {}) => {
  const modules = getModules(cfg);
  return [
    modules.debtsOwed ? 'owed' : null,
    modules.debtsReceivable ? 'receivable' : null,
    modules.goals ? 'goal' : null,
    modules.commitments ? 'commitment' : null,
  ].filter(Boolean);
};

export const getDefaultCommitSub = (cfg = {}) => getCommitModes(cfg)[0] || 'debt';

export const shouldShowCommitTab = (cfg = {}) => getCommitModes(cfg).length > 0;

export const shouldShowTrackersTab = (cfg = {}) => getTrackerKinds(cfg).length > 0;

export const profileModuleDefaults = (profileType = PROFILE_TYPES.PERSONAL) => {
  const isBusiness = profileType === PROFILE_TYPES.BUSINESS || profileType === PROFILE_TYPES.MIXED;
  return {
    ...DEF_MODULES,
    wallets: isBusiness,
    debtsOwed: true,
    debtsReceivable: isBusiness,
    goals: profileType !== PROFILE_TYPES.BUSINESS,
    commitments: true,
    budgets: true,
    recurring: true,
  };
};

export const normalizeScope = (scope, fallback = SCOPES.PERSONAL) => (
  scope === SCOPES.BUSINESS || scope === SCOPES.PERSONAL ? scope : fallback
);

export const defaultScopeForProfile = (profileType = PROFILE_TYPES.PERSONAL) => (
  profileType === PROFILE_TYPES.BUSINESS ? SCOPES.BUSINESS : SCOPES.PERSONAL
);

export const getActiveScope = (cfg = {}) => {
  if (cfg.profileType === PROFILE_TYPES.PERSONAL) return SCOPES.PERSONAL;
  if (cfg.profileType === PROFILE_TYPES.BUSINESS) return SCOPES.BUSINESS;
  if (cfg.profileType === PROFILE_TYPES.MIXED) {
    return [SCOPES.PERSONAL, SCOPES.BUSINESS, SCOPES.ALL].includes(cfg.activeScope)
      ? cfg.activeScope
      : SCOPES.ALL;
  }
  return SCOPES.PERSONAL;
};

export const getEntryScope = (cfg = {}) => {
  const active = getActiveScope(cfg);
  return active === SCOPES.ALL ? defaultScopeForProfile(cfg.profileType) : active;
};

export const scopeMatches = (item = {}, cfg = {}) => {
  const active = getActiveScope(cfg);
  if (active === SCOPES.ALL) return true;
  if (item.kind === 'transfer' && (item.fromScope || item.toScope)) {
    return normalizeScope(item.fromScope, item.scope) === active
      || normalizeScope(item.toScope, item.scope) === active;
  }
  return normalizeScope(item.scope, defaultScopeForProfile(cfg.profileType)) === active;
};

const activeScopeCache = new WeakMap();
const featureFilterCache = new WeakMap();

const activeScopeCacheKey = (cfg = {}) => (
  `${cfg.profileType || PROFILE_TYPES.PERSONAL}|${getActiveScope(cfg)}`
);

const enabledTransactionFeaturesKey = (cfg = {}) => {
  const modules = getModules(cfg);
  return ['wallets', 'debtsOwed', 'debtsReceivable', 'goals', 'commitments']
    .map(key => modules[key] === false ? '0' : '1')
    .join('');
};

export const filterByActiveScope = (items = [], cfg = {}) => {
  const source = Array.isArray(items) ? items : [];
  if (getActiveScope(cfg) === SCOPES.ALL) return source;
  const key = activeScopeCacheKey(cfg);
  const cachedByScope = activeScopeCache.get(source);
  const cached = cachedByScope?.get(key);
  if (cached) return cached;
  const filtered = source.filter(item => scopeMatches(item, cfg));
  const nextCache = cachedByScope || new Map();
  nextCache.set(key, filtered);
  if (!cachedByScope) activeScopeCache.set(source, nextCache);
  return filtered;
};

export const inferFlowType = (tx = {}) => {
  if (tx.flowType && Object.values(FLOW_TYPES).includes(tx.flowType)) return tx.flowType;
  if (tx.kind === 'transfer') return FLOW_TYPES.TRANSFER;
  if (tx.isGoalSaving) return FLOW_TYPES.GOAL_ALLOCATION;
  if (tx.isDebtPayment) {
    return Number(tx.amt || 0) >= 0
      ? FLOW_TYPES.RECEIVABLE_COLLECTION
      : FLOW_TYPES.DEBT_PAYMENT;
  }
  if (tx.isCommitmentPayment) return FLOW_TYPES.COMMITMENT_PAYMENT;
  return Number(tx.amt || 0) >= 0 ? FLOW_TYPES.INCOME : FLOW_TYPES.EXPENSE;
};

export const normalizeLedgerTransaction = (tx = {}, fallbackScope = SCOPES.PERSONAL) => {
  const flowType = inferFlowType(tx);
  if (flowType === FLOW_TYPES.GOAL_ALLOCATION || tx.isGoalSaving) {
    return {
      ...tx,
      scope: normalizeScope(tx.scope, fallbackScope),
      flowType: FLOW_TYPES.GOAL_ALLOCATION,
      allocationAmount: Math.abs(Number(tx.allocationAmount ?? tx.amt ?? 0)),
      // Goal savings are reserved inside a wallet, not money leaving the wallet.
      amt: 0,
    };
  }
  return {
    ...tx,
    scope: normalizeScope(tx.scope, fallbackScope),
    flowType,
  };
};

// Goal allocations are excluded from income/expense statistics, so their
// ledger value lives in allocationAmount while amt remains zero. Screens and
// exports still need the real signed amount.
export const getTransactionDisplayAmount = (tx = {}) => {
  if (tx.kind === 'transfer') return Math.abs(Number(tx.transferAmount || 0));
  if (tx.isGoalSaving || inferFlowType(tx) === FLOW_TYPES.GOAL_ALLOCATION) {
    return -Math.abs(Number(tx.allocationAmount ?? tx.amt ?? 0));
  }
  return Number(tx.amt || 0);
};

export const isIncomeFlow = (tx = {}) => inferFlowType(tx) === FLOW_TYPES.INCOME;

export const isExpenseFlow = (tx = {}) => (
  [FLOW_TYPES.EXPENSE, FLOW_TYPES.COMMITMENT_PAYMENT].includes(inferFlowType(tx))
);

export const featureForTransaction = (tx = {}) => {
  const flow = inferFlowType(tx);
  if (flow === FLOW_TYPES.DEBT_PAYMENT) return 'debtsOwed';
  if (flow === FLOW_TYPES.DEBT_PROCEEDS) return 'debtsOwed';
  if (flow === FLOW_TYPES.RECEIVABLE_COLLECTION) return 'debtsReceivable';
  if (flow === FLOW_TYPES.RECEIVABLE_CREATED) return 'debtsReceivable';
  if (flow === FLOW_TYPES.GOAL_ALLOCATION) return 'goals';
  if (flow === FLOW_TYPES.COMMITMENT_PAYMENT) return 'commitments';
  if ([FLOW_TYPES.TRANSFER, FLOW_TYPES.OPENING_BALANCE, FLOW_TYPES.BALANCE_ADJUSTMENT].includes(flow)) return 'wallets';
  return null;
};

export const transactionFeatureEnabled = (tx = {}, cfg = {}) => {
  const feature = featureForTransaction(tx);
  return !feature || isFeatureEnabled(cfg, feature);
};



export const filterTransactionsByEnabledFeatures = (items = [], cfg = {}) => {
  const source = Array.isArray(items) ? items : [];
  const modules = getModules(cfg);
  const allTransactionFeaturesEnabled = [
    'wallets',
    'debtsOwed',
    'debtsReceivable',
    'goals',
    'commitments',
  ].every(key => modules[key] !== false);
  if (allTransactionFeaturesEnabled) return source;
  const key = enabledTransactionFeaturesKey(cfg);
  const cachedByFeatures = featureFilterCache.get(source);
  const cached = cachedByFeatures?.get(key);
  if (cached) return cached;
  const filtered = source.filter(item => transactionFeatureEnabled(item, cfg));
  const nextCache = cachedByFeatures || new Map();
  nextCache.set(key, filtered);
  if (!cachedByFeatures) featureFilterCache.set(source, nextCache);
  return filtered;
};

export const filterFeatureEntities = ({
  debts = [],
  goals = [],
  commitments = [],
  cfg = {},
} = {}) => {
  const modules = getModules(cfg);
  return {
    debts: filterByActiveScope(debts, cfg).filter(item => !item.archivedAt).filter(item => (
      item.direction === 'receivable' ? modules.debtsReceivable : modules.debtsOwed
    )),
    goals: modules.goals ? filterByActiveScope(goals, cfg).filter(item => !item.archivedAt && !['released', 'settled'].includes(item.status)) : [],
    commitments: modules.commitments
      ? filterByActiveScope(commitments, cfg).filter(item => !item.archivedAt).filter(item => {
          if (item.linkedType === 'debt') return modules.debtsOwed;
          if (item.linkedType === 'receivable') return modules.debtsReceivable;
          if (item.linkedType === 'goal') return modules.goals;
          return true;
        })
      : [],
  };
};

export const getFeatureDataCount = (key, state = {}) => {
  if (key === 'debtsOwed') return (state.debts || []).filter(item => item.direction !== 'receivable').length;
  if (key === 'debtsReceivable') return (state.debts || []).filter(item => item.direction === 'receivable').length;
  if (key === 'goals') return (state.goals || []).length;
  if (key === 'commitments') return (state.commitments || []).length;
  if (key === 'wallets') return Math.max(0, (state.wallets || []).length - 1);
  if (key === 'budgets') {
    const monthly = state.cfg?.categoryBudgetsByMonth || {};
    const latest = Object.keys(monthly).sort().pop();
    return Object.keys(latest ? (monthly[latest] || {}) : (state.cfg?.categoryBudgets || {})).length;
  }
  if (key === 'recurring') return (state.trans || []).filter(item => item.recurring).length;
  return 0;
};
