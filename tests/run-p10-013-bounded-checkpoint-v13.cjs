// Phase 10 / P10-013 B3 — bounded SQL-native checkpoint copy and crash rollback.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const compile = (filename, source) => {
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename)); m._compile(source, filename); return m.exports;
};
const countKeys = Object.freeze(['transactions','postings','links','accounts','exchangeRates','entities','coldArchiveBundles','coldArchiveRecords']);
const zeroCounts = Object.freeze(Object.fromEntries(countKeys.map(key => [key, 0])));
const pickFinancialBackupConfig = (cfg = {}) => ({
  currency: cfg.currency || 'IQD', profileType: cfg.profileType || 'personal', activeScope: cfg.activeScope || 'personal',
  enabledModules: cfg.enabledModules && typeof cfg.enabledModules === 'object' ? { ...cfg.enabledModules } : {},
  defaultWalletId: cfg.defaultWalletId || null,
  categoryBudgets: cfg.categoryBudgets && typeof cfg.categoryBudgets === 'object' ? { ...cfg.categoryBudgets } : {},
  categoryBudgetsByMonth: cfg.categoryBudgetsByMonth && typeof cfg.categoryBudgetsByMonth === 'object' ? { ...cfg.categoryBudgetsByMonth } : {},
  archiveSummaries: Array.isArray(cfg.archiveSummaries) ? cfg.archiveSummaries.map(item => ({ ...item })) : [],
});

class AsyncSqlite {
  constructor() { this.native = new DatabaseSync(':memory:'); this.native.exec('PRAGMA foreign_keys = ON'); }
  async execAsync(sql) { this.native.exec(String(sql)); }
  async runAsync(sql, ...params) { const r = this.native.prepare(String(sql)).run(...params); return { changes: Number(r.changes || 0) }; }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async *getEachAsync(sql, params = []) { for (const row of this.native.prepare(String(sql)).all(...params)) yield row; }
  async withExclusiveTransactionAsync(task) { this.native.exec('BEGIN IMMEDIATE'); try { const v = await task(this); this.native.exec('COMMIT'); return v; } catch (e) { this.native.exec('ROLLBACK'); throw e; } }
  close() { this.native.close(); }
}
const db = new AsyncSqlite();

// Compile real generation module.
const generationFilename = path.join(root, 'src/lib/financialLiveGenerationV13.js');
let generationSource = fs.readFileSync(generationFilename, 'utf8').replace(/export const /g, 'const ');
generationSource += `\nmodule.exports = { registerLiveGenerationInTransactionV13, readLiveGenerationInTransactionV13 };`;
const generation = compile(generationFilename, generationSource);
globalThis.__GEN__ = generation;

// Compile proof normalization used by the real start snapshot.
const proofFilename = path.join(root, 'src/lib/financialRestoreProofV13.js');
let proofSource = fs.readFileSync(proofFilename, 'utf8')
  .replace(/import \{ sha256 \} from '@noble\/hashes\/sha2';/, `const sha256 = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest();`)
  .replace(/import \{ bytesToHex \} from '@noble\/hashes\/utils';/, `const bytesToHex = bytes => Buffer.from(bytes).toString('hex');`)
  .replace(/import \{ CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS \} from '\.\/financialBackupV11';/, `const CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS = globalThis.__COUNT_KEYS__;`)
  .replace(/import \{ SEMANTIC_HASH_V3_VERSION \} from '\.\/financialSemanticProjection';/, `const SEMANTIC_HASH_V3_VERSION = 3;`)
  .replace(/export const /g, 'const ');
proofSource = `const crypto = require('node:crypto');\n${proofSource}`;
proofSource += `\nmodule.exports = { CANONICAL_RESTORE_PROOF_V13_VERSION, normalizeCanonicalRestoreProofCountsV13 };`;
globalThis.__COUNT_KEYS__ = countKeys;
const proof = compile(proofFilename, proofSource);
globalThis.__PROOF__ = proof;

