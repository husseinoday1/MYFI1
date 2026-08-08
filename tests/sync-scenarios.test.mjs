import assert from 'node:assert/strict';
import { mergeWorkspaceStates, sameWorkspaceData } from '../src/store/multiDeviceSync.js';

const base = {
  trans: [{ id: 'base-tx', title: 'Original', amt: -100, cat: 'food' }],
  debts: [{ id: 'debt-1', name: 'Loan', total: 1000, payments: [] }],
  goals: [],
  wallets: [{ id: 'wallet-1', name: 'Cash', openingBalance: 500 }],
  commitments: [],
  cats: [{ id: 'food', label: 'Food' }],
  cfg: { currency: 'IQD', theme: 'dark' },
};

const merge = (local, remote, commonBase = base) => {
  const conflicts = [];
  const state = mergeWorkspaceStates({ base: commonBase, local, remote, conflicts });
  return { state, conflicts };
};

// Phone A online while phone B is offline: independent records must survive
// when B reconnects and merges against the last shared base.
const phoneA = { ...base, trans: [...base.trans, { id: 'phone-a', title: 'A', amt: -20 }] };
const phoneB = { ...base, trans: [...base.trans, { id: 'phone-b', title: 'B', amt: -30 }] };
const reconnect = merge(phoneB, phoneA);
assert.deepEqual(
  reconnect.state.trans.map(item => item.id).sort(),
  ['base-tx', 'phone-a', 'phone-b'],
  'offline phone changes must merge with online phone changes',
);
assert.equal(reconnect.conflicts.length, 0, 'independent offline changes are not conflicts');

// The same record edited in different fields: both edits must survive.
const fieldMerge = merge(
  { ...base, trans: [{ ...base.trans[0], title: 'Local title' }] },
  { ...base, trans: [{ ...base.trans[0], cat: 'transport' }] },
);
assert.equal(fieldMerge.state.trans[0].title, 'Local title');
assert.equal(fieldMerge.state.trans[0].cat, 'transport');
assert.equal(fieldMerge.conflicts.length, 0, 'different fields on the same record must merge cleanly');

// The same field edited on both phones: current-device value wins and the
// conflict is visible instead of being silently discarded.
const scalarMerge = merge(
  { ...base, trans: [{ ...base.trans[0], title: 'Phone B title' }] },
  { ...base, trans: [{ ...base.trans[0], title: 'Phone A title' }] },
);
assert.equal(scalarMerge.state.trans[0].title, 'Phone B title');
assert(scalarMerge.conflicts.some(item => item.path === 'trans[base-tx].title'));

// Delete versus edit follows the current safety policy: deletion wins and is
// recorded for later product-level review.
const deletionMerge = merge(
  { ...base, trans: [] },
  { ...base, trans: [{ ...base.trans[0], title: 'Edited remotely' }] },
);
assert.equal(deletionMerge.state.trans.some(item => item.id === 'base-tx'), false);
assert.equal(deletionMerge.conflicts[0]?.resolution, 'deletion');

// Nested debt payments from two phones are additive by payment ID.
const paymentMerge = merge(
  { ...base, debts: [{ ...base.debts[0], payments: [{ id: 'pay-b', amt: 100, date: '2026-08-02' }] }] },
  { ...base, debts: [{ ...base.debts[0], payments: [{ id: 'pay-a', amt: 150, date: '2026-08-01' }] }] },
);
assert.deepEqual(
  paymentMerge.state.debts[0].payments.map(item => item.id).sort(),
  ['pay-a', 'pay-b'],
  'payments created offline on two phones must not overwrite each other',
);

// A second sync after both phones accepted the merged state must be stable.
const converged = merge(reconnect.state, reconnect.state);
assert.equal(converged.conflicts.length, 0);
assert.equal(sameWorkspaceData(converged.state, reconnect.state), true, 'merged phones must converge to one stable state');

console.log('MYFI sync scenario tests passed: offline merge, field conflicts, deletion policy, nested payments, convergence.');
