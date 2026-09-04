const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };

const history = read('src/screens/HistoryScreen.js');
const add = read('src/components/AddTransModal.js');
const management = read('src/store/slices/managementSlice.js');
const reports = read('src/screens/ReportsScreen.js');
const home = read('src/screens/HomeScreen.js');
const calc = read('src/utils/calc.js');
const indexRaw = read('src/lib/transactionIndex.js');
const perf = read('src/dev/performanceTestData.js');
const repo = read('src/lib/localArchiveRepository.js');
const data = read('src/store/slices/dataSlice.js');
const files = read('src/lib/myfiFiles.js');
const csv = read('src/lib/csv.js');
const pdf = read('src/lib/pdf.js');
const backup = read('src/lib/backupData.js');
const archive = read('src/screens/ArchiveScreen.js');
const settings = read('src/screens/SettingsScreen.js');
const wallets = read('src/lib/wallets.js');
const modules = read('src/lib/modules.js');

// History hierarchy, ordering, and sticky controls.
must(history.includes('const HistoryControls ='), 'History fixed control component is missing');
must(!history.includes('ListHeaderComponent={('), 'History search/filter still scrolls away inside ListHeaderComponent');
must(history.indexOf('<HistoryControls') < history.indexOf('<SectionList'), 'History controls are not fixed above the scrolling list');
must(!history.includes('s.historyTitle') && !history.includes('s.historyCount'), 'History title/count header was not removed');
must(history.includes('getTransactionsNewestFirst(getVisibleHistoryTransactions'), 'History does not use canonical newest-first ordering');
must(history.includes('initialNumToRender={24}') && history.includes('renderLimit') && history.includes('onEndReached'), 'History virtualization/progressive rendering is missing');

// Repeating a movement always opens a reviewed draft, including linked/transfer types.
must(history.includes('canDuplicate={!!details && ![') && history.includes('TRANSACTION_SEMANTIC_KIND.OPENING_BALANCE') && history.includes('TRANSACTION_SEMANTIC_KIND.BALANCE_ADJUSTMENT'), 'Repeat action must stay available for reviewed movements while protecting opening balances and reconciliations');
must(history.includes("mode: 'transfer'") && history.includes("mode: 'debt'") && history.includes("mode: 'goal'") && history.includes("mode: 'commitment'"), 'History does not build repeat drafts for all movement types');
must(!history.includes('duplicateTrans(target.id)'), 'History still performs a silent direct duplicate');
must(add.includes('const draftMode = normalizeEntryMode('), 'Add transaction modal cannot hydrate typed repeat drafts');
must(add.includes('setSelDebt(draftData.debtId') && add.includes('setSelGoal(draftData.goalId') && add.includes('setSelCommitment(draftData.commitmentId'), 'Linked repeat draft identifiers are not hydrated');

// Commitment payment defaults are consistent from Home and Trackers.
must(management.includes('walletId || defaultWalletId || commitment.walletId'), 'Commitment payment does not prefer the configured default wallet');
must(add.includes('setWalletId(defaultWalletId);'), 'Commitment entry UI does not default to the configured wallet');
must(!add.includes('setWalletId(commitment?.walletId || defaultWalletId);'), 'Tracker commitment picker still overrides the default wallet');

// Reports should reveal content directly under the selected row, not another titled card.
for (const token of ['title={C.liquidityTitle}', 'title={C.cashFlowTitle}', 'title={C.debtsDueTitle}', 'title={C.goalsTitle}', 'title={C.topSpending}', 'title={C.comparisonTitle}']) {
  must(!reports.includes(token), `Nested report card title still exists: ${token}`);
}
must(reports.includes('reportInlineStack'), 'Direct inline report detail layout is missing');

// Root large-ledger distribution: current year hot, completed years in indexed SQLite cold storage.
must(perf.includes('partitionCompletedYears') && perf.includes('__performanceArchives'), 'Performance fixtures are not partitioned by completed year');
must(perf.includes('performanceTestActiveTransactions') && perf.includes('performanceTestArchivedTransactions'), 'Hot/cold performance counts are missing');
// §102: the pragma lives on the shared connection, not in this repository module.
// This previously matched a comment inside localArchiveRepository.js, so it passed
// on prose rather than on configuration. Point it at the single real owner.
must(read('src/lib/ledgerDatabase.js').includes('PRAGMA journal_mode = WAL'), 'SQLite WAL is not enabled');
must(repo.includes('cold_archive_years') && repo.includes('cold_archive_transactions'), 'Relational cold archive tables are missing');
must(repo.includes('idx_cold_archive_date') && repo.includes('idx_cold_archive_wallet') && repo.includes('idx_cold_archive_category'), 'Cold archive indexes are incomplete');
must(repo.includes('ORDER BY date_iso DESC, ts DESC, id DESC'), 'Archived transaction retrieval is not newest-first');
must(data.includes('await storeColdArchiveYear') && data.includes('if (!archiveStored) return false'), 'Year archive can be removed from hot data before SQLite persistence succeeds');
must(settings.includes('أرشيف SQLite') && settings.includes('performanceTestActiveTransactions'), 'Performance lab does not expose hot/cold distribution');
must(perf.includes('currentDayCap') && perf.includes('dayLimit = monthIndex === 0 ? currentDayCap : 28'), 'Performance fixtures can still generate future dates in the current month');