const snapshotFilename = path.join(root, 'src/lib/financialRestoreStartSnapshotV13.js');
let snapshotSource = fs.readFileSync(snapshotFilename, 'utf8')
  .replace(/import \{ readLiveGenerationInTransactionV13 \} from '\.\/financialLiveGenerationV13';/, `const { readLiveGenerationInTransactionV13 } = globalThis.__GEN__;`)
  .replace(/import \{ SEMANTIC_HASH_V3_VERSION \} from '\.\/financialSemanticProjection';/, `const SEMANTIC_HASH_V3_VERSION = 3;`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialRestoreProofV13';/, `const { CANONICAL_RESTORE_PROOF_V13_VERSION, normalizeCanonicalRestoreProofCountsV13 } = globalThis.__PROOF__;`)
  .replace(/export const /g, 'const ');
snapshotSource += `\nmodule.exports = { captureRestoreStartSnapshotInTransactionV13, readRestoreStartSnapshotInTransactionV13 };`;
const snapshot = compile(snapshotFilename, snapshotSource);
globalThis.__SNAPSHOT__ = snapshot;

const checkpointFilename = path.join(root, 'src/lib/financialRestoreCheckpointV13.js');
let checkpointSource = fs.readFileSync(checkpointFilename, 'utf8')
  .replace(/import \{ CANONICAL_ROW_SOURCE_V3_BATCH_POLICY \} from '\.\/financialCanonicalRowSourceV3';/, `const CANONICAL_ROW_SOURCE_V3_BATCH_POLICY = { version:1, defaultMaxRows:128, defaultMaxBytes:131072, absoluteMaxRows:512, absoluteMaxBytes:1048576, absoluteMaxRowBytes:262144 };`)
  .replace(/import \{ pickFinancialBackupConfig \} from '\.\/backupData';/, `const pickFinancialBackupConfig = globalThis.__PICK_CFG__;`)
  .replace(/import \{ readRestoreStartSnapshotInTransactionV13 \} from '\.\/financialRestoreStartSnapshotV13';/, `const { readRestoreStartSnapshotInTransactionV13 } = globalThis.__SNAPSHOT__;`)
  .replace(/export const /g, 'const ');
checkpointSource += `\nmodule.exports = { initializeRestoreCheckpointInTransactionV13, copyNextRestoreCheckpointBatchInTransactionV13 };`;
globalThis.__PICK_CFG__ = pickFinancialBackupConfig;
const checkpoint = compile(checkpointFilename, checkpointSource);

// Pull the schema constants from the real repository without executing app dependencies.
const repoFilename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
let repoSource = fs.readFileSync(repoFilename, 'utf8')
  .replace(/import \{ Platform \} from 'react-native';/, `const Platform={OS:'android'};`)
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/, `const enqueueLedgerWrite=f=>f(); const getLedgerDb=async()=>null; const runLedgerExclusiveTransaction=async()=>{};`)
  .replace(/import \{ runLedgerSchemaMigrations \} from '\.\/financialLedgerSchemaMigrations';/, `const runLedgerSchemaMigrations=async()=>{};`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialLedgerV7Model';/, `const buildExpenseLedgerCommand=()=>{}; const buildFinancialLedgerCommand=()=>{}; const FINANCIAL_LEDGER_SCHEMA_VERSION=7;`)
  .replace(/import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/, `const cloudWorkspaceCfg=v=>v||{}; const mergeCloudWorkspaceCfg=(a,b)=>({...a,...b});`)
  .replace(/import \{[\s\S]*?\} from '\.\/localArchiveRepository';/, `const clearColdArchiveNamespaceInTransaction=async()=>{}; const ensureColdArchiveSchema=async()=>{}; const replaceColdArchiveNamespaceFromStageInTransaction=async()=>{};`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/, `const advanceLiveGenerationForMutationInTransactionV13=async()=>{}; const rebindLiveGenerationForRestoreEpochInTransactionV13=async()=>{};`)
  .replace(/export const /g, 'const ').replace(/export async function /g, 'async function ').replace(/export function /g, 'function ');
repoSource += `\nmodule.exports={FINANCIAL_LEDGER_V7_SCHEMA_SQL,FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL};`;
const repo = compile(repoFilename, repoSource);

const archiveSchema = `
CREATE TABLE cold_archive_years(namespace TEXT NOT NULL,scope TEXT NOT NULL,year INTEGER NOT NULL,archived_at TEXT NOT NULL,checksum TEXT,transaction_count INTEGER NOT NULL DEFAULT 0,income REAL NOT NULL DEFAULT 0,expense REAL NOT NULL DEFAULT 0,net REAL NOT NULL DEFAULT 0,metadata_json TEXT NOT NULL,PRIMARY KEY(namespace,scope,year));
CREATE TABLE cold_archive_transactions(namespace TEXT NOT NULL,scope TEXT NOT NULL,year INTEGER NOT NULL,id TEXT NOT NULL,date_iso TEXT,ts INTEGER NOT NULL DEFAULT 0,wallet_id TEXT,category_id TEXT,flow_type TEXT,search_text TEXT,payload_json TEXT NOT NULL,PRIMARY KEY(namespace,scope,year,id),FOREIGN KEY(namespace,scope,year) REFERENCES cold_archive_years(namespace,scope,year) ON DELETE CASCADE);`;
const now = '2026-08-22T00:00:00.000Z';
const namespace = 'user:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ledgerId = 'ledger-b3';
const operationId = '11111111-1111-4111-8111-111111111111';
const checkpointId = '22222222-2222-4222-8222-222222222222';
const stageNamespace = `${namespace}::restore-stage::incoming`;
const checkpointNamespace = `${namespace}::restore-checkpoint::${checkpointId}`;

(async () => {
  await db.execAsync(`${repo.FINANCIAL_LEDGER_V7_SCHEMA_SQL}\n${repo.FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL}\n${archiveSchema}`);
  await db.runAsync(`INSERT INTO ledger_currencies(code,minor_exponent,enabled) VALUES ('IQD',3,1)`);
  await db.runAsync(`INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`, namespace, ledgerId, 7, 2, 2, now, now);
  await db.withExclusiveTransactionAsync(txn => generation.registerLiveGenerationInTransactionV13({ database: txn, namespace, ledgerId, restoreEpoch: 7 }));
  await db.runAsync(`UPDATE ledger_v7_meta SET value=? WHERE key=?`, JSON.stringify({ tokenVersion:1,namespace,ledgerId,restoreEpoch:7,generation:9 }), `financial_live_generation_v13:${namespace}`);
  await db.runAsync(`INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`, namespace, 'sqlite', 7,
    JSON.stringify({ localPreferences:{ cfg:{ currency:'IQD',profileType:'personal',activeScope:'personal',defaultWalletId:'a0',theme:'dark',language:'ar' }, notif:{ quiet:true } } }), now);

  for (let i=0;i<5;i++) {
    const id=`a${i}`;
    await db.runAsync(`INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)`, namespace,id,`Wallet ${i}`,'wallet','personal','IQD','active',now,now);
    await db.runAsync(`INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, namespace,`t${i}`,'expense','posted','personal','2026-08-22',now,null,`T${i}`,null,'manual',null,`idem-${i}`,'device',1,null,null,null,JSON.stringify({id:`t${i}`,amount:100+i}),now,now);
    await db.runAsync(`INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, namespace,`p${i}`,`t${i}`,id,'physical','expense',-(1000+i),'IQD',null,now);
    await db.runAsync(`INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`, namespace,'wallet',`e${i}`,1,null,JSON.stringify({id:`e${i}`,currency:'IQD'}),now,now);
  }
  for (let i=0;i<2;i++) await db.runAsync(`INSERT INTO ledger_transaction_links_v7(namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at) VALUES (?,?,?,?,?,?,?,?,?)`, namespace,`l${i}`,`t${i}`,'goal',`g${i}`,'applied',100,'IQD',now);

  await db.runAsync(`INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)`, namespace,'personal',2024,now,'h1',2,0,0,0,JSON.stringify({debts:[{id:'d1'},{id:'d2'}],goals:[{id:'g1'}],wallets:[],commitments:[],cats:[],cfg:{currency:'IQD'}}));
  await db.runAsync(`INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)`, namespace,'personal',2025,now,'h2',1,0,0,0,JSON.stringify({debts:[],goals:[],wallets:[{id:'w1'}],commitments:[],cats:[],cfg:{currency:'IQD'}}));
  for (const [year,id] of [[2024,'old1'],[2024,'old2'],[2025,'old3']]) await db.runAsync(`INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, namespace,'personal',year,id,'2024-01-01',1,null,null,'expense','',JSON.stringify({id}));

  await db.withExclusiveTransactionAsync(txn => snapshot.captureRestoreStartSnapshotInTransactionV13({ database:txn, namespace, operationId, stageNamespace, checkpointId, semanticHashVersion:3, incomingSemanticHash:'a'.repeat(64), incomingCounts:zeroCounts, validatorVersion:2, batchPolicyVersion:1 }));
  const initial = await db.withExclusiveTransactionAsync(txn => checkpoint.initializeRestoreCheckpointInTransactionV13({ database:txn, namespace, operationId }));
  assert.equal(initial.status,'COPYING');

  await assert.rejects(
    db.withExclusiveTransactionAsync(txn => checkpoint.copyNextRestoreCheckpointBatchInTransactionV13({ database:txn, namespace, checkpointId, maxRows:2, maxBytes:1048576, faultInjector: point => { if (point==='after_copy_before_checkpoint_state') throw new Error('checkpoint_crash'); } })),
    /checkpoint_crash/,
  );
  assert.equal((await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ledger_accounts_v7 WHERE namespace=?`, checkpointNamespace)).n,0,'fault rolls copied rows back');
  let state = JSON.parse((await db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=?`, `canonical_restore_checkpoint_v13:${namespace}:${checkpointId}`)).value);
  assert.equal(state.stateVersion,1); assert.equal(state.cursor,null);
  console.log('[PASS] batch payload + cursor/state roll back together');

  let calls=0;
  while (state.status !== 'PROVING_CHECKPOINT') {
    state = await db.withExclusiveTransactionAsync(txn => checkpoint.copyNextRestoreCheckpointBatchInTransactionV13({ database:txn, namespace, checkpointId, maxRows:2, maxBytes:1048576 }));
    calls += 1; if (calls > 100) throw new Error('checkpoint_loop');
  }
  assert.ok(calls > 8,'small maxRows forces multiple bounded batches');
  for (const [table,expected] of [['ledger_accounts_v7',5],['ledger_financial_transactions_v7',5],['ledger_postings_v7',5],['ledger_transaction_links_v7',2],['ledger_entities_v7',5],['cold_archive_years',2],['cold_archive_transactions',3]]) {
    assert.equal(Number((await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${table} WHERE namespace=?`,checkpointNamespace)).n),expected,table);
  }
  assert.deepEqual(state.counts,{transactions:5,postings:5,links:2,accounts:5,exchangeRates:0,entities:5,coldArchiveBundles:2,coldArchiveRecords:7},'coldArchiveRecords includes metadata arrays + transaction rows exactly once');
  const checkpointWorkspace=JSON.parse((await db.getFirstAsync(`SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=?`,checkpointNamespace)).payload_json);
  assert.equal(checkpointWorkspace.cfg.currency,'IQD');
  assert.equal(Object.prototype.hasOwnProperty.call(checkpointWorkspace.cfg,'theme'),false);
  assert.equal(JSON.stringify(checkpointWorkspace).includes('notif'),false,'device-local preferences are not copied into Undo checkpoint');
  const token=JSON.parse((await db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=?`,`financial_live_generation_v13:${namespace}`)).value);
  assert.equal(token.generation,9,'private checkpoint copy never advances active generation');
  const sourceText=fs.readFileSync(checkpointFilename,'utf8');
  assert.equal(sourceText.includes('getAllAsync'),false,'bounded checkpoint path must not use getAllAsync');
  assert.equal(sourceText.includes('INSERT INTO ledger_financial_transactions_v7'),true,'financial payload copy remains SQL-native');
  console.log('[PASS] bounded SQL-native checkpoint reaches PROVING with exact counts and stripped workspace preferences');
  console.log('MYFI P10-013 B3 BOUNDED CHECKPOINT: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
