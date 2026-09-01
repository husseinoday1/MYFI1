// Phase 12 — an actual SQLite proof that conflict recovery first keeps a full
// private local checkpoint.  The cloud is intentionally absent from this test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
let source = fs.readFileSync(filename, 'utf8')
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
      'const clearColdArchiveNamespaceInTransaction = async ({ database, namespace }) => {',
      '  await database.runAsync("DELETE FROM cold_archive_transactions WHERE namespace=?", namespace);',
      '  await database.runAsync("DELETE FROM cold_archive_years WHERE namespace=?", namespace);',
      '};',
      'const replaceColdArchiveNamespaceFromStageInTransaction = async ({ database, namespace, stageNamespace }) => {',
      '  await clearColdArchiveNamespaceInTransaction({ database, namespace });',
      '  await database.runAsync("INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) SELECT ?,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json FROM cold_archive_years WHERE namespace=?", namespace, stageNamespace);',
      '  await database.runAsync("INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,payload_json) SELECT ?,scope,year,id,date_iso,payload_json FROM cold_archive_transactions WHERE namespace=?", namespace, stageNamespace);',
      '};',
    ].join('\n'),
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/,
    [
      'const advanceLiveGenerationForMutationInTransactionV13 = async () => ({ generation: 0 });',
      'const rebindLiveGenerationForRestoreEpochInTransactionV13 = async () => ({ generation: 0 });',
      'const readLiveGenerationInTransactionV13 = async ({ database, namespace, ledgerId, restoreEpoch }) => {',
      '  const row = await database.getFirstAsync("SELECT value FROM ledger_v7_meta WHERE key=?", `financial_live_generation_v13:${namespace}`);',
      '  const token = JSON.parse(String(row?.value || "{}"));',
      '  if (token.namespace !== namespace || token.ledgerId !== ledgerId || Number(token.restoreEpoch) !== Number(restoreEpoch)) throw new Error("financial_live_generation_binding_invalid");',
      '  return token;',
      '};',
    ].join('\n'),
  )
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');
source += '\nmodule.exports = { createFinancialConflictRecoveryCheckpointV1 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { createFinancialConflictRecoveryCheckpointV1 } = compiled.exports;

class Db {
  constructor() {
    this.native = new DatabaseSync(':memory:');
    this.native.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE ledger_v7_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
      CREATE TABLE ledger_sync_identity_v8 (namespace TEXT PRIMARY KEY, ledger_id TEXT, restore_epoch INTEGER, protocol_version INTEGER, minimum_supported_version INTEGER, created_at TEXT, updated_at TEXT);
      CREATE TABLE ledger_sync_state_v8 (ledger_id TEXT, restore_epoch INTEGER, activated_at TEXT);
      CREATE TABLE ledger_accounts_v7 (namespace TEXT,id TEXT,name TEXT,account_type TEXT,scope TEXT,currency_code TEXT,status TEXT,created_at TEXT,updated_at TEXT,archived_at TEXT);
      CREATE TABLE ledger_exchange_rates_v7 (namespace TEXT,id TEXT,base_currency_code TEXT,quote_currency_code TEXT,numerator INTEGER,denominator INTEGER,rate_date TEXT,source TEXT,captured_at TEXT);
      CREATE TABLE ledger_financial_transactions_v7 (namespace TEXT,id TEXT,kind TEXT,status TEXT,scope TEXT,date_iso TEXT,occurred_at TEXT,category_id TEXT,title TEXT,note TEXT,source_type TEXT,source_id TEXT,idempotency_key TEXT,device_id TEXT,revision INTEGER,archive_year INTEGER,archived_at TEXT,deleted_at TEXT,payload_json TEXT,created_at TEXT,updated_at TEXT);
      CREATE TABLE ledger_postings_v7 (namespace TEXT,id TEXT,transaction_id TEXT,account_id TEXT,bucket TEXT,role TEXT,amount_minor INTEGER,currency_code TEXT,exchange_rate_id TEXT,created_at TEXT);
      CREATE TABLE ledger_transaction_links_v7 (namespace TEXT,id TEXT,transaction_id TEXT,link_type TEXT,link_id TEXT,relation TEXT,applied_amount_minor INTEGER,currency_code TEXT,created_at TEXT);
      CREATE TABLE ledger_entities_v7 (namespace TEXT,entity_type TEXT,id TEXT,revision INTEGER,deleted_at TEXT,payload_json TEXT,created_at TEXT,updated_at TEXT);
      CREATE TABLE ledger_workspace_state_v7 (namespace TEXT PRIMARY KEY,source_mode TEXT,schema_version INTEGER,shadow_checksum TEXT,shadow_verified_at TEXT,cutover_at TEXT,last_reconciled_at TEXT,payload_json TEXT,updated_at TEXT);
      CREATE TABLE cold_archive_years (namespace TEXT,scope TEXT,year INTEGER,archived_at TEXT,checksum TEXT,transaction_count INTEGER,income INTEGER,expense INTEGER,net INTEGER,metadata_json TEXT);
      CREATE TABLE cold_archive_transactions (namespace TEXT,scope TEXT,year INTEGER,id TEXT,date_iso TEXT,payload_json TEXT);
    `);
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const result = this.native.prepare(String(sql)).run(...params); return { changes: Number(result.changes || 0) }; }
}

const NS = 'user:conflict-checkpoint';
const LEDGER = 'ledger-conflict-checkpoint';
const ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now = '2026-09-01T10:00:00.000Z';
const count = (db, table, namespace) => Number(db.native.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE namespace=?`).get(namespace).n);

