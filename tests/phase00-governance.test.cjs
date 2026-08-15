const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const required = [
  'MYFI_RELEASE_GATE_STATUS_AR.md',
  'MYFI_DATA_OWNERSHIP.md',
  'MYFI_FINANCIAL_CONTRACT.md',
  'MYFI_DATE_TIME_CONTRACT.md',
  'MYFI_SYNC_PROTOCOL.md',
  'MYFI_MIGRATION_POLICY.md',
  'MYFI_BACKUP_FORMAT.md',
  'MYFI_SECURITY_THREAT_MODEL.md',
  'MYFI_PERFORMANCE_SLO.md',
  'MYFI_RELEASE_SCOPE.md',
];
for (const name of required) {
  assert(fs.existsSync(path.join(root, 'docs', name)), `Missing Phase 0 document: ${name}`);
}
const read = name => fs.readFileSync(path.join(root, 'docs', name), 'utf8');
assert.match(read('MYFI_DATA_OWNERSHIP.md'), /SQLite[\s\S]*Zustand[\s\S]*SecureStore[\s\S]*Supabase/);
assert.match(read('MYFI_FINANCIAL_CONTRACT.md'), /integer minor units/);
assert.match(read('MYFI_FINANCIAL_CONTRACT.md'), /outbox[\s\S]*SQLite transaction/);
assert.match(read('MYFI_DATE_TIME_CONTRACT.md'), /YYYY-MM-DD/);
assert.match(read('MYFI_SYNC_PROTOCOL.md'), /restore_epoch/);
assert.match(read('MYFI_MIGRATION_POLICY.md'), /schema_migrations/);
assert.match(read('MYFI_BACKUP_FORMAT.md'), /semantic_hash_version/);
assert.match(read('MYFI_SECURITY_THREAT_MODEL.md'), /allowBackup=false/);
assert.match(read('MYFI_PERFORMANCE_SLO.md'), /quick_check/);
assert.match(read('MYFI_RELEASE_SCOPE.md'), /Feature freeze/);
assert.match(read('MYFI_RELEASE_GATE_STATUS_AR.md'), /b438a9e2413a946b7791a7dd76cab36345a57ba5/);
console.log('MYFI Phase 0 governance/contracts are present and internally anchored.');
