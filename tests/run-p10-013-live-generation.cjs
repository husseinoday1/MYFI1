// Phase 10 / P10-013 Slice 1 — operational SQLite proof for the live token.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLiveGenerationV13.js');
let source = fs.readFileSync(filename, 'utf8').replace(/export const /g, 'const ');
source += `\nmodule.exports = {
  FINANCIAL_LIVE_GENERATION_TOKEN_VERSION, registerLiveGenerationInTransactionV13,
  readLiveGenerationInTransactionV13, advanceLiveGenerationInTransactionV13,
  advanceLiveGenerationForMutationInTransactionV13,
  rebindLiveGenerationForRestoreEpochInTransactionV13,
};`;
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const {
  FINANCIAL_LIVE_GENERATION_TOKEN_VERSION, registerLiveGenerationInTransactionV13,
  readLiveGenerationInTransactionV13, advanceLiveGenerationInTransactionV13,
  advanceLiveGenerationForMutationInTransactionV13,
  rebindLiveGenerationForRestoreEpochInTransactionV13,
} = compiled.exports;

class AsyncSqlite {
  constructor() { this.native = new DatabaseSync(':memory:'); }
  async runAsync(sql, ...params) {
    const result = this.native.prepare(String(sql)).run(...params);
    return { changes: Number(result.changes || 0) };
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async withExclusiveTransactionAsync(task) {
    this.native.exec('BEGIN IMMEDIATE');
    try { const result = await task(this); this.native.exec('COMMIT'); return result; }
    catch (error) { this.native.exec('ROLLBACK'); throw error; }
  }
  close() { this.native.close(); }
}

const db = new AsyncSqlite();
const alpha = { namespace: 'account:alpha', ledgerId: 'ledger-alpha', restoreEpoch: 7 };
const beta = { namespace: 'account:beta', ledgerId: 'ledger-beta', restoreEpoch: 3 };
const inTransaction = task => db.withExclusiveTransactionAsync(task);

(async () => {
  try {
    db.native.exec(`CREATE TABLE ledger_v7_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL);
      CREATE TABLE ledger_sync_identity_v8(
        namespace TEXT PRIMARY KEY,ledger_id TEXT NOT NULL,restore_epoch INTEGER NOT NULL,
        protocol_version INTEGER NOT NULL,minimum_supported_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );`);
    assert.equal(FINANCIAL_LIVE_GENERATION_TOKEN_VERSION, 1);

    const registered = await inTransaction(txn => registerLiveGenerationInTransactionV13({ database: txn, ...alpha }));
    assert.deepEqual(registered, { tokenVersion: 1, ...alpha, generation: 0 });

    for (const invalidEpoch of [null, '', '7', undefined, -1]) {
      await assert.rejects(
        inTransaction(txn => readLiveGenerationInTransactionV13({
          database: txn, ...alpha, restoreEpoch: invalidEpoch,
        })),
        /financial_live_generation_restore_epoch_invalid/,
        `rejects invalid restore epoch ${String(invalidEpoch)}`,
      );
    }

    const first = await inTransaction(txn => advanceLiveGenerationInTransactionV13({ database: txn, ...alpha }));
    assert.equal(first.generation, 1, 'a committed mutation advances generation once');

    await assert.rejects(
      inTransaction(async txn => {
        const advanced = await advanceLiveGenerationInTransactionV13({ database: txn, ...alpha });
        assert.equal(advanced.generation, 2);
        throw new Error('inject_rollback');
      }),
      /inject_rollback/,
    );
    assert.equal((await inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, ...alpha }))).generation, 1,
      'a rolled-back mutation must not advance durable generation');

    const second = await inTransaction(txn => advanceLiveGenerationInTransactionV13({ database: txn, ...alpha }));
    const third = await inTransaction(txn => advanceLiveGenerationInTransactionV13({ database: txn, ...alpha }));
    assert.deepEqual([second.generation, third.generation], [2, 3],
      'two sequential successful operations must each advance exactly once');

