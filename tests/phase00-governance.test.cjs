const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const required = [
  '01_CORE_AUTHORITY/MAALFLOW_RELEASE_GATE_STATUS_AR.md',
  'MAALFLOW_DATA_OWNERSHIP.md',
  'MAALFLOW_FINANCIAL_CONTRACT.md',
  'MAALFLOW_DATE_TIME_CONTRACT.md',
  'MAALFLOW_SYNC_PROTOCOL.md',
  'MAALFLOW_MIGRATION_POLICY.md',
  'MAALFLOW_BACKUP_FORMAT.md',
  'MAALFLOW_SECURITY_THREAT_MODEL.md',
  'MAALFLOW_PERFORMANCE_SLO.md',
  'MAALFLOW_RELEASE_SCOPE.md',
];
for (const name of required) {
  assert(fs.existsSync(path.join(root, 'docs', name)), `Missing Phase 0 document: ${name}`);
}
const read = name => fs.readFileSync(path.join(root, 'docs', name), 'utf8');
assert.match(read('MAALFLOW_DATA_OWNERSHIP.md'), /SQLite[\s\S]*Zustand[\s\S]*SecureStore[\s\S]*Supabase/);
assert.match(read('MAALFLOW_FINANCIAL_CONTRACT.md'), /integer minor units/);
assert.match(read('MAALFLOW_FINANCIAL_CONTRACT.md'), /outbox[\s\S]*SQLite transaction/);
assert.match(read('MAALFLOW_DATE_TIME_CONTRACT.md'), /YYYY-MM-DD/);
assert.match(read('MAALFLOW_SYNC_PROTOCOL.md'), /restore_epoch/);
assert.match(read('MAALFLOW_MIGRATION_POLICY.md'), /schema_migrations/);
assert.match(read('MAALFLOW_BACKUP_FORMAT.md'), /semantic_hash_version/);
assert.match(read('MAALFLOW_SECURITY_THREAT_MODEL.md'), /allowBackup=false/);
assert.match(read('MAALFLOW_PERFORMANCE_SLO.md'), /quick_check/);
assert.match(read('MAALFLOW_RELEASE_SCOPE.md'), /Feature freeze/);
assert.match(read('01_CORE_AUTHORITY/MAALFLOW_RELEASE_GATE_STATUS_AR.md'), /b438a9e2413a946b7791a7dd76cab36345a57ba5/);
console.log('MaalFlow Phase 0 governance/contracts are present and internally anchored.');
