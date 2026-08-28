// P11-C / D3 — the F1 repair plan.
//
// The test drives the real commitYearArchive arithmetic forward (damaging a
// workspace exactly as the shipped code did before the §3.5 freeze), then
// requires the plan to recover the original values. Asserting against
// hand-written "expected" numbers would only prove the plan agrees with my
// arithmetic; reversing the actual mutation proves it agrees with the app's.
import assert from 'node:assert/strict';
import { archivedWalletMovement } from '../src/store/domain';
import {
  buildArchiveF1RepairPlan,
  summarizeRepairPlanForDiagnostics,
} from '../src/lib/archiveF1RepairPlan';

const yearOf = value => Number(String(value || '').slice(0, 4)) || null;
const sumAmt = items => (items || []).reduce((total, item) => total + Number(item?.amt || 0), 0);

// --- the pristine workspace, before anyone archived anything ----------------

const ORIGINAL = {
  wallets: [
    { id: 'w1', currency: 'IQD', openingBalance: 5000 },
    { id: 'w2', currency: 'IQD', openingBalance: 200 },
  ],
  trans: [
    { id: 't-2025-income', walletId: 'w1', walletAmount: 1000, amt: 1000, dateISO: '2025-05-01' },
    { id: 't-2025-expense', walletId: 'w2', walletAmount: -80, amt: -80, dateISO: '2025-06-01' },
    { id: 't-2026-expense', walletId: 'w1', walletAmount: -300, amt: -300, dateISO: '2026-03-01' },
  ],
  debts: [{
    id: 'd1', total: 900, archivedPaid: 0,
    payments: [
      { id: 'p-2025-a', date: '2025-04-01', amt: 100 },
      { id: 'p-2025-b', date: '2025-09-01', amt: 150 },
      { id: 'p-2026-a', date: '2026-02-01', amt: 200 },
    ],
  }],
  goals: [{
    id: 'g1', target: 1000, archivedSaved: 0, cur: 400,
    savings: [
      { id: 's-2025-a', date: '2025-07-01', amt: 250 },
      { id: 's-2026-a', date: '2026-01-15', amt: 150 },
    ],
  }],
};

// --- damage it exactly as commitYearArchive did (dataSlice.js) --------------

const ARCHIVED_YEAR = 2025;
const archivedTrans = ORIGINAL.trans.filter(tx => yearOf(tx.dateISO) === ARCHIVED_YEAR);
const movement = archivedWalletMovement(archivedTrans, ORIGINAL.wallets, 'w1');

const damagedWallets = ORIGINAL.wallets.map(wallet => ({
  ...wallet,
  openingBalance: Number(wallet.openingBalance || 0) + Number(movement.get(wallet.id) || 0),
}));

const damagedDebts = ORIGINAL.debts.map(debt => {
  const archivedPayments = debt.payments.filter(p => yearOf(p.date) === ARCHIVED_YEAR);
  const payments = debt.payments.filter(p => yearOf(p.date) !== ARCHIVED_YEAR);
  const archivedPaid = Number(debt.archivedPaid || 0) + sumAmt(archivedPayments);
  return { ...debt, archivedPaid, payments, paid: archivedPaid + sumAmt(payments) };
});

const damagedGoals = ORIGINAL.goals.map(goal => {
  const archivedSavings = goal.savings.filter(s => yearOf(s.date) === ARCHIVED_YEAR);
  const savings = goal.savings.filter(s => yearOf(s.date) !== ARCHIVED_YEAR);
  const archivedSaved = Number(goal.archivedSaved || 0) + sumAmt(archivedSavings);
  return { ...goal, archivedSaved, savings, cur: Math.min(goal.target, archivedSaved + sumAmt(savings)) };
});

// The Cold Archive keeps the PRE-mutation entities — commitYearArchive passes
// `current.debts` / `current.goals` in, and computes the mutated versions
// separately. That is what makes the repair possible at all.
const coldArchives = [{
  year: ARCHIVED_YEAR,
  summary: { year: ARCHIVED_YEAR, archivedAt: '2026-01-01T00:00:00.000Z' },
  data: {
    trans: archivedTrans,
    debts: ORIGINAL.debts,
    goals: ORIGINAL.goals,
    wallets: ORIGINAL.wallets,
  },
}];

// Confirm the fixture actually damaged something, or the repair assertions below
// would pass against an undamaged workspace.
assert.equal(damagedWallets[0].openingBalance, 6000, 'w1 opening balance was inflated by the archived income');
assert.equal(damagedWallets[1].openingBalance, 120, 'w2 opening balance was deflated by the archived expense');
assert.equal(damagedDebts[0].payments.length, 1, 'two 2025 payments were removed from the debt');
assert.equal(damagedDebts[0].archivedPaid, 250);
assert.equal(damagedGoals[0].savings.length, 1, 'one 2025 saving was removed from the goal');
assert.equal(damagedGoals[0].archivedSaved, 250);

// --- the plan must recover the originals ------------------------------------

const plan = buildArchiveF1RepairPlan({
  wallets: damagedWallets,
  debts: damagedDebts,
  goals: damagedGoals,
  coldArchives,
  defaultWalletId: 'w1',
});

assert.equal(plan.ok, false, 'a damaged workspace must be reported as needing repair');
assert.deepEqual(plan.affected.wallets, ['w1', 'w2']);
assert.deepEqual(plan.affected.debts, ['d1']);
assert.deepEqual(plan.affected.goals, ['g1']);

