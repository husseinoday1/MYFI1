import assert from 'node:assert/strict';
import { monthlyForecast } from '../src/utils/calc.js';
import { buildLeakInsights, detectRecurringCandidates, shouldShowWhyChangedCard, suggestCategoryForText } from '../src/lib/localIntelligence.js';
import { forecastConfidenceLevel, isMonthEligibleForForecast } from '../src/lib/financialForecast.js';

const cats = [
  { id: 'food', label: 'طعام', labelEn: 'Food' },
  { id: 'rent', label: 'إيجار', labelEn: 'Rent' },
  { id: 'other', label: 'أخرى', labelEn: 'Other' },
];

assert.equal(
  suggestCategoryForText('إيجار البيت', cats),
  'rent',
  'Arabic commitment names should infer the rent category',
);
assert.equal(
  suggestCategoryForText('Monthly home rent', cats),
  'rent',
  'English commitment names should infer the rent category',
);

const rentAmount = 2_228_571;
const rentCommitment = {
  id: 'rent-commitment',
  name: 'إيجار البيت',
  amt: rentAmount,
  cat: 'rent',
  linkedType: 'none',
  active: true,
};

const transactions = [
  { id: 'income-aug', amt: 3_400_000, flowType: 'income', cat: 'other', title: 'راتب', dateISO: '2026-08-01' },
  // Legacy/sample transaction: deliberately missing isCommitmentPayment and commitmentId.
  { id: 'rent-aug', amt: -rentAmount, flowType: 'expense', cat: 'rent', title: 'ايجار البيت', dateISO: '2026-08-02' },
  { id: 'food-aug', amt: -100_000, flowType: 'expense', cat: 'food', title: 'طعام', dateISO: '2026-08-03' },
  { id: 'rent-jul', amt: -rentAmount, flowType: 'expense', cat: 'rent', title: 'إيجار البيت', dateISO: '2026-07-02' },
  { id: 'food-jul', amt: -300_000, flowType: 'expense', cat: 'food', title: 'طعام', dateISO: '2026-07-10' },
  { id: 'rent-jun', amt: -rentAmount, flowType: 'expense', cat: 'rent', title: 'إيجار البيت', dateISO: '2026-06-02' },
  { id: 'food-jun', amt: -320_000, flowType: 'expense', cat: 'food', title: 'طعام', dateISO: '2026-06-10' },
  { id: 'rent-may', amt: -rentAmount, flowType: 'expense', cat: 'rent', title: 'إيجار البيت', dateISO: '2026-05-02' },
  { id: 'food-may', amt: -280_000, flowType: 'expense', cat: 'food', title: 'طعام', dateISO: '2026-05-10' },
];

const forecast = monthlyForecast(transactions, new Date('2026-08-04T12:00:00'), [rentCommitment]);
assert.equal(forecast.fixedSpent, rentAmount, 'legacy rent must be recognized as a fixed commitment payment');
assert.equal(forecast.remainingCommitments, 0, 'a matched legacy payment must prevent the same rent being added twice');
assert.ok(forecast.projectedVariable < 1_000_000, 'early-month variable spending should be stabilized by history');
assert.ok(forecast.projectedNet > 0, 'the rent sample must not create the previous multi-million false deficit');

const noHistoryForecast = monthlyForecast([
  { id: 'income', amt: 1_000_000, flowType: 'income', dateISO: '2026-08-01' },
  { id: 'variable', amt: -100_000, flowType: 'expense', cat: 'food', dateISO: '2026-08-02' },
], new Date('2026-08-04T12:00:00'), []);
assert.ok(noHistoryForecast.projectedVariable <= 200_000, 'without history the run-rate fallback must be capped at x2');
assert.equal(noHistoryForecast.forecastBasis, 'capped_run_rate');

const linkedDebtCommitment = {
  id: 'debt-plan',
  name: 'قسط دين',
  amt: 1_000_000,
  cat: 'other',
  linkedType: 'debt',
  linkedId: 'debt-1',
  active: true,
};
const linkedForecast = monthlyForecast([
  { id: 'income', amt: 2_000_000, flowType: 'income', dateISO: '2026-08-01' },
], new Date('2026-08-04T12:00:00'), [linkedDebtCommitment]);
assert.equal(linkedForecast.fixedExpected, 0, 'debt/goal tracker commitments must not be counted as normal operating expenses');

