import assert from 'node:assert/strict';
import { monthlyForecast } from '../src/utils/calc.js';
import { buildLeakInsights, suggestCategoryForText } from '../src/lib/localIntelligence.js';

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
assert.equal(confidenceInsights.history.baselineMonthCount, 6, 'insights must retain up to six historical months so high confidence is reachable');

console.log('forecasting-fix tests passed');
