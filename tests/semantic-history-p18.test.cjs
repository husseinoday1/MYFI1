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
const semantics = evaluate(read('src/lib/transactionSemantics.js'), 'transactionSemantics.js', request => {
  if (request === './money') return money;
  throw new Error(`Unexpected require: ${request}`);
});

const K = semantics.TRANSACTION_SEMANTIC_KIND;
assert.equal(semantics.getTransactionSemanticKind({ amt: 500, isOpeningBalance: true }), K.OPENING_BALANCE);
assert.equal(semantics.getSemanticTypeLabel(K.OPENING_BALANCE, 'ar'), 'رصيد افتتاحي');
assert.equal(semantics.getTransactionSemanticKind({ amt: 25, isBalanceAdjustment: true }), K.BALANCE_ADJUSTMENT);
assert.equal(semantics.getSemanticTypeLabel(K.BALANCE_ADJUSTMENT, 'en'), 'Balance adjustment');

assert.equal(
  semantics.buildGeneratedEntryTitle({ flow: 'expense', categoryLabel: 'طعام', lang: 'ar' }),
  'مصروف - طعام',
);
assert.equal(
  semantics.buildGeneratedEntryTitle({ flow: 'income', categoryLabel: 'Salary', lang: 'en' }),
  'Income - Salary',
);
assert.equal(semantics.isGeneratedEntryTitle({ amt: -10, cat: 'food', title: 'مصروف - طعام' }, [{ id: 'food', label: 'طعام', labelEn: 'Food' }]), true);
assert.equal(semantics.isGeneratedEntryTitle({ amt: -10, cat: 'food', title: 'عشاء العائلة', titleSource: 'user' }, [{ id: 'food', label: 'طعام' }]), false);

assert.equal(
  semantics.buildTrackerTransactionTitle({ kind: K.DEBT_PAYMENT, entityName: 'أحمد', commitmentName: 'القسط الشهري', lang: 'ar' }),
  'دفع التزام — القسط الشهري · سداد دين عليّ — أحمد',
);
assert.equal(
  semantics.buildTrackerTransactionTitle({ kind: K.OPENING_BALANCE, entityName: 'المحفظة النقدية', lang: 'ar' }),
  'رصيد افتتاحي — المحفظة النقدية',
);

assert.deepEqual(
  semantics.buildBalanceReconciliationPreview({ recordedBalance: 100, actualBalance: 100, currency: 'IQD' }),
  { valid: true, status: 'matched', recordedBalance: 100, actualBalance: 100, difference: 0 },
);
assert.equal(semantics.buildBalanceReconciliationPreview({ recordedBalance: 100, actualBalance: 85, currency: 'IQD' }).difference, -15);
assert.equal(semantics.buildBalanceReconciliationPreview({ recordedBalance: 100, actualBalance: 'bad', currency: 'IQD' }).valid, false);

const management = read('src/store/slices/managementSlice.js');
const transactions = read('src/store/slices/transactionsSlice.js');
const addModal = read('src/components/AddTransModal.js');
const details = read('src/components/TransactionDetailsModal.js');
const settings = read('src/screens/SettingsLegacyScreen.js');
const history = read('src/screens/HistoryScreen.js');
const archive = read('src/screens/ArchiveScreen.js');

assert.match(management, /review\?\.confirmedUnresolved !== true/);
assert.match(management, /reason: 'reconciliation_review_required'/);
assert.match(management, /reconciliationReviewedAt:/);
assert.match(settings, /confirmedUnresolved: true/);
assert.match(settings, /reviewWalletReconciliation/);
assert.match(transactions, /isGeneratedEntryTitle\(current, get\(\)\.cats\)/);
assert.match(transactions, /safePatch\.titleSource = 'generated'/);
assert.match(addModal, /titleSource: title\.trim\(\)/);
assert.match(details, /getSemanticTypeLabel\(semanticKind, cfg\.lang\)/);
assert.match(details, /transaction\.entityNameSnapshot/);
assert.match(history, /TRANSACTION_SEMANTIC_KIND\.OPENING_BALANCE,[\s\S]*TRANSACTION_SEMANTIC_KIND\.BALANCE_ADJUSTMENT/);
assert.match(archive, /filter\(item => getTransactionSemanticKind\(item\) !== TRANSACTION_SEMANTIC_KIND\.OPENING_BALANCE\)/);

console.log('MYFI P18-004 SEMANTIC FINANCIAL HISTORY: PASSED');
