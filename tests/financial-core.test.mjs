import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildFinancialCoach, getBudgetRows, getBudgetSummary, normalizeBudgets, suggestBudgetsFromHistory } from '../src/lib/budgets.js';
import { getWalletBalances, getWalletMonthlyMovement, normalizeWallets } from '../src/lib/wallets.js';
import { analyzeSmartEntry } from '../src/lib/smartEntry.js';
import { parseSpokenNumberPhrase } from '../src/lib/spokenNumbers.js';
import { resolveSmartCaptureDraft } from '../src/lib/smartCapture.js';
import { normalizeCfg, normalizeHomeCards } from '../src/lib/constants.js';
import { buildChartData, buildFinancialReport, buildFinancialSnapshot, byMonth, calcCashFlow, calcStats, catSpend, getUpcomingRecurring, monthlyForecast, pct } from '../src/utils/calc.js';
import { auditFinancialData } from '../src/lib/financialIntegrity.js';
import { useStore } from '../src/store/useStore.js';
import { formatNumberInput, normalizeNumberInput, parseMoneyInput, parseNumberInput } from '../src/lib/numberInput.js';
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
import { canonicalBackupV11ManifestCounts } from '../src/lib/financialBackupV11.js';
import { semanticHashCanonicalV2 } from '../src/lib/financialSemanticProjection.js';
import { secureAuthStorage } from '../src/lib/secureVault.js';
import { resolveSystemTheme } from '../src/lib/systemTheme.js';
import { getVisibleHistoryTransactions } from '../src/lib/history.js';
import { getTransactionTagLabel, inferTransactionTag, normalizeTransactionTag } from '../src/lib/transactionTags.js';
import { commitmentPaidCycleCount, remainingInstallments } from '../src/store/domain.js';
import { normalizeCommitments } from '../src/lib/commitments.js';
import { buildLeakInsights, suggestCategoryFromHistory } from '../src/lib/localIntelligence.js';
import { commitmentCycleMonth, commitmentDueISO, deferredCommitmentDueISO, getUpcomingCommitments, monthsBetween } from '../src/lib/commitments.js';
import { filterDismissedNotifications, notificationReadKey, pruneNotificationKeys } from '../src/lib/notificationCenter.js';
import { CATEGORY_FLOWS, getCategoriesForFlow, getDefaultCategoryId, normalizeCategoryFlow } from '../src/lib/categories.js';
import { buildDecisionItems } from '../src/lib/decisionEngine.js';
import { dedupeWorkspaceData, normalizeDebtItems, normalizeGoalItems } from '../src/store/domain.js';
import { reopenCompletionCommitments } from '../src/lib/trackerLifecycle.js';
import { mergeWorkspaceStates } from '../src/store/multiDeviceSync.js';
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

const settledDebt = normalizeDebtItems([{
  id: 'settled-debt',
  name: 'Final instalment',
  total: 100,
  payments: [{ id: 'final-payment', amt: 100, date: '2026-08-07' }],
}])[0];
const settledGoal = normalizeGoalItems([{
  id: 'settled-goal',
  name: 'Emergency fund',
  target: 250,
  savings: [{ id: 'final-saving', amt: 250, date: '2026-08-07' }],
}])[0];
assert.equal(settledDebt.status, 'settled', 'a fully paid debt must remain explicitly settled');
assert.equal(settledDebt.completedAt, '2026-08-07', 'debt completion must retain its completion date');
assert.equal(settledGoal.status, 'settled', 'a fully saved goal must remain explicitly settled');
assert.equal(settledGoal.completedAt, '2026-08-07', 'goal completion must retain its completion date');
const completionNotices = buildDecisionItems({
  debts: [settledDebt],
  goals: [settledGoal],
  cfg: { lang: 'ar', currency: 'IQD', profileType: 'personal' },
  date: new Date('2026-08-08T12:00:00'),
});
assert.ok(completionNotices.some(item => item.title === 'انتهى الدين'), 'recent debt completion must be visible in notifications');
assert.ok(completionNotices.some(item => item.title === 'اكتمل الهدف'), 'recent goal completion must be visible in notifications');
const reopenedCommitments = reopenCompletionCommitments([
  { id: 'auto-ended', linkedType: 'debt', linkedId: 'settled-debt', active: false, endReason: 'debt_settled', endedAt: '2026-08-07' },
  { id: 'manual-ended', linkedType: 'debt', linkedId: 'settled-debt', active: false, endReason: 'manual', endedAt: '2026-08-07' },
], [{ linkedType: 'debt', linkedId: 'settled-debt', endReason: 'debt_settled' }]);
assert.equal(reopenedCommitments[0].active, true, 'reopening a tracker must restore only commitments stopped by completion');
assert.equal('endReason' in reopenedCommitments[0], false, 'restored commitments must clear the automatic end marker');
assert.equal(reopenedCommitments[1].active, false, 'manual commitment stops must remain untouched');

