// MYFI — undoing a goal release, and refusing the delete that used to do nothing.
//
// The owner reported: completed a goal, used the completion action to transfer
// the money to a wallet, then deleted every transaction linked to the goal --
// and nothing about the goal changed. That was accurate: goalLifecycle
// short-circuits on status 'released' and never re-reads the amount, so the
// goal kept asserting a settledAmount with no surviving transaction behind it.
//
// The first attempt at this shipped a warning and changed no state. The owner
// rejected it, correctly -- it explained the inconsistency instead of
// preventing it. This is the replacement: the delete is refused, and there is a
// real way back (undoGoalRelease) that re-reserves the wallet or fails loudly.
//
// Runs the actual planner rather than asserting on source text.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

let source = read('src/lib/trackerLifecycle.js');
source = source.replace(/^export const /gm, 'const ');
source += '\nmodule.exports = { planGoalReleaseUndoV1, releasedGoalDeleteNotice, goalLifecycle };\n';
const sandbox = { module: { exports: {} }, exports: {}, Date, Number, Boolean, String, Math, Array, Object, Map, isNaN, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'trackerLifecycle.js' });
const { planGoalReleaseUndoV1: plan, releasedGoalDeleteNotice: notice } = sandbox.module.exports;

const releasedGoal = {
  id: 'goal-1', name: 'Laptop', target: 1000, status: 'released',
  savings: [], cur: 0, settledAmount: 1000,
};
const savingTx = (over = {}) => ({
  isGoalSaving: true, goalId: 'goal-1', savingId: 'sv-1', walletId: 'w1',
  allocationAmount: 600, allocationWalletAmount: 600, ts: 1, dateISO: '2026-01-01', ...over,
});
const twoSavings = [
  savingTx(),
  savingTx({ savingId: 'sv-2', allocationAmount: 400, allocationWalletAmount: 400, ts: 2, dateISO: '2026-02-01' }),
];

// --- the undo plan -----------------------------------------------------------

