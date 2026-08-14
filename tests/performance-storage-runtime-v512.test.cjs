const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(process.argv[2] || '.');
const file = path.join(root, 'src/dev/performanceTestStorage.js');
let source = fs.readFileSync(file, 'utf8');
source = source.replace(/^import .*;\s*$/gm, '');
source = source.replace(/export const /g, 'const ');
source += '\nmodule.exports = { clearPerformanceSnapshot, writePerformanceSnapshot, readPerformanceSnapshot };\n';

const store = new Map();
const AsyncStorage = {
  getItem: async key => store.has(key) ? store.get(key) : null,
  setItem: async (key, value) => { store.set(key, value); },
  multiSet: async pairs => { pairs.forEach(([key, value]) => store.set(key, value)); },
  multiGet: async keys => keys.map(key => [key, store.has(key) ? store.get(key) : null]),
  multiRemove: async keys => { keys.forEach(key => store.delete(key)); },
  removeItem: async key => { store.delete(key); },
};
const STORAGE = { DEMO_DATA: 'MYFI_DEMO_DATA_V1', DEMO_ACTIVE: 'MYFI_DEMO_ACTIVE_V1' };
const sandbox = { module: { exports: {} }, exports: {}, AsyncStorage, STORAGE, Date, JSON, Array, Number, String };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: file });
const { writePerformanceSnapshot, readPerformanceSnapshot, clearPerformanceSnapshot } = sandbox.module.exports;

(async () => {
  const makeSnapshot = count => ({
    v: 7,
    data: {
      trans: Array.from({ length: count }, (_, i) => ({ id: `t_${i}`, amt: i, dateISO: '2025-01-01' })),
      debts: [], goals: [], wallets: [], commitments: [],
    },
    cats: [],
    cfg: { demoMode: true, performanceTestMode: true, performanceTestTier: String(count) },
  });

  await writePerformanceSnapshot(makeSnapshot(2201), { namespace: 'guest', tier: '2201' });
  if (!store.has('MYFI_DEMO_DATA_V1:CHUNK:0') || !store.has('MYFI_DEMO_DATA_V1:CHUNK:2')) throw new Error('chunked write failed');
  const meta = JSON.parse(store.get('MYFI_DEMO_DATA_V1'));
  if ((meta.data.trans || []).length !== 0) throw new Error('metadata entry still contains the huge transaction array');
  if (meta.performanceStorage.chunkCount !== 3) throw new Error('wrong chunk count');

  const restored = await readPerformanceSnapshot('guest');
  if (!restored || restored.data.trans.length !== 2201) throw new Error('chunked read failed');
  if (restored.data.trans[2200].id !== 't_2200') throw new Error('transaction order changed');
  if (await readPerformanceSnapshot('other') !== null) throw new Error('namespace isolation failed');

  await writePerformanceSnapshot(makeSnapshot(500), { namespace: 'guest', tier: '500' });
  if (store.has('MYFI_DEMO_DATA_V1:CHUNK:1') || store.has('MYFI_DEMO_DATA_V1:CHUNK:2')) throw new Error('stale chunks were not removed');
  const smaller = await readPerformanceSnapshot('guest');
  if (!smaller || smaller.data.trans.length !== 500) throw new Error('smaller rewrite failed');

  await clearPerformanceSnapshot();
  if (store.size !== 0) throw new Error(`performance storage cleanup left ${store.size} keys`);
  console.log('MYFI PERFORMANCE STORAGE RUNTIME V5.1.2: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
