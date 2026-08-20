// Phase 10 Step 1 — canonical backup read model.
//
// Two things must hold and neither is provable by reading the source:
//   1. It reads the whole canonical graph from SQLite, not a UI-cache subset. That is
//      the gap the Phase 10 research calls the most important one.
//   2. It never writes. A backup read must not bring a ledger identity into being, or
//      touch a single row, as a side effect of being taken.
//
// The write check is enforced by a database stand-in that throws on any mutation, so
// a future edit that reaches for ensureLedgerSyncIdentityV8 (which INSERTs) fails here
// instead of silently creating identities during a backup.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialBackupV2.js');

const NS = 'user:p10-001';

// --- stubs for the four canonical readers ---------------------------------
let writeAttempts = [];
let identityRow = { ledgerId: 'ledger-p10', restoreEpoch: 3, protocolVersion: 2, minimumSupportedVersion: 2 };
let workspaceRow = { source_mode: 'sqlite', schema_version: 8, shadow_checksum: 'abc', cutover_at: '2026-08-20T00:00:00.000Z', payload_json: '{}' };

const projectionRow = {
  transactions: [
    { id: 't1', revision: 1, payload: {}, archiveYear: null, archivedAt: null, deletedAt: null },
    { id: 't2', revision: 2, payload: {}, archiveYear: 2025, archivedAt: '2026-01-01', deletedAt: null },
    { id: 't3', revision: 5, payload: {}, archiveYear: null, archivedAt: null, deletedAt: '2026-02-02' },
  ],
  entities: [
    { entityType: 'wallet', id: 'w1', revision: 1, deletedAt: null, payload: {} },
    { entityType: 'wallet', id: 'w2', revision: 1, deletedAt: null, payload: {} },
    { entityType: 'debt', id: 'd1', revision: 1, deletedAt: null, payload: {} },
    { entityType: 'workspace', id: 'ws', revision: 1, deletedAt: null, payload: { cfg: {} } },
  ],
  postings: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
  links: [{ id: 'l1' }],
  accounts: [{ id: 'a1' }, { id: 'a2' }],
  exchangeRates: [{ id: 'fx1' }],
};

const archivesRow = [
  { data: { trans: [{ id: 'x1' }, { id: 'x2' }] } },
  { data: { trans: [{ id: 'x3' }] } },
];

let source = fs.readFileSync(filename, 'utf8')
  .replace(
    /import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
    [
      'const getColdArchiveNamespace = (ns) => ns;',
      'const exportColdArchives = async () => globalThis.__ARCHIVES__;',
      'const ensureColdArchiveSchema = async () => true;',
    ].join('\n'),
  )
  // P10-004 reads the whole model inside one read transaction. Stubbed here to run
  // the task straight through; run-p10-004 is where the transaction itself is proved.
  .replace(
    /import \{[\s\S]*?\} from '\.\/ledgerDatabase';/,
    [
      'const getLedgerDb = async () => globalThis.__DB__;',
      'const runLedgerReadTransaction = async (db, task) => task(db);',
    ].join('\n'),
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/,
    [
      'const readFinancialProjectionV7 = async () => globalThis.__PROJECTION__;',
      'const readLedgerSyncIdentityV8 = async () => globalThis.__IDENTITY__;',
      'const getFinancialWorkspaceStateV7 = async () => globalThis.__WORKSPACE__;',
      'const ensureFinancialLedgerV7 = async () => true;',
      // Present so a future edit that reaches for it is caught by the write guard.
      'const ensureLedgerSyncIdentityV8 = async () => { globalThis.__WRITES__.push("ensureLedgerSyncIdentityV8"); throw new Error("backup read must not create identity"); };',
    ].join('\n'),
  )
  .replace(/export const /g, 'const ');

source += `
module.exports = { readCanonicalBackupSource, CANONICAL_BACKUP_SOURCE_VERSION };
`;

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);

const { readCanonicalBackupSource, CANONICAL_BACKUP_SOURCE_VERSION } = compiled.exports;

