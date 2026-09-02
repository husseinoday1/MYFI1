// Phase 12 — real SQLite proof that a failed activation attempt does not lock
// the next one out. A preflight failure records the command in ledger_inbox_v3
// as 'conflict', and that row is checked before preflight and preserved by every
// writer, so the command could never be revalidated even after the reason it
// failed was fixed. The reset clears exactly that, and the shadow cursor with
// it, while never touching an 'applied' row.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
const raw = fs.readFileSync(filename, 'utf8');
const ddl = name => {
  const match = raw.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  assert(match, name + ' DDL missing');
  return match[1];
};

let source = raw
  .replace("import { Platform } from 'react-native';", "const Platform = { OS: 'android' };")
  .replace(
    "import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';",
    [
      'const enqueueLedgerWrite = task => task();',
      'const getLedgerDb = async () => globalThis.__TEST_DB__;',
      'const runLedgerExclusiveTransaction = async (db, task) => {',
      "  if (db.__inTransaction) return task(db);",
      "  db.__inTransaction = true;",
      "  db.native.exec('BEGIN IMMEDIATE');",
      "  try { const value = await task(db); db.native.exec('COMMIT'); return value; }",
      "  catch (error) { db.native.exec('ROLLBACK'); throw error; }",
      '  finally { db.__inTransaction = false; }',
      '};',
    ].join('\n'),
  )
  .replace("import { runLedgerSchemaMigrations } from './financialLedgerSchemaMigrations';", 'const runLedgerSchemaMigrations = async () => true;')
  .replace(
    /import \{\s*buildExpenseLedgerCommand,\s*buildFinancialLedgerCommand,\s*FINANCIAL_LEDGER_SCHEMA_VERSION,\s*\} from '\.\/financialLedgerV7Model';/,
    'const buildExpenseLedgerCommand = () => null; const buildFinancialLedgerCommand = () => null; const FINANCIAL_LEDGER_SCHEMA_VERSION = 12;',
  )
  .replace("import { cloudWorkspaceCfg, mergeCloudWorkspaceCfg } from './cloudWorkspaceMetadata.js';", 'const cloudWorkspaceCfg = value => value || {}; const mergeCloudWorkspaceCfg = (left, right) => ({ ...left, ...right });')
  .replace(
    /import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
    [
      'const ensureColdArchiveSchema = async () => true;',
      'const clearColdArchiveNamespaceInTransaction = async () => {};',
      'const replaceColdArchiveNamespaceFromStageInTransaction = async () => {};',
    ].join('\n'),
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/,
    [
      'const advanceLiveGenerationForMutationInTransactionV13 = async () => ({ generation: 0 });',
      'const rebindLiveGenerationForRestoreEpochInTransactionV13 = async () => ({ generation: 0 });',
      'const readLiveGenerationInTransactionV13 = async () => ({ generation: 0 });',
    ].join('\n'),
  )
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');
source += '\nmodule.exports = { applyRemoteLedgerMutationsV8, resetFinancialV2ShadowValidationStateV8 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { applyRemoteLedgerMutationsV8, resetFinancialV2ShadowValidationStateV8 } = compiled.exports;

class Db {
  constructor() { this.native = new DatabaseSync(':memory:'); this.native.exec('PRAGMA foreign_keys=ON;'); }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const out = this.native.prepare(String(sql)).run(...params); return { changes: Number(out.changes || 0) }; }
}

const NS = 'user:shadow-reset';
const LEDGER = 'ledger-shadow-reset';
const EPOCH = 1;
const now = '2026-09-02T10:00:00.000Z';

const workspaceCommand = (revision, sequence) => ({
  ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutationId: `remote-workspace-${revision}`, serverSequence: sequence,
  commandId: `cmd-workspace-${revision}`, commandSequence: sequence, commandMutationCount: 1,
  entityType: 'workspace', entityId: 'workspace', operation: 'upsert',
  revision, baseRevision: revision - 1,
  protocolVersion: 2, minimumSupportedVersion: 2, payloadSchemaVersion: 1,
  payload: { entityType: 'workspace', id: 'workspace', cloudRevision: revision },
});

const CHAIN = [workspaceCommand(3, 234), workspaceCommand(4, 236), workspaceCommand(5, 238)];

const createDb = () => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, EPOCH, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,updated_at) VALUES (?,?,?,?,?)', LEDGER, EPOCH, 0, 0, now);
  run('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)', NS, 'sqlite', 12, '{}', now);
  run('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)', NS, 'workspace', 'workspace', 2, JSON.stringify({ entityType: 'workspace', id: 'workspace', cloudRevision: 2 }), now, now);
  globalThis.__TEST_DB__ = db;
  return db;
};

const shadow = (db, mutations, projectedRevisions = null) => applyRemoteLedgerMutationsV8({
  namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutations, deviceId: 'device-test', allowProductionApply: false, database: db, projectedRevisions,
});

const inbox = db => db.native.prepare('SELECT mutation_id,apply_status FROM ledger_inbox_v3 WHERE ledger_id=? ORDER BY mutation_id').all(LEDGER).map(row => ({ mutation_id: String(row.mutation_id), apply_status: String(row.apply_status) }));
const state = db => db.native.prepare('SELECT shadow_last_server_sequence,last_shadow_success_at,last_server_sequence,activated_at FROM ledger_sync_state_v8 WHERE ledger_id=? AND restore_epoch=?').get(LEDGER, EPOCH);

