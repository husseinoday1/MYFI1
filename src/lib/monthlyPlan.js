// Monthly plan model (planning.html frames ١, ٢, ٥).
//
//   flexible = income − committed − goal contributions (+ carry from last period)
//
// Committed and goal lines are pulled from Follow-ups by the caller and passed
// in as already-resolved line items; this module never lets them be typed twice.
// All money is integer minor units of the plan's base currency (financial
// contract clause 3). Rules: docs/04_CURRENT_EVIDENCE/
// MAALFLOW_REDESIGN_R2_PLANNING_FINANCIAL_IMPACT_2026-09-11.md §3–§4.
//
// This file is deliberately free of any dependency on modules.js (transaction
// flow-type semantics) — normalizeMonthlyPlan is called from src/lib/constants.js
// (normalizeCfg), and constants.js is imported by nearly everything, including
// modules.js itself; importing modules.js from here would make that a require
// cycle. Ledger-scanning functions that need FLOW_TYPES/inferFlowType live in
// src/lib/monthlyPlanLedger.js instead, which has no such constraint.
import { normalizeStartDayHistory, shiftPeriodKey } from './planningPeriods';
import { toMinorUnits } from './money';

export const MONTHLY_PLAN_VERSION = 1;
export const INCOME_MODES = ['fixed', 'lowestReliable', 'lastPeriod'];
export const REVIEW_CHOICES = ['goal', 'carry', 'keep'];

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const toMinorInt = (value) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
};

export const reviewId = (scope, periodKey) => `${scope === 'business' ? 'business' : 'personal'}:${periodKey}`;

export class MonthlyPlanError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

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
  const resolvedCurrency = String(source.currencyCode || baseCurrency);
  // A review reaching this function may not have come from recordPeriodReview's
  // own guards — a restored backup, or (once cross-device sync exists) a
  // remote copy — so every field is re-validated here, not just spread
  // through. Every field this rebuilds mirrors what recordPeriodReview itself
  // writes, so a value that passed through there once keeps its exact shape.
  const reviews = {};
  for (const [id, review] of Object.entries(isObject(source.reviews) ? source.reviews : {})) {
    if (!isObject(review) || !REVIEW_CHOICES.includes(review.choice)) continue;
    const choice = review.choice;
    const remainderMinor = Math.max(0, toMinorInt(review.remainderMinor));
    const amountMinor = choice === 'keep' ? 0 : Math.min(remainderMinor, Math.max(0, toMinorInt(review.amountMinor)));
    const goalId = choice === 'goal' ? (String(review.goalId || '').trim() || null) : null;
    reviews[id] = {
      choice,
      amountMinor,
      remainderMinor,
      // A review is always denominated in the plan's own currency
      // (recordPeriodReview refuses any other); a stored value that disagrees
      // is corrupt, not a second currency to carry forward.
      currencyCode: resolvedCurrency,
      goalId,
      allocationTransactionId: goalId ? (String(review.allocationTransactionId || '').trim() || null) : null,
      decidedAt: review.decidedAt ? String(review.decidedAt) : null,
    };
  }
  return {
    version: MONTHLY_PLAN_VERSION,
    currencyCode: resolvedCurrency,
    startDayHistory: normalizeStartDayHistory(source.startDayHistory),
    incomeMode: INCOME_MODES.includes(source.incomeMode) ? source.incomeMode : 'fixed',
    fixedIncomeMinor: Math.max(0, toMinorInt(source.fixedIncomeMinor)),
    reviews,
  };
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

// Records the end-of-period decision (frame ٥). Idempotent per (scope, period)
// as long as the choice and amount are unchanged: recording again replaces the
// decision in place, never adds a second carry.
//
// Once a decision has produced a real allocation (choice 'goal' with
// allocationTransactionId set), it is locked: this module has no way to
// reverse the ledger allocation it already caused, so silently switching the
// decision away would either double-count the remainder (carry the same money
// that was already moved into the goal) or orphan the allocation (switch to a
// different goal while the old one keeps the money). The caller must void the
// existing allocation transaction first, then call clearPeriodReview with the
// id it voided, before recording a different decision for that period.
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
  if (previous?.choice === 'goal' && previous.allocationTransactionId) {
    const sameDecision = choice === 'goal' && previous.goalId === goalId && previous.amountMinor === amount;
    if (!sameDecision) throw new MonthlyPlanError('allocation_locked');
    // A repeated confirm of the same decision must not lose the allocation link.
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

// Removes a locked decision so a different one can be recorded. The caller
// must pass the exact allocation transaction id it already voided in the
// ledger; a mismatch (including "there is nothing to clear") fails closed
// instead of silently unlocking a decision the caller has not actually reversed.
export function clearPeriodReview(plan, scope, periodKey, { voidedAllocationTransactionId } = {}) {
  const id = reviewId(scope, periodKey);
  const previous = plan.reviews?.[id] || null;
  if (!previous) throw new MonthlyPlanError('no_review_to_clear');
  if (previous.choice === 'goal' && previous.allocationTransactionId) {
    if (!voidedAllocationTransactionId || voidedAllocationTransactionId !== previous.allocationTransactionId) {
      throw new MonthlyPlanError('allocation_not_voided');
    }
  }
  const { [id]: _removed, ...rest } = plan.reviews || {};
  return { ...plan, reviews: rest };
}

// Whether a goal allocation still needs to be created for this decision.
export const reviewNeedsAllocation = (plan, scope, periodKey) => {
  const review = plan?.reviews?.[reviewId(scope, periodKey)];
  return review?.choice === 'goal' && !review.allocationTransactionId;
};
