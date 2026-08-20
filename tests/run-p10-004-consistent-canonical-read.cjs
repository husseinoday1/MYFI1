// Phase 10 Step 4 — the canonical read is one point-in-time snapshot.
//
// Step 1 read the whole financial graph, but it read it as six independent SELECTs.
// A write landing between two of them yields a transaction taken from before it and
// its postings from after — and the semantic hash computed over that pair then
// certifies the torn result as sound. A checksum over an inconsistent read is worse
// than no checksum, because it converts a silent error into a signed one.
//
// None of that is visible by reading the source, so this proves the three properties
// that make the snapshot real:
//   1. every canonical read happens inside exactly one transaction;
//   2. both schema-readiness paths are warmed BEFORE that transaction opens, because
//      each enqueues on the shared write queue and the queue is not reentrant — doing
//      it from inside the transaction deadlocks rather than fails, which is the worst
//      way for this to break;
//   3. it holds on the second consecutive export as well as the first.
//
// runLedgerReadTransaction itself is exercised directly against a fake connection,
// including the ordering guarantee that it serialises with queued writes rather than
// racing them.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));

const load = (relativePath, transform, exportNames) => {
  const filename = path.join(root, relativePath);
  let source = transform(fs.readFileSync(filename, 'utf8'))
    .replace(/export const /g, 'const ')
    .replace(/export async function /g, 'async function ')
    .replace(/export function /g, 'function ');
  source += `\nmodule.exports = { ${exportNames.join(', ')} };\n`;
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};

// --- 1. runLedgerReadTransaction ------------------------------------------
const ledgerDatabase = load(
  'src/lib/ledgerDatabase.js',
  text => text
    .replace(/import \{ Platform \} from 'react-native';/, "const Platform = { OS: 'android' };")
    .replace(
      /import \* as SQLite from 'expo-sqlite';/,
      'const SQLite = { openDatabaseAsync: async () => globalThis.__SQLITE__ };',
    ),
  ['runLedgerReadTransaction', 'enqueueLedgerWrite', 'flushLedgerWrites'],
);

const { runLedgerReadTransaction, enqueueLedgerWrite, flushLedgerWrites } = ledgerDatabase;

