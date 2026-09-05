// MYFI — SQLite proof for adopting a different cloud ledger identity.
//
// Three real accounts sat permanently blocked behind
// financial_v2_ledger_id_conflict on 2026-09-05. The existing promotion cannot
// serve them: it requires the local identity to equal the cloud one, and it
// clears ledger_outbox_v3 by the CLOUD ledger id -- which in an adoption would
// leave the owner's pending rows on disk under an identity nothing reads again.
// That specific outcome is what the first test below exists to prevent.
//
// Runs against a real SQLite database, not mocks of the repository.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));

const load = (rel, transform) => {
  const filename = path.join(root, rel);
  let source = fs.readFileSync(filename, 'utf8');
  source = transform ? transform(source) : source;
  source = source.replace(/^export const /gm, 'const ');
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};

// The decision layer is used for real; only the transaction runner is doubled,
// so what is under test is this module's own SQL and ordering.
const adoption = load('src/lib/financialV2IdentityAdoptionV1.js', s =>
  `${s}\nmodule.exports = { ADOPTION_INTENT_STATUS, adoptionReadinessV1 };\n`);
globalThis.__ADOPTION__ = adoption;

const promotion = load('src/lib/financialV2IdentityAdoptionPromotionV1.js', s => s
  .replace(
    "import { runFinancialRestorePromotionTransactionV8 } from './financialLedgerV7Repository';",
    // Late-bound: each case installs its own runner after this module loads.
    'const runFinancialRestorePromotionTransactionV8 = (...args) => globalThis.__RUN_TX__(...args);',
  )
  .replace(
    /import \{ ADOPTION_INTENT_STATUS, adoptionReadinessV1 \} from '\.\/financialV2IdentityAdoptionV1';/,
    'const { ADOPTION_INTENT_STATUS, adoptionReadinessV1 } = globalThis.__ADOPTION__;',
  )
  + '\nmodule.exports = { promoteCloudIdentityAdoptionV1, adoptionIntentKey, adoptionReentryQueueKey };\n');

class Db {
  constructor() {
    this.native = new DatabaseSync(':memory:');
    this.native.exec(`
      CREATE TABLE ledger_v7_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
      CREATE TABLE ledger_sync_identity_v8 (namespace TEXT PRIMARY KEY, ledger_id TEXT, restore_epoch INTEGER, protocol_version INTEGER, minimum_supported_version INTEGER, created_at TEXT, updated_at TEXT);
      CREATE TABLE ledger_sync_state_v8 (ledger_id TEXT, restore_epoch INTEGER, shadow_last_server_sequence INTEGER, last_server_sequence INTEGER, last_shadow_success_at TEXT, last_success_at TEXT, activated_at TEXT, last_device_id TEXT, updated_at TEXT);
      CREATE TABLE ledger_sync_state_v7 (namespace TEXT);
      CREATE TABLE ledger_bootstrap_state_v8 (namespace TEXT, ledger_id TEXT, restore_epoch INTEGER, bootstrap_id TEXT, stage_namespace TEXT, checkpoint_outbox_sequence INTEGER, status TEXT, expected_row_count INTEGER, manifest_hash TEXT, created_at TEXT, finalized_at TEXT, last_error TEXT);
      CREATE TABLE ledger_bootstrap_import_state_v8 (ledger_id TEXT, restore_epoch INTEGER);
      CREATE TABLE ledger_outbox_v3 (sequence_id INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT, ledger_id TEXT, restore_epoch INTEGER, mutation_id TEXT, command_id TEXT, entity_type TEXT, entity_id TEXT, operation TEXT, revision INTEGER, base_revision INTEGER, payload_json TEXT, created_at TEXT, acknowledged_at TEXT, superseded_by_bootstrap_id TEXT);
      CREATE TABLE ledger_inbox_v3 (ledger_id TEXT, restore_epoch INTEGER);
      CREATE TABLE ledger_outbox_v2 (namespace TEXT);
      CREATE TABLE ledger_inbox_v2 (namespace TEXT);
      CREATE TABLE ledger_financial_transactions_v7 (namespace TEXT, id TEXT, payload_json TEXT);
      CREATE TABLE cold_archive_transactions (namespace TEXT, id TEXT);
      CREATE TABLE ledger_bootstrap_recovery_import_v9 (namespace TEXT, session_id TEXT, stage_namespace TEXT, status TEXT);
      CREATE TABLE ledger_archive_recovery_import_v11 (namespace TEXT, session_id TEXT, stage_namespace TEXT, status TEXT);
    `);
  }
  async getFirstAsync(sql, ...p) { return this.native.prepare(String(sql)).get(...p) || null; }
  async getAllAsync(sql, ...p) { return this.native.prepare(String(sql)).all(...p); }
  async runAsync(sql, ...p) { const r = this.native.prepare(String(sql)).run(...p); return { changes: Number(r.changes || 0) }; }
}

