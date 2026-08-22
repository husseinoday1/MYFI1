// Phase 10 / P10-013 B1 — restore epoch + live generation must move atomically.
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
  constructor() { this.native = new DatabaseSync(':memory:'); this.native.exec('PRAGMA foreign_keys = ON'); }
  async execAsync(sql) { this.native.exec(String(sql)); }
  async runAsync(sql, ...params) {
    const result = this.native.prepare(String(sql)).run(...params);
    return { changes: Number(result.changes || 0) };
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async withExclusiveTransactionAsync(task) {
    this.native.exec('BEGIN IMMEDIATE');
    try { const value = await task(this); this.native.exec('COMMIT'); return value; }
    catch (error) { this.native.exec('ROLLBACK'); throw error; }
  }
  close() { this.native.close(); }
}

const db = new AsyncSqlite();
const generationFilename = path.join(root, 'src/lib/financialLiveGenerationV13.js');
let generationSource = fs.readFileSync(generationFilename, 'utf8').replace(/export const /g, 'const ');
generationSource += `\nmodule.exports = {
  registerLiveGenerationInTransactionV13, readLiveGenerationInTransactionV13,
  rebindLiveGenerationForRestoreEpochInTransactionV13,
};`;
const generation = compile(generationFilename, generationSource);
globalThis.__P10_GENERATION__ = generation;

