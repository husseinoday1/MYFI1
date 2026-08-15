const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.argv[2] || path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const useStore = read('src/store/useStore.js');
const domain = read('src/store/domain.js');
const sync = read('src/store/slices/useSyncSlice.js');
const historyScreen = read('src/screens/HistoryScreen.js');
const settingsScreen = read('src/screens/SettingsScreen.js');
const historyLib = read('src/lib/history.js');
const app = read('App.js');
const repository = read('src/lib/financialLedgerV7Repository.js');
const harness = read('src/dev/financialLedgerV7DeviceHarness.js');

assert(domain.includes('export const hasCurrencySensitiveFinancialData'), 'central financial-history currency guard helper missing');
assert(useStore.includes("reason: baseCurrencyLocked ? 'base_currency_locked' : null"), 'setCfg must report locked base-currency changes');
assert(useStore.includes('hasCurrencySensitiveFinancialData(current)'), 'setCfg must guard base currency using actual financial state');
assert(settingsScreen.includes("result?.reason === 'base_currency_locked'"), 'Settings must explain blocked base-currency changes');
assert(sync.includes('currency: item.currency || current.cfg.currency'), 'guest merge must preserve original wallet currency');
assert(!sync.includes('currency: current.cfg.currency,\n      }));'), 'guest merge must not relabel guest wallets to current base currency');

assert(historyScreen.includes('ledgerPageCoversFallback(visible, filteredFallback, 250)'), 'History must reject incomplete SQLite pages');
assert(historyScreen.includes('item.allocationWalletAmount ?? item.allocationAmount'), 'History must display goal-saving native amount');
assert(sync.includes('SCHEDULED_SYNC_DELAYS_MS = [700, 3000, 10000, 30000]'), 'automatic sync retry schedule missing');
assert(sync.includes('armScheduledCloudSync(get, scheduledSyncReason, scheduledSyncAttempt + 1)'), 'automatic sync retry must re-arm after a failed sync');
assert(app.includes("if (syncConflict.type === 'merged_changes' && !syncConflict.cloud)"), 'merged-change conflict branch missing');
assert(app.includes("resolveSyncConflict('dismiss').finally"), 'informational merged-change prompt should be dismissed without overlapping alert');

assert(repository.includes('export const proveFinancialLedgerInvariantsV7'), 'Phase 4 SQLite invariant proof is missing');
assert(repository.includes("code: 'UNRESOLVED_FX'"), 'historical FX invariant must classify unresolved FX explicitly');
assert(repository.includes("code: 'duplicate_opening_balance'"), 'opening-balance duplication invariant missing');
assert(repository.includes("SUM("), 'wallet balance proof must derive balances from postings');
assert(harness.includes("invariantLevel: invariantReport.level"), 'device harness must record invariant proof');


const executableHistory = historyLib
  .replace(/export const /g, 'const ')
  .concat('\nmodule.exports={ledgerPageCoversFallback};');
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(executableHistory, sandbox, { filename: 'history.js' });
const { ledgerPageCoversFallback } = sandbox.module.exports;

assert(ledgerPageCoversFallback([{id:'a'},{id:'b'}], [{id:'a'},{id:'b'}], 250) === true, 'matching ledger page should pass parity');
assert(ledgerPageCoversFallback([{id:'a'}], [{id:'a'},{id:'b'}], 250) === false, 'incomplete ledger page must fail parity');
assert(ledgerPageCoversFallback([], [], 250) === true, 'empty ledger and fallback should be accepted');

console.log('MYFI R02 financial safety contracts PASS');
