const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

assert(fs.existsSync(path.join(root,'docs/01_CORE_AUTHORITY/MAALFLOW_MASTER_PLAN_FROZEN.md')), 'canonical frozen plan missing');
assert(fs.existsSync(path.join(root,'docs/01_CORE_AUTHORITY/MAALFLOW_USER_NOTES_RECONCILIATION_CANONICAL_2026-08-16.md')), 'canonical reconciliation missing');

const tx = read('src/store/slices/transactionsSlice.js');
assert(!/Number\.isFinite\(walletRate\)[\s\S]{0,120}\? walletRate/.test(tx), 'foreign transaction command still silently falls back to wallet valuation');
assert(tx.includes("entityType: 'recurring_rule'"), 'recurring rule is not committed as a canonical financial entity');

const store = read('src/store/useStore.js');
assert(store.includes('!after.financialLedgerV7Cutover'), 'legacy mirror is not frozen after V7 cutover');
assert(store.includes("entityType: 'budget'"), 'budgets are not committed through V7 entity boundary');

const sync = read('src/store/slices/useSyncSlice.js');
assert(sync.includes('ACTIVE_LOCAL_LEDGER_NAMESPACE_KEY'), 'active local ledger pointer is not persisted independently of auth session');
assert(sync.includes('ACTIVE_LOCAL_LEDGER_CONTEXT_KEY'), 'active ledger/account link is not persisted independently of auth session');
assert(sync.includes('resolveWorkspaceTransition'), 'account/session lifecycle has no explicit transition contract');
assert(sync.includes('disconnectCloudSession'), 'logout is not implemented as an explicit cloud-session-only action');
assert(sync.includes('transition.shouldOfferGuestTransfer'), 'Guest transfer is not restricted to a true unlinked Guest ledger');
assert(sync.includes('preserveWorkspaceOnLogout'), 'logout preservation contract missing');
assert(sync.includes('runFinancialOperationalCutoverV7'), 'operational cutover gate missing from runtime lifecycle');

const migration = read('src/lib/financialLedgerV7Migration.js');
assert(migration.includes('export const runFinancialOperationalCutoverV7'), 'Phase 8 cutover function missing');
assert(migration.includes('runFinancialWorkspaceStageSessionV7'), 'cutover does not retain one transaction-local stage through atomic promotion');
assert(migration.includes('task: async ({ readProjection, proveInvariants, promote })'), 'cutover does not preserve parity and health gates before atomic stage promotion');

const active = read('src/lib/activeLedgerRepository.js');
assert(!active.includes("||' '||t.payload_json) LIKE ?"), 'V7 history search scans payload_json');
const summaryStart = active.indexOf('export const queryLedgerSummary');
const summaryEnd = active.indexOf('export const queryLedgerCategorySpend', summaryStart);
const summary = active.slice(summaryStart, summaryEnd);
assert(summary.includes('ledger_financial_transactions_v7'), 'V7 report summary is not SQL-first');
assert(!summary.includes('queryV7PayloadRows'), 'V7 report summary still loads full payload rows into JS');

const modules = read('src/lib/modules.js');
assert(modules.includes('cfg.activeScope'), 'mixed personal/business mode still ignores active scope separation');

const onboarding = read('src/screens/OnboardingScreen.js');
assert(onboarding.includes('countryCode') && onboarding.includes('currencyCode') && onboarding.includes('baseCurrencyConfirmedAt'), 'first-run country/base-currency confirmation gate missing');
// Reversed 2026-08-26 per docs/design/06_MAALFLOW_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md
// §7 prohibits rendering a rigid Personal/Business/Dual selector during
// onboarding. The visual role and money-organisation questions may derive a
// supported profile mode, and Settings retains the direct change path.
assert(!/typeOptions|setProfileType/.test(onboarding), 'onboarding still renders a first-run usage-type selector');
assert(onboarding.includes('profileTypeForPersonalization') && onboarding.includes("? 'personal_business'"), 'onboarding questions do not produce a supported financial profile when relevant');

const domain = read('src/store/domain.js');
assert(domain.includes('categoryBudgetsByMonth') && domain.includes('hasBudgets'), 'budget values do not lock base-currency meaning');


