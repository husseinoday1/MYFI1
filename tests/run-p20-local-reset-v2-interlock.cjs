// P20 local-reset safety regression: a signed-out device can still carry V2
// transport state. This is a runtime SQLite test, not a source-text contract.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
const metadataSource = fs.readFileSync(path.join(root, 'src/lib/cloudWorkspaceMetadata.js'), 'utf8')
  .replace(/export const /g, 'const ');

let source = fs.readFileSync(filename, 'utf8');
source = source
  .replace("import { Platform } from 'react-native';", "const Platform = { OS: 'android' };")
  .replace(
    "import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';",
    [
      'const enqueueLedgerWrite = fn => fn();',
      'const getLedgerDb = async () => globalThis.__TEST_DB__;',
      'const runLedgerExclusiveTransaction = async (db, fn) => fn(db);',
    ].join('\n'),
  )
  .replace(
    "import { runLedgerSchemaMigrations } from './financialLedgerSchemaMigrations';",
    'const runLedgerSchemaMigrations = async () => true;',
  )
  .replace(
    /import \{\s*buildExpenseLedgerCommand,\s*buildFinancialLedgerCommand,\s*FINANCIAL_LEDGER_SCHEMA_VERSION,\s*\} from '\.\/financialLedgerV7Model';/,
    [
      'const buildExpenseLedgerCommand = () => null;',
      'const buildFinancialLedgerCommand = () => null;',
      'const FINANCIAL_LEDGER_SCHEMA_VERSION = 8;',
    ].join('\n'),
  )
  .replace("import { cloudWorkspaceCfg, mergeCloudWorkspaceCfg } from './cloudWorkspaceMetadata.js';", metadataSource)
  .replace(
    /import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
    [
      'const ensureColdArchiveSchema = async () => true;',
      'const clearColdArchiveNamespaceInTransaction = async () => true;',
      'const replaceColdArchiveNamespaceFromStageInTransaction = async () => true;',
    ].join('\n'),
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/,
    [
      'const advanceLiveGenerationForMutationInTransactionV13 = async () => ({ generation: 0 });',
      'const rebindLiveGenerationForRestoreEpochInTransactionV13 = async () => ({ generation: 0 });',
    ].join('\n'),
  )
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');
source += '\nmodule.exports = { inspectLocalFinancialResetSafetyV8 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { inspectLocalFinancialResetSafetyV8 } = compiled.exports;

class SqliteHarness {
  constructor() {
    this.native = new DatabaseSync(':memory:');
    this.writeCalls = 0;
    this.native.exec(`
      CREATE TABLE ledger_sync_identity_v8 (
        namespace TEXT PRIMARY KEY, ledger_id TEXT NOT NULL,
        restore_epoch INTEGER NOT NULL, protocol_version INTEGER NOT NULL,
        minimum_supported_version INTEGER NOT NULL, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE ledger_sync_state_v8 (
        ledger_id TEXT NOT NULL, restore_epoch INTEGER NOT NULL,
        activated_at TEXT, last_server_sequence INTEGER DEFAULT 0,
        PRIMARY KEY (ledger_id, restore_epoch)
      );
      CREATE TABLE ledger_outbox_v3 (
        ledger_id TEXT NOT NULL, restore_epoch INTEGER NOT NULL
      );
      CREATE TABLE ledger_v7_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    `);
  }
  async getFirstAsync(sql, ...params) {
    return this.native.prepare(String(sql)).get(...params) || null;
  }
  async runAsync() {
    this.writeCalls += 1;
    throw new Error('local_reset_safety_must_not_write');
  }
}

const NS = 'user:reset-safety';
const LEDGER = 'ledger-reset-safety';
const now = '2026-08-31T12:00:00.000Z';

const seedIdentity = db => db.native.prepare(
  `INSERT INTO ledger_sync_identity_v8
   (namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?)`,
).run(NS, LEDGER, 1, 2, 2, now, now);

(async () => {
  // A local identity by itself is inert: onboarding/setup may create it before
  // any V2 transport begins, so deletion remains available in that case.
  const inert = new SqliteHarness();
  seedIdentity(inert);
  globalThis.__TEST_DB__ = inert;
  const inertResult = await inspectLocalFinancialResetSafetyV8({ namespace: NS, database: inert });
  assert.equal(inertResult.blocked, false);
  assert.equal(inertResult.reason, 'v2_identity_inactive');
  assert.equal(inert.writeCalls, 0, 'inspection must not write to SQLite');

  // These three independent remnants are the exact V2 layers a local reset
  // must never partially leave behind. Each alone must block before resetAll
  // can clear and recreate a setup wallet.
  const withSync = new SqliteHarness();
  seedIdentity(withSync);
  withSync.native.prepare(
    'INSERT INTO ledger_sync_state_v8 (ledger_id,restore_epoch,activated_at) VALUES (?,?,?)',
  ).run(LEDGER, 1, now);
  const syncResult = await inspectLocalFinancialResetSafetyV8({ namespace: NS, database: withSync });
  assert.equal(syncResult.blocked, true);
  assert.equal(syncResult.activeProtocolVersion, 2);
  assert.equal(syncResult.hasSyncState, true);
  assert.equal(withSync.writeCalls, 0);

  const withOutbox = new SqliteHarness();
  seedIdentity(withOutbox);
  withOutbox.native.prepare('INSERT INTO ledger_outbox_v3 (ledger_id,restore_epoch) VALUES (?,?)').run(LEDGER, 1);
  const outboxResult = await inspectLocalFinancialResetSafetyV8({ namespace: NS, database: withOutbox });
  assert.equal(outboxResult.blocked, true);
  assert.equal(outboxResult.outboxCount, 1);
  assert.equal(withOutbox.writeCalls, 0);

  const withEvidence = new SqliteHarness();
  seedIdentity(withEvidence);
  withEvidence.native.prepare(
    'INSERT INTO ledger_v7_meta (key,value,updated_at) VALUES (?,?,?)',
  ).run(`sync_v2_activation_evidence:${NS}:${LEDGER}:1`, '{}', now);
  const evidenceResult = await inspectLocalFinancialResetSafetyV8({ namespace: NS, database: withEvidence });
  assert.equal(evidenceResult.blocked, true);
  assert.equal(evidenceResult.metadataCount, 1);
  assert.equal(withEvidence.writeCalls, 0);

  console.log('MYFI P20 LOCAL RESET V2 INTERLOCK RUNTIME: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