assert.equal(inferTransactionTag({ flowType: FLOW_TYPES.DEBT_PAYMENT }), 'debt_owed');
assert.equal(inferTransactionTag({ flowType: FLOW_TYPES.RECEIVABLE_COLLECTION }), 'debt_receivable');
assert.equal(inferTransactionTag({ isGoalSaving: true }), 'saving');
assert.equal(inferTransactionTag({ isCommitmentPayment: true, isDebtPayment: true }), 'commitment');
assert.equal(normalizeTransactionTag({ transactionTag: 'installment' }).transactionTag, 'installment');
assert.equal(getTransactionTagLabel('saving', 'ar'), 'توفير');
assert.equal(normalizeCfg({ lockDelaySeconds: 900 }).lockDelaySeconds, 900);
assert.equal(normalizeCfg({ lockDelaySeconds: 5 }).lockDelaySeconds, 300);
assert.equal(
  normalizeCfg({ enabledModules: { recurring: false } }).enabledModules.recurring,
  true,
  'monthly recurrence must be restored for profiles that previously hid it',
);
const categoryFlowFixture = [
  { id: 'food', label: 'Food' },
  { id: 'salary', label: 'Salary' },
  { id: 'c_legacy', label: 'Legacy custom' },
  { id: 'new_income', label: 'Freelance', flow: CATEGORY_FLOWS.INCOME },
  { id: 'other', label: 'Other' },
];
assert.equal(normalizeCategoryFlow({ id: 'salary' }), CATEGORY_FLOWS.INCOME);
assert.equal(normalizeCategoryFlow({ id: 'food' }), CATEGORY_FLOWS.EXPENSE);
assert.deepEqual(
  getCategoriesForFlow(categoryFlowFixture, CATEGORY_FLOWS.INCOME).map(item => item.id),
  ['salary', 'c_legacy', 'new_income', 'other'],
  'income entry must show income and legacy custom categories only',
);
assert.deepEqual(
  getCategoriesForFlow(categoryFlowFixture, CATEGORY_FLOWS.EXPENSE).map(item => item.id),
  ['food', 'c_legacy', 'other'],
  'expense entry must show expense and legacy custom categories only',
);
assert.equal(getDefaultCategoryId(categoryFlowFixture, CATEGORY_FLOWS.INCOME), 'salary');
assert.equal(resolveSystemTheme('dark'), 'dark', 'system dark mode must stay dark');
assert.equal(resolveSystemTheme('light'), 'light', 'system light mode must stay light');
assert.equal(resolveSystemTheme(null, 'light'), 'light', 'unknown system mode must preserve the current theme');
const historicalInsights = buildLeakInsights([
  { id: 'history-jan', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-01-10' },
  { id: 'history-jan-2', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-01-15' },
  { id: 'history-jan-3', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-01-20' },
  { id: 'history-feb', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-02-10' },
  { id: 'history-feb-2', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-02-15' },
  { id: 'history-feb-3', amt: -100, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-02-20' },
  { id: 'history-mar', amt: -150, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-03-10' },
  { id: 'history-mar-2', amt: -150, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-03-15' },
  { id: 'history-mar-3', amt: -150, flowType: 'expense', cat: 'food', title: 'Food', dateISO: '2026-03-20' },
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
const expiredNotificationKey = notificationReadKey(notificationFixture, Date.now() - (31 * 24 * 60 * 60 * 1000));
assert.deepEqual(
  filterDismissedNotifications([notificationFixture], [expiredNotificationKey]),
  [notificationFixture],
  'dismissed notifications must become eligible again after the retention window',
);
assert.equal(
  pruneNotificationKeys([expiredNotificationKey, notificationReadKey(notificationFixture)]).length,
  1,
  'old notification records must be removed automatically',
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

const monthlyCommitment = {
  id: 'monthly-internet',
  name: 'Internet',
  amt: 100,
  firstDueISO: '2026-08-01',
  day: 1,
  repeatMonthly: true,
  active: true,
};
const augustCommitment = getUpcomingCommitments(
  [monthlyCommitment],
  new Date('2026-08-20T12:00:00'),
)[0];
assert.equal(augustCommitment?.dueMonth, '2026-08');
assert.equal(augustCommitment?.monthsUntil, 0, 'commitments are due for a month, not by a remaining-day countdown');
assert.equal(monthsBetween(new Date('2026-08-31T12:00:00'), '2026-09-01'), 1);
assert.equal(
  deferredCommitmentDueISO(monthlyCommitment, 'day', new Date('2026-08-20T12:00:00')),
  '2026-08-21',
  'a monthly commitment may be deferred operationally by one day',
);
assert.equal(
  deferredCommitmentDueISO(monthlyCommitment, 'three_days', new Date('2026-08-20T12:00:00')),
  '2026-08-23',
  'a monthly commitment may be deferred operationally by three days',
);
assert.equal(
  deferredCommitmentDueISO(monthlyCommitment, 'next_month', new Date('2026-08-20T12:00:00')),
  '2026-09-01',
  'a monthly commitment may still be deferred to the next month',
);
const carriedCommitment = {
  ...monthlyCommitment,
  deferredUntilISO: '2026-09-01',
  deferredCycleMonth: '2026-08',
};
assert.equal(commitmentCycleMonth(carriedCommitment, new Date('2026-09-03T12:00:00')), '2026-08');
assert.equal(
  commitmentDueISO(carriedCommitment, new Date('2026-09-03T12:00:00')),
  '2026-09-01',
  'a commitment deferred into the next month must retain its original cycle month',
);
assert.equal(
  getUpcomingCommitments([carriedCommitment], new Date('2026-09-02T12:00:00'))[0]?.cycleMonth,
  '2026-08',
  'upcoming commitments must expose the unpaid monthly occurrence',
);
const deferredCommitment = { ...monthlyCommitment, deferredUntilISO: '2026-08-23' };
assert.equal(
  getUpcomingCommitments([deferredCommitment], new Date('2026-08-20T12:00:00'))[0]?.actionable,
  false,
  'a commitment must not demand action before its day-level deferral expires',
);
assert.equal(
  getUpcomingCommitments([deferredCommitment], new Date('2026-08-23T12:00:00'))[0]?.actionable,
  true,
  'a commitment must become actionable again on its deferred date',
);
const carriedForecast = monthlyForecast([], new Date('2026-09-03T12:00:00'), [carriedCommitment]);
assert.equal(carriedForecast.remainingCommitments, 100, 'forecast must carry a deferred commitment into its unpaid cycle month');

const syncConflicts = [];
const mergedWorkspace = mergeWorkspaceStates({
  base: { trans: [{ id: 'tx-1', title: 'Old', amt: -10 }], cfg: { theme: 'dark' } },
  local: { trans: [{ id: 'tx-1', title: 'Local title', amt: -10 }], cfg: { theme: 'light' } },
  remote: { trans: [{ id: 'tx-1', title: 'Remote title', amt: -25 }], cfg: { theme: 'system' } },
  conflicts: syncConflicts,
});
assert.equal(mergedWorkspace.trans[0].title, 'Local title', 'device merge must retain the current device value for a true scalar conflict');
assert.equal(mergedWorkspace.trans[0].amt, -25, 'device merge must retain non-conflicting remote fields');
assert(syncConflicts.some(item => item.path === 'trans[tx-1].title'), 'device merge must record the conflicted field path');
assert(!syncConflicts.some(item => item.path === 'cfg.theme'), 'device-local settings must not create a cloud merge conflict');
const deletionConflicts = [];
mergeWorkspaceStates({
  base: { goals: [{ id: 'goal-1', name: 'Trip' }] },
  local: { goals: [] },
  remote: { goals: [{ id: 'goal-1', name: 'Trip updated' }] },
  conflicts: deletionConflicts,
});
assert.equal(deletionConflicts[0]?.resolution, 'deletion', 'deletion versus edit must be explicit in the sync conflict log');

const duplicateGuestData = dedupeWorkspaceData({
  cfg: { currency: 'IQD', defaultWalletId: 'wallet-main', profileType: 'personal' },
  wallets: [
    { id: 'wallet-main', name: 'Main wallet', nameEn: 'Main wallet', type: 'cash', currency: 'IQD', openingBalance: 0, scope: 'personal' },
    { id: 'wallet-guest', name: 'Main wallet (Guest)', nameEn: 'Main wallet (Guest)', type: 'cash', currency: 'IQD', openingBalance: 0, scope: 'personal' },
  ],
  trans: [
    { id: 'tx-guest-copy', title: 'Ali', amt: -175000, cat: 'other', walletId: 'wallet-guest', dateISO: '2026-08-08', scope: 'personal' },
    { id: 'tx-main-copy', title: 'Ali', amt: -175000, cat: 'other', walletId: 'wallet-main', dateISO: '2026-08-08', scope: 'personal' },
  ],
  debts: [],
  goals: [],
  commitments: [],
  cats: [{ id: 'other', label: 'Other' }],
});
assert.equal(duplicateGuestData.wallets.length, 2, 'different stable wallet IDs must remain distinct even when human-visible wallet properties match');
assert.deepEqual(
  duplicateGuestData.wallets.map(item => item.id).sort(),
  ['wallet-guest', 'wallet-main'],
  'account and Guest wallets must retain separate stable identities',
);
assert.equal(duplicateGuestData.trans.length, 2, 'different stable transaction IDs must not be silently collapsed by content');
assert.deepEqual(
  duplicateGuestData.trans.map(item => item.walletId).sort(),
  ['wallet-guest', 'wallet-main'],
  'transactions must remain attached to their own surviving wallet IDs',
);

const annualReport = buildFinancialReport({
  trans: [
    { id: 'annual-income', amt: 1000, dateISO: '2026-01-10' },
    { id: 'annual-expense', amt: -250, dateISO: '2026-02-10' },
  ],
  scope: 'year',
}, new Date('2026-02-15T12:00:00'));
assert.deepEqual(annualReport.stats, { inc: 1000, exp: 250, bal: 750 }, 'annual reports must use the shared financial engine for period totals');
assert.equal(annualReport.periodCashFlow.net, 750, 'annual reports must use the shared cash-flow definition');

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
assert.equal(suggestions.food, 1500, 'three-month suggestion should use the recent-weighted adaptive estimate');
const latestThreeSuggestions = suggestBudgetsFromHistory([
  { amt: -9000, cat: 'food', dateISO: '2026-03-01' },
  { amt: -1200, cat: 'food', dateISO: '2026-04-01' },
  { amt: -1800, cat: 'food', dateISO: '2026-05-01' },
  { amt: -1500, cat: 'food', dateISO: '2026-06-01' },
], categories, new Date('2026-07-15T12:00:00'));
assert.equal(latestThreeSuggestions.food, 1500, 'budget suggestions must reject a large older outlier without distorting the recent estimate');

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
assert.deepEqual(
  calcCashFlow(linkedFlows),
  { inflow: 1150, outflow: 500, net: 650 },
  'cash flow must include real linked wallet movements but exclude goal allocations because they reserve cash without moving it',
);
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
const mixedScopeRows = [
  { id: 'p', scope: 'personal' },
  { id: 'b', scope: 'business' },
];
assert.deepEqual(
  filterByActiveScope(mixedScopeRows, mixedCfg).map(item => item.id),
  ['b'],
  'dual usage with Business selected must isolate business data',
);
assert.deepEqual(
  filterByActiveScope(mixedScopeRows, normalizeCfg({ ...mixedCfg, activeScope: 'personal' })).map(item => item.id),
  ['p'],
  'dual usage with Personal selected must isolate personal data',
);
assert.deepEqual(
  filterByActiveScope(mixedScopeRows, normalizeCfg({ ...mixedCfg, activeScope: 'all' })).map(item => item.id),
  ['p', 'b'],
  'dual usage with All selected must combine personal and business data in one workspace',
);
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

// MYFI_SMART_MULTIMODAL_V2_TESTS
[
  ['ألف ونص', 1500],
  ['مليون ونص', 1500000],
  ['مليون وربع', 1250000],
  ['نص مليون', 500000],
  ['ربع مليون', 250000],
  ['ثلاثة ونص', 3.5],
  ['ثلاثة وربع', 3.25],
  ['ثلاثة إلا ربع', 2.75],
  ['مليون إلا ربع', 750000],
  ['خمسة آلاف وسبعمية وخمسين', 5750],
  ['مية وخمسة وعشرين ألف', 125000],
  ['one and a half thousand', 1500],
  ['half a million', 500000],
  ['two and a quarter', 2.25],
  ['one point five million', 1500000],
  ['twenty five hundred', 2500],
].forEach(([spoken, expected]) => {
  const actual = parseSpokenNumberPhrase(spoken);
  assert.ok(Math.abs(actual - expected) < 0.01, `spoken number failed: ${spoken} => ${actual}`);
});

const iraqiVoiceAmount = analyzeSmartEntry({
  text: 'دفعت مليون ونص إيجار من Cash أمس',
  cats: smartCats,
  wallets,
  lang: 'ar',
});
assert.equal(iraqiVoiceAmount.amount, 1500000, 'Iraqi spoken million-and-half must become 1.5M');

const referenceVsAmount = analyzeSmartEntry({
  text: 'رقم الطلب ثلاثة آلاف ودفعت خمسين دولار',
  cats: smartCats,
  wallets,
  lang: 'ar',
});
assert.equal(referenceVsAmount.amount, 50, 'spoken order number must not replace the paid amount');

const bankDebitDraft = resolveSmartCaptureDraft({
  text: 'Debited 75,000 IQD at SUPERMARKET',
  analysis: {
    sourceType: 'bank_notification',
    transactionLikely: true,
    multipleTransactions: false,
    flow: 'expense',
    direction: 'outgoing',
    amount: 75000,
    currency: 'IQD',
    dateISO: '2026-08-10',
    amountConfidence: 0.98,
    dateConfidence: 0.9,
    overallConfidence: 0.95,
    merchant: 'SUPERMARKET',
    category: 'food',
    warnings: [],
  },
  cats: smartCats,
  wallets,
  lang: 'en',
  currency: 'IQD',
});
assert.equal(bankDebitDraft.ok, true);
assert.equal(bankDebitDraft.draft.amount, 75000);
assert.equal(bankDebitDraft.draft.type, 'exp');

const bankCreditDraft = resolveSmartCaptureDraft({
  text: 'Salary credited 1,250,000 IQD',
  analysis: {
    sourceType: 'salary_notice',
    transactionLikely: true,
    multipleTransactions: false,
    flow: 'income',
    direction: 'incoming',
    amount: 1250000,
    currency: 'IQD',
    dateISO: '2026-08-10',
    amountConfidence: 0.99,
    dateConfidence: 0.9,
    overallConfidence: 0.98,
    title: 'Salary',
    category: 'salary',
    warnings: [],
  },
  cats: smartCats,
  wallets,
  lang: 'en',
  currency: 'IQD',
});
assert.equal(bankCreditDraft.draft.type, 'inc');

assert.equal(resolveSmartCaptureDraft({
  text: 'Statement',
  analysis: {
    transactionLikely: true,
    multipleTransactions: true,
    amount: null,
  },
  cats: smartCats,
  wallets,
  lang: 'en',
  currency: 'IQD',
}).reason, 'multiple_transactions', 'bank statement must not silently choose one row');

assert.equal(resolveSmartCaptureDraft({
  text: 'Invoice total 500 due next week',
  analysis: {
    transactionLikely: false,
    multipleTransactions: false,
    amount: 500,
  },
  cats: smartCats,
  wallets,
  lang: 'en',
  currency: 'IQD',
}).reason, 'not_transaction', 'unpaid invoice must not become a completed transaction automatically');


const reorderedHomeCards = normalizeHomeCards([
  { key: 'expense', visible: true },
  { key: 'income', visible: true },
  { key: 'dueSoon', visible: false },
  { key: 'net', visible: true },
]);
assert.deepEqual(
  reorderedHomeCards.map(item => item.key),
  ['expense', 'income', 'net', 'saving'],
  'home-card normalization must migrate the removed due card to the current-month savings card',
);
assert.equal(reorderedHomeCards.some(item => item.key === 'dueSoon'), false, 'the old monthly due card must not return after the home-summary migration');
assert.equal(reorderedHomeCards.find(item => item.key === 'saving')?.visible, true, 'the current-month savings card must be available after migration');

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
    'restoreLastMergeRollback',
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
  const iqDecimal = parseMoneyInput('1.500', { format: 'dotDecimal', currency: 'IQD', allowNegative: false });
  assert.equal(iqDecimal.ok, true, 'IQD decimal input must be accepted before a ledger mutation');
  assert.equal(iqDecimal.value, 1.5, 'IQD 1.500 must remain one and a half, never one thousand five hundred');
  assert.equal(
    await useStore.getState().addTrans({ amt: iqDecimal.value, cat: 'salary', walletId: 'cash', dateISO: '2026-07-02' }),
    true,
    'the parsed amount must be accepted by the real transaction/ledger command path',
  );
  let state = useStore.getState();
  assert.equal(
    state.trans.find(item => item.amt === 1.5 && item.cat === 'salary')?.amt,
    1.5,
    'the transaction path must retain the parsed IQD decimal amount exactly',
  );
  const addedTx = state.trans.find(item => item.amt === 250 && item.cat === 'salary');
  assert.ok(addedTx, 'transaction slice must add a normal transaction');
  assert.equal(addedTx.flowType, FLOW_TYPES.INCOME);
  const transCountBeforeOverspend = state.trans.length;
  assert.equal(await useStore.getState().addTrans({ amt: -100000, cat: 'food', walletId: 'cash', dateISO: '2026-07-02' }), true);
  assert.equal(useStore.getState().trans.length, transCountBeforeOverspend + 1, 'the ledger must record a real expense even when it makes the wallet negative');
  const overspendTx = useStore.getState().trans.find(item => item.cat === 'food' && item.amt === -100000);
  assert.equal(overspendTx?.balanceWarning, true, 'an expense that makes the wallet negative must carry a balance warning');
  assert.equal(await useStore.getState().editTrans(overspendTx.id, { amt: -120000 }), true);
  assert.equal(useStore.getState().trans.find(item => item.id === overspendTx.id).balanceWarning, true, 'editing a negative-balance expense must preserve the warning contract');
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
  assert.equal(await useStore.getState().addTransfer({ fromWalletId: 'cash', toWalletId: 'savings', amount: 5000 }), true);
  assert.equal(useStore.getState().trans.filter(item => item.kind === 'transfer').length, transferCount + 1, 'the ledger must retain a transfer even when the source wallet becomes negative');
  assert.equal(useStore.getState().trans.find(item => item.kind === 'transfer' && item.transferAmount === 5000)?.balanceWarning, true, 'an overdrawn transfer must carry a balance warning');
  assert.equal(await useStore.getState().addTransfer({ fromWalletId: 'cash', toWalletId: 'savings', amount: -10 }), false);
  assert.equal(await useStore.getState().editTrans(crossScopeTransfer.id, { transferAmount: 5000 }), true);
  assert.equal(useStore.getState().trans.find(item => item.id === crossScopeTransfer.id).balanceWarning, true, 'editing a transfer beyond the source balance must flag it');
  assert.equal(await useStore.getState().editTrans(crossScopeTransfer.id, { toWalletId: 'savings' }), true);
  assert.equal(useStore.getState().trans.find(item => item.id === crossScopeTransfer.id).toWalletId, 'savings', 'transfer edits must accept another wallet scope');

  // Wallet exchange-rate flow: these are real store/ledger actions, not
  // source-text contracts. The UI must remain a thin layer over them.
  assert.equal(
    await useStore.getState().addWallet({ name: 'USD missing rate', currency: 'USD', openingBalance: 1 }),
    false,
    'a foreign wallet must be rejected without a valuation rate',
  );
  const usdWallet = await useStore.getState().addWallet({ name: 'USD wallet', currency: 'USD', openingBalance: 10, valuationRate: 1400 });
  assert.equal(usdWallet.currency, 'USD', 'a foreign wallet must keep its native currency');
  assert.equal(usdWallet.valuationRate, 1400, 'a foreign wallet must persist its valuation rate');
  assert.ok(usdWallet.valuationUpdatedAt, 'a foreign wallet must record when its valuation was updated');
  const firstRateUpdate = usdWallet.valuationUpdatedAt;
  assert.equal(await useStore.getState().editWallet(usdWallet.id, { valuationRate: 1450 }), true, 'a valuation rate must be editable without changing wallet currency');
  const updatedUsdWallet = useStore.getState().wallets.find(item => item.id === usdWallet.id);
  assert.equal(updatedUsdWallet.valuationRate, 1450, 'the updated valuation rate must persist');
  assert.ok(updatedUsdWallet.valuationUpdatedAt >= firstRateUpdate, 'editing a valuation rate must refresh its timestamp');
  const missingHistoricalRate = await useStore.getState().reconcileWalletBalance(usdWallet.id, 12, '2026-07-04', '', null, { confirmedUnresolved: true });
  assert.equal(missingHistoricalRate.reason, 'historical_fx_required', 'foreign reconciliation must require a frozen historical rate');
  const reconciled = await useStore.getState().reconcileWalletBalance(usdWallet.id, 12, '2026-07-04', 'bank statement', 1425, { confirmedUnresolved: true });
  assert.equal(reconciled.ok, true, 'foreign reconciliation must record with an explicit historical rate');
  const reconciliationTx = useStore.getState().trans.find(item => item.id === reconciled.transactionId);
  assert.equal(reconciliationTx?.exchangeRate, 1425, 'the reconciliation transaction must freeze its historical rate');
  assert.equal(reconciliationTx?.rateSource, 'user_entered_reconciliation', 'the reconciliation must not use the mutable wallet valuation rate');
  const eurWallet = await useStore.getState().addWallet({ name: 'EUR wallet', currency: 'EUR', openingBalance: 20, valuationRate: 1600 });
  assert.equal(
    await useStore.getState().addTransfer({ fromWalletId: usdWallet.id, toWalletId: eurWallet.id, amount: 2, toAmount: 1.75 }),
    false,
    'foreign-to-foreign transfers must reject missing historical base bridge rates',
  );
  assert.equal(
    await useStore.getState().addTransfer({ fromWalletId: usdWallet.id, toWalletId: eurWallet.id, amount: 2, toAmount: 1.75, fromBaseRate: 1450, toBaseRate: 1600 }),
    true,
    'foreign-to-foreign transfers must keep working when both historical base rates are supplied',
  );
  const foreignTransfer = useStore.getState().trans.find(item => item.kind === 'transfer' && item.fromWalletId === usdWallet.id && item.toWalletId === eurWallet.id);
  assert.equal(foreignTransfer?.fromBaseRate, 1450, 'foreign transfer must freeze the source base rate');
  assert.equal(foreignTransfer?.toBaseRate, 1600, 'foreign transfer must freeze the target base rate');

  useStore.setState({
    trans: [
      { id: 'recurring-income-june', title: 'Side income', amt: 100, cat: 'salary', walletId: 'cash', dateISO: '2026-06-10', recurring: true, recurringGroupId: 'side-income-series', flowType: FLOW_TYPES.INCOME },
      { id: 'recurring-income-july', title: 'Side income', amt: 100, cat: 'salary', walletId: 'cash', dateISO: '2026-07-10', recurring: true, recurringGroupId: 'side-income-series', flowType: FLOW_TYPES.INCOME },
    ],
    debts: [],
    goals: [],
    commitments: [],
    wallets,
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  assert.equal(await useStore.getState().editTrans('recurring-income-july', { recurring: false }), true);
  assert.equal(
    useStore.getState().trans.filter(item => item.recurringGroupId === 'side-income-series' && item.recurring).length,
    0,
    'stopping a recurring item must stop the full future series while keeping its historical entries',
  );
  assert.equal(
    useStore.getState().trans.filter(item => item.recurringGroupId === 'side-income-series').length,
    2,
    'stopping recurrence must preserve historical transactions',
  );

  useStore.setState({
    trans: [],
    debts: [],
    goals: [],
    commitments: [],
    wallets,
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  const previousDebt = await useStore.getState().addDebt({
    name: 'Old debt',
    total: 400,
    createdAt: '2026-07-04',
    direction: 'owed',
    originMode: 'previous',
    walletId: 'cash',
  });
  assert.ok(previousDebt?.id);
  assert.equal(useStore.getState().trans.length, 0, 'old debt creation must not change wallet balance');
  await useStore.getState().addDebt({
    name: 'Received loan',
    total: 300,
    createdAt: '2026-07-04',
    direction: 'owed',
    originMode: 'received',
    walletId: 'cash',
  });
  state = useStore.getState();
  assert.equal(state.trans.find(item => item.isDebtOrigin && item.flowType === FLOW_TYPES.DEBT_PROCEEDS)?.amt, 300, 'received debt must add proceeds to the selected wallet');
  await useStore.getState().addDebt({
    name: 'Friend loan',
    total: 200,
    createdAt: '2026-07-04',
    direction: 'receivable',
    originMode: 'lent',
    walletId: 'cash',
  });
  state = useStore.getState();
  assert.equal(state.trans.find(item => item.isDebtOrigin && item.flowType === FLOW_TYPES.RECEIVABLE_CREATED)?.amt, -200, 'debt owed to me created from lent cash must reduce the selected wallet');
  await useStore.getState().addCommitment({
    name: 'One-time fee',
    amt: 70,
    firstDueISO: '2026-07-01',
    walletId: 'cash',
    linkedType: 'none',
    repeatMonthly: false,
  });
  assert.equal(useStore.getState().commitments.find(item => item.name === 'One-time fee')?.repeatMonthly, false, 'one-time commitment creation must persist repeatMonthly=false');

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

  // --- Installment counter: repeat-action proof -----------------------------
  // The counter is derived, not stored, so the thing that must hold is that
  // paying the SAME plan over and over walks it down exactly one step per
  // cycle, floors at zero, and never goes negative no matter how many extra
  // payments are attempted.
  useStore.setState({
    trans: [],
    debts: [],
    goals: [],
    commitments: normalizeCommitments([{
      id: 'commit-inst', name: 'Car loan', amt: 100, day: 10, active: true,
      repeatMonthly: true, walletId: 'cash', linkedType: 'none', linkedId: null,
      subType: 'installment', totalInstallments: 3,
    }], 'cash', 'IQD'),
    wallets,
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  const instCommitment = () => useStore.getState().commitments.find(item => item.id === 'commit-inst');
  const instLeft = () => remainingInstallments(instCommitment(), useStore.getState().trans);

  assert.equal(instCommitment().totalInstallments, 3, 'installment plan size must survive normalization');
  assert.equal(instLeft(), 3, 'an unpaid 3-installment plan must report 3 remaining');

  // Run the same action repeatedly, one cycle month at a time. Payments 4 and
  // 5 must be REFUSED: the plan is complete after 3, and an installment plan
  // is a fixed number of cycles by definition.
  const instMonths = ['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10', '2026-11-10'];
  const instObserved = [];
  for (const payDate of instMonths) {
    const result = await useStore.getState().payCommitment('commit-inst', payDate, 'cash');
    instObserved.push({ ok: result.ok, reason: result.reason || null, left: instLeft() });
  }
  assert.deepEqual(
    instObserved,
    [
      { ok: true, reason: null, left: 2 },
      { ok: true, reason: null, left: 1 },
      { ok: true, reason: null, left: 0 },
      { ok: false, reason: 'installment_plan_complete', left: 0 },
      { ok: false, reason: 'installment_plan_complete', left: 0 },
    ],
    'each installment payment must decrement remaining by exactly one, then refuse further payments at zero without going negative',
  );
  assert.equal(instLeft() >= 0, true, 'remaining installments must never be negative');
  assert.equal(commitmentPaidCycleCount(useStore.getState().trans, 'commit-inst'), 3, 'a completed 3-installment plan must have exactly 3 paid cycles, not 5');
  assert.equal(
    useStore.getState().trans.filter(tx => tx.isCommitmentPayment && tx.commitmentId === 'commit-inst').length,
    3,
    'a refused payment must post nothing to the ledger',
  );

  // The completion guard is installment-only: a subscription has no end, so it
  // must keep accepting payments however many times it is paid.
  useStore.setState({
    trans: [],
    commitments: normalizeCommitments([{
      id: 'commit-sub', name: 'Streaming', amt: 100, day: 10, active: true,
      repeatMonthly: true, walletId: 'cash', linkedType: 'none', linkedId: null,
      subType: 'subscription', totalInstallments: 3,
    }], 'cash', 'IQD'),
  });
  assert.equal(useStore.getState().commitments[0].totalInstallments, null, 'a subscription must not carry a plan size at all');
  const subObserved = [];
  for (const payDate of instMonths) {
    const result = await useStore.getState().payCommitment('commit-sub', payDate, 'cash');
    subObserved.push(result.ok);
  }
  assert.deepEqual(subObserved, [true, true, true, true, true], 'a subscription must never be blocked by the installment completion guard');

  // The plan size is optional. An installment with no size entered has no
  // known end, so the completion guard must never fire on it — a plan of
  // "unknown length" must not behave like a plan of length zero.
  useStore.setState({
    trans: [],
    commitments: normalizeCommitments([{
      id: 'commit-open', name: 'Open plan', amt: 100, day: 10, active: true,
      repeatMonthly: true, walletId: 'cash', linkedType: 'none', linkedId: null,
      subType: 'installment',
    }], 'cash', 'IQD'),
  });
  assert.equal(useStore.getState().commitments[0].totalInstallments, null, 'an installment with no size entered must normalize to null, not 0');

  // A one-time payment cannot also be a plan of N installments — the card
  // would read "done" and "N left" at the same time. Cleared at the
  // normalization chokepoint so edit/restore/sync all agree.
  assert.equal(
    normalizeCommitments([{ id: 'c', name: 'One-off', amt: 100, subType: 'installment', totalInstallments: 12, repeatMonthly: false }], 'cash', 'IQD')[0].totalInstallments,
    null,
    'a one-time commitment must not carry an installment plan size',
  );
  assert.equal(
    normalizeCommitments([{ id: 'c', name: 'Plan', amt: 100, subType: 'installment', totalInstallments: 12, repeatMonthly: true }], 'cash', 'IQD')[0].totalInstallments,
    12,
    'a repeating installment commitment must keep its plan size',
  );
  assert.equal(remainingInstallments(useStore.getState().commitments[0], []), null, 'an unsized installment plan has no remaining count');
  const openObserved = [];
  for (const payDate of instMonths) {
    const result = await useStore.getState().payCommitment('commit-open', payDate, 'cash');
    openObserved.push(result.ok);
  }
  assert.deepEqual(openObserved, [true, true, true, true, true], 'an installment with no plan size must never be blocked by the completion guard');

  // Restore the completed installment plan for the assertions that follow.
  useStore.setState({
    trans: [],
    commitments: normalizeCommitments([{
      id: 'commit-inst', name: 'Car loan', amt: 100, day: 10, active: true,
      repeatMonthly: true, walletId: 'cash', linkedType: 'none', linkedId: null,
      subType: 'installment', totalInstallments: 3,
    }], 'cash', 'IQD'),
  });
  for (const payDate of ['2026-07-10', '2026-08-10', '2026-09-10']) {
    await useStore.getState().payCommitment('commit-inst', payDate, 'cash');
  }
  assert.equal(instLeft(), 0, 'the restored plan must be back at zero remaining');

  // Re-paying an ALREADY-SETTLED cycle must be refused and must not move the
  // counter. Note this needs the cycle month passed explicitly: payCommitment
  // advances cycle-by-cycle off lastPaidMonth rather than off the entry date,
  // so a second call with a later date is a legitimate *next* cycle, not a
  // duplicate.
  const instPaidMonth = instCommitment().lastPaidMonth;
  const instDuplicate = await useStore.getState().payCommitment('commit-inst', '2026-09-20', 'cash', instPaidMonth);
  assert.equal(instDuplicate.ok, false, 'paying an already-settled cycle again must be refused');
  assert.equal(instLeft(), 0, 'a refused duplicate payment must not change the remaining count');

  // Deleting a payment must give the installment back — the whole point of
  // deriving instead of storing a counter — AND must reopen the plan so the
  // completion guard stops blocking it. A stored counter could do neither.
  const instTxToDelete = useStore.getState().trans.find(tx => tx.isCommitmentPayment && tx.commitmentMonth === '2026-09');
  assert.ok(instTxToDelete, 'the September installment payment must exist before deletion');
  await useStore.getState().deleteTrans(instTxToDelete.id);
  assert.equal(commitmentPaidCycleCount(useStore.getState().trans, 'commit-inst'), 2, 'deleting a payment must drop the paid-cycle count');
  assert.equal(instLeft(), 1, 'deleting a payment must hand the installment back');
  const instAfterReopen = await useStore.getState().payCommitment('commit-inst', '2026-09-10', 'cash');
  assert.equal(instAfterReopen.ok, true, 'a plan reopened by deleting a payment must accept a payment again');
  assert.equal(instLeft(), 0, 're-paying the reopened cycle must take the plan back to zero');

  // A commitment reclassified away from 'installment' must not keep a stale plan size.
  assert.equal(
    normalizeCommitments([{ id: 'x', name: 'Reclassified', amt: 10, subType: 'subscription', totalInstallments: 12 }], 'cash', 'IQD')[0].totalInstallments,
    null,
    'a non-installment commitment must not carry a plan size',
  );
  // Garbage and out-of-range plan sizes must fail closed to null, not to a
  // wrong number. Each input asserts its own exact expected output — a
  // disjunction here would let a regression through.
  const instNormalizeCases = [
    [0, null], [-4, null], ['abc', null], [null, null], [undefined, null],
    [NaN, null], [Infinity, null], ['', null],
    [601, null], [1200, null], // out of range fails closed, never clamps
    [1.7, 2], [12, 12], ['12', 12], [600, 600], [1, 1],
  ];
  instNormalizeCases.forEach(([input, expected]) => {
    const value = normalizeCommitments([{ id: 'y', name: 'Bad', amt: 10, subType: 'installment', totalInstallments: input }], 'cash', 'IQD')[0].totalInstallments;
    assert.equal(value, expected, `installment count ${String(input)} must normalize to ${String(expected)}, got ${String(value)}`);
  });
  assert.equal(remainingInstallments({ id: 'z', totalInstallments: null }, []), null, 'a non-installment commitment has no remaining count');

  useStore.setState({
    trans: [],
    debts: [],
    goals: [],
    commitments: [{ id: 'commit-low-cash', name: 'Rent', amt: 100, day: 10, active: true, repeatMonthly: true, walletId: 'cash', linkedType: 'none', linkedId: null }],
    wallets: normalizeWallets([{ id: 'cash', name: 'Cash', openingBalance: 50, currency: 'IQD', scope: 'personal' }]),
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
    user: null,
  });
  const lowCashCommitment = await useStore.getState().payCommitment('commit-low-cash', '2026-07-10', 'cash');
  assert.equal(lowCashCommitment.ok, true);
  assert.equal(useStore.getState().trans.length, 1, 'a paid commitment must remain in the ledger even when it makes the wallet negative');
  assert.equal(useStore.getState().trans[0].balanceWarning, true, 'an overdrawn commitment payment must carry a balance warning');

  useStore.setState({
    wallets,
    trans: [{ id: 't1', kind: 'transfer', transferAmount: 50, fromWalletId: 'cash', toWalletId: 'bank', dateISO: '2026-07-01' }],
    commitments: [],
    cfg: { ...initialCfg, currency: 'IQD', defaultWalletId: 'cash' },
  });
  assert.equal(await useStore.getState().deleteWallet('bank'), false);
  assert.equal(useStore.getState().trans.length, 1, 'a wallet with financial history must not be deleted or rewrite its transfer history');

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
  assert.equal(state.trans.length, 3, 'bulk tracker delete must preserve posted financial ledger rows');
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
      name: 'Reserve plan',
      amt: 100,
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
  assert.equal(await useStore.getState().deleteWalletsMany(['bank', 'card']), false);
  state = useStore.getState();
  assert.deepEqual(state.wallets.map(item => item.id), ['cash', 'bank', 'card']);
  assert.equal(state.trans.length, 2, 'bulk wallet deletion must preserve every row when any selected wallet has history');
  assert.equal(state.commitments[0].walletId, 'card');

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
  assert.deepEqual(state.cats.map(item => item.id), ['food', 'rent', 'other']);
  assert.ok(state.cats.filter(item => ['food', 'rent'].includes(item.id)).every(item => item.status === 'archived' && item.archivedAt));
  assert.deepEqual(state.trans.map(item => item.cat), ['food', 'rent'], 'category lifecycle must preserve historical transaction identity');
  assert.equal(state.commitments[0].cat, 'rent');
  assert.equal(state.commitments[0].categoryArchived, true);
  assert.deepEqual(state.cfg.categoryBudgets, { food: 100, rent: 200 }, 'historical budget references must not be silently rewritten');

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
  assert.equal(
    await useStore.getState().commitYearArchive(2024, archivePackage.checksum),
    false,
    'the web-compatible runtime gate must abort archive cutover when native SQLite is unavailable',
  );
  state = useStore.getState();
  assert.deepEqual(
    state.trans.map(item => item.id),
    ['old-income', 'old-debt', 'old-business-income', 'current-expense'],
    'a failed native archive write must leave active history untouched',
  );
  assert.equal(state.debts[0].archivedPaid, 0);
  assert.equal(state.debts[0].paid, 100);
  const afterArchiveBalance = getWalletBalances(state.wallets, state.trans, 'IQD', 'archive-cash')[0].balance;
  assert.equal(afterArchiveBalance, beforeArchiveBalance, 'an aborted annual archive must preserve wallet balance');
  assert.deepEqual(state.cfg.archiveSummaries, []);

  const fullPackage = await buildMyfiPackage({
    kind: 'full_backup',
    data: JSON.parse(await useStore.getState().exportBackup()),
  });
  const inspectedBackup = await inspectMyfiPackage(fullPackage.base64);
  assert.equal(inspectedBackup.payload.kind, 'full_backup');
  assert.equal(inspectedBackup.payload.format, 'MYFI');
  const canonicalData = {
    semanticHashVersion: 2,
    ledgerId: 'ledger-package-v11',
    financialConfig: { currency: 'IQD' },
    accounts: [], exchangeRates: [], transactions: [], postings: [], links: [], entities: [], archives: [],
  };
  const canonicalBackup = {
    kind: 'myfi_canonical_financial_backup',
    manifest: {
      format: 'MYFI_CANONICAL_LEDGER_BACKUP',
      dataVersion: 11,
      semanticHashVersion: 2,
      semanticHashAlgorithm: 'SHA-256',
      semanticHash: semanticHashCanonicalV2(canonicalData),
      createdAt: '2026-08-24T00:00:00.000Z',
      ledgerId: canonicalData.ledgerId,
      counts: canonicalBackupV11ManifestCounts(canonicalData),
    },
    data: canonicalData,
  };
  const canonicalPackage = await buildMyfiPackage({ kind: 'full_backup', data: canonicalBackup });
  const inspectedCanonical = await inspectMyfiPackage(canonicalPackage.base64);
  assert.equal(inspectedCanonical.payload.data.kind, 'myfi_canonical_financial_backup');
  assert.equal(inspectedCanonical.payload.data.manifest.dataVersion, 11);
  const encryptedPackage = await buildMyfiPackage({
    kind: 'full_backup',
    data: JSON.parse(await useStore.getState().exportBackup()),
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
  assert.equal(useStore.getState().cfg.performanceTestTier, '200');
  assert.equal(useStore.getState().trans.length, 200, 'the web fallback must retain active and cold fixture rows when native SQLite is unavailable');
  const demoMonthCounts = useStore.getState().trans.reduce((map, tx) => {
    const key = String(tx.dateISO || '').slice(0, 7);
    if (key) map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map());
  assert.equal(demoMonthCounts.size, 24, 'the default performance fixture must cover its configured 24-month history');
  assert.ok(
    [...demoMonthCounts.values()].every(count => count > 0),
    'the performance fixture must include transactions in every configured month',
  );
  assert.ok(useStore.getState().trans.some(item => item.kind === 'transfer'), 'demo mode must include wallet transfers');
  assert.ok(useStore.getState().trans.some(item => item.flowType === FLOW_TYPES.INCOME), 'demo mode must include income');
  assert.ok(useStore.getState().trans.some(item => item.flowType === FLOW_TYPES.EXPENSE), 'demo mode must include expenses');
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


// MYFI_SMART_BANK_VOICE_V21_TESTS
const iqBankPurchase = analyzeSmartEntry({
  text: 'Transaction details\nTransaction type POS - Purchase\nTransaction date 05/08/2026\nAmount -13,200.000 IQD\nTransaction reference FT2621706165',
  cats: smartCats,
  wallets,
  lang: 'en',
});
assert.equal(iqBankPurchase.amount, 13200, 'IQD bank format -13,200.000 must mean 13,200');

const iqSalary = analyzeSmartEntry({
  text: 'Transaction details\nTransaction type Salary Domiciliation\nTransaction date 29/07/2026\nAmount 2,518,269.000 IQD\nTransaction reference FT2621000155',
  cats: smartCats,
  wallets,
  lang: 'en',
});
assert.equal(iqSalary.amount, 2518269, 'IQD salary format must preserve comma grouping and 3 decimal minor digits');
assert.equal(iqSalary.type, 'inc');

assert.equal(analyzeSmartEntry({
  text: 'Transaction type ATM-POS-Ecom Commission\nAmount -660.000 IQD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 660);

assert.equal(analyzeSmartEntry({
  text: 'Transaction type POS - Purchase\nAmount -5,480.000 IQD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 5480);

assert.equal(analyzeSmartEntry({
  text: 'TOTAL: 1,234.56 USD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 1234.56);

assert.equal(analyzeSmartEntry({
  text: 'TOTAL: 1.234,56 EUR',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 1234.56);

assert.equal(analyzeSmartEntry({
  text: 'TOTAL: ١٣٬٢٠٠٫٠٠٠ IQD',
  cats: smartCats,
  wallets,
  lang: 'ar',
}).amount, 13200);

assert.equal(analyzeSmartEntry({
  text: 'اشتريت تيبس ب 500 دينار',
  cats: smartCats,
  wallets,
  lang: 'ar',
}).amount, 500, 'simple Arabic spoken numeric purchase must fill amount');

assert.equal(analyzeSmartEntry({
  text: 'بطيخ بألف ونص',
  cats: smartCats,
  wallets,
  lang: 'ar',
}).amount, 1500, 'Arabic attached ب-price phrase must parse ألف ونص');

const aiFalseButBankClear = resolveSmartCaptureDraft({
  text: 'Transaction details\nTransaction type POS - Purchase\nTransaction date 05/08/2026\nAmount -13,200.000 IQD\nTransaction reference FT2621706165',
  analysis: {
    sourceType: 'bank_app_screen',
    transactionLikely: false,
    multipleTransactions: false,
    flow: 'expense',
    direction: 'outgoing',
    amount: null,
    amountEvidence: '-13,200.000 IQD',
    amountConfidence: 0.4,
    overallConfidence: 0.55,
    warnings: ['model_classification_conflict'],
  },
  cats: smartCats,
  wallets,
  lang: 'en',
  currency: 'IQD',
});
assert.equal(aiFalseButBankClear.ok, true, 'strong bank transaction screen must recover from an AI false-negative');
assert.equal(aiFalseButBankClear.draft.amount, 13200);

const aiFalseButVoiceClear = resolveSmartCaptureDraft({
  text: 'اشتريت تيبس ب 500 دينار',
  analysis: {
    sourceType: 'other',
    transactionLikely: false,
    multipleTransactions: false,
    flow: 'unknown',
    direction: 'unknown',
    amount: null,
    amountConfidence: 0,
    overallConfidence: 0.3,
    warnings: [],
  },
  cats: smartCats,
  wallets,
  lang: 'ar',
  currency: 'IQD',
});
assert.equal(aiFalseButVoiceClear.ok, true, 'clear spoken purchase must recover from AI false-negative');
assert.equal(aiFalseButVoiceClear.draft.amount, 500);



// MYFI_SMART_SEPARATOR_V22_TESTS
assert.equal(analyzeSmartEntry({
  text: 'TOTAL: 75,000 IQD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 75000, 'single comma in explicit IQD is thousands grouping');

assert.equal(analyzeSmartEntry({
  text: 'TOTAL: 660.000 IQD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 660, 'single dot with 3 IQD minor digits is decimal');

assert.equal(analyzeSmartEntry({
  text: 'TOTAL: 13,200.000 IQD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 13200, 'mixed IQD punctuation must keep comma thousands and dot decimals');

assert.equal(analyzeSmartEntry({
  text: 'TOTAL: 2,518,269.000 IQD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 2518269, 'large IQD bank amount must parse correctly');

assert.equal(analyzeSmartEntry({
  text: 'TOTAL: 1,234.56 USD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 1234.56, 'US punctuation must remain valid');

assert.equal(analyzeSmartEntry({
  text: 'TOTAL: 1.234,56 EUR',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 1234.56, 'European punctuation must remain valid');



// MYFI_SMART_SPOKEN_ARBITRATION_V23_TESTS
assert.equal(analyzeSmartEntry({
  text: 'Debited 75,000 IQD at SUPERMARKET',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 75000, 'spoken-number helper must never reinterpret a formatted IQD digit amount');

assert.equal(analyzeSmartEntry({
  text: 'Transaction details\nTransaction type POS - Purchase\nAmount -13,200.000 IQD',
  cats: smartCats,
  wallets,
  lang: 'en',
}).amount, 13200, 'spoken-number helper must not override Iraqi bank decimal formatting');

assert.equal(analyzeSmartEntry({
  text: 'اشتريت تيبس ب 500 دينار',
  cats: smartCats,
  wallets,
  lang: 'ar',
}).amount, 500, 'plain spoken transcript digits must be handled by the numeric parser');

assert.equal(analyzeSmartEntry({
  text: 'بطيخ بألف ونص',
  cats: smartCats,
  wallets,
  lang: 'ar',
}).amount, 1500, 'Iraqi attached price preposition + spoken fraction must become 1500');

assert.equal(analyzeSmartEntry({
  text: 'دفعت مليون ونص إيجار من Cash أمس',
  cats: smartCats,
  wallets,
  lang: 'ar',
}).amount, 1500000, 'spoken million-and-half must remain supported');

assert.equal(analyzeSmartEntry({
  text: 'رقم الطلب ثلاثة آلاف ودفعت خمسين دولار',
  cats: smartCats,
  wallets,
  lang: 'ar',
}).amount, 50, 'spoken reference number must remain separate from the payment amount');
