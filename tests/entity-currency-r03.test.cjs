const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const store = read('src/store/useStore.js');
const domainSource = read('src/store/domain.js');
const commitments = read('src/lib/commitments.js');
const trackers = read('src/store/slices/trackersSlice.js');
const transactions = read('src/store/slices/transactionsSlice.js');
const management = read('src/store/slices/managementSlice.js');
const add = read('src/components/AddTransModal.js');
const newItem = read('src/components/NewItemModal.js');
const trackerLab = read('src/screens/TrackersLabScreen.js');
const sync = read('src/store/slices/useSyncSlice.js');
const model = read('src/lib/financialLedgerV7Model.js');
const coreSource = read('src/lib/financialCoreV2.js');

assert(store.includes('walletsForCfg') && store.includes('currency: requestedCurrency'), 'Changing base currency before first financial event must relabel the empty default/base wallet.');
assert(domainSource.includes("fallbackCurrency = 'IQD'") && domainSource.includes('currencyCode: normalizeCurrencyCode(item.currencyCode || item.currency, fallbackCurrency)'), 'Legacy tracker normalization must freeze source-workspace currency on entities.');
assert(commitments.includes("fallbackCurrency = 'IQD'") && commitments.includes('currencyCode: normalizeCurrencyCode(item.currencyCode || item.currency, fallbackCurrency)'), 'Commitments must own immutable currencyCode.');
assert(trackers.includes('buildEntityCurrencyFields') && trackers.includes('entityCurrency: debt.currencyCode') && trackers.includes('entityCurrency: goal.currencyCode'), 'Debt/goal payments must convert from entity currency, not reinterpret the amount as current base currency.');
assert(transactions.includes('Linked tracker amounts live in entityAmount/allocationAmount') && transactions.includes('safePatch.baseAmount ?? safePatch.amt'), 'Editing a linked debt payment must keep transaction amt in reporting/base currency instead of overwriting it with entity amount.');
assert(management.includes("reason: 'linked_currency_mismatch'") && management.includes('entityCurrency: commitment.currencyCode'), 'Commitments must preserve their own currency and reject mismatched linked entities.');
assert(newItem.includes("id: 'tracker-currency'") && newItem.includes('currencyCode: selectedEntityCurrency'), 'Tracker creation UI must capture entity currency explicitly.');
assert(add.includes('needsTrackerEntityBaseRate') && add.includes('Tracker historical rate') && add.includes('entityBaseRate:'), 'Tracker payments must collect and persist historical entity-to-base FX when required.');
assert(trackerLab.includes('summarizeCurrencies') && trackerLab.includes('linkedCurrency: item.currencyCode'), 'Tracker UI must not sum mixed currencies under one symbol and linked plans must inherit tracker currency.');
assert(sync.includes('Same technical ID does not mean the same financial account') && sync.includes('item.currency || guest.cfg.currency'), 'Guest wallet ID collisions must preserve guest wallet currency instead of collapsing into account base wallet.');
assert(!sync.includes('...guest,\n        user: current.user'), 'Guest merge must not replace signed-in account configuration with guest cfg.');
assert(model.includes("id: 'entity-to-base-rate'") && model.includes('transaction.entityBaseRate'), 'Ledger must persist entity-to-base historical FX evidence.');
assert(coreSource.includes('buildEntityCurrencyFields') && coreSource.includes("throw new RangeError('entity_historical_base_rate_required')"), 'Entity conversion must block missing historical FX instead of guessing.');

// Runtime proof for the core conversion convention.
const transpile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  fileName,
}).outputText;
const evaluate = (source, fileName, customRequire) => {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpile(source, fileName))(customRequire, module, module.exports);
  return module.exports;
};
const money = evaluate(read('src/lib/money.js'), 'money.js', require);
const core = evaluate(coreSource, 'financialCoreV2.js', request => {
  if (request === './money') return money;
  throw new Error(`Unexpected require: ${request}`);
});
const wallets = [
  { id: 'irr', currency: 'IRR' },
  { id: 'iqd', currency: 'IQD' },
  { id: 'usd', currency: 'USD' },
];
const irrDebtPaidFromIqd = core.buildEntityCurrencyFields({
  entityAmount: -5000000,
  entityCurrency: 'IRR',
  walletId: 'iqd',
  wallets,
  baseCurrency: 'IQD',
  entityBaseRate: 0.02,
});
assert.equal(irrDebtPaidFromIqd.entityCurrencyCode, 'IRR');
assert.equal(irrDebtPaidFromIqd.entityAmount, -5000000);
assert.equal(irrDebtPaidFromIqd.baseAmount, -100000);
assert.equal(irrDebtPaidFromIqd.walletAmount, -100000);
assert.equal(irrDebtPaidFromIqd.entityBaseRate, 0.02);
assert.throws(() => core.buildEntityCurrencyFields({
  entityAmount: -5000000,
  entityCurrency: 'IRR',
  walletId: 'iqd',
  wallets,
  baseCurrency: 'IQD',
}), /entity_historical_base_rate_required/);
assert.throws(() => core.buildEntityCurrencyFields({
  entityAmount: -100,
  entityCurrency: 'USD',
  walletId: 'irr',
  wallets,
  baseCurrency: 'IQD',
  entityBaseRate: 1310,
}), /wallet_historical_base_rate_required/);

console.log('MYFI R03 ENTITY CURRENCY / GUEST MERGE CONTRACT: PASSED');
