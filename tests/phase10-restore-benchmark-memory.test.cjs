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

console.log('MYFI P10-014A LOCAL STRATEGY B DEVICE HARNESS CONTRACT: PASS');