const backup = read('src/lib/backupData.js');
assert(backup.includes('backup_transaction_wallet_unknown') && backup.includes('backup_commitment_wallet_unknown'), 'backup wallet reference errors are not blocking');
assert(!backup.includes('backup_transaction_wallet_repaired'), 'backup validation still permits silent transaction wallet repair');

const mgmt = read('src/store/slices/managementSlice.js');
assert(mgmt.includes("entityType: 'wallet'"), 'wallet metadata path is not V7 canonical');
assert(/entityType: 'wallet'[\s\S]{0,120}deletedAt/.test(mgmt), 'financial entity soft-delete contract missing');
assert(!mgmt.includes('findRepairLinkedTarget'), 'commitment payment still performs silent tracker relinking');
assert(mgmt.includes("reason: 'linked_reference_review_required'"), 'broken commitment links do not block for explicit review');
assert(mgmt.includes('valuationUpdatedAt'), 'foreign wallet current valuation has no freshness timestamp');

const settingsLegacy = read('src/screens/SettingsLegacyScreen.js');
assert(!settingsLegacy.includes('setTransCatToOther(id)'), 'category removal still rewrites historical transactions');
assert(settingsLegacy.includes('deleteCategoriesMany([id])'), 'single category lifecycle does not use historical-safe archive path');
assert(settingsLegacy.includes('reconcileRate'), 'foreign wallet reconciliation cannot capture explicit historical FX');
assert(settingsLegacy.includes('await setCfg({ country: country.code })'), 'legacy country change still owns or silently changes base currency');
assert(settingsLegacy.includes('const setProfileType'), 'the post-onboarding profile-type change path (Settings) was removed with no replacement');
const settings = read('src/screens/SettingsScreen.js');
assert(settings.includes('await setCfg({ country: country.code })') && !settings.includes('const currencyPatch = country.currency'), 'primary Settings country change still owns or silently changes base currency');
const accountCenter = read('src/components/HomeCenterModal.js');
assert(accountCenter.includes("onOpenSettingsPage?.('account')") && !accountCenter.includes("onOpenTab?.('settings')"), 'Profile Account & Security still routes to generic Settings');

const trackers = read('src/store/slices/trackersSlice.js');
// SUPERSEDED 2026-09-06 by an explicit owner decision.
//
// R04 pinned the opposite rule: deleting a tracker was metadata-only, and its
// financial rows stayed as immutable history. The reasoning was sound -- the
// money did move, and removing a label should not rewrite that record.
//
// The owner overrode it after seeing the result on a real device: a deleted
// goal left its savings and releases in History with nothing to explain them,
// which reads as corruption rather than as history. He was told what the
// contract protected and what breaks (the rows are gone from History, and the
// cascade is not undoable) and chose deletion anyway.
//
// Applied to BOTH trackers in the same change. Doing goals alone would have
// left the app deleting history for one tracker type and keeping it for
// another, which is worse than either rule consistently applied.
//
// What is still pinned is the part that is not a preference: the sweep must
// come from the LEDGER, not from the in-memory list. A goal release carries
// hiddenFromHistory and is filtered out of state.trans, so an in-memory sweep
// would leave exactly the row whose reserved posting keeps the wallet
// inflated -- the defect that cost 800 on a real device the same day.
const debtDelete = trackers.slice(trackers.indexOf('deleteDebt: async'), trackers.indexOf('addPayment: async'));
const goalDelete = trackers.slice(trackers.indexOf('deleteGoal: async'), trackers.indexOf('releaseGoalSavings: async'));
for (const [label, body, lookup] of [['debt', debtDelete, 'findDebtLinkedTransactionIdsV7'], ['goal', goalDelete, 'findGoalLinkedTransactionIdsV7']]) {
  assert(body.includes(lookup), `deleting a ${label} must find its transactions in the ledger, not in state.trans`);
  assert(body.includes('voidFinancialTransactionsV7'), `deleting a ${label} must void its transactions`);
  assert(body.indexOf('voidFinancialTransactionsV7') < body.indexOf('commitEntityChangesV7'), `a ${label} must not be removed before its transactions are voided`);
}

