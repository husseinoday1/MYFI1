const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const sync = read('src/lib/financialMutationSync.js');
const repository = read('src/lib/financialLedgerV7Repository.js');

assert(sync.includes("financial_mutation_sync_page_budget_exhausted"),
  'sync must fail closed when the remote page budget is exhausted');
assert(sync.includes("financial_mutation_sync_cursor_stalled"),
  'sync must fail closed if hasMore is true without cursor progress');
assert(sync.includes("remoteHasMore"),
  'sync does not retain remote hasMore state through the loop');
assert(!sync.includes("maxPages = 4"),
  'the old four-page success cap is still present');

assert(repository.includes("financial_mutation_revision_conflict"),
  'equal-revision divergent remote mutations are not rejected');
assert(repository.includes("financial_mutation_target_missing"),
  'remote destructive/archive mutation on a missing target does not fail closed');
assert(repository.includes("canonicalSyncTransactionValue"),
  'transaction equal-revision comparison is missing');
assert(repository.includes("canonicalSyncValue"),
  'entity equal-revision comparison is missing');
assert(repository.includes("row.entityRevision < currentRevision"),
  'stale remote revision guard is missing');

console.log('MYFI P19-002 SYNC CLIENT FAIL-CLOSED CONTRACT: PASSED');
