const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const source = fs.readFileSync(path.join(root, 'src', 'dev', 'phase10RestoreBenchmarkHarness.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'src', 'dev', 'p10_014aCloneProbeEntry.js'), 'utf8');
const cloneArtifactsPath = path.join(root, 'src', 'dev', 'p10_014aCloneArtifacts.js');
const cloneArtifactsSource = fs.readFileSync(cloneArtifactsPath, 'utf8');
const ledgerDb = fs.readFileSync(path.join(root, 'src', 'lib', 'ledgerDatabase.js'), 'utf8');
const promotion = fs.readFileSync(path.join(root, 'src', 'lib', 'financialRestorePromotionV13.js'), 'utf8');
const ledgerModel = fs.readFileSync(path.join(root, 'src', 'lib', 'financialLedgerV7Model.js'), 'utf8');
const p10AtomicTest = fs.readFileSync(path.join(root, 'tests', 'run-p10-013-atomic-undo-promotion-v13.cjs'), 'utf8');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'p10-014a-local-strategy-b-device-gate.yml'),
  'utf8',
);
const allowlist = fs.readFileSync(path.join(root, '.github', 'p10-014a-allowed-source.txt'), 'utf8');

// Production schema-version ownership must match the real runtime module graph.
assert(
  /import\s*\{\s*FINANCIAL_LEDGER_SCHEMA_VERSION\s*\}\s*from '\.\/financialLedgerV7Model';/.test(promotion),
  'Promotion must import FINANCIAL_LEDGER_SCHEMA_VERSION from financialLedgerV7Model',
);
assert.equal(
  /import\s*\{[\s\S]*?FINANCIAL_LEDGER_SCHEMA_VERSION[\s\S]*?\}\s*from '\.\/financialLedgerV7Repository';/.test(promotion),
  false,
  'Promotion must not import FINANCIAL_LEDGER_SCHEMA_VERSION from financialLedgerV7Repository',
);
assert(
  ledgerModel.includes('export const FINANCIAL_LEDGER_SCHEMA_VERSION = 7;'),
  'financialLedgerV7Model must own schema version 7',
);
assert.equal(
  p10AtomicTest.includes('module.exports = { FINANCIAL_LEDGER_SCHEMA_VERSION, FINANCIAL_LEDGER_V7_SCHEMA_SQL'),
  false,
  'P10-013 harness must not invent a repository export for FINANCIAL_LEDGER_SCHEMA_VERSION',
);

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
  'readCanonicalRowBatchV3',
  'diagnosticSectionDigest',
  'diagnosePostPromotionMismatch',
  '[P10_014A_POST_PROMOTION_DIFF]',
  'countFailedSections',
  'semanticFailedSections',
  'topLevelOrFraming',
  'proveRestoreNamespaceSqlV13',
  'captureRestoreStartSnapshotInTransactionV13',
  'guardRestoreSourceBeforeEpochRpcInTransactionV13',
  'createStrategyBRestoreIntentV13InTransaction',
  'recordStrategyBServerProofV13InTransaction',
  'promoteCanonicalRestoreStageV13',
  'runFinancialMaintenanceTask',
  'runFinancialRestorePromotionTransactionV8',
  '[P10_014A_PROMOTION_PRECONDITION]',
  '[P10_014A_PRECONDITION_DIFF]',
  '[P10_014A_PRE_PROMOTION_EXACT]',
  '[P10_014A_PROMOTION_POSTFAIL_DIFF]',
  'failedFields',
  'normalizeCanonicalRestoreProofCountsV13',
  'rebind_intent_delete_failed',
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
  "from './p10_014aCloneArtifacts'",
  'isOwnedCloneDatabaseName(cloneName)',
  'sweepOwnedCloneArtifacts({',
  "console.info(LOG, 'ORPHAN_CLONE_SWEEP'",
  'orphanCloneCleanupVerified: orphanSweep.cleanupVerified',
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
  "setStatus({ label: 'FAIL', code })",
  "backgroundColor: '#ffffff'",
  '{status.code}',
]) {
  assert(entry.includes(required), `R5 clone entry missing: ${required}`);
}
assert.equal(entry.includes("import '../../index'"), false, 'R5 clone probe must not import normal app root');
assert.equal(entry.includes("from '../store/useStore'"), false, 'R5 clone probe must not import store');
assert.equal(entry.toLowerCase().includes('supabase'), false, 'R5 clone probe must not import Supabase');
assert(
  entry.indexOf('await sweepCloneArtifacts()') < entry.indexOf('const sourceUri = databaseUri(LEDGER_DB_NAME)'),
  'Orphan clone artifacts must be removed before the source database is opened',
);

