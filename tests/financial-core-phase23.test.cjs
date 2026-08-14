const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const vm = require('node:vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (rel, pattern, message) => assert(pattern.test(read(rel)), message || `${rel} missing ${pattern}`);
const mustNot = (rel, pattern, message) => assert(!pattern.test(read(rel)), message || `${rel} unexpectedly matches ${pattern}`);

// Phase 1 safety must remain intact while Phase 2/3 changes the data engine.
must('src/screens/SettingsScreen.js', /prepareLocalWorkspaceForAccountDeletion/, 'delete-account local preservation call missing');
must('src/store/slices/useSyncSlice.js', /prepareLocalWorkspaceForAccountDeletion/, 'delete-account preservation implementation missing');
must('src/store/slices/useSyncSlice.js', /sameWorkspaceData\(localOnly, restored\)/, 'local-only account deletion verification missing');
must('src/store/slices/useSyncSlice.js', /rollbackLocalWorkspaceAfterAccountDeletionFailure/, 'delete-account rollback missing');
must('src/store/slices/useSyncSlice.js', /cleanupDeletedAccountLocalNamespace/, 'old account namespace cleanup missing');
mustNot('src/screens/SettingsScreen.js', /clearVaultSnapshot\s*\(\s*namespaceForUser\s*\(\s*user\s*\)\s*\)/, 'delete-account UI clears financial vault directly');

// Active SQLite financial engine and write/read migration.
must('src/lib/activeLedgerRepository.js', /MYFI_ACTIVE_SQLITE_LEDGER_V6/, 'active ledger marker missing');
must('src/lib/activeLedgerRepository.js', /CREATE TABLE IF NOT EXISTS ledger_transactions/, 'relational transactions table missing');
must('src/lib/activeLedgerRepository.js', /CREATE TABLE IF NOT EXISTS ledger_wallets/, 'relational wallets table missing');
must('src/lib/activeLedgerRepository.js', /CREATE TABLE IF NOT EXISTS ledger_outbox/, 'sync outbox missing');
must('src/lib/activeLedgerRepository.js', /fee_base_minor/, 'base-currency transfer fee storage missing');
must('src/lib/activeLedgerRepository.js', /PRAGMA table_info\(ledger_transactions\)/, 'forward-compatible SQLite column migration missing');
must('src/lib/activeLedgerRepository.js', /queryLedgerTransactions/, 'ledger query API missing');
must('src/lib/activeLedgerRepository.js', /ORDER BY date_iso DESC, ts DESC, id DESC LIMIT \?/, 'cursor SQL pagination missing');
must('src/lib/activeLedgerRepository.js', /queryLedgerSummary/, 'SQL summary API missing');
must('src/lib/activeLedgerRepository.js', /queryLedgerCategorySpend/, 'SQL category aggregation missing');
must('src/lib/activeLedgerRepository.js', /kind = 'transfer' AND \(\? IS NULL OR from_wallet_id = \?\)/, 'wallet-filtered transfer fees must be charged only to the source wallet');
must('src/screens/ReportsScreen.js', /item\.fromWalletId !== walletFilter[\s\S]*feeBaseAmount: 0/, 'array fallback must not charge transfer fees to the destination wallet');
must('src/lib/activeLedgerRepository.js', /softDeleteLedgerTransaction/, 'soft-delete API missing');
must('src/lib/activeLedgerRepository.js', /operation,payload_json[\s\S]*'upsert'/, 'undo/upsert outbox path missing');
must('src/store/useStore.js', /queueLedgerStateDiff/, 'Zustand compatibility bridge does not mirror to SQLite');
must('src/store/slices/useSyncSlice.js', /await flushLedgerMirror\(\)/, 'vault save can bypass pending SQLite writes');
must('src/store/slices/useSyncSlice.js', /replaceLedgerSnapshot/, 'load/migration does not reconcile SQLite ledger');

// SQL-backed History plus SQLite-hydrated UI-cache reads on summary screens.
// Home/Reports must not asynchronously overwrite correct hydrated values with
// a second aggregate result from an older or partially migrated projection.
must('src/screens/HistoryScreen.js', /queryLedgerTransactions/, 'History SQL query path missing');
must('src/screens/HistoryScreen.js', /nextCursor|ledgerCursor/, 'History cursor pagination missing');
must('src/screens/HomeScreen.js', /buildFinancialSnapshot\(\{/, 'Home hydrated-cache summary path missing');
mustNot('src/screens/HomeScreen.js', /ledgerSummaryOverride|summaryOverride/, 'Home can overwrite hydrated month totals with a stale SQL projection');
must('src/screens/ReportsScreen.js', /catSpend\(periodTrans, cats\)/, 'Reports hydrated-cache category aggregation missing');
mustNot('src/screens/ReportsScreen.js', /periodStatsOverride/, 'Reports can overwrite hydrated totals with a stale SQL projection');

// Real multi-currency money model.
must('src/lib/financialCoreV2.js', /MYFI_FINANCIAL_CORE_V2/, 'Financial Core V2 marker missing');
must('src/lib/financialCoreV2.js', /buildCurrencyFields/, 'native/base amount fields missing');
must('src/lib/financialCoreV2.js', /buildTransferCurrencyFields/, 'cross-currency transfer model missing');
must('src/lib/financialCoreV2.js', /feeBaseAmount/, 'cross-currency transfer fee base value missing');
must('src/lib/wallets.js', /every wallet owns its native currency/, 'wallet-native currency contract missing');
must('src/components/AddTransModal.js', /المبلغ المستلم/, 'cross-currency received amount UI missing');
must('src/components/AddTransModal.js', /رسوم التحويل/, 'transfer-fee UI missing');
must('src/components/AddTransModal.js', /transferToAmount/, 'cross-currency target amount missing');
must('src/screens/SettingsLegacyScreen.js', /newWalletCurrency/, 'wallet currency selection missing');
must('src/screens/SettingsLegacyScreen.js', /valuationRate/, 'wallet valuation rate missing');

// Financial correctness improvements.
must('src/lib/wallets.js', /A ledger records reality/, 'negative-balance warning policy missing');
must('src/lib/wallets.js', /warning: wouldGoNegative/, 'negative-balance warning result missing');
must('src/store/slices/managementSlice.js', /reconcileWalletBalance/, 'balance reconciliation missing');
must('src/store/slices/managementSlice.js', /FLOW_TYPES\.BALANCE_ADJUSTMENT/, 'balance adjustment transaction missing');
must('src/screens/SettingsLegacyScreen.js', /مطابقة الرصيد/, 'balance reconciliation UI missing');
must('src/store/slices/transactionsSlice.js', /undoLastTransactionDelete/, 'transaction undo missing');
must('src/screens/HistoryScreen.js', /يمكنك التراجع|Undo/, 'History delete undo affordance missing');
must('src/screens/HistoryScreen.js', /mode: 'commitment'[\s\S]*dateISO: todayISO\(\)/, 'commitment duplicate must open today, not auto-advance a cycle');

// Monthly Budget V2 and adaptive suggestion foundation.
must('src/lib/budgets.js', /categoryBudgetsByMonth|normalizeMonthlyBudgets|getBudgetMapForMonth/, 'monthly budget model missing');
must('src/lib/budgets.js', /outliersIgnored/, 'budget outlier handling missing');
must('src/lib/budgets.js', /newest month weighs most/, 'recent-month weighting missing');
must('src/store/useStore.js', /copyPreviousMonthBudgets/, 'copy previous month budget action missing');
must('src/screens/SettingsLegacyScreen.js', /budgetMonthKey/, 'budget month navigation missing');
must('src/screens/SettingsLegacyScreen.js', /لماذا هذا الاقتراح/, 'budget suggestion explainability missing');
must('src/screens/SettingsLegacyScreen.js', /تجاوز الميزانية/, 'Budget V2 status UI missing');

// Recurring/commitment and default wallet contracts remain intact.
must('src/lib/commitments.js', /repeatMonthly/, 'commitment repeat model missing');
must('src/store/slices/managementSlice.js', /walletId \|\| defaultWalletId \|\| commitment\.walletId/, 'commitment does not prefer current default wallet');
must('src/store/slices/transactionsSlice.js', /recurringGroupId/, 'recurring series identity missing');

// Local-first hot path: user action is not blocked on cloud network sync.
must('src/store/slices/transactionsSlice.js', /scheduleCloudSync\?\./, 'scheduled cloud sync missing');
mustNot('src/store/slices/transactionsSlice.js', /await\s+get\(\)\.syncCloud\s*\(/, 'transaction hot path still awaits cloud');

// Performance lab must expose both realistic long-term and active-ledger stress.
must('src/dev/performanceTestConfig.js', /100000/, '100K long-term performance tier missing');
must('src/dev/performanceTestConfig.js', /active25000/, '25K active-ledger stress tier missing');
must('src/dev/performanceTestData.js', /tier\.mode === 'active'/, 'active-ledger stress generation missing');
must('src/dev/performanceTestData.js', /currentDayCap/, 'performance generator current-day cap missing');

// Phase 2/3 deliberately does not deploy cloud schema or remove V5.3 archive/backup behavior.
must('src/lib/localArchiveRepository.js', /MYFI_LOCAL_COLD_ARCHIVE_V5_3/, 'V5.3 cold archive baseline was removed during Phase 2/3');
must('src/store/slices/dataSlice.js', /await storeColdArchiveYear/, 'existing safe archive persistence path was removed');
must('src/store/slices/dataSlice.js', /if \(!archiveStored\) return false/, 'archive can remove hot data before SQLite archive succeeds');

// Pure money runtime contract (dependency-light evaluation of Financial Core V2).
const moneySource = read('src/lib/money.js');
const three = [...moneySource.matchAll(/THREE_DECIMAL = new Set\(\[([^\]]+)\]\)/g)][0]?.[1] || '';
assert(three.includes("'IQD'"), 'IQD must use three fractional digits in the money engine');
let core = read('src/lib/financialCoreV2.js')
  .replace(/^import[^;]+;\s*/m, '')
  .replace(/export const /g, 'const ');
core += '\nmodule.exports={normalizeCurrencyCode,moneyToMinor,moneyFromMinor,convertMoney,buildCurrencyFields,buildTransferCurrencyFields};';
const currencyFractionDigits = currency => ['BHD','IQD','JOD','KWD','LYD','OMR','TND'].includes(String(currency).toUpperCase()) ? 3 : ['JPY','KRW'].includes(String(currency).toUpperCase()) ? 0 : 2;
const roundCurrency = (value, currency='IQD') => { const f=10**currencyFractionDigits(currency); return Math.round((Number(value)||0)*f)/f; };
const sandbox = { module:{exports:{}}, exports:{}, Math, Number, String, Object, Array, RegExp, currencyFractionDigits, roundCurrency };
vm.createContext(sandbox);
vm.runInContext(core, sandbox, { filename:'financialCoreV2.js' });
const api = sandbox.module.exports;
assert.equal(api.moneyToMinor(1.234, 'IQD'), 1234, 'IQD minor-unit conversion is wrong');
assert.equal(api.moneyToMinor(12.34, 'USD'), 1234, 'USD minor-unit conversion is wrong');
assert.throws(() => api.moneyToMinor(Number.MAX_SAFE_INTEGER, 'USD'), /safe integer range/, 'unsafe money values must fail closed instead of rounding silently');
const usdExpense = api.buildCurrencyFields({ amount:-100, walletId:'usd', wallets:[{id:'usd',currency:'USD'}], baseCurrency:'IQD', exchangeRate:1310 });
assert.equal(usdExpense.walletAmount, -100, 'native wallet amount changed');
assert.equal(usdExpense.baseAmount, -131000, 'historical base amount conversion is wrong');
const transfer = api.buildTransferCurrencyFields({ fromWalletId:'usd', toWalletId:'iqd', fromAmount:100, toAmount:131000, wallets:[{id:'usd',currency:'USD'},{id:'iqd',currency:'IQD'}], baseCurrency:'IQD', feeAmount:2 });
assert.equal(transfer.transferFromAmount, 100, 'transfer source amount wrong');
assert.equal(transfer.transferToAmount, 131000, 'transfer target amount wrong');
assert.equal(transfer.transferRate, 1310, 'transfer historical rate wrong');
assert.equal(transfer.feeBaseAmount, 2620, 'transfer fee base value wrong');

console.log('MYFI FINANCIAL CORE PHASE 2+3: PASSED');
