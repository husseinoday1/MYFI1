const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const gate = fs.readFileSync(path.join(root, 'src/dev/p10_014bCloudHandshakeGate.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'src/dev/p10_014bCloudHandshakeEntry.js'), 'utf8');

for (const token of [
  "P10_014B_CLOUD_HANDSHAKE_ENABLED",
  "advance_financial_restore_epoch_v3",
  "advanceOrResolveFinancialRestoreEpochV3",
  "disposable_financially_empty_account_required",
  "beginLedgerRestoreEpochV8",
  "commitLedgerRestoreEpochV8",
  "original_authenticated_session_required",
  "serverProofSource: 'supabase_rpc_v3'",
]) assert.match(gate, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing P10-014B token: ${token}`);
assert.match(gate, /if \(blockers\.length\)/, 'non-disposable account must stop before cloud RPC');
assert.match(gate, /if \(!serverResult\?\.ok/, 'server proof must be validated before local CAS');
assert.match(entry, /p10_014bCloudHandshakeGate/);
assert.match(entry, /P10_014B_DEVICE_GATE/);
console.log('MYFI P10-014B CLOUD HANDSHAKE CONTRACT: PASS');
