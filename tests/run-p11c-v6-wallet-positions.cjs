// P11-C step 1 — the V6 posting-derived, ALL-scoped wallet balance.
//
// Before this, queryLedgerWalletPositions had a real implementation only on the
// V7 branch; its non-cutover branch returned `{ supported: false, rows: [] }`.
// Every consumer Phase 11-C needs to migrate off the hot in-memory array
// therefore had nothing to migrate *to* for users who have not completed the V7
// cutover. This builds that query, and pins it against the one thing that
// matters: it must agree, exactly, with the legacy in-memory calculation it is
// meant to replace.
//
// The comparison is the point. A V6 balance query that is merely "reasonable"
// is useless — if it disagrees with applyWalletMovement by even one minor unit,
// migrating a screen onto it moves a real user's displayed balance.
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

// wallets.js has no imports of its own, so it compiles standalone.
const walletsFilename = path.join(root, 'src/lib/wallets.js');
const wallets = compile(
  walletsFilename,
  `${read('src/lib/wallets.js').replace(/export const /g, 'const ')}
module.exports = { getWalletBalances, getWalletAvailableBalances, getDefaultWalletId, normalizeWallets };`,
);

// --- the fixture: one workspace, expressed both ways -------------------------
// Two wallets, and every movement shape applyWalletMovement handles: income,
// expense, an intra-workspace transfer with a fee, a goal allocation that is
// still reserved, one that was released, and a row with no walletId at all
// (which the legacy code attributes to the default wallet).

const IQD = 'IQD';
const OPENING_W1 = 5000;
const OPENING_W2 = 200;

const legacyWallets = [
  { id: 'w1', currency: IQD, openingBalance: OPENING_W1, name: 'Cash', type: 'cash', scope: 'personal' },
  { id: 'w2', currency: IQD, openingBalance: OPENING_W2, name: 'Bank', type: 'bank', scope: 'personal' },
];

const legacyTrans = [
  { id: 't-income', walletId: 'w1', walletAmount: 1000, amt: 1000, dateISO: '2025-05-01', kind: 'transaction', flowType: 'income' },
  { id: 't-expense', walletId: 'w1', walletAmount: -300, amt: -300, dateISO: '2026-03-01', kind: 'transaction', flowType: 'expense' },
  {
    id: 't-transfer', kind: 'transfer', flowType: 'transfer', dateISO: '2026-04-01',
    fromWalletId: 'w1', toWalletId: 'w2',
    transferFromAmount: 500, transferToAmount: 500, feeAmount: 7,
  },
  {
    id: 't-goal-reserved', walletId: 'w2', walletAmount: 0, amt: 0, dateISO: '2026-05-01',
    kind: 'transaction', flowType: 'goal_allocation', isGoalSaving: true, goalId: 'g1',
    allocationWalletAmount: 120, allocationAmount: 120,
  },
  {
    id: 't-goal-released', walletId: 'w2', walletAmount: 0, amt: 0, dateISO: '2026-06-01',
    kind: 'transaction', flowType: 'goal_allocation', isGoalSaving: true, goalId: 'g1',
    allocationWalletAmount: 60, allocationAmount: 60, allocationReleased: true,
  },
  // No walletId: applyWalletMovement charges this to the default wallet.
  { id: 't-no-wallet', walletAmount: -25, amt: -25, dateISO: '2026-07-01', kind: 'transaction', flowType: 'expense' },
];

const DEFAULT_WALLET = 'w1';

// --- the legacy answer -------------------------------------------------------

const legacyBalances = wallets.getWalletAvailableBalances(legacyWallets, legacyTrans, IQD, DEFAULT_WALLET);
const legacyById = new Map(legacyBalances.map(row => [row.id, row]));

// Sanity: the fixture must actually exercise what it claims, or the comparison
// below would be green against a trivial case.
assert.equal(legacyById.get('w1').balance, 5000 + 1000 - 300 - (500 + 7) - 25, 'w1 legacy balance');
assert.equal(legacyById.get('w2').balance, 200 + 500, 'w2 legacy balance');
assert.equal(legacyById.get('w2').reservedBalance, 120, 'only the unreleased allocation reserves');
assert.equal(legacyById.get('w1').reservedBalance, 0);

