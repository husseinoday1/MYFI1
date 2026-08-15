const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerSchemaMigrations.js');
let source = fs.readFileSync(filename, 'utf8');
source = source
  .replace(/import \{ enqueueLedgerWrite \} from '\.\/ledgerDatabase';/, 'const enqueueLedgerWrite = task => task();')
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');
source += `\nmodule.exports = { runLedgerSchemaMigrations, readLedgerSchemaMigrationStatus, migrationChecksum };\n`;
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { runLedgerSchemaMigrations } = compiled.exports;

class AsyncDatabase {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  async execAsync(sql) { this.db.exec(sql); }
  async runAsync(sql, ...args) { return this.db.prepare(sql).run(...args); }
  async getFirstAsync(sql, ...args) { return this.db.prepare(sql).get(...args) || null; }
  async getAllAsync(sql, ...args) { return this.db.prepare(sql).all(...args); }
  async withTransactionAsync(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      await callback();
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
  close() { this.db.close(); }
}

(async () => {
  const database = new AsyncDatabase();
  let failSecond = true;
  const migration1 = {
    migrationId: '0001_test', fromVersion: 0, toVersion: 1,
    signature: 'create demo_v1',
    apply: db => db.execAsync('CREATE TABLE IF NOT EXISTS demo_v1(id INTEGER PRIMARY KEY, amount_minor INTEGER NOT NULL);'),
  };
  const migration2 = {
    migrationId: '0002_test', fromVersion: 1, toVersion: 2,
    signature: 'create demo_v2',
    apply: async db => {
      await db.execAsync('CREATE TABLE IF NOT EXISTS demo_v2(id INTEGER PRIMARY KEY);');
      if (failSecond) throw new Error('simulated_interruption');
    },
  };

  const first = await runLedgerSchemaMigrations({ database, migrations: [migration1], appVersion: 'test' });
  assert.equal(first.ok, true);
  assert.equal(first.currentVersion, 1);
  assert.equal(database.db.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(database.db.prepare("SELECT status FROM schema_migrations WHERE migration_id='0001_test'").get().status, 'completed');

  const replay = await runLedgerSchemaMigrations({ database, migrations: [migration1], appVersion: 'test' });
  assert.equal(replay.applied[0].status, 'already-completed');
  assert.equal(database.db.prepare("SELECT attempt_count FROM schema_migrations WHERE migration_id='0001_test'").get().attempt_count, 1);

  await assert.rejects(
    () => runLedgerSchemaMigrations({ database, migrations: [{ ...migration1, signature: 'changed' }], appVersion: 'test' }),
    /financial_schema_migration_checksum_mismatch/,
  );

  await assert.rejects(
    () => runLedgerSchemaMigrations({ database, migrations: [migration1, migration2], appVersion: 'test' }),
    /simulated_interruption/,
  );
  assert.equal(database.db.prepare('PRAGMA user_version').get().user_version, 1, 'failed migration must not advance schema version');
  assert.equal(database.db.prepare("SELECT status FROM schema_migrations WHERE migration_id='0002_test'").get().status, 'failed');
  assert.equal(database.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='demo_v2'").get(), undefined, 'failed transaction must roll back schema changes');

  failSecond = false;
  const recovered = await runLedgerSchemaMigrations({ database, migrations: [migration1, migration2], appVersion: 'test' });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.currentVersion, 2);
  const recoveredRow = database.db.prepare("SELECT status,attempt_count FROM schema_migrations WHERE migration_id='0002_test'").get();
  assert.equal(recoveredRow.status, 'completed');
  assert.equal(recoveredRow.attempt_count, 2, 'failed/interrupted migration must be resumable with audit attempts');
  assert.equal(database.db.prepare('PRAGMA user_version').get().user_version, 2);

  database.close();
  console.log('MYFI schema migration runtime: apply/replay/checksum/failure/recovery passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
