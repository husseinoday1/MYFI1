import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildTrackerPaymentDraft,
  collectTrackerReferenceImpact,
  normalizeTrackerItem,
  normalizeTrackerTypeDefinition,
  validateTrackerDefinition,
  validateTrackerItem,
} from '../src/lib/trackerBuilder.js';

const slicePath = path.resolve('src/store/slices/trackerBuilderSlice.js');
const sliceSource = fs.readFileSync(slicePath, 'utf8')
  .replace(/^import[\s\S]*?;\r?\n/gm, '')
  .replace('export const createTrackerBuilderSlice', 'const createTrackerBuilderSlice')
  + '\nmodule.exports = { createTrackerBuilderSlice };';

const committed = [];
let nextId = 0;
const moduleShim = { exports: {} };
new Function('deps', 'module', 'exports', `
  const { buildTrackerPaymentDraft, collectTrackerReferenceImpact, normalizeTrackerItem,
    normalizeTrackerTypeDefinition, validateTrackerDefinition, validateTrackerItem,
    getLedgerNamespace, commitEntityChangesV7, uid } = deps;
  ${sliceSource}
`)(
  {
    buildTrackerPaymentDraft,
    collectTrackerReferenceImpact,
    normalizeTrackerItem,
    normalizeTrackerTypeDefinition,
    validateTrackerDefinition,
    validateTrackerItem,
    getLedgerNamespace: () => 'tracker-test',
    commitEntityChangesV7: async payload => {
      committed.push(payload);
      return { ok: true, supported: true, changed: payload.changes.length };
    },
    uid: () => `generated-${++nextId}`,
  },
  moduleShim,
  moduleShim.exports,
);

const { createTrackerBuilderSlice } = moduleShim.exports;
let saves = 0;
const state = {
  financialLedgerV7Cutover: false,
  workspaceNamespace: 'guest',
  cfg: { currency: 'IQD' },
  wallets: [{ id: 'wallet-1', currency: 'IQD' }],
  cats: [{ id: 'other' }, { id: 'housing' }],
  trackerTypes: [],
  trackerItems: [],
  saveLocal: async () => { saves += 1; },
  scheduleCloudSync: () => {},
};
const set = update => Object.assign(state, typeof update === 'function' ? update(state) : update);
const actions = createTrackerBuilderSlice(set, () => state);
Object.assign(state, actions);

;(async () => {
const blocked = await actions.createCustomTrackerType({ id: 'installments', name: 'Installments' });
assert.deepEqual(blocked, { ok: false, reason: 'custom_tracker_storage_not_ready' }, 'legacy transport must not accept custom financial trackers');

state.financialLedgerV7Cutover = true;
const createdType = await actions.createCustomTrackerType({
  id: 'installments', name: 'Installments', template: 'installment',
  source: { kind: 'wallets', walletIds: ['wallet-1'] },
  paymentTemplate: { flow: 'expense', walletId: 'wallet-1', categoryId: 'housing', amountMode: 'entered' },
});
assert.equal(createdType.ok, true);
assert.equal(state.trackerTypes.length, 1);
assert.equal(committed[0].changes[0].entityType, 'tracker_type');

const createdItem = await actions.createCustomTrackerItem('installments', {
  id: 'phone', name: 'Phone', targetAmount: 1200, currentAmount: 0,
});
assert.equal(createdItem.ok, true);
assert.equal(state.trackerItems.length, 1);
assert.equal(committed[1].changes[0].entityType, 'tracker_item');

const draft = actions.buildCustomTrackerPaymentDraft({
  trackerTypeId: 'installments', trackerItemId: 'phone', amount: 100,
});
assert.equal(draft.ok, true);
assert.equal(draft.draft.trackerTypeId, 'installments');
assert.equal(draft.draft.trackerItemId, 'phone');

const impact = actions.getCustomTrackerReferenceImpact({ walletId: 'wallet-1' });
assert.deepEqual(impact.items.map(item => item.id), ['phone']);

const refusedDelete = await actions.deleteCustomTrackerType('installments');
assert.deepEqual(refusedDelete, { ok: false, reason: 'custom_tracker_type_has_items', itemCount: 1 });
const deleted = await actions.deleteCustomTrackerType('installments', { deleteItems: true });
assert.equal(deleted.ok, true);
assert.equal(deleted.deletedItems, 1);
assert.equal(state.trackerTypes.length, 0);
assert.equal(state.trackerItems.length, 0);
assert.equal(committed.at(-1).changes.length, 2, 'type and its item must be archived atomically');
assert.ok(saves >= 3, 'each completed entity action must persist locally after its V7 commit');

console.log('Tracker builder store tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
