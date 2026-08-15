const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');
const schemaMatch = repository.match(/export const FINANCIAL_LEDGER_V7_SCHEMA_SQL = `([\s\S]*?)`;/);
assert(schemaMatch, 'V7 schema template was not found');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec(schemaMatch[1]);

const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
for (const name of [
  'ledger_financial_transactions_v7', 'ledger_postings_v7', 'ledger_transaction_links_v7',
  'ledger_entities_v7', 'ledger_workspace_state_v7', 'ledger_outbox_v2', 'ledger_inbox_v2', 'ledger_sync_state_v7',
]) assert(tables.has(name), `Missing SQLite V7 table: ${name}`);

db.exec(`
  INSERT INTO ledger_currencies(code,minor_exponent) VALUES ('IQD',3);
  INSERT INTO ledger_accounts_v7(namespace,id,account_type,scope,currency_code,status,created_at,updated_at)
    VALUES ('test','wallet','cash','personal','IQD','active','2026-08-14','2026-08-14');
  INSERT INTO ledger_financial_transactions_v7
    (namespace,id,kind,status,scope,date_iso,occurred_at,idempotency_key,device_id,revision,created_at,updated_at)
    VALUES ('test','tx','expense','posted','personal','2026-08-14','2026-08-14T00:00:00Z','test:tx','device',1,'2026-08-14','2026-08-14');
  INSERT INTO ledger_postings_v7
    (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,created_at)
    VALUES ('test','tx:principal','tx','wallet','physical','principal',-1000,'IQD','2026-08-14');
  INSERT INTO ledger_outbox_v2
    (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
    VALUES ('test','mutation','financial_transaction','tx','upsert',1,7,'{}','2026-08-14');
`);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace='test'").get().n, 1);
assert.throws(() => db.exec(`
  INSERT INTO ledger_postings_v7
    (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,created_at)
    VALUES ('test','bad','missing','wallet','physical','principal',-1,'IQD','2026-08-14');
`), /FOREIGN KEY/);

db.close();
console.log('MYFI Financial Ledger V7 SQLite DDL/runtime constraints passed.');
