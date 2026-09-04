// Phase 14 §88 — an old device must not resurrect a tombstoned entity.
//
// The audit could only say "nothing implies a resurrection bug, the scenario is
// untested". This drives the scenario: a device that was offline when an entity
// was deleted comes back and replays the create/edit it still had queued.
//
// It also pins the mechanism, which matters more than the result. Nothing about
// deletion is special-cased here — what stops the resurrection is that the
// tombstone ROW still carries the entity's revision, so v2CurrentRevision
// (financialLedgerV7Repository.js:3101) reads a live number and the stale
// baseRevision fails CAS. That is a direct constraint on §88 retention: purge
// the tombstone row and the same replay finds revision 0 and walks straight in.
// Case 5 proves that, so the cost of "cleaning up" tombstones is on the record
// rather than discovered later.
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
    "import { outboxRetryPlanV1, outboxPermanentFailureCutoffV1 } from './financialOutboxRetryPolicyV1';",
    'const outboxRetryPlanV1 = () => ({ state: "failed_retryable", nextAttemptAt: null, reason: null });\nconst outboxPermanentFailureCutoffV1 = () => ({ maxAttempts: 10, createdAfter: "1970-01-01T00:00:00.000Z" });',
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

const NS = 'user:tombstone';
const LEDGER = 'ledger-tombstone';
const EPOCH = 1;
const now = '2026-09-04T10:00:00.000Z';
const deletedAt = '2026-09-04T11:00:00.000Z';
const WALLET_ID = 'wallet-gone';
const TX_ID = 'c1a2b3c4-d5e6-4789-9abc-def012345678';

// The wallet as the deleting device left it: tombstoned at revision 3.
const createDb = ({ tombstoned = true, purgeTombstone = false, txTombstoned = true } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, EPOCH, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)', LEDGER, EPOCH, 0, 0, now, now);
  run('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)', NS, 'sqlite', 12, '{}', now);
  if (tombstoned && !purgeTombstone) {
    run('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
      NS, 'wallet', WALLET_ID, 3, deletedAt, JSON.stringify({ name: 'Old wallet', deletedAt }), now, deletedAt);
  }
  if (txTombstoned) {
    run('INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?)',
      NS, TX_ID, 'expense', 'posted', 'personal', '2026-09-01', now, 'food', 'Deleted lunch', '', 'manual', '', 'idem-gone', 'device-a', 4, deletedAt,
      JSON.stringify({ id: TX_ID, kind: 'expense', title: 'Deleted lunch', amountMinor: -2500, revision: 4, deletedAt }), now, deletedAt);
  }
  globalThis.__TEST_DB__ = db;
  return db;
};

// What the stale device still had queued: it never saw revision 3 or 4.
const staleWalletUpsert = ({ revision = 3, baseRevision = 2 } = {}) => ({
  ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutationId: `mut-stale-${revision}`, serverSequence: 400 + revision,
  commandId: `cmd-stale-${revision}`, commandSequence: 400 + revision, commandMutationCount: 1,
  entityType: 'wallet', entityId: WALLET_ID, operation: 'upsert',
  revision, baseRevision,
  protocolVersion: 2, minimumSupportedVersion: 2, payloadSchemaVersion: 1,
  payload: { entityType: 'wallet', id: WALLET_ID, revision, payload: { name: 'Resurrected wallet' } },
});

const staleTransactionUpsert = ({ revision = 4, baseRevision = 3 } = {}) => ({
  ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutationId: `mut-tx-${revision}`, serverSequence: 500 + revision,
  commandId: `cmd-tx-${revision}`, commandSequence: 500 + revision, commandMutationCount: 1,
  entityType: 'financial_transaction', entityId: TX_ID, operation: 'upsert',
  revision, baseRevision,
  protocolVersion: 2, minimumSupportedVersion: 2, payloadSchemaVersion: 1,
  payload: {
    transaction: { id: TX_ID, revision, idempotencyKey: 'idem-gone' },
    originalTransaction: { id: TX_ID, kind: 'expense', title: 'Resurrected lunch', amountMinor: -2500, idempotencyKey: 'idem-gone' },
    currencies: [], accounts: [], exchangeRates: [], postings: [], links: [],
  },
});

