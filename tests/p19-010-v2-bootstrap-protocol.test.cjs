const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const migrationsDirectory = path.join(root, 'supabase/migrations');
const migrationNames = fs.readdirSync(migrationsDirectory)
  .filter(name => /^\d+_financial_bootstrap_v2\.sql$/.test(name));
assert.equal(migrationNames.length, 1, 'expected exactly one Bootstrap V2 migration');
const migration = fs.readFileSync(path.join(migrationsDirectory, migrationNames[0]), 'utf8');
const repo = fs.readFileSync(path.join(root,'src/lib/financialLedgerV7Repository.js'),'utf8');
const client = fs.readFileSync(path.join(root,'src/lib/financialBootstrapV2.js'),'utf8');
const syncV2 = fs.readFileSync(path.join(root,'src/lib/financialMutationSyncV2.js'),'utf8');
const syncSlice = fs.readFileSync(path.join(root,'src/store/slices/useSyncSlice.js'),'utf8');
const gate = fs.readFileSync(path.join(root,'tests/run-quality-gate.cjs'),'utf8');

for (const token of [
  'financial_bootstrap_sessions_v2',
  'financial_bootstrap_rows_v2',
  'begin_financial_bootstrap_v2',
  'upload_financial_bootstrap_rows_v2',
  'finalize_financial_bootstrap_v2',
  'get_financial_bootstrap_rows_v2',
  'abort_financial_bootstrap_v2',
  'clear_financial_bootstrap_on_epoch_change_v2',
  'extensions.digest',
  "string_agg(row_hash,E'\\n' order by row_ordinal)",
]) assert(migration.includes(token), `missing bootstrap SQL token: ${token}`);

assert.match(migration,/bootstrapped_at := null/);
assert.match(migration,/bootstrap_manifest_hash := null/);
assert.doesNotMatch(migration,/delete\s+from\s+public\.financial_mutations_v2/i);
assert.doesNotMatch(migration,/delete\s+from\s+public\.financial_mutations_v1/i);

for (const token of [
  'createFinancialBootstrapStageV8',
  'readFinancialBootstrapStageRowsV8',
  'setFinancialBootstrapStageManifestV8',
  'finalizeFinancialBootstrapStageV8',
  'checkpoint_outbox_sequence',
  'superseded_by_bootstrap_id',
  'bootstrap-stage:',
]) assert(repo.includes(token), `missing local bootstrap token: ${token}`);

assert.match(repo,/superseded_by_bootstrap_id IS NULL[\s\S]*acknowledged_at IS NULL|acknowledged_at IS NULL[\s\S]*superseded_by_bootstrap_id IS NULL/);
assert.match(client,/Crypto\.CryptoDigestAlgorithm\.SHA256/);
assert.match(client,/begin_financial_bootstrap_v2/);
assert.match(client,/upload_financial_bootstrap_rows_v2/);
assert.match(client,/finalize_financial_bootstrap_v2/);
assert.match(client,/Math\.min\(200/);
assert.match(client,/rows\.map\(row => row\.rowHash\)\.join\('\\n'\)/);

for (const token of ['bootstrapId','bootstrapManifestHash','bootstrappedAt']) {
  assert(syncV2.includes(token), `cloud ledger normalization missing: ${token}`);
}

const p19011ContractPath = path.join(root,'tests/p19-011-controlled-v2-activation.test.cjs');
const p19011Present = fs.existsSync(p19011ContractPath);
if (!p19011Present) {
  assert(!syncSlice.includes('bootstrapFinancialLedgerV2'),
    'P19-010 must remain inactive before the dedicated P19-011 activation phase');
} else {
  assert(syncSlice.includes('bootstrapFinancialLedgerV2'),
    'P19-011 must wire the verified bootstrap only through controlled activation');
  assert(syncSlice.includes('runControlledFinancialV2Activation'));
  assert(syncSlice.includes('readbackVerification'));
  assert(syncSlice.includes('validating_v2_shadow'));
  assert(syncSlice.includes('financialV2Active'));
}
assert(gate.includes('p19-010-v2-bootstrap-protocol.test.cjs'),
  'P19-010 contract is not registered in quality gate');

console.log('MYFI P19-010 VERIFIED V2 BOOTSTRAP PROTOCOL: PASSED');
