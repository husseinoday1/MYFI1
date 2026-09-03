// Phase 12 — a device whose rows came from a recovery holds state that cloud
// history already produced, while its sync cursor still points at the start of
// that history. Replaying it must converge, not deadlock: a command whose exact
// result the ledger already holds is a no-op. A command that only *claims* the
// same revision, with different content, is still a conflict.
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

const NS = 'user:replay';
const LEDGER = 'ledger-replay';
const EPOCH = 1;
const now = '2026-09-02T10:00:00.000Z';
const TX_ID = 'b7563f57-ea5d-4141-a9a7-10e74760c6b3';

// The transaction body the apply path stores verbatim, plus the revision.
const originalTransaction = { id: TX_ID, kind: 'expense', title: 'Coffee', amountMinor: -1500, idempotencyKey: 'idem-1' };
const storedTransactionPayload = revision => JSON.stringify({ ...originalTransaction, revision });

const transactionCommand = ({ revision = 1, sequence = 214, body = originalTransaction } = {}) => ({
  ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutationId: `mut2-${sequence}`, serverSequence: sequence,
  commandId: `cmd2-${sequence}`, commandSequence: sequence, commandMutationCount: 1,
  entityType: 'financial_transaction', entityId: TX_ID, operation: 'upsert',
  revision, baseRevision: revision - 1,
  protocolVersion: 2, minimumSupportedVersion: 2, payloadSchemaVersion: 1,
  payload: {
    transaction: { id: TX_ID, revision, idempotencyKey: 'idem-1' },
    originalTransaction: body,
    currencies: [], accounts: [], exchangeRates: [], postings: [], links: [],
  },
});

const walletCommand = ({ revision = 1, sequence = 215, payload = { name: 'Cash' } } = {}) => ({
  ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutationId: `mut2-${sequence}`, serverSequence: sequence,
  commandId: `cmd2-${sequence}`, commandSequence: sequence, commandMutationCount: 1,
  entityType: 'wallet', entityId: 'wallet-1', operation: 'upsert',
  revision, baseRevision: revision - 1,
  protocolVersion: 2, minimumSupportedVersion: 2, payloadSchemaVersion: 1,
  payload: { entityType: 'wallet', id: 'wallet-1', revision, payload },
});

const createDb = ({ txRevision = 1, txBody = originalTransaction, walletPayload = { name: 'Cash' } } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, EPOCH, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)', LEDGER, EPOCH, 0, 0, now, now);
  run('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)', NS, 'sqlite', 12, '{}', now);
  // The state a checkpoint restore left behind: rows the cloud history produced.
  run('INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?)',
    NS, TX_ID, 'expense', 'posted', 'personal', '2026-09-01', now, 'food', 'Coffee', '', 'manual', '', 'idem-1', 'device-1', txRevision, JSON.stringify({ ...txBody, revision: txRevision }), now, now);
  run('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)',
    NS, 'wallet', 'wallet-1', 1, JSON.stringify(walletPayload), now, now);
  globalThis.__TEST_DB__ = db;
  return db;
};

const apply = (db, mutations, allowProductionApply) => applyRemoteLedgerMutationsV8({
  namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutations, deviceId: 'device-test', allowProductionApply, database: db,
});

const txRow = db => db.native.prepare('SELECT revision,payload_json FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=?').get(NS, TX_ID);
const walletRow = db => db.native.prepare('SELECT revision,payload_json FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=?').get(NS, 'wallet', 'wallet-1');

(async () => {
  for (const production of [false, true]) {
    const mode = production ? 'production' : 'shadow';

    // 1) The device's own case: a creation command for a transaction the ledger
    //    already holds at that exact revision, with that exact content.
    {
      const db = createDb();
      const before = txRow(db);
      const result = await apply(db, [transactionCommand()], production);
      assert.equal(result.ok, true, `${mode}: replayed history must converge: ${JSON.stringify(result)}`);
      assert.equal(result.processed, 1);
      assert.equal(result.applied, 0, `${mode}: an already-held command must write nothing`);
      assert.deepEqual(txRow(db), before, `${mode}: the stored row must be untouched`);
      db.native.close();
    }

    // 2) Same entity, same revision, DIFFERENT content: a real divergence that
    //    must never be waved through.
    {
      const db = createDb({ txBody: { ...originalTransaction, amountMinor: -9900 } });
      const before = txRow(db);
      const result = await apply(db, [transactionCommand()], production);
      assert.equal(result.ok, false, `${mode}: divergent content must stay a conflict`);
      assert.equal(result.reason, 'financial_v2_remote_cas_conflict');
      assert.deepEqual(txRow(db), before, `${mode}: a refused command must change nothing`);
      db.native.close();
    }

    // 3) A domain entity the ledger already holds, and one that diverges.
    {
      const db = createDb();
      const result = await apply(db, [walletCommand()], production);
      assert.equal(result.ok, true, `${mode}: an already-held wallet must converge`);
      assert.equal(result.applied, 0);
      assert.equal(walletRow(db).revision, 1);
      db.native.close();
    }
    {
      const db = createDb({ walletPayload: { name: 'Different' } });
      const result = await apply(db, [walletCommand()], production);
      assert.equal(result.ok, false, `${mode}: a divergent wallet must stay a conflict`);
      assert.equal(result.reason, 'financial_v2_remote_cas_conflict');
      db.native.close();
    }
  }

  // 4) The real shape of a catch-up: history the device already embodies,
  //    followed by a command that genuinely advances it. The replayed part is
  //    skipped and the new part applies, in order, in one pass.
  {
    const db = createDb();
    const result = await apply(db, [
      transactionCommand({ revision: 1, sequence: 214 }),
      walletCommand({ revision: 1, sequence: 215 }),
      walletCommand({ revision: 2, sequence: 216, payload: { name: 'Cash renamed' } }),
    ], true);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.processed, 3);
    assert.equal(result.applied, 1, 'only the genuinely new command may write');
    assert.equal(walletRow(db).revision, 2, 'the new command must land');
    assert.equal(JSON.parse(walletRow(db).payload_json).name, 'Cash renamed');
    assert.equal(txRow(db).revision, 1, 'the replayed command must not have rewritten anything');
    db.native.close();
  }

  // 5) A shadow chain over already-held history still writes nothing at all.
  {
    const db = createDb();
    const result = await apply(db, [
      transactionCommand({ revision: 1, sequence: 214 }),
      walletCommand({ revision: 1, sequence: 215 }),
    ], false);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.applied, 0);
    assert.equal(result.shadow, true);
    const state = db.native.prepare('SELECT shadow_last_server_sequence,last_server_sequence FROM ledger_sync_state_v8 WHERE ledger_id=?').get(LEDGER);
    assert.equal(state.last_server_sequence, 0, 'shadow must not move the production cursor');
    assert.equal(state.shadow_last_server_sequence, 215);
    db.native.close();
  }

  // 6) A void is not modelled here, so it keeps the old behaviour rather than
  //    being skipped on a revision match.
  {
    const db = createDb();
    const voidCommand = { ...transactionCommand({ revision: 1, sequence: 217 }), operation: 'void' };
    const result = await apply(db, [voidCommand], true);
    assert.equal(result.ok, false, 'an unmodelled operation must not be skipped');
    assert.equal(result.reason, 'financial_v2_remote_cas_conflict');
    db.native.close();
  }

  console.log('MYFI P20 V2 REPLAYED HISTORY RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
