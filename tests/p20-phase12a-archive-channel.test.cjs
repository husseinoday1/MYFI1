const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const migrationPath = path.join(root, 'supabase/migrations/20260831135538_financial_archive_recovery_v2.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const gate = fs.readFileSync(path.join(root, 'tests/run-quality-gate.cjs'), 'utf8');

for (const token of [
  'financial_archive_snapshot_sessions_v2',
  'financial_archive_snapshot_rows_v2',
  'financial_archive_heads_v2',
  "row_type in ('archive_year','archive_transaction')",
  'begin_financial_archive_snapshot_v2',
  'upload_financial_archive_snapshot_rows_v2',
  'finalize_financial_archive_snapshot_v2',
  'get_financial_archive_head_v2',
  'get_financial_archive_snapshot_rows_v2',
  'abort_financial_archive_snapshot_v2',
  'pg_advisory_xact_lock',
  'financial_archive_generation_compare_and_swap_failed',
  "'archivePresent', false",
  'extensions.digest',
  'enable row level security',
]) assert.ok(migration.includes(token), `missing archive channel SQL contract: ${token}`);

assert.match(migration, /owner_user_id\s*=\s*v_user_id/);
assert.match(migration, /where public\.financial_archive_heads_v2\.archive_generation = v_session\.expected_generation/);
assert.match(migration, /financial_archive_snapshot_not_current/);
assert.doesNotMatch(migration, /update\s+public\.financial_ledgers_v2\s+set\s+restore_epoch/i);
assert.doesNotMatch(migration, /(?:insert\s+into|update|delete\s+from)\s+public\.financial_bootstrap_rows_v2/i);
assert.ok(gate.includes('p20-phase12a-archive-channel.test.cjs'), 'archive channel contract is not registered in quality gate');

console.log('MYFI P20 PHASE 12-A ARCHIVE CHANNEL CONTRACT: PASSED');
