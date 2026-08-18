const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const migrations = fs.readFileSync(path.join(root, 'src/lib/financialLedgerSchemaMigrations.js'), 'utf8');
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');

const journalMatch = migrations.match(/export const LEDGER_SCHEMA_MIGRATION_JOURNAL_SQL = `([\s\S]*?)`;/);
const schemaMatch = repository.match(/export const FINANCIAL_LEDGER_V7_SCHEMA_SQL = `([\s\S]*?)`;/);
assert(journalMatch, 'Migration journal DDL not found');
assert(schemaMatch, 'V7 schema DDL not found');

for (const field of ['migration_id', 'from_version', 'to_version', 'checksum', 'started_at', 'completed_at', 'status', 'app_version']) {
  assert(journalMatch[1].includes(field), `Migration journal field missing: ${field}`);
}
assert.match(migrations, /financial_schema_migration_checksum_mismatch/);
assert.match(migrations, /status='running'/);
assert.match(migrations, /status='failed'/);
assert.match(migrations, /status='completed'/);
assert.match(migrations, /runLedgerExclusiveTransaction/);
assert.doesNotMatch(migrations, /\.withTransactionAsync\(/);
assert.match(migrations, /PRAGMA user_version/);
assert.match(repository, /PRAGMA quick_check/);
assert.match(repository, /0007_financial_ledger_v7_baseline/);

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec(journalMatch[1]);
db.exec(schemaMatch[1]);

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
assert(tables.has('schema_migrations'));
assert(tables.has('ledger_financial_transactions_v7'));
assert(tables.has('ledger_postings_v7'));

const columns = new Set(db.prepare('PRAGMA table_info(schema_migrations)').all().map(row => row.name));
for (const field of ['migration_id', 'from_version', 'to_version', 'checksum', 'started_at', 'completed_at', 'status', 'app_version', 'attempt_count', 'last_error']) {
  assert(columns.has(field), `Migration runtime column missing: ${field}`);
}

assert.throws(() => db.exec(`INSERT INTO schema_migrations
  (migration_id,from_version,to_version,checksum,started_at,status,app_version)
  VALUES ('bad',0,7,'x','2026-08-15','unknown','1.0.0')`), /CHECK constraint failed/);

db.exec(`
  INSERT INTO schema_migrations
    (migration_id,from_version,to_version,checksum,started_at,status,app_version)
    VALUES ('0007_financial_ledger_v7_baseline',0,7,'checksum','2026-08-15','running','1.0.0');
  UPDATE schema_migrations SET status='completed',completed_at='2026-08-15' WHERE migration_id='0007_financial_ledger_v7_baseline';
  PRAGMA user_version=7;
`);
assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
assert.equal(db.prepare("SELECT status FROM schema_migrations WHERE migration_id='0007_financial_ledger_v7_baseline'").get().status, 'completed');

// Reapplying the V7 DDL must be idempotent and must not reinterpret existing money.
db.exec(`
  INSERT INTO ledger_currencies(code,minor_exponent) VALUES ('IQD',3);
  INSERT INTO ledger_accounts_v7(namespace,id,account_type,scope,currency_code,status,created_at,updated_at)
    VALUES ('upgrade','wallet','cash','personal','IQD','active','2026-08-15','2026-08-15');
  INSERT INTO ledger_financial_transactions_v7
    (namespace,id,kind,status,scope,date_iso,occurred_at,idempotency_key,device_id,revision,created_at,updated_at)
    VALUES ('upgrade','tx','expense','posted','personal','2026-08-15','2026-08-15T00:00:00Z','upgrade:tx','device',1,'2026-08-15','2026-08-15');
  INSERT INTO ledger_postings_v7
    (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,created_at)
    VALUES ('upgrade','posting','tx','wallet','physical','principal',-123456,'IQD','2026-08-15');
`);
db.exec(schemaMatch[1]);
assert.equal(db.prepare("SELECT amount_minor FROM ledger_postings_v7 WHERE namespace='upgrade' AND id='posting'").get().amount_minor, -123456);
assert.equal(db.prepare("SELECT date_iso FROM ledger_financial_transactions_v7 WHERE namespace='upgrade' AND id='tx'").get().date_iso, '2026-08-15');

db.close();
console.log('MYFI reusable schema migration infrastructure + idempotent V7 adoption passed.');