// Reproduces the real failure: the chain is fed one command at a time, exactly
// as separate sync runs would, so command 4 preflights against an unmoved
// ledger and is tombstoned -- what actually happened on the device.
const failOneAttempt = async db => {
  await shadow(db, [CHAIN[0]]);
  return shadow(db, [CHAIN[1]]);
};

(async () => {
  // 1) A failed attempt really does leave a durable tombstone.
  const db = createDb();
  const failed = await failOneAttempt(db);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'financial_v2_remote_cas_conflict');
  assert.deepEqual(inbox(db), [
    { mutation_id: 'remote-workspace-3', apply_status: 'observed' },
    { mutation_id: 'remote-workspace-4', apply_status: 'conflict' },
  ], 'the failing command must be recorded as a conflict');

  // 2) Without the reset the next attempt cannot even reach preflight, so the
  //    shadow chain fix can never run: this is the lock the reset exists for.
  const locked = await shadow(db, CHAIN, new Map());
  assert.equal(locked.ok, false, 'a tombstoned command must block a fresh attempt');
  assert.equal(locked.reason, 'financial_v2_remote_command_conflict_pending');

  // 3) After the reset the same chain validates end to end.
  const reset = await resetFinancialV2ShadowValidationStateV8({ namespace: NS, database: db });
  assert.equal(reset.ok, true, JSON.stringify(reset));
  assert.equal(reset.clearedConflictRows, 1);
  assert.equal(reset.shadowCursorBefore, 234);
  assert.equal(state(db).shadow_last_server_sequence, 0, 'the shadow cursor must be rewound');
  assert.equal(state(db).last_shadow_success_at, null);
  assert.deepEqual(inbox(db), [{ mutation_id: 'remote-workspace-3', apply_status: 'observed' }],
    'only the conflict row may be cleared');

  const retried = await shadow(db, CHAIN, new Map());
  assert.equal(retried.ok, true, `the retry must validate the whole chain: ${JSON.stringify(retried)}`);
  assert.equal(retried.processed, 3);
  assert.equal(Number(db.native.prepare('SELECT revision FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=?').get(NS, 'workspace', 'workspace').revision), 2,
    'the retry is still shadow: nothing may be applied');
  db.native.close();

  // 4) An 'applied' row records a mutation that really landed. It stops a double
  //    apply and must survive the reset untouched.
  const withApplied = createDb();
  await failOneAttempt(withApplied);
  withApplied.native.prepare("INSERT INTO ledger_inbox_v3(ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence,received_at,apply_status,applied_at) VALUES (?,?,?,?,?,?,?,'applied',?)")
    .run(LEDGER, EPOCH, 'remote-applied-1', 'cmd-applied-1', 100, 100, now, now);
  const keptApplied = await resetFinancialV2ShadowValidationStateV8({ namespace: NS, database: withApplied });
  assert.equal(keptApplied.ok, true);
  assert.equal(keptApplied.clearedConflictRows, 1);
  assert.equal(keptApplied.preservedAppliedRows, 1);
  assert.deepEqual(inbox(withApplied).filter(row => row.apply_status === 'applied'),
    [{ mutation_id: 'remote-applied-1', apply_status: 'applied' }], 'applied rows must survive');
  withApplied.native.close();

  // 5) An activated ledger is never touched.
  const activated = createDb();
  await failOneAttempt(activated);
  activated.native.prepare('UPDATE ledger_sync_state_v8 SET activated_at=? WHERE ledger_id=? AND restore_epoch=?').run(now, LEDGER, EPOCH);
  const activeResult = await resetFinancialV2ShadowValidationStateV8({ namespace: NS, database: activated });
  assert.equal(activeResult.ok, false);
  assert.equal(activeResult.reason, 'financial_v2_shadow_reset_already_activated');
  assert.equal(inbox(activated).length, 2, 'an activated ledger must keep every inbox row');
  assert.equal(state(activated).shadow_last_server_sequence, 234, 'an activated ledger must keep its cursor');
  activated.native.close();

  // 6) A moved production cursor is the recovery case, not this one.
  const production = createDb();
  await failOneAttempt(production);
  production.native.prepare('UPDATE ledger_sync_state_v8 SET last_server_sequence=? WHERE ledger_id=? AND restore_epoch=?').run(217, LEDGER, EPOCH);
  const productionResult = await resetFinancialV2ShadowValidationStateV8({ namespace: NS, database: production });
  assert.equal(productionResult.ok, false);
  assert.equal(productionResult.reason, 'financial_v2_shadow_reset_production_cursor_present');
  assert.equal(inbox(production).length, 2);
  assert.equal(state(production).shadow_last_server_sequence, 234);
  production.native.close();

  // 7) Running it on a clean ledger is a harmless no-op.
  const clean = createDb();
  const cleanResult = await resetFinancialV2ShadowValidationStateV8({ namespace: NS, database: clean });
  assert.equal(cleanResult.ok, true);
  assert.equal(cleanResult.clearedConflictRows, 0);
  assert.equal(cleanResult.preservedAppliedRows, 0);
  clean.native.close();

  console.log('MYFI P20 V2 SHADOW VALIDATION RESET RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
