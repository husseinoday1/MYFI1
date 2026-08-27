// P11-B / D2 — the migration side of the same violation removed from
// archiveFinancialTransactionsV7.
//
// buildFinancialShadowProjectionV7 (the Cold Archive -> V7 migration) used to
// synthesize a `v7-migration-release` for every archived goal-allocation
// transaction, regardless of whether the user had ever actually released it —
// releasing a reserved posting purely because the year was archived. That is
// the same §73 violation D2 ordered removed, on a different code path. A real,
// user-driven release (`allocationReleased: true`) must still carry through
// migration; only the "archived implies released" shortcut is gone.
import assert from 'node:assert/strict';
import { buildFinancialShadowProjectionV7 } from '../src/lib/financialLedgerV7Migration';

const BASE = { currency: 'IQD', defaultWalletId: 'w1', categoryBudgets: {} };
const NOW = '2026-08-27T00:00:00.000Z';

const goalAllocation = (overrides = {}) => ({
  id: 'goal-save-2025',
  walletId: 'w1',
  amt: 0,
  walletAmount: 0,
  allocationWalletAmount: 500,
  allocationAmount: 500,
  isGoalSaving: true,
  goalId: 'goal-1',
  dateISO: '2025-05-01',
  cat: 'other',
  ...overrides,
});

const reservedTotalMinor = projection => projection.commands
  .flatMap(command => command.postings)
  .filter(posting => posting.bucket === 'reserved')
  .reduce((sum, posting) => sum + posting.amountMinor, 0);

const releaseCommandIds = projection => projection.commands
  .filter(command => command.header.id.startsWith('v7-migration-release:'))
  .map(command => command.header.id);

// --- 1. archived, never released: must stay reserved, no synthetic release ---

const archivedUnreleased = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7',
  workspace: {
    cfg: BASE,
    wallets: [{ id: 'w1', currency: 'IQD', openingBalance: 5000 }],
    trans: [],
    debts: [], goals: [], commitments: [], cats: [], notif: {},
  },
  coldArchives: [{
    year: 2025,
    summary: { year: 2025, archivedAt: '2026-01-01T00:00:00.000Z' },
    data: { wallets: [{ id: 'w1', currency: 'IQD' }], trans: [goalAllocation()] },
  }],
  now: NOW,
});

assert.deepEqual(
  releaseCommandIds(archivedUnreleased),
  [],
  '§73/D2: archiving must not by itself synthesize a release',
);
assert.equal(
  reservedTotalMinor(archivedUnreleased),
  500000,
  'the reserved allocation must survive migration untouched when never released',
);

// --- 2. never archived, never released: same reserved total, for comparison -

const activeUnreleased = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7',
  workspace: {
    cfg: BASE,
    wallets: [{ id: 'w1', currency: 'IQD', openingBalance: 5000 }],
    trans: [goalAllocation()],
    debts: [], goals: [], commitments: [], cats: [], notif: {},
  },
  coldArchives: [],
  now: NOW,
});

assert.equal(
  reservedTotalMinor(activeUnreleased),
  reservedTotalMinor(archivedUnreleased),
  '§73: archiving an unreleased allocation must not change the reserved total',
);

// --- 3. a real, user-driven release must still carry through, archived or not

const archivedReleased = buildFinancialShadowProjectionV7({
  namespace: 'test::shadow-stage::v7',
  workspace: {
    cfg: BASE,
    wallets: [{ id: 'w1', currency: 'IQD', openingBalance: 5000 }],
    trans: [],
    debts: [], goals: [], commitments: [], cats: [], notif: {},
  },
  coldArchives: [{
    year: 2025,
    summary: { year: 2025, archivedAt: '2026-01-01T00:00:00.000Z' },
    data: { wallets: [{ id: 'w1', currency: 'IQD' }], trans: [goalAllocation({ allocationReleased: true })] },
  }],
  now: NOW,
});

assert.deepEqual(
  releaseCommandIds(archivedReleased),
  ['v7-migration-release:goal-save-2025'],
  'a genuinely user-released allocation must still carry its release through migration',
);
assert.equal(
  reservedTotalMinor(archivedReleased),
  0,
  'a real release must actually free the reserved posting',
);

console.log('PASS p11b_migration_goal_release');
