// MYFI — the bug class behind the 800 inflation, checked across every tracker.
//
// The owner asked whether the goal release/undo defect repeats in the other
// tracker types. It had two halves:
//
//   1. looking for a transaction in the in-memory list when that transaction is
//      filtered OUT of it (hiddenFromHistory), so the lookup silently finds
//      nothing after any reload;
//   2. an operation that reports success on an empty set, so half (1) is
//      invisible.
//
// Answer, from tracing every writer and every lookup: it was unique to the goal
// release. Only goal releases and synthetic opening balances are ever hidden;
// debt payments, commitment payments and goal savings are all visible, and each
// of their operations already refuses when the transaction is not found.
//
// This test pins that so it stays true. If someone adds a new hidden
// transaction type, the first assertion fails and this reasoning gets redone.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

// --- 1. which transactions are invisible to the in-memory list ---------------

// stateFromFinancialV7 drops hiddenFromHistory rows, so anything written with
// that flag cannot be found in state.trans after a reload.
const sync = read('src/store/slices/useSyncSlice.js');
assert(
  sync.includes('.filter(item => !item?.hiddenFromHistory)'),
  'the hydration filter this whole class depends on is missing -- re-derive the reasoning',
);

const writers = [];
for (const rel of [
  'src/store/slices/trackersSlice.js',
  'src/lib/financialLedgerV7Repository.js',
  'src/lib/financialLedgerV7Migration.js',
]) {
  const source = read(rel);
  const count = (source.match(/hiddenFromHistory: true/g) || []).length;
  if (count) writers.push([rel, count]);
}
// Goal release (live), archive release, and the two synthetic migration rows.
// A new entry here means a new kind of invisible transaction: check whether any
// operation needs to find it before adding it to this list.
assert.deepEqual(
  writers.map(([rel, count]) => `${path.basename(rel)}:${count}`).sort(),
  ['financialLedgerV7Migration.js:2', 'financialLedgerV7Repository.js:1', 'trackersSlice.js:1'],
  'the set of hidden-transaction writers changed -- re-check every in-memory lookup',
);

// --- 2. the goal release undo must not use the in-memory list ----------------

const trackers = read('src/store/slices/trackersSlice.js');
const undo = trackers.slice(trackers.indexOf('undoGoalRelease'));
const undoBody = undo.slice(0, undo.indexOf('\n  editGoalSaving'));
assert(
  undoBody.includes('findGoalReleaseTransactionIdsV7'),
  'the undo must find its release in the ledger, where hidden rows still exist',
);
assert(
  undoBody.includes('goal_release_undo_release_transaction_missing'),
  'an undo that finds no release must refuse, never report a success that did nothing',
);

// --- 3. every other tracker lookup refuses when it finds nothing -------------

// These look up VISIBLE transactions, so half (1) does not apply to them. What
// must hold is half (2): none of them may proceed on a miss.
const lookups = trackers
  .split('\n')
  .map((line, index) => ({ line, index }))
  .filter(entry => /get\(\)\.trans\.find\(/.test(entry.line));
assert(lookups.length >= 4, 'expected the debt-payment and goal-saving lookups to still exist');
for (const entry of lookups) {
  const after = trackers.split('\n').slice(entry.index, entry.index + 3).join('\n');
  assert(
    /!currentTx\)\s*return false|currentTx \?/.test(after),
    `the lookup at line ${entry.index + 1} must refuse when the transaction is not found`,
  );
}

// --- 4. no bulk delete may report success on an empty set --------------------

const transactions = read('src/store/slices/transactionsSlice.js');
const many = transactions.slice(transactions.indexOf('deleteTransMany'));
assert(
  /if \(!selected\.size\) return false;/.test(many.slice(0, 400)),
  'deleteTransMany must refuse an empty selection rather than reporting success',
);

console.log('PASS: tracker-hidden-transaction-lookups');
