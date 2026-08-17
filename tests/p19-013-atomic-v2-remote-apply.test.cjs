const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const repo = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src/lib/financialMutationSyncV2.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'src/store/slices/useSyncSlice.js'), 'utf8');
const authority = fs.readFileSync(path.join(root, 'docs/00_MYFI_CANONICAL_AUTHORITY.md'), 'utf8');
const protocol = fs.readFileSync(path.join(root, 'docs/MYFI_SYNC_PROTOCOL.md'), 'utf8');
const addendum = fs.readFileSync(path.join(root, 'docs/01_CORE_AUTHORITY/MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md'), 'utf8');
const evidence = fs.readFileSync(path.join(root, 'docs/04_CURRENT_EVIDENCE/MYFI_P19_013_ATOMIC_V2_REMOTE_APPLY_2026-08-18.md'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'tests/run-quality-gate.cjs'), 'utf8');
const build = fs.readFileSync(path.join(root, 'tools/build-local-internal-apk.ps1'), 'utf8');
const install = fs.readFileSync(path.join(root, 'tools/install-local-internal-apk.ps1'), 'utf8');

const v8Start = repo.indexOf('export const applyRemoteLedgerMutationsV8 = async');
const v8End = repo.indexOf('const insertCurrency =', v8Start);
assert(v8Start >= 0 && v8End > v8Start, 'P19-013 V8 apply function not found');
const v8 = repo.slice(v8Start, v8End);

assert(!v8.includes('applyRemoteLedgerMutationsV7'), 'P19-013 production V2 apply must not delegate to V7 apply');
for (const token of [
  'allowProductionApply = false',
  'shadowMode = allowProductionApply !== true',
  'financial_v2_remote_command_incomplete',
  'financial_v2_remote_command_duplicate_entity',
  'shadow_last_server_sequence',
  'last_server_sequence',
  'financial_v2_production_apply_before_activation',
  'SELECT activated_at FROM ledger_sync_state_v8',
  'db.withTransactionAsync',
]) assert(v8.includes(token), `missing V2 apply-body token: ${token}`);

for (const token of [
  'financial_v2_remote_cas_conflict',
  'financial_v2_remote_account_identity_conflict',
  'financial_v2_remote_currency_identity_conflict',
  'financial_v2_remote_fx_identity_conflict',
  'financial_v2_remote_posting_account_currency_mismatch',
  'financial_v2_remote_idempotency_conflict',
  'exact_local_echo',
  "apply_status='conflict'",
  'v2ExactLocalEcho',
  'v2PreflightMutation',
]) assert(repo.includes(token), `missing atomic V2 helper/invariant token: ${token}`);

assert.match(v8, /for \(const item of group\) plans\.push\(await v2PreflightMutation/,
  'whole command must be preflighted before production writes');
assert.match(v8, /await db\.withTransactionAsync\(async \(\) => \{[\s\S]*v2ApplyFinancialTransactionPlan[\s\S]*v2WriteInboxCommand[\s\S]*last_server_sequence/,
  'financial writes + inbox + production cursor must share a SQLite transaction');
assert.match(v8, /if \(shadowMode\)[\s\S]*v2WriteInboxCommand\(db, identity, group, 'observed'/,
  'shadow mode must only observe commands');

for (const token of [
  'allowProductionApply = false',
  'shadow: allowProductionApply !== true',
  'allowProductionApply,',
  "applyMode: allowProductionApply ? 'production' : 'shadow'",
  'applied.processed ?? applied.applied',
  'readFinancialSyncProtocolV8',
  'financial_v2_production_apply_before_activation',
]) assert(client.includes(token), `missing V2 client mode token: ${token}`);

for (const token of [
  'allowProductionApply: false',
  'allowProductionApply: true',
  'applying_v2_production',
  'active_recovery_required',
  'v2RecoveryRequired: true',
  'financial_v2_production_apply_not_quiescent',
  'financial_v2_preactivation_production_cursor_recovery_required',
]) assert(sync.includes(token), `missing activation/catchup token: ${token}`);

const activationIndex = sync.indexOf('const activated = await activateFinancialSyncProtocolV2V8');
const productionIndex = sync.indexOf("status: 'applying_v2_production'", activationIndex);
const productionCallIndex = sync.indexOf('allowProductionApply: true', productionIndex);
assert(activationIndex >= 0 && productionIndex > activationIndex && productionCallIndex > productionIndex,
  'durable activation must precede production remote apply');

const clientBarrierIndex = client.indexOf("if (allowProductionApply === true)");
const clientCloudIndex = client.indexOf('cloud = await resolveCloudLedgerV2');
assert(clientBarrierIndex >= 0 && clientCloudIndex > clientBarrierIndex,
  'production sync must verify durable activation before cloud I/O');

assert(repo.includes('financial_v2_activation_production_cursor_not_zero'));
assert(repo.includes('shadow_last_server_sequence=MAX'));
assert(repo.includes('requiresV2Recovery: !row?.activated_at'));

for (const [text, token] of [
  [authority, 'P19_012_013_AUTHORITY_REGISTRATION'],
  [protocol, 'P19_012_013_RECOVERY_ATOMIC_APPLY_CONTRACT'],
  [addendum, 'P19_013_ATOMIC_V2_REMOTE_APPLY'],
  [evidence, 'P19-013 Atomic Protocol V2 Remote Apply Evidence'],
  [gate, 'p19-013-atomic-v2-remote-apply.test.cjs'],
  [gate, 'run-p19-013-atomic-v2-model.cjs'],
]) assert(text.includes(token), `missing P19-013 evidence/gate token: ${token}`);

assert(evidence.includes('SQLite schema version: 8'));
assert(evidence.includes('Financial values changed by patch: NO'));
assert(evidence.includes('Supabase DDL migration: NO'));
assert(evidence.includes('Real-device acceptance: PENDING'));
assert(build.includes('MYFI-P19-013-internal.apk'));
assert(install.includes('MYFI-P19-013-internal.apk'));

console.log('MYFI P19-013 ATOMIC V2 REMOTE APPLY CONTRACT: PASSED');