(async () => {
  globalThis.__PROJECTION__ = projectionRow;
  globalThis.__IDENTITY__ = identityRow;
  globalThis.__WORKSPACE__ = workspaceRow;
  globalThis.__ARCHIVES__ = archivesRow;
  globalThis.__WRITES__ = writeAttempts;
  globalThis.__DB__ = { withTransactionAsync: async task => task() };

  const model = await readCanonicalBackupSource({ namespace: NS });

  assert.equal(model.ok, true);
  assert.equal(model.source, 'canonical_sqlite', 'the model must record where it came from');
  assert.equal(model.sourceVersion, CANONICAL_BACKUP_SOURCE_VERSION);
  console.log('[PASS] reads from canonical SQLite and says so');

  // --- completeness: the whole graph, not a UI-cache subset ----------------
  for (const section of ['accounts', 'exchangeRates', 'transactions', 'postings', 'links', 'archives']) {
    assert.ok(Array.isArray(model[section]), `${section} must be present`);
  }
  assert.ok(model.entities.wallet && model.entities.debt && model.entities.workspace,
    'entities must be grouped by type and include the workspace entity');
  console.log('[PASS] every canonical section is present');

  // --- counts distinguish active, archived and tombstoned ------------------
  assert.equal(model.counts.transactions, 3);
  assert.equal(model.counts.activeTransactions, 1, 'archived and deleted must not count as active');
  assert.equal(model.counts.archivedTransactions, 1);
  assert.equal(model.counts.deletedTransactions, 1, 'tombstones are financial truth and must be counted');
  assert.equal(model.counts.postings, 4);
  assert.equal(model.counts.links, 1);
  assert.equal(model.counts.wallets, 2);
  assert.equal(model.counts.debts, 1);
  assert.equal(model.counts.coldArchiveBundles, 2);
  assert.equal(model.counts.coldArchiveTransactions, 3, 'archived history is part of the backup');
  console.log('[PASS] counts separate active, archived and tombstoned rows');

  // --- identity provenance, never invention --------------------------------
  assert.equal(model.ledgerIdentityPresent, true);
  assert.equal(model.ledger.ledgerId, 'ledger-p10');
  assert.equal(model.ledger.restoreEpoch, 3);
  assert.equal(model.cutoverComplete, true);
  assert.equal(typeof model.workspace.payloadJson, 'string', 'workspace payload stays the stored JSON string');

  globalThis.__IDENTITY__ = null;
  const noIdentity = await readCanonicalBackupSource({ namespace: NS });
  assert.equal(noIdentity.ok, true, 'a missing identity is reported, not a failure to read');
  assert.equal(noIdentity.ledger, null);
  assert.equal(noIdentity.ledgerIdentityPresent, false);
  assert.deepEqual(writeAttempts, [], 'REGRESSION: the backup read attempted to create a ledger identity');
  console.log('[PASS] a missing ledger identity is reported, never created');

  // --- pre-cutover ledgers are flagged, not silently backed up as canonical --
  globalThis.__IDENTITY__ = identityRow;
  globalThis.__WORKSPACE__ = { ...workspaceRow, source_mode: 'shadow' };
  const preCutover = await readCanonicalBackupSource({ namespace: NS });
  assert.equal(preCutover.cutoverComplete, false,
    'a shadow-mode workspace must not claim SQLite is authoritative');
  console.log('[PASS] pre-cutover ledgers are flagged');

  // --- fail closed ----------------------------------------------------------
  const noNamespace = await readCanonicalBackupSource({ namespace: '  ' });
  assert.equal(noNamespace.ok, false);
  assert.equal(noNamespace.reason, 'canonical_backup_namespace_required');

  globalThis.__WORKSPACE__ = workspaceRow;
  globalThis.__PROJECTION__ = null;
  const noDb = await readCanonicalBackupSource({ namespace: NS });
  assert.equal(noDb.ok, false);
  assert.equal(noDb.supported, false);
  assert.equal(noDb.reason, 'sqlite_unavailable');
  // An isolated database handle cannot be honoured for cold archives, so the model
  // refuses rather than quietly mixing staged ledger rows with live archives.
  globalThis.__PROJECTION__ = projectionRow;
  const isolated = await readCanonicalBackupSource({ namespace: NS, database: {} });
  assert.equal(isolated.ok, false);
  assert.equal(isolated.reason, 'canonical_backup_isolated_database_unsupported');
  console.log('[PASS] refuses an isolated handle it cannot honour for archives');

  console.log('[PASS] fails closed on missing namespace and unavailable SQLite');

  // --- the module must not reach for any writing repository function --------
  const text = fs.readFileSync(filename, 'utf8');
  for (const forbidden of [
    'ensureLedgerSyncIdentityV8',
    'setFinancialWorkspaceStateV7',
    'stageFinancialWorkspaceV7',
    'promoteFinancialWorkspaceStageV7',
    'replaceColdArchives',
    'upsertEntity',
    'runLedgerExclusiveTransaction',
  ]) {
    assert.ok(!text.includes(`${forbidden}(`),
      `canonical backup read must not call ${forbidden} — it writes`);
  }
  console.log('[PASS] no writing repository function is reachable from the read model');

  console.log('MYFI P10-001 CANONICAL BACKUP SOURCE CONTRACT: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
