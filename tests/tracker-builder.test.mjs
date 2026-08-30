import assert from 'node:assert/strict';
import {
  buildTrackerPaymentDraft,
  collectTrackerReferenceImpact,
  normalizeTrackerItem,
  normalizeTrackerTypeDefinition,
  validateTrackerDefinition,
} from '../src/lib/trackerBuilder.js';

const installment = normalizeTrackerTypeDefinition({
  id: 'home-installments', name: 'أقساط البيت', template: 'installment',
  source: { kind: 'wallets', walletIds: ['bank'] },
  paymentTemplate: { flow: 'expense', walletId: 'bank', categoryId: 'home', amountMode: 'entered' },
}, { walletIds: ['bank'], categoryIds: ['home'] });
const item = normalizeTrackerItem({ id: 'house-1', typeId: 'home-installments', name: 'قسط المطبخ', targetAmount: 1_200_000, currentAmount: 200_000 }, { typeIds: ['home-installments'] });

assert.equal(validateTrackerDefinition(installment).ok, true);
const draft = buildTrackerPaymentDraft({ definition: installment, item, amount: 100_000, dateISO: '2026-08-30' });
assert.equal(draft.ok, true);
assert.deepEqual(
  { trackerTypeId: draft.draft.trackerTypeId, trackerItemId: draft.draft.trackerItemId, flowType: draft.draft.flowType, amt: draft.draft.amt },
  { trackerTypeId: 'home-installments', trackerItemId: 'house-1', flowType: 'expense', amt: 100_000 },
  'a tracker payment is a draft with durable links, never a direct balance mutation',
);

const generatedType = normalizeTrackerTypeDefinition({ id: 'cap', name: 'Food cap', template: 'spending_cap', source: { kind: 'categories', categoryIds: ['food'] } }, { categoryIds: ['food'] });
assert.equal(buildTrackerPaymentDraft({ definition: generatedType, item: { ...item, typeId: 'cap' }, amount: 1 }).reason, 'tracker_payment_not_supported');

const impact = collectTrackerReferenceImpact({
  trackerTypes: [installment], trackerItems: [item], walletId: 'bank',
});
assert.deepEqual(impact, { types: [{ id: 'home-installments', name: 'أقساط البيت' }], items: [{ id: 'house-1', typeId: 'home-installments', name: 'قسط المطبخ' }] });

console.log('Tracker builder contract tests passed');