const insights = buildLeakInsights(transactions, cats, new Date('2026-08-04T12:00:00'), [rentCommitment]);
const rentInsight = insights.categoryMovement.find(item => item.id === 'rent');
assert.equal(rentInsight.fixedSpent, rentAmount);
assert.equal(rentInsight.variableSpent, 0);
assert.equal(rentInsight.projectedSpent, rentAmount, 'rent must remain a one-time monthly fixed amount, not a daily run rate');

const sixMonthHistory = [];
for (let month = 2; month <= 8; month += 1) {
  sixMonthHistory.push({
    id: `food-${month}`,
    amt: -100_000,
    flowType: 'expense',
    cat: 'food',
    title: 'Food',
    dateISO: `2026-${String(month).padStart(2, '0')}-10`,
  });
}
const confidenceInsights = buildLeakInsights(sixMonthHistory, cats, new Date('2026-08-15T12:00:00'), []);
assert.equal(confidenceInsights.history.baselineMonthCount, 0, 'months with one variable expense must not be promoted into an analytical baseline');

const eligibleHistory = [];
for (let month = 2; month <= 7; month += 1) {
  for (let item = 0; item < 3; item += 1) {
    eligibleHistory.push({
      id: `eligible-food-${month}-${item}`,
      amt: -(90_000 + item * 10_000),
      flowType: 'expense',
      cat: 'food',
      title: 'Food',
      dateISO: `2026-${String(month).padStart(2, '0')}-${String(8 + item).padStart(2, '0')}`,
    });
  }
}
const eligibleInsights = buildLeakInsights(eligibleHistory, cats, new Date('2026-08-15T12:00:00'), []);
assert.equal(eligibleInsights.history.baselineMonthCount, 6, 'six months with three variable expenses each must remain eligible for the analytical baseline');

// Negative contract #1: transfers, debt payments, and reconciliations never make a month eligible.
assert.equal(isMonthEligibleForForecast([
  { kind: 'transfer', flowType: 'transfer', amt: 100, dateISO: '2026-07-02' },
  { flowType: 'debt_payment', isDebtPayment: true, amt: -100, dateISO: '2026-07-03' },
  { flowType: 'expense', isCommitmentPayment: true, amt: -100, dateISO: '2026-07-04' },
], []), false, 'three non-variable financial movements must not increase forecast confidence');

// Negative contract #2: a category without three eligible historical months cannot get an automatic explanation.
const insufficientWhyChanged = shouldShowWhyChangedCard({
  currentAmount: 185_000,
  referenceAmount: 100_000,
  historicalAvgTxn: null,
  eligibleTransactionCount: 2,
});
assert.deepEqual(insufficientWhyChanged, { show: false, reason: 'insufficient_data', wording: null });

// Negative contract #3: different payees in the same category must never be merged into one recurring pattern.
const separatePayeeCandidates = detectRecurringCandidates([
  { id: 'orig-1', title: 'مطعم الأصالة', titleSource: 'user', cat: 'food', flowType: 'expense', amt: -20_000, dateISO: '2026-05-10' },
  { id: 'orig-2', title: 'مطعم الأصالة', titleSource: 'user', cat: 'food', flowType: 'expense', amt: -20_000, dateISO: '2026-06-10' },
  { id: 'star-1', title: 'ستاربكس', titleSource: 'user', cat: 'food', flowType: 'expense', amt: -20_000, dateISO: '2026-05-12' },
  { id: 'star-2', title: 'ستاربكس', titleSource: 'user', cat: 'food', flowType: 'expense', amt: -20_000, dateISO: '2026-06-12' },
]);
assert.equal(separatePayeeCandidates.some(item => item.count >= 4), false, 'same-category payees must not merge into one recurring candidate');

