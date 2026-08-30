// Phase 10 Step 10 — execute the real promotion orchestration against SQLite.
// This is intentionally an operational rollback test, not a source-text contract.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
  async getFirstAsync(sql, ...params) {
    return this.native.prepare(String(sql)).get(...params) || null;
  }
  async getAllAsync(sql, ...params) {
    return this.native.prepare(String(sql)).all(...params);
  }
  async withExclusiveTransactionAsync(task) {
    this.native.exec('BEGIN IMMEDIATE');
    try {
      const value = await task(this);
      this.native.exec('COMMIT');
      return value;
    } catch (error) {
      this.native.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.native.close(); }
}

const database = new AsyncSqlite();
globalThis.__P10_DB__ = database;
globalThis.__P10_QUEUE__ = task => task();
globalThis.__P10_EXCLUSIVE__ = (db, task) => db.withExclusiveTransactionAsync(task);
globalThis.__P10_MIGRATIONS__ = async () => true;

const archiveFilename = path.join(root, 'src/lib/localArchiveRepository.js');
let archiveSource = fs.readFileSync(archiveFilename, 'utf8')
  .replace(
    /import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task);
const getLedgerDb = async () => globalThis.__P10_DB__;
const runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`,
  )
  .replace(
    /import \{ defaultScopeForProfile, normalizeScope \} from '\.\/modules';/,
    `const defaultScopeForProfile = () => 'personal';
const normalizeScope = value => value;`,
  )
  .replace(
    /import \{ advanceLiveGenerationForMutationInTransactionV13 \} from '\.\/financialLiveGenerationV13';/,
    `const advanceLiveGenerationForMutationInTransactionV13 = async () => { throw new Error('not_used_in_p10_010'); };
const rebindLiveGenerationForRestoreEpochInTransactionV13 = async ({ toRestoreEpoch }) => ({ restoreEpoch: Number(toRestoreEpoch), generation: 1 });`,
  )
  .replace(/export const /g, 'const ');
archiveSource += `\nmodule.exports = {
  ensureColdArchiveSchema, clearColdArchiveNamespaceInTransaction,
  replaceColdArchiveNamespaceFromStageInTransaction,
};\n`;
const archive = compile(archiveFilename, archiveSource);
globalThis.__P10_ARCHIVE__ = archive;

const repositoryFilename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
let repositorySource = fs.readFileSync(repositoryFilename, 'utf8')
  .replace(
    /import \{ Platform \} from 'react-native';/,
    `const Platform = { OS: 'android' };`,
  )
  .replace(
    /import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task);
const getLedgerDb = async () => globalThis.__P10_DB__;
const runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`,
  )
  .replace(
    /import \{ runLedgerSchemaMigrations \} from '\.\/financialLedgerSchemaMigrations';/,
    `const runLedgerSchemaMigrations = options => globalThis.__P10_MIGRATIONS__(options);`,
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLedgerV7Model';/,
    `const buildExpenseLedgerCommand = () => { throw new Error('not_used_in_p10_010'); };
const buildFinancialLedgerCommand = () => { throw new Error('not_used_in_p10_010'); };
const FINANCIAL_LEDGER_SCHEMA_VERSION = 7;`,
  )
  .replace(
    /import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/,
    `const cloudWorkspaceCfg = cfg => cfg?.currency === undefined ? {} : { currency: cfg.currency };
const mergeCloudWorkspaceCfg = (localCfg = {}, cloudCfg = {}) => ({ ...(localCfg || {}), ...cloudWorkspaceCfg(cloudCfg) });`,
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
    `const {
  clearColdArchiveNamespaceInTransaction,
  ensureColdArchiveSchema,
  replaceColdArchiveNamespaceFromStageInTransaction,
} = globalThis.__P10_ARCHIVE__;`,
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/,
    `const advanceLiveGenerationForMutationInTransactionV13 = async () => { throw new Error('not_used_in_p10_010'); };
const rebindLiveGenerationForRestoreEpochInTransactionV13 = async ({ toRestoreEpoch }) => ({ restoreEpoch: Number(toRestoreEpoch), generation: 1 });`,
  )
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ')
  .replace(/export function /g, 'function ');
repositorySource += `\nmodule.exports = {
  FINANCIAL_LEDGER_SCHEMA_VERSION, FINANCIAL_LEDGER_V7_SCHEMA_SQL, FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL,
  runFinancialRestorePromotionTransactionV8,
};\n`;
const repository = compile(repositoryFilename, repositorySource);

