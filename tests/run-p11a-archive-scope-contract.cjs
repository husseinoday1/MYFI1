// P11-A — Frozen Master Plan §74/§75 archive query-scope contract.
//
// Two things are proven here:
//   1. the scope helper itself (tri-state, no implicit default, balance = ALL);
//   2. that every ledger query and every call site in the app actually declares
//      a scope, so the contract cannot rot back into an implicit boolean.
//
// Plus a repeat-action check (Standing Engineering Rule 2): archiving the same
// year twice must not move a scope count or an ALL-scoped balance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const compile = (filename, source) => {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};

// --- 1. the scope helper -----------------------------------------------------

const scopeFilename = path.join(root, 'src/lib/archiveScope.js');
const scope = compile(
  scopeFilename,
  `${read('src/lib/archiveScope.js').replace(/export const /g, 'const ')}
module.exports = {
  ARCHIVE_SCOPE, isArchiveScope, requireArchiveScope,
  requireBalanceArchiveScope, archiveScopeFlag, archiveScopeClause,
};`,
);

const { ARCHIVE_SCOPE, requireArchiveScope, requireBalanceArchiveScope, archiveScopeFlag, archiveScopeClause } = scope;

assert.deepEqual(
  Object.keys(ARCHIVE_SCOPE).sort(),
  ['ACTIVE', 'ALL', 'ARCHIVED'],
  '§74 defines exactly three scopes',
);

// No implicit default: omitting the scope must fail loudly, which is the whole
// point of the change. Before Phase 11 each of these silently meant ACTIVE.
for (const bad of [undefined, null, '', 'active', 'ALL ', true, false, 0, 1]) {
  assert.throws(
    () => requireArchiveScope(bad, 'unit'),
    /archive_scope_required:unit/,
    `omitted or malformed scope must throw, got a pass for ${JSON.stringify(bad)}`,
  );
}
for (const good of ['ACTIVE', 'ARCHIVED', 'ALL']) {
  assert.equal(requireArchiveScope(good, 'unit'), good);
}

// §74: "Wallet Balance uses ALL financial postings always."
assert.equal(requireBalanceArchiveScope(ARCHIVE_SCOPE.ALL, 'unit'), 'ALL');
for (const narrowed of [ARCHIVE_SCOPE.ACTIVE, ARCHIVE_SCOPE.ARCHIVED]) {
  assert.throws(
    () => requireBalanceArchiveScope(narrowed, 'unit'),
    /archive_scope_balance_must_be_all:unit/,
    `a balance must not be narrowed to ${narrowed}`,
  );
}

assert.equal(archiveScopeFlag(ARCHIVE_SCOPE.ALL), null);
assert.equal(archiveScopeFlag(ARCHIVE_SCOPE.ARCHIVED), true);
assert.equal(archiveScopeFlag(ARCHIVE_SCOPE.ACTIVE), false);
assert.equal(archiveScopeClause(ARCHIVE_SCOPE.ALL), null);
assert.equal(archiveScopeClause(ARCHIVE_SCOPE.ARCHIVED, 't.archived_at'), 't.archived_at IS NOT NULL');
assert.equal(archiveScopeClause(ARCHIVE_SCOPE.ACTIVE, 't.archived_at'), 't.archived_at IS NULL');

// --- 2. the clause means what it says, against real SQLite -------------------

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE ledger_transactions (
    id TEXT PRIMARY KEY, date_iso TEXT, archived_at TEXT, deleted_at TEXT, amount_minor INTEGER
  );
  INSERT INTO ledger_transactions VALUES
    ('active-1',   '2026-03-01', NULL,                     NULL, -1500),
    ('archived-1', '2024-05-02', '2026-01-01T00:00:00Z',   NULL, -2500),
    ('archived-2', '2024-06-03', '2026-01-01T00:00:00Z',   NULL,   700),
    ('deleted-1',  '2026-04-04', NULL, '2026-04-05T00:00:00Z',  -99);