const repositoryFilename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
let repositorySource = fs.readFileSync(repositoryFilename, 'utf8')
  .replace(/import \{ Platform \} from 'react-native';/, `const Platform = { OS: 'android' };`)
  .replace(
    /import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => task();\nconst getLedgerDb = async () => globalThis.__P10_DB__;\nconst runLedgerExclusiveTransaction = (db, task) => db.withExclusiveTransactionAsync(task);`,
  )
  .replace(/import \{ runLedgerSchemaMigrations \} from '\.\/financialLedgerSchemaMigrations';/, `const runLedgerSchemaMigrations = async () => true;`)
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLedgerV7Model';/,
    `const buildExpenseLedgerCommand = () => { throw new Error('not_used'); };\nconst buildFinancialLedgerCommand = () => { throw new Error('not_used'); };\nconst FINANCIAL_LEDGER_SCHEMA_VERSION = 7;`,
  )
  .replace(
    /import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\/cloudWorkspaceMetadata\.js';/,
    `const cloudWorkspaceCfg = value => value || {};\nconst mergeCloudWorkspaceCfg = (a = {}, b = {}) => ({ ...a, ...b });`,
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/localArchiveRepository';/,
    `const clearColdArchiveNamespaceInTransaction = async () => {};\nconst ensureColdArchiveSchema = async () => {};\nconst replaceColdArchiveNamespaceFromStageInTransaction = async () => {};`,
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/,
    `const { rebindLiveGenerationForRestoreEpochInTransactionV13 } = globalThis.__P10_GENERATION__;\nconst advanceLiveGenerationForMutationInTransactionV13 = async () => { throw new Error('not_used'); };`,
  )
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ')
  .replace(/export function /g, 'function ');
repositorySource += `\nmodule.exports = {
  FINANCIAL_LEDGER_V7_SCHEMA_SQL, FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL,
  advanceLedgerRestoreEpochInTransactionV8,
};`;
globalThis.__P10_DB__ = db;
const repository = compile(repositoryFilename, repositorySource);

const now = '2026-08-22T00:00:00.000Z';
const intentKey = namespace => `restore_intent:${namespace}`;
const generationKey = namespace => `financial_live_generation_v13:${namespace}`;
const seedIntent = async ({ namespace, ledgerId, fromEpoch, toEpoch }) => {
  await db.runAsync(
    'INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
    intentKey(namespace),
    JSON.stringify({ version: 1, namespace, ledgerId, fromEpoch, toEpoch, operation: 'backup_restore', status: 'pending_server_advance' }),
    now,
  );
};
const readToken = async namespace => JSON.parse((await db.getFirstAsync(
  'SELECT value FROM ledger_v7_meta WHERE key=?', generationKey(namespace),
)).value);

(async () => {
  await db.execAsync(`${repository.FINANCIAL_LEDGER_V7_SCHEMA_SQL}\n${repository.FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL}`);

  const namespace = 'account:b1';
  const ledgerId = 'ledger-b1';
  await db.runAsync(
    `INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`, namespace, ledgerId, 7, 2, 2, now, now,
  );
  await db.withExclusiveTransactionAsync(txn => generation.registerLiveGenerationInTransactionV13({
    database: txn, namespace, ledgerId, restoreEpoch: 7,
  }));
  // Start above zero so the test proves preservation + one increment rather than reset.
  await db.runAsync(
    'UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=?',
    JSON.stringify({ tokenVersion: 1, namespace, ledgerId, restoreEpoch: 7, generation: 41 }), now, generationKey(namespace),
  );

  await seedIntent({ namespace, ledgerId, fromEpoch: 7, toEpoch: 8 });
  const first = await db.withExclusiveTransactionAsync(txn => repository.advanceLedgerRestoreEpochInTransactionV8({
    database: txn, namespace, expectedFromEpoch: 7, toEpoch: 8,
  }));
  assert.equal(first.restoreEpoch, 8);
  assert.equal(first.liveGeneration, 42);
  assert.equal((await db.getFirstAsync('SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?', namespace)).restore_epoch, 8);
  assert.deepEqual(await readToken(namespace), { tokenVersion: 1, namespace, ledgerId, restoreEpoch: 8, generation: 42 });
  console.log('[PASS] epoch CAS and generation rebind/+1 commit together');

  await seedIntent({ namespace, ledgerId, fromEpoch: 8, toEpoch: 9 });
  const second = await db.withExclusiveTransactionAsync(txn => repository.advanceLedgerRestoreEpochInTransactionV8({
    database: txn, namespace, expectedFromEpoch: 8, toEpoch: 9,
  }));
  assert.equal(second.restoreEpoch, 9);
  assert.equal(second.liveGeneration, 43);
  assert.deepEqual(await readToken(namespace), { tokenVersion: 1, namespace, ledgerId, restoreEpoch: 9, generation: 43 });
  console.log('[PASS] second sequential epoch transition advances generation exactly once');

  await seedIntent({ namespace, ledgerId, fromEpoch: 9, toEpoch: 10 });
  await assert.rejects(
    db.withExclusiveTransactionAsync(async txn => {
      await repository.advanceLedgerRestoreEpochInTransactionV8({
        database: txn, namespace, expectedFromEpoch: 9, toEpoch: 10,
      });
      throw new Error('inject_after_epoch_generation_transition');
    }),
    /inject_after_epoch_generation_transition/,
  );
  assert.equal((await db.getFirstAsync('SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?', namespace)).restore_epoch, 9);
  assert.deepEqual(await readToken(namespace), { tokenVersion: 1, namespace, ledgerId, restoreEpoch: 9, generation: 43 });
  assert.ok(await db.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=?', intentKey(namespace)), 'rollback preserves the pending intent');
  console.log('[PASS] rollback restores both epoch and generation binding');

  const missingNamespace = 'account:b1-missing';
  const missingLedgerId = 'ledger-b1-missing';
  await db.runAsync(
    `INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`, missingNamespace, missingLedgerId, 3, 2, 2, now, now,
  );
  await seedIntent({ namespace: missingNamespace, ledgerId: missingLedgerId, fromEpoch: 3, toEpoch: 4 });
  await assert.rejects(
    db.withExclusiveTransactionAsync(txn => repository.advanceLedgerRestoreEpochInTransactionV8({
      database: txn, namespace: missingNamespace, expectedFromEpoch: 3, toEpoch: 4,
    })),
    /financial_live_generation_missing/,
  );
  assert.equal((await db.getFirstAsync('SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?', missingNamespace)).restore_epoch, 3,
    'missing token must roll the identity CAS back');
  assert.equal(await db.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=?', generationKey(missingNamespace)), null,
    'restore path must never bootstrap a missing generation token');
  console.log('[PASS] missing generation fails closed and rolls epoch CAS back');

  console.log('MYFI P10-013 B1 EPOCH + GENERATION ATOMICITY: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
