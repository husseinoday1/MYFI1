const assert = require('node:assert/strict');
const fs = require('node:fs');
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
  constructor() {
    this.native = new DatabaseSync(':memory:');
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
    try { const result = await task(this); this.native.exec('COMMIT'); return result; }
    catch (error) { this.native.exec('ROLLBACK'); throw error; }
  }
  close() { this.native.close(); }
}

const db = new AsyncSqlite();
globalThis.__P10_DB__ = db;
globalThis.__P10_QUEUE__ = task => task();
globalThis.__P10_EXCLUSIVE__ = (database, task) => database.withExclusiveTransactionAsync(task);
globalThis.__P10_MIGRATIONS__ = async () => true;

// Compile the actual V13 token implementation so B5 exercises the B1 epoch/generation
// binding rather than a stub.
const genFilename = path.join(root, 'src/lib/financialLiveGenerationV13.js');
let genSource = fs.readFileSync(genFilename, 'utf8').replace(/export const /g, 'const ');
genSource += `\nmodule.exports = { registerLiveGenerationInTransactionV13, readLiveGenerationInTransactionV13, advanceLiveGenerationInTransactionV13, advanceLiveGenerationForMutationInTransactionV13, rebindLiveGenerationForRestoreEpochInTransactionV13 };\n`;
const generation = compile(genFilename, genSource);
globalThis.__P10_GENERATION__ = generation;

const archiveFilename = path.join(root, 'src/lib/localArchiveRepository.js');
let archiveSource = fs.readFileSync(archiveFilename, 'utf8')
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task);\nconst getLedgerDb = async () => globalThis.__P10_DB__;\nconst runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`)
  .replace(/import \{ defaultScopeForProfile, normalizeScope \} from '\.\/modules';/,
    `const defaultScopeForProfile = () => 'personal';\nconst normalizeScope = value => value;`)
  .replace(/import \{ advanceLiveGenerationForMutationInTransactionV13 \} from '\.\/financialLiveGenerationV13';/,
    `const { advanceLiveGenerationForMutationInTransactionV13 } = globalThis.__P10_GENERATION__;`)
  .replace(/export const /g, 'const ');
archiveSource += `\nmodule.exports = { ensureColdArchiveSchema, clearColdArchiveNamespaceInTransaction, replaceColdArchiveNamespaceFromStageInTransaction };\n`;
const archive = compile(archiveFilename, archiveSource);
globalThis.__P10_ARCHIVE__ = archive;

const repoFilename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
let repoSource = fs.readFileSync(repoFilename, 'utf8')
  .replace(/import \{ Platform \} from 'react-native';/, `const Platform = { OS: 'android' };`)
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task);\nconst getLedgerDb = async () => globalThis.__P10_DB__;\nconst runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`)
  .replace(/import \{ runLedgerSchemaMigrations \} from '\.\/financialLedgerSchemaMigrations';/,
    `const runLedgerSchemaMigrations = options => globalThis.__P10_MIGRATIONS__(options);`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialLedgerV7Model';/,
    `const buildExpenseLedgerCommand = () => { throw new Error('not_used_in_b5'); };\nconst buildFinancialLedgerCommand = () => { throw new Error('not_used_in_b5'); };\nconst FINANCIAL_LEDGER_SCHEMA_VERSION = 7;`)
  .replace(/import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/,
    `const cloudWorkspaceCfg = cfg => cfg?.currency === undefined ? {} : { currency: cfg.currency };\nconst mergeCloudWorkspaceCfg = (localCfg = {}, cloudCfg = {}) => ({ ...(localCfg || {}), ...cloudWorkspaceCfg(cloudCfg) });`)
  .replace(/import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
    `const { clearColdArchiveNamespaceInTransaction, ensureColdArchiveSchema, replaceColdArchiveNamespaceFromStageInTransaction } = globalThis.__P10_ARCHIVE__;`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/,
    `const { advanceLiveGenerationForMutationInTransactionV13, rebindLiveGenerationForRestoreEpochInTransactionV13 } = globalThis.__P10_GENERATION__;`)
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ')
  .replace(/export function /g, 'function ');
repoSource += `\nmodule.exports = { FINANCIAL_LEDGER_V7_SCHEMA_SQL, FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL, runFinancialRestorePromotionTransactionV8 };\n`;
const repository = compile(repoFilename, repoSource);
globalThis.__P10_REPOSITORY__ = repository;

