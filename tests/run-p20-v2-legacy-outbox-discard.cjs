// Phase 12 — real SQLite proof for the narrow cleanup that follows a checkpoint
// restore: only the legacy V1 outbox rows written *after* the checkpoint may be
// discarded, only setup rows, and only with the evidence preserved first.
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

const NS = 'user:legacy-discard';
const LEDGER = 'ledger-legacy-discard';
const CHECKPOINT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const STAGE = `${NS}::conflict-recovery-checkpoint::${CHECKPOINT_ID}`;
// The checkpoint boundary. Everything before it predates the incident.
const CHECKPOINT_AT = '2026-09-01T12:00:00.000Z';
const BEFORE = '2026-08-31T09:00:00.000Z';
const AFTER = ['2026-09-02T11:45:47.000Z', '2026-09-02T12:09:51.000Z', '2026-09-02T12:57:16.000Z'];
const intentKey = `financial_v2_conflict_recovery_intent_v1:${NS}`;
const receiptKey = `financial_v2_conflict_checkpoint_v1:${NS}:${CHECKPOINT_ID}`;

const legacyRow = (db, { mutationId, entityType, entityId, operation = 'upsert', createdAt, acknowledgedAt = null, payload = '{}' }) => {
  db.native.prepare('INSERT INTO ledger_outbox_v2(namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at,acknowledged_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(NS, mutationId, entityType, entityId, operation, 1, 12, payload, createdAt, acknowledgedAt);
};

const createFixture = ({ status = 'rolled_back_after_activation_failure', extraRows = [] } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, 1, 2, 2, BEFORE, BEFORE);
  run('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', receiptKey, JSON.stringify({
    version: 1, namespace: NS, checkpointId: CHECKPOINT_ID, checkpointNamespace: STAGE,
    ledgerId: LEDGER, restoreEpoch: 1, sourceGeneration: 8, counts: {}, createdAt: CHECKPOINT_AT,
  }), CHECKPOINT_AT);
  run('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', intentKey, JSON.stringify({
    version: 1, status, namespace: NS, accountId: 'account-1',
    local: { checkpointId: CHECKPOINT_ID, checkpointNamespace: STAGE },
    preparedAt: BEFORE,
  }), CHECKPOINT_AT);

  // Legitimately older than the checkpoint: must always survive.
  legacyRow(db, { mutationId: `${NS}:wallet:old-wallet:revision:1`, entityType: 'wallet', entityId: 'old-wallet', createdAt: BEFORE });
  // Already acknowledged and newer: outside the pending window, must survive.
  legacyRow(db, { mutationId: `${NS}:category:done:revision:1`, entityType: 'category', entityId: 'done', createdAt: AFTER[0], acknowledgedAt: AFTER[1] });
  // The residue of the failed recovery: one workspace and one wallet upsert.
  legacyRow(db, { mutationId: `${NS}:workspace:workspace:revision:3`, entityType: 'workspace', entityId: 'workspace', createdAt: AFTER[0] });
  legacyRow(db, { mutationId: `${NS}:wallet:new-wallet:revision:1`, entityType: 'wallet', entityId: 'new-wallet', createdAt: AFTER[1], payload: '{"id":"new-wallet","name":"Cash 2"}' });
  legacyRow(db, { mutationId: `${NS}:category:new-cat:revision:1`, entityType: 'category', entityId: 'new-cat', createdAt: AFTER[2] });
  for (const row of extraRows) legacyRow(db, row);

  const fixture = { db };
  const discard = compileModule({ runFinancialRestorePromotionTransactionV8: makeRunner(fixture) }).discardLegacyOutboxAfterCheckpointRestoreV1;
  return { db, discard };
};

