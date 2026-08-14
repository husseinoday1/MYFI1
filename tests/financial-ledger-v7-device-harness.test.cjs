const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const harness = fs.readFileSync(path.join(root, 'src/dev/financialLedgerV7DeviceHarness.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');

assert.match(harness, /__myfi_v7_device_harness__/);
assert.match(harness, /clearFinancialWorkspaceV7/);
assert.match(harness, /finally\s*\{/);
assert.match(harness, /idempotency_failed/);
assert.match(harness, /sqlite_check_constraint_missing/);
assert.match(harness, /PRAGMA foreign_keys/);
assert.match(harness, /pending\.length === 4/);
assert.doesNotMatch(settings, /runFinancialLedgerV7DeviceHarness/);
assert.doesNotMatch(settings, /Test SQLite V7 on this device/);

console.log('MYFI Financial Ledger V7 native device harness contract passed.');
