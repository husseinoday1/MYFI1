const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const helper = read('src/dev/performanceTestLedgerV7.js');
const data = read('src/store/slices/dataSlice.js');
const sync = read('src/store/slices/useSyncSlice.js');
const ledger = read('src/lib/financialLedgerV7Repository.js');
const archive = read('src/lib/localArchiveRepository.js');

must(helper.includes('runFinancialShadowMigrationV7'), 'performance V7 shadow migration is not wired');
must(helper.includes('runFinancialOperationalCutoverV7'), 'performance V7 operational cutover is not wired');
must(helper.includes('forceReplace: true'), 'performance cutover does not rebuild the requested tier');
must(helper.includes('getLedgerNamespace(workspaceNamespace'), 'performance cutover is not namespaced through the isolated ledger namespace');
must(helper.includes('getLedgerDataHealth'), 'performance V7 cutover has no post-promotion health proof');

must(data.includes('ensurePerformanceTestLedgerV7'), 'enterDemoMode does not use the V7 performance adapter');
must(!data.includes('replaceLedgerSnapshot'), 'dataSlice still has a direct V6 performance snapshot write');
must(data.includes('performance_test_requires_exit'), 'destructive reset is not blocked inside the performance workspace');
must(data.includes('performance_test_backup_disabled'), 'backup restore is not blocked inside the performance workspace');
must(data.includes('financialLedgerV7Migration: null'), 'exiting the performance workspace can leave stale migration evidence');
must(data.includes('dataHealth: null'), 'exiting the performance workspace can leave stale health evidence');
must(data.includes('dataHealth: performanceLedger.health || null'), 'enterDemoMode does not publish the V7 health result');
must(data.includes("const ready = cutover || (state?.source_mode === 'shadow' && !!state?.shadow_checksum)"), 'exiting the lab discards valid real-workspace shadow readiness');

const demoStart = sync.indexOf('if (demoSnapshot && demoCfg.demoMode === true && demoCfg.performanceTestMode === true)');
const demoEnd = sync.indexOf('\n      if (activeLedgerSupported()) {', demoStart);
must(demoStart >= 0 && demoEnd > demoStart, 'performance load branch could not be isolated');
const demoBranch = sync.slice(demoStart, demoEnd);
must(demoBranch.includes('ensurePerformanceTestLedgerV7'), 'loadLocal does not restore the demo snapshot through V7');
must(!demoBranch.includes('replaceLedgerSnapshot'), 'loadLocal demo branch still writes the V6 ledger');
must(demoBranch.includes('financialLedgerV7Cutover: performanceLedger.cutover === true'), 'demo load does not publish the verified V7 cutover state');
must(!demoBranch.includes("throw new Error(performanceLedger.reason || 'performance_v7_bootstrap_failed')"), 'performance bootstrap failure is misclassified as an unreadable real vault');
must(demoBranch.includes('lastSyncError: performanceLedgerError'), 'performance bootstrap failure is not surfaced without touching the real vault');
must(demoBranch.includes('readFinancialWorkspaceV7'), 'same-count performance edits can leave Zustand behind the V7 source of truth');
must(demoBranch.includes('stateFromFinancialV7'), 'the persisted performance cache is not hydrated from an already-cut-over V7 ledger');

must(ledger.includes('isPerformanceTestNamespaceV13'), 'performance namespace transport guard is missing');
must(ledger.includes('if (isPerformanceTestNamespaceV13(namespace)) return null;'), 'V3 outbox writes are not blocked for performance data');
must(ledger.includes('DELETE FROM ledger_outbox_v3 WHERE namespace=?'), 'performance namespace cleanup does not remove V3 transport residue');
must(
  archive.includes("const isPrivateArchiveNamespaceV13 = namespace => String(namespace || '').endsWith('::performance-test')"),
  'performance archive writes can create a live sync identity',
);

console.log('MYFI PERFORMANCE V7 CUTOVER CONTRACT: PASSED');