globalThis.__P10_GUARD__ = null;
const promotionFilename = path.join(root, 'src/lib/financialRestorePromotionV13.js');
const promotionProductionSource = fs.readFileSync(promotionFilename, 'utf8');
const ledgerModelProductionSource = fs.readFileSync(
  path.join(root, 'src/lib/financialLedgerV7Model.js'), 'utf8',
);
assert(
  /import\s*\{\s*FINANCIAL_LEDGER_SCHEMA_VERSION\s*\}\s*from '\.\/financialLedgerV7Model';/.test(
    promotionProductionSource,
  ),
  'P10-013 production promotion must import FINANCIAL_LEDGER_SCHEMA_VERSION from financialLedgerV7Model',
);
assert.equal(
  /import\s*\{[\s\S]*?FINANCIAL_LEDGER_SCHEMA_VERSION[\s\S]*?\}\s*from '\.\/financialLedgerV7Repository';/.test(
    promotionProductionSource,
  ),
  false,
  'P10-013 production promotion must not import FINANCIAL_LEDGER_SCHEMA_VERSION from repository',
);
assert(
  ledgerModelProductionSource.includes('export const FINANCIAL_LEDGER_SCHEMA_VERSION = 7;'),
  'P10-013 ledger model must own/export schema version 7',
);
let promotionSource = promotionProductionSource
  .replace(
    "import { runFinancialRestorePromotionTransactionV8 } from './financialLedgerV7Repository';",
    `const { runFinancialRestorePromotionTransactionV8 } = globalThis.__P10_REPOSITORY__;`,
  )
  .replace(
    "import { FINANCIAL_LEDGER_SCHEMA_VERSION } from './financialLedgerV7Model';",
    `const FINANCIAL_LEDGER_SCHEMA_VERSION = 7;`,
  )
  .replace(/import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/,
    `const cloudWorkspaceCfg = cfg => cfg?.currency === undefined ? {} : { currency: cfg.currency };\nconst mergeCloudWorkspaceCfg = (localCfg = {}, cloudCfg = {}) => ({ ...(localCfg || {}), ...cloudWorkspaceCfg(cloudCfg) });`)
  .replace(/import \{ guardRestoreSourceBeforeEpochRpcInTransactionV13 \} from '\.\/financialRestoreSourceGuardV13';/,
    `const guardRestoreSourceBeforeEpochRpcInTransactionV13 = async () => globalThis.__P10_GUARD__;`)
  .replace(/import \{ normalizeCanonicalRestoreProofCountsV13 \} from '\.\/financialRestoreProofV13';/,
    `const normalizeCanonicalRestoreProofCountsV13 = value => {\n      const keys = ['transactions','postings','links','accounts','exchangeRates','entities','coldArchiveBundles','coldArchiveRecords'];\n      if (!value || typeof value !== 'object') return null;\n      const out = {};\n      for (const key of keys) { if (!Number.isSafeInteger(value[key]) || value[key] < 0) return null; out[key] = value[key]; }\n      return out;\n    };`)
  .replace(/export const /g, 'const ');
promotionSource += `\nmodule.exports = { createStrategyBRestoreIntentV13InTransaction, recordStrategyBServerProofV13InTransaction, promoteCanonicalRestoreStageV13 };\n`;
const promotion = compile(promotionFilename, promotionSource);