const pending = db => db.native.prepare('SELECT mutation_id FROM ledger_outbox_v2 WHERE namespace=? AND acknowledged_at IS NULL ORDER BY sequence_id').all(NS).map(row => row.mutation_id);
const all = db => Number(db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v2 WHERE namespace=?').get(NS).n);
const intentOf = db => JSON.parse(db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(intentKey).value);

(async () => {
  // 1) Only the post-checkpoint setup rows go, and their evidence is kept.
  const success = createFixture();
  const before = all(success.db);
  const result = await success.discard({ namespace: NS, database: success.db });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.discarded, 3);
  assert.equal(result.boundary, CHECKPOINT_AT);
  assert.deepEqual(pending(success.db), [`${NS}:wallet:old-wallet:revision:1`],
    'only the pre-checkpoint pending row may remain');
  assert.equal(all(success.db), before - 3, 'the acknowledged row must survive too');
  const evidence = intentOf(success.db).discardedLegacyOutbox;
  assert.equal(evidence.rowCount, 3);
  assert.equal(evidence.boundary, CHECKPOINT_AT);
  assert.equal(evidence.rows.length, 3, 'every discarded row must be preserved verbatim');
  assert.equal(evidence.rows[1].payload_json, '{"id":"new-wallet","name":"Cash 2"}',
    'the payload must survive the row it came from');
  assert.equal(intentOf(success.db).status, 'rolled_back_after_activation_failure',
    'the sync gate must stay closed: the status may not move');

  // 2) Running again is a no-op, and must not disturb the recorded evidence.
  const repeated = await success.discard({ namespace: NS, database: success.db });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.discarded, 0);
  assert.equal(intentOf(success.db).discardedLegacyOutbox.rowCount, 3, 'a no-op must not rewrite the evidence');
  success.db.native.close();

  // 3) One financial row in the window fails the whole call closed.
  for (const unsafe of [
    { mutationId: `${NS}:tx-1:void:2`, entityType: 'financial_transaction', entityId: 'tx-1', operation: 'void', createdAt: AFTER[2] },
    { mutationId: `${NS}:posting:p-1:revision:1`, entityType: 'posting', entityId: 'p-1', createdAt: AFTER[2] },
    { mutationId: `${NS}:wallet:gone:revision:2`, entityType: 'wallet', entityId: 'gone', operation: 'delete', createdAt: AFTER[2] },
  ]) {
    const blocked = createFixture({ extraRows: [unsafe] });
    const total = all(blocked.db);
    const rejected = await blocked.discard({ namespace: NS, database: blocked.db });
    assert.equal(rejected.ok, false, `${unsafe.entityType}/${unsafe.operation} must block the discard`);
    assert.equal(rejected.reason, 'financial_v2_legacy_outbox_discard_unsafe_row_present');
    assert.equal(all(blocked.db), total, 'a blocked discard must not delete anything');
    assert.equal(intentOf(blocked.db).discardedLegacyOutbox, undefined, 'a blocked discard must not record evidence');
    blocked.db.native.close();
  }

  // 4) Only the post-rollback state is eligible.
  for (const status of ['ready_for_explicit_cloud_replacement', 'local_promoted_pending_activation']) {
    const ineligible = createFixture({ status });
    const total = all(ineligible.db);
    const rejected = await ineligible.discard({ namespace: NS, database: ineligible.db });
    assert.equal(rejected.ok, false, `${status} must not allow a discard`);
    assert.equal(rejected.reason, 'financial_v2_legacy_outbox_discard_intent_not_eligible');
    assert.equal(all(ineligible.db), total, 'an ineligible state must leave every row in place');
    ineligible.db.native.close();
  }

  // 5) An active restore intent outranks this cleanup.
  const busy = createFixture();
  busy.db.native.prepare('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)').run(`restore_intent:${NS}`, '{"status":"running"}', AFTER[0]);
  const busyResult = await busy.discard({ namespace: NS, database: busy.db });
  assert.equal(busyResult.ok, false);
  assert.equal(busyResult.reason, 'financial_v2_legacy_outbox_discard_restore_intent_active');
  assert.equal(pending(busy.db).length, 4, 'a running restore must leave the outbox untouched');
  busy.db.native.close();

  console.log('MYFI P20 V2 LEGACY OUTBOX DISCARD RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
