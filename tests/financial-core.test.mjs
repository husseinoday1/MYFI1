import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFinancialCoach, getBudgetRows, getBudgetSummary, normalizeBudgets, suggestBudgetsFromHistory } from '../src/lib/budgets.js';
import { getWalletBalances, getWalletMonthlyMovement, normalizeWallets } from '../src/lib/wallets.js';
import { analyzeSmartEntry } from '../src/lib/smartEntry.js';
import { normalizeCfg, normalizeHomeCards } from '../src/lib/constants.js';
import { buildChartData, buildFinancialSnapshot, byMonth, calcCashFlow, calcStats, catSpend, getUpcomingRecurring, pct } from '../src/utils/calc.js';
import { auditFinancialData } from '../src/lib/financialIntegrity.js';
import { useStore } from '../src/store/useStore.js';
import { formatNumberInput, normalizeNumberInput, parseNumberInput } from '../src/lib/numberInput.js';
import {
  FLOW_TYPES,
  filterByActiveScope,
  filterFeatureEntities,
  getTransactionDisplayAmount,
  getModules,
  normalizeLedgerTransaction,
  profileModuleDefaults,
} from '../src/lib/modules.js';
import { buildMyfiPackage, inspectMyfiPackage } from '../src/lib/myfiFiles.js';
import { secureAuthStorage } from '../src/lib/secureVault.js';
import { resolveSystemTheme } from '../src/lib/systemTheme.js';
import { getVisibleHistoryTransactions } from '../src/lib/history.js';
import { getTransactionTagLabel, inferTransactionTag, normalizeTransactionTag } from '../src/lib/transactionTags.js';
import { buildLeakInsights, suggestCategoryFromHistory } from '../src/lib/localIntelligence.js';
import { filterDismissedNotifications, notificationReadKey } from '../src/lib/notificationCenter.js';
import {
  buildSnapshotSignature,
  compareSnapshots,
  normalizedRowsToSnapshot,
} from '../src/lib/normalizedRepository.js';

const normalizedFixture = normalizedRowsToSnapshot({
  profile: { display_name: 'Test User', country_code: 'IQ', default_currency: 'IQD', language: 'ar' },
  workspace: { id: 'workspace-1', kind: 'personal', base_currency: 'IQD', default_wallet_id: 'wallet-uuid', app_settings: { theme: 'light', profileType: 'personal_business' } },
  categories: [{ id: 'category-uuid', legacy_id: 'food', name: 'Food', name_en: 'Food', icon: 'restaurant-outline', color: '#f00', sort_order: 2 }],
  wallets: [{ id: 'wallet-uuid', legacy_id: 'cash', name: 'Cash', name_en: 'Cash', wallet_type: 'cash', currency_code: 'IQD', opening_balance: 1000, scope: 'personal' }],
  debts: [{ id: 'debt-uuid', legacy_id: 'debt-1', name: 'Loan', direction: 'owed', total_amount: 500, archived_paid: 20, scope: 'personal' }],
  goals: [{ id: 'goal-uuid', legacy_id: 'goal-1', name: 'Trip', target_amount: 900, archived_saved: 40, scope: 'personal' }],
  commitments: [{ id: 'commitment-uuid', legacy_id: 'commit-1', name: 'Internet', amount: 50, due_day: 15, repeat_monthly: true, active: true, category_id: 'category-uuid', wallet_id: 'wallet-uuid', linked_type: 'debt', linked_id: 'debt-uuid' }],
  transactions: [{
    id: 'transaction-uuid', legacy_id: 'tx-1', title: 'Payment', amount: -30, date_on: '2026-01-02', flow_type: 'debt_payment',
    wallet_id: 'wallet-uuid', category_id: 'category-uuid', debt_id: 'debt-uuid', scope: 'personal',
    metadata: { legacy: { transactionTag: 'installment', paymentId: 'payment-1', isDebtPayment: true } },
  }],
  debtPayments: [{ id: 'payment-uuid', legacy_id: 'payment-1', debt_id: 'debt-uuid', amount: 30, paid_on: '2026-01-02' }],
  goalSavings: [{ id: 'saving-uuid', legacy_id: 'saving-1', goal_id: 'goal-uuid', amount: 60, saved_on: '2026-01-03' }],
  tags: [{ id: 'tag-uuid', legacy_id: 'tag:installment', name: 'installment' }],
  transactionTags: [{ transaction_id: 'transaction-uuid', tag_id: 'tag-uuid' }],
}, { currency: 'USD', defaultWalletId: null }, {});

assert.equal(normalizedFixture.cfg.currency, 'IQD');
assert.equal(normalizedFixture.cfg.theme, 'light');
assert.equal(normalizedFixture.cfg.profileType, 'personal_business');
assert.equal(normalizedFixture.cfg.defaultWalletId, 'cash');
assert.equal(normalizedFixture.data.wallets[0].scope, 'personal');
assert.equal(normalizedFixture.data.debts[0].paid, 50);
assert.equal(normalizedFixture.data.goals[0].cur, 100);
assert.equal(normalizedFixture.data.commitments[0].linkedId, 'debt-1');
assert.equal(normalizedFixture.data.trans[0].walletId, 'cash');
assert.equal(normalizedFixture.data.trans[0].transactionTag, 'installment');
assert.equal(buildSnapshotSignature(normalizedFixture).totals.walletBalances.cash, 970);
assert.equal(compareSnapshots(normalizedFixture, normalizedFixture).passed, true);
const changedNormalizedFixture = JSON.parse(JSON.stringify(normalizedFixture));
changedNormalizedFixture.data.trans[0].amt = -31;
assert.equal(compareSnapshots(normalizedFixture, changedNormalizedFixture).passed, false);