    const rebound = await inTransaction(txn => rebindLiveGenerationForRestoreEpochInTransactionV13({
      database: txn, namespace: alpha.namespace, ledgerId: alpha.ledgerId,
      fromRestoreEpoch: 7, toRestoreEpoch: 8,
    }));
    assert.deepEqual(rebound, { tokenVersion: 1, namespace: alpha.namespace, ledgerId: alpha.ledgerId, restoreEpoch: 8, generation: 4 },
      'restore epoch transition must rebind and advance generation exactly once');
    assert.equal((await inTransaction(txn => readLiveGenerationInTransactionV13({
      database: txn, namespace: alpha.namespace, ledgerId: alpha.ledgerId, restoreEpoch: 8,
    }))).generation, 4);
    await assert.rejects(
      inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, ...alpha })),
      /financial_live_generation_binding_invalid/,
      'outgoing epoch binding must no longer be readable after commit',
    );
    await assert.rejects(
      inTransaction(txn => rebindLiveGenerationForRestoreEpochInTransactionV13({
        database: txn, namespace: alpha.namespace, ledgerId: alpha.ledgerId,
        fromRestoreEpoch: 8, toRestoreEpoch: 10,
      })),
      /financial_live_generation_restore_epoch_transition_invalid/,
      'restore generation rebind must only allow epoch + 1',
    );
    await assert.rejects(
      inTransaction(async txn => {
        const moved = await rebindLiveGenerationForRestoreEpochInTransactionV13({
          database: txn, namespace: alpha.namespace, ledgerId: alpha.ledgerId,
          fromRestoreEpoch: 8, toRestoreEpoch: 9,
        });
        assert.equal(moved.generation, 5);
        throw new Error('restore_generation_rollback');
      }),
      /restore_generation_rollback/,
    );
    assert.equal((await inTransaction(txn => readLiveGenerationInTransactionV13({
      database: txn, namespace: alpha.namespace, ledgerId: alpha.ledgerId, restoreEpoch: 8,
    }))).generation, 4, 'rolled-back epoch rebind must not advance durable generation');

    const mutationNamespace = 'account:mutation-bootstrap';
    const mutationFirst = await inTransaction(txn => advanceLiveGenerationForMutationInTransactionV13({
      database: txn, namespace: mutationNamespace,
    }));
    const mutationSecond = await inTransaction(txn => advanceLiveGenerationForMutationInTransactionV13({
      database: txn, namespace: mutationNamespace,
    }));
    assert.deepEqual([mutationFirst.generation, mutationSecond.generation], [1, 2],
      'two sequential real mutations bootstrap once then advance once each');
    await assert.rejects(
      inTransaction(async txn => {
        await advanceLiveGenerationForMutationInTransactionV13({ database: txn, namespace: 'account:mutation-rollback' });
        throw new Error('mutation_generation_rollback');
      }),
      /mutation_generation_rollback/,
    );
    assert.equal(await db.getFirstAsync(
      'SELECT value FROM ledger_v7_meta WHERE key=?',
      'financial_live_generation_v13:account:mutation-rollback',
    ), null, 'failed mutation bootstrap and generation both roll back');

    await inTransaction(txn => registerLiveGenerationInTransactionV13({ database: txn, ...beta }));
    await inTransaction(txn => advanceLiveGenerationInTransactionV13({ database: txn, ...beta }));
    assert.equal((await inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, ...alpha, restoreEpoch: 8 }))).generation, 4);
    assert.equal((await inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, ...beta }))).generation, 1,
      'namespaces must retain independent generations');

    await assert.rejects(
      inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, ...alpha, ledgerId: 'wrong-ledger', restoreEpoch: 8 })),
      /financial_live_generation_binding_invalid/,
    );
    await assert.rejects(
      inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, ...alpha, restoreEpoch: 7 })),
      /financial_live_generation_binding_invalid/,
    );
    await db.runAsync(
      'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
      'financial_live_generation_v13:account:wrong-namespace', JSON.stringify({
        tokenVersion: 1, namespace: alpha.namespace, ledgerId: alpha.ledgerId, restoreEpoch: alpha.restoreEpoch, generation: 0,
      }), '2026-08-21T00:00:00.000Z',
    );
    await assert.rejects(
      inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, namespace: 'account:wrong-namespace', ledgerId: alpha.ledgerId, restoreEpoch: alpha.restoreEpoch })),
      /financial_live_generation_binding_invalid/,
    );
    await assert.rejects(
      inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, namespace: 'account:missing', ledgerId: 'ledger-missing', restoreEpoch: 1 })),
      /financial_live_generation_missing/,
    );
    await db.runAsync(
      'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
      'financial_live_generation_v13:account:malformed', '{bad', '2026-08-21T00:00:00.000Z',
    );
    await assert.rejects(
      inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, namespace: 'account:malformed', ledgerId: 'ledger-malformed', restoreEpoch: 1 })),
      /financial_live_generation_malformed/,
    );
    await db.runAsync(
      'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
      'financial_live_generation_v13:account:wrong-shape', JSON.stringify({
        tokenVersion: '1', namespace: 'account:wrong-shape', ledgerId: 'ledger-wrong-shape', restoreEpoch: 1, generation: '0',
      }), '2026-08-21T00:00:00.000Z',
    );
    await assert.rejects(
      inTransaction(txn => readLiveGenerationInTransactionV13({ database: txn, namespace: 'account:wrong-shape', ledgerId: 'ledger-wrong-shape', restoreEpoch: 1 })),
      /financial_live_generation_binding_invalid/,
      'stored numbers must be actual JSON numbers, not coerced strings',
    );
    await db.runAsync(
      'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
      'financial_live_generation_v13:account:null', null, '2026-08-21T00:00:00.000Z',
    );
    await assert.rejects(
      inTransaction(txn => registerLiveGenerationInTransactionV13({ database: txn, namespace: 'account:null', ledgerId: 'ledger-null', restoreEpoch: 1 })),
      /financial_live_generation_missing/,
      'registration must not overwrite an existing malformed/null token',
    );
    console.log('MYFI P10-013 LIVE GENERATION FOUNDATION: PASS');
  } finally {
    db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
