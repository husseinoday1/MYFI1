const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const ledger = read('src/lib/ledgerDatabase.js');
const migrations = read('src/lib/financialLedgerSchemaMigrations.js');
const v7 = read('src/lib/financialLedgerV7Repository.js');
const active = read('src/lib/activeLedgerRepository.js');
const archive = read('src/lib/localArchiveRepository.js');

assert(ledger.includes('runLedgerExclusiveTransaction'), 'shared exclusive transaction helper missing');
assert(ledger.includes('withExclusiveTransactionAsync(async txn =>'), 'exclusive transaction must use SDK transaction-scoped handle');
assert(ledger.includes('result = await task(txn)'), 'domain callback must execute on transaction-scoped handle');
assert(!ledger.includes('enqueueLedgerWrite(task)'), 'exclusive helper must not self-enqueue and create nested queue deadlocks');

for (const [name, source] of [
  ['schema migrations', migrations],
  ['V7/V8 repository', v7],
  ['V6 compatibility repository', active],
  ['cold archive repository', archive],
]) {
  assert(source.includes('runLedgerExclusiveTransaction'), name + ': exclusive transaction helper missing');
  assert(!source.includes('.withTransactionAsync('), name + ': non-exclusive transaction remains');
}

const statusStart = migrations.indexOf('export async function readLedgerSchemaMigrationStatus');
assert(statusStart >= 0, 'migration status reader missing');
const statusBody = migrations.slice(statusStart);
assert(statusBody.includes('await flushLedgerWrites()'), 'status read must wait for queued writers');
assert(statusBody.includes("name='schema_migrations'"), 'status read must inspect sqlite_master');
assert(!statusBody.includes('ensureJournal(database)'), 'status read must not execute DDL');

assert(v7.includes('const readyDatabasePromises = new WeakMap();'), 'V7 schema readiness single-flight map missing');
assert(v7.includes('const inFlight = readyDatabasePromises.get(db);'), 'V7 schema readiness must reuse in-flight initialization');
assert(v7.includes('readyDatabasePromises.set(db, readiness);'), 'V7 schema readiness promise registration missing');
assert(v7.includes('readyDatabasePromises.delete(db);'), 'V7 schema readiness promise cleanup missing');

for (const fn of [
  'readFinancialBootstrapStateV8',
  'inspectFinancialEmptyShellV8',
  'readFinancialSyncProtocolV8',
  'readPendingLedgerMutationsV8',
  'applyRemoteLedgerMutationsV8',
]) {
  const start = v7.indexOf('export const ' + fn + ' = async');
  assert(start >= 0, fn + ': function missing');
  const nextExport = v7.indexOf('\nexport const ', start + 1);
  const nextConst = v7.indexOf('\nconst ', start + 1);
  const candidates = [nextExport, nextConst].filter(value => value > start);
  const end = candidates.length ? Math.min(...candidates) : v7.length;
  const body = v7.slice(start, end);
  assert(body.includes('ensureLedgerSyncIdentityV8({ namespace, database: db })'),
    fn + ': possible identity creation must use the shared write queue');
  assert(!body.includes('ensureShadowLedgerSyncIdentityV8(db, namespace)'),
    fn + ': out-of-queue identity write remains');
}

assert(v7.includes('export const FINANCIAL_SQLITE_SCHEMA_VERSION = 8;'), 'SQLite schema version changed unexpectedly');
assert(v7.includes("migrationId: '0008_sync_identity_v2'"), 'existing V8 migration identity changed unexpectedly');

console.log('MYFI P19-015A1 SQLITE RUNTIME CORE CONTRACT: PASSED');
