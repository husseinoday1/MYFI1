const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const gate = fs.readFileSync(path.join(root, 'src/dev/p10_014bCloudHandshakeGate.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'src/dev/p10_014bCloudHandshakeEntry.js'), 'utf8');
const sourceGuard = fs.readFileSync(path.join(root, 'src/lib/financialRestoreSourceGuardV13.js'), 'utf8');
const checkpoint = fs.readFileSync(path.join(root, 'src/lib/financialRestoreCheckpointV13.js'), 'utf8');
const secureUuid = fs.readFileSync(path.join(root, 'src/lib/secureUuid.js'), 'utf8');
const secureVault = fs.readFileSync(path.join(root, 'src/lib/secureVault.js'), 'utf8');
const rpcClient = fs.readFileSync(path.join(root, 'src/lib/financialRestoreEpochV3Client.js'), 'utf8');

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
assert.match(gate,
  /import\s*{\s*readNamespaceManifestCountsV13\s*}\s*from\s*['"]\.\.\/lib\/financialRestoreSourceGuardV13['"]/,
  'manifest count reader must be imported from its real exporting module');
assert.match(sourceGuard, /export const readNamespaceManifestCountsV13\s*=/,
  'source guard must actually export the imported manifest count reader');
assert.doesNotMatch(checkpoint, /export (?:const|function) readNamespaceManifestCountsV13\b/,
  'checkpoint module must not be mistaken for the manifest count exporter');
assert.doesNotMatch(gate, /financialRestoreCheckpointV13/,
  'gate must not retain the runtime-undefined checkpoint import');
assert.match(gate, /createSecureUuidV4\(\)/, 'gate operation ID must use the shared secure UUID helper');
assert.match(secureVault, /createSecureUuidV4\(\)/, 'device ID must use the shared secure UUID helper');
assert.doesNotMatch(`${gate}\n${secureVault}\n${secureUuid}`, /Crypto\.randomUUID/,
  'P10 UUID generation must not depend on an optional native randomUUID method');
assert.match(secureUuid, /Crypto\.getRandomBytes\(16\)/,
  'secure UUID helper must use 128 bits from Expo secure random bytes');
assert.match(entry, /p10_014bCloudHandshakeGate/);
assert.match(entry, /P10_014B_DEVICE_GATE/);
assert.match(entry, /state\?\.financialLedgerV7Cutover/,
  'device gate must wait for the financial ledger cutover state');
assert.match(entry, /\[P10_014B_DEVICE_GATE\] PHASE/,
  'same APK must emit the exact phase of any later runtime failure');
assert.match(rpcClient, /abortSignal\(controller\.signal\)/,
  'proof-bound RPC must be abortable');
assert.match(rpcClient, /DEFAULT_RPC_TIMEOUT_MS = 10000/,
  'proof-bound RPC must have a bounded default timeout');
console.log('MYFI P10-014B CLOUD HANDSHAKE CONTRACT: PASS');
