const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const data = fs.readFileSync(path.join(root, 'src/store/slices/dataSlice.js'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'tests/run-quality-gate.cjs'), 'utf8');

assert.match(data, /inspectLocalFinancialResetSafetyV8/);
assert.match(data, /local_reset_requires_complete_v2_recovery/);
assert.match(data, /clearLocalFinancialDataForCloudRecoveryV8/);
assert.match(data, /local_reset_cloud_sync_required/);
const resetStart = data.indexOf('resetAll: async');
const resetEnd = data.indexOf('restoreLastBackupRollback: async', resetStart);
const resetBody = data.slice(resetStart, resetEnd);
assert.ok(
  resetBody.indexOf('const signedInCloudWorkspace') < resetBody.indexOf('const localResetSafety'),
  'signed-in cloud deletion must branch before the legacy reset path',
);
assert.ok(
  resetBody.indexOf('local_reset_recovery_marker_write_failed') < resetBody.indexOf('clearLocalFinancialDataForCloudRecoveryV8'),
  'the durable recovery marker must be written before the local ledger is cleared',
);
for (const token of [
  'ledger_sync_identity_v8',
  'ledger_sync_state_v8',
  'ledger_outbox_v3',
  'ledger_v7_meta',
  'local_reset_requires_complete_v2_recovery',
]) assert.ok(repo.includes(token), `missing V2 reset-safety evidence: ${token}`);
for (const token of [
  'Delete this device',
  'حذف بيانات هذا الجهاز',
  'restoreLocalDataFromCloud',
  'استعادة بياناتي من السحابة',
]) assert.ok(settings.includes(token), `missing signed-in local-delete UX: ${token}`);
assert.ok(gate.includes('p20-local-reset-v2-interlock.test.cjs'));
assert.ok(gate.includes('run-p20-local-reset-v2-interlock.cjs'));

console.log('MYFI P20 LOCAL RESET V2 INTERLOCK CONTRACT: PASSED');
