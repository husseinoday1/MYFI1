// Phase 10 Step 11 — runtime post-COMMIT restart/reload proof.
// Uses a file-backed real SQLite DB, closes/reopens it at the exact point after the
// P10-010 COMMIT and before cache reload, then executes the real canonical source
// reader plus recovery coordinator.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const compile = (filename, source) => {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};

class AsyncSqlite {
  constructor(filename) {
    this.native = new DatabaseSync(filename);
    this.native.exec('PRAGMA foreign_keys = ON');
  }
  async execAsync(sql) { this.native.exec(String(sql)); }
  async runAsync(sql, ...params) {
    const result = this.native.prepare(String(sql)).run(...params);
    return { changes: Number(result.changes || 0) };
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async withExclusiveTransactionAsync(task) {
    this.native.exec('BEGIN IMMEDIATE');
    try {
      const result = await task(this);
      this.native.exec('COMMIT');
      return result;
    } catch (error) {
      this.native.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.native.close(); }
}

let database = null;
globalThis.__P10_DB__ = null;
globalThis.__P10_QUEUE__ = task => task();
globalThis.__P10_EXCLUSIVE__ = (db, task) => db.withExclusiveTransactionAsync(task);
globalThis.__P10_MIGRATIONS__ = async () => true;

const archiveFilename = path.join(root, 'src/lib/localArchiveRepository.js');
let archiveSource = fs.readFileSync(archiveFilename, 'utf8')
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task);
const getLedgerDb = async () => globalThis.__P10_DB__;
const runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`)
  .replace(/import \{ defaultScopeForProfile, normalizeScope \} from '\.\/modules';/,
    `const defaultScopeForProfile = () => 'personal'; const normalizeScope = value => value;`)
  .replace(/export const /g, 'const ');
archiveSource += `\nmodule.exports = {
  ensureColdArchiveSchema, clearColdArchiveNamespaceInTransaction,
  replaceColdArchiveNamespaceFromStageInTransaction, getColdArchiveNamespace,
  exportColdArchives,
};\n`;
const archive = compile(archiveFilename, archiveSource);
globalThis.__P10_ARCHIVE__ = archive;

const repositoryFilename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
let repositorySource = fs.readFileSync(repositoryFilename, 'utf8')
  .replace(/import \{ Platform \} from 'react-native';/, `const Platform = { OS: 'android' };`)
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task);
const getLedgerDb = async () => globalThis.__P10_DB__;
const runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`)
  .replace(/import \{ runLedgerSchemaMigrations \} from '\.\/financialLedgerSchemaMigrations';/,
    `const runLedgerSchemaMigrations = options => globalThis.__P10_MIGRATIONS__(options);`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialLedgerV7Model';/,
    `const buildExpenseLedgerCommand = () => { throw new Error('not_used'); };
const buildFinancialLedgerCommand = () => { throw new Error('not_used'); };
const FINANCIAL_LEDGER_SCHEMA_VERSION = 7;`)
  .replace(/import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/,
    `const cloudWorkspaceCfg = cfg => cfg?.currency === undefined ? {} : { currency: cfg.currency };
const mergeCloudWorkspaceCfg = (localCfg = {}, cloudCfg = {}) => ({ ...(localCfg || {}), ...cloudWorkspaceCfg(cloudCfg) });`)
  .replace(/import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
    `const { clearColdArchiveNamespaceInTransaction, ensureColdArchiveSchema,
  replaceColdArchiveNamespaceFromStageInTransaction } = globalThis.__P10_ARCHIVE__;`)
  .replace(/export const /g, 'const ').replace(/export async function /g, 'async function ').replace(/export function /g, 'function ');
repositorySource += `\nmodule.exports = {
  FINANCIAL_LEDGER_SCHEMA_VERSION, FINANCIAL_LEDGER_V7_SCHEMA_SQL, FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL,
  ensureFinancialLedgerV7, getFinancialWorkspaceStateV7, readFinancialProjectionV7,
  readLedgerSyncIdentityV8, runFinancialRestorePromotionTransactionV8,
};\n`;
const repository = compile(repositoryFilename, repositorySource);
globalThis.__P10_REPOSITORY__ = repository;

