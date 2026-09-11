// Runtime proofs for src/lib/monthlyPlan.js (R2 planning impact review §3–§5).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const target = path.join(root, relative);
  if (cache.has(target)) return cache.get(target).exports;
  const compiled = new Module(target, module);
  compiled.filename = target;
  compiled.paths = Module._nodeModulePaths(path.dirname(target));
  cache.set(target, compiled);
  compiled.require = (request) => {
    if (request.startsWith('.')) {
      const resolved = path.resolve(path.dirname(target), request);
      return load(path.relative(root, fs.existsSync(`${resolved}.js`) ? `${resolved}.js` : resolved));
    }
    return Module._load(request, compiled);
  };
  compiled._compile(babel.transformFileSync(target, {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code, target);
  return compiled.exports;
}

const M = load('src/lib/monthlyPlan.js');
// IQD has three fraction digits (ISO 4217): 1 dinar = 1000 minor units.
const IQD = (major) => major * 1000;
const P = load('src/lib/planningPeriods.js');

// ---- normalization / legacy seed -------------------------------------------
const fresh = M.normalizeMonthlyPlan(undefined, { baseCurrency: 'IQD', legacyIncomePlan: { income: 1500000 } });
assert.equal(fresh.fixedIncomeMinor, IQD(1500000), 'legacy income plan seeds fixed income once');
assert.deepEqual(fresh.startDayHistory, [], 'upgrading users keep day-1 periods');
const kept = M.normalizeMonthlyPlan({ ...fresh, fixedIncomeMinor: 900000 }, { baseCurrency: 'IQD', legacyIncomePlan: { income: 1500000 } });
assert.equal(kept.fixedIncomeMinor, 900000, 'an existing plan is never re-seeded from the legacy plan');
assert.equal(M.normalizeMonthlyPlan({ incomeMode: 'bogus', fixedIncomeMinor: -5 }).incomeMode, 'fixed');
assert.equal(M.normalizeMonthlyPlan({ fixedIncomeMinor: -5 }).fixedIncomeMinor, 0);
const usdFresh = M.normalizeMonthlyPlan(undefined, { baseCurrency: 'USD', legacyIncomePlan: { income: 12.5 } });
assert.equal(usdFresh.fixedIncomeMinor, 1250, 'minor units follow the base currency');

// ---- plan equation ---------------------------------------------------------
const plan = M.computeMonthlyPlan({
  incomeMinor: 1500000,
  committedItems: [{ id: 'rent', amountMinor: 250000 }, { id: 'car', amountMinor: 200000 }, { id: 'shop-debt', amountMinor: 200000 }],
  goalItems: [{ id: 'trip', amountMinor: 80000 }, { id: 'emergency', amountMinor: 100000 }, { id: 'ramadan', amountMinor: 100000 }],
});
assert.equal(plan.committedMinor, 650000);
assert.equal(plan.goalsMinor, 280000);
assert.equal(plan.flexibleMinor, 570000, 'board example: 1,500,000 − 650,000 − 280,000 = 570,000');
const dup = M.computeMonthlyPlan({
  incomeMinor: 1000,
  committedItems: [{ id: 'x', amountMinor: 100 }, { id: 'x', amountMinor: 100 }],
  goalItems: [{ id: 'x', amountMinor: 100 }],
});
assert.equal(dup.committedMinor + dup.goalsMinor, 100, 'a follow-up is never counted twice');

// ---- income / spend from transactions --------------------------------------
const pay25 = [{ effectivePeriod: '2000-01', startDay: 25 }];
const tx = [
  { id: 'salary-aug', amt: 1500000, dateISO: '2026-07-25', flowType: 'income' },
  { id: 'salary-sep', amt: 1180000, dateISO: '2026-08-25', flowType: 'income' },
  { id: 'freelance', amt: 200000, dateISO: '2026-09-02', flowType: 'income' },
  { id: 'food', amt: -25000, dateISO: '2026-09-03', flowType: 'expense' },
  { id: 'rent', amt: -250000, dateISO: '2026-09-01', flowType: 'commitment_payment' },
  { id: 'transfer-in', amt: 999999, dateISO: '2026-09-04', flowType: 'transfer' },
  { id: 'proceeds', amt: 500000, dateISO: '2026-09-05', flowType: 'debt_proceeds' },
  { id: 'collection', amt: 50000, dateISO: '2026-09-06', flowType: 'receivable_collection' },
  { id: 'opening', amt: 700000, dateISO: '2026-09-07', flowType: 'opening_balance' },
  { id: 'adjust', amt: 1000, dateISO: '2026-09-08', flowType: 'balance_adjustment' },
  { id: 'goal', amt: 0, allocationAmount: 80000, isGoalSaving: true, dateISO: '2026-09-09' },
  { id: 'fx', amt: 196500, baseAmount: 196500, walletAmount: 150, walletCurrency: 'USD', dateISO: '2026-09-10', flowType: 'income' },
  { id: 'deleted', amt: 777, dateISO: '2026-09-11', flowType: 'income', deletedAt: '2026-09-12' },
];
assert.equal(M.periodIncomeMinor(tx, '2026-09', pay25, 'IQD'), IQD(1180000 + 200000 + 196500),
  'only income flows count; system flows and deleted rows never do; FX uses the stored base amount');
assert.equal(M.periodFlexibleSpentMinor(tx, '2026-09', pay25, 'IQD'), IQD(25000), 'commitment payments and goal allocations are not flexible spend');

const incomePlan = { ...fresh, startDayHistory: pay25 };
assert.deepEqual(M.resolvePlannedIncome({ ...incomePlan, incomeMode: 'lastPeriod' }, tx, '2026-09'),
  { mode: 'lastPeriod', amountMinor: IQD(1500000), sourcePeriod: '2026-08' });
assert.deepEqual(M.resolvePlannedIncome({ ...incomePlan, incomeMode: 'lowestReliable' }, tx, '2026-10'),
  { mode: 'lowestReliable', amountMinor: IQD(1500000), sourcePeriod: '2026-08' },
  'lowest reliable skips empty periods and picks the lowest: Aug 1,500,000 < Sep 1,576,500');
assert.equal(M.resolvePlannedIncome({ ...incomePlan, incomeMode: 'lowestReliable' }, [], '2026-10').reason, 'no_income_history');
assert.equal(M.resolvePlannedIncome(incomePlan, tx, '2026-09').amountMinor, IQD(1500000), 'fixed mode uses the typed amount');

// ---- pace ------------------------------------------------------------------
assert.deepEqual(M.flexibleStatus({ flexibleMinor: 570000, spentMinor: 150000, usualSpentToDateMinor: 217000 }),
  { availableMinor: 420000, spentMinor: 150000, paceDeltaMinor: -67000, pace: 'slower' });
assert.equal(M.flexibleStatus({ flexibleMinor: 1, spentMinor: 0 }).pace, 'unknown', 'no pace claim without history');

// ---- end-of-period review: idempotent, twice in sequence -------------------
let reviewed = M.recordPeriodReview(fresh, {
  periodKey: '2026-08', choice: 'carry', remainderMinor: 60000, currencyCode: 'IQD', decidedAt: '2026-08-25T08:00:00Z',
});
reviewed = M.recordPeriodReview(reviewed, {
  periodKey: '2026-08', choice: 'carry', remainderMinor: 60000, currencyCode: 'IQD', decidedAt: '2026-08-25T08:05:00Z',
});
assert.equal(Object.keys(reviewed.reviews).length, 1, 'recording twice keeps one decision');
assert.equal(M.carryInForPeriod(reviewed, 'personal', '2026-09'), 60000, 'one carry, not two');
assert.equal(M.carryInForPeriod(reviewed, 'business', '2026-09'), 0, 'scopes do not share decisions');
const withCarry = M.computeMonthlyPlan({ incomeMinor: 1500000, committedItems: [], goalItems: [], carryInMinor: M.carryInForPeriod(reviewed, 'personal', '2026-09') });
assert.equal(withCarry.flexibleMinor, 1560000, 'carry raises next period flexible without any posting');

// Switching the decision replaces it: the carry disappears.
reviewed = M.recordPeriodReview(reviewed, { periodKey: '2026-08', choice: 'keep', remainderMinor: 60000, currencyCode: 'IQD' });
assert.equal(M.carryInForPeriod(reviewed, 'personal', '2026-09'), 0);

// Goal choice: allocation created once; repeated confirm keeps the link.
let goalReview = M.recordPeriodReview(fresh, { periodKey: '2026-08', choice: 'goal', goalId: 'trip', remainderMinor: 60000, currencyCode: 'IQD' });
assert.equal(M.reviewNeedsAllocation(goalReview, 'personal', '2026-08'), true);
goalReview = M.recordPeriodReview(goalReview, { periodKey: '2026-08', choice: 'goal', goalId: 'trip', remainderMinor: 60000, currencyCode: 'IQD', allocationTransactionId: 'tx-alloc-1' });
assert.equal(M.reviewNeedsAllocation(goalReview, 'personal', '2026-08'), false);
goalReview = M.recordPeriodReview(goalReview, { periodKey: '2026-08', choice: 'goal', goalId: 'trip', remainderMinor: 60000, currencyCode: 'IQD' });
assert.equal(goalReview.reviews['personal:2026-08'].allocationTransactionId, 'tx-alloc-1', 'second confirm does not ask for a second allocation');
assert.equal(M.carryInForPeriod(goalReview, 'personal', '2026-09'), 0, 'moving to a goal never carries');

// Guards fail closed.
const reason = (fn) => { try { fn(); } catch (error) { return error.reason; } return null; };
assert.equal(reason(() => M.recordPeriodReview(fresh, { periodKey: '2026-08', choice: 'carry', remainderMinor: 100, amountMinor: 101, currencyCode: 'IQD' })), 'amount_exceeds_remainder');
assert.equal(reason(() => M.recordPeriodReview(fresh, { periodKey: '2026-08', choice: 'carry', remainderMinor: 100, currencyCode: 'USD' })), 'currency_mismatch');
assert.equal(reason(() => M.recordPeriodReview(fresh, { periodKey: '2026-08', choice: 'goal', remainderMinor: 100, currencyCode: 'IQD' })), 'goal_required');
assert.equal(reason(() => M.recordPeriodReview(fresh, { periodKey: '2026-08', choice: 'auto', remainderMinor: 100, currencyCode: 'IQD' })), 'invalid_choice');

// Carry lookup follows period keys across a year boundary.
const dec = M.recordPeriodReview(fresh, { periodKey: '2026-12', choice: 'carry', remainderMinor: 5, currencyCode: 'IQD' });
assert.equal(M.carryInForPeriod(dec, 'personal', P.shiftPeriodKey('2026-12', 1)), 5);

console.log('monthly plan: equation, income modes, pace and idempotent period review pass');
