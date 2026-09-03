// Phase 14 §86 — the retry policy as the repository actually applies it.
//
// run-p14-outbox-retry-policy.cjs proves the ladder's arithmetic. This proves
// the two things only the repository can: that a failure schedules the ladder's
// delay instead of the old flat minute, and that a stopped row genuinely leaves
// the pending set. That second half is the one that matters — "stop retrying"
// is only real if the drain agrees, and a stopped row's null next_attempt_at
// reads as "due now" to the old query, so getting it wrong makes the bug worse.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
const raw = fs.readFileSync(filename, 'utf8');
const ddl = name => {
  const match = raw.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  assert(match, name + ' DDL missing');
  return match[1];
};

// The real policy module, compiled once and handed to the repository — this is
// an integration test, so the arithmetic under test must be the shipped one.
const policyTarget = path.join(root, 'src/lib/financialOutboxRetryPolicyV1.js');
const policyModule = new Module(policyTarget, module);
policyModule.filename = policyTarget;
policyModule.paths = Module._nodeModulePaths(path.dirname(policyTarget));
policyModule._compile(babel.transformFileSync(policyTarget, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, policyTarget);
globalThis.__TEST_RETRY_POLICY__ = policyModule.exports;
const { OUTBOX_MAX_ATTEMPTS, OUTBOX_MAX_AGE_MS, OUTBOX_RETRY_BASE_MS } = policyModule.exports;

let source = raw
  .replace("import { Platform } from 'react-native';", "const Platform = { OS: 'android' };")
  .replace(
    "import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';",
    [
      'const enqueueLedgerWrite = task => task();',
      'const getLedgerDb = async () => globalThis.__TEST_DB__;',
      'const runLedgerExclusiveTransaction = async (db, task) => {',
      "  db.native.exec('BEGIN IMMEDIATE');",
      "  try { const value = await task(db); db.native.exec('COMMIT'); return value; }",
      "  catch (error) { db.native.exec('ROLLBACK'); throw error; }",
      '};',
    ].join('\n'),
  )
  .replace("import { runLedgerSchemaMigrations } from './financialLedgerSchemaMigrations';", 'const runLedgerSchemaMigrations = async () => true;')
  .replace(
    "import { outboxRetryPlanV1, outboxPermanentFailureCutoffV1 } from './financialOutboxRetryPolicyV1';",
    'const { outboxRetryPlanV1, outboxPermanentFailureCutoffV1 } = globalThis.__TEST_RETRY_POLICY__;',
  )
  .replace(
    /import \{\s*buildExpenseLedgerCommand,\s*buildFinancialLedgerCommand,\s*FINANCIAL_LEDGER_SCHEMA_VERSION,\s*\} from '\.\/financialLedgerV7Model';/,
    'const buildExpenseLedgerCommand = () => null; const buildFinancialLedgerCommand = () => null; const FINANCIAL_LEDGER_SCHEMA_VERSION = 12;',
  )
  .replace("import { cloudWorkspaceCfg, mergeCloudWorkspaceCfg } from './cloudWorkspaceMetadata.js';", 'const cloudWorkspaceCfg = value => value || {}; const mergeCloudWorkspaceCfg = (left, right) => ({ ...left, ...right });')
  .replace(/import \{[\s\S]*?\} from '\.\/localArchiveRepository';/, [
    'const ensureColdArchiveSchema = async () => true;',
    'const clearColdArchiveNamespaceInTransaction = async () => {};',
    'const replaceColdArchiveNamespaceFromStageInTransaction = async () => {};',
  ].join('\n'))
  .replace(/import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/, [
    'const advanceLiveGenerationForMutationInTransactionV13 = async () => ({ generation: 0 });',
    'const rebindLiveGenerationForRestoreEpochInTransactionV13 = async () => ({ generation: 0 });',
    'const readLiveGenerationInTransactionV13 = async () => ({ generation: 0 });',
  ].join('\n'))
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');
assert(!/^\s*import /m.test(source), 'every import must be stubbed before compiling the repository');
source += '\nmodule.exports = { failLedgerMutationV8, readPendingLedgerMutationsV8, readFailedPermanentLedgerMutationsV8 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { failLedgerMutationV8, readPendingLedgerMutationsV8, readFailedPermanentLedgerMutationsV8 } = compiled.exports;

class Db {
  constructor() { this.native = new DatabaseSync(':memory:'); this.native.exec('PRAGMA foreign_keys=ON;'); }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const out = this.native.prepare(String(sql)).run(...params); return { changes: Number(out.changes || 0) }; }
}

const NS = 'user:outbox-retry';
const LEDGER = 'ledger-outbox-retry';
const EPOCH = 1;
const now = '2026-09-04T10:00:00.000Z';

