const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const source = fs.readFileSync(
  path.join(root, 'src', 'dev', 'phase10RestoreBenchmarkHarness.js'),
  'utf8',
);

assert.equal(
  source.includes('readFinancialProjectionV7'),
  false,
  'The 100k benchmark must not materialize complete SQLite projections just to compare counts',
);
assert(source.includes('const readProjectionCounts = async ({ db, namespace }) =>'), 'Benchmark needs scalar SQLite count readback');
assert(source.includes('SELECT COUNT(*) AS row_count FROM ledger_financial_transactions_v7'), 'Transaction structural verification must stay inside SQLite');
assert(source.includes('SELECT COUNT(*) AS row_count FROM ledger_postings_v7'), 'Posting structural verification must stay inside SQLite');
assert(source.includes('workspace = null;') && source.includes('coldArchives = null;'), 'Largest-tier fixture copies must be released before SQLite staging/readback');

console.log('Phase 10 restore benchmark memory contract passed.');
