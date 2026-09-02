// Phase 12 — real SQLite proof that shadow validation can replay a *chain* of
// remote commands on one entity. Shadow deliberately never applies, so checking
// each command against the live table made every device more than one revision
// behind fail permanently: command 1 passed, command 2 saw an unchanged local
// revision and raised a CAS conflict. Shadow must validate the chain instead,
// while still writing nothing to the financial tables.
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
      "  db.native.exec('BEGIN IMMEDIATE');",
      "  try { const value = await task(db); db.native.exec('COMMIT'); return value; }",
      "  catch (error) { db.native.exec('ROLLBACK'); throw error; }",
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
source += '\nmodule.exports = { applyRemoteLedgerMutationsV8 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { applyRemoteLedgerMutationsV8 } = compiled.exports;

class Db {
  constructor() { this.native = new DatabaseSync(':memory:'); this.native.exec('PRAGMA foreign_keys=ON;'); }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const out = this.native.prepare(String(sql)).run(...params); return { changes: Number(out.changes || 0) }; }
}

const NS = 'user:shadow-chain';
const LEDGER = 'ledger-shadow-chain';
const EPOCH = 1;
const now = '2026-09-02T10:00:00.000Z';

// The real shape: one device pushed five consecutive workspace revisions while
// this one was stuck, so the cloud is five commands ahead on a single entity.
const workspaceCommand = (revision, sequence) => ({
  ledgerId: LEDGER,
  restoreEpoch: EPOCH,
  mutationId: `remote-workspace-${revision}`,
  serverSequence: sequence,
  commandId: `cmd-workspace-${revision}`,
  commandSequence: sequence,
  commandMutationCount: 1,
  entityType: 'workspace',
  entityId: 'workspace',
  operation: 'upsert',
  revision,
  baseRevision: revision - 1,
  protocolVersion: 2,
  minimumSupportedVersion: 2,
  payloadSchemaVersion: 1,
  payload: { entityType: 'workspace', id: 'workspace', cloudRevision: revision },
});

const CHAIN = [
  workspaceCommand(3, 234),
  workspaceCommand(4, 236),
  workspaceCommand(5, 238),
  workspaceCommand(6, 239),
  workspaceCommand(7, 241),
];

const createDb = ({ localRevision = 2 } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, EPOCH, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,updated_at) VALUES (?,?,?,?,?)', LEDGER, EPOCH, 0, 0, now);
  run('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)', NS, 'sqlite', 12, '{}', now);
  run('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)', NS, 'workspace', 'workspace', localRevision, JSON.stringify({ entityType: 'workspace', id: 'workspace', cloudRevision: localRevision }), now, now);
  globalThis.__TEST_DB__ = db;
  return db;
};

const shadow = (db, mutations, projectedRevisions = null) => applyRemoteLedgerMutationsV8({
  namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutations, deviceId: 'device-test', allowProductionApply: false, database: db,
  projectedRevisions,
});

const entityRevision = db => Number(db.native.prepare('SELECT revision FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=?').get(NS, 'workspace', 'workspace').revision);
const syncState = db => db.native.prepare('SELECT shadow_last_server_sequence,last_server_sequence FROM ledger_sync_state_v8 WHERE ledger_id=? AND restore_epoch=?').get(LEDGER, EPOCH);
const inboxStatuses = db => db.native.prepare('SELECT apply_status FROM ledger_inbox_v3 WHERE ledger_id=? ORDER BY mutation_id').all(LEDGER).map(row => row.apply_status);