const NS = 'user:adopt-me';
const OWNER = 'account-adopt';
const LOCAL_LEDGER = 'ledger-local-aaaaaaaaaaaaaaaaaaaaaaaa';
const CLOUD_LEDGER = 'ledger-cloud-bbbbbbbbbbbbbbbbbbbbbbbb';
const MANIFEST = 'a'.repeat(64);
const NOW = '2026-09-05T10:00:00.000Z';
const HOT = 'hot-session-1';
const COLD = 'cold-session-1';

const cloudSource = {
  ledgerId: CLOUD_LEDGER, restoreEpoch: 3, bootstrapId: 'bootstrap-1',
  manifestHash: MANIFEST, expectedRowCount: 2,
};

const buildDb = ({ intentStatus = adoption.ADOPTION_INTENT_STATUS, localLedger = LOCAL_LEDGER } = {}) => {
  const db = new Db();
  const run = (sql, ...p) => db.native.prepare(sql).run(...p);
  run('INSERT INTO ledger_sync_identity_v8 VALUES (?,?,?,?,?,?,?)', NS, localLedger, 1, 2, 2, NOW, NOW);
  run('INSERT INTO ledger_sync_state_v8 VALUES (?,?,?,?,?,?,?,?,?)', localLedger, 1, 0, 0, null, null, NOW, null, NOW);
  run('INSERT INTO ledger_bootstrap_recovery_import_v9 VALUES (?,?,?,?)', NS, HOT, `${NS}::stage-hot`, 'ready');
  run('INSERT INTO ledger_archive_recovery_import_v11 VALUES (?,?,?,?)', NS, COLD, `${NS}::stage-cold`, 'ready');
  // The owner's real pending work, under the OLD local ledger id.
  run("INSERT INTO ledger_outbox_v3 (namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,payload_json,created_at,acknowledged_at,superseded_by_bootstrap_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)",
    NS, localLedger, 1, 'mut-keep', 'cmd-1', 'financial_transaction', 'tx-keep', 'upsert', 1, 0,
    JSON.stringify({ originalTransaction: { title: 'Salary', baseAmount: 2250000, dateISO: '2026-09-01' } }), NOW);
  run("INSERT INTO ledger_outbox_v3 (namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,payload_json,created_at,acknowledged_at,superseded_by_bootstrap_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)",
    NS, localLedger, 1, 'mut-drop', 'cmd-2', 'debt', 'debt-drop', 'upsert', 1, 0,
    JSON.stringify({ payload: { name: 'Old debt', total: 500 } }), NOW);
  const intent = {
    version: 1, status: intentStatus, namespace: NS, accountId: OWNER,
    cloud: { ...cloudSource },
    local: { ledgerId: localLedger, restoreEpoch: 1 },
  };
  run('INSERT INTO ledger_v7_meta VALUES (?,?,?)', promotion.adoptionIntentKey(NS), JSON.stringify(intent), NOW);
  return db;
};

// Only the transaction runner is doubled; the SQL under test is real.
const installRunner = (db, { failAfterTask = false } = {}) => {
  globalThis.__RUN_TX__ = async ({ task }) => {
    db.native.exec('BEGIN IMMEDIATE');
    try {
      const value = await task({
        database: db,
        clearFinancialNamespace: async ns => { await db.runAsync('DELETE FROM ledger_financial_transactions_v7 WHERE namespace=?', ns); },
        replaceColdArchiveNamespaceFromStage: async ({ namespace }) => { await db.runAsync('DELETE FROM cold_archive_transactions WHERE namespace=?', namespace); },
        copyFinancialNamespaceFromStage: async ({ namespace, stageNamespace }) => {
          await db.runAsync('INSERT INTO ledger_financial_transactions_v7(namespace,id,payload_json) SELECT ?,id,payload_json FROM ledger_financial_transactions_v7 WHERE namespace=?', namespace, stageNamespace);
        },
      });
      if (failAfterTask) throw new Error('injected_failure_after_task');
      db.native.exec('COMMIT');
      return value;
    } catch (error) { db.native.exec('ROLLBACK'); throw error; }
  };
};

const decisions = { 'mut-keep': 'keep', 'mut-drop': 'discard' };
const call = (db, over = {}) => promotion.promoteCloudIdentityAdoptionV1({
  namespace: NS, accountId: OWNER, bootstrapSessionId: HOT, archiveSessionId: COLD,
  bootstrapSource: cloudSource, archiveHead: { archiveGeneration: 2 },
  decisions, confirmed: true, database: db, ...over,
});