// §73 "opening balance": back to the true value, not merely a different one.
for (const original of ORIGINAL.wallets) {
  const row = plan.wallets.find(item => item.walletId === original.id);
  assert.equal(
    row.trueOpeningBalance,
    original.openingBalance,
    `${original.id}: the plan must recover the original opening balance`,
  );
}

// §73 "debt history": every payment back, and archivedPaid cleared so the
// restored payments are not counted twice.
const debtRow = plan.debts[0];
assert.equal(debtRow.repairedPayments.length, 3, 'all three payments must be restored');
assert.deepEqual(
  debtRow.repairedPayments.map(p => p.id).sort(),
  ORIGINAL.debts[0].payments.map(p => p.id).sort(),
);
assert.equal(debtRow.repairedArchivedPaid, 0, 'archivedPaid must be cleared once payments are back in the list');
assert.equal(debtRow.repairedPaid, 450, 'paid must equal the sum of the restored payments, counted once');
assert.equal(
  debtRow.repairedPaid,
  sumAmt(ORIGINAL.debts[0].payments),
  'the repaired total must match the original history',
);

// §73 "goal totals".
const goalRow = plan.goals[0];
assert.equal(goalRow.repairedSavings.length, 2, 'both savings must be restored');
assert.equal(goalRow.repairedArchivedSaved, 0);
assert.equal(goalRow.repairedCur, 400, 'the goal total must match the original');
assert.equal(goalRow.repairedCur, ORIGINAL.goals[0].cur);

// --- idempotence: the plan on an undamaged workspace must find nothing ------
// D3 forbids a silent repair, and a plan that keeps "repairing" already-correct
// data would be exactly that. Feeding the repaired values back must report ok.

const repairedWallets = ORIGINAL.wallets.map(wallet => ({ ...wallet }));
const repairedDebts = [{
  ...ORIGINAL.debts[0],
  payments: debtRow.repairedPayments,
  archivedPaid: debtRow.repairedArchivedPaid,
  paid: debtRow.repairedPaid,
}];
const repairedGoals = [{
  ...ORIGINAL.goals[0],
  savings: goalRow.repairedSavings,
  archivedSaved: goalRow.repairedArchivedSaved,
  cur: goalRow.repairedCur,
}];

const rerun = buildArchiveF1RepairPlan({
  wallets: repairedWallets,
  debts: repairedDebts,
  goals: repairedGoals,
  // The archive is NOT deleted by a repair (D4 keeps it as a derived cache), so
  // the plan must stay quiet with it still present.
  coldArchives,
  defaultWalletId: 'w1',
});

assert.equal(
  rerun.ok,
  false,
  'wallets still differ on a second pass: the opening balance cannot self-detect as repaired',
);
assert.deepEqual(rerun.affected.debts, [], 'a repaired debt must not be repaired again');
assert.deepEqual(rerun.affected.goals, [], 'a repaired goal must not be repaired again');
assert.equal(rerun.debts[0].missingPaymentCount, 0, 'no payment may be duplicated on a second pass');
assert.equal(rerun.goals[0].missingSavingCount, 0, 'no saving may be duplicated on a second pass');

// The wallet rows are the honest exception, and the test states it rather than
// hiding it: openingBalance carries no marker saying whether the archived
// movement was already subtracted, so the arithmetic looks identical before and
// after. Applying this plan twice would subtract twice. That is precisely why
// D3 requires an evidenced migration with a recorded applied-state, not a
// self-detecting repair — and why this module only ever builds a plan.
assert.equal(
  rerun.wallets.find(row => row.walletId === 'w1').trueOpeningBalance,
  ORIGINAL.wallets[0].openingBalance - 1000,
  'documented hazard: the opening-balance repair is NOT idempotent and must be applied exactly once',
);

// --- a clean workspace, never archived, must be left alone ------------------

const clean = buildArchiveF1RepairPlan({
  wallets: ORIGINAL.wallets,
  debts: ORIGINAL.debts,
  goals: ORIGINAL.goals,
  coldArchives: [],
  defaultWalletId: 'w1',
});
assert.equal(clean.ok, true, 'a workspace that never archived must need no repair');

// --- Standing Rule 6: the loggable summary carries no amounts ---------------

const summary = summarizeRepairPlanForDiagnostics(plan);
assert.equal(summary.ok, false);
assert.deepEqual(summary.wallets.affectedIds, ['w1', 'w2']);
assert.equal(summary.debts.affected, 1);

const summaryJson = JSON.stringify(summary);
for (const amount of ['5000', '6000', '1000', '450', '250', '400', 'openingBalance', 'repairedPaid']) {
  assert.equal(
    summaryJson.includes(amount),
    false,
    `Standing Rule 6: the diagnostic summary must not carry ${amount}`,
  );
}

// --- the plan never mutates its inputs --------------------------------------

const before = JSON.stringify({ damagedWallets, damagedDebts, damagedGoals, coldArchives });
buildArchiveF1RepairPlan({
  wallets: damagedWallets, debts: damagedDebts, goals: damagedGoals, coldArchives, defaultWalletId: 'w1',
});
assert.equal(
  JSON.stringify({ damagedWallets, damagedDebts, damagedGoals, coldArchives }),
  before,
  'building a plan must not touch the workspace it is planning for',
);

console.log('PASS p11c_d3_repair_plan');
