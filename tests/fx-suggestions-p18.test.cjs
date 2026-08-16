const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const transpile = (source, fileName) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName,
}).outputText;
const evaluate = (source, fileName, customRequire) => {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpile(source, fileName))(customRequire, module, module.exports);
  return module.exports;
};

const money = evaluate(read('src/lib/money.js'), 'money.js', require);
const fx = evaluate(read('src/lib/fxSuggestions.js'), 'fxSuggestions.js', request => {
  if (request === './money') return money;
  throw new Error(`Unexpected require: ${request}`);
});

const iqd = { id: 'iqd', currency: 'IQD', valuationRate: 1 };
const usd = { id: 'usd', currency: 'USD', valuationRate: 1310, valuationUpdatedAt: '2026-08-16T00:00:00.000Z' };
const eur = { id: 'eur', currency: 'EUR', valuationRate: 1450 };

const entry = fx.buildEntryFxSuggestion({ wallet: usd, baseCurrency: 'IQD' });
assert.equal(entry.available, true);
assert.equal(entry.rate, 1310);
assert.equal(entry.source, 'wallet_valuation_suggestion');

const usdToIqd = fx.buildTransferFxSuggestion({ fromWallet: usd, toWallet: iqd, sourceAmount: 100, baseCurrency: 'IQD' });
assert.equal(usdToIqd.targetAmount, 131000);
assert.equal(usdToIqd.transferRate, 1310);

const iqdToUsd = fx.buildTransferFxSuggestion({ fromWallet: iqd, toWallet: usd, sourceAmount: 131000, baseCurrency: 'IQD' });
assert.equal(iqdToUsd.targetAmount, 100);
assert.equal(iqdToUsd.transferRate, 100 / 131000);

const usdToEur = fx.buildTransferFxSuggestion({ fromWallet: usd, toWallet: eur, sourceAmount: 100, baseCurrency: 'IQD' });
assert.equal(usdToEur.targetAmount, 90.34);
assert.equal(usdToEur.fromBaseRate, 1310);
assert.equal(usdToEur.toBaseRate, 1450);

const sameForeign = fx.buildTransferFxSuggestion({ fromWallet: usd, toWallet: { ...usd, id: 'usd-2' }, sourceAmount: 75, baseCurrency: 'IQD' });
assert.equal(sameForeign.targetAmount, 75);
assert.equal(sameForeign.fromBaseRate, 1310);
assert.equal(sameForeign.toBaseRate, 1310);

const unresolved = fx.buildTransferFxSuggestion({ fromWallet: { currency: 'USD' }, toWallet: iqd, sourceAmount: 10, baseCurrency: 'IQD' });
assert.equal(unresolved.available, false);
assert.equal(unresolved.targetAmount, null);

console.log('MYFI P18-003 FX SUGGESTION RUNTIME: PASSED');
