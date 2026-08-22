const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const source = fs.readFileSync(path.join(root, 'src', 'dev', 'phase10RestoreBenchmarkHarness.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'src', 'dev', 'p10_014aCloneProbeEntry.js'), 'utf8');
const ledgerDb = fs.readFileSync(path.join(root, 'src', 'lib', 'ledgerDatabase.js'), 'utf8');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'p10-014a-local-strategy-b-device-gate.yml'),
  'utf8',
);
const allowlist = fs.readFileSync(path.join(root, '.github', 'p10-014a-allowed-source.txt'), 'utf8');

// Production Strategy B/V13 only; never retired V7 benchmark promotion.
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
  assert.equal(source.includes(forbidden), false, `R5 harness must not contain ${forbidden}`);
}

for (const required of [
  "P10_014A_GATE = 'LOCAL_STRATEGY_B_ACCEPTANCE'",
  "P10_014B_GATE = 'CLOUD_HANDSHAKE_ACCEPTANCE'",
  "SYNTHETIC_SERVER_PROOF_SOURCE = 'synthetic_dev_only'",
  "P10_014A_CLONE_PROBE_FLAG = process.env.EXPO_PUBLIC_P10_014A_CLONE_PROBE === '1'",
  "P10_014A_CLONE_MARKER_KEY = 'p10_014a_clone_database_marker'",
  'assertCloneDatabaseBinding',
  'clone_database_marker_missing',
  "guardMode: 'original_package_clone_database'",
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
  '[P10_014A_PROMOTION_PRECONDITION]',
  'immutableIntentMatch',
  'intentServerEpochProven',
  'checkpointReady',
  'stageSourceModeShadow',
  'stageSchemaVersion7',
  'cleanupErrorCaught',
  "patchId: 'P10-014A-001-R5.2'",
  'cloneDatabaseOnly: P10_014A_CLONE_PROBE_FLAG',
  'originalDatabaseMutationByHarness: false',
  "memoryEvidence: 'EXTERNAL_ADB_REQUIRED'",
]) {
  assert(source.includes(required), `R5 harness missing: ${required}`);
}

for (const required of [
  "import * as SQLite from 'expo-sqlite'",
  "import * as FileSystem from 'expo-file-system/legacy'",
  'FileSystem.getInfoAsync(sourceUri)',
  "PRAGMA query_only = ON",
  "PRAGMA query_only",
  'SQLite.backupDatabaseAsync',
  "sourceDatabaseName: 'main'",
  "destDatabaseName: 'main'",
  'source.closeAsync()',
  'setP10CloneLedgerDbOverride(clone)',
  "await import('./phase10RestoreBenchmarkHarness')",
  'clearP10CloneLedgerDbOverride(clone)',
  'SQLite.deleteDatabaseAsync(cloneName, SQLite.defaultDatabaseDirectory)',
  "CLONE_MARKER_KEY = 'p10_014a_clone_database_marker'",
  '__MYFI_P10_014A_CLONE_NONCE__',
  "sourceConnectionNotPristine".replace('sourceConnectionNotPristine','p10_clone_probe_source_connection_not_pristine'),
  '[P10_014A_CLONE_PROBE]',
]) {
  assert(entry.includes(required), `R5 clone entry missing: ${required}`);
}
assert.equal(entry.includes("import '../../index'"), false, 'R5 clone probe must not import normal app root');
assert.equal(entry.includes("from '../store/useStore'"), false, 'R5 clone probe must not import store');
assert.equal(entry.toLowerCase().includes('supabase'), false, 'R5 clone probe must not import Supabase');
assert(
  entry.indexOf('source.closeAsync()') < entry.indexOf('setP10CloneLedgerDbOverride(clone)'),
  'Original source DB must be closed before clone becomes the application DB',
);
assert(
  entry.indexOf('setP10CloneLedgerDbOverride(clone)') < entry.indexOf("await import('./phase10RestoreBenchmarkHarness')"),
  'Clone override must be active before harness import',
);

for (const required of [
  "P10_014A_CLONE_PROBE_FLAG = process.env.EXPO_PUBLIC_P10_014A_CLONE_PROBE === '1'",
  'setP10CloneLedgerDbOverride',
  'clearP10CloneLedgerDbOverride',
  "throw new Error('p10_clone_database_override_disabled')",
  'if (p10CloneDiagnosticDb) return p10CloneDiagnosticDb',
  'p10CloneDiagnosticDb ? Promise.resolve(p10CloneDiagnosticDb) : dbPromise',
]) {
  assert(ledgerDb.includes(required), `R5 ledger DB override missing: ${required}`);
}