const compiledCloneArtifacts = cloneArtifactsSource
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ')
  + '\nmodule.exports = { P10_014A_CLONE_DATABASE_NAME_PATTERN, P10_014A_CLONE_DATABASE_ARTIFACT_PATTERN, isOwnedCloneDatabaseName, sweepOwnedCloneArtifacts };';
const cloneArtifactsModule = { exports: {} };
new Function('module', 'exports', compiledCloneArtifacts)(cloneArtifactsModule, cloneArtifactsModule.exports);
const cloneArtifacts = cloneArtifactsModule.exports;

assert.equal(cloneArtifacts.isOwnedCloneDatabaseName('p10-014a-r5-clone-1724450000000-ab12cd34.db'), true);
assert.equal(cloneArtifacts.isOwnedCloneDatabaseName('myfi-ledger-v2.db'), false);
assert.equal(cloneArtifacts.isOwnedCloneDatabaseName('../p10-014a-r5-clone-1724450000000-ab12cd34.db'), false);

const runCloneArtifactRuntime = async () => {
  const ownedBase = 'p10-014a-r5-clone-1724450000000-ab12cd34.db';
  const files = new Set([
    'myfi-ledger-v2.db',
    'unrelated.db',
    ownedBase,
    `${ownedBase}-wal`,
    `${ownedBase}-shm`,
    `${ownedBase}-journal`,
    'p10-014a-r5-clone-invalid.db',
  ]);
  const deleted = [];
  const fileSystem = {
    readDirectoryAsync: async () => [...files],
    deleteAsync: async uri => {
      const name = String(uri).split('/').pop();
      deleted.push(name);
      files.delete(name);
    },
  };
  const sweepResult = await cloneArtifacts.sweepOwnedCloneArtifacts({
    fileSystem,
    directoryUri: 'file:///data/user/0/com.myfi.app/databases',
    sourceDatabaseName: 'myfi-ledger-v2.db',
  });
  assert.deepEqual(deleted.sort(), [ownedBase, `${ownedBase}-journal`, `${ownedBase}-shm`, `${ownedBase}-wal`].sort());
  assert.equal(files.has('myfi-ledger-v2.db'), true, 'Source DB must survive clone cleanup');
  assert.equal(files.has('unrelated.db'), true, 'Unrelated DB must survive clone cleanup');
  assert.deepEqual(sweepResult, { artifactCount: 4, cleanupVerified: true });

  await assert.rejects(
    cloneArtifacts.sweepOwnedCloneArtifacts({
      fileSystem: {
        readDirectoryAsync: async () => [ownedBase],
        deleteAsync: async () => {},
      },
      directoryUri: 'file:///data/user/0/com.myfi.app/databases',
      sourceDatabaseName: 'myfi-ledger-v2.db',
    }),
    /p10_clone_probe_orphan_sweep_failed/,
  );
  await assert.rejects(
    cloneArtifacts.sweepOwnedCloneArtifacts({
      fileSystem: {
        readDirectoryAsync: async () => [ownedBase],
        deleteAsync: async () => {},
      },
      directoryUri: 'file:///data/user/0/com.myfi.app/databases',
      sourceDatabaseName: ownedBase,
    }),
    /p10_clone_probe_orphan_sweep_scope_invalid/,
  );
};
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

