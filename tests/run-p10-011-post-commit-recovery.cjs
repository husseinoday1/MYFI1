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

const promotionFilename = path.join(root, 'src/lib/financialRestorePromotionV11.js');
let promotionSource = fs.readFileSync(promotionFilename, 'utf8')
  .replace(/import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/,
    `const { FINANCIAL_LEDGER_SCHEMA_VERSION, runFinancialRestorePromotionTransactionV8 } = globalThis.__P10_REPOSITORY__;`)
  .replace(/import \{ CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS \} from '\.\/financialBackupV11';/, `const CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS = globalThis.__P10_COUNT_KEYS__;`)
  .replace(/import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/,
    `const cloudWorkspaceCfg = cfg => cfg?.currency === undefined ? {} : { currency: cfg.currency };
const mergeCloudWorkspaceCfg = (localCfg = {}, cloudCfg = {}) => ({ ...(localCfg || {}), ...cloudWorkspaceCfg(cloudCfg) });`)
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
  .replace(/export const /g, 'const ');
recoverySource += `\nmodule.exports = { readCanonicalRestoreRecoveryStateV11, recoverCanonicalRestoreAfterCommitV11 };\n`;
globalThis.__P10_CANON__ = canonicalize;
globalThis.__P10_HASH__ = hash;
globalThis.__P10_COUNTS__ = manifestCounts;
const { readCanonicalRestoreRecoveryStateV11, recoverCanonicalRestoreAfterCommitV11 } = compile(recoveryFilename, recoverySource);

const now = '2026-08-21T13:00:00.000Z';
const namespace = 'user:restart-proof';
const stage = `${namespace}::restore-stage::restart`;
const run = (sql, ...params) => database.runAsync(sql, ...params);

const seedRows = async (target, label) => {
  await run(`INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)`, target, `wallet-${label}`, label, 'wallet', 'personal', 'IQD', 'active', now, now);
  await run(`INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, target, `tx-${label}`, 'expense', 'posted', 'personal', '2026-08-21', now, null, label, null, 'manual', null, `key-${label}`, 'device', 1, null, null, null, JSON.stringify({ id: `tx-${label}` }), now, now);
  await run(`INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, target, `posting-${label}`, `tx-${label}`, `wallet-${label}`, 'physical', 'expense', -1, 'IQD', null, now);
  await run(`INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)`, target, 'personal', label === 'new' ? 2025 : 2024, now, label, 1, 0, 1, -1, '{}');
  await run(`INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, target, 'personal', label === 'new' ? 2025 : 2024, `archive-${label}`, '2025-01-01', 1, `wallet-${label}`, null, 'expense', label, JSON.stringify({ id: `archive-${label}` }));
};

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'myfi-p10-011-'));
  const filename = path.join(temp, 'restart.sqlite');
  try {
    database = new AsyncSqlite(filename); globalThis.__P10_DB__ = database;
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
    await run(`INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, `restore_intent:${namespace}`, JSON.stringify({ version: 1, namespace, ledgerId: 'ledger-restart', fromEpoch: 7, toEpoch: 8, operation: 'backup_restore' }), now);
    const promoted = await promoteCanonicalRestoreStageV11({ namespace, stageNamespace: stage, stageProof: proof, expectedFromEpoch: 7, toEpoch: 8, database });
    assert.equal(promoted.ok, true, 'fixture must reach the real P10-010 COMMIT');

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
    const recovered = await recoverCanonicalRestoreAfterCommitV11({ namespace, database, reload: async ({ source }) => ({ ok: source.transactions[0]?.id === 'tx-new' }) });
    assert.equal(recovered.ok, true); assert.equal(recovered.reconciliationRequired, true);
    const completed = await readCanonicalRestoreRecoveryStateV11({ namespace, database });
    assert.equal(completed.recovery.status, 'local_reloaded_reconciliation_required');
    const repeated = await recoverCanonicalRestoreAfterCommitV11({ namespace, database, reload: async () => ({ ok: true }) });
    assert.equal(repeated.ok, true); assert.equal(repeated.idempotent, true, 'restart recovery is safe to run twice');
    console.log('MYFI P10-011 POST-COMMIT RESTART/RECOVERY: PASS');
  } finally {
    try { database?.close(); } catch {}
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
