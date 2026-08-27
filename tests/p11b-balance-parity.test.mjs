// P11-B step 1 — the parity harness that gates every later 11-B change.
//
// Phase 11-B moves the wallet balance off `openingBalance + hot-array movement`
// and onto the canonical posting sum. This test proves the two already agree
// before anything is switched, including for a ledger already carrying an
// archived year — and proves the harness actually reports a disagreement rather
// than smoothing it over.
import assert from 'node:assert/strict';
import { buildFinancialShadowProjectionV7 } from '../src/lib/financialLedgerV7Migration';
import {
  compareWalletBalanceParity,
  summarizeParityForDiagnostics,
} from '../src/lib/archiveBalanceParity';

const BASE = { currency: 'IQD', defaultWalletId: 'w1', categoryBudgets: {} };
const NOW = '2026-08-27T00:00:00.000Z';

const YEAR_2025 = { id: 'tx-2025-income', walletId: 'w1', amt: 1000, dateISO: '2025-05-01', cat: 'other' };
const YEAR_2026 = { id: 'tx-2026-expense', walletId: 'w1', amt: -300, dateISO: '2026-03-01', cat: 'other' };

const postingsOf = projection => projection.commands.flatMap(command => command.postings);

// --- 1. nothing archived: the two sources agree -----------------------------

const unarchivedWorkspace = {
  cfg: BASE,
  wallets: [{ id: 'w1', currency: 'IQD', openingBalance: 5000 }],
  trans: [YEAR_2025, YEAR_2026],
  debts: [], goals: [], commitments: [], cats: [], notif: {},
};
const unarchived = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7', workspace: unarchivedWorkspace, coldArchives: [], now: NOW,
});

const plainParity = compareWalletBalanceParity({
  wallets: unarchivedWorkspace.wallets,
  transactions: unarchivedWorkspace.trans,
  postings: postingsOf(unarchived),
  baseCurrency: 'IQD',
  defaultWalletId: 'w1',
});

assert.equal(plainParity.ok, true, `unarchived parity failed: ${JSON.stringify(plainParity.rows)}`);
assert.equal(plainParity.checked, 1);
assert.equal(plainParity.rows[0].legacyMinor, 5700000);
assert.equal(plainParity.rows[0].canonicalMinor, 5700000);
assert.equal(plainParity.rows[0].deltaMinor, 0);

// --- 2. a year archived: still agree, which is the whole point ---------------
// The hot array has lost the archived year and `openingBalance` carries it
// instead (what commitYearArchive does today). The canonical side keeps the true
// opening plus the archived postings. Both must land on the same number, or
// Phase 11-B cannot switch the source.

const archivedWorkspace = {
  cfg: BASE,
  wallets: [{ id: 'w1', currency: 'IQD', openingBalance: 6000 }],
  trans: [YEAR_2026],
  debts: [], goals: [], commitments: [], cats: [], notif: {},
};
const archived = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7',
  workspace: archivedWorkspace,
  coldArchives: [{
    year: 2025,
    summary: { year: 2025, archivedAt: '2026-01-01T00:00:00.000Z' },
    data: { wallets: [{ id: 'w1', currency: 'IQD' }], trans: [YEAR_2025] },
  }],
  now: NOW,
});

const archivedParity = compareWalletBalanceParity({
  wallets: archivedWorkspace.wallets,
  transactions: archivedWorkspace.trans,
  postings: postingsOf(archived),
  baseCurrency: 'IQD',
  defaultWalletId: 'w1',
});

assert.equal(archivedParity.ok, true, `archived parity failed: ${JSON.stringify(archivedParity.rows)}`);
assert.equal(archivedParity.rows[0].legacyMinor, 5700000, 'legacy balance after archiving');
assert.equal(archivedParity.rows[0].canonicalMinor, 5700000, 'canonical balance after archiving');
assert.equal(
  archivedParity.rows[0].canonicalMinor,
  plainParity.rows[0].canonicalMinor,
  '§73: the canonical balance must not move when a year is archived',
);

