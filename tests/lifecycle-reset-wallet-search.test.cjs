const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const repo = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

const history = read('src/screens/HistoryScreen.js');
assert(history.includes('const HistoryControls ='), 'History controls must be a stable component type');
assert(history.includes('<HistoryControls'), 'History must render stable controls outside the virtualized list');
assert(history.includes('<SectionList'), 'History must use a sectioned virtualized list');
assert(!history.includes('ListHeaderComponent={renderHeader}'), 'Old remounting History header must stay removed');

const addModal = read('src/components/AddTransModal.js');
assert(addModal.includes("const launchingCommitment = cleanInitialMode === 'commitment' || !!initialCommitmentId;"), 'Default wallet launch guard missing');
assert(addModal.includes('setWalletId(defaultWalletId);'), 'New entries, including commitment payments, must start on the current default wallet');

const trackers = read('src/screens/TrackersLabScreen.js');
assert(trackers.includes("{ key: 'ended', label: T.ended"), 'Ended tracker filter missing');
assert(trackers.includes('isTrackerPastGracePeriod'), '7-day tracker grace logic missing');
assert(trackers.includes('archiveTrackersMany'), 'Safe completed-tracker archival missing');
assert(trackers.includes('reservedGoalNeedsRelease'), 'Completed reserve goals must be released before removal');
assert(trackers.includes('const reservedGoals = chosen.filter'), 'Batch tracker removal must protect completed reserve goals');


const trackersSlice = read('src/store/slices/trackersSlice.js');
assert(trackersSlice.includes('allocationReleased: true'), 'Releasing a goal must preserve allocation history instead of deleting it');
const walletsLib = read('src/lib/wallets.js');
assert(walletsLib.includes('tx?.allocationReleased'), 'Released allocations must stop reserving wallet balance');
const calc = read('src/utils/calc.js');
assert(calc.includes("!d.archivedAt"), 'Archived debts must be excluded from current debt summary');
assert(calc.includes("!['released', 'settled'].includes(g.status)"), 'Released/settled goals must be excluded from current goal summary');
const modules = read('src/lib/modules.js');
assert(modules.includes('filter(item => !item.archivedAt)'), 'Archived entities must stay out of current feature views');
assert(modules.includes("!['released', 'settled'].includes(item.status)"), 'Terminal goals must stay out of current dashboard entities');

const management = read('src/store/slices/managementSlice.js');
assert(management.includes('archiveTracker: async'), 'archiveTracker store action missing');
assert(management.includes('archiveTrackersMany: async'), 'archiveTrackersMany store action missing');


const txSlice = read('src/store/slices/transactionsSlice.js');
assert(txSlice.includes('force: financialDataCount(get()) === 0'), 'Deleting the final financial item must persist an authoritative empty vault');

const dataSlice = read('src/store/slices/dataSlice.js');
assert(dataSlice.includes('clearVaultSnapshot(targetNamespace)'), 'Reset must clear encrypted vault and backups for current and guest namespaces');
assert(dataSlice.includes('clearVaultSnapshot(syncBaseNamespace(targetNamespace))'), 'Reset must clear stale sync-base snapshots');
assert(dataSlice.includes('GUEST_NAMESPACE'), 'Signed-in reset must also clear stale guest workspace data');
assert(dataSlice.includes('MYFI_INTENTIONAL_RESET_V1'), 'Intentional-reset tombstone missing');
assert(dataSlice.includes('stripPerformanceCfg'), 'Reset must remove performance/demo flags from the clean workspace');
assert(dataSlice.includes('resetAll verification failed'), 'Post-reset verification missing');
assert(dataSlice.includes('financialDataCount(snapshot?.data || snapshot)'), 'Reset must re-read the vault and verify no financial data survived');
assert(dataSlice.includes('financial_v7_reset_cutover_failed'), 'Reset must rebuild and verify the empty SQLite V7 cutover immediately');

const syncSlice = read('src/store/slices/useSyncSlice.js');
assert(syncSlice.includes('legacyRecoveryDisabled'), 'Legacy recovery tombstone enforcement missing');
assert(syncSlice.includes('const allowLegacyRecovery = allowLegacy && !resetMarker?.legacyRecoveryDisabled;'), 'Intentional empty snapshots must suppress legacy recovery via reset tombstone');
assert(syncSlice.includes('const demoSnapshot = resetMarker?.legacyRecoveryDisabled'), 'Intentional reset must suppress stale performance snapshots before local hydrate');
assert(syncSlice.includes('pendingCloudSync'), 'Pending cloud reset enforcement missing');
assert(syncSlice.includes('financialDataCount(get()) === 0'), 'Cloud must respect explicit empty reset');
assert(syncSlice.includes('supersededByReset'), 'Older queued sync operations must not overwrite a newer reset');
assert(syncSlice.includes('SYNC_MAX_ATTEMPTS = 4') && syncSlice.includes('attempt < SYNC_MAX_ATTEMPTS'), 'Cloud conflicts must use the bounded revision-aware retry policy');

const vault = read('src/lib/secureVault.js');
assert(vault.includes("LEGACY_PREVIOUS_SUFFIX = ':previous'"), 'Legacy previous snapshot cleanup missing');
assert(vault.includes("${key}${PREVIOUS_SUFFIX}:1"), 'Vault backup rotation missing');
assert(vault.includes('LEGACY_PREVIOUS_SUFFIX}`]'), 'Vault clear should include legacy backup');

let lifecycleSource = read('src/lib/trackerLifecycle.js')
  .replace(/export const /g, 'const ')
  + '\nmodule.exports={TRACKER_COMPLETION_GRACE_DAYS,latestMovementDate,daysSinceISO,isTrackerPastGracePeriod,isSafelyArchivableTracker};';
const sandbox = { module: { exports: {} }, exports: {}, Date };
vm.runInNewContext(lifecycleSource, sandbox);
const life = sandbox.module.exports;

assert.strictEqual(life.TRACKER_COMPLETION_GRACE_DAYS, 7);
assert.strictEqual(life.latestMovementDate([{ date: '2026-01-01' }, { date: '2026-02-03' }]), '2026-02-03');
assert.strictEqual(life.isTrackerPastGracePeriod('2026-08-01', new Date('2026-08-08T12:00:00')), true);
assert.strictEqual(life.isTrackerPastGracePeriod('2026-08-02', new Date('2026-08-08T12:00:00')), false);
assert.strictEqual(life.isSafelyArchivableTracker({ kind: 'owed', status: 'done' }), true);
assert.strictEqual(life.isSafelyArchivableTracker({ kind: 'saving', status: 'done', source: { status: 'active' } }), false, 'Completed reserved goal must not be hidden before funds are released');
assert.strictEqual(life.isSafelyArchivableTracker({ kind: 'saving', source: { status: 'released' } }), true);
assert.strictEqual(life.isSafelyArchivableTracker({ kind: 'monthly', source: { repeatMonthly: false, lastPaidMonth: '2026-07' } }), true);
assert.strictEqual(life.isSafelyArchivableTracker({ kind: 'monthly', source: { repeatMonthly: true, lastPaidMonth: '2026-07' } }), false);

console.log('MYFI lifecycle/reset/default-wallet/history-search checks passed.');
