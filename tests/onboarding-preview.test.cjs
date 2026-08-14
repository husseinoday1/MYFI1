const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const transpile = file => ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: file,
}).outputText;
const evaluate = (source, customRequire) => {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(customRequire, module, module.exports);
  return module.exports;
};

const money = evaluate(transpile('src/lib/money.js'), require);
const preview = evaluate(transpile('src/lib/onboardingPreview.js'), request => {
  if (request === './money') return money;
  throw new Error(`Unexpected import: ${request}`);
});

const iqdPersonal = preview.getOnboardingPreview({ currency: 'IQD', symbol: 'د.ع', profileType: 'personal', lang: 'ar' });
const usdBusiness = preview.getOnboardingPreview({ currency: 'USD', symbol: '$', profileType: 'business', lang: 'en' });
const mixed = preview.getOnboardingPreview({ currency: 'EUR', symbol: '€', profileType: 'personal_business', lang: 'ar' });

assert.equal(iqdPersonal.balanceValue, '8,450,000 د.ع');
assert.equal(usdBusiness.balanceValue, '8,450 $');
assert.equal(usdBusiness.balance, 'Business cash');
assert.equal(usdBusiness.rows[0].label, 'Sales');
assert.equal(mixed.balance, 'إجمالي الرصيد');
assert.equal(mixed.rows[1].label, 'المشروع');
assert.equal(mixed.rows[1].value, '550 €');

console.log('MYFI onboarding preview reacts to currency and usage profile.');
