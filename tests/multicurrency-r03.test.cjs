const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let ts = null;
try { ts = require('typescript'); } catch {}

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const add = read('src/components/AddTransModal.js');
const coreSource = read('src/lib/financialCoreV2.js');
const transactions = read('src/store/slices/transactionsSlice.js');
const details = read('src/components/TransactionDetailsModal.js');
const history = read('src/screens/HistoryScreen.js');
const onboarding = read('src/screens/OnboardingScreen.js');
const settings = read('src/screens/SettingsScreen.js');
const legacySettings = read('src/screens/SettingsLegacyScreen.js');
const moneySource = read('src/lib/money.js');

assert(add.includes('buildEntryFxSuggestion') && add.includes("setExchangeRateOrigin('wallet_suggestion')"), 'Foreign entry must prefill an editable wallet-rate suggestion.');
assert(add.includes("'تأكيد التحويل'") && add.includes("'Confirm transfer'"), 'Cross-currency transfer CTA must be explicit confirmation.');
assert(add.includes('transferReady') && add.includes('transferValidationMessage'), 'Transfer must have an inline readiness/validation gate.');
assert(add.includes('transferNeedsBridgeRates') && add.includes('transferFromBaseRate') && add.includes('transferToBaseRate'), 'Foreign-to-foreign transfers must collect historical base bridge rates.');
assert(add.includes('حفظ الحركة هو تأكيد السعر التاريخي') && add.includes('saving confirms the historical rate'), 'Saving must explicitly confirm the suggested historical rate.');
assert(add.includes('buildTransferFxSuggestion') && add.includes('Calculated from both wallet rates · editable'), 'Transfer target amount must be calculated from wallet rates and remain editable.');
assert(add.includes('transferNeedsSharedBaseRate'), 'Same-foreign-currency transfers must collect one historical base snapshot.');
assert(transactions.includes('fromBaseRate') && transactions.includes('toBaseRate'), 'Transfer write/edit/duplicate paths must preserve historical base bridge rates.');
assert(transactions.includes('rateSource = null') && transactions.includes("rateSource || (fromWallet?.currency"), 'Transfer must preserve whether a wallet valuation suggestion was confirmed.');
assert(coreSource.includes("throw new RangeError('transfer_historical_base_rates_required')"), 'Foreign-to-foreign transfers must block without historical base bridge rates.');
assert(coreSource.includes("fxStatus: 'UNRESOLVED_FX'"), 'Legacy transfers with missing historical bridge rates must be marked unresolved, never guessed.');
assert(details.includes('Frozen transfer rate') && details.includes('transferSourceText') && details.includes('transferTargetText'), 'Transaction details must expose both transfer legs and frozen FX.');
assert(history.includes('transferFxDisplay') && history.includes('fromBaseRate: target.fromBaseRate'), 'History must display transfer FX/fees and preserve FX snapshot when duplicating.');
assert(onboarding.includes('العملة الأساسية هي مرجع التقارير') && onboarding.includes('historical rate'), 'Onboarding must explain base-currency immutability and historical FX.');
assert(settings.includes('بعد أول سجل مالي تبقى العملة الأساسية ثابتة للتقارير') && settings.includes('historical exchange rate'), 'Settings help must explain the multi-currency contract.');
assert(legacySettings.includes('للتقييم الحالي فقط') && legacySettings.includes('never rewrites past transactions later'), 'Foreign-wallet creation must explain current valuation versus historical transaction FX.');

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
    throw new Error(`Unexpected require: ${request}`);
  });

  const wallets = [
    { id: 'usd', currency: 'USD', valuationRate: 1400 },
    { id: 'iqd', currency: 'IQD', valuationRate: 1 },
    { id: 'eur', currency: 'EUR', valuationRate: 1500 },
  ];

  const usdToIqd = core.buildTransferCurrencyFields({
    fromWalletId: 'usd', toWalletId: 'iqd', fromAmount: 100, toAmount: 131000,
    wallets, baseCurrency: 'IQD', exchangeRate: 1310, feeAmount: 2,
  });
  assert.equal(usdToIqd.transferFromAmount, 100);
  assert.equal(usdToIqd.transferToAmount, 131000);
  assert.equal(usdToIqd.transferRate, 1310);
  assert.equal(usdToIqd.fromBaseRate, 1310);
  assert.equal(usdToIqd.toBaseRate, 1);
  assert.equal(usdToIqd.baseFromAmount, 131000);
  assert.equal(usdToIqd.feeBaseAmount, 2620);

  assert.throws(() => core.buildTransferCurrencyFields({
    fromWalletId: 'usd', toWalletId: 'eur', fromAmount: 100, toAmount: 90,
    wallets, baseCurrency: 'IQD', exchangeRate: 0.9,
  }), /transfer_historical_base_rates_required/);

  const usdToEur = core.buildTransferCurrencyFields({
    fromWalletId: 'usd', toWalletId: 'eur', fromAmount: 100, toAmount: 90,
    wallets, baseCurrency: 'IQD', exchangeRate: 0.9, fromBaseRate: 1310, toBaseRate: 1450,
  });
  assert.equal(usdToEur.fromBaseRate, 1310);
  assert.equal(usdToEur.toBaseRate, 1450);
  assert.equal(usdToEur.baseFromAmount, 131000);
  assert.equal(usdToEur.baseToAmount, 130500);
  assert.equal(usdToEur.fxSnapshotSource, 'user_confirmed_bridge_rates');

  const changedWalletRates = wallets.map(wallet => wallet.id === 'usd'
    ? { ...wallet, valuationRate: 2000 }
    : wallet.id === 'eur' ? { ...wallet, valuationRate: 2100 } : wallet);
  const rehydrated = core.hydrateLegacyCurrencyFields({
    kind: 'transfer', fromWalletId: 'usd', toWalletId: 'eur',
    transferFromAmount: 100, transferToAmount: 90, transferRate: 0.9,
    fromBaseRate: 1310, toBaseRate: 1450, baseCurrencyCode: 'IQD',
  }, changedWalletRates, 'IQD');
  assert.equal(rehydrated.fromBaseRate, 1310);
  assert.equal(rehydrated.toBaseRate, 1450);
  assert.equal(rehydrated.baseFromAmount, 131000);
  assert.equal(rehydrated.baseToAmount, 130500);

  const unresolved = core.hydrateLegacyCurrencyFields({
    kind: 'transfer', fromWalletId: 'usd', toWalletId: 'eur',
    transferFromAmount: 100, transferToAmount: 90, transferRate: 0.9,
    baseCurrencyCode: 'IQD',
  }, changedWalletRates, 'IQD');
  assert.equal(unresolved.fxStatus, 'UNRESOLVED_FX');
  assert.equal(unresolved.fromBaseRate, null);
  assert.equal(unresolved.toBaseRate, null);
}

console.log('MYFI R03 MULTI-CURRENCY CONTRACT: PASSED');
