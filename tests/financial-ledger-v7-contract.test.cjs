const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const repository = read('src/lib/financialLedgerV7Repository.js');
const model = read('src/lib/financialLedgerV7Model.js');
const transactions = read('src/store/slices/transactionsSlice.js');
const mirror = read('src/lib/activeLedgerRepository.js');
const migration = read('src/lib/financialLedgerV7Migration.js');
const mutationSync = read('src/lib/financialMutationSync.js');
const cloudMutationMigration = read('supabase/migrations/202608140001_financial_mutation_sync_v1.sql');

assert(model.includes('FINANCIAL_LEDGER_SCHEMA_VERSION = 7'), 'V7 model version marker missing');
assert(model.includes('buildExpenseLedgerCommand'), 'Expense command builder missing');
assert(model.includes('rateDate') && model.includes('rateSource'), 'Historical exchange-rate provenance missing');
assert(repository.includes('ledger_financial_transactions_v7'), 'V7 transaction header table missing');
assert(repository.includes('ledger_postings_v7'), 'V7 posting table missing');
assert(repository.includes('ledger_outbox_v2'), 'V7 outbox table missing');
assert(repository.includes('ledger_entities_v7') && repository.includes('ledger_workspace_state_v7'), 'V7 entities/cutover state tables missing');
assert(repository.includes('withTransactionAsync'), 'Expense header, posting, and outbox must share one SQLite transaction');
assert(repository.includes('financial_v7_expense_readback_failed'), 'Committed Expense must be read back from Header/Postings before reaching UI state');
assert(!/ledger_(?:accounts|exchange_rates|financial_transactions|postings|outbox)[\s\S]*?\bREAL\b/.test(repository), 'V7 financial schema must not store money or rates as REAL');
assert(transactions.indexOf('commitExpenseToFinancialLedgerV7') < transactions.indexOf('set(s => ({\n      trans: [tx, ...s.trans]'), 'Expense must commit to SQLite before updating UI state');
assert(mirror.includes('outbox: false') && mirror.includes('storageEngineVersion'), 'V6 compatibility mirror must not duplicate the atomic V7 outbox mutation');
assert(migration.includes('runFinancialShadowMigrationV7') && migration.includes('shadow_parity_failed'), 'Shadow migration parity gate missing');
assert(migration.includes('coldArchives') && migration.includes('syntheticMigrationOpening'), 'Cold archive or opening-balance migration missing');
assert(mutationSync.includes('sync_financial_mutations_v1') && mutationSync.includes('applyRemoteLedgerMutationsV7'), 'V7 mutation sync client missing');
assert(cloudMutationMigration.includes('financial_mutations_v1') && cloudMutationMigration.includes('auth.uid()'), 'Authenticated mutation sync schema/RPC missing');

console.log('MYFI Financial Ledger V7 static contract passed.');
