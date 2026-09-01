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
  db.native.prepare('INSERT INTO ledger_bootstrap_recovery_rows_v10(namespace,session_id,ordinal,row_type,row_key,row_hash,payload_text,received_at) VALUES (?,?,?,?,?,?,?,?)').run(namespace, 'hot', 1, 'currency', 'IQD', '1'.repeat(64), '{"code":"IQD"}', now);
  db.native.prepare('INSERT INTO ledger_bootstrap_recovery_rows_v10(namespace,session_id,ordinal,row_type,row_key,row_hash,payload_text,received_at) VALUES (?,?,?,?,?,?,?,?)').run(namespace, 'hot', 2, 'account', 'wallet-remote', '2'.repeat(64), '{"id":"wallet-remote"}', now);
  db.native.prepare('INSERT INTO ledger_bootstrap_recovery_rows_v10(namespace,session_id,ordinal,row_type,row_key,row_hash,payload_text,received_at) VALUES (?,?,?,?,?,?,?,?)').run(namespace, 'hot', 3, 'workspace_state', 'workspace', '3'.repeat(64), '{"source_mode":"shadow"}', now);
  db.native.prepare('INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)').run(coldStage, 'personal', 2025, now, 'checksum', 1, 20, 5, 15, '{}');
  db.native.prepare('INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(coldStage, 'personal', 2025, 'old-row', '2025-01-01', 1, '', '', 'expense', 'old', '{}');
  db.native.prepare('INSERT INTO ledger_archive_recovery_rows_v12(namespace,session_id,ordinal,row_type,row_key,row_hash,payload_text,received_at) VALUES (?,?,?,?,?,?,?,?)').run(namespace, 'cold', 1, 'archive_year', '["personal",2025]', '4'.repeat(64), '{"scope":"personal","year":2025}', now);
  db.native.prepare('INSERT INTO ledger_archive_recovery_rows_v12(namespace,session_id,ordinal,row_type,row_key,row_hash,payload_text,received_at) VALUES (?,?,?,?,?,?,?,?)').run(namespace, 'cold', 2, 'archive_transaction', '["personal",2025,"old-row"]', '5'.repeat(64), '{"scope":"personal","year":2025,"transaction":{"id":"old-row"}}', now);
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
    if (parent?.filename === target && request === './financialLiveGenerationV13') return { readLiveGenerationInTransactionV13: async () => ({ generation: 0 }) };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(target, module); compiled.filename = target; compiled.paths = Module._nodeModulePaths(path.dirname(target));
    compiled._compile(babel.transformFileSync(target, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, target);
    return compiled.exports;
  } finally { Module._load = originalLoad; }
};