const backupFilename = path.join(root, 'src/lib/financialBackupV2.js');
let backupSource = fs.readFileSync(backupFilename, 'utf8')
  .replace(/import \{ ensureColdArchiveSchema, getColdArchiveNamespace, exportColdArchives \} from '\.\/localArchiveRepository';/,
    `const { ensureColdArchiveSchema, getColdArchiveNamespace, exportColdArchives } = globalThis.__P10_ARCHIVE__;`)
  .replace(/import \{ getLedgerDb, runLedgerReadTransaction \} from '\.\/ledgerDatabase';/,
    `const getLedgerDb = async () => globalThis.__P10_DB__;
const runLedgerReadTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/,
    `const { ensureFinancialLedgerV7, getFinancialWorkspaceStateV7, readFinancialProjectionV7,
  readLedgerSyncIdentityV8 } = globalThis.__P10_REPOSITORY__;`)
  .replace(/export const /g, 'const ');
backupSource += `\nmodule.exports = { readCanonicalBackupSource };\n`;
const backup = compile(backupFilename, backupSource);
globalThis.__P10_BACKUP__ = backup;

const countKeys = Object.freeze(['transactions', 'postings', 'links', 'accounts', 'exchangeRates', 'entities', 'coldArchiveBundles', 'coldArchiveRecords']);
const canonicalize = source => {
  const payload = JSON.parse(source.workspace?.payloadJson || '{}');
  const entities = source.entities && !Array.isArray(source.entities) ? Object.values(source.entities).flat() : (source.entities || []);
  const archives = source.archives || [];
  return {
    ledgerId: source.ledger?.ledgerId || 'ledger-restart',
    currency: payload.localPreferences?.cfg?.currency || payload.cfg?.currency || null,
    accounts: (source.accounts || []).map(item => item.id).sort(),
    exchangeRates: (source.exchangeRates || []).map(item => item.id).sort(),
    transactions: (source.transactions || []).map(item => item.id).sort(),
    postings: (source.postings || []).map(item => item.id).sort(),
    links: (source.links || []).map(item => item.id).sort(),
    entities: entities.map(item => `${item.entityType}:${item.id}`).sort(),
    archives: archives.map(item => ({ year: item.year, scope: item.scope, records: (item.data?.trans || []).map(row => row.id).sort() })).sort((a, b) => a.year - b.year),
  };
};
const hash = canonical => crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
const manifestCounts = canonical => ({
  transactions: canonical.transactions.length, postings: canonical.postings.length, links: canonical.links.length,
  accounts: canonical.accounts.length, exchangeRates: canonical.exchangeRates.length, entities: canonical.entities.length,
  coldArchiveBundles: canonical.archives.length,
  coldArchiveRecords: canonical.archives.reduce((sum, archive) => sum + archive.records.length, 0),
});
const isCanonicalRestoreOperationIdV11 = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
const deriveCanonicalRestoreProofDigestV11 = ({ operationId, ledgerId, fromEpoch, toEpoch, semanticHash, validatorVersion, counts }) => {
  const orderedCounts = Object.fromEntries(countKeys.map(key => [key, Number(counts[key])]));
  return crypto.createHash('sha256').update(JSON.stringify({
    domain: 'MYFI:P10-012:RESTORE-PROOF:V1', operationId: String(operationId).toLowerCase(),
    ledgerId: String(ledgerId), fromEpoch: Number(fromEpoch), toEpoch: Number(toEpoch),
    semanticHash: String(semanticHash).toLowerCase(), validatorVersion: Number(validatorVersion), counts: orderedCounts,
  })).digest('hex');
};
globalThis.__P10_RESTORE_PROOF__ = { deriveCanonicalRestoreProofDigestV11, isCanonicalRestoreOperationIdV11 };

const promotionFilename = path.join(root, 'src/lib/financialRestorePromotionV11.js');
let promotionSource = fs.readFileSync(promotionFilename, 'utf8')
  .replace(/import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/,
    `const { FINANCIAL_LEDGER_SCHEMA_VERSION, runFinancialRestorePromotionTransactionV8 } = globalThis.__P10_REPOSITORY__;`)
  .replace(/import \{ CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS \} from '\.\/financialBackupV11';/, `const CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS = globalThis.__P10_COUNT_KEYS__;`)
  .replace(/import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/,
    `const cloudWorkspaceCfg = cfg => cfg?.currency === undefined ? {} : { currency: cfg.currency };
const mergeCloudWorkspaceCfg = (localCfg = {}, cloudCfg = {}) => ({ ...(localCfg || {}), ...cloudWorkspaceCfg(cloudCfg) });`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialRestoreProofV11';/,
    `const { deriveCanonicalRestoreProofDigestV11, isCanonicalRestoreOperationIdV11 } = globalThis.__P10_RESTORE_PROOF__;`)
  .replace(/export const /g, 'const ');
globalThis.__P10_COUNT_KEYS__ = countKeys;
promotionSource += `\nmodule.exports = { promoteCanonicalRestoreStageV11 };\n`;
const { promoteCanonicalRestoreStageV11 } = compile(promotionFilename, promotionSource);

const recoveryFilename = path.join(root, 'src/lib/financialRestoreRecoveryV11.js');
let recoverySource = fs.readFileSync(recoveryFilename, 'utf8')
  .replace(/import \{ readCanonicalBackupSource \} from '\.\/financialBackupV2';/, `const { readCanonicalBackupSource } = globalThis.__P10_BACKUP__;`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialSemanticProjection';/, `const canonicalizeFinancialLedgerV2 = value => globalThis.__P10_CANON__(value); const semanticHashCanonicalV2 = value => globalThis.__P10_HASH__(value);`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialBackupV11';/, `const CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS = globalThis.__P10_COUNT_KEYS__; const canonicalBackupV11ManifestCounts = value => globalThis.__P10_COUNTS__(value);`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/, `const { ensureFinancialLedgerV7 } = globalThis.__P10_REPOSITORY__;`)
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task); const getLedgerDb = async () => globalThis.__P10_DB__; const runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialRestoreProofV11';/,
    `const { deriveCanonicalRestoreProofDigestV11, isCanonicalRestoreOperationIdV11 } = globalThis.__P10_RESTORE_PROOF__;`)
  .replace(/export const /g, 'const ');
recoverySource += `\nmodule.exports = { readCanonicalRestoreRecoveryStateV11, recoverCanonicalRestoreAfterCommitV11 };\n`;
globalThis.__P10_CANON__ = canonicalize;
globalThis.__P10_HASH__ = hash;
globalThis.__P10_COUNTS__ = manifestCounts;
const { readCanonicalRestoreRecoveryStateV11, recoverCanonicalRestoreAfterCommitV11 } = compile(recoveryFilename, recoverySource);

const coordinatorFilename = path.join(root, 'src/lib/financialRestoreCloudRecoveryV11.js');
let coordinatorSource = fs.readFileSync(coordinatorFilename, 'utf8')
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task); const getLedgerDb = async () => globalThis.__P10_DB__; const runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialRestoreProofV11';/,
    `const { deriveCanonicalRestoreProofDigestV11, isCanonicalRestoreOperationIdV11 } = globalThis.__P10_RESTORE_PROOF__;`)
  .replace(/export const /g, 'const ');
coordinatorSource += `\nmodule.exports = { runCanonicalRestoreCloudRecoveryV11 };\n`;
const { runCanonicalRestoreCloudRecoveryV11 } = compile(coordinatorFilename, coordinatorSource);

const now = '2026-08-21T13:00:00.000Z';
const namespace = 'workspace:restart-proof';
const stage = `${namespace}::restore-stage::restart`;
const authUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId = '11111111-1111-4111-8111-111111111111';
const run = (sql, ...params) => database.runAsync(sql, ...params);

const seedRows = async (target, label) => {
  await run(`INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)`, target, `wallet-${label}`, label, 'wallet', 'personal', 'IQD', 'active', now, now);
  await run(`INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, target, `tx-${label}`, 'expense', 'posted', 'personal', '2026-08-21', now, null, label, null, 'manual', null, `key-${label}`, 'device', 1, null, null, null, JSON.stringify({ id: `tx-${label}` }), now, now);
  await run(`INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, target, `posting-${label}`, `tx-${label}`, `wallet-${label}`, 'physical', 'expense', -1, 'IQD', null, now);
  await run(`INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)`, target, 'personal', label === 'new' ? 2025 : 2024, now, label, 1, 0, 1, -1, '{}');
  await run(`INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, target, 'personal', label === 'new' ? 2025 : 2024, `archive-${label}`, '2025-01-01', 1, `wallet-${label}`, null, 'expense', label, JSON.stringify({ id: `archive-${label}` }));
};

