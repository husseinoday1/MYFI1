// MaalFlow — the release/undo cycle that inflated a wallet by 800.
//
// Reported from a real device 2026-09-06: a 200 goal, released and undone four
// times, left the wallet 800 higher, and the released amount never came back
// out of the available balance.
//
// Cause, and it was mine: a goal release is written with hiddenFromHistory, and
// stateFromFinancialV7 filters those out of the in-memory list. The undo looked
// for the release in state.trans, found nothing after any reload, voided
// nothing -- and reported success. Its reserved posting stayed in the ledger,
// and every repeat release added another.
//
// So this test does the one thing the old code could not: it asks the LEDGER.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8')
  .replace(/\r\n/g, '\n');

// Slice the real lookup rather than reimplementing it.
const start = source.indexOf('export const findGoalReleaseTransactionIdsV7');
assert(start >= 0, 'findGoalReleaseTransactionIdsV7 is missing -- update this test');
const end = source.indexOf('\nexport const', start + 10);
const slice = source.slice(start, end).replace(/^export const /gm, 'const ');

const sandbox = {
  module: { exports: {} }, exports: {}, String, Number, console,
  financialLedgerV7Supported: () => true,
  getLedgerDb: async () => sandbox.__db,
  ensureFinancialLedgerV7: async () => true,
};
vm.createContext(sandbox);
vm.runInContext(`${slice}\nmodule.exports = { findGoalReleaseTransactionIdsV7 };`, sandbox, {
  filename: 'findGoalRelease.js',
});
const { findGoalReleaseTransactionIdsV7: findReleases } = sandbox.module.exports;

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE ledger_financial_transactions_v7 (
  namespace TEXT, id TEXT, kind TEXT, status TEXT, deleted_at TEXT, payload_json TEXT);`);
sandbox.__db = {
  getAllAsync: async (sql, ...params) => db.prepare(String(sql)).all(...params),
};

const NS = 'user:goal-undo';
const GOAL = 'goal-1';
const add = (id, { kind = 'goal_release', goalId = GOAL, hidden = true, deleted = null, isRelease = true } = {}) =>
  db.prepare('INSERT INTO ledger_financial_transactions_v7 VALUES (?,?,?,?,?,?)').run(
    NS, id, kind, 'posted', deleted,
    JSON.stringify({ goalId, isGoalRelease: isRelease, hiddenFromHistory: hidden }),
  );

(async () => {
  // The whole point: a hidden release is still found, because this reads the
  // ledger instead of the filtered in-memory list.
  add('rel-1');
  {
    const found = await findReleases({ namespace: NS, goalId: GOAL, database: sandbox.__db });
    assert.equal(found.ok, true);
    assert.deepEqual(found.ids, ['rel-1'], 'a hiddenFromHistory release must still be found');
  }

  // The reported scenario: four cycles left four releases behind. All four must
  // be found, or the undo keeps leaving reserved postings in the ledger.
  add('rel-2'); add('rel-3'); add('rel-4');
  {
    const found = await findReleases({ namespace: NS, goalId: GOAL, database: sandbox.__db });
    assert.deepEqual(found.ids, ['rel-1', 'rel-2', 'rel-3', 'rel-4'],
      'every un-voided release must be found, not just the newest');
  }

  // Already-voided releases must not be voided again -- re-voiding would write
  // a second tombstone for the same row.
  db.prepare('UPDATE ledger_financial_transactions_v7 SET deleted_at=? WHERE id IN (?,?)')
    .run('2026-09-06T00:00:00.000Z', 'rel-1', 'rel-2');
  {
    const found = await findReleases({ namespace: NS, goalId: GOAL, database: sandbox.__db });
    assert.deepEqual(found.ids, ['rel-3', 'rel-4'], 'voided releases must be excluded');
  }

  // Another goal's release must never be swept into this undo.
  add('other-goal-rel', { goalId: 'goal-2' });
  {
    const found = await findReleases({ namespace: NS, goalId: GOAL, database: sandbox.__db });
    assert.equal(found.ids.includes('other-goal-rel'), false, 'another goal must not be touched');
  }

  // An ordinary saving transaction is not a release and must not be voided by
  // the undo -- those are the rows the goal is rebuilt FROM.
  add('saving-1', { kind: 'goal_allocation', isRelease: false, hidden: false });
  {
    const found = await findReleases({ namespace: NS, goalId: GOAL, database: sandbox.__db });
    assert.equal(found.ids.includes('saving-1'), false, 'a saving must never be treated as a release');
  }

  // Nothing to undo reports empty rather than throwing; the store turns that
  // into an explicit refusal instead of a silent success.
  {
    const found = await findReleases({ namespace: NS, goalId: 'goal-none', database: sandbox.__db });
    assert.equal(found.ok, true);
    assert.deepEqual(found.ids, []);
  }
  assert.equal((await findReleases({ namespace: NS, database: sandbox.__db })).ok, false,
    'a missing goal id must be refused, not treated as "all goals"');

  // --- the store must refuse rather than silently succeed -------------------

  const slice2 = fs.readFileSync(path.join(root, 'src/store/slices/trackersSlice.js'), 'utf8');
  assert(
    slice2.includes('findGoalReleaseTransactionIdsV7'),
    'the undo must look the releases up in the ledger, not in state.trans',
  );
  assert(
    slice2.includes('goal_release_undo_release_transaction_missing'),
    'an undo that finds no release must refuse, not report success',
  );
  const undo = slice2.slice(slice2.indexOf('undoGoalRelease'));
  const undoBody = undo.slice(0, undo.indexOf('\n  editGoalSaving'));
  assert.equal(
    /state\.trans\.filter\(item => item\.isGoalRelease/.test(undoBody.split('found.supported')[0]), false,
    'the primary lookup must not be the filtered in-memory list',
  );

  // --- deleting a goal must take its transactions with it ------------------
  //
  // Owner decision 2026-09-06. Previously the goal went and its savings and
  // releases stayed in History with nothing to explain them.
  const del = slice2.slice(slice2.indexOf('  deleteGoal: async'));
  const delBody = del.slice(0, del.indexOf('\n  addGoalSaving'));
  assert(
    delBody.includes('findGoalLinkedTransactionIdsV7'),
    'deleting a goal must find its transactions in the ledger, where hidden releases live',
  );
  assert(
    delBody.includes('voidFinancialTransactionsV7'),
    'deleting a goal must void its transactions',
  );
  // The void must come BEFORE the entity delete: a goal removed while its
  // transactions survive is the state this change exists to prevent.
  assert(
    delBody.indexOf('voidFinancialTransactionsV7') < delBody.indexOf('commitEntityChangesV7'),
    'the transactions must be voided before the goal is removed',
  );
  assert(
    /trans: s.trans.filter/.test(delBody),
    'the in-memory list must drop them too, not wait for a reload',
  );

  console.log('MaalFlow GOAL RELEASE UNDO LEDGER LOOKUP: PASSED');
})();
