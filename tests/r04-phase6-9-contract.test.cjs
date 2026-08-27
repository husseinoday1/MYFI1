const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

assert(fs.existsSync(path.join(root,'docs/01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md')), 'canonical frozen plan missing');
assert(fs.existsSync(path.join(root,'docs/01_CORE_AUTHORITY/MYFI_USER_NOTES_RECONCILIATION_CANONICAL_2026-08-16.md')), 'canonical reconciliation missing');

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
assert(migration.includes('promoteFinancialWorkspaceStageV7'), 'cutover does not use atomic stage promotion');

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
// Reversed 2026-08-26 per docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md
// §7 (LOCKED — explicitly prohibits a Personal/Business/Dual selector during
// onboarding). New accounts now default to 'personal' silently; the existing
// SettingsLegacyScreen.js:665 profile-type control remains the (unchanged)
// way to change it later.
assert(!/typeOptions|setProfileType/.test(onboarding), 'onboarding still renders a first-run usage-type selector');
assert(onboarding.includes("const profileType = 'personal';"), 'onboarding no longer defaults profileType to personal silently');

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
const debtDelete = trackers.slice(trackers.indexOf('deleteDebt: async'), trackers.indexOf('addPayment: async'));
assert(!debtDelete.includes('trans: s.trans.filter'), 'deleting a debt still deletes financial history');
const goalDelete = trackers.slice(trackers.indexOf('deleteGoal: async'), trackers.indexOf('releaseGoalSavings: async'));
assert(!goalDelete.includes('trans: s.trans.filter'), 'deleting a goal still deletes financial history');

const home = read('src/screens/HomeScreen.js');
assert(home.includes('queryLedgerSummary') && home.includes('queryLedgerWalletPositions'), 'Home is not SQL-first after cutover');
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

console.log('MYFI R04 PHASE 6-9 CONTRACT: PASSED');
