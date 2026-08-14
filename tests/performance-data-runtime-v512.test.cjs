const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };

const app = read('App.js');
const config = read('src/dev/performanceTestConfig.js');
const generator = read('src/dev/performanceTestData.js');
const storage = read('src/dev/performanceTestStorage.js');
const sync = read('src/store/slices/useSyncSlice.js');
const data = read('src/store/slices/dataSlice.js');
const settings = read('src/screens/SettingsScreen.js');

must(app.includes('if (!ready || INTERNAL_DEMO_ENABLED || !cfg.demoMode) return;'), 'legacy demo auto-exit boundary is missing');
must(app.includes('if (__DEV__ && cfg.performanceTestMode === true) return;'), 'App can still auto-exit an active performance workspace');

for (const [id, months] of [['200', 24], ['1000', 36], ['5000', 48], ['10000', 60], ['25000', 72], ['50000', 96]]) {
  must(config.includes(`id: '${id}'`), `missing performance tier ${id}`);
  const row = config.split('\n').find(line => line.includes(`id: '${id}'`)) || '';
  must(row.includes(`months: ${months}`), `tier ${id} must span ${months} months`);
  must(months > 12, `tier ${id} must span more than one year`);
}

must(generator.includes('const rows = [];'), 'performance history is still dominated by the small built-in demo sample');
must(!generator.includes('const rows = Array.isArray(base.trans) ? [...base.trans] : [];'), 'legacy base transactions are still copied into performance history');
must(!generator.includes('Math.random'), 'performance data must stay deterministic');

must(storage.includes('TRANSACTION_CHUNK_SIZE = 750'), 'chunked performance storage is missing');
must(storage.includes('AsyncStorage.multiSet'), 'chunked performance write is missing');
must(storage.includes('AsyncStorage.multiGet'), 'chunked performance read is missing');
must(storage.includes('transactionCount'), 'performance storage does not validate transaction count');
must(sync.includes('readPerformanceSnapshot(namespace)'), 'loadLocal does not use chunked performance restore');
must(sync.includes('schedulePerformanceSnapshotWrite(demoSnapshot'), 'saveLocal does not use coalesced chunked performance persistence');
must(storage.includes('WRITE_BATCH_SIZE = 1'), 'large fixture writes are not yielded after each bounded chunk');
must(storage.includes('writePerformanceOverlay'), 'single additions still rewrite the full performance fixture');
must(storage.includes('addedTransactions'), 'performance overlay does not preserve newly added rows');
must(data.includes('clearPerformanceSnapshot'), 'test workspace cleanup does not clear chunked storage');
must(settings.includes('50,000'), '50,000 long-term tier is missing from Settings');
must(settings.includes('أكثر من سنة'), 'Settings does not explain multi-year test coverage');

// Execute the generator in a small VM and verify that even the smallest tier
// actually spans more than one year rather than only claiming it in config.
let configSource = config.replace(/export const /g, 'const ');
configSource += '\nmodule.exports = { PERFORMANCE_TEST_TIERS, DEFAULT_PERFORMANCE_TEST_TIER, getPerformanceTestTier };\n';
const configSandbox = { module: { exports: {} }, exports: {} };
vm.createContext(configSandbox);
vm.runInContext(configSource, configSandbox);
const { DEFAULT_PERFORMANCE_TEST_TIER, getPerformanceTestTier } = configSandbox.module.exports;

let source = generator.replace(/^import .*;\s*$/gm, '').replace(/export const /g, 'const ');
source += '\nmodule.exports = { buildPerformanceTestWorkspace };\n';
const sandbox = {
  module: { exports: {} }, exports: {}, console,
  FLOW_TYPES: { INCOME: 'income', EXPENSE: 'expense', TRANSFER: 'transfer' },
  normalizeTransactionTag: value => value,
  demoDate: (offset, day) => {
    const d = new Date(Date.UTC(2026, 7 + offset, day, 12));
    return d.toISOString().slice(0, 10);
  },
  buildDemoWorkspace: cfg => ({
    trans: Array.from({ length: 180 }, (_, i) => ({ id: `base_${i}`, dateISO: '2026-08-01', amt: -1 })),
    debts: [], goals: [], commitments: [], wallets: [], cats: [], cfg: { ...cfg, demoMode: true },
  }),
  compareTransactionsNewestFirst: (a, b) => (
    String(b?.dateISO || '').localeCompare(String(a?.dateISO || ''))
    || Number(b?.ts || 0) - Number(a?.ts || 0)
    || String(b?.id || '').localeCompare(String(a?.id || ''))
  ),
  yearOf: value => {
    const match = String(value || '').match(/^(\d{4})-\d{2}-\d{2}$/);
    return match ? Number(match[1]) : null;
  },
  getDefaultWalletId: (wallets = [], _currency = 'IQD', preferredId = null) => (
    wallets.some(wallet => wallet?.id === preferredId) ? preferredId : wallets[0]?.id || null
  ),
  archivedWalletMovement: (transactions = [], wallets = [], defaultWalletId = null) => {
    const movement = new Map(wallets.map(wallet => [wallet.id, 0]));
    transactions.forEach(tx => {
      if (tx?.kind === 'transfer') {
        if (movement.has(tx.fromWalletId)) movement.set(tx.fromWalletId, movement.get(tx.fromWalletId) - Math.abs(Number(tx.transferAmount || 0)));
        if (movement.has(tx.toWalletId)) movement.set(tx.toWalletId, movement.get(tx.toWalletId) + Math.abs(Number(tx.transferAmount || 0)));
        return;
      }
      const walletId = tx?.walletId || defaultWalletId;
      if (movement.has(walletId)) movement.set(walletId, movement.get(walletId) + Number(tx?.walletAmount ?? tx?.amt ?? 0));
    });
    return movement;
  },
  Date, Math, DEFAULT_PERFORMANCE_TEST_TIER, getPerformanceTestTier,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const smallest = sandbox.module.exports.buildPerformanceTestWorkspace({}, '200');
const archivedRows = (smallest.__performanceArchives || []).flatMap(archive => archive?.data?.trans || []);
const allRows = [...smallest.trans, ...archivedRows];
const dates = allRows.map(item => item.dateISO).sort();
const first = new Date(`${dates[0]}T00:00:00Z`);
const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
const monthSpan = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + (last.getUTCMonth() - first.getUTCMonth()) + 1;
must(allRows.length === 200, 'smallest tier does not contain exactly 200 transactions across active and archived storage');
must(monthSpan >= 13, `smallest tier only spans ${monthSpan} months`);
must(!allRows.some(item => String(item.id).startsWith('base_')), 'built-in base rows leaked into performance history');

console.log('MYFI PERFORMANCE DATA RUNTIME V5.1.2: PASSED');
