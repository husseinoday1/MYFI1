// Phase 12 — real SQLite proof that a promoted-but-never-activated conflict
// recovery can be rolled back to its private checkpoint. The cloud and the app
// are deliberately absent: this exercises the local transaction only, against
// the repository's own DDL so the foreign-key and CHECK constraints are real.
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

// The same four primitives runFinancialRestorePromotionTransactionV8 hands to
// its task, over one real transaction so a rejection truly rolls everything back.
const makeRunner = fixture => async ({ task }) => {
  const db = fixture.db;
  const clearHot = async namespace => {
    for (const table of ['ledger_transaction_links_v7', 'ledger_postings_v7', 'ledger_financial_transactions_v7', 'ledger_exchange_rates_v7', 'ledger_accounts_v7', 'ledger_entities_v7', 'ledger_workspace_state_v7']) {
      await db.runAsync(`DELETE FROM ${table} WHERE namespace=?`, namespace);
    }
  };
  const clearCold = async namespace => {
    await db.runAsync('DELETE FROM cold_archive_transactions WHERE namespace=?', namespace);
    await db.runAsync('DELETE FROM cold_archive_years WHERE namespace=?', namespace);
  };
  const copyHot = async ({ namespace, stageNamespace, includeWorkspaceState }) => {
    if (fixture.badCopy) throw new Error('injected_copy_failure');
    for (const [table, columns] of [
      ['ledger_accounts_v7', 'id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at'],
      ['ledger_exchange_rates_v7', 'id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at'],
      ['ledger_financial_transactions_v7', 'id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at'],
      ['ledger_postings_v7', 'id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at'],
      ['ledger_transaction_links_v7', 'id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at'],
      ['ledger_entities_v7', 'entity_type,id,revision,deleted_at,payload_json,created_at,updated_at'],
    ]) await db.runAsync(`INSERT INTO ${table}(namespace,${columns}) SELECT ?,${columns} FROM ${table} WHERE namespace=?`, namespace, stageNamespace);
    if (includeWorkspaceState) {
      await db.runAsync('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at) SELECT ?,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at FROM ledger_workspace_state_v7 WHERE namespace=?', namespace, stageNamespace);
    }
  };
  const replaceCold = async ({ namespace, stageNamespace }) => {
    await clearCold(namespace);
    await db.runAsync('INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) SELECT ?,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json FROM cold_archive_years WHERE namespace=?', namespace, stageNamespace);
    await db.runAsync('INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) SELECT ?,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json FROM cold_archive_transactions WHERE namespace=?', namespace, stageNamespace);
  };
  db.native.exec('BEGIN IMMEDIATE');
  try {
    const result = await task({
      database: db,
      clearFinancialNamespace: clearHot,
      clearColdArchiveNamespace: clearCold,
      copyFinancialNamespaceFromStage: copyHot,
      replaceColdArchiveNamespaceFromStage: replaceCold,
    });
    db.native.exec('COMMIT');
    return result;
  } catch (error) { db.native.exec('ROLLBACK'); throw error; }
};

