const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };

const constants = read('src/lib/constants.js');
const dataSlice = read('src/store/slices/dataSlice.js');
const syncSlice = read('src/store/slices/useSyncSlice.js');
const storage = read('src/dev/performanceTestStorage.js');

must(constants.includes("DEMO_ACTIVE: 'MYFI_DEMO_ACTIVE_V1'"), 'persistent demo-active storage key is missing');
must(dataSlice.includes('MYFI_PERFORMANCE_DATA_PERSISTENCE_V5_1_1'), 'dataSlice hotfix marker missing');
must(storage.includes('MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2'), 'performance storage boundary marker missing');
must(dataSlice.includes('AsyncStorage.setItem(STORAGE.DEMO_ACTIVE'), 'enterDemoMode does not mark the test workspace active');
must(dataSlice.includes('STORAGE.DEMO_REAL, STORAGE.DEMO_DATA, STORAGE.DEMO_ACTIVE'), 'exit/reset does not clear the persistent demo marker');
must(syncSlice.includes('readPerformanceSnapshot(namespace)'), 'loadLocal does not use the performance snapshot boundary');
must(storage.includes('AsyncStorage.getItem(STORAGE.DEMO_ACTIVE)'), 'performance storage does not inspect the persistent demo marker');
must(storage.includes('AsyncStorage.getItem(STORAGE.DEMO_DATA)'), 'performance storage does not restore the saved demo snapshot');
must(syncSlice.includes('demoCfg.demoMode === true'), 'loadLocal does not validate demo snapshot mode');
must(storage.includes("String(active.namespace || '') !== String(namespace || 'guest')"), 'demo restore is not namespace-isolated');
must(syncSlice.includes('return true;') && syncSlice.includes('loadedDemo'), 'demo restore path is incomplete');
must(syncSlice.includes('if (!initial.user || initial.cfg.demoMode || !initial.workspaceReady) return false;'), 'cloud sync demo guard missing');

console.log('MYFI PERFORMANCE DATA PERSISTENCE V5.1.1: PASSED');
