// Phase 12-C: real SQLite exercise of the identity-free local recovery receipt.
// A fresh device must prove an immutable Bootstrap before it adopts V2 identity
// or touches financial rows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
const repository = fs.readFileSync(filename, 'utf8');
const metadataSource = fs.readFileSync(path.join(root, 'src/lib/cloudWorkspaceMetadata.js'), 'utf8')
  .replace(/export const /g, 'const ');
const ddl = name => {
  const match = repository.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  assert(match, `${name} DDL missing`);
  return match[1];
};

let source = repository
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
      'const FINANCIAL_LEDGER_SCHEMA_VERSION = 9;',
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
source += `\nmodule.exports = {
  beginFinancialBootstrapRecoveryImportV9,
  readFinancialBootstrapRecoveryImportV9,
  recordFinancialBootstrapRecoveryImportProgressV9,
  markFinancialBootstrapRecoveryImportReadyV9,
  writeFinancialBootstrapRecoveryStageRowV10,
};\n`;

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const {
  beginFinancialBootstrapRecoveryImportV9,
  readFinancialBootstrapRecoveryImportV9,
  recordFinancialBootstrapRecoveryImportProgressV9,
  markFinancialBootstrapRecoveryImportReadyV9,
  writeFinancialBootstrapRecoveryStageRowV10,
} = compiled.exports;

class SqliteHarness {
  constructor() {
    this.native = new DatabaseSync(':memory:');
    this.native.exec('PRAGMA foreign_keys=ON;');
    this.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
    this.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
    this.native.exec(ddl('FINANCIAL_LEDGER_V9_BOOTSTRAP_RECOVERY_SQL'));
    this.native.exec(ddl('FINANCIAL_LEDGER_V10_BOOTSTRAP_RECOVERY_STAGE_SQL'));
  }
  async execAsync(sql) { this.native.exec(String(sql)); }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) {
    const result = this.native.prepare(String(sql)).run(...params);
    return { changes: Number(result.changes || 0), lastInsertRowId: result.lastInsertRowid };
  }
}

const NS = 'user:phase12c';
const sourceInput = {
  namespace: NS,
  accountId: 'account-phase12c',
  sourceLedgerId: 'ledger-remote-phase12c',
  sourceRestoreEpoch: 7,
  sourceBootstrapId: 'bootstrap-remote-phase12c',
  sourceManifestHash: 'a'.repeat(64),
  expectedRowCount: 2,
};

(async () => {
  const db = new SqliteHarness();
  globalThis.__TEST_DB__ = db;
  const financialBefore = db.native.prepare(
    "SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?",
  ).get(NS).n;

  const first = await beginFinancialBootstrapRecoveryImportV9({ ...sourceInput, database: db });
  assert.equal(first.status, 'downloading');
  assert.match(first.stage_namespace, /^bootstrap-recovery-stage:bootstrap-recovery-/);
  assert.equal(
    db.native.prepare('SELECT COUNT(*) AS n FROM ledger_sync_identity_v8 WHERE namespace=?').get(NS).n,
    0,
    'receipt must not invent a local V2 identity',
  );
  assert.equal(
    db.native.prepare('SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?').get(NS).n,
    financialBefore,
    'receipt must not write live financial data',
  );

  const idempotent = await beginFinancialBootstrapRecoveryImportV9({ ...sourceInput, database: db });
  assert.equal(idempotent.session_id, first.session_id, 'same immutable source resumes one session');
  await assert.rejects(
    beginFinancialBootstrapRecoveryImportV9({ ...sourceInput, expectedRowCount: 3, database: db }),
    /financial_v2_bootstrap_recovery_source_conflict/,
  );

  await assert.rejects(
    markFinancialBootstrapRecoveryImportReadyV9({
      namespace: NS, sessionId: first.session_id, proofDigest: 'b'.repeat(64), database: db,
    }),
    /financial_v2_bootstrap_recovery_rows_incomplete/,
  );
  const currency = {
    ordinal: 1,
    rowType: 'currency',
    rowKey: 'IQD',
    rowHash: 'c'.repeat(64),
    payloadText: '{"code":"IQD","minor_exponent":3,"enabled":1}',
  };
  const stagedCurrency = await writeFinancialBootstrapRecoveryStageRowV10({
    namespace: NS, sessionId: first.session_id, row: currency, database: db,
  });
  assert.equal(stagedCurrency.last_cloud_row_ordinal, 1);
  const replayedCurrency = await writeFinancialBootstrapRecoveryStageRowV10({
    namespace: NS, sessionId: first.session_id, row: currency, database: db,
  });
  assert.equal(replayedCurrency.last_cloud_row_ordinal, 1, 'same verified ordinal is idempotent');
  await assert.rejects(
    writeFinancialBootstrapRecoveryStageRowV10({
      namespace: NS, sessionId: first.session_id, row: { ...currency, rowHash: 'd'.repeat(64) }, database: db,
    }),
    /financial_v2_bootstrap_recovery_stage_ordinal_conflict/,
  );
  await writeFinancialBootstrapRecoveryStageRowV10({
    namespace: NS,
    sessionId: first.session_id,
    row: {
      ordinal: 2,
      rowType: 'account',
      rowKey: 'wallet-1',
      rowHash: 'e'.repeat(64),
      payloadText: '{"id":"wallet-1","name":"Wallet","account_type":"cash","scope":"personal","currency_code":"IQD","status":"active","created_at":"2026-08-31T00:00:00.000Z","updated_at":"2026-08-31T00:00:00.000Z","archived_at":null}',
    },
    database: db,
  });
  const ready = await markFinancialBootstrapRecoveryImportReadyV9({
    namespace: NS, sessionId: first.session_id, proofDigest: 'b'.repeat(64), database: db,
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.proof_digest, 'b'.repeat(64));
  assert.equal(
    db.native.prepare('SELECT COUNT(*) AS n FROM ledger_bootstrap_recovery_rows_v10 WHERE namespace=? AND session_id=?')
      .get(NS, first.session_id).n,
    2,
  );
  assert.equal((await readFinancialBootstrapRecoveryImportV9({ namespace: NS, database: db })).session_id, first.session_id);

  const blockedNs = 'user:phase12c-restore-active';
  db.native.prepare(
    'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
  ).run(`restore_intent:${blockedNs}`, '{}', '2026-08-31T00:00:00.000Z');
  await assert.rejects(
    beginFinancialBootstrapRecoveryImportV9({ ...sourceInput, namespace: blockedNs, database: db }),
    /financial_v2_bootstrap_recovery_restore_intent_active/,
  );

  assert.equal(
    db.native.prepare('SELECT COUNT(*) AS n FROM ledger_sync_identity_v8 WHERE namespace=?').get(NS).n,
    0,
    'verified receipt must still be identity-free before promotion',
  );
  assert.equal(
    db.native.prepare('SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?').get(NS).n,
    financialBefore,
    'verified receipt must still leave live rows untouched',
  );
  assert.equal(
    db.native.prepare('SELECT COUNT(*) AS n FROM ledger_accounts_v7 WHERE namespace=?').get(NS).n,
    0,
    'verified stage rows must remain private rather than entering the live namespace',
  );
  db.native.close();
  console.log('MYFI P20 PHASE 12-C BOOTSTRAP RECOVERY SESSION SQLITE RUNTIME: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