const compileRestore = repoMock => {
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

const NS = 'user:phase12-restore';
const LEDGER = 'ledger-phase12-restore';
const OTHER_NS = 'user:phase12-restore-other';
const OTHER_LEDGER = 'ledger-phase12-restore-other';
const CHECKPOINT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STAGE = `${NS}::conflict-recovery-checkpoint::${CHECKPOINT_ID}`;
const now = '2026-09-02T10:00:00.000Z';
// The checkpoint's own moment is the boundary. Work queued before it survives
// the restore; work queued after it is what the restore removes.
const BEFORE_CHECKPOINT = '2026-09-02T09:30:00.000Z';
const AFTER_CHECKPOINT = ['2026-09-02T11:45:47.000Z', '2026-09-02T12:09:51.000Z', '2026-09-02T12:57:16.000Z'];
const intentKey = `financial_v2_conflict_recovery_intent_v1:${NS}`;
const receiptKey = `financial_v2_conflict_checkpoint_v1:${NS}:${CHECKPOINT_ID}`;

// The checkpoint holds the owner's real ledger; the live namespace holds the
// frozen cloud snapshot a failed promotion installed over it. They must differ
// in every table the restore is expected to bring back.
const CHECKPOINT_COUNTS = {
  accounts: 1, exchangeRates: 0, transactions: 2, postings: 2, links: 0,
  entities: 2, workspace: 1, coldArchiveYears: 1, coldArchiveTransactions: 1,
};

const createFixture = ({ status = 'local_promoted_pending_activation' } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  db.native.exec(`
    CREATE TABLE cold_archive_years (namespace TEXT NOT NULL, scope TEXT NOT NULL, year INTEGER NOT NULL, archived_at TEXT NOT NULL, checksum TEXT, transaction_count INTEGER NOT NULL DEFAULT 0, income REAL NOT NULL DEFAULT 0, expense REAL NOT NULL DEFAULT 0, net REAL NOT NULL DEFAULT 0, metadata_json TEXT NOT NULL, PRIMARY KEY(namespace,scope,year));
    CREATE TABLE cold_archive_transactions (namespace TEXT NOT NULL, scope TEXT NOT NULL, year INTEGER NOT NULL, id TEXT NOT NULL, date_iso TEXT, ts INTEGER NOT NULL DEFAULT 0, wallet_id TEXT, category_id TEXT, flow_type TEXT, search_text TEXT, payload_json TEXT NOT NULL, PRIMARY KEY(namespace,scope,year,id), FOREIGN KEY(namespace,scope,year) REFERENCES cold_archive_years(namespace,scope,year) ON DELETE CASCADE);
  `);
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_currencies(code,minor_exponent,enabled) VALUES (?,?,?)', 'IQD', 3, 1);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, 1, 2, 2, now, now);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', OTHER_NS, OTHER_LEDGER, 1, 2, 2, now, now);

  const account = (namespace, id) => run('INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)', namespace, id, 'Cash', 'cash', 'personal', 'IQD', 'active', now, now);
  const transaction = (namespace, id) => run('INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?)', namespace, id, 'expense', 'posted', 'personal', '2026-09-01', now, 'food', id, '', 'manual', '', `key-${id}`, 'device-1', 1, '{}', now, now);
  const posting = (namespace, id, transactionId, accountId) => run('INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at) VALUES (?,?,?,?,?,?,?,?,NULL,?)', namespace, id, transactionId, accountId, 'physical', 'principal', -1000, 'IQD', now);
  const entity = (namespace, type, id, revision, payload) => run('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)', namespace, type, id, revision, payload, now, now);
  const workspace = (namespace, payload) => run('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at) VALUES (?,?,?,NULL,NULL,NULL,NULL,?,?)', namespace, 'sqlite', 12, payload, now);

  // The owner's real data, preserved in the private checkpoint.
  account(STAGE, 'wallet-1');
  transaction(STAGE, 'tx-real-1');
  transaction(STAGE, 'tx-real-2');
  posting(STAGE, 'post-1', 'tx-real-1', 'wallet-1');
  posting(STAGE, 'post-2', 'tx-real-2', 'wallet-1');
  entity(STAGE, 'workspace', 'workspace', 2, '{"cloudRevision":2}');
  entity(STAGE, 'wallet', 'wallet-1', 1, '{"openingBalance":0}');
  workspace(STAGE, '{"checkpoint":true}');
  run('INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)', STAGE, 'personal', 2025, now, 'checksum', 1, 20, 5, 15, '{}');
  run('INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)', STAGE, 'personal', 2025, 'cold-real', '2025-01-01', 1, 'wallet-1', 'food', 'expense', 'real', '{}');

  // The stale cloud snapshot the failed promotion installed as the live ledger.
  account(NS, 'wallet-bootstrap');
  entity(NS, 'workspace', 'workspace', 5, '{"cloudRevision":5}');
  workspace(NS, '{"bootstrap":true}');

  run('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', receiptKey, JSON.stringify({
    version: 1, namespace: NS, checkpointId: CHECKPOINT_ID, checkpointNamespace: STAGE,
    ledgerId: LEDGER, restoreEpoch: 1, sourceGeneration: 8, counts: CHECKPOINT_COUNTS, createdAt: now,
  }), now);
  run('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', intentKey, JSON.stringify({
    version: 1, status, namespace: NS, accountId: 'account-1',
    cloud: { ledgerId: LEDGER, restoreEpoch: 1 },
    local: { checkpointId: CHECKPOINT_ID, checkpointNamespace: STAGE, sourceGeneration: 8, cloudWorkspaceRevision: 7 },
    preparedAt: now,
  }), now);

  // A pending row written *before* the checkpoint: its result is inside the
  // checkpoint, so the restore brings it back and the row stays a valid upload.
  // It must survive.
  run('INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', NS, LEDGER, 1, 'preserved-1', 'cmd-preserved', 'wallet', 'wallet-1', 'upsert', 2, 1, 2, 2, 1, '{"kept":true}', BEFORE_CHECKPOINT);

  // The three rejected retries the failed recovery accumulated afterwards, plus
  // one row of another ledger that this restore must never touch.
  for (const [index, revision] of [3, 4, 5].entries()) {
    run('INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', NS, LEDGER, 1, `stale-${index}`, `cmd-${index}`, 'workspace', 'workspace', 'upsert', revision, revision - 1, 2, 2, 1, `{"stale":${revision}}`, AFTER_CHECKPOINT[index]);
  }
  run('INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', OTHER_NS, OTHER_LEDGER, 1, 'other-1', 'cmd-other', 'workspace', 'workspace', 'upsert', 2, 1, 2, 2, 1, '{}', now);

  const fixture = { db };
  const restore = compileRestore({ runFinancialRestorePromotionTransactionV8: makeRunner(fixture) }).restoreFinancialConflictRecoveryCheckpointV1;
  return { db, fixture, restore };
};

