const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const migrationsDirectory = path.join(root, 'supabase/migrations');
const migrationNames = fs.readdirSync(migrationsDirectory)
  .filter(name => /^\d+_financial_mutation_v1_ack_hardening\.sql$/.test(name));
assert.equal(migrationNames.length, 1, 'expected exactly one V1 ACK hardening migration');
const migration = fs.readFileSync(path.join(migrationsDirectory, migrationNames[0]), 'utf8');
const e2e = fs.readFileSync(path.join(root, 'tests/run-financial-mutation-sync-e2e.cjs'), 'utf8');

assert.match(migration, /mutation_id_conflict/);
assert.match(migration, /returning mutation_id into v_inserted_mutation_id/);
assert.match(migration, /v_existing\.payload is distinct from/);
assert.match(migration, /v_existing\.entity_revision is distinct from/);
assert.match(migration, /on conflict \(user_id, mutation_id\) do nothing/);
assert.match(migration, /grant execute .* to authenticated/);
assert.doesNotMatch(
  migration,
  /on conflict \(user_id, mutation_id\) do nothing;\s*v_accepted :=/,
  'the old false-ACK sequence must not reappear',
);

assert.match(e2e, /Conflicting reuse of a mutation ID was accepted/);
assert.match(e2e, /mutation-id-conflict: ok/);

console.log('MYFI P19-003 RPC ACK HARDENING CONTRACT: PASSED');
