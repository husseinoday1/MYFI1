// MYFI — the year filter that silently emptied every History SQL page.
//
// Found 2026-09-05 on a brand-new, fully synced account with no conflict of any
// kind: History's SQL read returned zero rows on every single query, while the
// in-memory fallback showed the data correctly. The counter shipped the day
// before measured a 0.8 reject rate and we had assumed it was an artifact of
// the stuck sync on the older accounts. It was not. It was this:
//
//   if (Number.isInteger(Number(year))) { clauses.push('date_iso LIKE ?'); ... }
//
// Number(null) is 0 and Number.isInteger(0) is true, so "no year requested"
// became year 0 and every query carried `date_iso LIKE '0-%'`, which matches no
// date that has ever existed. Archive passes a real year, so it worked there;
// History passes none, so it always got nothing and fell back. Three query
// functions carried the same line.
//
// This runs the real code, not a copy.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'src/lib/activeLedgerRepository.js'), 'utf8')
  .replace(/\r\n/g, '\n');

// Sliced by marker rather than line number so this does not rot on an edit.
const sliceBetween = (from, to) => {
  const start = source.indexOf(from);
  assert(start >= 0, `could not find ${from} -- update this test`);
  const end = source.indexOf(to, start);
  assert(end > start, `could not find ${to} after ${from} -- update this test`);
  return source.slice(start, end);
};

const helpers = [
  sliceBetween('const parseJson = (value, fallback = null) => {', "const ns = value =>"),
  sliceBetween('const ns = value =>', 'const searchText'),
  sliceBetween('const queryV7TransactionPage = async (db, {', '\nexport const queryLedgerTransactions'),
].join('\n')
  // Other exports sit between the slices; strip the keyword so the vm can run
  // them as plain declarations.
  .replace(/^export const /gm, 'const ');

// Run the sliced real code in a vm context; Module._compile insists on ESM
// for a .js path inside this package.
const sandbox = { module: { exports: {} }, exports: {}, JSON, Number, String, Math, Object, Array, console };
vm.createContext(sandbox);
vm.runInContext(
  `${helpers}\nmodule.exports = { queryV7TransactionPage, yearFilter };`,
  sandbox,
  { filename: 'activeLedgerRepository-slice.js' },
);
const { queryV7TransactionPage, yearFilter } = sandbox.module.exports;

// --- the helper itself -------------------------------------------------------

// The whole defect in one line: absent must mean absent, never year zero.
for (const absent of [null, undefined, '']) {
  assert.equal(yearFilter(absent), null, `${JSON.stringify(absent)} must mean "no year filter"`);
}
// A real year still filters.
assert.equal(yearFilter(2026), 2026);
assert.equal(yearFilter('2026'), 2026, 'a year arriving as a string must still work');
// Values that cannot be a year must not become one.
for (const bogus of [0, -1, 1.5, 'abc', NaN, {}, []]) {
  assert.equal(yearFilter(bogus), null, `${JSON.stringify(bogus)} must not become a year filter`);
}

// --- the query, against real SQLite -----------------------------------------

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE ledger_financial_transactions_v7 (namespace TEXT,id TEXT,kind TEXT,status TEXT,scope TEXT,
    date_iso TEXT,occurred_at TEXT,category_id TEXT,title TEXT,note TEXT,source_type TEXT,source_id TEXT,
    idempotency_key TEXT,device_id TEXT,revision INTEGER,archive_year INTEGER,archived_at TEXT,deleted_at TEXT,
    payload_json TEXT,created_at TEXT,updated_at TEXT);
  CREATE TABLE ledger_postings_v7 (namespace TEXT,id TEXT,transaction_id TEXT,account_id TEXT);
`);
const NS = 'user:year-filter';
const insert = (id, dateISO) => db.prepare(
  'INSERT INTO ledger_financial_transactions_v7 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
).run(
  NS, id, 'income', 'posted', 'personal', dateISO, `${dateISO}T10:00:00.000Z`, 'other', 'Salary', '',
  'manual', null, `k-${id}`, 'device', 1, null, null, null,
  JSON.stringify({ flowType: 'income', baseAmount: 1000, scope: 'personal' }), dateISO, dateISO,
);
insert('tx-2026-a', '2026-09-01');
insert('tx-2026-b', '2026-08-15');
insert('tx-2025', '2025-03-10');

const wrap = { getAllAsync: async (sql, ...params) => db.prepare(String(sql)).all(...params) };
const run = extra => queryV7TransactionPage(wrap, {
  namespace: NS, limit: 250, cursor: null, search: '', transactionClass: null,
  categoryId: null, walletId: null, archived: false, fromDate: null, toDate: null, ...extra,
});

(async () => {
  // THE regression. Before the fix this returned 0 -- which is exactly what
  // every device did, on every History query, for as long as this code existed.
  {
    const result = await run({});
    assert.equal(result.rows.length, 3, 'with no year requested, History must get all rows');
  }

  // The same call History actually makes, filters and all.
  {
    const result = await run({ scope: 'personal' });
    assert.equal(result.rows.length, 3, "History's own call must return rows");
  }

  // The year filter must still work for the caller that does use it (Archive),
  // or fixing this would break the one screen that was fine.
  {
    const result = await run({ year: 2026 });
    assert.equal(result.rows.length, 2, 'a real year must still filter');
    assert.equal(result.rows.every(row => row.dateISO.startsWith('2026')), true);
  }
  {
    const result = await run({ year: 2025 });
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].id, 'tx-2025');
  }
  // A year with no data is empty, not everything -- the filter must not fall
  // open when it matches nothing.
  assert.equal((await run({ year: 2024 })).rows.length, 0);

  // Explicit absence, in the shapes a caller might actually pass.
  for (const absent of [null, undefined, '']) {
    const result = await run({ year: absent });
    assert.equal(result.rows.length, 3, `year=${JSON.stringify(absent)} must not filter anything out`);
  }

  // --- no site may go back to the trap --------------------------------------

  // All three query functions carried the identical line. Asserting on the
  // source here because the other two are not worth compiling for this, and a
  // regression would reintroduce the exact same text.
  assert.equal(
    /Number\.isInteger\(Number\(year\)\)\s*\)\s*\{/.test(source), false,
    'no query may test the year with a bare Number.isInteger(Number(year))',
  );
  assert.equal(
    (source.match(/yearFilter\(year\) !== null/g) || []).length, 3,
    'all three query functions must use the shared year filter',
  );

  console.log('PASS: history-sql-year-filter');
})();
