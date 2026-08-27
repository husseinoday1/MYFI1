// P11-A — Frozen Master Plan §73 + §76.
//
// §73: archiving must not change the wallet balance or the opening balance.
// §76: the Cold Archive migrates into the canonical V7 representation with the
//      money, the FX and the immutable IDs verified.
//
// Today's commitYearArchive folds the archived year's movement into
// wallet.openingBalance, and the V7 migration undoes exactly that
// (`residual = openingBalance − coldMovement`) before emitting the true opening
// as a synthetic opening_balance transaction. That reversal is the load-bearing
// part of §76, and nothing pinned it.
//
// The test runs the same ledger through the projection twice — once with a year
// still active, once with that year archived the way the app archives it today —
// and requires the canonical posting sum to come out identical.
import assert from 'node:assert/strict';
import { buildFinancialShadowProjectionV7 } from '../src/lib/financialLedgerV7Migration';

const BASE = { currency: 'IQD', defaultWalletId: 'w1', categoryBudgets: {} };
const NOW = '2026-08-27T00:00:00.000Z';

// Two years of history: 2025 income, 2026 expense, against a 5000 opening.
const YEAR_2025 = { id: 'tx-2025-income', walletId: 'w1', amt: 1000, dateISO: '2025-05-01', cat: 'other' };
const YEAR_2026 = { id: 'tx-2026-expense', walletId: 'w1', amt: -300, dateISO: '2026-03-01', cat: 'other' };
const TRUE_OPENING = 5000;
const ARCHIVED_MOVEMENT = 1000; // what commitYearArchive folds into openingBalance

// (a) nothing archived
const beforeArchive = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7',
  workspace: {
    cfg: BASE,
    wallets: [{ id: 'w1', currency: 'IQD', openingBalance: TRUE_OPENING }],
    trans: [YEAR_2025, YEAR_2026],
    debts: [], goals: [], commitments: [], cats: [], notif: {},
  },
  coldArchives: [],
  now: NOW,
});

// (b) 2025 archived exactly as the app leaves it: the year is out of the hot
// array, into the cold archive, and its movement has been added to openingBalance.
const afterArchive = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7',
  workspace: {
    cfg: BASE,
    wallets: [{ id: 'w1', currency: 'IQD', openingBalance: TRUE_OPENING + ARCHIVED_MOVEMENT }],
    trans: [YEAR_2026],
    debts: [], goals: [], commitments: [], cats: [], notif: {},
  },
  coldArchives: [{
    year: 2025,
    summary: { year: 2025, archivedAt: '2026-01-01T00:00:00.000Z' },
    data: {
      wallets: [{ id: 'w1', currency: 'IQD' }],
      trans: [YEAR_2025],
    },
  }],
  now: NOW,
});

// The canonical balance: every physical posting for the account, no archive
// predicate — §74's ALL scope, expressed against the postings themselves.
const canonicalBalanceMinor = (projection, accountId) => projection.commands
  .flatMap(command => command.postings)
  .filter(posting => posting.accountId === accountId && posting.bucket === 'physical')
  .reduce((sum, posting) => sum + posting.amountMinor, 0);

const before = canonicalBalanceMinor(beforeArchive, 'w1');
const after = canonicalBalanceMinor(afterArchive, 'w1');

// 5000 opening + 1000 income - 300 expense = 5700, in IQD minor units (3 dp).
assert.equal(before, 5700000, `unarchived canonical balance was ${before}`);
assert.equal(
  after,
  before,
  `§73: archiving changed the canonical wallet balance (${before} -> ${after})`,
);

// §76: the opening balance itself must survive, not just the total. The migration
// recovers it by subtracting the archived movement back out of the rewritten value.
const openingPostingMinor = projection => projection.commands
  .filter(command => command.header.kind === 'opening_balance')
  .flatMap(command => command.postings)
  .reduce((sum, posting) => sum + posting.amountMinor, 0);

assert.equal(openingPostingMinor(beforeArchive), 5000000, 'unarchived opening balance');
assert.equal(
  openingPostingMinor(afterArchive),
  5000000,
  '§73: the opening balance must be the true opening, not the archive-inflated one',
);