// getLedgerDb default open path must remain present and must follow the diagnostic short-circuit.
assert(ledgerDb.includes("SQLite.openDatabaseAsync(LEDGER_DB_NAME)"), 'Normal ledger open path must remain intact');
assert(
  ledgerDb.indexOf('if (p10CloneDiagnosticDb) return p10CloneDiagnosticDb')
    < ledgerDb.indexOf("SQLite.openDatabaseAsync(LEDGER_DB_NAME)"),
  'Diagnostic clone must short-circuit before normal DB initialization',
);

for (const required of [
  'P10-014A Original Package Clone Probe APK',
  "pkg.main='src/dev/p10_014aCloneProbeEntry.js'",
  "applicationId 'com.myfi.app'",
  'EXPO_PUBLIC_P10_014A_CLONE_PROBE=1',
  'EXPO_PUBLIC_FRESH_TEST=0',
  'OriginalDatabaseMode=PREVERIFIED_FILE_URI_THEN_QUERY_ONLY_LOGICAL_IMMUTABILITY_SOURCE',
  'HarnessDatabase=DISPOSABLE_SQLITE_BACKUP_CLONE',
  'OriginalDatabaseMutationByHarness=NO',
  'OriginalInstalledApkMustBeBackedUpByDeviceRunner=YES',
  'P10-014A-original-package-clone-probe-R5-2',
]) {
  assert(workflow.includes(required), `R5 workflow missing: ${required}`);
}
assert.equal(
  workflow.includes('gradle.replace(needle,"applicationId \'com.myfi.app.p10a\'")')
    || workflow.includes("gradle.replace(needle,\"applicationId 'com.myfi.app.p10a'\")"),
  false,
  'R5 workflow must never replace the original applicationId with the isolated p10a package',
);
assert.equal(
  workflow.includes('EXPO_PUBLIC_FRESH_TEST=1'),
  false,
  'R5 same-package clone probe must not use FRESH_TEST',
);

for (const required of [
  'src/dev/phase10RestoreBenchmarkHarness.js',
  'src/dev/p10_014aDiagnosticEntry.js',
  'src/dev/p10_014aCloneProbeEntry.js',
  'src/lib/ledgerDatabase.js',
]) {
  assert(allowlist.includes(required), `R5 allowlist missing ${required}`);
}


for (const required of [
  "const toFileUri = value =>",
  "raw.startsWith('file://')",
  "if (raw.startsWith('/')) return `file://${raw}`",
  "const databaseHandleUri = database => toFileUri(database?.databasePath)",
  "{ useNewConnection: true }",
  "p10_clone_probe_source_database_path_mismatch",
  "p10_clone_probe_clone_database_path_mismatch",
]) {
  assert(entry.includes(required), `R5.2 path-resolution contract missing: ${required}`);
}
assert(
  entry.indexOf('const sourceInfoBefore = await FileSystem.getInfoAsync(sourceUri)')
    < entry.indexOf('source = await SQLite.openDatabaseAsync'),
  'R5.2 must verify source existence before SQLite open/create',
);
assert(
  entry.indexOf('p10_clone_probe_source_database_path_mismatch')
    < entry.indexOf("PRAGMA query_only = ON"),
  'R5.2 must bind opened source handle to preverified path before query-only work',
);

for (const required of [
  "PRAGMA data_version",
  "PRAGMA page_count",
  "PRAGMA freelist_count",
  "sourceFileMetadataObservation",
  "changedBeforeClose",
  "changedOnClose",
  "p10_clone_probe_source_database_missing_before_close",
  "p10_clone_probe_source_database_missing_after_close",
]) {
  assert(entry.includes(required), `R5.2 logical immutability contract missing: ${required}`);
}
assert.equal(
  entry.includes('p10_clone_probe_source_file_changed_during_backup'),
  false,
  'R5.2 must not treat WAL close-time main-file metadata changes as financial mutation',
);
const r52BackupIndex = entry.indexOf('SQLite.backupDatabaseAsync');
const r52PostBackupDataVersionIndex = entry.indexOf(
  "const sourceDataVersionAfter = Number(scalar(await source.getFirstAsync('PRAGMA data_version')) || 0);",
);
assert(
  r52BackupIndex >= 0 && r52PostBackupDataVersionIndex > r52BackupIndex,
  'R5.2 must retain backup API before post-backup logical revalidation',
);
for (const required of [
  'SourceImmutabilityVerification=QUERY_ONLY_TOTAL_CHANGES_DATA_VERSION_SCHEMA_PAGE_INVARIANTS',
  'WALCloseFileMetadata=OBSERVATIONAL_NOT_MUTATION_GATE',
]) {
  assert(workflow.includes(required), `R5.2 workflow evidence missing: ${required}`);
}

console.log('MYFI P10-014A R5.2 WAL-AWARE LOGICAL IMMUTABILITY CLONE PROBE CONTRACT: PASS');