const proofCountKeys = Object.freeze([
  'transactions', 'postings', 'links', 'accounts', 'exchangeRates', 'entities',
  'coldArchiveBundles', 'coldArchiveRecords',
]);
const isCanonicalRestoreOperationIdV11 = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
const deriveCanonicalRestoreProofDigestV11 = ({ operationId, ledgerId, fromEpoch, toEpoch, semanticHash, validatorVersion, counts: proofCounts }) => {
  const orderedCounts = Object.fromEntries(proofCountKeys.map(key => [key, Number(proofCounts[key])]));
  return crypto.createHash('sha256').update(JSON.stringify({
    domain: 'MYFI:P10-012:RESTORE-PROOF:V1',
    operationId: String(operationId).toLowerCase(), ledgerId: String(ledgerId),
    fromEpoch: Number(fromEpoch), toEpoch: Number(toEpoch), semanticHash: String(semanticHash).toLowerCase(),
    validatorVersion: Number(validatorVersion), counts: orderedCounts,
  })).digest('hex');
};
globalThis.__P10_RESTORE_PROOF__ = { deriveCanonicalRestoreProofDigestV11, isCanonicalRestoreOperationIdV11 };

const promotionFilename = path.join(root, 'src/lib/financialRestorePromotionV11.js');
let promotionSource = fs.readFileSync(promotionFilename, 'utf8')
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/,
    `const {
  FINANCIAL_LEDGER_SCHEMA_VERSION,
  runFinancialRestorePromotionTransactionV8,
} = globalThis.__P10_REPOSITORY__;`,
  )
  .replace(
    /import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/,
    `const cloudWorkspaceCfg = cfg => cfg?.currency === undefined ? {} : { currency: cfg.currency };
const mergeCloudWorkspaceCfg = (localCfg = {}, cloudCfg = {}) => ({ ...(localCfg || {}), ...cloudWorkspaceCfg(cloudCfg) });`,
  )
  .replace(
    /import \{ CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS \} from '\.\/financialBackupV11';/,
    `const CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS = Object.freeze([
  'transactions', 'postings', 'links', 'accounts', 'exchangeRates', 'entities',
  'coldArchiveBundles', 'coldArchiveRecords',
]);`,
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialRestoreProofV11';/,
    `const { deriveCanonicalRestoreProofDigestV11, isCanonicalRestoreOperationIdV11 } = globalThis.__P10_RESTORE_PROOF__;`,
  )
  .replace(/export const /g, 'const ');
promotionSource += `\nmodule.exports = { promoteCanonicalRestoreStageV11 };\n`;
globalThis.__P10_REPOSITORY__ = repository;
const { promoteCanonicalRestoreStageV11 } = compile(promotionFilename, promotionSource);

const run = async (sql, ...params) => database.runAsync(sql, ...params);
const all = async (sql, ...params) => database.getAllAsync(sql, ...params);
const now = '2026-08-21T12:00:00.000Z';
const namespace = 'account:disposable';
const stageOne = `${namespace}::restore-stage::one`;
const hashOne = 'a'.repeat(64);
const counts = Object.freeze({
  accounts: 1, transactions: 1, postings: 1, links: 0, exchangeRates: 0, entities: 2,
  coldArchiveBundles: 1, coldArchiveRecords: 1,
});
const operationIds = Object.freeze({
  7: '11111111-1111-4111-8111-111111111111',
  8: '22222222-2222-4222-8222-222222222222',
});
const serverEventIds = Object.freeze({
  7: '33333333-3333-4333-8333-333333333333',
  8: '44444444-4444-4444-8444-444444444444',
});
const authUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deviceId = 'device-p10-010';
const proof = Object.freeze({ semanticHash: hashOne, counts, validatorVersion: 2 });
const stageMetaKey = stage => `canonical_restore_stage_v11:${stage}`;
const intentKey = `restore_intent:${namespace}`;

