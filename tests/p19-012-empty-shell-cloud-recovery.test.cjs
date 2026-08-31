const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const migrationsDirectory = path.join(root, 'supabase/migrations');
const migrationNames = fs.readdirSync(migrationsDirectory)
  .filter(name => /^\d+_financial_cloud_recovery_source_v2\.sql$/.test(name));
assert.equal(migrationNames.length, 1, 'expected exactly one cloud recovery source migration');
const migration = fs.readFileSync(path.join(migrationsDirectory, migrationNames[0]), 'utf8');
const client = fs.readFileSync(path.join(root,'src/lib/financialCloudRecoveryV2.js'),'utf8');
const repo = fs.readFileSync(path.join(root,'src/lib/financialLedgerV7Repository.js'),'utf8');
const sync = fs.readFileSync(path.join(root,'src/store/slices/useSyncSlice.js'),'utf8');
const build = fs.readFileSync(path.join(root,'tools/build-local-internal-apk.ps1'),'utf8');
const install = fs.readFileSync(path.join(root,'tools/install-local-internal-apk.ps1'),'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const gate = fs.readFileSync(path.join(root,'tests/run-quality-gate.cjs'),'utf8');
const evidence = fs.readFileSync(
  path.join(root,'docs/04_CURRENT_EVIDENCE/MYFI_P19_012_EMPTY_SHELL_CLOUD_RECOVERY_2026-08-17.md'),'utf8'
);

for (const token of [
  'get_financial_cloud_recovery_source_v2',
  'legacy_snapshot',
  'v2_bootstrap',
  'snapshotText',
  'snapshotHash',
  'extensions.digest',
]) assert(migration.includes(token), `missing recovery SQL token: ${token}`);

assert.match(migration,/security definer/i);
assert.doesNotMatch(migration,/insert\s+into\s+public\.user_data/i);
assert.doesNotMatch(migration,/update\s+public\.user_data/i);
assert.doesNotMatch(migration,/delete\s+from\s+public\.user_data/i);

for (const token of [
  'fetchVerifiedFinancialCloudRecoverySourceV2',
  'financial_cloud_recovery_snapshot_hash_mismatch',
  'requiresBootstrapImport',
]) assert(client.includes(token), `missing client token: ${token}`);

for (const token of [
  'inspectFinancialEmptyShellV8',
  'recordFinancialCloudRecoveryV8',
  'nonWorkspaceV1Outbox',
  'nonWorkspaceV2Outbox',
  'cloud_recovery_v2:',
]) assert(repo.includes(token), `missing repository recovery token: ${token}`);

for (const token of [
  'runVerifiedEmptyShellCloudRecoveryV2',
  'financial_v2_bootstrap_import_required',
  'financial_v2_reserved_ledger_identity_adoption_required',
  'financial_cloud_recovery_roundtrip_mismatch',
  'requireV2',
]) assert(sync.includes(token), `missing sync recovery token: ${token}`);

const syncCloud = sync.slice(sync.indexOf('syncCloud: async'));
assert(syncCloud.includes('runVerifiedEmptyShellCloudRecoveryV2'));
const recoveryCall = syncCloud.indexOf('runVerifiedEmptyShellCloudRecoveryV2');
const activationCall = syncCloud.indexOf('runControlledFinancialV2Activation');
assert(recoveryCall >= 0 && activationCall > recoveryCall,
  'empty-shell cloud recovery must execute before P19-011 V2 activation');
assert(sync.includes('financial_v7_snapshot_pull_forbidden'),
  'P19-012 must not reopen generic post-cutover snapshot pull');

assert(build.includes(':app:assembleRelease'));
assert(!build.includes('eas build'));
assert(build.includes('EASBuildQuotaUsed=NO'));
assert(install.includes('install -r'));
assert(install.includes('SIGNATURE_MISMATCH'));
assert(install.includes('No uninstall or app-data clear was performed'));

assert(pkg.scripts['build:apk:local']);
assert(pkg.scripts['install:apk:local']);
assert(gate.includes('p19-012-empty-shell-cloud-recovery.test.cjs'));
assert(gate.includes('run-p19-012-cloud-recovery-source.cjs'));

for (const token of [
  '80 transactions',
  '7 wallets',
  'revision 300',
  'local Gradle internal APK',
  'Phase 9 remains OPEN',
]) assert(evidence.includes(token), `evidence missing token: ${token}`);

// Evidence wording must clearly capture the build failure cause without relying
// on one brittle punctuation/capitalization spelling.
assert.match(
  evidence,
  /EAS[\s\S]{0,160}(Free[- ]plan|Free plan)[\s\S]{0,160}(Android build quota|Android builds|quota)/i,
  'evidence must record that the EAS Free-plan Android build quota caused the build failure'
);

console.log('MYFI P19-012R1 EMPTY-SHELL CLOUD RECOVERY CONTRACT: PASSED');