// Enough available balance: the plan rebuilds what release erased.
{
  const result = plan({
    goal: releasedGoal, transactions: twoSavings,
    walletAvailableById: new Map([['w1', 1000]]),
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.cur, 1000, 'cur is rebuilt from the surviving savings');
  assert.equal(result.savings.length, 2);
  assert.equal(result.status, 'settled', "undo returns to 'settled', not 'active' -- the target really was reached");
  assert.equal(JSON.stringify(result.reReserved), JSON.stringify([{ walletId: 'w1', amount: 1000 }]));
  // Order matters for a rebuilt list the UI will render.
  assert.equal(result.savings.map(s => s.id).join(','), 'sv-1,sv-2', 'savings rebuild in chronological order');
}

// The load-bearing refusal: the money was spent after the release, so
// re-reserving it would drive available balance negative.
{
  const result = plan({
    goal: releasedGoal, transactions: twoSavings,
    walletAvailableById: new Map([['w1', 250]]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'goal_release_undo_insufficient_available');
  assert.equal(JSON.stringify(result.shortfalls), JSON.stringify([{ walletId: 'w1', required: 1000, available: 250, shortfall: 750 }]));
}

// Exactly enough must succeed -- an off-by-one here would refuse a legitimate
// undo at the boundary.
{
  const result = plan({
    goal: releasedGoal, transactions: twoSavings,
    walletAvailableById: new Map([['w1', 1000]]),
  });
  assert.equal(result.ok, true, 'exactly-sufficient available balance must be allowed');
}

// Every shortfall is reported, not just the first, so the owner is not sent
// back around the loop wallet by wallet.
{
  const result = plan({
    goal: releasedGoal,
    transactions: [savingTx(), savingTx({ savingId: 'sv-2', walletId: 'w2', ts: 2 })],
    walletAvailableById: new Map([['w1', 0], ['w2', 0]]),
  });
  assert.equal(result.ok, false);
  assert.equal(result.shortfalls.length, 2, 'both wallets must be named');
}

// An unknown wallet is a refusal, never an assumed-zero or assumed-infinite.
{
  const result = plan({
    goal: releasedGoal, transactions: twoSavings, walletAvailableById: new Map(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'goal_release_undo_insufficient_available');
  assert.equal(result.shortfalls[0].available, null);
}

// Guards: only a released goal, and only with something left to rebuild from.
assert.equal(plan({ goal: { ...releasedGoal, status: 'settled' }, transactions: twoSavings }).reason, 'goal_not_released');
assert.equal(plan({ goal: null, transactions: twoSavings }).reason, 'goal_not_released');
assert.equal(
  plan({ goal: releasedGoal, transactions: [], walletAvailableById: new Map([['w1', 9999]]) }).reason,
  'goal_release_undo_no_surviving_savings',
  'with nothing surviving, undo refuses rather than inventing a total',
);
// Another goal's savings must not be swept in.
assert.equal(
  plan({
    goal: releasedGoal,
    transactions: [savingTx({ goalId: 'goal-2' })],
    walletAvailableById: new Map([['w1', 9999]]),
  }).reason,
  'goal_release_undo_no_surviving_savings',
);

// --- the refusal, and where it is enforced -----------------------------------

assert.ok(notice(savingTx(), releasedGoal), 'a released goal must be recognised');
assert.equal(notice(savingTx(), { ...releasedGoal, status: 'settled' }), null, 'a settled goal stays deletable');

// Enforced in the store, once, at the two places deletion happens -- not in the
// six screens that offer it, any of which could later be added to or missed.
const transactionsSlice = read('src/store/slices/transactionsSlice.js');
for (const entry of ['deleteTrans: async (id)', 'deleteTransMany: async (ids']) {
  const start = transactionsSlice.indexOf(entry);
  assert(start >= 0, `${entry} not found -- update this test`);
  const head = transactionsSlice.slice(start, start + 1400);
  assert(
    head.includes('releasedGoalDeleteNotice'),
    `${entry} must refuse a released goal's transaction`,
  );
}

const trackersSlice = read('src/store/slices/trackersSlice.js');
assert(trackersSlice.includes('undoGoalRelease:'), 'the way back must exist');
assert(
  trackersSlice.includes('planGoalReleaseUndoV1'),
  'undoGoalRelease must use the tested planner rather than re-deriving the rule',
);
// The release transaction must be voided by the undo: it is what makes
// stateFromFinancialV7 re-apply allocationReleased on every hydration, so
// leaving it would make the undo silently revert on the next app start.
const undoStart = trackersSlice.indexOf('undoGoalRelease:');
const undoBody = trackersSlice.slice(undoStart, trackersSlice.indexOf('editGoalSaving:', undoStart));
assert(undoBody.includes('isGoalRelease'), 'undo must clear the release transaction');
assert(undoBody.includes('voidFinancialTransactionsV7'), 'undo must void rather than hard-delete');

console.log('PASS: goal-release-undo');

// The refusal copy points the owner at "Undo transfer", so that action has to
// exist and be reachable -- otherwise the refusal is just a nicer dead end,
// which is what the owner rejected the first time.
const trackersScreen = read('src/screens/TrackersLabScreen.js');
assert(trackersScreen.includes('undoGoalRelease'), 'the screen must call the undo action');
assert(
  trackersScreen.includes("item.source?.status === 'released'"),
  'a released goal must be offered the undo action',
);
for (const key of ['undoReleaseNoSavings', 'undoReleaseShort', 'undoReleaseDone']) {
  assert(trackersScreen.includes(key), `the undo must report ${key}, not fail silently`);
}

// Every screen that offers this delete must refuse rather than confirm, or the
// store's refusal turns into a button that does nothing.
for (const screen of [
  'src/screens/HistoryScreen.js', 'src/screens/HomeScreen.js',
  'src/screens/ArchiveScreen.js', 'src/components/AddTransModal.js',
  'src/screens/TrackersLabScreen.js',
]) {
  const text = read(screen);
  assert(
    text.includes('releasedGoalDeleteRefusalCopy'),
    `${screen} must use the shared refusal copy`,
  );
  assert.equal(
    /won't change its recorded status/.test(text), false,
    `${screen} still carries the old warning copy, which is now false`,
  );
}

console.log('PASS: goal-release-undo (ui wiring)');
