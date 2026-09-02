const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const repo = fs.readFileSync(path.join(root,'src/lib/financialLedgerV7Repository.js'),'utf8');
const bootstrap = fs.readFileSync(path.join(root,'src/lib/financialBootstrapV2.js'),'utf8');
const sync = fs.readFileSync(path.join(root,'src/store/slices/useSyncSlice.js'),'utf8');
const data = fs.readFileSync(path.join(root,'src/store/slices/dataSlice.js'),'utf8');
const gate = fs.readFileSync(path.join(root,'tests/run-quality-gate.cjs'),'utf8');

for (const token of [
  'verifyFinancialBootstrapReadbackV2',
  'get_financial_bootstrap_rows_v2',
  'financial_v2_bootstrap_readback_row_hash_mismatch',
  'financial_v2_bootstrap_readback_manifest_mismatch',
  'financial_v2_bootstrap_readback_cursor_stalled',
  'readbackVerification',
]) assert(bootstrap.includes(token), `missing read-back verification token: ${token}`);

assert.match(bootstrap,/sha256Hex\(`\$\{rowType\}\\n\$\{rowKey\}\\n\$\{payloadText\}`\)/);
assert.match(bootstrap,/sha256Hex\(rowHashes\.join\('\\n'\)\)/);
assert.match(bootstrap,/readBackRowCount:\s*rowHashes\.length/);
assert.match(bootstrap,/pageBudget/);

for (const token of [
  'readFinancialSyncProtocolV8',
  'activateFinancialSyncProtocolV2V8',
  'financial_v2_activation_bootstrap_not_finalized',
  'financial_v2_activation_pending_outbox',
  'financial_v2_activation_evidence_invalid',
  'sync_v2_activation_evidence:',
  'active_sync_protocol:',
  'activationEvidenceValid',
  'activated_at',
]) assert(repo.includes(token), `missing activation repository token: ${token}`);

assert.match(repo,/status !== 'finalized'/);
assert.match(repo,/acknowledged_at IS NULL[\s\S]*superseded_by_bootstrap_id IS NULL/);
assert.match(repo,/activeProtocolVersion:\s*row\?\.activated_at \? 2 : 1/);
assert.match(repo,/readbackVerifiedAt/);
assert.match(repo,/shadowValidatedAt/);
assert.match(repo,/validationCursor/);
assert.match(repo,/safeJson\(activationEvidence\)/);

for (const token of [
  'bootstrapFinancialLedgerV2',
  'syncFinancialMutationsV2',
  'runControlledFinancialV2Activation',
  'activateFinancialSyncV2',
  'financialSyncV2Activation',
  'financialV2Active',
  'failed_before_activation',
  'validating_v2_shadow',
  'financial_v2_activation_shadow_not_quiescent',
  'readbackVerification',
  'shadowPasses',
]) assert(sync.includes(token), `missing controlled activation token: ${token}`);

assert.match(sync,/for \(let pass = 1; pass <= 3; pass \+= 1\)/);

// Every attempt starts from a clean validation slate: a previous attempt's
// shadow cursor and its 'conflict' inbox rows would otherwise lock this one out
// before preflight even runs. The reset carries its own guards, so a refusal
// means there was nothing to reset and must never abort the activation.
{
  const activation = sync.slice(sync.indexOf('const runControlledFinancialV2Activation'));
  const reset = activation.indexOf('resetFinancialV2ShadowValidationStateV8');
  const shadowLoop = activation.indexOf('for (let pass = 1; pass <= 3; pass += 1)');
  assert(reset > 0 && reset < shadowLoop,
    'shadow validation state must be reset before the shadow passes');
  assert.match(activation.slice(reset - 200, shadowLoop),
    /try \{[\s\S]*resetFinancialV2ShadowValidationStateV8[\s\S]*\} catch/,
    'a failed reset must not abort the activation');
}
assert.match(sync,/pendingAfterSync[\s\S]*uploaded[\s\S]*downloaded[\s\S]*hasMore/);
assert.match(sync,/readbackVerifiedAt:\s*readback\.verifiedAt/);
assert.match(sync,/shadowValidatedAt/);
assert.match(sync,/validationCursor:\s*Number\(validationSync\.cursor \|\| 0\)/);

// Before activation, explicit failure keeps V1 as the operational fallback.
assert.match(sync,/if \(!activationFinancialSync\.ok\) \{[\s\S]*financialV2Active = false;[\s\S]*\} else \{[\s\S]*financialV2Active = true;/);

// Once the durable marker says V2, normal and bridge mutation sync select V2;
// there is no error-driven downgrade branch after a V2 failure.
assert.match(sync,/financialV2Active\s*\?\s*\(activationFinancialSync\?\.sync \|\| await syncFinancialMutationsV2/);
assert.match(sync,/financialV2Active[\s\S]*:\s*await syncFinancialMutationsV7/);
assert.match(sync,/const bridged = financialV2Active[\s\S]*syncFinancialMutationsV2[\s\S]*syncFinancialMutationsV7/);
assert.match(sync,/if \(protocol\?\.activeProtocolVersion === 2\)/);
assert.doesNotMatch(sync,/financialV2Active\s*=\s*false[\s\S]{0,500}financial_v2_.*sync_failed/);

assert(data.includes('local_reset_requires_protocol_v2'),
  'destructive local reset interlock must remain active during V2 activation soak');
assert(data.includes('backup_restore_requires_protocol_v2'),
  'backup restore interlock must remain active during V2 activation soak');

assert(gate.includes('p19-011-controlled-v2-activation.test.cjs'),
  'P19-011 static contract is not registered in quality gate');
assert(gate.includes('run-p19-011-bootstrap-readback.cjs'),
  'P19-011 read-back runtime is not registered in quality gate');

// P20-G01: the legacy namespace-only activation-evidence key may still be READ for
// ledgers activated before evidence became epoch-scoped, but must never be written
// again — it cannot express which epoch its evidence belongs to, which is how stale
// evidence survived an epoch advance on device.
const legacyUses = (repo.match(/legacyActivationEvidenceKey\(/g) || []).length;
assert.equal(
  legacyUses, 1,
  `legacy evidence key must keep exactly one (read) use, found ${legacyUses}`,
);
assert.ok(
  !/INSERT OR REPLACE INTO ledger_v7_meta[\s\S]{0,200}?legacyActivationEvidenceKey/.test(repo),
  'legacy activation-evidence key must never be written again',
);

console.log('MYFI P19-011R1 VERIFIED READBACK + CONTROLLED V2 ACTIVATION: PASSED');