const now = '2026-08-22T00:00:00.000Z';
const namespace = 'user:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ledgerId = 'ledger-b5';
const stageNamespace = `${namespace}::restore-stage::11111111-1111-4111-8111-111111111111`;
const checkpointId = '22222222-2222-4222-8222-222222222222';
const checkpointNamespace = `${namespace}::restore-checkpoint::${checkpointId}`;
const operationId = '33333333-3333-4333-8333-333333333333';
const authUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const serverEventId = '44444444-4444-4444-8444-444444444444';
const deviceId = 'device-b5';
const incomingHash = 'a'.repeat(64);
const checkpointHash = 'b'.repeat(64);
const counts = Object.freeze({ transactions:1, postings:1, links:0, accounts:1, exchangeRates:0, entities:0, coldArchiveBundles:1, coldArchiveRecords:1 });
const checkpointCounts = Object.freeze({ ...counts });
const digest = 'c'.repeat(64);
const snapshotState = Object.freeze({
  namespace, ledgerId, operationId, stageNamespace, checkpointId, checkpointNamespace,
  sourceRestoreEpoch:7, sourceLiveGeneration:5, semanticHashVersion:3,
  incomingSemanticHash:incomingHash, incomingCounts:counts, validatorVersion:1,
});
const checkpointState = Object.freeze({
  version:1, stateVersion:10, status:'READY', namespace, ledgerId, operationId,
  checkpointId, checkpointNamespace, sourceRestoreEpoch:7, sourceLiveGeneration:5,
  semanticHashVersion:3, semanticHash:checkpointHash, counts:checkpointCounts, validatorVersion:1,
});
const guardOk = () => ({ supported:true, ok:true, snapshot:snapshotState, checkpoint:checkpointState,
  stage:{ state:'ready', namespace:stageNamespace, ledgerId, semanticHashVersion:3, semanticHash:incomingHash, validatorVersion:1, counts },
  restoreProofDigest:digest });

