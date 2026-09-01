// Phase 12 — real SQLite proof for signed-in "delete this device".
// It must preserve no financial payload or transport history, retain only the
// opaque identity CAS anchor, and reject unsynchronised changes without writes.
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
      'const runLedgerExclusiveTransaction = async (db, fn) => {',
      "  db.native.exec('BEGIN IMMEDIATE');",
      "  try { const result = await fn(db); db.native.exec('COMMIT'); return result; }",
      "  catch (error) { db.native.exec('ROLLBACK'); throw error; }",
      '};',
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
      'const FINANCIAL_LEDGER_SCHEMA_VERSION = 12;',
    ].join('\n'),
  )
  .replace("import { cloudWorkspaceCfg, mergeCloudWorkspaceCfg } from './cloudWorkspaceMetadata.js';", metadataSource)
  .replace(
    /import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
    [
      'const ensureColdArchiveSchema = async () => true;',
      'const clearColdArchiveNamespaceInTransaction = async ({ database, namespace }) => {',
      '  await database.runAsync(`DELETE FROM cold_archive_transactions WHERE namespace=?`, namespace);',
      '  await database.runAsync(`DELETE FROM cold_archive_years WHERE namespace=?`, namespace);',
      '};',
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
source += '\nmodule.exports = { clearLocalFinancialDataForCloudRecoveryV8 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { clearLocalFinancialDataForCloudRecoveryV8 } = compiled.exports;

class SqliteHarness {
  constructor() {
    this.native = new DatabaseSync(':memory:');
    this.native.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE ledger_sync_identity_v8 (namespace TEXT PRIMARY KEY, ledger_id TEXT NOT NULL UNIQUE, restore_epoch INTEGER NOT NULL, protocol_version INTEGER NOT NULL, minimum_supported_version INTEGER NOT NULL, created_at TEXT, updated_at TEXT);
      CREATE TABLE ledger_sync_state_v8 (ledger_id TEXT NOT NULL, restore_epoch INTEGER NOT NULL, activated_at TEXT, last_server_sequence INTEGER DEFAULT 0, PRIMARY KEY(ledger_id,restore_epoch));
      CREATE TABLE ledger_outbox_v3 (namespace TEXT, ledger_id TEXT, restore_epoch INTEGER, acknowledged_at TEXT, superseded_by_bootstrap_id TEXT);
      CREATE TABLE ledger_inbox_v3 (ledger_id TEXT, restore_epoch INTEGER);
      CREATE TABLE ledger_bootstrap_state_v8 (ledger_id TEXT, restore_epoch INTEGER);
      CREATE TABLE ledger_bootstrap_import_state_v8 (ledger_id TEXT, restore_epoch INTEGER);
      CREATE TABLE ledger_outbox_v2 (namespace TEXT); CREATE TABLE ledger_inbox_v2 (namespace TEXT); CREATE TABLE ledger_sync_state_v7 (namespace TEXT); CREATE TABLE ledger_migration_audits_v7 (namespace TEXT);
      CREATE TABLE ledger_transaction_links_v7 (namespace TEXT); CREATE TABLE ledger_postings_v7 (namespace TEXT); CREATE TABLE ledger_financial_transactions_v7 (namespace TEXT); CREATE TABLE ledger_exchange_rates_v7 (namespace TEXT); CREATE TABLE ledger_accounts_v7 (namespace TEXT); CREATE TABLE ledger_entities_v7 (namespace TEXT); CREATE TABLE ledger_workspace_state_v7 (namespace TEXT);
      CREATE TABLE cold_archive_years (namespace TEXT); CREATE TABLE cold_archive_transactions (namespace TEXT);
      CREATE TABLE ledger_bootstrap_recovery_import_v9 (namespace TEXT, session_id TEXT, stage_namespace TEXT, status TEXT); CREATE TABLE ledger_bootstrap_recovery_rows_v10 (namespace TEXT, session_id TEXT);
      CREATE TABLE ledger_archive_recovery_import_v11 (namespace TEXT, session_id TEXT, stage_namespace TEXT, status TEXT); CREATE TABLE ledger_archive_recovery_rows_v12 (namespace TEXT, session_id TEXT);
      CREATE TABLE ledger_v7_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    `);
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) {
    const result = this.native.prepare(String(sql)).run(...params);
    return { changes: Number(result.changes || 0) };
  }
}

const NS = 'user:cloud-delete';
const LEDGER = 'ledger-cloud-delete';
const now = '2026-08-31T12:00:00.000Z';
const count = (db, table, where = '', ...params) => Number(db.native.prepare(`SELECT COUNT(*) AS n FROM ${table}${where}`).get(...params).n);

const seed = ({ pending = false } = {}) => {
  const db = new SqliteHarness();
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8 VALUES (?,?,?,?,?,?,?)', NS, LEDGER, 2, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8 VALUES (?,?,?,0)', LEDGER, 2, now);
  run('INSERT INTO ledger_outbox_v3 VALUES (?,?,?,?,?)', NS, LEDGER, 2, pending ? null : now, null);
  for (const table of [
    'ledger_inbox_v3','ledger_bootstrap_state_v8','ledger_bootstrap_import_state_v8','ledger_outbox_v2','ledger_inbox_v2','ledger_sync_state_v7','ledger_migration_audits_v7',
    'ledger_transaction_links_v7','ledger_postings_v7','ledger_financial_transactions_v7','ledger_exchange_rates_v7','ledger_accounts_v7','ledger_entities_v7','ledger_workspace_state_v7','cold_archive_years','cold_archive_transactions',
  ]) run(`INSERT INTO ${table} (${table.includes('ledger_inbox_v3') || table.includes('bootstrap') ? 'ledger_id,restore_epoch' : 'namespace'}) VALUES (${table.includes('ledger_inbox_v3') || table.includes('bootstrap') ? '?,?' : '?'})`, ...(table.includes('ledger_inbox_v3') || table.includes('bootstrap') ? [LEDGER, 2] : [NS]));
  run('INSERT INTO ledger_bootstrap_recovery_import_v9 VALUES (?,?,?,?)', NS, 'failed-hot', 'hot-stage', 'failed');
  run('INSERT INTO ledger_archive_recovery_import_v11 VALUES (?,?,?,?)', NS, 'failed-cold', 'cold-stage', 'failed');
  run('INSERT INTO ledger_financial_transactions_v7 VALUES (?)', 'hot-stage');
  run('INSERT INTO cold_archive_years VALUES (?)', 'cold-stage');
  for (const key of [
    `active_sync_protocol:${NS}`, `sync_v2_activation_evidence:${NS}:${LEDGER}:2`,
    `bootstrap_recovery_promotion_v1:${NS}`, `financial_live_generation_v13:${NS}`,
    'schema_version',
  ]) run('INSERT INTO ledger_v7_meta VALUES (?,?,?)', key, '{}', now);
  return db;
};

(async () => {
  const clean = seed();
  globalThis.__TEST_DB__ = clean;
  const result = await clearLocalFinancialDataForCloudRecoveryV8({ namespace: NS, database: clean });
  assert.equal(result.ok, true);
  assert.equal(result.retainedLedgerId, LEDGER);
  assert.equal(count(clean, 'ledger_sync_identity_v8', ' WHERE namespace=?', NS), 1, 'identity is the only retained recovery anchor');
  for (const table of [
    'ledger_sync_state_v8','ledger_outbox_v3','ledger_inbox_v3','ledger_bootstrap_state_v8','ledger_bootstrap_import_state_v8',
    'ledger_outbox_v2','ledger_inbox_v2','ledger_sync_state_v7','ledger_migration_audits_v7',
    'ledger_transaction_links_v7','ledger_postings_v7','ledger_financial_transactions_v7','ledger_exchange_rates_v7','ledger_accounts_v7','ledger_entities_v7','ledger_workspace_state_v7','cold_archive_years','cold_archive_transactions',
    'ledger_bootstrap_recovery_import_v9','ledger_bootstrap_recovery_rows_v10','ledger_archive_recovery_import_v11','ledger_archive_recovery_rows_v12',
  ]) assert.equal(count(clean, table), 0, `${table} must be removed from the device`);
  assert.equal(count(clean, 'ledger_financial_transactions_v7', ' WHERE namespace=?', 'hot-stage'), 0, 'failed hot stage must not survive');
  assert.equal(count(clean, 'cold_archive_years', ' WHERE namespace=?', 'cold-stage'), 0, 'failed archive stage must not survive');
  assert.equal(count(clean, 'ledger_v7_meta', ' WHERE key=?', 'schema_version'), 1, 'global schema metadata must survive');
  assert.equal(count(clean, 'ledger_v7_meta', ' WHERE key LIKE ?', `%${NS}%`), 0, 'all namespace-scoped metadata must be removed');

  const pending = seed({ pending: true });
  globalThis.__TEST_DB__ = pending;
  const blocked = await clearLocalFinancialDataForCloudRecoveryV8({ namespace: NS, database: pending });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'local_reset_cloud_sync_pending');
  assert.equal(count(pending, 'ledger_financial_transactions_v7', ' WHERE namespace=?', NS), 1, 'pending data must remain untouched');
  assert.equal(count(pending, 'ledger_outbox_v3', ' WHERE ledger_id=?', LEDGER), 1, 'pending outbox must remain untouched');
  console.log('MYFI P20 LOCAL CLOUD DELETE RECOVERY RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
