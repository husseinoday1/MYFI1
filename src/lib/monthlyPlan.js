// Monthly plan model (planning.html frames ١, ٢, ٥).
//
//   flexible = income − committed − goal contributions (+ carry from last period)
//
// Committed and goal lines are pulled from Follow-ups by the caller and passed
// in as already-resolved line items; this module never lets them be typed twice.
// All money is integer minor units of the plan's base currency (financial
// contract clause 3). Rules: docs/04_CURRENT_EVIDENCE/
// MAALFLOW_REDESIGN_R2_PLANNING_FINANCIAL_IMPACT_2026-09-11.md §3–§4.
import { normalizeStartDayHistory, periodKeyForDate, shiftPeriodKey } from './planningPeriods';
import { FLOW_TYPES, inferFlowType } from './modules';
import { toMinorUnits } from './money';

export const MONTHLY_PLAN_VERSION = 1;
export const INCOME_MODES = ['fixed', 'lowestReliable', 'lastPeriod'];
export const REVIEW_CHOICES = ['goal', 'carry', 'keep'];
export const RELIABLE_INCOME_LOOKBACK = 6;

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const toMinorInt = (value) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
};

export const reviewId = (scope, periodKey) => `${scope === 'business' ? 'business' : 'personal'}:${periodKey}`;

// Normalizes a stored plan. `legacyIncomePlan` (cfg.incomeAllocationPlan) only
// seeds the fixed income once, when no plan exists yet; it is never written back.
export function normalizeMonthlyPlan(raw, { baseCurrency = 'IQD', legacyIncomePlan = null } = {}) {
  const source = isObject(raw) ? raw : null;
  if (!source) {
    const legacyIncome = Number(legacyIncomePlan?.income);
    const seeded = Number.isFinite(legacyIncome) && legacyIncome > 0 ? (toMinorUnits(legacyIncome, baseCurrency) ?? 0) : 0;
    return {
      version: MONTHLY_PLAN_VERSION,
      currencyCode: baseCurrency,
      startDayHistory: [],
      incomeMode: 'fixed',
      fixedIncomeMinor: seeded,
      reviews: {},
    };
  }
  const reviews = {};
  for (const [id, review] of Object.entries(isObject(source.reviews) ? source.reviews : {})) {
    if (!isObject(review) || !REVIEW_CHOICES.includes(review.choice)) continue;
    reviews[id] = { ...review, amountMinor: Math.max(0, toMinorInt(review.amountMinor)) };
  }
  return {
    version: MONTHLY_PLAN_VERSION,
    currencyCode: String(source.currencyCode || baseCurrency),
    startDayHistory: normalizeStartDayHistory(source.startDayHistory),
    incomeMode: INCOME_MODES.includes(source.incomeMode) ? source.incomeMode : 'fixed',
    fixedIncomeMinor: Math.max(0, toMinorInt(source.fixedIncomeMinor)),
    reviews,
  };
}

// Base-currency amount of a transaction in minor units. Uses the stored base
// amount (the per-transaction FX snapshot already applied), never a live rate.
// An amount that cannot be represented as a safe integer is corrupt data: fail
// closed instead of counting it as zero.
const baseMinor = (tx, currency) => {
  const minor = toMinorUnits(Math.abs(Number(tx?.baseAmount ?? tx?.amt ?? 0)) || 0, currency);
  if (minor === null) throw new MonthlyPlanError('amount_not_representable');
  return minor;
};

const txDate = (tx) => String(tx?.dateISO || tx?.date || '').slice(0, 10);

// Income received in a period: income flows only. Transfers, debt proceeds,
// collections, opening balances and adjustments are system flows, not income.
export function periodIncomeMinor(transactions, periodKey, history, currency) {
  let total = 0;
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (tx?.deletedAt || tx?.voidedAt) continue;
    if (inferFlowType(tx) !== FLOW_TYPES.INCOME) continue;
    if (periodKeyForDate(txDate(tx), history) !== periodKey) continue;
    total += baseMinor(tx, currency);
  }
  return total;
}

// Discretionary spend in a period: expense flows only. Commitment payments are
// already counted in "committed" and goal allocations in "goals".
export function periodFlexibleSpentMinor(transactions, periodKey, history, currency) {
  let total = 0;
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (tx?.deletedAt || tx?.voidedAt) continue;
    if (inferFlowType(tx) !== FLOW_TYPES.EXPENSE) continue;
    if (periodKeyForDate(txDate(tx), history) !== periodKey) continue;
    total += baseMinor(tx, currency);
  }
  return total;
}

