const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const config = read('src/dev/performanceTestConfig.js');
const perf = read('src/dev/performanceTestData.js');
const data = read('src/store/slices/dataSlice.js');
const settings = read('src/screens/SettingsScreen.js');
const sync = read('src/store/slices/useSyncSlice.js');
const storage = read('src/dev/performanceTestStorage.js');

const fail = msg => { throw new Error(msg); };
const must = (value, msg) => { if (!value) fail(msg); };

['200', '1000', '5000', '10000', '25000'].forEach(id => {
  must(config.includes(`id: '${id}'`), `missing performance tier ${id}`);
});
must(/transactions:\s*200\b/.test(config), 'tier 200 count missing');
must(/transactions:\s*1000\b/.test(config), 'tier 1000 count missing');
must(/transactions:\s*5000\b/.test(config), 'tier 5000 count missing');
must(/transactions:\s*10000\b/.test(config), 'tier 10000 count missing');
must(/transactions:\s*25000\b/.test(config), 'tier 25000 count missing');
must(!perf.includes('Math.random'), 'performance fixtures must be deterministic, not random');
must(perf.includes('while (rows.length < tier.transactions)'), 'generator must fill to exact target count');
must(perf.includes('if (rows.length > tier.transactions) rows.length = tier.transactions'), 'generator must cap to exact target count');
must(perf.includes('performanceTestMode: true'), 'test workspace marker missing');
must(perf.includes('demoMode: true'), 'test workspace must use isolated demo boundary');

must(data.includes('await get().saveLocal({ force: true, dirty: current.dirty });'), 'real workspace must be snapshotted before test data');
must(data.includes('buildPerformanceTestWorkspace'), 'data slice must use isolated performance fixture builder');
must(data.includes('stripPerformanceCfg'), 'reset must strip performance flags instead of preserving the test workspace');
must(data.includes('await clearPerformanceSnapshot();'), 'reset must remove the isolated performance snapshot');
must(sync.includes('if (!initial.user || initial.cfg.demoMode || !initial.workspaceReady) return false;'), 'cloud sync demo guard missing');
must(sync.includes('if (current.cfg.demoMode)'), 'local demo persistence boundary missing');
must(sync.includes('schedulePerformanceSnapshotWrite(demoSnapshot'), 'test data must use the coalesced isolated performance persistence boundary');
must(storage.includes('STORAGE.DEMO_DATA'), 'test data must persist separately from the real vault');

must(settings.includes('MYFI_PERFORMANCE_DATA_LAB_V5_1'), 'settings V5.1 marker missing');
must(settings.includes('{__DEV__ ? ('), 'performance lab must be development-only UI');
must(settings.includes('PERFORMANCE_TEST_TIERS.map'), 'five-tier selector missing');
must(settings.includes('onExitTestData'), 'return-to-real-data action missing');
must(settings.includes('التصدير والاستعادة معطلان أثناء بيانات الاختبار'), 'backup isolation notice missing');

console.log('MYFI PERFORMANCE DATA LAB V5.1: PASSED');