const home = read('src/screens/HomeScreen.js');
assert(home.includes('queryLedgerSummary') && home.includes('queryLedgerWalletPositions'), 'Home is not SQL-first after cutover');
const homeLedgerRunStart = home.indexOf('const run = async');
const homeNamespaceRead = home.indexOf('const namespace = getLedgerNamespace', homeLedgerRunStart);
const homeLedgerCatch = home.indexOf('.catch(() => {', homeLedgerRunStart);
assert(homeLedgerRunStart >= 0 && homeNamespaceRead > homeLedgerRunStart && homeLedgerCatch > homeNamespaceRead, 'Home ledger namespace/read path is not guarded by a promise catch boundary');
assert(home.includes('setSqlHomeError(true)') && home.includes('ledgerUnavailable'), 'Home ledger failure does not surface a clear user state');
assert(home.includes('if (financialLedgerV7Cutover && sqlHomeError) return [];'), 'Home can still show fallback wallet balances after a V7 ledger read failure');
assert(home.includes('() => ledgerReadFailed ? []'), 'Home can still show fallback recent transactions after a V7 ledger read failure');
const reports = read('src/screens/ReportsScreen.js');
assert(reports.includes('queryLedgerSummary') && reports.includes('queryLedgerCategorySpend'), 'Reports aggregations are not SQL-first after cutover');

const currencySummary = read('src/lib/entityCurrencySummary.js');
assert(currencySummary.includes('summarizeDebtCurrencies') && currencySummary.includes('summarizeGoalCurrencies') && currencySummary.includes('summarizeCommitmentCurrencies'), 'multi-currency planning entities can still be silently summed across currencies');
assert(home.includes('effectiveMonthSummary.net') && !home.includes('value: signed(snapshot.month.bal)'), 'Home net card does not use canonical SQL month net after cutover');
assert(home.includes('allocationBaseAmount') && home.includes('goalCurrencyGroups') && home.includes('dueCommitmentGroups'), 'Home planning cards can still label mixed native amounts as base currency');
assert(reports.includes('CurrencyGroupMetric') && reports.includes('currentTrackerStateHint') && reports.includes('currentNetPositionReliable'), 'Reports still present mixed/current planning data as a false single historical base total');
const pdf = read('src/lib/pdf.js');
assert(pdf.includes('debtCurrencyGroups') && pdf.includes('transactionCurrency') && pdf.includes('formatMoneyNumber'), 'PDF export can still mislabel multi-currency amounts or discard currency precision');
assert(sync.includes('transactionLimit: 2000'), 'post-cutover Zustand transaction cache is not bounded');

assert(sync.includes('financial_v7_workspace_metadata_commit_failed'), 'post-cutover saveLocal does not use metadata-only persistence');
assert(sync.includes('bounded cache must never overwrite it'), 'post-cutover Vault truncation guard missing');
const saveLocalStart = sync.indexOf('saveLocal: async');
const accountDeleteStart = sync.indexOf('prepareLocalWorkspaceForAccountDeletion', saveLocalStart);
const saveLocalBody = sync.slice(saveLocalStart, accountDeleteStart);
assert(saveLocalBody.includes('if (postCutover)'), 'saveLocal has no explicit post-cutover branch');
assert(saveLocalBody.includes("entityType: 'workspace'"), 'post-cutover saveLocal does not persist workspace metadata');
assert(sync.includes('readCurrentForSnapshot') && sync.includes('financial_v7_sync_full_snapshot_failed'), 'post-cutover snapshot sync can still use the bounded UI cache');
assert(sync.includes('readCanonicalWorkspaceState') && sync.includes('transferGuestToCurrent'), 'Guest→Account merge does not read the canonical local workspace');
assert(sync.includes('restoreSnapshotAsOperationalV7'), 'merge rollback cannot restore an operational guest V7 ledger');

const commandBalances = read('src/lib/financialCommandBalances.js');
assert(commandBalances.includes('queryLedgerWalletPositions'), 'financial command balance checks do not use SQLite after cutover');
assert(tx.includes('walletPositionForCommand'), 'transaction commands still validate balances from bounded Zustand only');
assert(trackers.includes('walletPositionForTrackerCommand'), 'tracker payment commands still validate balances from bounded Zustand only');
assert(mgmt.includes('walletBalanceForManagementCommand'), 'wallet reconciliation still derives canonical balance from bounded Zustand only');

console.log('MaalFlow R04 PHASE 6-9 CONTRACT: PASSED');