const apply = (db, mutations, allowProductionApply) => applyRemoteLedgerMutationsV8({
  namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutations, deviceId: 'device-stale', allowProductionApply, database: db,
});
const walletRow = db => db.native.prepare('SELECT revision,deleted_at,payload_json FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=?').get(NS, 'wallet', WALLET_ID);
const txRow = db => db.native.prepare('SELECT revision,deleted_at,title FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=?').get(NS, TX_ID);

(async () => {
  for (const production of [false, true]) {
    const mode = production ? 'production' : 'shadow';

    // 1) The scenario itself: a stale wallet create/edit built on the revision
    //    before the delete. It must be refused, and the tombstone must survive
    //    exactly as it was.
    {
      const db = createDb();
      const before = walletRow(db);
      const result = await apply(db, [staleWalletUpsert()], production);
      assert.equal(result.ok, false, `${mode}: a stale write over a tombstone must not apply`);
      assert.equal(result.reason, 'financial_v2_remote_cas_conflict');
      assert.deepEqual(walletRow(db), before, `${mode}: the tombstone must be untouched`);
      assert.equal(walletRow(db).deleted_at, deletedAt, `${mode}: the entity must stay deleted`);
      db.native.close();
    }

    // 2) The same for a financial transaction — the row that is actually money.
    {
      const db = createDb();
      const before = txRow(db);
      const result = await apply(db, [staleTransactionUpsert()], production);
      assert.equal(result.ok, false, `${mode}: a stale transaction write over a tombstone must not apply`);
      assert.equal(result.reason, 'financial_v2_remote_cas_conflict');
      assert.deepEqual(txRow(db), before, `${mode}: the deleted transaction must not come back`);
      assert.equal(txRow(db).deleted_at, deletedAt);
      db.native.close();
    }

    // 3) A device even further behind is refused the same way. Being staler is
    //    not a loophole: baseRevision 0 is what a device that never knew the
    //    entity existed would send.
    {
      const db = createDb();
      for (const baseRevision of [0, 1]) {
        const result = await apply(db, [staleWalletUpsert({ revision: baseRevision + 1, baseRevision })], production);
        assert.equal(result.ok, false, `${mode}: baseRevision ${baseRevision} must not resurrect`);
        assert.equal(walletRow(db).deleted_at, deletedAt);
      }
      db.native.close();
    }
  }

  // 4) Undelete is a real operation and must still work. The point is that a
  //    resurrection is refused for being STALE, not for touching a tombstone —
  //    a writer that has actually seen the delete may legitimately revive it.
  {
    const db = createDb();
    const result = await apply(db, [staleWalletUpsert({ revision: 4, baseRevision: 3 })], true);
    assert.equal(result.ok, true, `an up-to-date writer may undelete: ${JSON.stringify(result)}`);
    assert.equal(walletRow(db).revision, 4);
    assert.equal(walletRow(db).deleted_at, null, 'an accepted undelete clears the tombstone');
    db.native.close();
  }

  // 5) Why §88 retention cannot simply purge tombstones.
  //
  //    Same stale command, same everything — except the tombstone row has been
  //    removed. v2CurrentRevision now reads 0, the stale baseRevision matches,
  //    and the deleted wallet walks back in. This is the constraint any
  //    retention/compaction design has to answer, so it is pinned here rather
  //    than left as an argument in a document.
  {
    const db = createDb({ purgeTombstone: true });
    assert.equal(walletRow(db), undefined, 'precondition: the tombstone really is gone');
    const result = await apply(db, [staleWalletUpsert({ revision: 1, baseRevision: 0 })], true);
    assert.equal(result.ok, true, 'a purged tombstone stops refusing anything');
    const revived = walletRow(db);
    assert.ok(revived, 'the deleted wallet is back');
    assert.equal(revived.deleted_at, null);
    assert.equal(JSON.parse(revived.payload_json).name, 'Resurrected wallet',
      'and it is back with the stale device content — this is the resurrection §88 exists to prevent');
    db.native.close();
  }

  console.log('MYFI P14 TOMBSTONE RESURRECTION: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