const run = (sql, ...params) => db.runAsync(sql, ...params);
const all = (sql, ...params) => db.getAllAsync(sql, ...params);
const meta = async key => { const row = await db.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=?', key); return row ? JSON.parse(row.value) : null; };

const seedRows = async (target, label) => {
  await run(`INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)`, target, `wallet-${label}`, `Wallet ${label}`, 'wallet', 'personal', 'IQD', 'active', now, now);
  await run(`INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, target, `tx-${label}`, 'expense','posted','personal','2026-08-22',now,null,`T ${label}`,null,'manual',null,`idem-${label}`,'device',1,null,null,null,JSON.stringify({id:`tx-${label}`}),now,now);
  await run(`INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, target, `post-${label}`, `tx-${label}`, `wallet-${label}`, 'physical','expense',-1,'IQD',null,now);
};
const seedArchive = async (target, label, year) => {
  await run(`INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?)`, target,'personal',year,now,`sum-${label}`,1,0,1,-1,JSON.stringify({debts:[],goals:[],wallets:[],commitments:[],cats:[]}));
  await run(`INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, target,'personal',year,`arc-${label}`,'2026-01-01',1,`wallet-${label}`,null,'expense',label,JSON.stringify({id:`arc-${label}`}));
};

const snapshotDb = async () => {
  const tables = ['ledger_accounts_v7','ledger_financial_transactions_v7','ledger_postings_v7','ledger_workspace_state_v7','cold_archive_years','cold_archive_transactions','ledger_v7_meta','ledger_sync_identity_v8','ledger_sync_state_v8'];
  const out = {};
  for (const table of tables) out[table] = await all(`SELECT * FROM ${table} ORDER BY rowid`);
  return out;
};

(async () => {
  await db.execAsync(`${repository.FINANCIAL_LEDGER_V7_SCHEMA_SQL}\n${repository.FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL}`);
  await archive.ensureColdArchiveSchema();
  await run(`INSERT INTO ledger_currencies(code,minor_exponent,enabled) VALUES ('IQD',3,1)`);
  await run(`INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`, namespace,ledgerId,7,2,2,now,now);
  await run(`INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,last_server_sequence,updated_at) VALUES (?,?,?,?)`, ledgerId,7,9,now);
  await run(`INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, `financial_live_generation_v13:${namespace}`, JSON.stringify({tokenVersion:1,namespace,ledgerId,restoreEpoch:7,generation:5}), now);
  await seedRows(namespace,'old'); await seedArchive(namespace,'old',2024);
  await run(`INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`, namespace,'sqlite',7,JSON.stringify({localPreferences:{cfg:{currency:'IQD',language:'ar',theme:'dark'},notif:{quiet:true}}}),now);
  await seedRows(stageNamespace,'new'); await seedArchive(stageNamespace,'new',2025);
  await run(`INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`, stageNamespace,'shadow',7,JSON.stringify({cfg:{currency:'USD',language:'must-not-transfer'}}),now);
  await run(`INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, `canonical_restore_stage_v13:${stageNamespace}`, JSON.stringify({state:'ready'}), now);
  await run(`INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, `canonical_restore_checkpoint_v13:${namespace}:${checkpointId}`, JSON.stringify(checkpointState), now);

  globalThis.__P10_GUARD__ = guardOk();
  await db.withExclusiveTransactionAsync(async txn => promotion.createStrategyBRestoreIntentV13InTransaction({ database:txn, guardResult:guardOk(), authUserId, deviceId }));
  await db.withExclusiveTransactionAsync(async txn => promotion.recordStrategyBServerProofV13InTransaction({ database:txn, namespace, operationId, serverProof:{ ok:true,outcome:'advanced',eventId:serverEventId,ownerId:authUserId,ledgerId,fromEpoch:7,toEpoch:8,reason:'backup_restore',deviceId,operationId,restoreProofDigest:digest,provedAt:now } }));

  const before = await snapshotDb();
  globalThis.__P10_GUARD__ = { supported:true, ok:false, reason:'restore_source_changed' };
  const stale = await promotion.promoteCanonicalRestoreStageV13({ namespace, operationId, database:db });
  assert.equal(stale.ok,false); assert.equal(stale.reason,'restore_source_changed');
  assert.deepEqual(await snapshotDb(), before, 'stale guard must refuse before any live mutation');
  console.log('[PASS] stale source blocks promotion before live mutation');

  globalThis.__P10_GUARD__ = guardOk();
  const boundaries = ['before_live_clear','after_live_clear','after_hot_copy','after_archive_replace','after_workspace_state','after_undo_pointer','after_restore_metadata','after_epoch_cas','after_stage_cleanup'];
  for (const boundary of boundaries) {
    const result = await promotion.promoteCanonicalRestoreStageV13({ namespace, operationId, database:db, faultInjector: point => { if (point === boundary) throw new Error(`fault:${point}`); } });
    assert.equal(result.ok,false, `${boundary} should fail`);
    assert.equal(result.reason,`fault:${boundary}`);
    assert.deepEqual(await snapshotDb(), before, `${boundary} must roll every state surface back`);
  }
  console.log('[PASS] every B5 fault boundary rolls live/archive/workspace/pointer/checkpoint/epoch/generation/stage together');

  const visited=[];
  const result = await promotion.promoteCanonicalRestoreStageV13({ namespace, operationId, database:db, faultInjector: p => visited.push(p) });
  assert.equal(result.ok,true, result.reason);
  assert.deepEqual(visited,boundaries);
  assert.deepEqual((await all('SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? ORDER BY id', namespace)).map(r=>r.id), ['tx-new']);
  assert.deepEqual((await all('SELECT year FROM cold_archive_years WHERE namespace=? ORDER BY year', namespace)).map(r=>Number(r.year)), [2025]);
  const workspace = JSON.parse((await db.getFirstAsync('SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=?', namespace)).payload_json);
  assert.deepEqual(workspace.localPreferences, {cfg:{currency:'USD',language:'ar',theme:'dark'},notif:{quiet:true}});
  const identity = await db.getFirstAsync('SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?', namespace);
  assert.equal(Number(identity.restore_epoch),8);
  const token = await meta(`financial_live_generation_v13:${namespace}`);
  assert.equal(token.restoreEpoch,8); assert.equal(token.generation,6);
  assert.equal(await meta(`restore_intent:${namespace}`),null, 'epoch CAS consumes durable restore intent');
  const pointer = await meta(`canonical_restore_undo_pointer_v13:${namespace}`);
  assert.equal(pointer.checkpointId,checkpointId); assert.equal(pointer.semanticHash,checkpointHash);
  const checkpoint = await meta(`canonical_restore_checkpoint_v13:${namespace}:${checkpointId}`);
  assert.equal(checkpoint.status,'REFERENCED_FOR_UNDO'); assert.equal(checkpoint.stateVersion,11);
  const promoted = await meta(`canonical_restore_promotion_v13:${namespace}`);
  assert.equal(promoted.status,'local_promoted_pending_reload'); assert.equal(promoted.fromEpoch,7); assert.equal(promoted.toEpoch,8);
  assert.equal(await meta(`canonical_restore_stage_v13:${stageNamespace}`),null);
  assert.equal((await all('SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=?', stageNamespace)).length,0);
  console.log('[PASS] B5 success atomically promotes new state, swaps Undo pointer, references checkpoint and advances epoch+generation');
  console.log('MYFI P10-013 B5 ATOMIC UNDO PROMOTION: PASS');
})().catch(err => { console.error(err); process.exitCode=1; }).finally(()=>db.close());