// --- 3. the harness must actually detect a disagreement ----------------------
// A parity check that cannot fail is worse than none.

const drifted = compareWalletBalanceParity({
  wallets: [{ id: 'w1', currency: 'IQD', openingBalance: 6001 }], // one minor unit off
  transactions: archivedWorkspace.trans,
  postings: postingsOf(archived),
  baseCurrency: 'IQD',
  defaultWalletId: 'w1',
});
assert.equal(drifted.ok, false, 'a drifted opening balance must be reported, not absorbed');
assert.deepEqual(drifted.mismatchedWalletIds, ['w1']);
assert.equal(drifted.rows[0].deltaMinor, -1000, 'the delta must point at the size of the drift');

// A wallet missing from one side is a mismatch, never a silent zero.
const missingSide = compareWalletBalanceParity({
  wallets: [
    { id: 'w1', currency: 'IQD', openingBalance: 6000 },
    { id: 'w2-never-in-ledger', currency: 'IQD', openingBalance: 0 },
  ],
  transactions: archivedWorkspace.trans,
  postings: postingsOf(archived),
  baseCurrency: 'IQD',
  defaultWalletId: 'w1',
});
assert.equal(missingSide.ok, false, 'a wallet absent from the canonical side must be reported');
const orphan = missingSide.rows.find(row => row.walletId === 'w2-never-in-ledger');
assert.equal(orphan.inLegacy, true);
assert.equal(orphan.inCanonical, false);
assert.equal(orphan.deltaMinor, null, 'an absent side has no meaningful delta');

// --- 4. the harness has no repair path ---------------------------------------
// D3: explicit evidenced migration, never a silent repair. Nothing here may
// mutate its inputs.

const guardedWallets = [{ id: 'w1', currency: 'IQD', openingBalance: 6000 }];
const beforeJson = JSON.stringify(guardedWallets);
compareWalletBalanceParity({
  wallets: guardedWallets,
  transactions: archivedWorkspace.trans,
  postings: postingsOf(archived),
  baseCurrency: 'IQD',
  defaultWalletId: 'w1',
});
assert.equal(JSON.stringify(guardedWallets), beforeJson, 'the parity check must not touch its inputs');

// --- 5. Standing Rule 6: the loggable summary carries no amounts -------------

const summary = summarizeParityForDiagnostics(drifted);
assert.deepEqual(Object.keys(summary).sort(), ['checked', 'matched', 'mismatched', 'mismatchedWalletIds', 'ok']);
assert.equal(summary.mismatched, 1);
assert.deepEqual(summary.mismatchedWalletIds, ['w1']);

const summaryJson = JSON.stringify(summary);
for (const amount of ['5700000', '6001', '6000', '1000', '-1000', 'legacyMinor', 'canonicalMinor', 'deltaMinor']) {
  assert.equal(
    summaryJson.includes(amount),
    false,
    `Standing Rule 6: the diagnostic summary must not carry ${amount}`,
  );
}

// --- 6. repeat-action: parity holds across a second archive ------------------
// Standing Rule 2. The opening balance is rewritten again on top of an already
// rewritten value, which is where a one-round-only reversal would show up.

const twiceArchivedWorkspace = {
  cfg: BASE,
  wallets: [{ id: 'w1', currency: 'IQD', openingBalance: 5700 }],
  trans: [],
  debts: [], goals: [], commitments: [], cats: [], notif: {},
};
const twiceArchived = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7',
  workspace: twiceArchivedWorkspace,
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

const twiceParity = compareWalletBalanceParity({
  wallets: twiceArchivedWorkspace.wallets,
  transactions: twiceArchivedWorkspace.trans,
  postings: postingsOf(twiceArchived),
  baseCurrency: 'IQD',
  defaultWalletId: 'w1',
});
assert.equal(twiceParity.ok, true, `parity broke after a second archive: ${JSON.stringify(twiceParity.rows)}`);
assert.equal(twiceParity.rows[0].canonicalMinor, 5700000, 'the canonical balance survives two archives');

console.log('PASS p11b_balance_parity');
