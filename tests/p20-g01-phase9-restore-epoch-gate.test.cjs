const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const gate = read('src/dev/p19RestoreEpochDeviceGate.js');
const settings = read('src/screens/SettingsScreen.js');
const workflow = read('.github/workflows/p20-g01-phase9-restore-epoch-gate.yml');

for (const token of [
  "EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE === '1'",
  'disposable_financially_empty_account_required',
  'beginLedgerRestoreEpochV8',
  'commitLedgerRestoreEpochV8',
  'abortLedgerRestoreEpochV8',
  "operation: 'controlled_recovery'",
  "supabase.rpc('advance_financial_restore_epoch_v2'",
  "p_reason: 'controlled_recovery'",
  'resolveCloudLedgerV2',
  'syncFinancialMutationsV2',
  'allowProductionApply: false',
  'phase9_new_epoch_shadow_validation_failed',
  "from('financial_restore_events_v2')",
  'deleteLocalInterlock',
  'backupRestoreInterlock',
  'P20_G01_PHASE9_RESTORE_EPOCH_GATE_PASS',
]) {
  assert(gate.includes(token), `missing gate token: ${token}`);
}

assert.match(gate, /const resetResult = await initial\.resetAll\(\);[\s\S]*resetResult !== false/);
assert.match(gate, /const restoreResult = await afterReset\.importBackup\(JSON\.stringify\(backup\)\);[\s\S]*restoreResult !== false/);
assert.match(gate, /transactions_present/);
assert.match(gate, /archived_transactions_present/);
assert.match(gate, /nonzero_wallet_opening_balance/);
assert.match(gate, /pending_v2_mutations_must_sync_first/);
assert.match(gate, /active_protocol_v2_required/);
assert.match(gate, /cloud_v2_identity_not_ready/);

// The acceptance gate may advance protocol metadata, but it must never clear,
// replace or delete the financial workspace itself.
for (const forbidden of [
  'clearFinancialWorkspaceV7',
  'replaceFinancialWorkspace',
  'DELETE FROM ledger_financial_transactions_v7',
  'clearVaultSnapshot',
]) {
  assert(!gate.includes(forbidden), `gate must not contain destructive implementation: ${forbidden}`);
}

assert(settings.includes("runP19RestoreEpochDeviceGate"));
assert(settings.includes("P19_RESTORE_EPOCH_DEVICE_GATE_ENABLED"));
assert(settings.includes("اختبار Restore Epoch — بيانات تجريبية فقط"));
assert(settings.includes("Restore Epoch gate — disposable only"));

assert(workflow.includes('r05-p20-phase9-restore-epoch-gate'));
assert(workflow.includes('EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE=1'));
assert(workflow.includes('node tests/p20-g01-phase9-restore-epoch-gate.test.cjs .'));
assert(workflow.includes('npm run test:gate:static'));
assert(workflow.includes('npm run test:gate:runtime'));
assert(workflow.includes('npm run verify:android'));
assert(workflow.includes('DeviceAcceptance=PENDING'));

console.log('MYFI P20-G01 PHASE 9 RESTORE-EPOCH DEVICE GATE CONTRACT: PASSED');