// --- the same workspace, as V6 rows -----------------------------------------
// Column values follow txBind in activeLedgerRepository.js: wallet_amount_minor
// is signed, transfer_*_minor and fee_minor are absolute, IQD has 3 decimals.

const minor = value => Math.round(value * 1000);

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE ledger_wallets (
    namespace TEXT NOT NULL, id TEXT NOT NULL, name TEXT, wallet_type TEXT, scope TEXT,
    currency_code TEXT NOT NULL, opening_minor INTEGER NOT NULL DEFAULT 0,
    opening_base_minor INTEGER NOT NULL DEFAULT 0, base_currency TEXT NOT NULL,
    valuation_rate REAL NOT NULL DEFAULT 1, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(namespace, id)
  );
  CREATE TABLE ledger_transactions (
    namespace TEXT NOT NULL, id TEXT NOT NULL, scope TEXT, date_iso TEXT NOT NULL,
    ts INTEGER NOT NULL DEFAULT 0, kind TEXT, flow_type TEXT, wallet_id TEXT,
    from_wallet_id TEXT, to_wallet_id TEXT, category_id TEXT, wallet_currency TEXT,
    base_currency TEXT, wallet_amount_minor INTEGER NOT NULL DEFAULT 0,
    base_amount_minor INTEGER NOT NULL DEFAULT 0, transfer_from_minor INTEGER NOT NULL DEFAULT 0,
    transfer_to_minor INTEGER NOT NULL DEFAULT 0, transfer_from_currency TEXT,
    transfer_to_currency TEXT, exchange_rate REAL NOT NULL DEFAULT 1,
    fee_minor INTEGER NOT NULL DEFAULT 0, fee_base_minor INTEGER NOT NULL DEFAULT 0,
    search_text TEXT, archive_year INTEGER, archived_at TEXT, deleted_at TEXT,
    payload_json TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(namespace, id)
  );
`);

const insertWallet = db.prepare(`
  INSERT INTO ledger_wallets (namespace,id,name,wallet_type,scope,currency_code,opening_minor,
    opening_base_minor,base_currency,valuation_rate,payload_json,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,1,?,'2026-08-27')
`);
for (const wallet of legacyWallets) {
  insertWallet.run(
    'ns', wallet.id, wallet.name, wallet.type, wallet.scope, IQD,
    minor(wallet.openingBalance), minor(wallet.openingBalance), IQD,
    JSON.stringify({ status: 'active', type: wallet.type }),
  );
}

const insertTx = db.prepare(`
  INSERT INTO ledger_transactions (namespace,id,scope,date_iso,ts,kind,flow_type,wallet_id,
    from_wallet_id,to_wallet_id,wallet_currency,base_currency,wallet_amount_minor,base_amount_minor,
    transfer_from_minor,transfer_to_minor,fee_minor,archived_at,deleted_at,payload_json,updated_at)
  VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,'2026-08-27')
