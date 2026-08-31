const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const migrationsDirectory = path.join(root, 'supabase/migrations');
const migrationNames = fs.readdirSync(migrationsDirectory)
  .filter(name => /^\d+_financial_mutation_sync_v2_shadow\.sql$/.test(name));
assert.equal(migrationNames.length, 1, 'expected exactly one V2 shadow migration');
const sql = fs.readFileSync(path.join(migrationsDirectory, migrationNames[0]), 'utf8');

for (const token of [
  'financial_ledgers_v2',
  'bootstrap_manifest_hash',
  'bootstrapped_at',
  'financial_bootstrap_required',
  'financial_commands_v2',
  'command_sequence',
  'commandMutationCount',
  'command_mutation_count',
  'financial_entity_heads_v2',
  'financial_mutations_v2',
  'ledger_id',
  'restore_epoch',
  'command_id',
  'base_revision',
  'protocol_version',
  'minimum_supported_version',
  'payload_schema_version',
  'register_financial_ledger_v2',
  'get_financial_ledger_v2',
  'sync_financial_mutations_v2',
  'base_revision_mismatch',
  'mutation_id_conflict',
  'partial_command_replay',
  'mutation_command_duplicate_entity',
  'last_command_id',
  'command_id_conflict',
  'command_metadata_missing_or_conflicting',
  'cumulative_mutations',
  'command_rank=1',
  'for update',
]) {
  assert(sql.toLowerCase().includes(token.toLowerCase()), `missing V2 contract token: ${token}`);
}

assert.match(sql, /check \(revision = base_revision \+ 1\)/);
assert.match(sql, /unique \(ledger_id, restore_epoch, mutation_id\)/);
assert.match(sql, /unique \(ledger_id, restore_epoch, entity_type, entity_id, revision\)/);
assert.match(sql, /financial_mutations_v2_command_idx/);
assert.match(sql, /financial_commands_v2_ledger_sequence_idx/);
assert.match(sql, /v_existing_count = v_group_count/);
assert.match(sql, /COMMIT GROUP/);
assert.match(sql, /owner_user_id = \(select auth\.uid\(\)\)/);
assert.match(sql, /revoke all on public\.financial_entity_heads_v2 from anon, authenticated/);
assert.match(sql, /grant execute on function public\.sync_financial_mutations_v2/);
assert.doesNotMatch(sql, /delete from public\.financial_mutations_v1/i);
assert.doesNotMatch(sql, /alter table public\.financial_mutations_v1/i);

console.log('MYFI P19-005 CLOUD SYNC V2 SHADOW CONTRACT: PASSED');