assert.equal(inferTransactionTag({ flowType: FLOW_TYPES.DEBT_PAYMENT }), 'debt_owed');
assert.equal(inferTransactionTag({ flowType: FLOW_TYPES.RECEIVABLE_COLLECTION }), 'debt_receivable');
assert.equal(inferTransactionTag({ isGoalSaving: true }), 'saving');
assert.equal(inferTransactionTag({ isCommitmentPayment: true, isDebtPayment: true }), 'commitment');
assert.equal(normalizeTransactionTag({ transactionTag: 'installment' }).transactionTag, 'installment');
assert.equal(getTransactionTagLabel('saving', 'ar'), 'توفير');
assert.equal(normalizeCfg({ lockDelaySeconds: 900 }).lockDelaySeconds, 900);
assert.equal(normalizeCfg({ lockDelaySeconds: 5 }).lockDelaySeconds, 300);
assert.equal(resolveSystemTheme('dark'), 'dark', 'system dark mode must stay dark');
assert.equal(resolveSystemTheme('light'), 'light', 'system light mode must stay light');
assert.equal(resolveSystemTheme(null, 'light'), 'light', 'unknown system mode must preserve the current theme');
const historicalInsights = buildLeakInsights([
  { id: 'history-jan', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-01-10' },
  { id: 'history-feb', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-02-10' },
  { id: 'history-mar', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-03-10' },
], [{ id: 'food', label: 'Food', labelEn: 'Food' }], new Date('2026-03-15T12:00:00'));
assert.equal(historicalInsights.history.baselineMonthCount, 2, 'insights must use all earlier recorded months as a baseline');
assert.equal(historicalInsights.history.monthCount, 3, 'insights must retain the full recorded history');
assert.equal(historicalInsights.topLeak?.id, 'food', 'current spending must be compared with the historical category baseline');
assert.equal(
  suggestCategoryFromHistory('Corner coffee', [{ title: 'Corner coffee', cat: 'food', amt: -1 }]),
  'food',
  'manual entry titles must learn an expense category from the ledger',
);
assert.equal(
  suggestCategoryFromHistory('August salary', [{ title: 'August salary', cat: 'salary', amt: 1 }], { flow: 'income' }),
  'salary',
  'manual income titles must learn independently from income history',
);
const notificationFixture = { id: 'history-alert', fingerprint: 'fixture', body: 'fixture' };
assert.deepEqual(
  filterDismissedNotifications([notificationFixture], [notificationReadKey(notificationFixture)]),
  [],
  'dismissed notifications must stay out of the notification center',
);
assert.deepEqual(
  getVisibleHistoryTransactions([{ id: 'legacy-personal', scope: 'personal' }], { profileType: 'business' }).map(item => item.id),
  ['legacy-personal'],
  'history must not look empty when old transactions use a different legacy scope',
);
assert.deepEqual(
  getVisibleHistoryTransactions([
    { id: 'visible-business', scope: 'business' },
    { id: 'older-personal', scope: 'personal' },
  ], { profileType: 'business' }).map(item => item.id),
  ['visible-business', 'older-personal'],
  'history must remain a full ledger, not only the currently scoped subset',
);
assert.equal(
  getVisibleHistoryTransactions([{ id: 'linked-hidden-feature', scope: 'personal', isGoalSaving: true }], { profileType: 'personal' }).length,
  1,
  'history must preserve linked ledger entries even when their feature is hidden',
);

assert.equal(
  getTransactionDisplayAmount({ isGoalSaving: true, allocationAmount: 125, amt: 0 }),
  -125,
  'goal saving must show its real amount in History and exports',
);
assert.equal(
  getTransactionDisplayAmount({ flowType: FLOW_TYPES.GOAL_ALLOCATION, allocationAmount: 300, amt: 0 }),
  -300,
  'goal allocations must display allocationAmount even when wallet amt is zero',
);
assert.equal(getTransactionDisplayAmount({ kind: 'transfer', transferAmount: 80 }), 80);
assert.equal(profileModuleDefaults('personal').goals, true);
assert.equal(profileModuleDefaults('personal').wallets, false);
assert.equal(profileModuleDefaults('business').goals, false);
assert.equal(profileModuleDefaults('business').debtsReceivable, true);
assert.equal(profileModuleDefaults('personal_business').wallets, true);

const recurringTemplate = {
  id: 'monthly-rent-july', recurringGroupId: 'monthly-rent', recurring: true,
  title: 'Rent', amt: -500, cat: 'rent', dateISO: '2026-07-31',
};
assert.equal(
  getUpcomingRecurring([recurringTemplate], new Date('2026-08-15T12:00:00'))[0]?.dueISO,
  '2026-08-31',
  'monthly entries must be suggested for confirmation without creating a transaction automatically',
);
assert.equal(
  getUpcomingRecurring([recurringTemplate], new Date('2027-02-15T12:00:00'))[0]?.dueISO,
  '2027-02-28',
  'monthly due dates must clamp safely to shorter months',
);
assert.equal(
  getUpcomingRecurring([
    recurringTemplate,
    { ...recurringTemplate, id: 'monthly-rent-august', dateISO: '2026-08-31' },
  ], new Date('2026-08-15T12:00:00')).length,
  0,
  'a confirmed occurrence must prevent a duplicate suggestion in the same month',
);

assert.equal(parseNumberInput('٣٬٥٠٠'), 3500, 'Arabic-Indic amounts must be accepted in transaction forms');
assert.equal(parseNumberInput('١٢٫٥٠'), 12.5, 'Arabic decimal separators must be accepted');
assert.equal(parseNumberInput('۱۲,۵۰۰'), 12500, 'Persian digits must be accepted');
assert.equal(normalizeNumberInput('1,250.75'), '1250.75');
assert.equal(formatNumberInput('100'), '100');
assert.equal(formatNumberInput('1000'), '1,000');
assert.equal(formatNumberInput('1000000'), '1,000,000');
assert.equal(formatNumberInput('١٢٥٠٠٫٥'), '12,500.5');
assert.equal(parseNumberInput(formatNumberInput('9876543')), 9876543);

const wallets = normalizeWallets([
  { id: 'cash', name: 'Cash', openingBalance: 1000, currency: 'IQD', scope: 'personal' },
  { id: 'bank', name: 'Bank', openingBalance: 500, currency: 'IQD', scope: 'business' },
]);
const transactions = [
  { id: 'income', amt: 1000, walletId: 'cash', cat: 'salary', dateISO: '2026-07-01' },
  { id: 'food', amt: -300, walletId: 'cash', cat: 'food', dateISO: '2026-07-03' },
  { id: 'transfer', kind: 'transfer', transferAmount: 400, fromWalletId: 'cash', toWalletId: 'bank', fromScope: 'personal', toScope: 'business', scope: 'personal', dateISO: '2026-07-04' },
];

const balances = getWalletBalances(wallets, transactions, 'IQD', 'cash');
assert.equal(balances.find(item => item.id === 'cash').balance, 1300, 'transfer must reduce the source wallet only once');
assert.equal(balances.find(item => item.id === 'bank').balance, 900, 'transfer must increase the destination wallet');
assert.equal(balances.reduce((sum, item) => sum + item.balance, 0), 2200, 'transfer must not inflate total balance');
assert.equal(getWalletBalances([wallets[0]], transactions, 'IQD', 'cash')[0].balance, 1300, 'cross-scope transfer must reduce a visible source wallet');
assert.equal(getWalletBalances([wallets[1]], transactions, 'IQD', 'bank')[0].balance, 900, 'cross-scope transfer must increase a visible target wallet');
assert.equal(filterByActiveScope(transactions, { profileType: 'personal_business', activeScope: 'personal' }).some(item => item.id === 'transfer'), true);
assert.equal(filterByActiveScope(transactions, { profileType: 'personal_business', activeScope: 'business' }).some(item => item.id === 'transfer'), true);

const movement = getWalletMonthlyMovement(wallets, transactions, 'IQD', 'cash', '2026-07');
assert.equal(movement.find(item => item.id === 'cash').monthNet, 300, 'monthly wallet movement must include income, expense, and outgoing transfers');
assert.equal(movement.find(item => item.id === 'bank').monthNet, 400, 'monthly wallet movement must include incoming transfers');
assert.equal(movement.reduce((sum, item) => sum + item.monthNet, 0), 700, 'transfers must cancel out in total monthly movement');

assert.deepEqual(normalizeBudgets({ food: '500', rent: 0, bad: -10 }), { food: 500 });
const categories = [{ id: 'food' }, { id: 'salary' }];
const rows = getBudgetRows(transactions, categories, { food: 500 }, new Date('2026-07-15T12:00:00'));
assert.equal(rows[0].spent, 300);
assert.equal(rows[0].remaining, 200);
assert.equal(rows[0].status, 'ok');
assert.deepEqual(getBudgetSummary(rows), { limit: 500, spent: 300, remaining: 200, percent: 60, over: 0, near: 0 });

const coach = buildFinancialCoach(transactions, new Date('2026-07-15T12:00:00'));
assert.equal(coach.income, 1000);
assert.equal(coach.expense, 300);
assert.equal(coach.net, 700);
assert.equal(coach.savingsRate, 70);

const suggestions = suggestBudgetsFromHistory([
  { amt: -1200, cat: 'food', dateISO: '2026-04-01' },
  { amt: -1800, cat: 'food', dateISO: '2026-05-01' },
  { amt: -1500, cat: 'food', dateISO: '2026-06-01' },
], categories, new Date('2026-07-15T12:00:00'));
assert.equal(suggestions.food, 2000, 'three-month suggestion should round the average up to the nearest thousand');
const latestThreeSuggestions = suggestBudgetsFromHistory([
  { amt: -9000, cat: 'food', dateISO: '2026-03-01' },
  { amt: -1200, cat: 'food', dateISO: '2026-04-01' },
  { amt: -1800, cat: 'food', dateISO: '2026-05-01' },
  { amt: -1500, cat: 'food', dateISO: '2026-06-01' },
], categories, new Date('2026-07-15T12:00:00'));
assert.equal(latestThreeSuggestions.food, 2000, 'budget suggestions must ignore history older than the latest three completed months');

const reportMonth = byMonth(transactions, 6, 2026).filter(item => item.kind !== 'transfer');
assert.deepEqual(calcStats(reportMonth), { inc: 1000, exp: 300, bal: 700 });
assert.equal(catSpend(reportMonth, [{ id: 'food' }])[0].spent, 300);
const linkedFlows = [
  { amt: 1000, flowType: FLOW_TYPES.INCOME },
  { amt: -200, flowType: FLOW_TYPES.EXPENSE, cat: 'food' },
  { amt: -300, flowType: FLOW_TYPES.DEBT_PAYMENT, cat: 'other' },
  { amt: 150, flowType: FLOW_TYPES.RECEIVABLE_COLLECTION, cat: 'other' },
  { amt: 0, allocationAmount: 125, flowType: FLOW_TYPES.GOAL_ALLOCATION, cat: 'other' },
];
assert.deepEqual(
  calcStats(linkedFlows),
  { inc: 1000, exp: 200, bal: 800 },
  'linked balance movements must not be counted as income or expense',
);
assert.deepEqual(calcCashFlow(linkedFlows), { inflow: 1150, outflow: 625, net: 525 }, 'cash flow must include linked wallet movements');
assert.equal(pct(120, 100), 120, 'progress must expose values over 100%');
assert.equal(pct(120, 100, { cap: true }), 100, 'capped progress remains available for visual bars');
assert.equal(
  buildChartData([{ amt: 50, dateISO: '2026-07-01' }], 100, new Date('2026-07-15T12:00:00'))[0].bal,
  150,
  'balance chart must start at the supplied opening balance',
);
assert.equal(catSpend(linkedFlows, [{ id: 'food' }, { id: 'other' }]).length, 1);
assert.equal(normalizeLedgerTransaction({ amt: -20, isGoalSaving: true }).flowType, FLOW_TYPES.GOAL_ALLOCATION);

const mixedCfg = normalizeCfg({
  profileType: 'personal_business',
  activeScope: 'business',
  enabledModules: { debtsOwed: false, debtsReceivable: true, goals: false, commitments: true },
});
assert.deepEqual(filterByActiveScope([
  { id: 'p', scope: 'personal' },
  { id: 'b', scope: 'business' },
], mixedCfg).map(item => item.id), ['p', 'b'], 'dual usage must combine personal and business data in one workspace');
const visibleFeatures = filterFeatureEntities({
  debts: [
    { id: 'owed', direction: 'owed', scope: 'business' },
    { id: 'receivable', direction: 'receivable', scope: 'business' },
  ],
  goals: [{ id: 'goal', scope: 'business' }],
  commitments: [
    { id: 'hidden-linked', linkedType: 'debt', scope: 'business' },
    { id: 'visible-standalone', linkedType: 'none', scope: 'business' },
  ],
  cfg: mixedCfg,
});
assert.deepEqual(visibleFeatures.debts.map(item => item.id), ['receivable']);
assert.deepEqual(visibleFeatures.goals, []);
assert.deepEqual(visibleFeatures.commitments.map(item => item.id), ['visible-standalone']);
assert.equal(getModules(mixedCfg).recurring, true);
const reportSnapshot = buildFinancialSnapshot({
  trans: transactions,
  debts: [{ total: 500, paid: 200, direction: 'owed' }],
  goals: [{ target: 1000, cur: 250 }],
  cats: [{ id: 'food' }],
}, new Date('2026-07-15T12:00:00'));
assert.equal(reportSnapshot.month.bal, 700);
assert.equal(reportSnapshot.debts.remaining, 300);
assert.equal(reportSnapshot.goals.saved, 250);
assert.deepEqual(reportSnapshot.cashFlow, { inflow: 1000, outflow: 300, net: 700 });

const integrity = auditFinancialData({
  trans: [
    { id: 'pay-tx', amt: -100, walletId: 'cash', dateISO: '2026-07-10', isDebtPayment: true, debtId: 'debt', paymentId: 'pay' },
    { id: 'commit-tx', amt: -50, walletId: 'cash', dateISO: '2026-07-11', isCommitmentPayment: true, commitmentId: 'commit', commitmentMonth: '2026-07' },
  ],
  debts: [{ id: 'debt', total: 500, paid: 100, payments: [{ id: 'pay', amt: 100, date: '2026-07-10' }] }],
  commitments: [{ id: 'commit', lastPaidMonth: '2026-07' }],
  wallets: [{ id: 'cash', openingBalance: 1000 }],
  defaultWalletId: 'cash',
});
assert.equal(integrity.ok, true, 'fully linked financial data must pass integrity checks');

const demo = JSON.parse(fs.readFileSync('sample-data/MYFI-demo-5-months.json', 'utf8'));
const demoIntegrity = auditFinancialData(demo);
assert.equal(demo.trans.length, 60, 'demo data must keep exactly 60 transactions');
assert.equal(demoIntegrity.ok, true, `demo financial relationships must be healthy: ${JSON.stringify(demoIntegrity.issues)}`);

const smartCats = [
  { id: 'food', label: 'طعام', labelEn: 'Food' },
  { id: 'salary', label: 'راتب', labelEn: 'Salary' },
  { id: 'other', label: 'أخرى', labelEn: 'Other' },
];
const receiptDraft = analyzeSmartEntry({
  text: 'Coffee Shop\nTOTAL 12.50 USD',
  cats: smartCats,
  wallets,
  lang: 'en',
});
assert.equal(receiptDraft.amount, 12.5, 'OCR decimals must remain decimals');
assert.equal(receiptDraft.catId, 'food');
assert.equal(receiptDraft.type, 'exp');
const structuredReceiptDraft = analyzeSmartEntry({
  text: 'MERCHANT: Coffee House\nTOTAL: 12.50 USD\nDATE: 2026-07-23\nCATEGORY: food\nRECEIPT TEXT:\nSUBTOTAL 10.00\nTAX 2.50',
  cats: smartCats,
  wallets,
  lang: 'en',
});
assert.equal(structuredReceiptDraft.amount, 12.5, 'structured receipt total must win over subtotal and tax');
assert.equal(structuredReceiptDraft.title, 'Coffee House');
assert.equal(structuredReceiptDraft.catId, 'food');
assert.equal(structuredReceiptDraft.dateISO, '2026-07-23');
const voiceDraft = analyzeSmartEntry({
  text: 'دفعت قهوة ٣٬٥٠٠ دينار من Cash',
  cats: smartCats,
  wallets,
  lang: 'en',
});
assert.equal(voiceDraft.amount, 3500, 'Arabic voice digits must parse correctly');
assert.equal(voiceDraft.walletId, 'cash');

const reorderedHomeCards = normalizeHomeCards([
  { key: 'expense', visible: true },
  { key: 'income', visible: true },
  { key: 'dueSoon', visible: false },
  { key: 'net', visible: true },
]);
assert.deepEqual(
  reorderedHomeCards.map(item => item.key),
  ['expense', 'income', 'dueSoon', 'net'],
  'home-card normalization must preserve the monthly due card',
);
assert.equal(reorderedHomeCards[2].visible, false, 'home-card visibility must survive reordering');

const independentLocaleCfg = normalizeCfg({ country: 'US', currency: 'IQD' });
assert.equal(independentLocaleCfg.country, 'US', 'country must be stored independently');
assert.equal(independentLocaleCfg.currency, 'IQD', 'currency must not be overwritten by country');

const runLinkedStoreAssertions = async () => {
  await secureAuthStorage.setItem('myfi-auth-test', '{"access_token":"private"}');
  assert.equal(await secureAuthStorage.getItem('myfi-auth-test'), '{"access_token":"private"}');
  await secureAuthStorage.removeItem('myfi-auth-test');
  assert.equal(await secureAuthStorage.getItem('myfi-auth-test'), null);

  const initialCfg = useStore.getState().cfg;
  const expectedStoreActions = [
    'setUser',
    'loadLocal',
    'saveLocal',
    'syncCloud',
    'loadCloud',
    'transferGuestToCurrent',
    'resolveSyncConflict',
    'addTrans',
    'duplicateTrans',
    'addTransfer',
    'deleteTransMany',
    'addDebt',
    'payDebt',
    'saveGoal',
    'releaseGoalSavings',
    'payCommitment',
    'addWallet',
    'deleteCategoriesMany',
    'enterDemoMode',
    'buildYearArchive',
    'importBackup',
  ];
  expectedStoreActions.forEach(actionName => {
    assert.equal(typeof useStore.getState()[actionName], 'function', `${actionName} must be composed into the store`);
  });

  useStore.setState({
    trans: [],
    debts: [],
    goals: [],
    commitments: [],
    wallets: [
      ...wallets,
      { id: 'savings', name: 'Savings', openingBalance: 200, currency: 'IQD', scope: 'personal' },
    ],
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  await useStore.getState().addTrans({ amt: 250, cat: 'salary', walletId: 'cash', dateISO: '2026-07-02' });
  let state = useStore.getState();
  const addedTx = state.trans.find(item => item.amt === 250 && item.cat === 'salary');
  assert.ok(addedTx, 'transaction slice must add a normal transaction');
  assert.equal(addedTx.flowType, FLOW_TYPES.INCOME);
  assert.equal(await useStore.getState().duplicateTrans(addedTx.id), true);
  state = useStore.getState();
  assert.equal(
    state.trans.filter(item => item.cat === 'salary' && item.amt === 250).length,
    2,
    'transaction slice must duplicate editable transactions',
  );
  assert.equal(await useStore.getState().addTransfer({ fromWalletId: 'cash', toWalletId: 'bank', amount: 75, dateISO: '2026-07-03' }), true);
  state = useStore.getState();
  const crossScopeTransfer = state.trans.find(item => item.kind === 'transfer');
  assert.equal(crossScopeTransfer.fromScope, 'personal');
  assert.equal(crossScopeTransfer.toScope, 'business');
  const transferCount = state.trans.filter(item => item.kind === 'transfer').length;
  assert.equal(await useStore.getState().addTransfer({ fromWalletId: 'cash', toWalletId: 'savings', amount: 5000 }), false);
  assert.equal(useStore.getState().trans.filter(item => item.kind === 'transfer').length, transferCount, 'insufficient transfer must not be stored');
  assert.equal(await useStore.getState().addTransfer({ fromWalletId: 'cash', toWalletId: 'savings', amount: -10 }), false);
  assert.equal(await useStore.getState().editTrans(crossScopeTransfer.id, { transferAmount: 5000 }), false);
  assert.equal(useStore.getState().trans.find(item => item.id === crossScopeTransfer.id).transferAmount, 75, 'invalid transfer edit must preserve the original amount');
  assert.equal(await useStore.getState().editTrans(crossScopeTransfer.id, { toWalletId: 'savings' }), true);
  assert.equal(useStore.getState().trans.find(item => item.id === crossScopeTransfer.id).toWalletId, 'savings', 'transfer edits must accept another wallet scope');

  useStore.setState({
    trans: [],
    debts: [{ id: 'debt-1', name: 'Loan', total: 1000, paid: 0, payments: [], direction: 'owed' }],
    goals: [{ id: 'goal-1', name: 'Reserve', target: 800, cur: 0, savings: [] }],
    commitments: [{ id: 'commit-1', name: 'Internet', amt: 100, day: 10, active: true, repeatMonthly: true, walletId: 'cash', linkedType: 'none', linkedId: null }],
    wallets,
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });

  assert.equal(await useStore.getState().payDebt('debt-1', 200, '2026-07-05', 'cash'), 200);
  state = useStore.getState();
  let linkedTx = state.trans.find(item => item.isDebtPayment);
  assert.equal(state.debts[0].paid, 200);
  assert.equal(linkedTx.amt, -200);
  await state.editTrans(linkedTx.id, { amt: -350, dateISO: '2026-07-06' });
  state = useStore.getState();
  linkedTx = state.trans.find(item => item.isDebtPayment);
  assert.equal(state.debts[0].paid, 350, 'editing a linked transaction must edit the debt payment');
  assert.equal(linkedTx.dateISO, '2026-07-06');
  await state.deleteTrans(linkedTx.id);
  state = useStore.getState();
  assert.equal(state.debts[0].paid, 0, 'deleting a linked transaction must reverse the debt payment');

  assert.equal(await state.saveGoal('goal-1', 125, '2026-07-07', 'bank'), 125);
  state = useStore.getState();
  const goalTx = state.trans.find(item => item.isGoalSaving);
  assert.equal(state.goals[0].cur, 125);
  assert.equal(goalTx.amt, 0);
  assert.equal(goalTx.allocationAmount, 125);
  assert.equal(goalTx.walletId, 'bank');

  const commitmentResult = await state.payCommitment('commit-1', '2026-07-10', 'cash');
  assert.equal(commitmentResult.ok, true);
  assert.equal(commitmentResult.appliedAmount, 100);
  state = useStore.getState();
  const commitmentTx = state.trans.find(item => item.isCommitmentPayment);
  assert.equal(state.commitments[0].lastPaidMonth, '2026-07');
  await state.editTrans(commitmentTx.id, { dateISO: '2026-08-10', amt: -100 });
  state = useStore.getState();
  assert.equal(state.commitments[0].lastPaidMonth, '2026-08', 'editing a commitment transaction date must update its paid month');
  await state.deleteTrans(commitmentTx.id);
  assert.equal(useStore.getState().commitments[0].lastPaidMonth, null, 'deleting a commitment transaction must reopen it');

  useStore.setState({
    wallets,
    trans: [{ id: 't1', kind: 'transfer', transferAmount: 50, fromWalletId: 'cash', toWalletId: 'bank', dateISO: '2026-07-01' }],
    commitments: [],
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
  });
  assert.equal(await useStore.getState().deleteWallet('bank'), true);
  assert.equal(useStore.getState().trans.length, 0, 'deleting a wallet must not leave a self-transfer behind');

  useStore.setState({
    wallets,
    trans: [
      {
        id: 'bulk-debt-tx',
        amt: -120,
        isDebtPayment: true,
        debtId: 'bulk-debt',
        paymentId: 'bulk-debt-payment',
        isCommitmentPayment: true,
        commitmentId: 'bulk-commitment',
        commitmentMonth: '2026-07',
        dateISO: '2026-07-10',
      },
      {
        id: 'bulk-goal-tx',
        amt: -80,
        isGoalSaving: true,
        goalId: 'bulk-goal',
        savingId: 'bulk-goal-saving',
        dateISO: '2026-07-11',
      },
    ],
    debts: [{
      id: 'bulk-debt',
      total: 500,
      paid: 120,
      payments: [{ id: 'bulk-debt-payment', amt: 120, date: '2026-07-10' }],
      direction: 'owed',
    }],
    goals: [{
      id: 'bulk-goal',
      target: 400,
      cur: 80,
      savings: [{ id: 'bulk-goal-saving', amt: 80, date: '2026-07-11' }],
    }],
    commitments: [{
      id: 'bulk-commitment',
      name: 'Linked',
      amt: 120,
      active: true,
      repeatMonthly: true,
      lastPaidMonth: '2026-07',
      linkedType: 'debt',
      linkedId: 'bulk-debt',
      walletId: 'cash',
    }],
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  assert.equal(
    await useStore.getState().deleteTransMany(['bulk-debt-tx', 'bulk-goal-tx']),
    true,
  );
  state = useStore.getState();
  assert.equal(state.trans.length, 0, 'bulk transaction delete must remove every selected ledger row');
  assert.equal(state.debts[0].paid, 0, 'bulk transaction delete must reverse linked debt payments');
  assert.equal(state.goals[0].cur, 0, 'bulk transaction delete must reverse linked goal savings');
  assert.equal(state.commitments[0].lastPaidMonth, null, 'bulk transaction delete must reopen linked commitments');

  useStore.setState({
    wallets,
    trans: [
      { id: 'tracker-debt-tx', isDebtPayment: true, debtId: 'tracker-debt', paymentId: 'tracker-debt-payment' },
      { id: 'tracker-goal-tx', isGoalSaving: true, goalId: 'tracker-goal', savingId: 'tracker-goal-saving' },
      { id: 'tracker-plan-tx', isCommitmentPayment: true, commitmentId: 'tracker-plan' },
    ],
    debts: [{ id: 'tracker-debt', total: 100, paid: 20, payments: [{ id: 'tracker-debt-payment', amt: 20 }], direction: 'owed' }],
    goals: [{ id: 'tracker-goal', target: 100, cur: 10, savings: [{ id: 'tracker-goal-saving', amt: 10 }] }],
    commitments: [
      { id: 'tracker-linked-plan', linkedType: 'debt', linkedId: 'tracker-debt', lastPaidMonth: '2026-07' },
      { id: 'tracker-plan', linkedType: 'none', linkedId: null, lastPaidMonth: '2026-07' },
    ],
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  assert.equal(await useStore.getState().deleteTrackersMany([
    { kind: 'owed', sourceId: 'tracker-debt' },
    { kind: 'saving', sourceId: 'tracker-goal' },
    { kind: 'monthly', sourceId: 'tracker-plan' },
  ]), true);
  state = useStore.getState();
  assert.equal(state.debts.length, 0);
  assert.equal(state.goals.length, 0);
  assert.equal(state.trans.length, 0, 'bulk tracker delete must remove linked ledger rows');
  assert.equal(state.commitments.length, 0, 'plans linked to removed trackers must be deleted with their source trackers');

  useStore.setState({
    wallets,
    trans: [],
    debts: [{ id: 'single-debt', total: 100, paid: 0, payments: [], direction: 'owed' }],
    goals: [],
    commitments: [
      { id: 'single-debt-plan', linkedType: 'debt', linkedId: 'single-debt' },
      { id: 'standalone-plan', linkedType: 'none', linkedId: null },
    ],
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  assert.equal(await useStore.getState().deleteDebt('single-debt'), true);
  assert.deepEqual(useStore.getState().commitments.map(item => item.id), ['standalone-plan'], 'single debt delete must remove its linked commitment');

  useStore.setState({
    wallets,
    trans: [],
    debts: [],
    goals: [{ id: 'single-goal', target: 100, cur: 0, savings: [] }],
    commitments: [
      { id: 'single-goal-plan', linkedType: 'goal', linkedId: 'single-goal' },
      { id: 'standalone-plan', linkedType: 'none', linkedId: null },
    ],
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  await useStore.getState().deleteGoal('single-goal');
  assert.deepEqual(useStore.getState().commitments.map(item => item.id), ['standalone-plan'], 'single goal delete must remove its linked commitment');

  useStore.setState({
    wallets,
    trans: [{
      id: 'reserve-goal-allocation',
      amt: 0,
      allocationAmount: 100,
      walletId: 'cash',
      isGoalSaving: true,
      goalId: 'reserve-goal',
      savingId: 'reserve-goal-saving',
      dateISO: '2026-07-12',
    }],
    debts: [],
    goals: [{
      id: 'reserve-goal',
      name: 'Reserved savings',
      target: 100,
      cur: 100,
      purpose: 'reserve',
      status: 'active',
      savings: [{
        id: 'reserve-goal-saving',
        amt: 100,
        date: '2026-07-12',
      }],
      scope: 'personal',
    }],
    commitments: [{
      id: 'reserve-goal-plan',
      linkedType: 'goal',
      linkedId: 'reserve-goal',
      active: true,
    }],
    cfg: {
      ...initialCfg,
      currency: 'IQD',
      defaultWalletId: 'cash',
    },
    user: null,
  });

  assert.equal(
    await useStore.getState().releaseGoalSavings('reserve-goal', '2026-07-13'),
    true,
  );

  state = useStore.getState();

  assert.equal(state.goals[0].status, 'released');
  assert.equal(state.goals[0].settledAmount, 100);
  assert.equal(
    state.trans.some(item =>
      item.isGoalSaving &&
      item.goalId === 'reserve-goal' &&
      item.allocationReleased === true
    ),
    true,
    'releasing savings must preserve financial history and stop reserving the amount',
  );
  assert.equal(
    state.commitments[0].active,
    false,
    'a plan linked to a released saving goal must stop',
  );

  const threeWallets = normalizeWallets([
    { id: 'cash', name: 'Cash', openingBalance: 0, currency: 'IQD' },
    { id: 'bank', name: 'Bank', openingBalance: 0, currency: 'IQD' },
    { id: 'card', name: 'Card', openingBalance: 0, currency: 'IQD' },
  ]);
  useStore.setState({
    wallets: threeWallets,
    trans: [
      { id: 'wallet-expense', amt: -20, walletId: 'bank' },
      { id: 'wallet-transfer', kind: 'transfer', transferAmount: 10, fromWalletId: 'bank', toWalletId: 'card' },
    ],
    commitments: [{ id: 'wallet-plan', walletId: 'card' }],
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  assert.equal(await useStore.getState().deleteWalletsMany(['bank', 'card']), true);
  state = useStore.getState();
  assert.deepEqual(state.wallets.map(item => item.id), ['cash']);
  assert.equal(state.trans.length, 1, 'bulk wallet delete must remove transfers that collapse into one wallet');
  assert.equal(state.trans[0].walletId, 'cash');
  assert.equal(state.commitments[0].walletId, 'cash');

  useStore.setState({
    cats: [{ id: 'food' }, { id: 'rent' }, { id: 'other' }],
    trans: [{ id: 'food-tx', cat: 'food' }, { id: 'rent-tx', cat: 'rent' }],
    commitments: [{ id: 'rent-plan', cat: 'rent' }],
    cfg: {
      ...initialCfg,
      currency: 'IQD',
      defaultWalletId: 'cash',
      categoryBudgets: { food: 100, rent: 200 },
    },
    user: null,
  });
  assert.equal(await useStore.getState().deleteCategoriesMany(['food', 'rent', 'other']), true);
  state = useStore.getState();
  assert.deepEqual(state.cats.map(item => item.id), ['other']);
  assert.ok(state.trans.every(item => item.cat === 'other'));
  assert.equal(state.commitments[0].cat, 'other');
  assert.deepEqual(state.cfg.categoryBudgets, {});

  const archiveWallets = normalizeWallets([
    { id: 'archive-cash', name: 'Cash', openingBalance: 1000, currency: 'IQD', scope: 'personal' },
    { id: 'archive-business', name: 'Business cash', openingBalance: 2000, currency: 'IQD', scope: 'business' },
  ]);
  useStore.setState({
    trans: [
      { id: 'old-income', amt: 500, flowType: 'income', walletId: 'archive-cash', dateISO: '2024-01-01', cat: 'salary', scope: 'personal' },
      { id: 'old-debt', amt: -100, flowType: 'debt_payment', walletId: 'archive-cash', dateISO: '2024-02-01', cat: 'other', scope: 'personal', isDebtPayment: true, debtId: 'archive-debt', paymentId: 'archive-payment' },
      { id: 'old-business-income', amt: 900, flowType: 'income', walletId: 'archive-business', dateISO: '2024-03-01', cat: 'salary', scope: 'business' },
      { id: 'current-expense', amt: -50, flowType: 'expense', walletId: 'archive-cash', dateISO: '2026-07-01', cat: 'food', scope: 'personal' },
    ],
    debts: [{
      id: 'archive-debt', name: 'Old debt', total: 300, paid: 100, archivedPaid: 0, direction: 'owed',
      payments: [{ id: 'archive-payment', amt: 100, date: '2024-02-01' }], scope: 'personal',
    }],
    goals: [],
    wallets: archiveWallets,
    commitments: [],
    cats: categories,
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'archive-cash', archiveSummaries: [] },
    user: null,
  });
  const beforeArchiveBalance = getWalletBalances(archiveWallets, useStore.getState().trans, 'IQD', 'archive-cash')[0].balance;
  const archiveData = useStore.getState().buildYearArchive(2024);
  assert.equal(archiveData.trans.length, 2);
  const archivePackage = await buildMyfiPackage({ kind: 'year_archive', data: archiveData, year: 2024 });
  const inspectedArchive = await inspectMyfiPackage(archivePackage.base64);
  assert.equal(inspectedArchive.payload.kind, 'year_archive');
  assert.equal(inspectedArchive.payload.data.trans.length, 2);
  assert.ok(inspectedArchive.csv.includes('old-income'));
  assert.equal(await useStore.getState().commitYearArchive(2024, archivePackage.checksum), true);
  state = useStore.getState();
  assert.deepEqual(state.trans.map(item => item.id), ['old-business-income', 'current-expense']);
  assert.equal(state.debts[0].archivedPaid, 100);
  assert.equal(state.debts[0].paid, 100);
  const afterArchiveBalance = getWalletBalances(state.wallets, state.trans, 'IQD', 'archive-cash')[0].balance;
  assert.equal(afterArchiveBalance, beforeArchiveBalance, 'annual archive must preserve wallet balance');
  assert.equal(state.cfg.archiveSummaries[0].year, 2024);

  const fullPackage = await buildMyfiPackage({
    kind: 'full_backup',
    data: JSON.parse(useStore.getState().exportBackup()),
  });
  const inspectedBackup = await inspectMyfiPackage(fullPackage.base64);
  assert.equal(inspectedBackup.payload.kind, 'full_backup');
  assert.equal(inspectedBackup.payload.format, 'MYFI');
  const encryptedPackage = await buildMyfiPackage({
    kind: 'full_backup',
    data: JSON.parse(useStore.getState().exportBackup()),
    password: 'correct-horse-42',
  });
  const lockedBackup = await inspectMyfiPackage(encryptedPackage.base64);
  assert.equal(lockedBackup.passwordRequired, true);
  assert.equal(lockedBackup.payload, null);
  await assert.rejects(
    () => inspectMyfiPackage(encryptedPackage.base64, { password: 'wrong-password' }),
    /password/i,
  );
  const unlockedBackup = await inspectMyfiPackage(encryptedPackage.base64, { password: 'correct-horse-42' });
  assert.equal(unlockedBackup.payload.kind, 'full_backup');
  assert.equal(unlockedBackup.encrypted, true);

  const realIds = useStore.getState().trans.map(item => item.id);
  assert.equal(await useStore.getState().enterDemoMode(), true);
  assert.equal(useStore.getState().cfg.demoMode, true);
  assert.ok(useStore.getState().trans.some(item => item.id === 'demo_salary_0'));
  const demoMonthCounts = useStore.getState().trans.reduce((map, tx) => {
    const key = String(tx.dateISO || '').slice(0, 7);
    if (key) map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
  assert.equal(demoMonthCounts.size, 12, 'demo mode must cover a full year of monthly examples');
  assert.ok(
    [...demoMonthCounts.values()].every(count => count >= 10),
    'demo mode must include at least ten transactions in every sample month',
  );
  assert.ok(useStore.getState().trans.some(item => item.kind === 'transfer'), 'demo mode must include wallet transfers');
  assert.ok(useStore.getState().trans.some(item => item.flowType === FLOW_TYPES.RECEIVABLE_COLLECTION), 'demo mode must include receivable collections');
  assert.ok(useStore.getState().trans.some(item => item.flowType === FLOW_TYPES.GOAL_ALLOCATION && item.allocationAmount > 0), 'demo mode must include goal allocations');
  assert.equal(await useStore.getState().exitDemoMode(), true);
  assert.equal(useStore.getState().cfg.demoMode, undefined);
  assert.deepEqual(useStore.getState().trans.map(item => item.id), realIds, 'leaving demo mode must restore real data');
};

runLinkedStoreAssertions()
  .then(() => console.log('MYFI financial core: all assertions passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