(async () => {
  // 1) The whole point: five consecutive commands on one entity must validate.
  const db = createDb();
  const result = await shadow(db, CHAIN);
  assert.equal(result.ok, true, `a five-command chain must pass shadow validation: ${JSON.stringify(result)}`);
  assert.equal(result.processed, 5, 'every command in the chain must be processed');
  assert.equal(result.shadow, true);
  assert.equal(result.applied, 0, 'shadow may never apply anything');

  // Shadow stays read-only against the ledger itself.
  assert.equal(entityRevision(db), 2, 'the live entity revision must not move in shadow');
  assert.equal(syncState(db).last_server_sequence, 0, 'the production cursor must not move in shadow');
  assert.equal(syncState(db).shadow_last_server_sequence, 241, 'the shadow cursor must reach the last command');
  assert.deepEqual([...new Set(inboxStatuses(db))], ['observed'], 'shadow may only record observations');
  db.native.close();

  // 2) A genuinely broken chain must still be refused: a projection must not
  //    turn a real gap into a pass.
  const gapped = createDb();
  const gapResult = await shadow(gapped, [CHAIN[0], workspaceCommand(6, 239)]);
  assert.equal(gapResult.ok, false, 'a gap in the chain must still conflict');
  assert.equal(gapResult.reason, 'financial_v2_remote_cas_conflict');
  assert.equal(entityRevision(gapped), 2);
  gapped.native.close();

  // 3) A chain that does not start where the device stands is still a conflict.
  const behind = createDb({ localRevision: 4 });
  const behindResult = await shadow(behind, CHAIN);
  assert.equal(behindResult.ok, false, 'the first command must still match the real local revision');
  assert.equal(behindResult.reason, 'financial_v2_remote_cas_conflict');
  behind.native.close();

  // 4) A single command still works, and a device exactly one revision behind
  //    keeps behaving as it always did.
  const single = createDb();
  const singleResult = await shadow(single, [CHAIN[0]]);
  assert.equal(singleResult.ok, true, JSON.stringify(singleResult));
  assert.equal(singleResult.processed, 1);
  assert.equal(entityRevision(single), 2);
  single.native.close();

  // 5) Production mode must keep reading the live table, not a projection:
  //    without activation it refuses outright.
  const production = createDb();
  const productionResult = await applyRemoteLedgerMutationsV8({
    namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH,
    mutations: CHAIN, deviceId: 'device-test', allowProductionApply: true, database: production,
  });
  assert.equal(productionResult.ok, false);
  assert.equal(productionResult.reason, 'financial_v2_production_apply_before_activation',
    'production apply must still demand activation first');
  assert.equal(entityRevision(production), 2);
  production.native.close();

  // 6) A chain longer than one page arrives as several calls inside one sync
  //    run. The projection must span them, or the second page reseeds from a
  //    ledger that shadow never advanced and the same lock returns.
  const paged = createDb();
  const runProjection = new Map();
  const firstPage = await shadow(paged, CHAIN.slice(0, 3), runProjection);
  assert.equal(firstPage.ok, true, JSON.stringify(firstPage));
  const secondPage = await shadow(paged, CHAIN.slice(3), runProjection);
  assert.equal(secondPage.ok, true, `the chain must survive a page boundary: ${JSON.stringify(secondPage)}`);
  assert.equal(secondPage.processed, 2);
  assert.equal(entityRevision(paged), 2, 'paging must not make shadow apply anything');
  assert.equal(syncState(paged).last_server_sequence, 0);
  assert.equal(syncState(paged).shadow_last_server_sequence, 241);
  paged.native.close();

  // 7) A shared projection must not weaken the check across pages either.
  const pagedGap = createDb();
  const gapProjection = new Map();
  assert.equal((await shadow(pagedGap, CHAIN.slice(0, 2), gapProjection)).ok, true);
  const pagedGapResult = await shadow(pagedGap, [workspaceCommand(7, 241)], gapProjection);
  assert.equal(pagedGapResult.ok, false, 'a gap across a page boundary must still conflict');
  assert.equal(pagedGapResult.reason, 'financial_v2_remote_cas_conflict');
  pagedGap.native.close();

  console.log('MYFI P20 V2 SHADOW SEQUENTIAL COMMANDS RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
