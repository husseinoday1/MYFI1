const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');

assert.match(repository, /FINANCIAL_SQLITE_SCHEMA_VERSION = 10/);
assert.match(repository, /0008_sync_identity_v2/);
assert.match(repository, /0009_bootstrap_recovery_import/);
assert.match(repository, /0010_bootstrap_recovery_stage_rows/);
assert.match(repository, /fromVersion:\s*FINANCIAL_LEDGER_SCHEMA_VERSION/);
assert.match(repository, /toVersion:\s*FINANCIAL_SQLITE_SCHEMA_VERSION/);
assert.match(repository, /ensureLedgerSyncIdentityV8/);
assert.match(repository, /ledger_sync_identity_v8/);
assert.match(repository, /ledger_outbox_v3/);
assert.match(repository, /ledger_inbox_v3/);
assert.match(repository, /ledger_sync_state_v8/);
assert.match(repository, /ledger_bootstrap_state_v8/);
assert.match(repository, /ledger_bootstrap_import_state_v8/);
assert.match(repository, /last_cloud_row_sequence/);
assert.match(repository, /checkpoint_outbox_sequence/);
assert.match(repository, /superseded_by_bootstrap_id/);
assert.match(repository, /superseded_at/);
assert.match(repository, /shadow_last_server_sequence/);
assert.match(repository, /last_server_sequence/);
assert.match(repository, /apply_status/);
assert.match(repository, /command_sequence/);
assert.match(repository, /idx_ledger_inbox_v3_command/);
assert.match(repository, /observed/);
assert.match(repository, /applied/);
assert.match(repository, /command_id/);
assert.match(repository, /base_revision/);
assert.match(repository, /CHECK\(revision = base_revision \+ 1\)/i);
assert.match(repository, /restore_epoch/);
assert.match(repository, /protocol_version/);
assert.match(repository, /minimum_supported_version/);
assert.match(repository, /randomblob\(16\)/);

const v7 = repository.match(/export const FINANCIAL_LEDGER_V7_SCHEMA_SQL = `([\s\S]*?)`;/);
const v8 = repository.match(/export const FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL = `([\s\S]*?)`;/);
assert(v7 && v8, 'V7/V8 DDL blocks missing');

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec(v7[1]);
db.exec(`
  INSERT INTO ledger_currencies(code,minor_exponent) VALUES ('IQD',3);
  INSERT INTO ledger_accounts_v7(namespace,id,account_type,scope,currency_code,status,created_at,updated_at)
    VALUES ('user:test','wallet','cash','personal','IQD','active','2026-08-17','2026-08-17');
  INSERT INTO ledger_financial_transactions_v7
    (namespace,id,kind,status,scope,date_iso,occurred_at,idempotency_key,device_id,revision,created_at,updated_at)
    VALUES ('user:test','tx','expense','posted','personal','2026-08-17','2026-08-17T00:00:00Z','tx','device',3,'2026-08-17','2026-08-17');
  INSERT INTO ledger_postings_v7
    (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,created_at)
    VALUES ('user:test','p','tx','wallet','physical','principal',-123456,'IQD','2026-08-17');
`);

const beforeAmount = db.prepare("SELECT amount_minor FROM ledger_postings_v7 WHERE id='p'").get().amount_minor;
db.exec(v8[1]);
db.exec(`
  INSERT OR IGNORE INTO ledger_sync_identity_v8
    (namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
  VALUES ('user:test','ledger-fixed-test',1,2,2,'2026-08-17','2026-08-17');
`);
const tables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name),
);
for (const name of [
  'ledger_sync_identity_v8', 'ledger_outbox_v3', 'ledger_inbox_v3',
  'ledger_bootstrap_state_v8', 'ledger_bootstrap_import_state_v8', 'ledger_sync_state_v8',
]) {
  assert(tables.has(name), `missing V8 sync table: ${name}`);
}

const identity = db.prepare("SELECT * FROM ledger_sync_identity_v8 WHERE namespace='user:test'").get();
assert.equal(identity.ledger_id, 'ledger-fixed-test');
assert.equal(identity.restore_epoch, 1);
assert.equal(identity.protocol_version, 2);
assert.equal(identity.minimum_supported_version, 2);

db.exec(`
  INSERT INTO ledger_outbox_v3
    (namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,
     revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,
     payload_json,created_at)
  VALUES ('user:test','ledger-fixed-test',1,'m-test','cmd-test','goal','goal-1','upsert',
          1,0,2,2,7,'{}','2026-08-17');
`);
const outbox = db.prepare(
  "SELECT revision,base_revision FROM ledger_outbox_v3 WHERE mutation_id='m-test'",
).get();
assert.equal(outbox.revision, 1);
assert.equal(outbox.base_revision, 0);

db.exec(`
  INSERT INTO ledger_inbox_v3
    (ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence,received_at)
  VALUES ('ledger-fixed-test',1,'remote-shadow','remote-command',1,1,'2026-08-17');
  INSERT INTO ledger_sync_state_v8
    (ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,
     last_shadow_success_at,last_success_at,activated_at,last_device_id,updated_at)
  VALUES ('ledger-fixed-test',1,1,0,'2026-08-17',NULL,NULL,'device','2026-08-17');
`);
const inbox = db.prepare(
  "SELECT apply_status,applied_at FROM ledger_inbox_v3 WHERE mutation_id='remote-shadow'",
).get();
const syncState = db.prepare(
  "SELECT shadow_last_server_sequence,last_server_sequence FROM ledger_sync_state_v8 WHERE ledger_id='ledger-fixed-test'",
).get();
assert.equal(inbox.apply_status, 'observed');
assert.equal(inbox.applied_at, null);
assert.equal(syncState.shadow_last_server_sequence, 1);
assert.equal(syncState.last_server_sequence, 0);

// Re-applying V8 DDL must not reinterpret money or replace identity.
db.exec(v8[1]);
const afterAmount = db.prepare("SELECT amount_minor FROM ledger_postings_v7 WHERE id='p'").get().amount_minor;
const identity2 = db.prepare("SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace='user:test'").get();
assert.equal(afterAmount, beforeAmount);
assert.equal(identity2.ledger_id, 'ledger-fixed-test');

assert.throws(() => db.exec(`
  INSERT INTO ledger_outbox_v3
    (namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,
     revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,
     payload_json,created_at)
  VALUES ('user:test','ledger-fixed-test',1,'bad-revision','cmd-bad-revision','goal','goal-2','upsert',
          3,0,2,2,7,'{}','2026-08-17')
`), /CHECK constraint failed/);

assert.throws(() => db.exec(`
  INSERT INTO ledger_outbox_v3
    (namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,
     revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,
     payload_json,created_at)
  VALUES ('wrong-namespace','ledger-fixed-test',1,'bad-namespace','cmd-bad-namespace','goal','goal-3','upsert',
          1,0,2,2,7,'{}','2026-08-17')
`), /FOREIGN KEY constraint failed/);

assert.throws(() => db.exec(`
  INSERT INTO ledger_sync_identity_v8
    (namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
  VALUES ('bad','bad-ledger',0,2,2,'x','x')
`), /CHECK constraint failed/);

db.close();
console.log('MYFI P19-004 LOCAL LEDGER IDENTITY V8 SHADOW: PASSED');
