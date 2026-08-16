const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const contract = read('src/lib/financialDomainContract.js');
const model = read('src/lib/financialLedgerV7Model.js');
const repo = read('src/lib/financialLedgerV7Repository.js');
const active = read('src/lib/activeLedgerRepository.js');
const core = read('src/lib/financialCoreV2.js');
const modules = read('src/lib/modules.js');
const budgets = read('src/lib/budgets.js');
const categories = read('src/lib/categories.js');
const trackerSlice = read('src/store/slices/trackersSlice.js');
const backup = read('src/lib/backupData.js');
const workspace = read('src/lib/accountWorkspace.js');

assert(contract.includes("FINANCIAL_DOMAIN_CONTRACT_VERSION = 'R04-U2-2'"), 'U-2 contract version missing');

// UPA-01 — Personal/Business scope separation is part of the V7 model.
assert(model.includes('scope: String(transaction.scope'), 'Transaction scope is not frozen in V7');
assert(repo.includes('scope TEXT NOT NULL'), 'V7 storage does not persist explicit scope');
assert(contract.includes("crossScopeTransfer: 'explicit_from_scope_and_to_scope_only'"), 'Cross-scope transfer policy missing');

// UPA-05/06 — due date and debt component meaning are frozen before write-path work.
assert(contract.includes("dueDateMeaning: 'obligation_metadata_not_transaction_date'"), 'Debt due-date meaning missing');
assert(contract.includes('principalAffectsPnl: false'), 'Debt principal P&L policy missing');
assert(contract.includes("currentReleaseComponents: Object.freeze(['principal'])"), 'Current debt component support is not explicit');

// UPA-07 — tracker metadata deletion must not erase financial truth.
const debtDeleteStart = trackerSlice.indexOf('deleteDebt: async (id) =>');
const debtDeleteEnd = trackerSlice.indexOf('addPayment: async', debtDeleteStart);
assert(debtDeleteStart >= 0 && debtDeleteEnd > debtDeleteStart, 'Debt delete lifecycle block missing');
const debtDeleteBlock = trackerSlice.slice(debtDeleteStart, debtDeleteEnd);
assert(debtDeleteBlock.includes('commitEntityChangesV7'), 'Tracker delete must be entity lifecycle');
assert(!debtDeleteBlock.includes('deleteTrans('), 'Tracker delete must not delete financial transactions');

// UPA-10/20 — historical reporting uses frozen base amounts/rates, not current valuation.
assert(active.includes('fromDate = null, toDate = null'), 'Historical date boundaries missing from ledger queries');
assert(active.includes("json_extract(t.payload_json,'$.baseAmountMinor')"), 'Historical base amount snapshot missing from V7 reports');
assert(repo.includes('rate_date TEXT NOT NULL') && repo.includes('captured_at TEXT NOT NULL'), 'Historical FX snapshot metadata missing');
assert(contract.includes('historicalReportingMayUseCurrentValuation: false'), 'Valuation/history separation policy missing');

// UPA-13 — financial links use IDs rather than text matching.
assert(repo.includes('link_type TEXT NOT NULL') && repo.includes('link_id TEXT NOT NULL'), 'Explicit financial link storage missing');
assert(contract.includes("policy: 'explicit_link_id_only'"), 'Commitment matching contract missing');

// UPA-17 — budgets are base/reporting-currency semantics.
assert(budgets.includes('tx.baseAmount ?? tx.amt ?? 0'), 'Budget spend must consume base amount');
assert(contract.includes("denomination: 'ledger_base_currency'"), 'Budget denomination contract missing');

// UPA-18/19 — three-layer currency and fee policy.
assert(core.includes('entityCurrencyCode') && core.includes('walletCurrency') && core.includes('baseCurrencyCode'), 'Three-layer currency fields missing');
assert(core.includes('user_confirmed_entity_payment'), 'Entity/payment FX snapshot source missing');
assert(contract.includes("thirdCurrencyFeePolicy: 'explicitly_unsupported_until_modeled'"), 'Third-currency fee policy missing');

// Missing historical FX must remain an explicit blocker in the contract.
assert(core.includes("fxStatus: 'UNRESOLVED_FX'"), 'UNRESOLVED_FX legacy state missing');
assert(contract.includes('fallbackRateOneForForeignHistoryAllowed: false'), 'Foreign history rate=1 policy is not forbidden');

// UPA-24 — reversal semantics are explicit, not inferred from sign.
assert(contract.includes("policy: 'explicit_reference_required'"), 'Reversal reference contract missing');
assert(contract.includes('silent_sign_flipIsReversal: false'), 'Silent sign-flip reversal must be forbidden');

// UPA-30 — category lifecycle preserves transaction history.
assert(model.includes('categoryId: transaction.cat ? String(transaction.cat) : null'), 'V7 category snapshot missing');
assert(categories.includes('archivedAt') && categories.includes("status !== 'archived'"), 'Category archive lifecycle missing');
assert(contract.includes('archiveOrDeleteMayRemapHistoricalTransactions: false'), 'Category historical preservation contract missing');

// UPA-31 — feature toggle policy is explicitly UI-only.
// The legacy filtering path remains listed as an enforcement gap; this prevents a false PASS.
assert(modules.includes('filterTransactionsByEnabledFeatures'), 'Legacy feature transaction filtering path not inventoried');
assert(contract.includes('mayHideFinancialTruthFromTotalsOrHistory: false'), 'Feature-toggle financial-truth contract missing');

// UPA-42 — restore with unknown wallet is blocking, not silently repaired.
assert(backup.includes('backup_transaction_wallet_unknown'), 'Unknown transaction wallet must block restore');
assert(backup.includes('backup_commitment_wallet_unknown'), 'Unknown commitment wallet must block restore');
assert(contract.includes("unknownWalletReference: 'blocking_review'"), 'Restore unknown-wallet contract missing');
assert(contract.includes('silentDefaultWalletRepairAllowed: false'), 'Silent wallet repair must be forbidden');

// UPA-45 — cloud session and local ledger lifecycle are separate.
assert(workspace.includes('Logout preserves the mounted ledger'), 'Logout ledger-preservation contract missing in runtime');
assert(workspace.includes('preserveCurrent: true'), 'Logout/same-account relogin preserve-current behavior missing');
assert(contract.includes('cloudSessionDefinesLocalLedgerExistence: false'), 'Account/ledger separation contract missing');

// Known gaps must remain visible until later enforcement patches close them.
for (const gap of [
  'debt_interest_fee_components_not_enforced',
  'explicit_refund_reversal_command_not_implemented',
]) {
  assert(contract.includes(`'${gap}'`), `Missing U-2 enforcement-gap inventory item: ${gap}`);
}

console.log('MYFI R04 U-2 domain/storage contract freeze: PASSED');
