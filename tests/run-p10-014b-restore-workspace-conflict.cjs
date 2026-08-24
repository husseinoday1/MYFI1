const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialRestorePreflightConflictV13.js');
let source = fs.readFileSync(filename, 'utf8').replace(/export const /g, 'const ');
source += '\nmodule.exports = { quarantineRestoreWorkspaceConflictInTransactionV13 };\n';
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { quarantineRestoreWorkspaceConflictInTransactionV13 } = compiled.exports;

class AsyncDb {
  constructor() { this.db = new DatabaseSync(':memory:'); this.db.exec('PRAGMA foreign_keys=ON'); }
  exec(sql) { this.db.exec(sql); }
  async getFirstAsync(sql, ...params) { return this.db.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.db.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) {
    const result = this.db.prepare(String(sql)).run(...params);
    return { changes: Number(result.changes || 0) };
  }
  close() { this.db.close(); }
}

const namespace = 'user:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ledgerId = 'ledger-ba098ed86e9dd3e171d255f415545191';
const operationId = '11111111-1111-4111-8111-111111111111';
const payload = JSON.stringify({
  namespace, entityType: 'workspace', id: 'workspace', revision: 2, baseRevision: 1,
  deletedAt: null, payload: { cfg: { currency: 'IQD' }, cloudRevision: 0 },
  createdAt: '2026-08-24T00:00:00.000Z', updatedAt: '2026-08-24T00:00:00.000Z',
});

const setup = ({ unsafeFinancial = false, mismatchedPair = false } = {}) => {
  const db = new AsyncDb();
  db.exec(`
    CREATE TABLE ledger_sync_identity_v8(namespace TEXT PRIMARY KEY,ledger_id TEXT,restore_epoch INTEGER);
    CREATE TABLE ledger_sync_state_v8(ledger_id TEXT,restore_epoch INTEGER,activated_at TEXT);
    CREATE TABLE ledger_accounts_v7(namespace TEXT,id TEXT,archived_at TEXT);
    CREATE TABLE ledger_financial_transactions_v7(namespace TEXT,id TEXT);
    CREATE TABLE ledger_exchange_rates_v7(namespace TEXT,id TEXT);
    CREATE TABLE ledger_postings_v7(namespace TEXT,id TEXT);
    CREATE TABLE ledger_transaction_links_v7(namespace TEXT,id TEXT);
    CREATE TABLE ledger_entities_v7(namespace TEXT,entity_type TEXT,id TEXT,payload_json TEXT,deleted_at TEXT);
    CREATE TABLE ledger_outbox_v3(sequence_id INTEGER PRIMARY KEY,mutation_id TEXT,command_id TEXT,namespace TEXT,ledger_id TEXT,restore_epoch INTEGER,entity_type TEXT,entity_id TEXT,operation TEXT,revision INTEGER,base_revision INTEGER,payload_json TEXT,attempts INTEGER,last_error TEXT,acknowledged_at TEXT,superseded_by_bootstrap_id TEXT,superseded_at TEXT);
    CREATE TABLE ledger_outbox_v2(sequence_id INTEGER PRIMARY KEY,mutation_id TEXT,namespace TEXT,entity_type TEXT,entity_id TEXT,operation TEXT,entity_revision INTEGER,payload_json TEXT,attempts INTEGER,last_error TEXT,acknowledged_at TEXT,next_attempt_at TEXT);
    CREATE TABLE ledger_v7_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  `);
  db.db.prepare('INSERT INTO ledger_sync_identity_v8 VALUES (?,?,2)').run(namespace, ledgerId);
  db.db.prepare("INSERT INTO ledger_sync_state_v8 VALUES (?,2,'active')").run(ledgerId);
  db.db.prepare("INSERT INTO ledger_entities_v7 VALUES (?,'wallet','wallet_cash',?,NULL)")
    .run(namespace, JSON.stringify({ openingBalance: 0, openingBaseBalance: 0 }));
  db.db.prepare("INSERT INTO ledger_entities_v7 VALUES (?,'workspace','workspace',?,NULL)")
    .run(namespace, JSON.stringify({ cfg: { currency: 'IQD' }, cloudRevision: 0 }));
  db.db.prepare("INSERT INTO ledger_outbox_v3 VALUES (46,'mut-v3','cmd-v3',?,?,2,'workspace','workspace','upsert',2,1,?,0,NULL,NULL,NULL,NULL)")
    .run(namespace, ledgerId, payload);
  db.db.prepare("INSERT INTO ledger_outbox_v2 VALUES (41,'mut-v2',?,'workspace','workspace','upsert',2,?,0,NULL,NULL,NULL)")
    .run(namespace, mismatchedPair ? payload.replace('IQD', 'USD') : payload);
  if (unsafeFinancial) db.db.prepare('INSERT INTO ledger_financial_transactions_v7 VALUES (?,?)').run(namespace, 'tx-real');
  return db;
};

(async () => {
  {
    const db = setup();
    const result = await quarantineRestoreWorkspaceConflictInTransactionV13({
      database: db, namespace, ledgerId, restoreEpoch: 2, operationId,
    });
    assert.equal(result.financialShellEmpty, true);
    assert.deepEqual(result.revisions, [2]);
    const shadow = await db.getFirstAsync('SELECT superseded_by_bootstrap_id,superseded_at FROM ledger_outbox_v3');
    const legacy = await db.getFirstAsync('SELECT acknowledged_at FROM ledger_outbox_v2');
    assert.equal(shadow.superseded_by_bootstrap_id, `restore-preflight:${operationId}`);
    assert.ok(shadow.superseded_at);
    assert.ok(legacy.acknowledged_at);
    const marker = await db.getFirstAsync("SELECT value FROM ledger_v7_meta WHERE key LIKE 'canonical_restore_workspace_conflict_v13:%'");
    assert.ok(marker?.value);
    assert.equal(JSON.parse(marker.value).payloadsPersisted, false);
    db.close();
  }
  {
    const db = setup({ unsafeFinancial: true });
    await assert.rejects(
      quarantineRestoreWorkspaceConflictInTransactionV13({ database: db, namespace, ledgerId, restoreEpoch: 2, operationId }),
      /financial_shell_not_empty/,
    );
    assert.equal((await db.getFirstAsync('SELECT superseded_at FROM ledger_outbox_v3')).superseded_at, null);
    db.close();
  }
  {
    const db = setup({ mismatchedPair: true });
    await assert.rejects(
      quarantineRestoreWorkspaceConflictInTransactionV13({ database: db, namespace, ledgerId, restoreEpoch: 2, operationId }),
      /outbox_pair_mismatch/,
    );
    assert.equal((await db.getFirstAsync('SELECT superseded_at FROM ledger_outbox_v3')).superseded_at, null);
    db.close();
  }
  console.log('[PASS] P10-014B restore workspace-conflict quarantine');
})();
