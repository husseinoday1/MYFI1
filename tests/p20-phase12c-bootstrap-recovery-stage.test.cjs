const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'src/lib/financialBootstrapRecoveryImportV2.js'), 'utf8');
for (const token of [
  'stageFinancialBootstrapRecoveryImportV2',
  'verifyFinancialBootstrapReadbackV2',
  'writeFinancialBootstrapRecoveryStageRowV10',
  'inspectFinancialBootstrapRecoveryStageV10',
  'buildFinancialBootstrapRowsV2',
  'markFinancialBootstrapRecoveryImportReadyV9',
  'financial_v2_bootstrap_recovery_stage_manifest_mismatch',
]) assert(source.includes(token), `missing Phase 12-C recovery-stage token: ${token}`);
assert.doesNotMatch(source, /activateFinancialSyncProtocolV2V8|adoptUnbootstrappedCloudLedgerIdentityV8|clearFinancialNamespace/);
console.log('MYFI P20 PHASE 12-C BOOTSTRAP RECOVERY PRIVATE STAGE CONTRACT: PASSED');
