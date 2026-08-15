const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let ts = null;
try { ts = require('typescript'); } catch {}

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const coreSource = read('src/lib/financialCoreV2.js');
const modelSource = read('src/lib/financialLedgerV7Model.js');
const activeSource = read('src/lib/activeLedgerRepository.js');
const moneySource = read('src/lib/money.js');

assert(coreSource.includes('user_confirmed_same_currency_base_rate'), 'same-foreign FX snapshot source missing');
assert(coreSource.includes('const sharedHistoricalRate = resolvedFromBaseRate || resolvedToBaseRate'), 'same-foreign shared historical rate missing');
assert(modelSource.includes("return 'balance_adjustment';"), 'V7 balance adjustment kind missing');
assert(activeSource.includes("COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind)='income'"), 'V7 income classification must use semantic flow');
assert(activeSource.includes("IN ('expense','commitment_payment')"), 'V7 expense classification must use semantic flow');
assert(activeSource.includes("flow_type = 'income'"), 'V6 fallback income classification must use flow_type');
assert(activeSource.includes("flow_type IN ('expense','commitment_payment')"), 'V6 fallback expense classification must use flow_type');

if (ts) {
  const transpile = (source, fileName) => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName,
  }).outputText;
  const evaluate = (source, fileName, customRequire) => {
    const module = { exports: {} };
    new Function('require', 'module', 'exports', transpile(source, fileName))(customRequire, module, module.exports);
    return module.exports;
  };
  const money = evaluate(moneySource, 'money.js', require);
  const core = evaluate(coreSource, 'financialCoreV2.js', request => {
    if (request === './money') return money;
    throw new Error('Unexpected core require: ' + request);
  });
  const model = evaluate(modelSource, 'financialLedgerV7Model.js', request => {
    if (request === './money') return money;
    if (request === './financialCoreV2') return core;
    throw new Error('Unexpected model require: ' + request);
  });

  const wallets = [
    { id: 'usd-a', name: 'USD A', currency: 'USD', scope: 'personal', valuationRate: 2000 },
    { id: 'usd-b', name: 'USD B', currency: 'USD', scope: 'personal', valuationRate: 2100 },
  ];

  assert.throws(() => core.buildTransferCurrencyFields({
    fromWalletId: 'usd-a',
    toWalletId: 'usd-b',
    fromAmount: 100,
    wallets,
    baseCurrency: 'IQD',
  }), /transfer_historical_base_rates_required/);

  const sameForeign = core.buildTransferCurrencyFields({
    fromWalletId: 'usd-a',
    toWalletId: 'usd-b',
    fromAmount: 100,
    wallets,
    baseCurrency: 'IQD',
    fromBaseRate: 1310,
  });
  assert.equal(sameForeign.transferFromAmount, 100);
  assert.equal(sameForeign.transferToAmount, 100);
  assert.equal(sameForeign.fromBaseRate, 1310);
  assert.equal(sameForeign.toBaseRate, 1310);
  assert.equal(sameForeign.baseFromAmount, 131000);
  assert.equal(sameForeign.baseToAmount, 131000);
  assert.equal(sameForeign.fxSnapshotSource, 'user_confirmed_same_currency_base_rate');

  const adjustment = model.buildFinancialLedgerCommand({
    namespace: 'user:test',
    wallets: [{ id: 'cash', name: 'Cash', currency: 'IQD', scope: 'personal' }],
    baseCurrency: 'IQD',
    transaction: {
      id: 'adj-1',
      dateISO: '2026-08-16',
      walletId: 'cash',
      flowType: 'balance_adjustment',
      isBalanceAdjustment: true,
      walletAmount: 5000,
      walletAmountMinor: 5000,
      baseAmount: 5000,
      baseAmountMinor: 5000,
      baseCurrencyCode: 'IQD',
      walletCurrency: 'IQD',
      exchangeRate: 1,
      title: 'Balance adjustment',
      scope: 'personal',
    },
  });
  assert.equal(adjustment.header.kind, 'balance_adjustment');
  assert.equal(adjustment.postings.length, 1);
  assert.equal(adjustment.postings[0].amountMinor, 5000);

  const negativeAdjustment = model.buildFinancialLedgerCommand({
    namespace: 'user:test',
    wallets: [{ id: 'cash', name: 'Cash', currency: 'IQD', scope: 'personal' }],
    baseCurrency: 'IQD',
    transaction: {
      id: 'adj-2',
      dateISO: '2026-08-16',
      walletId: 'cash',
      flowType: 'balance_adjustment',
      isBalanceAdjustment: true,
      walletAmount: -3000,
      walletAmountMinor: -3000,
      baseAmount: -3000,
      baseAmountMinor: -3000,
      baseCurrencyCode: 'IQD',
      walletCurrency: 'IQD',
      exchangeRate: 1,
      title: 'Balance adjustment',
      scope: 'personal',
    },
  });
  assert.equal(negativeAdjustment.header.kind, 'balance_adjustment');
  assert.equal(negativeAdjustment.postings[0].amountMinor, -3000);
}

console.log('MYFI R04.1 A01 FINANCIAL CORE: PASSED');