// P10-014A evidence must stay in the dev harness: the production promotion
// module keeps its fail-closed condition without device-probe diagnostics.
for (const forbidden of [
  'P10_014A_CLONE_PROBE_DIAGNOSTICS',
  'promotionPreconditionDiagnosticChecks',
  'promotionPreconditionFailedFields',
  '[P10_014A_PRODUCTION_PRECONDITION_DIFF]',
  'guardDigestPrefix',
  'immutableIntentCompositeMatch',
  'stageSchemaVersionMatch',
]) {
  assert.equal(promotion.includes(forbidden), false, `Production promotion must not contain P10-014A diagnostic: ${forbidden}`);
}

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
  'P10-014A-original-package-clone-probe-R5-3',
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
  'src/lib/financialRestorePromotionV13.js',
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
assert.equal(
  entry.includes('cloneSchemaVersion !== sourceFingerprintBefore.schemaVersion'),
  false,
  'R5.2 must not compare the destination schema cookie to the source after SQLite Online Backup',
);
for (const required of [
  'cloneUserVersion !== sourceFingerprintBefore.userVersion',
  'clonePageCount !== sourceFingerprintBefore.pageCount',
  'Number(cloneLedgerSchemaRow?.value) !== sourceFingerprintBefore.ledgerSchemaVersion',
  'Number(cloneSqliteSchemaRow?.value) !== sourceFingerprintBefore.sqliteSchemaVersion',
]) {
  assert(entry.includes(required), `R5.2 clone logical verification missing: ${required}`);
}
for (const required of [
  'SourceImmutabilityVerification=QUERY_ONLY_TOTAL_CHANGES_DATA_VERSION_SCHEMA_PAGE_INVARIANTS',
  'WALCloseFileMetadata=OBSERVATIONAL_NOT_MUTATION_GATE',
  'CloneSchemaVerification=LOGICAL_APP_SCHEMA_AND_PAGE_INVARIANTS_DEST_SCHEMA_COOKIE_EXCLUDED',
]) {
  assert(workflow.includes(required), `R5.2 workflow evidence missing: ${required}`);
}

// Core evidence is assembled outside the maintenance callback; preserve the
// precondition evidence in runTier scope rather than shadowing it in the callback.
const finalFenceIndex = source.indexOf('const localFenceStarted = nowMs();');
const maintenanceCallIndex = source.indexOf('await runFinancialMaintenanceTask({', finalFenceIndex);
const callbackConfigIndex = source.indexOf("presentation: 'blocking',", maintenanceCallIndex);
const maintenanceCallbackIndex = source.indexOf('}, async () => {', callbackConfigIndex);
const outerPreconditionsIndex = source.lastIndexOf('let promotionPreconditions = null;', maintenanceCallIndex);
const innerPreconditionsAssignmentIndex = source.indexOf(
  'promotionPreconditions = await readPromotionPreconditionEvidence({',
  maintenanceCallbackIndex,
);
const outerEvidenceReferenceIndex = source.indexOf('promotionPreconditions,', innerPreconditionsAssignmentIndex);
assert(
  finalFenceIndex >= 0
    && maintenanceCallIndex > finalFenceIndex
    && maintenanceCallbackIndex > maintenanceCallIndex
    && outerPreconditionsIndex >= 0
    && outerPreconditionsIndex < maintenanceCallIndex,
  'R5 harness must declare promotionPreconditions in runTier scope before the maintenance callback',
);
const callbackToEvidenceInterval = source.slice(
  maintenanceCallbackIndex,
  outerEvidenceReferenceIndex,
);
const lexicalPromotionPreconditionsBinding = /^[\t ]*(?:let|const|var)\s+promotionPreconditions\b/m;
assert(
  innerPreconditionsAssignmentIndex > maintenanceCallbackIndex
    && /^[\t ]*promotionPreconditions\s*=\s*await readPromotionPreconditionEvidence\(/m
      .test(callbackToEvidenceInterval),
  'R5 harness must assign outer promotionPreconditions inside the maintenance callback',
);
assert.equal(
  lexicalPromotionPreconditionsBinding.test(callbackToEvidenceInterval),
  false,
  'R5 harness must not lexically bind promotionPreconditions inside the maintenance callback',
);
for (const declarationKind of ['const', 'var']) {
  const mutatedSource = source.replace(
    'promotionPreconditions = await readPromotionPreconditionEvidence({',
    `${declarationKind} promotionPreconditions = await readPromotionPreconditionEvidence({`,
  );
  const mutatedInterval = mutatedSource.slice(
    maintenanceCallbackIndex,
    outerEvidenceReferenceIndex,
  );
  assert(
    lexicalPromotionPreconditionsBinding.test(mutatedInterval),
    `R5 harness contract must reject callback-scoped ${declarationKind} promotionPreconditions`,
  );
}
assert(
  outerEvidenceReferenceIndex > innerPreconditionsAssignmentIndex,
  'R5 harness core evidence must reference the prior outer promotionPreconditions value',
);

runCloneArtifactRuntime()
  .then(() => console.log('MYFI P10-014A R5.3 WAL-AWARE LOGICAL IMMUTABILITY CLONE PROBE CONTRACT: PASS'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