`);
for (const tx of legacyTrans) {
  insertTx.run(
    'ns', tx.id, 'personal', tx.dateISO, tx.kind, tx.flowType,
    tx.walletId ?? null, tx.fromWalletId ?? null, tx.toWalletId ?? null,
    IQD, IQD,
    minor(Number(tx.walletAmount ?? tx.amt ?? 0)),
    minor(Number(tx.walletAmount ?? tx.amt ?? 0)),
    minor(Math.abs(Number(tx.transferFromAmount ?? 0))),
    minor(Math.abs(Number(tx.transferToAmount ?? 0))),
    minor(Math.abs(Number(tx.feeAmount ?? 0))),
    // Half the archived years are marked archived, to prove §74's ALL scope:
    // the query must count them exactly the same as unarchived rows.
    tx.dateISO.startsWith('2025') ? '2026-01-01T00:00:00Z' : null,
    JSON.stringify(tx),
  );
}

// --- run the shipped query's V6 branch against those rows -------------------
// The module is loaded with react-native / expo-sqlite stubbed, and getLedgerDb
// pointed at the in-memory database above, so the real shipped SQL runs.

const repoFilename = path.join(root, 'src/lib/activeLedgerRepository.js');
let repoSource = read('src/lib/activeLedgerRepository.js');
assert.ok(
  repoSource.includes("source: 'sqlite_v6'"),
  'the V6 branch must exist and identify itself',
);

// The SQL is the thing under test; extract and run it exactly as shipped rather
// than re-typing it here, so a future edit to the query is actually covered.
const movementSqlMatch = repoSource.match(/const movementRows = await db\.getAllAsync\(\s*`([\s\S]*?)`,/);
assert.ok(movementSqlMatch, 'the V6 movement query could not be located');
const walletSqlMatch = repoSource.match(/const walletRows = await db\.getAllAsync\(\s*`([\s\S]*?)`,/);
assert.ok(walletSqlMatch, 'the V6 wallet query could not be located');

const walletSql = walletSqlMatch[1].replace('${walletScopeClause}', '');
const movementSql = movementSqlMatch[1];

const reservedSqlMatch = repoSource.match(/const reservedRows = await db\.getAllAsync\(\s*`([\s\S]*?)`,/);
assert.ok(reservedSqlMatch, 'the V6 reserved query could not be located');
const reservedSql = reservedSqlMatch[1];

const v6WalletRows = db.prepare(walletSql).all('ns');
const v6MovementRows = db.prepare(movementSql).all(DEFAULT_WALLET, 'ns', DEFAULT_WALLET);
const v6ReservedRows = db.prepare(reservedSql).all(DEFAULT_WALLET, 'ns');

// Reduce exactly as the shipped function does.
const totals = new Map(v6WalletRows.map(row => [String(row.id), { physical: 0, reserved: 0 }]));
const bump = (walletId, field, amount) => {
  const entry = totals.get(String(walletId || ''));
  if (entry) entry[field] += Number(amount || 0);
};
for (const row of v6MovementRows) {
  if (String(row.kind || '') === 'transfer') {
    bump(row.from_wallet_id, 'physical', -(Number(row.transfer_from_minor || 0) + Number(row.fee_minor || 0)));
    bump(row.to_wallet_id, 'physical', Number(row.transfer_to_minor || 0));
    continue;
  }
  bump(row.wallet_id, 'physical', Number(row.wallet_minor || 0));
}

// Reserved, reduced exactly as the shipped function does: the allocation amount
// is stored in payload_json in MAJOR units, so it is converted per row using
// that wallet's currency rather than summed in SQL.
const walletCurrencies = new Map(v6WalletRows.map(row => [String(row.id), row.currency_code]));
for (const row of v6ReservedRows) {
  const walletId = String(row.wallet_id || '');
  if (!walletCurrencies.has(walletId)) continue;
  const payload = JSON.parse(row.payload_json);
  const amount = Math.abs(Number(
    payload.allocationWalletAmount ?? payload.allocationAmount ?? payload.amt ?? 0,
  ));
  if (!amount) continue;
  bump(walletId, 'reserved', minor(amount));
}

// The reserved query must actually pick out the right rows, not everything.
assert.equal(v6ReservedRows.length, 1, 'only the unreleased goal allocation must be selected as reserved');
assert.equal(String(v6ReservedRows[0].wallet_id), 'w2');

// --- the comparison that matters --------------------------------------------

for (const walletRow of v6WalletRows) {
  const id = String(walletRow.id);
  const totalsRow = totals.get(id);
  const physicalMinor = Number(walletRow.opening_minor || 0) + totalsRow.physical;
  const reservedMinor = totalsRow.reserved;

  const legacy = legacyById.get(id);
  assert.ok(legacy, `legacy balance missing for ${id}`);

  assert.equal(
    physicalMinor,
    minor(legacy.balance),
    `${id}: V6 posting-derived balance must equal the legacy in-memory balance`,
  );
  assert.equal(
    reservedMinor,
    minor(legacy.reservedBalance),
    `${id}: V6 reserved balance must equal the legacy reserved balance`,
  );
  assert.equal(
    physicalMinor - reservedMinor,
    minor(legacy.availableBalance),
    `${id}: V6 available balance must equal the legacy available balance`,
  );
}

// --- §74: the archived rows were counted, not skipped ------------------------
// t-income (2025) is marked archived in the fixture. If the query had an
// archived_at predicate, w1 would be short by exactly that amount.

assert.equal(
  Number(v6WalletRows.find(row => String(row.id) === 'w1').opening_minor) + totals.get('w1').physical,
  minor(5000 + 1000 - 300 - 507 - 25),
  '§74: the archived 2025 income must be included in the balance',
);
assert.doesNotMatch(movementSql, /archived_at/, '§74: the V6 balance query must not filter on archived_at');
assert.doesNotMatch(walletSql, /archived_at/, '§74: the V6 wallet query must not filter on archived_at');

// --- scope filters wallets, never movements ---------------------------------
// A movement labelled with another scope still moved real money in this wallet.
// Excluding it would report a balance the wallet does not have. The V7 branch
// already behaves this way (it filters a.scope but sums every posting on the
// account); this pins the V6 branch to the same rule, and pins it as a
// deliberate difference from the in-memory path rather than an oversight.

assert.match(walletSql, /scope/, 'the wallet query must be able to filter by scope');
assert.doesNotMatch(
  movementSql,
  /scope/,
  'the movement query must NOT filter by scope — a cross-scope movement still moved this wallet',
);

// Prove it against data, not just the SQL text: a transfer labelled 'business'
// out of a 'personal' wallet must still debit that wallet.
db.prepare(`
  INSERT INTO ledger_transactions (namespace,id,scope,date_iso,ts,kind,flow_type,wallet_id,
    from_wallet_id,to_wallet_id,wallet_currency,base_currency,wallet_amount_minor,base_amount_minor,
    transfer_from_minor,transfer_to_minor,fee_minor,archived_at,deleted_at,payload_json,updated_at)
  VALUES ('ns','t-cross-scope','business','2026-08-01',0,'transfer','transfer',NULL,
    'w1','w2','IQD','IQD',0,0,?,?,0,NULL,NULL,'{}','2026-08-27')
