// Phase 12 — real SQLite proof for the narrow repair: remove the one stale
// workspace command blocking the queue, touch nothing else, and let ordinary
// sync carry the device forward. No bootstrap, no checkpoint, no replacement.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');
const target = path.join(root, 'src/lib/financialV2StaleCommandRecoveryV1.js');
const conflictModule = path.join(root, 'src/lib/financialV2ConflictRecoveryV1.js');
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

const makeRunner = fixture => async ({ task }) => {
  const db = fixture.db;
  db.native.exec('BEGIN IMMEDIATE');
  try {
    const result = await task({ database: db });
    db.native.exec('COMMIT');
    return result;
  } catch (error) { db.native.exec('ROLLBACK'); throw error; }
};

const compileEsm = (file, mocks) => {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === file && Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(file, module);
    compiled.filename = file;
    compiled.paths = Module._nodeModulePaths(path.dirname(file));
    compiled._compile(babel.transformFileSync(file, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, file);
    return compiled.exports;
  } finally { Module._load = originalLoad; }
};

// The real staleWorkspaceCommand is loaded from its own module, so this test
// exercises the shared safety definition rather than a copy of it.
const conflictExports = compileEsm(conflictModule, {
  './ledgerDatabase': { getLedgerDb: async () => null },
  './financialLedgerV7Repository': {},
  './financialLiveGenerationV13': {},
  './financialBootstrapRecoveryCoordinatorV2': {},
  './financialBootstrapRecoveryPromotionV2': {},
  './secureUuid': { createSecureUuidV4: () => 'uuid' },
});
assert.equal(typeof conflictExports.staleWorkspaceCommand, 'function', 'staleWorkspaceCommand must be exported');

const NS = 'user:stale-repair';
const LEDGER = 'ledger-stale-repair';
const ACCOUNT = 'account-1';
const now = '2026-09-02T10:00:00.000Z';
const discardKey = `financial_v2_stale_workspace_discard_v1:${NS}`;

const stalePayload = (revision, baseRevision) => JSON.stringify({
  namespace: NS, entityType: 'workspace', id: 'workspace', revision, baseRevision,
  payload: { cfg: { currency: 'IQD' }, cloudRevision: baseRevision },
});

const createFixture = ({ rows = null, financial = true } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, 1, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)', LEDGER, 1, 0, 0, now, now);
  run('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)', NS, 'sqlite', 12, '{}', now);
  if (financial) {
    run('INSERT INTO ledger_currencies(code,minor_exponent,enabled) VALUES (?,?,?)', 'IQD', 3, 1);
    run('INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)', NS, 'wallet-1', 'Cash', 'cash', 'personal', 'IQD', 'active', now, now);
    run('INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?)', NS, 'tx-1', 'expense', 'posted', 'personal', '2026-09-01', now, 'food', 'Food', '', 'manual', '', 'key-1', 'device-1', 1, '{}', now, now);
    run('INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at) VALUES (?,?,?,?,?,?,?,?,NULL,?)', NS, 'post-1', 'tx-1', 'wallet-1', 'physical', 'principal', -1000, 'IQD', now);
  }
  for (const row of rows || [{ revision: 3, baseRevision: 2, sequence: 74 }]) {
    run('INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      NS, LEDGER, 1, `stale-${row.sequence}`, `cmd-${row.sequence}`,
      row.entityType || 'workspace', row.entityId || 'workspace', row.operation || 'upsert',
      row.revision, row.baseRevision, 2, 2, 1,
      row.payloadJson || stalePayload(row.revision, row.baseRevision), now);
  }
  const fixture = { db };
  const exports = compileEsm(target, {
    './ledgerDatabase': { getLedgerDb: async () => db },
    './financialLedgerV7Repository': { runFinancialRestorePromotionTransactionV8: makeRunner(fixture) },
    './financialV2ConflictRecoveryV1': conflictExports,
  });
  return { db, ...exports };
};

