// Phase 12 — the only path that removes legacy outbox rows carrying real
// financial entries. Those rows can be the last surviving record of work the
// cloud never received, so nothing here removes one the owner has not looked at
// and confirmed, one at a time, with the row proven unchanged since.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');
const target = path.join(root, 'src/lib/financialBootstrapRecoveryPromotionV2.js');
const ddl = name => {
  const match = repository.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  assert(match, name + ' DDL missing');
  return match[1];
};

class Db {
  constructor() { this.native = new DatabaseSync(':memory:'); this.native.exec('PRAGMA foreign_keys=ON;'); }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const out = this.native.prepare(String(sql)).run(...params); return { changes: Number(out.changes || 0) }; }
}

const makeRunner = fixture => async ({ task }) => {
  const db = fixture.db;
  db.native.exec('BEGIN IMMEDIATE');
  try {
    const result = await task({ database: db });
    db.native.exec('COMMIT');
    return result;
  } catch (error) { db.native.exec('ROLLBACK'); throw error; }
};

const compileModule = repoMock => {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === target && request === './financialLedgerV7Repository') return repoMock;
    if (parent?.filename === target && request === './financialLiveGenerationV13') return { readLiveGenerationInTransactionV13: async () => ({ generation: 0 }) };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(target, module);
    compiled.filename = target;
    compiled.paths = Module._nodeModulePaths(path.dirname(target));
    compiled._compile(babel.transformFileSync(target, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, target);
    return compiled.exports;
  } finally { Module._load = originalLoad; }
};

const NS = 'user:legacy-ack';
const LEDGER = 'ledger-legacy-ack';
const now = '2026-09-03T10:00:00.000Z';
const ackKey = `financial_v2_legacy_outbox_ack_v1:${NS}`;
const discardedKey = `financial_v2_legacy_outbox_discarded_v1:${NS}`;

// The device's real residue: an opening balance, an expense, and its void.
const ROWS = [
  { sequence: 74, entityType: 'financial_transaction', entityId: 'tx-open', operation: 'upsert', payload: '{"amountMinor":10000}' },
  { sequence: 75, entityType: 'financial_transaction', entityId: 'tx-spend', operation: 'upsert', payload: '{"amountMinor":-900}' },
  { sequence: 76, entityType: 'financial_transaction', entityId: 'tx-spend', operation: 'void', payload: '{"voided":true}' },
];

const createFixture = ({ activated = true } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, 1, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)', LEDGER, 1, 0, 0, activated ? now : null, now);
  for (const row of ROWS) {
    run('INSERT INTO ledger_outbox_v2(namespace,sequence_id,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      NS, row.sequence, `mut-${row.sequence}`, row.entityType, row.entityId, row.operation, 1, 12, row.payload, now);
  }
  const fixture = { db };
  const exports = compileModule({ runFinancialRestorePromotionTransactionV8: makeRunner(fixture) });
  return { db, ack: exports.acknowledgeLegacyOutboxRowV1, discard: exports.discardAcknowledgedLegacyOutboxV1 };
};

const pending = db => db.native.prepare('SELECT sequence_id FROM ledger_outbox_v2 WHERE namespace=? AND acknowledged_at IS NULL ORDER BY sequence_id').all(NS).map(row => Number(row.sequence_id));
const meta = (db, key) => {
  const row = db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(key);
  return row ? JSON.parse(row.value) : null;
};