(async () => {
  // Refuses a handle that cannot open a transaction, rather than reading through it
  // and returning a snapshot that was never one.
  await assert.rejects(
    () => runLedgerReadTransaction({}, async () => 1),
    /ledger_read_transaction_unavailable/,
  );
  await assert.rejects(
    () => runLedgerReadTransaction(null, async () => 1),
    /ledger_read_transaction_unavailable/,
  );
  await assert.rejects(
    () => runLedgerReadTransaction({ withTransactionAsync: async fn => fn() }, 'not a function'),
    /ledger_read_transaction_task_required/,
  );
  console.log('[PASS] refuses a handle or task it cannot honour');

  {
    const events = [];
    const db = {
      withTransactionAsync: async task => {
        events.push('open');
        await task();
        events.push('commit');
      },
    };
    const value = await runLedgerReadTransaction(db, async handle => {
      events.push('read');
      // expo-sqlite hands withTransactionAsync no argument, so the callback has to
      // receive the same database object or callers would query outside the snapshot.
      assert.equal(handle, db, 'the task must be given the handle the transaction is open on');
      return 'snapshot';
    });
    assert.equal(value, 'snapshot', 'the task result is the return value');
    assert.deepEqual(events, ['open', 'read', 'commit']);
    console.log('[PASS] runs the task inside the transaction and returns its result');
  }

  {
    // Serialisation with writes is the whole reason this shares the write queue:
    // MYFI has one connection, and a second BEGIN on it while a write transaction is
    // live is the nested-transaction failure the queue exists to prevent.
    const order = [];
    const slowWrite = enqueueLedgerWrite(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      order.push('write');
    });
    const read = runLedgerReadTransaction(
      { withTransactionAsync: async task => task() },
      async () => { order.push('read'); },
    );
    await Promise.all([slowWrite, read]);
    assert.deepEqual(order, ['write', 'read'], 'the read must wait for the queued write, not overlap it');
    console.log('[PASS] serialises with queued writes on the shared connection');
  }

  {
    // A failed read must not wedge the queue for everything after it.
    await assert.rejects(
      () => runLedgerReadTransaction(
        { withTransactionAsync: async task => task() },
        async () => { throw new Error('read_exploded'); },
      ),
      /read_exploded/,
    );
    const after = await runLedgerReadTransaction(
      { withTransactionAsync: async task => task() },
      async () => 'still working',
    );
    assert.equal(after, 'still working');
    await flushLedgerWrites();
    console.log('[PASS] a failed read releases the queue');
  }

  {
    // Forgetting to warm a schema path before the snapshot opens used to hang: the
    // task waits for a queue slot its own call stack is holding, forever, and the app
    // just looks frozen with nothing to diagnose. It has to name itself instead.
    await assert.rejects(
      () => runLedgerReadTransaction(
        { withTransactionAsync: async task => task() },
        async () => enqueueLedgerWrite(async () => 'unreachable'),
      ),
      /ledger_queue_reentrant_from_read_transaction/,
    );
    // The guard must lift again afterwards, or one forgotten warm-up would take every
    // later write down with it.
    const after = await enqueueLedgerWrite(async () => 'queue still usable');
    assert.equal(after, 'queue still usable');
    console.log('[PASS] a missed warm-up names itself instead of hanging');
  }

  {
    // Twice in a row: the depth counter is decremented on the failing path too, not
    // only the happy one.
    for (const attempt of [1, 2]) {
      await assert.rejects(
        () => runLedgerReadTransaction(
          { withTransactionAsync: async task => task() },
          async () => { throw new Error('boom_' + attempt); },
        ),
        new RegExp('boom_' + attempt),
      );
    }
    assert.equal(await enqueueLedgerWrite(async () => 'ok'), 'ok',
      'the queue must survive repeated failures inside a read transaction');
    console.log('[PASS] the reentrancy flag clears after a failed read, repeatedly');
  }

  // --- 2. readCanonicalBackupSource uses it ---------------------------------
  const events = [];
  const backup = load(
    'src/lib/financialBackupV2.js',
    text => text
      .replace(
        /import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
        [
          'const getColdArchiveNamespace = (ns) => ns;',
          "const exportColdArchives = async () => { globalThis.__EVENTS__.push('read:archives'); return globalThis.__ARCHIVES__; };",
          "const ensureColdArchiveSchema = async () => { globalThis.__EVENTS__.push('warm:archives'); return true; };",
        ].join('\n'),
      )
      .replace(
        /import \{[\s\S]*?\} from '\.\/ledgerDatabase';/,
        [
          'const getLedgerDb = async () => globalThis.__DB__;',
          'const runLedgerReadTransaction = async (db, task) => {',
          "  globalThis.__EVENTS__.push('txn:open');",
          '  try { return await task(db); } finally { globalThis.__EVENTS__.push(\'txn:close\'); }',
          '};',
        ].join('\n'),
      )
      .replace(
        /import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/,
        [
          "const ensureFinancialLedgerV7 = async () => { globalThis.__EVENTS__.push('warm:ledger'); return true; };",
          "const readFinancialProjectionV7 = async ({ database }) => { globalThis.__EVENTS__.push('read:projection:' + String(database)); return globalThis.__PROJECTION__; };",
          "const readLedgerSyncIdentityV8 = async () => { globalThis.__EVENTS__.push('read:identity'); return null; };",
          "const getFinancialWorkspaceStateV7 = async () => { globalThis.__EVENTS__.push('read:workspace'); return null; };",
        ].join('\n'),
      ),
    ['readCanonicalBackupSource'],
  );

  globalThis.__EVENTS__ = events;
  globalThis.__DB__ = 'THE_DB';
  globalThis.__ARCHIVES__ = [];
  globalThis.__PROJECTION__ = {
    transactions: [], entities: [], postings: [], links: [], accounts: [], exchangeRates: [],
  };

  const first = await backup.readCanonicalBackupSource({ namespace: 'user:p10-004' });
  assert.equal(first.ok, true);

  assert.deepEqual(events, [
    'warm:ledger',
    'warm:archives',
    'txn:open',
    'read:projection:THE_DB',
    'read:identity',
    'read:workspace',
    'read:archives',
    'txn:close',
  ], 'schemas warm first, then every canonical read happens inside one open transaction');
  console.log('[PASS] one transaction covers ledger, identity, workspace and archives');
  console.log('[PASS] both schema paths are warmed before the transaction opens');

  // The projection reader must be handed the transaction's handle. Passing the
  // ambient connection instead would read outside the snapshot while looking correct.
  assert.ok(events.includes('read:projection:THE_DB'),
    'the projection must be read through the handle the transaction is open on');

  // --- 3. the second run, not just the first --------------------------------
  events.length = 0;
  const second = await backup.readCanonicalBackupSource({ namespace: 'user:p10-004' });
  assert.equal(second.ok, true);
  assert.equal(events.filter(name => name === 'txn:open').length, 1,
    'a repeat export must open exactly one transaction, not reuse or nest one');
  assert.deepEqual(events, [
    'warm:ledger',
    'warm:archives',
    'txn:open',
    'read:projection:THE_DB',
    'read:identity',
    'read:workspace',
    'read:archives',
    'txn:close',
  ], 'the second consecutive export must behave exactly like the first');
  assert.deepEqual(second.counts, first.counts);
  console.log('[PASS] the second consecutive export is identical to the first');

  // --- 4. the isolated-handle refusal costs nothing -------------------------
  events.length = 0;
  const isolated = await backup.readCanonicalBackupSource({ namespace: 'user:p10-004', database: {} });
  assert.equal(isolated.ok, false);
  assert.equal(isolated.reason, 'canonical_backup_isolated_database_unsupported');
  assert.deepEqual(events, [],
    'a refusal that depends only on its argument must not open a transaction or read anything');
  console.log('[PASS] the isolated-handle refusal happens before any read');

  console.log('MYFI P10-004 CONSISTENT CANONICAL READ CONTRACT: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