(async () => {
  const db = new Db();
  globalThis.__TEST_DB__ = db;
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8 VALUES (?,?,?,?,?,?,?)', NS, LEDGER, 1, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8 VALUES (?,?,?)', LEDGER, 1, now);
  run('INSERT INTO ledger_v7_meta VALUES (?,?,?)', `financial_live_generation_v13:${NS}`, JSON.stringify({ tokenVersion: 1, namespace: NS, ledgerId: LEDGER, restoreEpoch: 1, generation: 8 }), now);
  run('INSERT INTO ledger_workspace_state_v7 VALUES (?,?,?,?,?,?,?,?,?)', NS, 'sqlite', 12, 'hash', now, now, now, '{"cfg":{"currency":"IQD"}}', now);
  run('INSERT INTO ledger_accounts_v7 VALUES (?,?,?,?,?,?,?,?,?,?)', NS, 'wallet-1', 'Cash', 'cash', 'personal', 'IQD', 'active', now, now, null);
  run('INSERT INTO ledger_financial_transactions_v7 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', NS, 'tx-1', 'expense', 'posted', 'personal', '2026-09-01', now, 'food', 'Food', '', 'manual', '', 'key-1', 'device-1', 1, null, null, null, '{}', now, now);
  run('INSERT INTO ledger_postings_v7 VALUES (?,?,?,?,?,?,?,?,?,?)', NS, 'post-1', 'tx-1', 'wallet-1', 'physical', 'principal', -1000, 'IQD', null, now);
  run('INSERT INTO ledger_entities_v7 VALUES (?,?,?,?,?,?,?,?)', NS, 'workspace', 'workspace', 7, null, '{}', now, now);
  run('INSERT INTO cold_archive_years VALUES (?,?,?,?,?,?,?,?,?,?)', NS, 'personal', 2025, now, 'cold', 1, 1000, -500, 500, '{}');
  run('INSERT INTO cold_archive_transactions VALUES (?,?,?,?,?,?)', NS, 'personal', 2025, 'cold-1', '2025-01-01', '{}');

  const result = await createFinancialConflictRecoveryCheckpointV1({ namespace: NS, checkpointId: ID, database: db });
  assert.equal(result.ok, true, JSON.stringify(result));
  const target = result.checkpoint.checkpointNamespace;
  for (const table of ['ledger_accounts_v7','ledger_financial_transactions_v7','ledger_postings_v7','ledger_entities_v7','ledger_workspace_state_v7','cold_archive_years','cold_archive_transactions']) {
    assert.equal(count(db, table, target), count(db, table, NS), `${table} must be copied to the private checkpoint`);
  }
  assert.equal(count(db, 'ledger_financial_transactions_v7', NS), 1, 'the live ledger must remain intact');
  assert.equal(result.checkpoint.sourceGeneration, 8, 'checkpoint must bind the live generation it copied');
  const repeated = await createFinancialConflictRecoveryCheckpointV1({ namespace: NS, checkpointId: ID, database: db });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.reason, 'financial_v2_conflict_checkpoint_already_exists');
  console.log('MYFI P20 V2 CONFLICT RECOVERY CHECKPOINT RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