const recurringEvidence = detectRecurringCandidates([
  { id: 'net-1', title: 'Netflix', titleSource: 'user', cat: 'entertain', flowType: 'expense', amt: -10_000, dateISO: '2026-01-08' },
  { id: 'net-2', title: 'Netflix', titleSource: 'user', cat: 'entertain', flowType: 'expense', amt: -10_500, dateISO: '2026-02-08' },
  { id: 'net-3', title: 'Netflix', titleSource: 'user', cat: 'entertain', flowType: 'expense', amt: -9_900, dateISO: '2026-03-08' },
  { id: 'annual-1', title: 'Domain renewal', titleSource: 'user', cat: 'other', flowType: 'expense', amt: -50_000, dateISO: '2025-08-01' },
  { id: 'annual-2', title: 'Domain renewal', titleSource: 'user', cat: 'other', flowType: 'expense', amt: -50_500, dateISO: '2026-08-01' },
  { id: 'generated-1', title: 'Expense', titleSource: 'generated', cat: 'other', flowType: 'expense', amt: -10_000, dateISO: '2026-01-01' },
  { id: 'generated-2', title: 'Expense', titleSource: 'generated', cat: 'other', flowType: 'expense', amt: -10_000, dateISO: '2026-02-01' },
  { id: 'generated-3', title: 'Expense', titleSource: 'generated', cat: 'other', flowType: 'expense', amt: -10_000, dateISO: '2026-03-01' },
]);
const monthlyNetflix = recurringEvidence.find(item => item.title === 'Netflix');
const annualDomain = recurringEvidence.find(item => item.title === 'Domain renewal');
assert.deepEqual(
  { cadence: monthlyNetflix?.cadence, status: monthlyNetflix?.status, requiresUserConfirmation: monthlyNetflix?.requiresUserConfirmation },
  { cadence: 'monthly', status: 'confirmed', requiresUserConfirmation: false },
  'three consistent monthly user-titled movements may become a confirmed pattern',
);
assert.deepEqual(
  { cadence: annualDomain?.cadence, status: annualDomain?.status, requiresUserConfirmation: annualDomain?.requiresUserConfirmation },
  { cadence: 'annual', status: 'candidate', requiresUserConfirmation: true },
  'two annual movements remain a user-confirmed candidate',
);
assert.equal(recurringEvidence.some(item => item.title === 'Expense'), false, 'generated titles must never form a recurring pattern');

const inconsistentRecurrence = detectRecurringCandidates([
  { id: 'bad-1', title: 'Gym', titleSource: 'user', cat: 'health', flowType: 'expense', amt: -10_000, dateISO: '2026-01-01' },
  { id: 'bad-2', title: 'Gym', titleSource: 'user', cat: 'health', flowType: 'expense', amt: -13_000, dateISO: '2026-02-20' },
  { id: 'bad-3', title: 'Gym', titleSource: 'user', cat: 'health', flowType: 'expense', amt: -10_000, dateISO: '2026-04-01' },
]);
assert.equal(inconsistentRecurrence.length, 0, 'movement dates or amounts outside ±10% cannot become a recurring pattern');

// The two activation paths are distinct: a large absolute event and a meaningful relative change above its noise floor.
assert.equal(shouldShowWhyChangedCard({ currentAmount: 185_000, referenceAmount: 100_000, historicalAvgTxn: 80_000, eligibleTransactionCount: 1 }).reason, 'absolute');
assert.equal(shouldShowWhyChangedCard({ currentAmount: 120_000, referenceAmount: 100_000, historicalAvgTxn: 45_000, eligibleTransactionCount: 2 }).reason, 'relative');

assert.deepEqual(
  [0, 1, 2, 3].map(forecastConfidenceLevel),
  ['none', 'initial', 'supported', 'reading_trend'],
  'forecast confidence must be derived only from eligible historical months',
);

const whyChangedHistory = [...eligibleHistory];
for (let item = 0; item < 3; item += 1) {
  whyChangedHistory.push({
    id: `current-food-${item}`,
    amt: -200_000,
    flowType: 'expense',
    cat: 'food',
    title: 'Food',
    dateISO: `2026-08-${String(5 + item).padStart(2, '0')}`,
  });
}
const explainableInsights = buildLeakInsights(whyChangedHistory, cats, new Date('2026-08-15T12:00:00'), []);
assert.equal(explainableInsights.whyChanged[0]?.id, 'food', 'a significant category change must keep its source category');
assert.equal(explainableInsights.whyChanged[0]?.whyChanged.show, true, 'why-changed output must be evidence-gated before UI rendering');

console.log('forecasting-fix tests passed');
