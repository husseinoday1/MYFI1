// Ledger-scanning half of the monthly plan model (see src/lib/monthlyPlan.js
// for the pure model/normalization half, and why the split exists — this file
// needs transaction flow-type semantics from modules.js, which monthlyPlan.js
// must not depend on because constants.js imports monthlyPlan.js).
import { periodRange, shiftPeriodKey } from './planningPeriods';
import { FLOW_TYPES, inferFlowType } from './modules';
import { toMinorUnits } from './money';
import { MonthlyPlanError } from './monthlyPlan';

export const RELIABLE_INCOME_LOOKBACK = 6;

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

// Sums transactions matching `flowTypes` whose date falls in `periodKey`.
// The period's [startISO, endISO] is resolved once per call, then each
// transaction is a plain ISO-string comparison — periodKeyForDate (which tries
// up to 3 candidate periods and re-derives ranges each time) would otherwise
// run per transaction. Measured: ~700ms for 50K rows before this change: the
// per-row cost the Phase 15 root-cause work found is a JS-thread-block risk
// this module must not reintroduce (see run-monthly-plan.cjs perf assertion).
function sumFlowInPeriod(transactions, periodKey, history, currency, flowTypes) {
  const { startISO, endISO } = periodRange(periodKey, history);
  let total = 0;
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    if (tx?.deletedAt || tx?.voidedAt) continue;
    if (!flowTypes.includes(inferFlowType(tx))) continue;
    const date = txDate(tx);
    if (date < startISO || date > endISO) continue;
    total += baseMinor(tx, currency);
  }
  return total;
}

// Income received in a period: income flows only. Transfers, debt proceeds,
// collections, opening balances and adjustments are system flows, not income.
export const periodIncomeMinor = (transactions, periodKey, history, currency) => (
  sumFlowInPeriod(transactions, periodKey, history, currency, [FLOW_TYPES.INCOME])
);

// Discretionary spend in a period: expense flows only. Commitment payments are
// already counted in "committed" and goal allocations in "goals".
export const periodFlexibleSpentMinor = (transactions, periodKey, history, currency) => (
  sumFlowInPeriod(transactions, periodKey, history, currency, [FLOW_TYPES.EXPENSE])
);

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
