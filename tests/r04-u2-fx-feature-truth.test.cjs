const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const beforeMode = args.includes('--expect-before');
const projectArg = args.find(value => value !== '--expect-before');
const root = path.resolve(projectArg || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const coreSource = read('src/lib/financialCoreV2.js');
const txSource = read('src/store/slices/transactionsSlice.js');
const modulesSource = read('src/lib/modules.js');
const contractSource = read('src/lib/financialDomainContract.js');

if (beforeMode) {
  assert(
    coreSource.includes('exchangeRate = 1,'),
    'Before evidence missing: buildCurrencyFields no longer has the expected permissive default',
  );
  assert(
    coreSource.includes('exchangeRate: tx.exchangeRate || 1,'),
    'Before evidence missing: legacy non-transfer hydration no longer contains rate=1 fallback',
  );
  assert(
    txSource.includes('exchangeRate: safePatch.exchangeRate ?? current.exchangeRate ?? 1,'),
    'Before evidence missing: edit path no longer contains rate=1 fallback',
  );
  assert(
    modulesSource.includes('const filtered = source.filter(item => transactionFeatureEnabled(item, cfg));'),
    'Before evidence missing: feature-toggle transaction filtering already changed',
  );
  console.log('P04U2-002 BEFORE evidence: confirmed both enforcement gaps at baseline');
  process.exit(0);
}

const ts = require('typescript');

const transpile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName,
}).outputText;

const evaluate = (source, fileName, customRequire) => {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpile(source, fileName))(customRequire, module, module.exports);
  return module.exports;
};

const moneySource = read('src/lib/money.js');
const money = evaluate(moneySource, 'money.js', require);
const core = evaluate(coreSource, 'financialCoreV2.js', request => {
  if (request === './money') return money;
  throw new Error(`Unexpected core require: ${request}`);
});

const wallets = [
  { id: 'usd', currency: 'USD', valuationRate: 2500 },
  { id: 'iqd', currency: 'IQD', valuationRate: 1 },
];

assert.throws(() => core.buildCurrencyFields({
  amount: -100,
  walletId: 'usd',
  wallets,
  baseCurrency: 'IQD',
}), /transaction_historical_base_rate_required/, 'Foreign financial write must fail closed without historical FX');

const resolved = core.buildCurrencyFields({
  amount: -100,
  walletId: 'usd',
  wallets,
  baseCurrency: 'IQD',
  exchangeRate: 1310,
});
assert.equal(resolved.exchangeRate, 1310);
assert.equal(resolved.baseAmount, -131000);

const unresolved = core.hydrateLegacyCurrencyFields({
  id: 'legacy-usd-no-rate',
  amt: -100,
  walletId: 'usd',
  dateISO: '2025-01-01',
}, wallets, 'IQD');
assert.equal(unresolved.amt, -100, 'Legacy unresolved amount must not be silently rewritten');
assert.equal(unresolved.fxStatus, 'UNRESOLVED_FX');
assert.equal(unresolved.exchangeRate, null);
assert.equal(unresolved.unresolvedFxReason, 'missing_historical_base_rate');
assert.equal(unresolved.walletCurrency, 'USD');
assert.equal(unresolved.baseCurrencyCode, 'IQD');
assert.equal(Object.prototype.hasOwnProperty.call(unresolved, 'baseAmount'), false, 'Missing historical base amount must not be invented');

const legacyResolved = core.hydrateLegacyCurrencyFields({
  id: 'legacy-usd-with-rate',
  amt: -100,
  walletId: 'usd',
  walletAmount: -100,
  walletCurrency: 'USD',
  exchangeRate: 1310,
  dateISO: '2025-01-01',
}, wallets, 'IQD');
assert.equal(legacyResolved.fxStatus, 'RESOLVED');
assert.equal(legacyResolved.baseAmount, -131000);
assert.equal(legacyResolved.amt, -131000);

assert(!coreSource.includes('exchangeRate: tx.exchangeRate || 1,'), 'Legacy hydration still contains rate=1 fallback');
assert(!txSource.includes('safePatch.exchangeRate ?? current.exchangeRate ?? 1'), 'Edit path still contains rate=1 fallback');
assert(txSource.includes('const touchesCurrencyFields ='), 'Edit path must preserve untouched legacy currency fields');
assert(txSource.includes("Object.prototype.hasOwnProperty.call(safePatch, 'exchangeRate')"), 'Edit currency-boundary detection missing');

const constants = {
  DEF_MODULES: {
    wallets: true,
    debtsOwed: true,
    debtsReceivable: true,
    goals: true,
    commitments: true,
    budgets: true,
    recurring: true,
  },
};
const modules = evaluate(modulesSource, 'modules.js', request => {
  if (request === './constants') return constants;
  throw new Error(`Unexpected modules require: ${request}`);
});
const financialTruth = [
  { id: 'normal', flowType: 'expense', amt: -10 },
  { id: 'debt', flowType: 'debt_payment', amt: -20 },
  { id: 'goal', flowType: 'goal_allocation', amt: 0, allocationAmount: 30 },
  { id: 'commitment', flowType: 'commitment_payment', amt: -40 },
];
const disabledCfg = {
  enabledModules: { debtsOwed: false, goals: false, commitments: false },
};
assert.equal(modules.transactionFeatureEnabled(financialTruth[1], disabledCfg), false, 'UI feature gate should still know debt entry is disabled');
const visibleTruth = modules.filterTransactionsByEnabledFeatures(financialTruth, disabledCfg);
assert.strictEqual(visibleTruth, financialTruth, 'Feature toggles must not filter the authoritative transaction set');

const openStart = contractSource.indexOf('R04_U2_OPEN_ENFORCEMENT_GAPS');
const openEnd = contractSource.indexOf(']);', openStart);
assert(openStart >= 0 && openEnd > openStart, 'U-2 open-gap inventory missing');
const openBlock = contractSource.slice(openStart, openEnd);
assert(!openBlock.includes('foreign_nontransfer_missing_fx_legacy_fallback'), 'Closed FX gap still marked open');
assert(!openBlock.includes('feature_toggle_transaction_filtering_legacy_path'), 'Closed feature-toggle gap still marked open');
assert(!openBlock.includes('debt_interest_fee_components_not_enforced'), 'Debt component gap must be closed by P04U2-003');
assert(!openBlock.includes('explicit_refund_reversal_command_not_implemented'), 'Refund/reversal gap must be closed by P04U2-003');
assert(contractSource.includes("FINANCIAL_DOMAIN_CONTRACT_VERSION = 'R04-U2-3'"), 'P04U2-003 contract version missing');

console.log('MYFI P04U2-002 FX + feature-toggle financial-truth enforcement: PASSED');