// §76 "verify immutable IDs": archiving relocates a transaction, it does not
// re-identify it. Both projections must carry the same real transaction IDs.
const realIds = projection => projection.commands
  .filter(command => !command.originalTransaction?.syntheticMigrationOpening)
  .map(command => command.header.id)
  .filter(id => !id.startsWith('v7-migration-'))
  .sort();

assert.deepEqual(
  realIds(afterArchive),
  realIds(beforeArchive),
  '§76: transaction IDs must be immutable across archiving',
);

// The archived row is marked as archived, and only that row.
const archivedIds = projection => projection.commands
  .filter(command => command.header.archivedAt)
  .map(command => command.header.id)
  .sort();

assert.deepEqual(archivedIds(beforeArchive), [], 'nothing is archived before archiving');
assert.deepEqual(archivedIds(afterArchive), ['tx-2025-income'], 'exactly the archived year is marked');

const archivedCommand = afterArchive.commands.find(command => command.header.id === 'tx-2025-income');
assert.equal(archivedCommand.header.archiveYear, 2025, '§72: the archive year is recorded on the canonical row');

// §73 "transaction amount" and "FX": the archived row's own money must be
// untouched by the move into the archive.
const beforeCommand = beforeArchive.commands.find(command => command.header.id === 'tx-2025-income');
assert.deepEqual(
  archivedCommand.postings.map(posting => [posting.accountId, posting.bucket, posting.amountMinor, posting.currencyCode]),
  beforeCommand.postings.map(posting => [posting.accountId, posting.bucket, posting.amountMinor, posting.currencyCode]),
  '§73: archiving must not change the transaction amount or its currency',
);
assert.deepEqual(
  archivedCommand.exchangeRates.map(rate => [rate.baseCurrencyCode, rate.quoteCurrencyCode, rate.numerator, rate.denominator]),
  beforeCommand.exchangeRates.map(rate => [rate.baseCurrencyCode, rate.quoteCurrencyCode, rate.numerator, rate.denominator]),
  '§73: archiving must not change historical FX',
);

// The counts line up: the same ledger, split differently between active and archived.
assert.equal(beforeArchive.metrics.activeTransactions, 2);
assert.equal(beforeArchive.metrics.archivedTransactions, 0);
assert.equal(afterArchive.metrics.activeTransactions, 1);
assert.equal(afterArchive.metrics.archivedTransactions, 1);
assert.equal(
  afterArchive.metrics.activeTransactions + afterArchive.metrics.archivedTransactions,
  beforeArchive.metrics.activeTransactions + beforeArchive.metrics.archivedTransactions,
  '§74: ALL must span the same ledger before and after archiving',
);

// --- repeat-action: archiving a second year keeps the balance still ----------
// Standing Engineering Rule 2 — the first archive is the easy case. The opening
// balance is rewritten again on top of an already-rewritten value, so a reversal
// that only handles one round would show up here and nowhere else.

const afterSecondArchive = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7',
  workspace: {
    cfg: BASE,
    wallets: [{ id: 'w1', currency: 'IQD', openingBalance: TRUE_OPENING + ARCHIVED_MOVEMENT - 300 }],
    trans: [],
    debts: [], goals: [], commitments: [], cats: [], notif: {},
  },
  coldArchives: [
    {
      year: 2025,
      summary: { year: 2025, archivedAt: '2026-01-01T00:00:00.000Z' },
      data: { wallets: [{ id: 'w1', currency: 'IQD' }], trans: [YEAR_2025] },
    },
    {
      year: 2026,
      summary: { year: 2026, archivedAt: '2027-01-01T00:00:00.000Z' },
      data: { wallets: [{ id: 'w1', currency: 'IQD' }], trans: [YEAR_2026] },
    },
  ],
  now: NOW,
});

assert.equal(
  canonicalBalanceMinor(afterSecondArchive, 'w1'),
  before,
  '§73: a second archive must leave the canonical balance where it was',
);
assert.equal(
  openingPostingMinor(afterSecondArchive),
  5000000,
  '§73: the true opening balance must survive two rounds of archiving',
);
assert.deepEqual(
  realIds(afterSecondArchive),
  realIds(beforeArchive),
  '§76: IDs stay immutable across repeated archiving',
);
assert.equal(afterSecondArchive.metrics.activeTransactions, 0);
assert.equal(afterSecondArchive.metrics.archivedTransactions, 2);

console.log('PASS p11a_archive_balance_invariance');