const coordinatorAdapters = () => ({
  preflight: async request => {
    const identity = await database.getFirstAsync(
      `SELECT ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, namespace,
    );
    const stageMarker = await database.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, `canonical_restore_stage_v11:${stage}`,
    );
    return {
      ok: true,
      namespace,
      authUserId,
      ledgerId: identity?.ledger_id,
      restoreEpoch: Number(identity?.restore_epoch),
      activeProtocolVersion: 2,
      pendingMutationCount: 0,
      stageReady: request.resumePhase === 'post_commit' || !!stageMarker,
      sqliteIntegrity: true,
      writerQueueDrained: true,
      storageReady: true,
      maintenanceOwned: true,
      workspaceAuthorized: true,
    };
  },
  getAuthenticatedUserId: async () => ({ authUserId }),
  advanceOrResolveRestoreEpoch: async request => ({
    ok: true, outcome: 'already_advanced', eventId: '33333333-3333-4333-8333-333333333333',
    ownerId: authUserId, ledgerId: 'ledger-restart', fromEpoch: 7, toEpoch: 8,
    reason: 'backup_restore', deviceId: 'device-p10-011', operationId,
    restoreProofDigest: request.restoreProofDigest,
  }),
  promoteCanonicalRestoreStage: args => promoteCanonicalRestoreStageV11(args),
  reloadCanonicalRestore: ({ namespace: targetNamespace, database: targetDatabase }) => (
    recoverCanonicalRestoreAfterCommitV11({
      namespace: targetNamespace,
      database: targetDatabase,
      reload: async ({ source }) => ({ ok: source.transactions[0]?.id === 'tx-new' }),
    })
  ),
  activateRestoreBaselineV2: async ({ onPhase, operationId: boundOperationId }) => {
    await onPhase('cloud_readback_verified', {
      ledgerId: 'ledger-restart', restoreEpoch: 8, bootstrapId: 'bootstrap-restart',
      identityVerified: true, manifestVerified: true, rowCountVerified: true,
    });
    await onPhase('shadow_quiescent', {
      ledgerId: 'ledger-restart', restoreEpoch: 8, pendingAfterSync: 0,
      conflictCount: 0, shadowOnly: true, productionApplyPerformed: false,
    });
    return {
      ok: true, operationId: boundOperationId, ledgerId: 'ledger-restart', restoreEpoch: 8,
      activeProtocolVersion: 2, productionApplyPerformed: false,
      readbackVerified: true, shadowQuiescent: true,
    };
  },
});

(async () => {
  const externalFilename = String(process.env.MYFI_P10_012_RUNTIME_DB_FILE || '').trim();
  const resumeExternal = process.env.MYFI_P10_012_RUNTIME_RESUME === '1';
  const hardExitBoundary = String(process.env.MYFI_P10_012_HARD_EXIT_BOUNDARY || '').trim();
  const temp = externalFilename ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'myfi-p10-011-'));
  const filename = externalFilename || path.join(temp, 'restart.sqlite');
  try {
    database = new AsyncSqlite(filename); globalThis.__P10_DB__ = database;
    if (resumeExternal) {
      const resumed = await runCanonicalRestoreCloudRecoveryV11({
        namespace, database, adapters: coordinatorAdapters(),
      });
      assert.equal(resumed.ok, true, JSON.stringify(resumed));
      assert.equal(resumed.status, 'v2_activated');
      console.log('MYFI P10-012 REAL FINANCIAL HARD-EXIT RESUME: PASS');
      return;
    }
    await database.execAsync(`${repository.FINANCIAL_LEDGER_V7_SCHEMA_SQL}\n${repository.FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL}`);
    await archive.ensureColdArchiveSchema();
    await run(`INSERT INTO ledger_currencies(code,minor_exponent,enabled) VALUES ('IQD',3,1)`);
    await run(`INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`, namespace, 'ledger-restart', 7, 2, 2, now, now);
    await seedRows(namespace, 'old');
    await seedRows(stage, 'new');
    await run(`INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`, namespace, 'sqlite', 7, JSON.stringify({ localPreferences: { cfg: { currency: 'IQD', language: 'ar' } } }), now);
    await run(`INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`, stage, 'shadow', 7, JSON.stringify({ cfg: { currency: 'USD' } }), now);

    const stagedSource = await backup.readCanonicalBackupSource({ namespace: stage });
    const proof = { semanticHash: hash(canonicalize(stagedSource)), counts: manifestCounts(canonicalize(stagedSource)), validatorVersion: 1 };
    await run(`INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, `canonical_restore_stage_v11:${stage}`, JSON.stringify({ version: 1, state: 'ready', namespace: stage, ledgerId: 'ledger-restart', ...proof }), now);
    const operation = {
      namespace, authUserId, ledgerId: 'ledger-restart', fromEpoch: 7, toEpoch: 8,
      deviceId: 'device-p10-011', operationId, stageNamespace: stage, stageProof: proof,
    };
    const afterCommit = await runCanonicalRestoreCloudRecoveryV11({
      operation,
      database,
      adapters: coordinatorAdapters(),
      faultInjector: point => {
        if (hardExitBoundary && point === hardExitBoundary) process.exit(86);
        if (!hardExitBoundary && point === 'after_local_promotion') {
          throw new Error('p10_012_process_stop_after_local_commit');
        }
      },
    });
    if (externalFilename) {
      throw new Error(`hard_exit_boundary_not_reached:${hardExitBoundary}:${JSON.stringify(afterCommit)}`);
    }
    assert.equal(afterCommit.ok, false);
    assert.equal(afterCommit.reason, 'canonical_restore_cloud_operation_failed',
      'fault details must not be persisted or exposed as diagnostic codes');

    // Equivalent to the app process disappearing immediately after COMMIT: no cache
    // reload callback and no P10-011 state write have run before the file is reopened.
    database.close(); database = new AsyncSqlite(filename); globalThis.__P10_DB__ = database;
    const pending = await readCanonicalRestoreRecoveryStateV11({ namespace, database });
    assert.equal(pending.ok, true); assert.equal(pending.recovery.status, 'local_promoted_pending_reload');

    let cached = null;
    const interrupted = await recoverCanonicalRestoreAfterCommitV11({
      namespace, database,
      reload: async ({ source }) => { cached = source; return { ok: true }; },
      faultInjector: point => { if (point === 'after_cache_reload_before_state') throw new Error('canonical_restore_reload_fault:after_cache_reload_before_state'); },
    });
    assert.equal(interrupted.ok, false);
    assert.equal(interrupted.reason, 'canonical_restore_reload_fault:after_cache_reload_before_state');
    assert.deepEqual(cached.transactions.map(item => item.id), ['tx-new'], 'the reload adapter receives the committed canonical ledger, never stale cache data');
    assert.equal((await readCanonicalRestoreRecoveryStateV11({ namespace, database })).recovery.status, 'local_promoted_pending_reload', 'a crash before durable reload state remains retryable');

    database.close(); database = new AsyncSqlite(filename); globalThis.__P10_DB__ = database;
    let winningRecovery = null;
    const staleRecovery = await recoverCanonicalRestoreAfterCommitV11({
      namespace,
      database,
      reload: async ({ source }) => {
        winningRecovery = await recoverCanonicalRestoreAfterCommitV11({
          namespace, database,
          reload: async ({ source: winnerSource }) => ({ ok: winnerSource.transactions[0]?.id === 'tx-new' }),
        });
        return { ok: source.transactions[0]?.id === 'tx-new' };
      },
    });
    assert.equal(winningRecovery.ok, true);
    assert.equal(staleRecovery.ok, false);
    assert.equal(staleRecovery.reason, 'canonical_restore_reload_state_changed',
      'a stale reload callback must not overwrite the newer durable state');
    const completed = await readCanonicalRestoreRecoveryStateV11({ namespace, database });
    assert.equal(completed.recovery.status, 'local_reloaded_reconciliation_required');
    const repeated = await recoverCanonicalRestoreAfterCommitV11({ namespace, database, reload: async () => ({ ok: true }) });
    assert.equal(repeated.ok, true); assert.equal(repeated.idempotent, true, 'restart recovery is safe to run twice');
    const activated = await runCanonicalRestoreCloudRecoveryV11({
      namespace,
      database,
      adapters: coordinatorAdapters(),
    });
    assert.equal(activated.ok, true); assert.equal(activated.status, 'v2_activated');
    const finalRecovery = await readCanonicalRestoreRecoveryStateV11({ namespace, database });
    assert.equal(finalRecovery.pending, false);
    assert.equal(finalRecovery.recovery.reconciliationRequired, false);
    console.log('[PASS] P10-012 crosses real P10-010 COMMIT, real P10-011 restart reload and shadow-only activation');
    console.log('MYFI P10-011 POST-COMMIT RESTART/RECOVERY: PASS');
  } finally {
    try { database?.close(); } catch {}
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
