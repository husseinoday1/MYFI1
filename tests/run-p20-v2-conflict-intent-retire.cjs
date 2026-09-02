// Phase 12 — real SQLite proof for the one transition that reopens sync. Every
// other conflict-recovery state keeps the gate closed, because the V2 conflict
// is still open in all of them. This one may only fire once the ledger is
// genuinely activated again, and it reads that proof from the database rather
// than taking it from whoever called.
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

const NS = 'user:intent-retire';
const LEDGER = 'ledger-intent-retire';
const now = '2026-09-02T10:00:00.000Z';
const activatedAt = '2026-09-02T12:00:00.000Z';
const intentKey = `financial_v2_conflict_recovery_intent_v1:${NS}`;

const createFixture = ({ status = 'rolled_back_after_activation_failure', activated = true } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, 1, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)', LEDGER, 1, 0, 0, activated ? activatedAt : null, now);
  run('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', intentKey, JSON.stringify({
    version: 1, status, namespace: NS, accountId: 'account-1',
    local: { checkpointId: 'checkpoint-1' }, preparedAt: now,
  }), now);
  const fixture = { db };
  const retire = compileModule({ runFinancialRestorePromotionTransactionV8: makeRunner(fixture) }).retireConflictRecoveryIntentAfterActivationV1;
  return { db, retire };
};

const intentOf = db => JSON.parse(db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(intentKey).value);

(async () => {
  // 1) An activated ledger retires the intent, and keeps the record.
  const done = createFixture();
  const result = await done.retire({ namespace: NS, database: done.db });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'retired_after_reviewed_repair');
  const retired = intentOf(done.db);
  assert.equal(retired.status, 'retired_after_reviewed_repair');
  assert.equal(retired.retiredEvidence.activatedAt, activatedAt, 'the proof must come from the ledger state');
  assert.equal(retired.preparedAt, now, 'the original record must survive');
  assert.equal(retired.local.checkpointId, 'checkpoint-1');

  // 2) It cannot run twice: the retired state is no longer eligible.
  const again = await done.retire({ namespace: NS, database: done.db });
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'financial_v2_conflict_recovery_retire_intent_not_eligible');
  done.db.native.close();

  // 3) Without a real activation the gate stays closed, whatever the caller wants.
  const notActivated = createFixture({ activated: false });
  const refused = await notActivated.retire({ namespace: NS, database: notActivated.db });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'financial_v2_conflict_recovery_retire_not_activated');
  assert.equal(intentOf(notActivated.db).status, 'rolled_back_after_activation_failure',
    'a refused retire must leave the blocking status in place');
  notActivated.db.native.close();

  // 4) The earlier states are not retirable even on an activated ledger: they
  //    describe a recovery that never reached a rollback.
  for (const status of ['ready_for_explicit_cloud_replacement', 'local_promoted_pending_activation']) {
    const early = createFixture({ status });
    const earlyResult = await early.retire({ namespace: NS, database: early.db });
    assert.equal(earlyResult.ok, false, `${status} must not be retirable`);
    assert.equal(earlyResult.reason, 'financial_v2_conflict_recovery_retire_intent_not_eligible');
    assert.equal(intentOf(early.db).status, status);
    early.db.native.close();
  }

  console.log('MYFI P20 V2 CONFLICT INTENT RETIRE RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