(async () => {


  // --- the happy path, and the orphan bug it exists to avoid ----------------
  {
    const db = buildDb();
    installRunner(db);
    // Cloud rows waiting in the hot stage.
    db.native.prepare('INSERT INTO ledger_financial_transactions_v7 VALUES (?,?,?)').run(`${NS}::stage-hot`, 'cloud-tx', '{}');
    const result = await call(db);
    assert.equal(result.ok, true, JSON.stringify(result));

    const identity = db.native.prepare('SELECT * FROM ledger_sync_identity_v8 WHERE namespace=?').get(NS);
    assert.equal(identity.ledger_id, CLOUD_LEDGER, 'the cloud identity must be adopted');
    assert.equal(Number(identity.restore_epoch), 3);

    // THE regression this whole module exists for: the owner's pending rows
    // lived under the OLD ledger id. Clearing by the cloud id (what the
    // existing promotion does) would leave them on disk, unreachable forever.
    const leftovers = db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?').get(LOCAL_LEDGER).n;
    assert.equal(Number(leftovers), 0, 'old-ledger outbox rows must not be orphaned by the identity swap');

    // Kept work survives; discarded work does not.
    const queue = JSON.parse(db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(promotion.adoptionReentryQueueKey(NS)).value);
    assert.equal(queue.entries.length, 1, 'only the kept mutation is queued for re-entry');
    assert.equal(queue.entries[0].entityId, 'tx-keep');
    assert.equal(queue.previousLedgerId, LOCAL_LEDGER);
    assert.equal(queue.adoptedLedgerId, CLOUD_LEDGER);
    assert.equal(result.kept, 1);
    assert.equal(result.discarded, 1);

    // Cloud data actually landed.
    assert.equal(
      Number(db.native.prepare('SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?').get(NS).n),
      1, 'the verified cloud copy must replace the local projection',
    );
    const receipt = JSON.parse(db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(promotion.adoptionIntentKey(NS)).value);
    assert.equal(receipt.status, 'identity_adopted_pending_activation');
  }

  // --- refusals -------------------------------------------------------------

  // Identities converged since review: this is no longer an adoption.
  {
    const db = buildDb({ localLedger: CLOUD_LEDGER });
    installRunner(db);
    const result = await call(db);
    assert.equal(result.ok, false);
    assert.match(result.reason, /not_applicable_same_ledger/);
  }

  // A row the owner never ruled on blocks everything, and nothing changes.
  {
    const db = buildDb();
    installRunner(db);
    const result = await call(db, { decisions: { 'mut-keep': 'keep' } });
    assert.equal(result.ok, false);
    assert.match(result.reason, /undecided/);
    assert.equal(
      db.native.prepare('SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=?').get(NS).ledger_id,
      LOCAL_LEDGER, 'a blocked adoption must leave the identity untouched',
    );
    assert.equal(Number(db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3').get().n), 2, 'and must leave the pending rows intact');
  }

  // A mutation created AFTER the review must not ride along on decisions that
  // never covered it.
  {
    const db = buildDb();
    installRunner(db);
    db.native.prepare("INSERT INTO ledger_outbox_v3 (namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,payload_json,created_at,acknowledged_at,superseded_by_bootstrap_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)")
      .run(NS, LOCAL_LEDGER, 1, 'mut-late', 'cmd-3', 'commitment', 'c-late', 'upsert', 1, 0, '{}', NOW);
    const result = await call(db);
    assert.equal(result.ok, false, 'a late mutation must block the adoption');
    assert.match(result.reason, /undecided/);
  }

  // Wrong intent status, and a missing confirmation, both refuse.
  {
    const db = buildDb({ intentStatus: 'something_else' });
    installRunner(db);
    assert.match((await call(db)).reason, /intent_missing/);
  }
  {
    const db = buildDb();
    installRunner(db);
    assert.match((await call(db, { confirmed: false })).reason, /confirmation_required/);
  }

  // Stage not READY must refuse before anything is touched.
  {
    const db = buildDb();
    installRunner(db);
    db.native.prepare('UPDATE ledger_bootstrap_recovery_import_v9 SET status=? WHERE session_id=?').run('verifying', HOT);
    const result = await call(db);
    assert.equal(result.ok, false);
    assert.match(result.reason, /stage_not_ready/);
  }

  // --- all-or-nothing --------------------------------------------------------
  // A failure after the work must roll back every part of it, including the
  // identity swap. A half-adopted device is the worst possible outcome.
  {
    const db = buildDb();
    installRunner(db, { failAfterTask: true });
    db.native.prepare('INSERT INTO ledger_financial_transactions_v7 VALUES (?,?,?)').run(`${NS}::stage-hot`, 'cloud-tx', '{}');
    const result = await call(db);
    assert.equal(result.ok, false);
    assert.equal(
      db.native.prepare('SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=?').get(NS).ledger_id,
      LOCAL_LEDGER, 'the identity swap must roll back with everything else',
    );
    assert.equal(Number(db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?').get(LOCAL_LEDGER).n), 2,
      'the pending rows must survive a rolled-back adoption');
    assert.equal(db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(promotion.adoptionReentryQueueKey(NS)), undefined,
      'no re-entry queue may survive a rolled-back adoption');
  }

  console.log('MYFI V2 IDENTITY ADOPTION PROMOTION SQLITE RUNTIME: PASSED');
})();