const count = (db, table, namespace) => Number(db.native.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE namespace=?`).get(namespace).n);
const outbox = (db, ledgerId) => Number(db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?').get(ledgerId).n);
const meta = (db, key) => JSON.parse(db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(key).value);
const assertLiveStillPromoted = (db, message) => {
  assert.equal(count(db, 'ledger_financial_transactions_v7', NS), 0, message);
  assert.equal(db.native.prepare('SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=?').get(NS).payload_json, '{"bootstrap":true}', message);
  assert.equal(outbox(db, LEDGER), 4, message);
  assert.equal(meta(db, intentKey).status !== 'rolled_back_after_activation_failure', true, message);
};

(async () => {
  // 1) The restore itself: the owner's ledger comes back exactly as checkpointed.
  const success = createFixture();
  const restored = await success.restore({ namespace: NS, checkpointId: CHECKPOINT_ID, database: success.db });
  assert.equal(restored.ok, true, JSON.stringify(restored));
  assert.equal(restored.status, 'rolled_back_after_activation_failure');
  for (const [key, table] of Object.entries({
    accounts: 'ledger_accounts_v7', transactions: 'ledger_financial_transactions_v7',
    postings: 'ledger_postings_v7', entities: 'ledger_entities_v7', workspace: 'ledger_workspace_state_v7',
    coldArchiveYears: 'cold_archive_years', coldArchiveTransactions: 'cold_archive_transactions',
  })) {
    assert.equal(count(success.db, table, NS), CHECKPOINT_COUNTS[key], `${table} must match the checkpoint after restore`);
  }
  assert.equal(success.db.native.prepare('SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=?').get(NS).payload_json, '{"checkpoint":true}', 'workspace state must come from the checkpoint');
  assert.equal(success.db.native.prepare('SELECT revision FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=?').get(NS, 'workspace', 'workspace').revision, 2, 'the checkpoint workspace revision must replace the promoted one');
  assert.equal(count(success.db, 'ledger_accounts_v7', NS), 1);
  assert.equal(success.db.native.prepare('SELECT COUNT(*) AS n FROM ledger_accounts_v7 WHERE namespace=? AND id=?').get(NS, 'wallet-bootstrap').n, 0, 'the promoted snapshot must be gone');
  assert.equal(outbox(success.db, LEDGER), 1, 'only the rows queued after the checkpoint may be discarded');
  assert.equal(success.db.native.prepare('SELECT mutation_id FROM ledger_outbox_v3 WHERE ledger_id=?').get(LEDGER).mutation_id, 'preserved-1', 'a row whose result the checkpoint holds must survive the restore');
  assert.equal(outbox(success.db, OTHER_LEDGER), 1, 'another ledger\'s outbox must never be touched');
  const rolledBack = meta(success.db, intentKey);
  assert.equal(rolledBack.status, 'rolled_back_after_activation_failure', 'the intent must be updated, not deleted');
  assert.equal(rolledBack.restoredFrom.checkpointId, CHECKPOINT_ID);
  assert.equal(rolledBack.preparedAt, now, 'the original intent evidence must be preserved');
  // The rows the restore had to remove are the last trace of work it undid, so
  // they are kept verbatim rather than simply dropped.
  assert.equal(rolledBack.strandedPendingCommands.rowCount, 3);
  assert.equal(rolledBack.strandedPendingCommands.boundary, now, 'the checkpoint moment is the boundary');
  assert.deepEqual(rolledBack.strandedPendingCommands.rows.map(row => row.mutation_id), ['stale-0', 'stale-1', 'stale-2']);
  assert.equal(rolledBack.strandedPendingCommands.rows[2].payload_json, '{"stale":5}',
    'each removed command must keep its payload');
  assert.equal(rolledBack.strandedPendingCommands.rows[0].created_at, AFTER_CHECKPOINT[0]);
  assert.equal(count(success.db, 'ledger_financial_transactions_v7', STAGE), 2, 'the checkpoint itself must survive the restore');
  assert.equal(meta(success.db, receiptKey).checkpointId, CHECKPOINT_ID, 'the checkpoint receipt must survive the restore');
  const repeated = await success.restore({ namespace: NS, checkpointId: CHECKPOINT_ID, database: success.db });
  assert.equal(repeated.ok, false, 'a restored intent must not be restorable twice');
  assert.equal(repeated.reason, 'financial_v2_conflict_recovery_restore_intent_not_restorable');
  success.db.native.close();

  // 2) Refusal outside the one allowed state: nothing at all may change.
  const prepared = createFixture({ status: 'ready_for_explicit_cloud_replacement' });
  const rejected = await prepared.restore({ namespace: NS, checkpointId: CHECKPOINT_ID, database: prepared.db });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'financial_v2_conflict_recovery_restore_intent_not_restorable');
  assertLiveStillPromoted(prepared.db, 'a prepared-only intent must leave every row untouched');
  assert.equal(meta(prepared.db, intentKey).status, 'ready_for_explicit_cloud_replacement');
  prepared.db.native.close();

  // 3) A damaged checkpoint must be detected *before* the live rows are cleared.
  const damaged = createFixture();
  damaged.db.native.prepare('DELETE FROM ledger_postings_v7 WHERE namespace=? AND id=?').run(STAGE, 'post-2');
  const damagedResult = await damaged.restore({ namespace: NS, checkpointId: CHECKPOINT_ID, database: damaged.db });
  assert.equal(damagedResult.ok, false);
  assert.equal(damagedResult.reason, 'financial_v2_conflict_recovery_restore_checkpoint_incomplete');
  assertLiveStillPromoted(damaged.db, 'an incomplete checkpoint must not destroy the current live data');
  damaged.db.native.close();

  // 4) A failure after the live namespace is cleared must roll everything back.
  const interrupted = createFixture();
  interrupted.fixture.badCopy = true;
  const interruptedResult = await interrupted.restore({ namespace: NS, checkpointId: CHECKPOINT_ID, database: interrupted.db });
  assert.equal(interruptedResult.ok, false);
  assert.equal(interruptedResult.reason, 'injected_copy_failure');
  assertLiveStillPromoted(interrupted.db, 'a copy failure must roll back to the promoted state');
  assert.equal(count(interrupted.db, 'ledger_financial_transactions_v7', STAGE), 2, 'a rolled-back attempt must keep the checkpoint');
  interrupted.db.native.close();

  console.log('MYFI P20 V2 CONFLICT RECOVERY RESTORE RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