const createConflictPromotionFixture = namespace => {
  const db = new Db(); const fixture = { db, ...prepare(db, namespace) };
  const promote = compilePromotion({ runFinancialRestorePromotionTransactionV8: makeRunner(fixture) }).promotePreparedCloudConflictRecoveryV1;
  const now = '2026-09-01T03:00:00.000Z';
  const checkpointNamespace = `${fixture.namespace}::conflict-recovery-checkpoint::checkpoint-1`;
  fixture.db.native.prepare('UPDATE ledger_bootstrap_recovery_import_v9 SET source_ledger_id=?,source_restore_epoch=?,expected_row_count=? WHERE namespace=? AND session_id=?').run(fixture.oldLedger, 1, 4, fixture.namespace, 'hot');
  fixture.db.native.prepare('UPDATE ledger_archive_recovery_import_v11 SET source_ledger_id=?,source_restore_epoch=? WHERE namespace=?').run(fixture.oldLedger, 1, fixture.namespace);
  fixture.db.native.prepare('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)').run(fixture.oldLedger, 1, 0, 217, now, now);
  fixture.db.native.prepare('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)').run(fixture.namespace, 'workspace', 'workspace', 2, '{}', now, now);
  fixture.db.native.prepare('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)').run(fixture.hotStage, 'workspace', 'workspace', 7, '{}', now, now);
  fixture.db.native.prepare('INSERT INTO ledger_bootstrap_recovery_rows_v10(namespace,session_id,ordinal,row_type,row_key,row_hash,payload_text,received_at) VALUES (?,?,?,?,?,?,?,?)').run(fixture.namespace, 'hot', 4, 'entity', 'workspace', '6'.repeat(64), '{}', now);
  fixture.db.native.prepare('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)').run(checkpointNamespace, 'sqlite', 9, '{"old":true}', now);
  fixture.db.native.prepare('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)').run(`financial_v2_conflict_checkpoint_v1:${fixture.namespace}:checkpoint-1`, JSON.stringify({ version: 1, checkpointId: 'checkpoint-1', checkpointNamespace, ledgerId: fixture.oldLedger, restoreEpoch: 1, sourceGeneration: 0, counts: { accounts: 0, exchangeRates: 0, transactions: 0, postings: 0, links: 0, entities: 0, workspace: 1, coldArchiveYears: 0, coldArchiveTransactions: 0 } }), now);
  fixture.db.native.prepare('INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(fixture.namespace, fixture.oldLedger, 1, 'stale-workspace', 'cmd-workspace', 'workspace', 'workspace', 'upsert', 2, 1, 2, 2, 1, '{}', now);
  const intentKey = `financial_v2_conflict_recovery_intent_v1:${fixture.namespace}`;
  fixture.db.native.prepare('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)').run(intentKey, JSON.stringify({ version: 1, status: 'ready_for_explicit_cloud_replacement', namespace: fixture.namespace, accountId: 'account-1', cloud: { ledgerId: fixture.oldLedger, restoreEpoch: 1, bootstrapId: 'bootstrap-1', manifestHash: 'a'.repeat(64), expectedRowCount: 4, archivePresent: true, archiveGeneration: 2, archiveSnapshotId: 'archive-1', archiveManifestHash: 'c'.repeat(64), archiveExpectedRowCount: 2 }, local: { checkpointId: 'checkpoint-1', sourceGeneration: 0, cloudWorkspaceRevision: 7, staleWorkspaceMutationIds: ['stale-workspace'], staleWorkspaceMutations: [{ sequenceId: 1, mutationId: 'stale-workspace', commandId: 'cmd-workspace', revision: 2, baseRevision: 1, payloadJson: '{}' }] } }), now);
  const args = { namespace: fixture.namespace, accountId: 'account-1', checkpointId: 'checkpoint-1', bootstrapSessionId: 'hot', archiveSessionId: 'cold', confirmed: true, bootstrapSource: { ledgerId: fixture.oldLedger, restoreEpoch: 1, bootstrapId: 'bootstrap-1', manifestHash: 'a'.repeat(64), expectedRowCount: 4 }, archiveHead: { ledgerId: fixture.oldLedger, restoreEpoch: 1, archivePresent: true, archiveGeneration: 2, snapshotId: 'archive-1', manifestHash: 'c'.repeat(64), expectedRowCount: 2 } };
  return { db, fixture, promote, checkpointNamespace, intentKey, args };
};

(async () => {
  const liveDb = new Db(); const liveFixture = { db: liveDb, ...prepare(liveDb, 'user:phase12d-live') };
  const promoteLive = compilePromotion({ runFinancialRestorePromotionTransactionV8: makeRunner(liveFixture) }).promoteVerifiedBootstrapRecoveryV2;
  const liveBase = { namespace: liveFixture.namespace, accountId: 'account-1', bootstrapSessionId: 'hot', archiveSessionId: 'cold', ...sources(liveFixture) };
  liveDb.native.prepare('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)')
    .run(liveFixture.namespace, 'wallet', 'local-live-wallet', 1, JSON.stringify({ openingBalance: 25, openingBaseBalance: 25 }), '2026-08-31T00:00:00.000Z', '2026-08-31T00:00:00.000Z');
  const liveRejected = await promoteLive(liveBase);
  assert.equal(liveRejected.ok, false, 'a live wallet must reject destructive recovery');
  assert.equal(liveRejected.reason, 'financial_v2_bootstrap_recovery_promotion_live_state_present');
  assert.equal(liveDb.native.prepare('SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=?').get(liveFixture.namespace).ledger_id, liveFixture.oldLedger, 'live-state rejection must not alter identity');
  liveDb.native.close();

  const damagedDb = new Db(); const damagedFixture = { db: damagedDb, ...prepare(damagedDb, 'user:phase12d-damaged') };
  const promoteDamaged = compilePromotion({ runFinancialRestorePromotionTransactionV8: makeRunner(damagedFixture) }).promoteVerifiedBootstrapRecoveryV2;
  const damagedBase = { namespace: damagedFixture.namespace, accountId: 'account-1', bootstrapSessionId: 'hot', archiveSessionId: 'cold', ...sources(damagedFixture) };
  damagedDb.native.prepare('DELETE FROM ledger_accounts_v7 WHERE namespace=?').run(damagedFixture.hotStage);
  const damagedRejected = await promoteDamaged(damagedBase);
  assert.equal(damagedRejected.ok, false, 'a ready receipt with a missing materialized row must reject recovery');
  assert.equal(damagedRejected.reason, 'financial_v2_bootstrap_recovery_promotion_hot_stage_incomplete');
  assert.equal(damagedDb.native.prepare('SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=?').get(damagedFixture.namespace).ledger_id, damagedFixture.oldLedger, 'damaged-stage rejection must not alter identity');
  damagedDb.native.close();

  const db = new Db(); const fixture = { db, ...prepare(db) };
  const promote = compilePromotion({ runFinancialRestorePromotionTransactionV8: makeRunner(fixture) }).promoteVerifiedBootstrapRecoveryV2;
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

  // A real non-empty conflict repair: only the previously-proven stale workspace
  // command is discarded, while a complete private checkpoint remains present.
  const successfulConflict = createConflictPromotionFixture('user:phase12d-conflict');
  const conflictResult = await successfulConflict.promote(successfulConflict.args);
  assert.equal(conflictResult.ok, true, JSON.stringify(conflictResult));
  assert.equal(successfulConflict.db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?').get(successfulConflict.fixture.oldLedger).n, 0);
  assert.equal(successfulConflict.db.native.prepare('SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace=?').get(successfulConflict.checkpointNamespace).n, 1, 'private checkpoint must survive promotion');
  assert.equal(JSON.parse(successfulConflict.db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(successfulConflict.intentKey).value).status, 'local_promoted_pending_activation');
  successfulConflict.db.native.close();

  const damagedCheckpoint = createConflictPromotionFixture('user:phase12d-conflict-checkpoint-damaged');
  const receipt = JSON.parse(damagedCheckpoint.db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(`financial_v2_conflict_checkpoint_v1:${damagedCheckpoint.fixture.namespace}:checkpoint-1`).value);
  receipt.counts.workspace = 2;
  damagedCheckpoint.db.native.prepare('UPDATE ledger_v7_meta SET value=? WHERE key=?').run(JSON.stringify(receipt), `financial_v2_conflict_checkpoint_v1:${damagedCheckpoint.fixture.namespace}:checkpoint-1`);
  const damagedCheckpointResult = await damagedCheckpoint.promote(damagedCheckpoint.args);
  assert.equal(damagedCheckpointResult.ok, false);
  assert.equal(damagedCheckpointResult.reason, 'financial_v2_conflict_recovery_promotion_checkpoint_incomplete');
  assert.equal(damagedCheckpoint.db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?').get(damagedCheckpoint.fixture.oldLedger).n, 1, 'checkpoint rejection must not discard the prepared outbox row');
  damagedCheckpoint.db.native.close();

  const addedMutation = createConflictPromotionFixture('user:phase12d-conflict-extra-mutation');
  addedMutation.db.native.prepare('INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(addedMutation.fixture.namespace, addedMutation.fixture.oldLedger, 1, 'unexpected-workspace', 'cmd-unexpected', 'workspace', 'workspace', 'upsert', 2, 1, 2, 2, 1, '{}', '2026-09-01T03:00:01.000Z');
  const addedMutationResult = await addedMutation.promote(addedMutation.args);
  assert.equal(addedMutationResult.ok, false);
  assert.equal(addedMutationResult.reason, 'financial_v2_conflict_recovery_promotion_pending_state_changed');
  assert.equal(addedMutation.db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?').get(addedMutation.fixture.oldLedger).n, 2, 'extra mutation rejection must not discard either outbox row');
  addedMutation.db.native.close();

  const changedMutation = createConflictPromotionFixture('user:phase12d-conflict-changed-mutation');
  changedMutation.db.native.prepare('UPDATE ledger_outbox_v3 SET revision=?,base_revision=? WHERE namespace=? AND mutation_id=?').run(3, 2, changedMutation.fixture.namespace, 'stale-workspace');
  const changedMutationResult = await changedMutation.promote(changedMutation.args);
  assert.equal(changedMutationResult.ok, false);
  assert.equal(changedMutationResult.reason, 'financial_v2_conflict_recovery_promotion_pending_state_changed');
  assert.equal(changedMutation.db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?').get(changedMutation.fixture.oldLedger).n, 1, 'content-change rejection must not discard the outbox row');
  changedMutation.db.native.close();
  console.log('MYFI P20 PHASE 12-D ATOMIC BOOTSTRAP + ARCHIVE PROMOTION SQLITE RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
