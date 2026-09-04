// Worker for run-p14-outbox-restart.cjs. Not registered in the quality gate on
// its own: it is only meaningful when driven by that harness, which spawns it,
// kills it, and spawns it again against the same SQLite file.
//
// Everything here runs the real repository against a real on-disk database.
// The kill is a literal process.exit(86) at a chosen boundary, so what survives
// is whatever SQLite actually committed -- not what a mock chose to remember.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
const raw = fs.readFileSync(filename, 'utf8');

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
    "const { outboxRetryPlanV1, outboxPermanentFailureCutoffV1 } = require(globalThis.__RETRY_POLICY_PATH__);",
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
source += `
module.exports = {
  ensureLedgerSyncIdentityV8, commitEntityChangesV7,
  readPendingLedgerMutationsV8, acknowledgeLedgerMutationsV8, failLedgerMutationV8,
  FINANCIAL_LEDGER_V7_SCHEMA_SQL, FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL,
};
`;

// Compiled with a plain babel-free transform, so the policy module is pulled in
// by path at runtime instead of through an ESM import the CJS wrapper cannot use.
globalThis.__RETRY_POLICY_PATH__ = path.join(__dirname, 'fixtures-p14-retry-policy.cjs');

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const {
  ensureLedgerSyncIdentityV8, commitEntityChangesV7,
  readPendingLedgerMutationsV8, acknowledgeLedgerMutationsV8, failLedgerMutationV8,
  FINANCIAL_LEDGER_V7_SCHEMA_SQL, FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL,
} = compiled.exports;

class Db {
  constructor(file) {
    this.native = new DatabaseSync(file);
    this.native.exec('PRAGMA foreign_keys=ON;');
    // The durability this test is about: a killed process must leave a
    // committed row behind, so the journal has to be flushed on commit.
    this.native.exec('PRAGMA journal_mode=DELETE;');
    this.native.exec('PRAGMA synchronous=FULL;');
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const out = this.native.prepare(String(sql)).run(...params); return { changes: Number(out.changes || 0) }; }
}

const NS = 'user:outbox-restart';
const WALLET_ID = 'wallet-restart';

(async () => {
  const file = process.env.MYFI_P14_OUTBOX_DB_FILE;
  const boundary = String(process.env.MYFI_P14_OUTBOX_BOUNDARY || '');
  const resume = process.env.MYFI_P14_OUTBOX_RESUME === '1';
  assert.ok(file, 'MYFI_P14_OUTBOX_DB_FILE is required');

  const db = new Db(file);
  globalThis.__TEST_DB__ = db;
  db.native.exec(FINANCIAL_LEDGER_V7_SCHEMA_SQL);
  db.native.exec(FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL);
  const identity = await ensureLedgerSyncIdentityV8({ namespace: NS, database: db });

  if (resume) {
    // The relaunch. Nothing here re-queues anything: whatever is drainable now
    // is whatever the killed process actually committed.
    const pending = await readPendingLedgerMutationsV8({
      namespace: NS, ledgerId: identity.ledgerId, restoreEpoch: identity.restoreEpoch, database: db,
    });
    const acknowledged = pending.length
      ? await acknowledgeLedgerMutationsV8({
          ledgerId: identity.ledgerId, restoreEpoch: identity.restoreEpoch,
          mutationIds: pending.map(row => row.mutation_id), database: db,
        })
      : 0;
    const after = await readPendingLedgerMutationsV8({
      namespace: NS, ledgerId: identity.ledgerId, restoreEpoch: identity.restoreEpoch, database: db,
    });
    console.log(JSON.stringify({
      marker: 'P14_OUTBOX_RESUME',
      pending: pending.length,
      entityIds: pending.map(row => row.entity_id),
      attempts: pending.map(row => Number(row.attempts)),
      acknowledged,
      pendingAfterDrain: after.length,
    }));
    db.native.close();
    process.exit(0);
  }

  // The user's edit, through the real commit path that queues the outbox row.
  const committed = await commitEntityChangesV7({
    namespace: NS, database: db,
    changes: [{ entityType: 'wallet', id: WALLET_ID, payload: { name: 'Queued before the kill' } }],
  });
  assert.equal(committed.ok, true, 'the commit must succeed before any kill');
  assert.equal(committed.changed, 1, 'the commit must actually queue a mutation');

  if (boundary === 'after_commit') {
    // A hard kill the instant the mutation is queued and nothing has synced.
    process.exit(86);
  }

  if (boundary === 'after_failed_attempt') {
    const [row] = await readPendingLedgerMutationsV8({
      namespace: NS, ledgerId: identity.ledgerId, restoreEpoch: identity.restoreEpoch, database: db,
    });
    assert.ok(row, 'the queued row must be drainable before the failure');
    await failLedgerMutationV8({
      ledgerId: identity.ledgerId, restoreEpoch: identity.restoreEpoch,
      mutationId: row.mutation_id, error: 'network_down', database: db,
    });
    process.exit(86);
  }

  if (boundary === 'after_ack') {
    const [row] = await readPendingLedgerMutationsV8({
      namespace: NS, ledgerId: identity.ledgerId, restoreEpoch: identity.restoreEpoch, database: db,
    });
    assert.ok(row, 'the queued row must be drainable before the acknowledgement');
    await acknowledgeLedgerMutationsV8({
      ledgerId: identity.ledgerId, restoreEpoch: identity.restoreEpoch,
      mutationIds: [row.mutation_id], database: db,
    });
    process.exit(86);
  }

  throw new Error(`unknown boundary ${boundary}`);
})().catch(error => { console.error(error); process.exit(1); });
