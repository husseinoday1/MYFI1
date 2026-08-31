const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');

assert.match(repository, /FINANCIAL_SQLITE_SCHEMA_VERSION = 10/);
assert.match(repository, /0009_bootstrap_recovery_import/);
assert.match(repository, /0010_bootstrap_recovery_stage_rows/);
assert.match(repository, /ledger_bootstrap_recovery_import_v9/);
assert.match(repository, /ledger_bootstrap_recovery_rows_v10/);
assert.match(repository, /bootstrap-recovery-stage:/);
assert.match(repository, /beginFinancialBootstrapRecoveryImportV9/);
assert.match(repository, /recordFinancialBootstrapRecoveryImportProgressV9/);
assert.match(repository, /markFinancialBootstrapRecoveryImportReadyV9/);
assert.match(repository, /writeFinancialBootstrapRecoveryStageRowV10/);
assert.match(repository, /financial_v2_bootstrap_recovery_restore_intent_active/);
assert.match(repository, /financial_v2_bootstrap_recovery_rows_incomplete/);

const ddl = repository.match(/export const FINANCIAL_LEDGER_V9_BOOTSTRAP_RECOVERY_SQL = `([\s\S]*?)`;/);
assert(ddl, 'V9 recovery session DDL missing');
assert.doesNotMatch(ddl[1], /FOREIGN KEY[\s\S]*ledger_sync_identity_v8/i,
  'fresh-device recovery receipt must not require a locally generated V2 identity');
assert.match(ddl[1], /UNIQUE\(namespace, source_ledger_id, source_restore_epoch, source_bootstrap_id\)/);
assert.match(ddl[1], /last_cloud_row_ordinal/);
assert.match(ddl[1], /proof_digest/);

const stageDdl = repository.match(/export const FINANCIAL_LEDGER_V10_BOOTSTRAP_RECOVERY_STAGE_SQL = `([\s\S]*?)`;/);
assert(stageDdl, 'V10 recovery receipt DDL missing');
assert.match(stageDdl[1], /payload_text/);
assert.match(stageDdl[1], /ON DELETE CASCADE/);

console.log('MYFI P20 PHASE 12-C BOOTSTRAP RECOVERY SESSION CONTRACT: PASSED');
