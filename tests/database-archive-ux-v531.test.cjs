const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
const must = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } };

for (const rel of [
  'App.js',
  'src/dev/performanceTestConfig.js',
  'src/dev/performanceTestStorage.js',
  'src/lib/constants.js',
  'src/lib/transactionIndex.js',
  'src/lib/history.js',
  'src/components/MultiSelect.js',
  'src/lib/decisionEngine.js',
  'src/lib/financialForecast.js',
  'src/lib/localArchiveRepository.js',
  'src/store/slices/useSyncSlice.js',
  'src/store/slices/dataSlice.js',
]) must(exists(rel), `cumulative prerequisite missing: ${rel}`);

must(read('src/lib/transactionIndex.js').includes('MYFI_TRANSACTION_INDEX_V5_3'), 'V5.3 transaction index is not installed');
must(read('src/dev/performanceTestStorage.js').includes('MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2'), 'persistent performance-test storage prerequisite is missing');
must(read('App.js').includes('MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2'), 'performance-test runtime App prerequisite is missing');
must(read('src/lib/history.js').includes('getVisibleHistoryTransactions'), 'V5.2 large-ledger history helper is missing');
must(read('src/components/MultiSelect.js').includes('new Set(ids)'), 'V5.2 large-ledger MultiSelect optimization is missing');
must(read('src/lib/localArchiveRepository.js').includes('PRAGMA journal_mode = WAL'), 'V5.3 SQLite cold archive is missing');

// Verify relative imports from package-owned source files resolve against the project.
const owned = [
  'App.js',
  'src/dev/performanceTestConfig.js', 'src/dev/performanceTestData.js', 'src/dev/performanceTestStorage.js',
  'src/components/AddTransModal.js', 'src/components/MultiSelect.js',
  'src/lib/backupData.js', 'src/lib/constants.js', 'src/lib/csv.js', 'src/lib/decisionEngine.js',
  'src/lib/financialForecast.js', 'src/lib/history.js', 'src/lib/localArchiveRepository.js', 'src/lib/modules.js',
  'src/lib/myfiFiles.js', 'src/lib/pdf.js', 'src/lib/productIdentity.js', 'src/lib/transactionIndex.js',
  'src/lib/wallets.js', 'src/screens/ArchiveScreen.js', 'src/screens/HistoryScreen.js', 'src/screens/HomeScreen.js',
  'src/screens/ReportsScreen.js', 'src/screens/SettingsLegacyScreen.js', 'src/screens/SettingsScreen.js',
  'src/store/slices/dataSlice.js', 'src/store/slices/managementSlice.js', 'src/store/slices/useSyncSlice.js', 'src/utils/calc.js',
].filter(exists);
const importRe = /(?:from\s+|require\s*\()(['"])(\.\.?\/[^'"]+)\1/g;
const resolves = candidate => [candidate, `${candidate}.js`, `${candidate}.cjs`, `${candidate}.json`, path.join(candidate, 'index.js')].some(fs.existsSync);
for (const rel of owned) {
  const full = path.join(root, rel);
  const text = fs.readFileSync(full, 'utf8');
  let m;
  while ((m = importRe.exec(text))) {
    const spec = m[2];
    const candidate = path.resolve(path.dirname(full), spec);
    // Asset requires may include explicit extensions and are checked the same way.
    must(resolves(candidate), `unresolved relative import in ${rel}: ${spec}`);
  }
}

console.log('MYFI DATABASE + ARCHIVE UX V5.3.1 CUMULATIVE: PASSED');