export function resolvePlannedIncome(plan, transactions, currentKey) {
  const { incomeMode, fixedIncomeMinor, startDayHistory: history, currencyCode } = plan;
  if (incomeMode === 'lastPeriod') {
    const sourcePeriod = shiftPeriodKey(currentKey, -1);
    return { mode: incomeMode, amountMinor: periodIncomeMinor(transactions, sourcePeriod, history, currencyCode), sourcePeriod };
  }
  if (incomeMode === 'lowestReliable') {
    let lowest = null;
    for (let i = 1; i <= RELIABLE_INCOME_LOOKBACK; i += 1) {
      const key = shiftPeriodKey(currentKey, -i);
      const amount = periodIncomeMinor(transactions, key, history, currencyCode);
      // A period with no income at all is missing data, not a reliable minimum.
      if (amount > 0 && (lowest === null || amount < lowest.amountMinor)) lowest = { amountMinor: amount, sourcePeriod: key };
    }
    return lowest
      ? { mode: incomeMode, ...lowest }
      : { mode: incomeMode, amountMinor: 0, sourcePeriod: null, reason: 'no_income_history' };
  }
  return { mode: 'fixed', amountMinor: fixedIncomeMinor, sourcePeriod: null };
}

const sumLines = (items) => (Array.isArray(items) ? items : [])
  .reduce((sum, item) => sum + Math.max(0, toMinorInt(item?.amountMinor)), 0);

// The monthly plan equation. Lines are deduplicated by id so a follow-up can
// never be counted twice (e.g. listed as both committed and goal by mistake).
export function computeMonthlyPlan({ incomeMinor = 0, committedItems = [], goalItems = [], carryInMinor = 0 }) {
  const seen = new Set();
  const unique = (items) => (Array.isArray(items) ? items : []).filter((item) => {
    const key = String(item?.id ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const committed = unique(committedItems);
  const goals = unique(goalItems);
  const committedMinor = sumLines(committed);
  const goalsMinor = sumLines(goals);
  const carry = Math.max(0, toMinorInt(carryInMinor));
  const income = Math.max(0, toMinorInt(incomeMinor));
  return {
    incomeMinor: income,
    committedMinor,
    goalsMinor,
    carryInMinor: carry,
    flexibleMinor: income + carry - committedMinor - goalsMinor,
    committedItems: committed,
    goalItems: goals,
  };
}

// Available-to-spend and pace ("أبطأ/أسرع من معتادك"). `usualSpentToDateMinor`
// is the typical discretionary spend at the same point of past periods; null
// when there is not enough history, in which case no pace claim is made.
export function flexibleStatus({ flexibleMinor, spentMinor, usualSpentToDateMinor = null }) {
  const availableMinor = flexibleMinor - spentMinor;
  const paceDeltaMinor = usualSpentToDateMinor === null ? null : spentMinor - usualSpentToDateMinor;
  return {
    availableMinor,
    spentMinor,
    paceDeltaMinor,
    pace: paceDeltaMinor === null ? 'unknown' : paceDeltaMinor > 0 ? 'faster' : paceDeltaMinor < 0 ? 'slower' : 'usual',
  };
}

export const carryInForPeriod = (plan, scope, periodKey) => {
  const review = plan?.reviews?.[reviewId(scope, shiftPeriodKey(periodKey, -1))];
  return review?.choice === 'carry' ? Math.max(0, toMinorInt(review.amountMinor)) : 0;
};

export class MonthlyPlanError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// Records the end-of-period decision (frame ٥). Idempotent per (scope, period):
// recording again replaces the decision, never adds a second carry. A goal
// allocation is created by the caller through the existing goal-saving path;
// its transaction id is stored here so a repeated confirm can see it exists.
export function recordPeriodReview(plan, {
  scope = 'personal',
  periodKey,
  choice,
  remainderMinor,
  amountMinor = remainderMinor,
  currencyCode,
  goalId = null,
  allocationTransactionId = null,
  decidedAt,
}) {
  if (!REVIEW_CHOICES.includes(choice)) throw new MonthlyPlanError('invalid_choice');
  if (!periodKey) throw new MonthlyPlanError('invalid_period');
  if (String(currencyCode || '') !== String(plan.currencyCode || '')) throw new MonthlyPlanError('currency_mismatch');
  const remainder = Math.max(0, toMinorInt(remainderMinor));
  const amount = Math.max(0, toMinorInt(amountMinor));
  if (choice !== 'keep' && amount > remainder) throw new MonthlyPlanError('amount_exceeds_remainder');
  if (choice === 'goal' && !goalId) throw new MonthlyPlanError('goal_required');
  const id = reviewId(scope, periodKey);
  const previous = plan.reviews?.[id] || null;
  if (previous?.choice === 'goal' && previous.allocationTransactionId && choice === 'goal'
      && previous.goalId === goalId && !allocationTransactionId) {
    // A repeated confirm must not lose the link to the allocation already made.
    allocationTransactionId = previous.allocationTransactionId;
  }
  const review = {
    choice,
    amountMinor: choice === 'keep' ? 0 : amount,
    remainderMinor: remainder,
    currencyCode: plan.currencyCode,
    goalId: choice === 'goal' ? goalId : null,
    allocationTransactionId: choice === 'goal' ? allocationTransactionId : null,
    decidedAt: decidedAt || previous?.decidedAt || null,
  };
  return { ...plan, reviews: { ...(plan.reviews || {}), [id]: review } };
}

// Whether a goal allocation still needs to be created for this decision.
export const reviewNeedsAllocation = (plan, scope, periodKey) => {
  const review = plan?.reviews?.[reviewId(scope, periodKey)];
  return review?.choice === 'goal' && !review.allocationTransactionId;
};
