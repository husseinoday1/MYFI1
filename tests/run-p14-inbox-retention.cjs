// Phase 14 §93 — inbox retention, and the proof it does not cost idempotency.
//
// The claim being tested is narrow on purpose: an inbox row at or below the
// cursor is already unreachable, because the apply path's cursor fast path
// returns before the per-mutation apply_status lookup. So deleting those rows
// removes nothing the guard can still consult. Case 6 is the one that matters —
// it re-delivers a mutation whose inbox row was just pruned and proves it is
// still refused.
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
source += '\nmodule.exports = { pruneLedgerInboxV8, applyRemoteLedgerMutationsV8, INBOX_RETENTION_MIN_AGE_MS };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { pruneLedgerInboxV8, applyRemoteLedgerMutationsV8, INBOX_RETENTION_MIN_AGE_MS } = compiled.exports;

class Db {
  constructor() { this.native = new DatabaseSync(':memory:'); this.native.exec('PRAGMA foreign_keys=ON;'); }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const out = this.native.prepare(String(sql)).run(...params); return { changes: Number(out.changes || 0) }; }
}

const NS = 'user:inbox-retention';
const LEDGER = 'ledger-inbox-retention';
const EPOCH = 1;
const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const old = new Date(NOW - INBOX_RETENTION_MIN_AGE_MS - 86_400_000).toISOString();
const recent = new Date(NOW - 3_600_000).toISOString();
const TX_ID = 'a1b2c3d4-e5f6-4788-9abc-def012345678';

const createDb = ({ shadowCursor = 50, productionCursor = 50 } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, EPOCH, 2, 2, old, old);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)', LEDGER, EPOCH, shadowCursor, productionCursor, old, old);
  run('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)', NS, 'sqlite', 12, '{}', old);
  globalThis.__TEST_DB__ = db;
  return db;
};

