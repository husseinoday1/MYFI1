const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || process.cwd();
const file = path.join(root, 'src/dev/performanceTestData.js');
const configFile = path.join(root, 'src/dev/performanceTestConfig.js');
let configSource = fs.readFileSync(configFile, 'utf8');
configSource = configSource.replace(/export const /g, 'const ');
configSource += '\nmodule.exports = { PERFORMANCE_TEST_TIERS, DEFAULT_PERFORMANCE_TEST_TIER, getPerformanceTestTier };\n';
const configSandbox = { module: { exports: {} }, exports: {} };
vm.createContext(configSandbox);
vm.runInContext(configSource, configSandbox, { filename: configFile });
const { PERFORMANCE_TEST_TIERS, DEFAULT_PERFORMANCE_TEST_TIER, getPerformanceTestTier } = configSandbox.module.exports;
let source = fs.readFileSync(file, 'utf8');
source = source.replace(/^import .*;\s*$/gm, '');
source = source.replace(/export const /g, 'const ');
source += '\nmodule.exports = { buildPerformanceTestWorkspace };\n';

const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
  FLOW_TYPES: { INCOME: 'income', EXPENSE: 'expense', TRANSFER: 'transfer' },
  normalizeTransactionTag: value => value,
  demoDate: (offset, day) => {
    const baseYear = 2026;
    const baseMonth = 7; // August, zero-based.
    const d = new Date(Date.UTC(baseYear, baseMonth + offset, day, 12));
    return d.toISOString().slice(0, 10);
  },
  buildDemoWorkspace: cfg => ({
    trans: Array.from({ length: 180 }, (_, i) => ({ id: `base_${i}`, amt: i % 4 ? -1000 : 5000, dateISO: '2026-08-01' })),
    debts: [], goals: [], commitments: [], wallets: [], cats: [],
    cfg: { ...cfg, demoMode: true },
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
  Date,
  Math,
  DEFAULT_PERFORMANCE_TEST_TIER,
  getPerformanceTestTier,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: file });
const { buildPerformanceTestWorkspace } = sandbox.module.exports;

const allTransactions = workspace => [
  ...(workspace?.trans || []),
  ...((workspace?.__performanceArchives || []).flatMap(archive => archive?.data?.trans || [])),
];

for (const tier of PERFORMANCE_TEST_TIERS) {
  const one = buildPerformanceTestWorkspace({ currency: 'IQD' }, tier.id);
  const two = buildPerformanceTestWorkspace({ currency: 'IQD' }, tier.id);
  const oneTransactions = allTransactions(one);
  const twoTransactions = allTransactions(two);
  if (oneTransactions.length !== tier.transactions) throw new Error(`tier ${tier.id}: expected ${tier.transactions}, got ${oneTransactions.length}`);
  if (one.cfg.performanceTestTier !== tier.id) throw new Error(`tier ${tier.id}: missing cfg tier marker`);
  if (!one.cfg.demoMode || !one.cfg.performanceTestMode) throw new Error(`tier ${tier.id}: isolation flags missing`);
  const sampleOne = JSON.stringify(oneTransactions.slice(180, 195).map(({ ts, ...tx }) => tx));
  const sampleTwo = JSON.stringify(twoTransactions.slice(180, 195).map(({ ts, ...tx }) => tx));
  if (sampleOne !== sampleTwo) throw new Error(`tier ${tier.id}: generator is not deterministic`);
}
console.log('MYFI PERFORMANCE GENERATOR RUNTIME V5.1: PASSED');