// High-frequency calculations avoid repeated full-history work.
must(calc.includes('const statsCache = new WeakMap()'), 'Financial stats cache is missing');
must(home.includes('getMonthTransactionsByKey(scopedTrans, currentMonthKey)'), 'Home still scans the whole ledger for month summary activity');
must(home.includes('scopedTransactionIndex.pendingSmartReviewCount'), 'Home still scans the whole ledger for smart-review count');
must(wallets.includes('const walletBalanceCache = new WeakMap()') && wallets.includes('const walletAvailableBalanceCache = new WeakMap()'), 'Wallet balance calculations are not cached for stable ledger arrays');
must(modules.includes('if (getActiveScope(cfg) === SCOPES.ALL) return source;'), 'Scope filtering still clones the full ledger unnecessarily in all-scope mode');

// Portable archive speed/save and output identity.
must(files.includes("compression: 'deflate-base64-v1'") && files.includes('level: encrypted ? 0 : 6'), 'Encrypted archive still wastes CPU compressing ciphertext');
must(files.includes('StorageAccessFramework') && files.includes('requestDirectoryPermissionsAsync') && files.includes('createFileAsync'), 'Android direct archive save is missing');
must(archive.includes('حفظ في الهاتف') && archive.includes('saveMyfiPackageToDevice'), 'Archive screen does not offer direct phone saving');
must(csv.includes("'app'") && csv.includes('PRODUCT_NAME') && csv.includes('PRODUCT_FILE_PREFIX'), 'CSV output is not centrally branded');
must(pdf.includes('PRODUCT_NAME'), 'PDF output is not centrally branded');
must(files.includes('PRODUCT_FILE_PREFIX') && files.includes('PRODUCT_NAME'), 'Archive/backup output is not centrally branded');

// Cold years are carried inside full backup/restore so archiving cannot create a backup data-loss gap.
must(backup.includes('MYFI_BACKUP_DATA_VERSION = 11'), 'Logical backup schema was not advanced for custom tracker data');
must(backup.includes('coldArchives'), 'Full backup schema does not include cold archives');
must(data.includes('exportColdArchives') && data.includes('replaceColdArchives'), 'Backup/restore does not carry cold archive data');
must(repo.includes('restore-stage'), 'Cold archive restore does not stage before replacing active archive data');

// Runtime comparator test: dateISO is authoritative; ts only orders rows within the same day.
let indexSource = indexRaw
  .replace(/^import[^;]+;\s*/m, '')
  .replace(/export const /g, 'const ');
indexSource += '\nmodule.exports = { compareTransactionsNewestFirst, getTransactionsNewestFirst, getTransactionIndex, getTransactionsThroughDate };\n';
const sandbox = {
  module: { exports: {} }, exports: {}, WeakMap, Map, Set, Array, String, Number, Math,
  isIncomeFlow: tx => tx?.kind !== 'transfer' && Number(tx?.amt || 0) > 0,
  isExpenseFlow: tx => tx?.kind !== 'transfer' && Number(tx?.amt || 0) < 0,
};
vm.createContext(sandbox);
vm.runInContext(indexSource, sandbox, { filename: 'transactionIndex.js' });
const api = sandbox.module.exports;
const ordered = api.getTransactionsNewestFirst([
  { id: 'old-high-ts', dateISO: '2026-07-31', ts: 9999999999999, amt: -1 },
  { id: 'today-low-ts', dateISO: '2026-08-13', ts: 1, amt: -1 },
  { id: 'today-newer', dateISO: '2026-08-13', ts: 2, amt: -1 },
]);
must(ordered.map(x => x.id).join(',') === 'today-newer,today-low-ts,old-high-ts', 'History comparator does not keep newer calendar dates first');

const baseRows = [
  { id: 'expense', dateISO: '2026-08-13', amt: -100 },
  { id: 'income', dateISO: '2026-08-12', amt: 300 },
];
const baseIndex = api.getTransactionIndex(baseRows);
const prependedRows = [
  { id: 'transfer', kind: 'transfer', dateISO: '2026-08-14', feeBaseAmount: 5 },
  ...baseRows,
];
const prependedIndex = api.getTransactionIndex(prependedRows);
must(baseIndex.stats.inc === 300 && baseIndex.stats.exp === 100, 'Base transaction totals are incorrect');
must(prependedIndex.stats.inc === 300 && prependedIndex.stats.exp === 105, 'Incremental totals lost transfer fees');
must(api.getTransactionsThroughDate(prependedRows, '2026-08-13').map(x => x.id).join(',') === 'expense,income', 'As-of snapshot includes future transactions');
must(api.getTransactionsThroughDate(prependedRows, '2026-08-14') === prependedIndex.ordered, 'Current snapshots should reuse the indexed source without copying a large ledger');

// Runtime logical backup v10 preserves cold archive rows.
let backupSource = backup.replace(/export const /g, 'const ');
backupSource += '\nmodule.exports = { MYFI_BACKUP_DATA_VERSION, buildFinancialBackup, inspectBackupData, summarizeBackupData };\n';
const bctx = { module: { exports: {} }, exports: {}, Array, Object, Number, String, Set, Map, Date };
vm.createContext(bctx);
vm.runInContext(backupSource, bctx, { filename: 'backupData.js' });
const b = bctx.module.exports.buildFinancialBackup({
  trans: [{ id: 'active', dateISO: '2026-08-13' }],
  wallets: [{ id: 'w1' }],
  coldArchives: [{ year: 2025, scope: 'personal', data: { trans: [{ id: 'archived', dateISO: '2025-01-01' }] } }],
});
const inspection = bctx.module.exports.inspectBackupData(b);
must(inspection.valid, 'Backup v10 with cold archive failed validation');
must(inspection.entries === 2 && inspection.activeEntries === 1 && inspection.archivedEntries === 1, 'Backup summary lost active/cold transaction counts');

console.log('MYFI DATABASE + ARCHIVE UX V5.3: PASSED');