const createDb = ({ createdAt = now, attempts = 0 } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, EPOCH, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)', LEDGER, EPOCH, 0, 0, now, now);
  run(`INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,payload_json,created_at,attempts)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    NS, LEDGER, EPOCH, 'mut-1', 'cmd-1', 'financial_transaction', 'tx-1', 'upsert', 1, 0, 2, 2, 1, '{"transaction":{"id":"tx-1"}}', createdAt, attempts);
  globalThis.__TEST_DB__ = db;
  return db;
};

const row = db => db.native.prepare('SELECT attempts,next_attempt_at,last_error FROM ledger_outbox_v3 WHERE mutation_id=?').get('mut-1');
const fail = (db, error = 'network_down') => failLedgerMutationV8({
  ledgerId: LEDGER, restoreEpoch: EPOCH, mutationId: 'mut-1', error, database: db,
});
const pending = db => readPendingLedgerMutationsV8({ namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH, database: db });
const stopped = db => readFailedPermanentLedgerMutationsV8({ namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH, database: db });

(async () => {
  // 1) A first failure schedules the ladder's first step, not a flat minute.
  //    The old behavior was always exactly 60s; the window here excludes it.
  {
    const db = createDb();
    const before = Date.now();
    assert.equal(await fail(db), true);
    const after = row(db);
    assert.equal(after.attempts, 1);
    const waitMs = Date.parse(after.next_attempt_at) - before;
    assert.ok(waitMs >= Math.floor(OUTBOX_RETRY_BASE_MS / 2) - 1000 && waitMs <= OUTBOX_RETRY_BASE_MS + 1000,
      `first retry must land in the ladder's first window, got ${waitMs}ms`);
    assert.equal(after.last_error, 'network_down');
  }

  // 2) Repeat action: failing the same row again advances the ladder rather
  //    than rescheduling the same delay. The counter lives in the row, so a
  //    second failure has to read it back and plan from it.
  {
    const db = createDb();
    await fail(db);
    const first = row(db);
    await fail(db);
    const second = row(db);
    assert.equal(second.attempts, 2, 'each failure must count');
    const firstWait = Date.parse(first.next_attempt_at);
    const secondWait = Date.parse(second.next_attempt_at);
    assert.ok(secondWait > firstWait,
      'the second failure must wait longer than the first, or the ladder is flat');
  }

  // 3) A retryable row stays in the pending set once its wait has passed, and
  //    is withheld while it has not. Without this the ladder would be advisory.
  {
    const db = createDb();
    await fail(db);
    assert.equal((await pending(db)).length, 0, 'a row still inside its backoff must not be drained');
    db.native.prepare('UPDATE ledger_outbox_v3 SET next_attempt_at=? WHERE mutation_id=?')
      .run('2020-01-01T00:00:00.000Z', 'mut-1');
    assert.equal((await pending(db)).length, 1, 'once its wait has passed it must be drained again');
    assert.equal((await stopped(db)).length, 0, 'a retryable row is not a stopped one');
  }

  // 4) The stop, end to end. Drive the row to the attempt limit and it must
  //    leave the pending set, appear in the stopped set, keep its payload, and
  //    schedule nothing — a null next_attempt_at that the drain does NOT read
  //    as "due now".
  {
    const db = createDb({ attempts: OUTBOX_MAX_ATTEMPTS - 1 });
    await fail(db, 'server_rejected');
    const after = row(db);
    assert.equal(after.attempts, OUTBOX_MAX_ATTEMPTS);
    assert.equal(after.next_attempt_at, null, 'a stopped row must schedule nothing');
    assert.match(after.last_error, /^outbox_max_attempts_exhausted:/,
      'the stored error must say why it stopped, not just what failed');
    assert.equal((await pending(db)).length, 0,
      'a stopped row must leave the pending set — a null next_attempt_at must not read as due now');
    const terminal = await stopped(db);
    assert.equal(terminal.length, 1, 'a stopped row must be readable, or it is not actionable');
    assert.equal(terminal[0].mutation_id, 'mut-1');
    assert.deepEqual(terminal[0].payload, { transaction: { id: 'tx-1' } },
      'the row keeps its financial payload — stopping retries never discards it');
  }

  // 5) Age is the other stop, and it applies to a row that never burned
  //    through its attempts: a device offline long enough that the mutation is
  //    no longer worth replaying.
  {
    const db = createDb({ createdAt: new Date(Date.now() - OUTBOX_MAX_AGE_MS - 60_000).toISOString(), attempts: 1 });
    await fail(db);
    assert.equal(row(db).next_attempt_at, null);
    assert.match(row(db).last_error, /^outbox_max_age_exceeded:/);
    assert.equal((await pending(db)).length, 0, 'a too-old row must leave the pending set');
    assert.equal((await stopped(db)).length, 1, 'and must be visible as stopped');
  }

  // 5b) The offline-user case, end to end: a row older than the age cut that
  //     has never been attempted must stay drainable. Someone back from three
  //     weeks away must still upload what they entered before they left.
  {
    const db = createDb({ createdAt: new Date(Date.now() - OUTBOX_MAX_AGE_MS - 86_400_000).toISOString(), attempts: 0 });
    assert.equal((await pending(db)).length, 1,
      'an old but never-attempted row must remain pending, not be silently retired');
    assert.equal((await stopped(db)).length, 0, 'and must not be reported as stopped');
    // It is only after it actually starts failing that age retires it.
    await fail(db);
    await fail(db);
    assert.equal((await pending(db)).length, 0);
    assert.equal((await stopped(db)).length, 1, 'once it has failed, an old row is genuinely stuck');
  }

  // 6) An acknowledged row is in neither set. Success must not be reported as
  //    a permanent failure just because it sat long enough to pass the age cut.
  {
    const db = createDb({ createdAt: new Date(Date.now() - OUTBOX_MAX_AGE_MS - 60_000).toISOString(), attempts: 1 });
    db.native.prepare('UPDATE ledger_outbox_v3 SET acknowledged_at=? WHERE mutation_id=?').run(now, 'mut-1');
    assert.equal((await pending(db)).length, 0);
    assert.equal((await stopped(db)).length, 0, 'an acknowledged row is finished, not failed');
  }

  // 7) A failure against a row that is not there reports it rather than
  //    inventing an update.
  {
    const db = createDb();
    assert.equal(await failLedgerMutationV8({
      ledgerId: LEDGER, restoreEpoch: EPOCH, mutationId: 'missing', error: 'x', database: db,
    }), false);
  }

  console.log('MYFI P14 OUTBOX RETRY REPOSITORY: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