const seedLedgerRows = async (target, label) => {
  await run(`INSERT INTO ledger_accounts_v7
    (namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`, target, `wallet-${label}`, `Wallet ${label}`, 'wallet', 'personal', 'IQD', 'active', now, now);
  await run(`INSERT INTO ledger_financial_transactions_v7
    (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  target, `tx-${label}`, 'expense', 'posted', 'personal', '2026-08-21', now, null, `Transaction ${label}`, null,
  'manual', null, `idempotency-${label}`, 'device-test', 1, null, null, null, JSON.stringify({ id: `tx-${label}` }), now, now);
  await run(`INSERT INTO ledger_postings_v7
    (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, target, `posting-${label}`, `tx-${label}`, `wallet-${label}`, 'physical', 'expense', -100, 'IQD', null, now);
  await run(`INSERT INTO ledger_entities_v7
    (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`, target, 'tracker_type', `tracker-type-${label}`, 1, null,
  JSON.stringify({ id: `tracker-type-${label}`, name: `Installments ${label}` }), now, now);
  await run(`INSERT INTO ledger_entities_v7
    (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`, target, 'tracker_item', `tracker-item-${label}`, 1, null,
  JSON.stringify({ id: `tracker-item-${label}`, typeId: `tracker-type-${label}`, name: `Phone ${label}` }), now, now);
};

const seedArchive = async (target, label, year) => {
  await run(`INSERT INTO cold_archive_years
    (namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, target, 'personal', year, now, `archive-${label}`, 1, 0, 100, -100, JSON.stringify({ cfg: { currency: 'IQD' } }));
  await run(`INSERT INTO cold_archive_transactions
    (namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, target, 'personal', year, `archive-tx-${label}`, '2025-01-01', 1, `wallet-${label}`, null, 'expense', label, JSON.stringify({ id: `archive-tx-${label}` }));
};

const seedStage = async ({ stage, label, hash, epoch }) => {
  await seedLedgerRows(stage, label);
  await seedArchive(stage, label, 2025 + epoch);
  await run(`INSERT INTO ledger_workspace_state_v7
    (namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`,
  stage, 'shadow', 7, JSON.stringify({ cfg: { currency: epoch === 7 ? 'USD' : 'EUR', language: 'must-not-transfer' } }), now);
  await run(`INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, stageMetaKey(stage), JSON.stringify({
    version: 1, state: 'ready', namespace: stage, ledgerId: 'ledger-disposable',
    semanticHash: hash, counts, validatorVersion: 2, provedAt: now,
  }), now);
};

const seedIntent = async ({ from, stage, stageProof }) => {
  const operationId = operationIds[from];
  const restoreProofDigest = deriveCanonicalRestoreProofDigestV11({
    operationId, ledgerId: 'ledger-disposable', fromEpoch: from, toEpoch: from + 1,
    semanticHash: stageProof.semanticHash, validatorVersion: stageProof.validatorVersion, counts: stageProof.counts,
  });
  return run(
    `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
    intentKey,
    JSON.stringify({
      version: 2, stateVersion: 1, status: 'server_epoch_proven', namespace,
      authUserId, ledgerId: 'ledger-disposable', fromEpoch: from, toEpoch: from + 1,
      operation: 'backup_restore', operationId, serverEventId: serverEventIds[from], deviceId,
      stageNamespace: stage, semanticHash: stageProof.semanticHash, counts: stageProof.counts,
      validatorVersion: stageProof.validatorVersion, restoreProofDigest, serverProvedAt: now,
    }),
    now,
  );
};

const snapshot = async () => {
  const tables = [
    'ledger_accounts_v7', 'ledger_exchange_rates_v7', 'ledger_financial_transactions_v7',
    'ledger_postings_v7', 'ledger_transaction_links_v7', 'ledger_entities_v7',
    'ledger_workspace_state_v7', 'cold_archive_years', 'cold_archive_transactions',
    'ledger_v7_meta', 'ledger_sync_identity_v8', 'ledger_sync_state_v8',
    'ledger_outbox_v2', 'ledger_inbox_v2', 'ledger_outbox_v3', 'ledger_inbox_v3',
  ];
  const result = {};
  for (const table of tables) result[table] = await all(`SELECT * FROM ${table} ORDER BY rowid`);
  return result;
};

(async () => {
  await database.execAsync(`${repository.FINANCIAL_LEDGER_V7_SCHEMA_SQL}\n${repository.FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL}`);
  await archive.ensureColdArchiveSchema();

  // Regression for P10-014A real-device failure: legacy databases cannot be
  // assumed to enforce the cold-archive ON DELETE CASCADE contract. Disable FK
  // enforcement so successful promotion must explicitly remove child records.
  await database.execAsync('PRAGMA foreign_keys = OFF');
  assert.equal(
    Number((await database.getFirstAsync('PRAGMA foreign_keys'))?.foreign_keys || 0),
    0,
    'P10-010 legacy archive regression requires foreign-key enforcement off',
  );

  await run(`INSERT INTO ledger_currencies(code,minor_exponent,enabled) VALUES ('IQD',3,1)`);
  await run(`INSERT INTO ledger_sync_identity_v8
    (namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`, namespace, 'ledger-disposable', 7, 2, 2, now, now);
  await run(`INSERT INTO ledger_sync_state_v8
    (ledger_id,restore_epoch,last_server_sequence,updated_at) VALUES (?,?,?,?)`, 'ledger-disposable', 7, 44, now);
  await seedLedgerRows(namespace, 'old');
  await seedArchive(namespace, 'old', 2024);
  await run(`INSERT INTO ledger_workspace_state_v7
    (namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`,
  namespace, 'sqlite', 7, JSON.stringify({ localPreferences: { cfg: { currency: 'IQD', language: 'ar', theme: 'dark' }, notif: { quiet: true } } }), now);
  await run(`INSERT INTO ledger_outbox_v2
    (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`, namespace, 'old-v2-outbox', 'transaction', 'tx-old', 'upsert', 1, 1, '{}', now);
  await run(`INSERT INTO ledger_inbox_v2(mutation_id,namespace,server_sequence,received_at) VALUES (?,?,?,?)`, 'old-v2-inbox', namespace, 3, now);
  await run(`INSERT INTO ledger_outbox_v3
    (namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,payload_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, namespace, 'ledger-disposable', 7, 'old-v3-outbox', 'command-old', 'transaction', 'tx-old', 'upsert', 1, 0, 2, 2, 1, '{}', now);
  await run(`INSERT INTO ledger_inbox_v3
    (ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence,received_at)
    VALUES (?,?,?,?,?,?,?)`, 'ledger-disposable', 7, 'old-v3-inbox', 'command-old', 1, 1, now);
  await seedStage({ stage: stageOne, label: 'new', hash: hashOne, epoch: 7 });
  await seedIntent({ from: 7, stage: stageOne, stageProof: proof });

  const before = await snapshot();
  const emptyCounts = await promoteCanonicalRestoreStageV11({
    namespace, stageNamespace: stageOne,
    stageProof: { semanticHash: hashOne, counts: {}, validatorVersion: 2 },
    expectedFromEpoch: 7, toEpoch: 8, database,
  });
  assert.equal(emptyCounts.ok, false, 'an empty count object is malformed proof, not a valid zero-row ledger');
  assert.equal(emptyCounts.reason, 'canonical_restore_promotion_proof_invalid');
  assert.deepEqual(await snapshot(), before, 'empty counts must fail before any live mutation');

  const rejected = await promoteCanonicalRestoreStageV11({
    namespace, stageNamespace: stageOne,
    stageProof: { ...proof, semanticHash: 'c'.repeat(64) },
    expectedFromEpoch: 7, toEpoch: 8, database,
  });
  assert.equal(rejected.ok, false, 'a caller-supplied proof cannot replace the stored READY proof');
  assert.equal(rejected.reason, 'canonical_restore_promotion_precondition_failed');
  assert.deepEqual(await snapshot(), before, 'a readiness mismatch must fail before any live mutation');

  const classifiedFailure = await promoteCanonicalRestoreStageV11({
    namespace, stageNamespace: stageOne, stageProof: proof, expectedFromEpoch: 7, toEpoch: 8, database,
    faultInjector: point => {
      if (point === 'before_live_clear') throw new Error('restore_epoch_local_compare_and_swap_failed');
    },
  });
  assert.equal(classifiedFailure.ok, false);
  assert.equal(classifiedFailure.reason, 'restore_epoch_local_compare_and_swap_failed',
    'an operational failure must retain its classified cause for safe recovery');
  assert.deepEqual(await snapshot(), before, 'a classified failure must leave every SQLite domain unchanged');

  const boundaries = [
    'before_live_clear', 'after_live_clear', 'after_hot_copy', 'after_archive_replace',
    'after_workspace_state', 'after_restore_metadata', 'after_epoch_cas', 'after_stage_cleanup',
  ];
  for (const boundary of boundaries) {
    const result = await promoteCanonicalRestoreStageV11({
      namespace, stageNamespace: stageOne, stageProof: proof, expectedFromEpoch: 7, toEpoch: 8, database,
      faultInjector: point => {
        if (point === boundary) throw new Error(`canonical_restore_promotion_fault:${point}`);
      },
    });
    assert.equal(result.ok, false, `${boundary} must surface the injected fault`);
    assert.equal(result.reason, `canonical_restore_promotion_fault:${boundary}`);
    assert.deepEqual(await snapshot(), before,
      `${boundary} must roll back hot ledger, archive, restore metadata and epoch together`);
  }
  console.log('[PASS] every P10-010 promotion boundary rolls all SQLite state back, not only financial rows');

  const visited = [];
  const promoted = await promoteCanonicalRestoreStageV11({
    namespace, stageNamespace: stageOne, stageProof: proof, expectedFromEpoch: 7, toEpoch: 8, database,
    faultInjector: point => visited.push(point),
  });
  assert.equal(promoted.ok, true);
  assert.deepEqual(visited, boundaries, 'success must cross every tested promotion boundary');
  assert.deepEqual((await all(`SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? ORDER BY id`, namespace)).map(row => row.id), ['tx-new']);
  assert.deepEqual(
    (await all(`SELECT entity_type,id,payload_json FROM ledger_entities_v7 WHERE namespace=? ORDER BY entity_type,id`, namespace)).map(row => [row.entity_type, row.id, JSON.parse(row.payload_json).typeId || null]),
    [['tracker_item', 'tracker-item-new', 'tracker-type-new'], ['tracker_type', 'tracker-type-new', null]],
    'promotion must replace the live custom tracker graph atomically with the staged graph',
  );
  assert.deepEqual((await all(`SELECT year FROM cold_archive_years WHERE namespace=? ORDER BY year`, namespace)).map(row => Number(row.year)), [2032]);
  assert.deepEqual(
    (await all(`SELECT id FROM cold_archive_transactions WHERE namespace=? ORDER BY id`, namespace)).map(row => row.id),
    ['archive-tx-new'],
    'promotion must remove stale cold-archive records even when FK cascade is unavailable',
  );
  assert.deepEqual(
    (await all(`SELECT id FROM cold_archive_transactions WHERE namespace=? ORDER BY id`, stageOne)).map(row => row.id),
    [],
    'consumed restore stage must not leave orphan cold-archive records when FK cascade is unavailable',
  );
  const workspace = JSON.parse((await database.getFirstAsync(`SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=?`, namespace)).payload_json);
  assert.deepEqual(workspace.localPreferences, { cfg: { currency: 'USD', language: 'ar', theme: 'dark' }, notif: { quiet: true } },
    'promotion must retain device-local preferences and overlay only the financial config allowlist');
  assert.equal((await database.getFirstAsync(`SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?`, namespace)).restore_epoch, 8);
  assert.equal(await database.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=?`, intentKey), null, 'epoch primitive consumes its intent');
  const promotionState = JSON.parse((await database.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=?`, `canonical_restore_promotion_v11:${namespace}`,
  )).value);
  assert.equal(promotionState.stateVersion, 2,
    'atomic intent-to-promotion handoff must advance, never reset, stateVersion');
  assert.equal(await database.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=?`, stageMetaKey(stageOne)), null, 'consumed stage readiness is removed atomically');
  assert.equal((await all(`SELECT mutation_id FROM ledger_outbox_v2 WHERE namespace=?`, namespace)).length, 1, 'old V2 outbox remains evidence');
  assert.equal((await all(`SELECT mutation_id FROM ledger_inbox_v2 WHERE namespace=?`, namespace)).length, 1, 'old V2 inbox remains evidence');
  assert.equal((await all(`SELECT mutation_id FROM ledger_outbox_v3 WHERE ledger_id=?`, 'ledger-disposable')).length, 1, 'old V3 outbox remains epoch-fenced evidence');
  assert.equal((await all(`SELECT mutation_id FROM ledger_inbox_v3 WHERE ledger_id=?`, 'ledger-disposable')).length, 1, 'old V3 inbox remains epoch-fenced evidence');
  console.log('[PASS] successful promotion commits a complete new ledger/archive/state/epoch without deleting old sync evidence');

  const stageTwo = `${namespace}::restore-stage::two`;
  const hashTwo = 'b'.repeat(64);
  await seedStage({ stage: stageTwo, label: 'newer', hash: hashTwo, epoch: 8 });
  await seedIntent({
    from: 8,
    stage: stageTwo,
    stageProof: { semanticHash: hashTwo, counts, validatorVersion: 2 },
  });
  const second = await promoteCanonicalRestoreStageV11({
    namespace, stageNamespace: stageTwo,
    stageProof: { semanticHash: hashTwo, counts, validatorVersion: 2 },
    expectedFromEpoch: 8, toEpoch: 9, database,
  });
  assert.equal(second.ok, true, 'a second sequential restore epoch must also commit');
  assert.equal((await database.getFirstAsync(`SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?`, namespace)).restore_epoch, 9);
  console.log('MYFI P10-010 ATOMIC LOCAL PROMOTION: PASS');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => database.close());
