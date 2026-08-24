const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const coordinator = read('src/lib/financialRestoreProductionV13.js');
const data = read('src/store/slices/dataSlice.js');
const app = read('App.js');
const settings = read('src/screens/SettingsScreen.js');
const legacySettings = read('src/screens/SettingsLegacyScreen.js');
const packageFiles = read('src/lib/myfiFiles.js');

for (const token of [
  'decodeCanonicalBackupV11',
  'stageCanonicalRestoreV11',
  'captureRestoreStartSnapshotInTransactionV13',
  'initializeRestoreCheckpointInTransactionV13',
  'copyNextRestoreCheckpointBatchInTransactionV13',
  'markRestoreCheckpointReadyInTransactionV13',
  'guardRestoreSourceBeforeEpochRpcInTransactionV13',
  'createStrategyBRestoreIntentV13InTransaction',
  'recordStrategyBServerProofV13InTransaction',
  'promoteCanonicalRestoreStageV13',
  'initializeReferencedUndoStageInTransactionV13',
  'markReferencedUndoStageReadyInTransactionV13',
  'markCanonicalRestoreActivatedV13',
]) assert(coordinator.includes(token), `production coordinator missing ${token}`);

const ordered = [
  'await prepareImportedStage',
  'await buildCheckpoint',
  'await createIntent',
];
const startBody = coordinator.slice(coordinator.indexOf('export const startCanonicalRestoreProductionV13'));
for (let index = 1; index < ordered.length; index += 1) {
  assert(startBody.indexOf(ordered[index - 1]) < startBody.indexOf(ordered[index]),
    `production restore order regressed: ${ordered[index - 1]} -> ${ordered[index]}`);
}
assert(startBody.indexOf('await createIntent') < startBody.lastIndexOf('return continuePrepared'),
  'prepared restore must continue only after the durable V13 intent exists');
const continueBody = coordinator.slice(
  coordinator.indexOf('const continuePrepared'),
  coordinator.indexOf('export const startCanonicalRestoreProductionV13'),
);
assert(continueBody.indexOf('adapters.advanceRestoreEpoch') < continueBody.indexOf('recordStrategyBServerProofV13InTransaction'),
  'server proof may only be persisted after the proof-bound RPC result');
assert(continueBody.indexOf('recordStrategyBServerProofV13InTransaction') < continueBody.indexOf('promoteCanonicalRestoreStageV13'),
  'local promotion must remain after durable server proof');
assert.match(coordinator, /acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL/,
  'production preflight must reject every pending current-epoch mutation');
assert.match(coordinator, /activeProtocolVersion !== 2/,
  'production restore must require active protocol V2');
assert.doesNotMatch(coordinator, /Crypto\.randomUUID|console\.(?:log|info|warn|error)/,
  'production coordinator must use the shared UUID helper and never log restore payloads');

assert.match(data, /createCanonicalBackupV11/,
  'signed-in production export must use canonical SQLite V11');
assert.match(data, /startCanonicalRestoreProductionV13/,
  'Settings restore must enter the production V13 coordinator');
assert.match(data, /triggerKind: 'undo'/,
  'Restore rollback must use the same V13 engine as Undo');
assert.match(data, /activateFinancialSyncV2\(\)/,
  'local promotion must be followed by V2 bootstrap/readback/shadow activation');
assert.match(data, /markCanonicalRestoreActivatedV13/,
  'V2 activation must be persisted into restore completion evidence');
assert.match(data, /resumeCanonicalRestoreProductionV13/,
  'interrupted production restore must have a durable resume path');
assert.match(app, /resumeCanonicalRestoreProduction\?\.\(\)[\s\S]*blockedByRestore[\s\S]*if \(active && !blockedByRestore\) loadCloud\(\);/,
  'startup must resume restore before ordinary cloud load');
assert.match(app, /result\?\.pending === true[\s\S]*result\?\.promoted === true && result\?\.ok === false/,
  'ordinary startup sync must remain blocked while exact restore recovery or activation is pending');
assert.match(settings, /decodeCanonicalBackupV11/);
assert.match(legacySettings, /decodeCanonicalBackupV11/);
assert.match(packageFiles, /import \{ decodeCanonicalBackupV11 \} from '\.\/financialBackupV11Decoder';/);
assert.match(packageFiles, /data\?\.kind !== 'myfi_canonical_financial_backup'/);
assert.match(packageFiles, /const decoded = decodeCanonicalBackupV11\(data\);/);
assert.match(packageFiles, /const validation = inspectPackagedBackupData\(payload\.data\);/);

console.log('MYFI P10 PRODUCTION RESTORE WIRING CONTRACT: PASS');
