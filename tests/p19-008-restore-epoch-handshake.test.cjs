const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const repository = fs.readFileSync(path.join(root,'src/lib/financialLedgerV7Repository.js'),'utf8');
const migrationsDirectory = path.join(root, 'supabase/migrations');
const migrationNames = fs.readdirSync(migrationsDirectory)
  .filter(name => /^\d+_financial_restore_epoch_v2\.sql$/.test(name));
assert.equal(migrationNames.length, 1, 'expected exactly one restore epoch migration');
const sql = fs.readFileSync(path.join(migrationsDirectory, migrationNames[0]), 'utf8');

for (const token of [
  'beginLedgerRestoreEpochV8',
  'readLedgerRestoreIntentV8',
  'commitLedgerRestoreEpochV8',
  'abortLedgerRestoreEpochV8',
  'restore_intent:',
  'restore_epoch_intent_conflict',
  'restore_epoch_commit_without_intent',
]) {
  assert(repository.includes(token), `missing local restore epoch token: ${token}`);
}

assert.match(repository, /toEpoch:\s*identity\.restoreEpoch \+ 1/);
assert.match(repository, /UPDATE ledger_sync_identity_v8[\s\S]*restore_epoch=\?/);
assert.match(repository, /DELETE FROM ledger_v7_meta WHERE key=\?/);
assert.match(repository, /ledger_sync_state_v8/);

for (const token of [
  'financial_restore_events_v2',
  'advance_financial_restore_epoch_v2',
  'restore_epoch_conflict',
  'restore_epoch_idempotency_conflict',
  'restore_epoch_compare_and_swap_failed',
  'for update',
]) {
  assert(sql.toLowerCase().includes(token.toLowerCase()), `missing server restore token: ${token}`);
}
assert.match(sql, /p_new_epoch <> p_expected_epoch \+ 1/);
assert.match(sql, /unique \(ledger_id, to_epoch\)/);
assert.match(sql, /grant execute on function public\.advance_financial_restore_epoch_v2/);
assert.doesNotMatch(sql, /delete from public\.financial_mutations_v2/i);
assert.doesNotMatch(sql, /delete from public\.financial_mutations_v1/i);

console.log('MYFI P19-008 RESTORE EPOCH HANDSHAKE CONTRACT: PASSED');
