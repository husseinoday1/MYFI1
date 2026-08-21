// P10-013 Batch A — execute the public Cold Archive writers against SQLite.
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
  constructor() { this.native = new DatabaseSync(':memory:'); }
  async execAsync(sql) { this.native.exec(String(sql)); }
  async runAsync(sql, ...params) {
    const result = this.native.prepare(String(sql)).run(...params);
    return { changes: Number(result.changes || 0) };
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async prepareAsync(sql) {
    const statement = this.native.prepare(String(sql));
    return { executeAsync: async bindings => ({ changes: Number(statement.run(bindings).changes || 0) }), finalizeAsync: async () => {} };
  }
  async withExclusiveTransactionAsync(task) {
    this.native.exec('BEGIN IMMEDIATE');
    try { const result = await task(this); this.native.exec('COMMIT'); return result; }
    catch (error) { this.native.exec('ROLLBACK'); throw error; }
  }
  close() { this.native.close(); }
}

const db = new AsyncSqlite();
globalThis.__P10_BATCH_A_DB__ = db;
const liveFilename = path.join(root, 'src/lib/financialLiveGenerationV13.js');
let liveSource = fs.readFileSync(liveFilename, 'utf8').replace(/export const /g, 'const ');
liveSource += '\nmodule.exports = { advanceLiveGenerationForMutationInTransactionV13 };';
globalThis.__P10_BATCH_A_LIVE__ = compile(liveFilename, liveSource);

const archiveFilename = path.join(root, 'src/lib/localArchiveRepository.js');
let archiveSource = fs.readFileSync(archiveFilename, 'utf8')
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => task();
const getLedgerDb = async () => globalThis.__P10_BATCH_A_DB__;
const runLedgerExclusiveTransaction = (database, task) => database.withExclusiveTransactionAsync(task);`)
  .replace(/import \{ defaultScopeForProfile, normalizeScope \} from '\.\/modules';/,
    `const defaultScopeForProfile = () => 'personal'; const normalizeScope = value => value;`)
  .replace(/import \{ advanceLiveGenerationForMutationInTransactionV13 \} from '\.\/financialLiveGenerationV13';/,
    `const { advanceLiveGenerationForMutationInTransactionV13 } = globalThis.__P10_BATCH_A_LIVE__;`)
  .replace(/export const /g, 'const ');
archiveSource += '\nmodule.exports = { storeColdArchiveYear, storeColdArchiveYears, clearColdArchives, replaceColdArchives };';
const archive = compile(archiveFilename, archiveSource);

const namespace = 'account:cold-archive';
const token = async target => {
  const row = await db.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=?', `financial_live_generation_v13:${target}`);
  return row ? JSON.parse(row.value) : null;
};
const archiveYear = year => ({
  year, scope: 'personal', summary: { archivedAt: '2026-08-22T00:00:00.000Z' },
  data: { trans: [{ id: `archive-${year}`, dateISO: `${year}-01-01`, walletId: 'wallet-1', amt: -1 }] },
});

(async () => {
  try {
    await db.execAsync(`CREATE TABLE ledger_v7_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL);
      CREATE TABLE ledger_sync_identity_v8(namespace TEXT PRIMARY KEY,ledger_id TEXT NOT NULL,restore_epoch INTEGER NOT NULL,
        protocol_version INTEGER NOT NULL,minimum_supported_version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
    assert.equal(await archive.storeColdArchiveYear({ namespace, ...archiveYear(2023) }), true);
    assert.equal((await token(namespace)).generation, 1, 'single archive write advances once');
    assert.equal(await archive.storeColdArchiveYears({ namespace, archives: [archiveYear(2024), archiveYear(2025)] }), true);
    assert.equal((await token(namespace)).generation, 2, 'multi-year archive batch advances once atomically');
    assert.equal(await archive.clearColdArchives(namespace), true);
    assert.equal((await token(namespace)).generation, 3, 'archive clear advances in its delete transaction');
    assert.equal(await archive.replaceColdArchives(namespace, [archiveYear(2026)]), true);
    assert.equal((await token(namespace)).generation, 4, 'archive replacement advances only with its active swap');
    assert.equal(await token(`${namespace}::restore-stage::x`), null, 'private archive staging never creates an active token');

    const invalidBatch = 'account:cold-archive-batch-rollback';
    await assert.rejects(archive.storeColdArchiveYears({
      namespace: invalidBatch,
      archives: [archiveYear(2020), { year: 2021, data: { trans: [] } }],
    }), /cold_archive_batch_item_invalid/);
    assert.equal(await db.getFirstAsync('SELECT year FROM cold_archive_years WHERE namespace=?', invalidBatch), null,
      'an invalid later archive rolls the full multi-year batch back');
    assert.equal(await token(invalidBatch), null, 'failed archive batch does not advance generation');

    const broken = 'account:cold-archive-rollback';
    await db.runAsync('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', `financial_live_generation_v13:${broken}`, '{bad', '2026-08-22T00:00:00.000Z');
    await assert.rejects(archive.storeColdArchiveYear({ namespace: broken, ...archiveYear(2022) }), /financial_live_generation_malformed/);
    assert.equal(await db.getFirstAsync('SELECT year FROM cold_archive_years WHERE namespace=?', broken), null,
      'generation failure rolls back the cold archive mutation too');
    console.log('MYFI P10-013 COLD ARCHIVE GENERATION: PASS');
  } finally { db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
