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
const resetStart = data.indexOf('resetAll: async');
const resetEnd = data.indexOf('restoreLastBackupRollback: async', resetStart);
const resetBody = data.slice(resetStart, resetEnd);
assert.ok(
  resetBody.indexOf('const localResetSafety') < resetBody.indexOf('const wallets = normalizeWallets'),
  'V2 local-reset safety must run before the reset creates a fresh setup wallet',
);
for (const token of [
  'ledger_sync_identity_v8',
  'ledger_sync_state_v8',
  'ledger_outbox_v3',
  'ledger_v7_meta',
  'local_reset_requires_complete_v2_recovery',
]) assert.ok(repo.includes(token), `missing V2 reset-safety evidence: ${token}`);
assert.match(settings, /Local deletion is not available yet/);
assert.match(settings, /حذف البيانات غير متاح الآن/);
assert.ok(gate.includes('p20-local-reset-v2-interlock.test.cjs'));
assert.ok(gate.includes('run-p20-local-reset-v2-interlock.cjs'));

console.log('MYFI P20 LOCAL RESET V2 INTERLOCK CONTRACT: PASSED');