const seedInbox = (db, rows) => {
  for (const { sequence, receivedAt = old, status = 'applied' } of rows) {
    db.native.prepare(
      `INSERT INTO ledger_inbox_v3(ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence,received_at,apply_status,applied_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(LEDGER, EPOCH, `mut-${sequence}`, `cmd-${sequence}`, sequence, sequence, receivedAt, status, receivedAt);
  }
};
const inboxSequences = db => db.native
  .prepare('SELECT command_sequence FROM ledger_inbox_v3 WHERE ledger_id=? ORDER BY command_sequence')
  .all(LEDGER).map(row => Number(row.command_sequence));
const prune = (db, now = NOW) => pruneLedgerInboxV8({ ledgerId: LEDGER, restoreEpoch: EPOCH, now, database: db });

(async () => {
  // 1) Rows above the cursor are the only guard against their own re-delivery.
  //    They must never be pruned, however old they are.
  {
    const db = createDb({ shadowCursor: 50, productionCursor: 50 });
    seedInbox(db, [{ sequence: 40 }, { sequence: 50 }, { sequence: 60 }, { sequence: 90 }]);
    const result = await prune(db);
    assert.equal(result.safeCursor, 50);
    assert.deepEqual(inboxSequences(db), [60, 90],
      'only rows at or below the cursor may be pruned');
    assert.equal(result.pruned, 2);
    db.native.close();
  }

  // 2) The bound is the LOWER cursor. A row the production path has passed but
  //    the shadow path has not is still live for the shadow path.
  {
    const db = createDb({ shadowCursor: 10, productionCursor: 90 });
    seedInbox(db, [{ sequence: 5 }, { sequence: 20 }, { sequence: 80 }]);
    const result = await prune(db);
    assert.equal(result.safeCursor, 10, 'the lower cursor bounds the prune');
    assert.deepEqual(inboxSequences(db), [20, 80],
      'a row the shadow cursor has not passed must survive');
    db.native.close();
  }

  // 3) The age floor. A row below the cursor but recently received is kept --
  //    insurance against a cursor that is wrong in the high direction.
  {
    const db = createDb();
    seedInbox(db, [{ sequence: 10, receivedAt: recent }, { sequence: 20, receivedAt: old }]);
    await prune(db);
    assert.deepEqual(inboxSequences(db), [10], 'a recent row is kept even below the cursor');
    db.native.close();
  }

  // 4) No cursor yet means nothing is provably redundant, so nothing is pruned.
  for (const cursors of [{ shadowCursor: 0, productionCursor: 0 }, { shadowCursor: 0, productionCursor: 90 }]) {
    const db = createDb(cursors);
    seedInbox(db, [{ sequence: 10 }, { sequence: 20 }]);
    const result = await prune(db);
    assert.equal(result.pruned, 0, 'a missing cursor must prune nothing');
    assert.equal(result.reason, 'no_safe_cursor');
    assert.deepEqual(inboxSequences(db), [10, 20]);
    db.native.close();
  }

  // 5) Repeat action: pruning twice in sequence is idempotent, and the second
  //    pass must not reach further than the first just because it ran again.
  {
    const db = createDb();
    seedInbox(db, [{ sequence: 10 }, { sequence: 20 }, { sequence: 80 }]);
    const first = await prune(db);
    const afterFirst = inboxSequences(db);
    const second = await prune(db);
    assert.equal(first.pruned, 2);
    assert.equal(second.pruned, 0, 'a second prune finds nothing left to do');
    assert.deepEqual(inboxSequences(db), afterFirst, 'and changes nothing');
    db.native.close();
  }

  // 6) The point of the whole exercise: pruning must not cost idempotency.
  //    Re-deliver a mutation whose inbox row was just pruned and confirm it is
  //    still refused -- by the cursor, which is why the row was redundant.
  {
    const db = createDb({ shadowCursor: 40, productionCursor: 40 });
    seedInbox(db, [{ sequence: 30 }]);
    db.native.prepare(
      `INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?)`,
    ).run(NS, TX_ID, 'expense', 'posted', 'personal', '2026-09-01', old, 'food', 'Lunch', '', 'manual', '', 'idem-30', 'device-a', 1,
      JSON.stringify({ id: TX_ID, kind: 'expense', title: 'Lunch', amountMinor: -1500, idempotencyKey: 'idem-30', revision: 1 }), old, old);

    await prune(db);
    assert.deepEqual(inboxSequences(db), [], 'precondition: the inbox record is gone');

    // The same command arriving a second time. Its inbox row no longer exists,
    // so if the cursor were not doing the work this would re-apply.
    const before = db.native.prepare('SELECT revision,title FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=?').get(NS, TX_ID);
    const result = await applyRemoteLedgerMutationsV8({
      namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH, deviceId: 'device-b', allowProductionApply: true, database: db,
      mutations: [{
        ledgerId: LEDGER, restoreEpoch: EPOCH,
        mutationId: 'mut-30', serverSequence: 30, commandId: 'cmd-30', commandSequence: 30, commandMutationCount: 1,
        entityType: 'financial_transaction', entityId: TX_ID, operation: 'upsert',
        revision: 2, baseRevision: 1,
        protocolVersion: 2, minimumSupportedVersion: 2, payloadSchemaVersion: 1,
        payload: {
          transaction: { id: TX_ID, revision: 2, idempotencyKey: 'idem-30' },
          originalTransaction: { id: TX_ID, kind: 'expense', title: 'REPLAYED', amountMinor: -9999, idempotencyKey: 'idem-30' },
          currencies: [], accounts: [], exchangeRates: [], postings: [], links: [],
        },
      }],
    });
    assert.equal(result.ok, true, `a re-delivery below the cursor is skipped, not failed: ${JSON.stringify(result)}`);
    assert.equal(result.applied, 0, 'and applies nothing');
    assert.deepEqual(
      db.native.prepare('SELECT revision,title FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=?').get(NS, TX_ID),
      before,
      'the stored row is untouched — pruning the inbox did not cost idempotency',
    );
    db.native.close();
  }

  console.log('MYFI P14 INBOX RETENTION: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
