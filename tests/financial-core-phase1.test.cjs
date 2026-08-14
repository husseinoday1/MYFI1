const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let ts = null;
try { ts = require('typescript'); } catch {}

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const settings = read('src/screens/SettingsScreen.js');
const sync = read('src/store/slices/useSyncSlice.js');
const ledger = read('src/lib/activeLedgerRepository.js');
const db = read('src/lib/ledgerDatabase.js');
const archive = read('src/lib/localArchiveRepository.js');
const multi = read('src/lib/multiCurrency.js');
const moneySource = read('src/lib/money.js');

// Phase 1 is now a safety/foundation contract. Phase 2+ intentionally supersedes
// the original shadow-only ledger implementation without weakening these guards.
assert(!settings.includes('clearVaultSnapshot(namespaceForUser(user))'), 'Delete Account must not erase the linked local vault before preservation.');
assert(settings.includes('prepareLocalWorkspaceForAccountDeletion'), 'Delete Account must prepare a verified local-only workspace first.');
assert(settings.includes('cleanupDeletedAccountLocalNamespace'), 'Old account namespace cleanup must happen only after local activation.');
assert(settings.includes('بياناتك المالية ما زالت محفوظة على هذا الجهاز'), 'Delete Account success text must confirm local financial data remains.');
assert(sync.includes('sameWorkspaceData(localOnly, restored)'), 'Local preservation must verify the copied workspace before cloud deletion.');
assert(sync.includes('rollbackLocalWorkspaceAfterAccountDeletionFailure'), 'Failed cloud deletion must roll back the temporary guest copy.');

assert(db.includes("LEDGER_DB_NAME = 'myfi-ledger-v2.db'"), 'Financial core must share the existing MYFI SQLite database file.');
assert(db.includes('PRAGMA journal_mode = WAL'), 'Financial-core SQLite must use WAL.');
assert(archive.includes('getLedgerDb'), 'Cold archive and financial core should use the shared SQLite connection.');
assert(ledger.includes('CREATE TABLE IF NOT EXISTS ledger_transactions'), 'Active relational ledger table is missing.');
assert(ledger.includes('wallet_amount_minor INTEGER'), 'Ledger must persist wallet-native money using integer minor units.');
assert(ledger.includes('base_amount_minor INTEGER'), 'Ledger must persist canonical base-currency amounts.');
assert(ledger.includes('transfer_from_minor INTEGER') && ledger.includes('transfer_to_minor INTEGER'), 'Cross-currency transfer legs are missing.');
assert(sync.includes('replaceLedgerSnapshot'), 'Vault load/account transition must reconcile the SQLite ledger.');
assert(sync.includes('await flushLedgerMirror()'), 'Vault persistence must not overtake pending SQLite ledger writes.');

assert(multi.includes('1 unit of sourceCurrency = rate units of targetCurrency'), 'Exchange-rate convention must remain explicit.');
assert(multi.includes('normalizeTransferMoney'), 'Multi-currency transfer normalization is missing.');
assert(moneySource.includes('toMinorUnits') && moneySource.includes('fromMinorUnits'), 'Money minor-unit compatibility helpers are missing.');

if (ts) {
  function transpile(source, fileName) {
    return ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName,
    }).outputText;
  }
  function evaluateCommonJs(js, customRequire = require) {
    const module = { exports: {} };
    new Function('require', 'module', 'exports', js)(customRequire, module, module.exports);
    return module.exports;
  }
  const money = evaluateCommonJs(transpile(moneySource, 'money.js'));
  assert.equal(money.toMinorUnits(1.234, 'IQD'), 1234);
  assert.equal(money.fromMinorUnits(1234, 'IQD'), 1.234);
  assert.equal(money.toMinorUnits(12.34, 'USD'), 1234);
  assert.equal(money.toMinorUnits(123, 'JPY'), 123);

  const currencies = ['IQD','USD','EUR','JPY','KWD'].map(code => ({ code }));
  const multiExports = evaluateCommonJs(transpile(multi, 'multiCurrency.js'), request => {
    if (request === './constants') return { CURRENCIES: currencies };
    if (request === './money') return money;
    throw new Error(`Unexpected require: ${request}`);
  });
  assert.equal(multiExports.convertCurrency(100, 'USD', 'IQD', 1310), 131000);
  const transfer = multiExports.normalizeTransferMoney({ sourceAmount: 100, targetAmount: 131000, sourceCurrency: 'USD', targetCurrency: 'IQD' });
  assert.equal(transfer.sourceAmount, 100);
  assert.equal(transfer.targetAmount, 131000);
  assert.equal(transfer.transferRate, 1310);
}

console.log('MYFI FINANCIAL CORE PHASE 1 SAFETY COMPATIBILITY: PASSED');
