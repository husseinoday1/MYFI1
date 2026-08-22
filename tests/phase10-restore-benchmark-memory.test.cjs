const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const source = fs.readFileSync(
  path.join(root, 'src', 'dev', 'phase10RestoreBenchmarkHarness.js'),
  'utf8',
);

// P10-014A must measure the reviewed Strategy B/V13 path, never the retired V7 benchmark path.
for (const forbidden of [
  'promoteFinancialWorkspaceStageV7',
  'stageFinancialWorkspaceV7',
  'buildFinancialShadowProjectionV7',
  'buildPerformanceTestWorkspaceAsync',
  "from '../lib/supabase'",
  "from '../lib/financialRestoreEpochV3Client'",
  'readFinancialProjectionV7',
  '.getAllAsync(',
]) {
  assert.equal(source.includes(forbidden), false, `P10-014A harness must not contain ${forbidden}`);
}

for (const required of [
  "P10_014A_GATE = 'LOCAL_STRATEGY_B_ACCEPTANCE'",
  "P10_014B_GATE = 'CLOUD_HANDSHAKE_ACCEPTANCE'",
  "SYNTHETIC_SERVER_PROOF_SOURCE = 'synthetic_dev_only'",
  "SYNTHETIC_PROOF_MARKER_PREFIX = 'p10_014a_synthetic_proof:'",
  "cloudHandshakeAcceptance: 'NOT_TESTED'",
  'syntheticProofCountsAsCloudEvidence: false',
  'syntheticProofDurablyLabeled',
  'recoveryMarkerFinalizedLast',
  'supabaseRpcCalledByGate: false',
  'productionRestoreWiring: false',
  'p10_012MigrationAppliedByGate: false',
  'copyBoundedFinancialNamespaceBatchInTransactionV13',
  'initializeRestoreCheckpointInTransactionV13',
  'copyNextRestoreCheckpointBatchInTransactionV13',
  'computeRestoreCheckpointProofV13',
  'markRestoreCheckpointReadyInTransactionV13',
  'semanticHashNamespaceV3Bounded',
  'proveRestoreNamespaceSqlV13',
  'captureRestoreStartSnapshotInTransactionV13',
  'guardRestoreSourceBeforeEpochRpcInTransactionV13',
  'createStrategyBRestoreIntentV13InTransaction',
  'recordStrategyBServerProofV13InTransaction',
  'promoteCanonicalRestoreStageV13',
  'runFinancialMaintenanceTask',
  'runFinancialRestorePromotionTransactionV8',
  'WITH RECURSIVE seq(n)',
  "memoryEvidence: 'EXTERNAL_ADB_REQUIRED'",
  "nextRequiredSubgate: 'P10-014A-002_FAULT_AND_RESOURCE_MATRIX'",
  '[P10_014A_TIER_RESULT]',
]) {
  assert(source.includes(required), `P10-014A harness missing required contract: ${required}`);
}

assert(
  source.includes('CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows')
  && source.includes('CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes'),
  'P10-014A must use the reviewed bounded row/byte policy for stage and checkpoint work',
);
assert(
  source.includes('incomingStageMaxBatchRows')
  && source.includes('incomingStageMaxBatchBytes')
  && source.includes('checkpointMaxBatchRows')
  && source.includes('checkpointMaxBatchBytes'),
  'P10-014A evidence must expose bounded-batch high-water metrics',
);
assert(
  source.includes('writerDrainMs')
  && source.includes('preRpcRevalidationMs')
  && source.includes('syntheticServerProofRecordMs')
  && source.includes('atomicPromotionMs')
  && source.includes('localFinalFenceMs'),
  'P10-014A must separate every local final-fence contribution',
);
assert(
  source.includes('cleanupVerified') && source.includes('sweepOrphanedRuns'),
  'P10-014A must prove cleanup and recover orphaned disposable runs',
);
assert(
  source.includes("'DELETE FROM ledger_v7_meta WHERE key=? AND value=?'")
  && source.includes('cleanup_recovery_marker_compare_and_swap_failed'),
  'P10-014A recovery marker must be finalized with CAS only after cleanup verification',
);
assert(
  source.includes('durableSyntheticEvidence')
  && source.includes('synthetic_proof_marker_write_failed')
  && source.includes('synthetic_proof_durable_label_missing'),
  'P10-014A synthetic proof must carry durable non-cloud evidence atomically with the production recorder',
);


const entry = fs.readFileSync(
  path.join(root, 'src', 'dev', 'p10_014aDiagnosticEntry.js'),
  'utf8',
);
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'p10-014a-local-strategy-b-device-gate.yml'),
  'utf8',
);
const allowlist = fs.readFileSync(
  path.join(root, '.github', 'p10-014a-allowed-source.txt'),
  'utf8',
);

for (const required of [
  "import '../../index'",
  "useStore.subscribe(maybeStart)",
  "state?.workspaceReady",
  "PHASE10_RESTORE_BENCHMARK_ENABLED",
  "runPhase10RestoreBenchmarkHarness()",
  "[P10_014A_DEVICE_GATE]",
]) {
  assert(entry.includes(required), `P10-014A diagnostic entry missing: ${required}`);
}
assert.equal(entry.includes("import '../../App'"), false, 'Diagnostic entry must use the normal root entry, not bypass app registration');
assert.equal(entry.includes('supabase'), false, 'Diagnostic entry must not import Supabase');

for (const required of [
  "pkg.main='src/dev/p10_014aDiagnosticEntry.js'",
  "applicationId 'com.myfi.app.p10a'",
  'MYFI P10-014A',
  'EXPO_PUBLIC_FRESH_TEST=1',
  'ProductionAppDataIsolated=YES',
  'DiagnosticEntry=src/dev/p10_014aDiagnosticEntry.js',
  'ApplicationId=com.myfi.app.p10a',
  'artifact@v4',
  'P10-014A-local-strategy-b-device-gate-R3',
]) {
  assert(workflow.includes(required), `P10-014A workflow missing isolated diagnostic build contract: ${required}`);
}
assert(
  allowlist.includes('src/dev/phase10RestoreBenchmarkHarness.js')
  && allowlist.includes('src/dev/p10_014aDiagnosticEntry.js'),
  'P10-014A allowlist must contain only the reviewed diagnostic source files',
);


for (const required of [
  "P10_014A_FRESH_TEST_FLAG = process.env.EXPO_PUBLIC_FRESH_TEST === '1'",
  "P10_014A_FRESH_TEST_NAMESPACE = 'fresh-test-new-user'",
  "workspaceNamespace === P10_014A_FRESH_TEST_NAMESPACE",
  "!state?.user?.id",
  "blockers.filter(blocker => blocker !== 'signed_in_account_required')",
  "guardMode: isolatedFreshTestGuest ? 'isolated_fresh_test_guest' : 'signed_in_disposable'",
  "signedInRequirementBypassed: isolatedFreshTestGuest",
  "bypassedBlocker: isolatedFreshTestGuest ? 'signed_in_account_required' : null",
  "otherBlockers: 0",
  "patchId: 'P10-014A-001-R3'",
  "disposableGuard",
]) {
  assert(source.includes(required), `P10-014A R3 narrow fresh-test guard missing: ${required}`);
}
assert(
  source.includes("const effectiveBlockers = isolatedFreshTestGuest")
  && source.includes(": blockers;"),
  'R3 must preserve all P19 disposable blockers outside the isolated fresh-test guest case',
);
console.log('MYFI P10-014A R3 FRESH-TEST GUARD CONTRACT: PASS');