(async () => {
  // 1) Nothing goes without an acknowledgement, and nothing goes without the
  //    explicit confirmation either.
  {
    const f = createFixture();
    const noAck = await f.discard({ namespace: NS, confirmed: true, database: f.db });
    assert.equal(noAck.ok, false);
    assert.equal(noAck.reason, 'financial_v2_legacy_outbox_discard_ack_missing');
    assert.deepEqual(pending(f.db), [74, 75, 76]);

    await f.ack({ namespace: NS, sequenceId: 74, database: f.db });
    const unconfirmed = await f.discard({ namespace: NS, database: f.db });
    assert.equal(unconfirmed.ok, false);
    assert.equal(unconfirmed.reason, 'financial_v2_legacy_outbox_discard_ack_confirmation_required');
    assert.deepEqual(pending(f.db), [74, 75, 76], 'an unconfirmed call must remove nothing');
    f.db.native.close();
  }

  // 2) One acknowledgement removes exactly one row. The entries the owner has
  //    not compared yet stay put.
  {
    const f = createFixture();
    const acked = await f.ack({ namespace: NS, sequenceId: 75, database: f.db });
    assert.equal(acked.ok, true, JSON.stringify(acked));
    assert.equal(acked.acknowledgedCount, 1);

    const result = await f.discard({ namespace: NS, confirmed: true, database: f.db });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.discarded, 1);
    assert.deepEqual(pending(f.db), [74, 76], 'only the acknowledged row may go');

    // What was removed outlives the row.
    const record = meta(f.db, discardedKey);
    assert.equal(record.rowCount, 1);
    assert.equal(record.rows[0].payload_json, '{"amountMinor":-900}', 'the payload must be kept');
    f.db.native.close();
  }

  // 3) Acknowledging each row in turn clears them all — three decisions, not one.
  {
    const f = createFixture();
    for (const row of ROWS) await f.ack({ namespace: NS, sequenceId: row.sequence, database: f.db });
    assert.equal(Object.keys(meta(f.db, ackKey).rows).length, 3);
    const result = await f.discard({ namespace: NS, confirmed: true, database: f.db });
    assert.equal(result.ok, true);
    assert.equal(result.discarded, 3);
    assert.deepEqual(pending(f.db), []);
    assert.equal(meta(f.db, discardedKey).rowCount, 3);
    f.db.native.close();
  }

  // 4) An acknowledgement is of a row as it stood. If the row changed since,
  //    the confirmation was of something the owner never saw.
  {
    const f = createFixture();
    await f.ack({ namespace: NS, sequenceId: 74, database: f.db });
    f.db.native.prepare('UPDATE ledger_outbox_v2 SET payload_json=? WHERE namespace=? AND sequence_id=?')
      .run('{"amountMinor":99999}', NS, 74);
    const result = await f.discard({ namespace: NS, confirmed: true, database: f.db });
    assert.equal(result.ok, false, 'a changed row must void its acknowledgement');
    assert.equal(result.reason, 'financial_v2_legacy_outbox_discard_ack_row_changed');
    assert.deepEqual(pending(f.db), [74, 75, 76], 'and nothing may be removed');
    assert.equal(meta(f.db, discardedKey), null);
    f.db.native.close();
  }

  // 5) Before activation these rows may still be genuine queued work: the whole
  //    call is refused, acknowledgement or not.
  {
    const f = createFixture({ activated: false });
    await f.ack({ namespace: NS, sequenceId: 74, database: f.db });
    const result = await f.discard({ namespace: NS, confirmed: true, database: f.db });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'financial_v2_legacy_outbox_discard_ack_not_activated');
    assert.deepEqual(pending(f.db), [74, 75, 76]);
    f.db.native.close();
  }

  // 6) A restore in flight outranks this cleanup entirely.
  {
    const f = createFixture();
    await f.ack({ namespace: NS, sequenceId: 74, database: f.db });
    f.db.native.prepare('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)').run(`restore_intent:${NS}`, '{"status":"running"}', now);
    const result = await f.discard({ namespace: NS, confirmed: true, database: f.db });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'financial_v2_legacy_outbox_discard_ack_restore_intent_active');
    assert.deepEqual(pending(f.db), [74, 75, 76]);
    f.db.native.close();
  }

  // 7) Acknowledging a row that is not there tells the caller so, rather than
  //    recording a confirmation of nothing.
  {
    const f = createFixture();
    const missing = await f.ack({ namespace: NS, sequenceId: 999, database: f.db });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'financial_v2_legacy_outbox_ack_row_missing');
    assert.equal(meta(f.db, ackKey), null);
    f.db.native.close();
  }

  // 8) Running the discard twice is safe: the second finds its rows already
  //    gone and reports nothing removed.
  {
    const f = createFixture();
    await f.ack({ namespace: NS, sequenceId: 74, database: f.db });
    assert.equal((await f.discard({ namespace: NS, confirmed: true, database: f.db })).discarded, 1);
    const again = await f.discard({ namespace: NS, confirmed: true, database: f.db });
    assert.equal(again.ok, true);
    assert.equal(again.discarded, 0);
    assert.deepEqual(pending(f.db), [75, 76]);
    f.db.native.close();
  }

  console.log('MYFI P20 V2 LEGACY OUTBOX ACK RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
