import assert from 'node:assert/strict';
import { buildMyfiFlowPreview, buildMyfiFlowSavePlan, normalizeMyfiFlowPlan } from '../src/lib/myfiFlow.js';

const categories = [{ id: 'food' }, { id: 'rent' }, { id: 'fun' }];
const allocations = { needs: 60, wants: 20, savings: 20, debt: 0, investment: 0 };

const preview = buildMyfiFlowPreview({
  income: 1_000_000,
  allocations,
  categories,
  categoryBindings: {
    needs: [{ categoryId: 'rent', weight: 2 }, { categoryId: 'food', weight: 1 }],
    wants: [{ categoryId: 'fun', weight: 1 }],
  },
  commitments: [{ id: 'internet', name: 'Internet', amt: 650_000, firstDueISO: '2026-08-10', day: 10, active: true }],
  date: new Date('2026-08-15T12:00:00'),
});

assert.equal(preview.valid, true, 'a 100% allocation with income is a valid preview');
assert.deepEqual(preview.amounts, { needs: 600_000, wants: 200_000, savings: 200_000, debt: 0, investment: 0 });
assert.equal(preview.essentialsGap, 50_000, 'scheduled commitments above the essentials allocation must be visible before save');
assert.deepEqual(preview.budgetChanges, [
  { categoryId: 'food', bucket: 'needs', amount: 200_000 },
  { categoryId: 'fun', bucket: 'wants', amount: 200_000 },
  { categoryId: 'rent', bucket: 'needs', amount: 400_000 },
]);
assert.deepEqual(preview.unboundBuckets, ['savings'], 'unlinked funding must never silently create a budget');

const malformed = buildMyfiFlowPreview({ income: 100, allocations: { needs: 70, wants: 20 }, categories });
assert.equal(malformed.valid, false, 'an incomplete allocation cannot be applied');
assert.equal(malformed.budgetChanges.length, 0, 'an unbound plan must not invent category budgets');

const saved = buildMyfiFlowSavePlan({
  strategy: 'balanced', income: 1000, allocations: { needs: 50, wants: 30, savings: 20 },
  categoryBindings: { needs: [{ categoryId: 'food', weight: 1 }, { categoryId: 'missing', weight: 1 }] },
  categories, period: '2026-08',
});
assert.equal(saved.categoryBindings.needs.length, 1, 'unknown category references are removed at save time');
assert.equal(saved.categoryBindings.needs[0].weight, 1, 'remaining bindings are renormalized without changing the user plan');
assert.equal(normalizeMyfiFlowPlan(saved, { categoryIds: ['food'] }).period, '2026-08');

const duplicateBindingPlan = normalizeMyfiFlowPlan({
  allocations,
  categoryBindings: { needs: [{ categoryId: 'food', weight: 1 }], wants: [{ categoryId: 'food', weight: 1 }] },
}, { categoryIds: ['food'] });
assert.deepEqual(duplicateBindingPlan.categoryBindings.wants, [], 'one category cannot receive two Flow allocations silently');

console.log('MYFI Flow tests passed');