`);

const countFor = archiveScope => {
  const clause = archiveScopeClause(archiveScope);
  const where = ['deleted_at IS NULL', ...(clause ? [clause] : [])].join(' AND ');
  return db.prepare(`SELECT COUNT(*) AS n FROM ledger_transactions WHERE ${where}`).get().n;
};

assert.equal(countFor(ARCHIVE_SCOPE.ACTIVE), 1, 'ACTIVE sees only unarchived rows');
assert.equal(countFor(ARCHIVE_SCOPE.ARCHIVED), 2, 'ARCHIVED sees only archived rows');
// The pre-Phase-11 legacy fallback was `if (archived) ... else archived_at IS NULL`,
// so there was no way to ask for both — ALL silently collapsed to ACTIVE while the
// V7 path answered the same call with every row.
assert.equal(countFor(ARCHIVE_SCOPE.ALL), 3, 'ALL sees active and archived together');

// --- 3. the repository requires a scope on every scoped query ----------------

const repository = read('src/lib/activeLedgerRepository.js');

for (const fn of ['queryLedgerTransactions', 'queryLedgerSummary', 'queryLedgerCategorySpend']) {
  assert.match(
    repository,
    new RegExp(String.raw`requireArchiveScope\(archiveScope, '${fn}'\)`),
    `${fn} must require an explicit archive scope`,
  );
}
assert.match(
  repository,
  /requireBalanceArchiveScope\(archiveScope, 'queryLedgerWalletPositions'\)/,
  '§74: the wallet-position balance query must assert ALL',
);
assert.doesNotMatch(
  repository,
  /includeArchived/,
  'the two-state includeArchived parameter must be gone',
);
assert.doesNotMatch(
  repository,
  /archived_at IS NOT NULL'\); else clauses\.push/,
  'the binary legacy fallback that could not express ALL must be gone',
);

// The posting sum behind a wallet balance must stay free of any archive
// predicate — §74 requires it to span every archived year.
const positionsBody = repository.slice(
  repository.indexOf('export const queryLedgerWalletPositions'),
  repository.indexOf('export const exportLedgerTransactions'),
);
assert.ok(positionsBody.length > 0, 'wallet-position query body not found');
// Comments in this function mention archived_at on purpose; the SQL must not.
const positionsSql = positionsBody.split(String.fromCharCode(10))
  .filter(line => !line.trim().startsWith('//'))
  .join(String.fromCharCode(10));
assert.doesNotMatch(
  positionsSql,
  /archived_at/,
  '§74: the wallet balance query must not filter on archived_at',
);

// --- 4. every call site in the app names its scope ---------------------------

const callSites = [
  ['src/lib/financialCommandBalances.js', 2],
  ['src/screens/HistoryScreen.js', 1],
  ['src/screens/HomeScreen.js', 3],
  ['src/screens/ReportsScreen.js', 2],
];
for (const [rel, expected] of callSites) {
  const source = read(rel);
  const declared = (source.match(/archiveScope:\s*ARCHIVE_SCOPE\.(ACTIVE|ARCHIVED|ALL)/g) || []).length;
  assert.equal(declared, expected, `${rel} must declare ${expected} archive scope(s), found ${declared}`);
  assert.match(source, /import \{ ARCHIVE_SCOPE \} from '\.\.\/lib\/archiveScope'|import \{ ARCHIVE_SCOPE \} from '\.\/archiveScope'/, `${rel} must import ARCHIVE_SCOPE`);
  assert.doesNotMatch(source, /includeArchived|archived:\s*(true|false)/, `${rel} must not use the old boolean archive flags`);
}

// Every balance call site must ask for ALL, never a narrowed scope.
const balances = read('src/lib/financialCommandBalances.js');
assert.equal(
  (balances.match(/queryLedgerWalletPositions\(\{ namespace, archiveScope: ARCHIVE_SCOPE\.ALL \}\)/g) || []).length,
  2,
  '§74: both command-balance reads must span ALL',
);

// --- 5. repeat-action: archiving twice moves nothing -------------------------
// Standing Engineering Rule 2. The archive writer skips rows that already carry
// an archived_at (`if (row.archived_at) continue;`), so a second archive of the
// same year must leave every scope count and the ALL-scoped balance untouched.

assert.match(
  read('src/lib/financialLedgerV7Repository.js'),
  /if \(row\.archived_at\) continue;/,
  'the archive writer must skip already-archived rows',
);

const repeatDb = new DatabaseSync(':memory:');
repeatDb.exec(`
  CREATE TABLE tx (
    id TEXT PRIMARY KEY, date_iso TEXT, archive_year INTEGER,
    archived_at TEXT, deleted_at TEXT, revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE postings (id TEXT PRIMARY KEY, transaction_id TEXT, amount_minor INTEGER);
  INSERT INTO tx (id, date_iso) VALUES ('t-2024-a', '2024-05-02'), ('t-2024-b', '2024-06-03'), ('t-2026-a', '2026-03-01');
  INSERT INTO postings VALUES ('p1', 't-2024-a', -2500), ('p2', 't-2024-b', 700), ('p3', 't-2026-a', -1500);
`);

// Mirrors archiveFinancialTransactionsV7: skip rows already archived, bump the
// revision only for rows this run actually changes.
const archiveYear = (year, at) => repeatDb.prepare(
  `UPDATE tx SET archive_year=?, archived_at=?, revision=revision+1
    WHERE date_iso LIKE ? AND deleted_at IS NULL AND archived_at IS NULL`,
).run(year, at, `${year}-%`).changes;

const scopeSnapshot = () => {
  const count = archiveScope => {
    const clause = archiveScopeClause(archiveScope);
    const where = ['deleted_at IS NULL', ...(clause ? [clause] : [])].join(' AND ');
    return repeatDb.prepare(`SELECT COUNT(*) AS n FROM tx WHERE ${where}`).get().n;
  };
  return {
    active: count(ARCHIVE_SCOPE.ACTIVE),
    archived: count(ARCHIVE_SCOPE.ARCHIVED),
    all: count(ARCHIVE_SCOPE.ALL),
    // §73: the wallet balance spans ALL postings and must not move at all.
    balanceMinor: repeatDb.prepare('SELECT COALESCE(SUM(amount_minor),0) AS s FROM postings').get().s,
    revisions: repeatDb.prepare('SELECT id, revision FROM tx ORDER BY id').all(),
  };
};

const beforeArchive = scopeSnapshot();
assert.equal(beforeArchive.balanceMinor, -3300);

const firstChanged = archiveYear(2024, '2026-08-27T00:00:00.000Z');
const afterFirst = scopeSnapshot();
assert.equal(firstChanged, 2, 'the first archive must move both 2024 rows');
assert.equal(afterFirst.active, 1);
assert.equal(afterFirst.archived, 2);
assert.equal(afterFirst.all, 3);
assert.equal(afterFirst.balanceMinor, beforeArchive.balanceMinor, '§73: archiving must not change the balance');

// Second run, same year, later timestamp — the part a single-pass test misses.
const secondChanged = archiveYear(2024, '2026-09-01T00:00:00.000Z');
const afterSecond = scopeSnapshot();
assert.equal(secondChanged, 0, 'a repeat archive of the same year must change no rows');
assert.deepEqual(afterSecond, afterFirst, 'a repeat archive must not move a scope count, a balance, or a revision');

db.close();
repeatDb.close();
console.log('PASS p11a_archive_scope_contract');