const outboxCount = db => Number(db.native.prepare('SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?').get(LEDGER).n);
const financialSnapshot = db => ['ledger_accounts_v7', 'ledger_financial_transactions_v7', 'ledger_postings_v7']
  .map(table => Number(db.native.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE namespace=?`).get(NS).n));
const receipt = db => {
  const row = db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(discardKey);
  return row ? JSON.parse(row.value) : null;
};

(async () => {
  // The cloud revision comes from the conflict the server already returned.
  const fresh = createFixture();
  assert.equal(fresh.cloudWorkspaceRevisionFromConflictsV1([{ entityId: 'workspace', currentRevision: 7, requestedBaseRevision: 2 }]), 7);
  assert.equal(fresh.cloudWorkspaceRevisionFromConflictsV1([{ entity_id: 'workspace', current_revision: 7 }]), 7,
    'the snake_case shape the server may use must work too');
  assert.equal(fresh.cloudWorkspaceRevisionFromConflictsV1([{ entityId: 'financial_transaction', currentRevision: 4 }]), 0,
    'a non-workspace conflict must disqualify the narrow repair');
  assert.equal(fresh.cloudWorkspaceRevisionFromConflictsV1([{ entityId: 'workspace', currentRevision: 7 }, { entityId: 'wallet', currentRevision: 2 }]), 0,
    'one disqualifying conflict is enough');
  assert.equal(fresh.cloudWorkspaceRevisionFromConflictsV1([]), 0);

  // 1) The repair itself: the blocking command goes, nothing else moves.
  const beforeFinancial = financialSnapshot(fresh.db);
  const eligible = await fresh.inspectStaleWorkspaceConflictV1({ namespace: NS, accountId: ACCOUNT, cloudWorkspaceRevision: 7, database: fresh.db });
  assert.equal(eligible.ok, true, JSON.stringify(eligible));
  assert.equal(eligible.commands.length, 1);
  assert.equal(outboxCount(fresh.db), 1, 'inspection must not delete anything');

  const repaired = await fresh.discardStaleWorkspaceCommandsV1({
    namespace: NS, accountId: ACCOUNT, cloudWorkspaceRevision: 7, confirmed: true, database: fresh.db,
  });
  assert.equal(repaired.ok, true, JSON.stringify(repaired));
  assert.equal(repaired.discarded, 1);
  assert.equal(outboxCount(fresh.db), 0, 'the queue must be clear for an ordinary sync');
  assert.deepEqual(financialSnapshot(fresh.db), beforeFinancial, 'financial data must be untouched');
  const saved = receipt(fresh.db);
  assert.equal(saved.discardedCommands.length, 1);
  assert.equal(saved.cloudWorkspaceRevision, 7);
  assert.equal(saved.discardedCommands[0].payloadJson, stalePayload(3, 2), 'the discarded command must be kept verbatim');
  fresh.db.native.close();

  // 2) Without confirmation nothing happens at all.
  const unconfirmed = createFixture();
  const refused = await unconfirmed.discardStaleWorkspaceCommandsV1({ namespace: NS, accountId: ACCOUNT, cloudWorkspaceRevision: 7, database: unconfirmed.db });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'financial_v2_stale_command_repair_confirmation_required');
  assert.equal(outboxCount(unconfirmed.db), 1);
  assert.equal(receipt(unconfirmed.db), null);
  unconfirmed.db.native.close();

  // 3) The case that matters most: a command that is NOT behind the cloud is a
  //    real unsent change, and deleting it would lose the user's work.
  for (const [label, cloudRevision] of [['at the cloud revision', 2], ['ahead of the cloud', 1]]) {
    const notStale = createFixture({ rows: [{ revision: 3, baseRevision: 2, sequence: 74 }] });
    const rejected = await notStale.discardStaleWorkspaceCommandsV1({
      namespace: NS, accountId: ACCOUNT, cloudWorkspaceRevision: cloudRevision, confirmed: true, database: notStale.db,
    });
    assert.equal(rejected.ok, false, `a command ${label} must never be discarded`);
    assert.equal(rejected.reason, 'financial_v2_stale_command_repair_pending_not_stale');
    assert.equal(outboxCount(notStale.db), 1);
    assert.equal(receipt(notStale.db), null, 'a rejected repair must leave no receipt');
    notStale.db.native.close();
  }

  // 4) Anything that is not a setup-only workspace command stops the repair.
  for (const row of [
    { revision: 3, baseRevision: 2, sequence: 74, entityType: 'financial_transaction', entityId: 'tx-1' },
    { revision: 3, baseRevision: 2, sequence: 74, operation: 'delete' },
    { revision: 3, baseRevision: 2, sequence: 74, payloadJson: JSON.stringify({ namespace: NS, entityType: 'workspace', id: 'workspace', revision: 3, baseRevision: 2, payload: { cfg: { wallets: [{ id: 'w1' }] }, cloudRevision: 2 } }) },
  ]) {
    const unsafe = createFixture({ rows: [row] });
    const rejected = await unsafe.discardStaleWorkspaceCommandsV1({
      namespace: NS, accountId: ACCOUNT, cloudWorkspaceRevision: 7, confirmed: true, database: unsafe.db,
    });
    assert.equal(rejected.ok, false, `unsafe row must be refused: ${JSON.stringify(row)}`);
    assert.equal(rejected.reason, 'financial_v2_stale_command_repair_pending_not_stale');
    assert.equal(outboxCount(unsafe.db), 1);
    unsafe.db.native.close();
  }

  // 5) An unknown cloud revision cannot prove staleness, so nothing is removed.
  const unknown = createFixture();
  const noRevision = await unknown.discardStaleWorkspaceCommandsV1({ namespace: NS, accountId: ACCOUNT, cloudWorkspaceRevision: 0, confirmed: true, database: unknown.db });
  assert.equal(noRevision.ok, false);
  assert.equal(noRevision.reason, 'financial_v2_stale_command_repair_cloud_revision_unknown');
  assert.equal(outboxCount(unknown.db), 1);
  unknown.db.native.close();

  // 6) A queue this path was not reasoned about stops for review.
  const many = createFixture({
    rows: Array.from({ length: 9 }, (_, index) => ({ revision: index + 2, baseRevision: index + 1, sequence: 74 + index })),
  });
  const tooMany = await many.discardStaleWorkspaceCommandsV1({ namespace: NS, accountId: ACCOUNT, cloudWorkspaceRevision: 20, confirmed: true, database: many.db });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.reason, 'financial_v2_stale_command_repair_too_many_pending');
  assert.equal(outboxCount(many.db), 9);
  many.db.native.close();

  console.log('MYFI P20 V2 STALE COMMAND REPAIR RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
