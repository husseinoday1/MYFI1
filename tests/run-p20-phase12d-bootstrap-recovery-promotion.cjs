// Phase 12-D: real SQLite proof that promotion is all-or-nothing. The app and
// cloud are deliberately not involved; this exercises the same local promotion
// code with a hot stage, an archive stage and a pre-existing empty V2 identity.
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

const prepare = (db, namespace = 'user:phase12d', { badCopy = false } = {}) => {
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V9_BOOTSTRAP_RECOVERY_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V10_BOOTSTRAP_RECOVERY_STAGE_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V11_ARCHIVE_RECOVERY_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V12_ARCHIVE_RECOVERY_STAGE_SQL'));
  db.native.exec(`
    CREATE TABLE cold_archive_years (namespace TEXT NOT NULL, scope TEXT NOT NULL, year INTEGER NOT NULL, archived_at TEXT NOT NULL, checksum TEXT, transaction_count INTEGER NOT NULL DEFAULT 0, income REAL NOT NULL DEFAULT 0, expense REAL NOT NULL DEFAULT 0, net REAL NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL, PRIMARY KEY(namespace,scope,year));
    CREATE TABLE cold_archive_transactions (namespace TEXT NOT NULL, scope TEXT NOT NULL, year INTEGER NOT NULL, id TEXT NOT NULL, date_iso TEXT, ts INTEGER NOT NULL DEFAULT 0, wallet_id TEXT, category_id TEXT, flow_type TEXT, search_text TEXT, payload_json TEXT NOT NULL, PRIMARY KEY(namespace,scope,year,id), FOREIGN KEY(namespace,scope,year) REFERENCES cold_archive_years(namespace,scope,year) ON DELETE CASCADE);
  `);
  const now = '2026-08-31T00:00:00.000Z';
  const oldLedger = `ledger-old-${namespace}`;
  const remoteLedger = `ledger-remote-${namespace}`;
  const hotStage = `bootstrap-recovery-stage:hot-${namespace}`;
  const coldStage = `archive-recovery-stage:cold-${namespace}`;
  db.native.prepare('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(namespace, oldLedger, 1, 2, 2, now, now);
  db.native.prepare('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)').run(namespace, 'sqlite', 9, '{"old":true}', now);
  db.native.prepare('INSERT INTO ledger_bootstrap_recovery_import_v9(namespace,session_id,account_id,source_ledger_id,source_restore_epoch,source_bootstrap_id,source_manifest_hash,expected_row_count,stage_namespace,status,last_cloud_row_ordinal,proof_digest,created_at,updated_at,verified_at,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)').run(namespace, 'hot', 'account-1', remoteLedger, 7, 'bootstrap-1', 'a'.repeat(64), 3, hotStage, 'ready', 3, 'b'.repeat(64), now, now, now);
  db.native.prepare('INSERT INTO ledger_archive_recovery_import_v11(namespace,session_id,account_id,source_ledger_id,source_restore_epoch,archive_present,source_archive_generation,source_snapshot_id,source_manifest_hash,expected_row_count,stage_namespace,status,last_cloud_row_ordinal,proof_digest,created_at,updated_at,verified_at,last_error) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)').run(namespace, 'cold', 'account-1', remoteLedger, 7, 1, 2, 'archive-1', 'c'.repeat(64), 2, coldStage, 'ready', 2, 'd'.repeat(64), now, now, now);
  db.native.prepare('INSERT INTO ledger_currencies(code,minor_exponent,enabled) VALUES (?,?,?)').run('IQD', 3, 1);
  db.native.prepare('INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)').run(hotStage, 'wallet-remote', 'Remote wallet', 'cash', 'personal', 'IQD', 'active', now, now);
  db.native.prepare('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)').run(hotStage, 'shadow', 9, '{"remote":true}', now);
  db.native.prepare('INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)').run(coldStage, 'personal', 2025, now, 'checksum', 1, 20, 5, 15, '{}');
  db.native.prepare('INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(coldStage, 'personal', 2025, 'old-row', '2025-01-01', 1, '', '', 'expense', 'old', '{}');
  return { namespace, oldLedger, remoteLedger, hotStage, coldStage, badCopy };
};

const makeRunner = fixture => async ({ task }) => {
  const db = fixture.db;
  db.native.exec('BEGIN IMMEDIATE');
  const clearHot = async namespace => {
    for (const table of ['ledger_transaction_links_v7','ledger_postings_v7','ledger_financial_transactions_v7','ledger_exchange_rates_v7','ledger_accounts_v7','ledger_entities_v7','ledger_workspace_state_v7']) await db.runAsync(`DELETE FROM ${table} WHERE namespace=?`, namespace);
  };
  const copyHot = async ({ namespace, stageNamespace, includeWorkspaceState }) => {
    if (fixture.badCopy) throw new Error('injected_copy_failure');
    for (const [table, columns] of [
      ['ledger_accounts_v7','id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at'],
      ['ledger_exchange_rates_v7','id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at'],
      ['ledger_financial_transactions_v7','id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at'],
      ['ledger_postings_v7','id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at'],
      ['ledger_transaction_links_v7','id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at'],
      ['ledger_entities_v7','entity_type,id,revision,deleted_at,payload_json,created_at,updated_at'],
    ]) await db.runAsync(`INSERT INTO ${table}(namespace,${columns}) SELECT ?,${columns} FROM ${table} WHERE namespace=?`, namespace, stageNamespace);
    if (includeWorkspaceState) await db.runAsync(`INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at) SELECT ?,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at FROM ledger_workspace_state_v7 WHERE namespace=?`, namespace, stageNamespace);
  };
  const replaceArchive = async ({ namespace, stageNamespace }) => {
    await db.runAsync('DELETE FROM cold_archive_transactions WHERE namespace=?', namespace);
    await db.runAsync('DELETE FROM cold_archive_years WHERE namespace=?', namespace);
    await db.runAsync('INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) SELECT ?,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json FROM cold_archive_years WHERE namespace=?', namespace, stageNamespace);
    await db.runAsync('INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) SELECT ?,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json FROM cold_archive_transactions WHERE namespace=?', namespace, stageNamespace);
  };
  try {
    const result = await task({ database: db, clearFinancialNamespace: clearHot, copyFinancialNamespaceFromStage: copyHot, replaceColdArchiveNamespaceFromStage: replaceArchive });
    db.native.exec('COMMIT');
    return result;
  } catch (error) { db.native.exec('ROLLBACK'); throw error; }
};

const sources = fixture => ({
  bootstrapSource: { ledgerId: fixture.remoteLedger, restoreEpoch: 7, bootstrapId: 'bootstrap-1', manifestHash: 'a'.repeat(64), expectedRowCount: 3 },
  archiveHead: { ledgerId: fixture.remoteLedger, restoreEpoch: 7, archivePresent: true, archiveGeneration: 2, snapshotId: 'archive-1', manifestHash: 'c'.repeat(64), expectedRowCount: 2 },
});

const compilePromotion = repoMock => {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === target && request === './financialLedgerV7Repository') return repoMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(target, module); compiled.filename = target; compiled.paths = Module._nodeModulePaths(path.dirname(target));
    compiled._compile(babel.transformFileSync(target, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, target);
    return compiled.exports.promoteVerifiedBootstrapRecoveryV2;
  } finally { Module._load = originalLoad; }
};

(async () => {
  const db = new Db(); const fixture = { db, ...prepare(db) };
  const promote = compilePromotion({ runFinancialRestorePromotionTransactionV8: makeRunner(fixture) });
  const base = { namespace: fixture.namespace, accountId: 'account-1', bootstrapSessionId: 'hot', archiveSessionId: 'cold', ...sources(fixture) };
  const mismatched = await promote({ ...base, bootstrapSource: { ...base.bootstrapSource, manifestHash: 'e'.repeat(64) } });
  assert.equal(mismatched.ok, false);
  assert.equal(db.native.prepare('SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=?').get(fixture.namespace).ledger_id, fixture.oldLedger, 'source mismatch must not alter identity');

  fixture.badCopy = true;
  const rolledBack = await promote(base);
  assert.equal(rolledBack.ok, false);
  assert.equal(db.native.prepare('SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=?').get(fixture.namespace).ledger_id, fixture.oldLedger, 'late copy failure must roll back identity');
  assert.equal(db.native.prepare('SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=?').get(fixture.namespace).payload_json, '{"old":true}', 'late copy failure must roll back hot data');
  assert.equal(db.native.prepare('SELECT COUNT(*) AS n FROM cold_archive_years WHERE namespace=?').get(fixture.namespace).n, 0, 'late copy failure must roll back archive replacement');

  fixture.badCopy = false;
  const promoted = await promote(base);
  assert.equal(promoted.ok, true);
  assert.equal(db.native.prepare('SELECT ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?').get(fixture.namespace).ledger_id, fixture.remoteLedger);
  assert.equal(db.native.prepare('SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?').get(fixture.namespace).restore_epoch, 7);
  assert.equal(db.native.prepare('SELECT COUNT(*) AS n FROM ledger_accounts_v7 WHERE namespace=?').get(fixture.namespace).n, 1);
  assert.equal(db.native.prepare('SELECT COUNT(*) AS n FROM cold_archive_transactions WHERE namespace=?').get(fixture.namespace).n, 1);
  assert.equal(db.native.prepare('SELECT status FROM ledger_bootstrap_state_v8 WHERE ledger_id=? AND restore_epoch=?').get(fixture.remoteLedger, 7).status, 'finalized');
  assert.equal(db.native.prepare('SELECT activated_at FROM ledger_sync_state_v8 WHERE ledger_id=? AND restore_epoch=?').get(fixture.remoteLedger, 7).activated_at, null, 'promotion must not activate sync');
  assert.equal(db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(`bootstrap_recovery_promotion_v1:${fixture.namespace}`).value.includes('promoted_pending_activation'), true);
  db.native.close();
  console.log('MYFI P20 PHASE 12-D ATOMIC BOOTSTRAP + ARCHIVE PROMOTION SQLITE RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