`).run(minor(40), minor(40));

const crossScopeRows = db.prepare(movementSql).all(DEFAULT_WALLET, 'ns', DEFAULT_WALLET);
const crossScopeTotals = new Map(v6WalletRows.map(row => [String(row.id), { physical: 0, reserved: 0 }]));
const crossBump = (walletId, amount) => {
  const entry = crossScopeTotals.get(String(walletId || ''));
  if (entry) entry.physical += Number(amount || 0);
};
for (const row of crossScopeRows) {
  if (String(row.kind || '') === 'transfer') {
    crossBump(row.from_wallet_id, -(Number(row.transfer_from_minor || 0) + Number(row.fee_minor || 0)));
    crossBump(row.to_wallet_id, Number(row.transfer_to_minor || 0));
    continue;
  }
  crossBump(row.wallet_id, Number(row.wallet_minor || 0));
}
assert.equal(
  crossScopeTotals.get('w1').physical,
  totals.get('w1').physical - minor(40),
  'a business-scoped transfer out of a personal wallet must still debit that wallet',
);

// Remove it again so the rest of the file reasons about the original fixture.
db.prepare(`DELETE FROM ledger_transactions WHERE namespace='ns' AND id='t-cross-scope'`).run();

// --- the no-wallet fallback is real, not incidental --------------------------
// t-no-wallet has a NULL wallet_id. Dropping it would under-count w1 by 25.

const noWalletRow = db.prepare(
  `SELECT wallet_id FROM ledger_transactions WHERE namespace='ns' AND id='t-no-wallet'`,
).get();
assert.equal(noWalletRow.wallet_id, null, 'the fixture must actually contain a NULL wallet_id row');
assert.match(
  movementSql,
  /COALESCE\(wallet_id, \?\)/,
  'a NULL wallet_id must fall back to the default wallet, as applyWalletMovement does',
);

// --- deleted rows stay excluded ---------------------------------------------
assert.match(movementSql, /deleted_at IS NULL/, 'soft-deleted transactions must not count toward a balance');

db.close();
console.log('PASS p11c_v6_wallet_positions');
