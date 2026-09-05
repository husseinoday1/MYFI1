// MYFI — adopting a different cloud ledger identity: the decision layer.
//
// Three real accounts sat permanently blocked on 2026-09-05 behind
// financial_v2_ledger_id_conflict, with the owner's real mutations stuck in
// ledger_outbox_v3 and no path forward. The existing recovery path cannot serve
// them: it requires the local identity to EQUAL the cloud one, and every
// pending row to be a stale workspace command. Both refusals are correct for
// its own case, so this is a separate path rather than a loosened condition.
//
// What this asserts is the part that decides the fate of real financial rows:
// this path only applies to a genuine identity difference, every pending
// mutation is described accurately enough to be recognised, and confirmation is
// impossible while any single row is still undecided.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

let source = read('src/lib/financialV2IdentityAdoptionV1.js');
source = source.replace(/^export const /gm, 'const ');
source += '\nmodule.exports = { adoptionAppliesV1, describePendingMutationV1, describePendingMutationsV1, adoptionReadinessV1, ADOPTION_INTENT_STATUS };\n';
const sandbox = { module: { exports: {} }, exports: {}, Number, String, Boolean, Math, Array, Object, Map, JSON, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'financialV2IdentityAdoptionV1.js' });
const {
  adoptionAppliesV1: applies,
  describePendingMutationV1: describe,
  describePendingMutationsV1: describeAll,
  adoptionReadinessV1: readiness,
} = sandbox.module.exports;

// --- when this path applies --------------------------------------------------

assert.equal(
  applies({ localIdentity: { ledgerId: 'ledger-local' }, cloudSource: { ledgerId: 'ledger-cloud' } }).applies,
  true,
  'a genuine identity difference is exactly what this path is for',
);

// The load-bearing refusal: a matching identity is NOT an adoption. If this
// ever returned true, this path would start competing with the existing
// recovery flow over cases that flow already handles correctly.
assert.equal(
  applies({ localIdentity: { ledgerId: 'same' }, cloudSource: { ledgerId: 'same' } }).reason,
  'adoption_not_applicable_same_ledger',
);
assert.equal(applies({ localIdentity: null, cloudSource: { ledgerId: 'c' } }).reason, 'adoption_local_identity_missing');
assert.equal(applies({ localIdentity: { ledgerId: 'l' }, cloudSource: null }).reason, 'adoption_cloud_identity_missing');
// Snake_case rows come straight from SQLite; both spellings must resolve.
assert.equal(
  applies({ localIdentity: { ledger_id: 'ledger-local' }, cloudSource: { ledgerId: 'ledger-cloud' } }).applies,
  true,
);

// --- describing a pending mutation the owner has to recognise ----------------

// A transaction: the owner decides by title, amount and date. Getting the
// amount field wrong per entity type would show them the wrong number while
// they choose, which is worse than showing none.
{
  const row = describe({
    sequence_id: 111, mutation_id: 'mut2-a', entity_type: 'financial_transaction',
    entity_id: 'tx-1', operation: 'upsert', created_at: '2026-09-04T08:20:24.503Z',
    payload_json: JSON.stringify({
      originalTransaction: { title: 'دخل - أخرى', baseAmount: 2250000, dateISO: '2026-09-01' },
    }),
  });
  assert.equal(row.entityType, 'financial_transaction');
  assert.equal(row.title, 'دخل - أخرى');
  assert.equal(row.amount, 2250000);
  assert.equal(row.dateISO, '2026-09-01');
  assert.equal(row.sequenceId, 111);
}

// Each entity type keeps its amount in a different field.
{
  const debt = describe({
    entity_type: 'debt', entity_id: 'd1',
    payload_json: JSON.stringify({ payload: { name: 'علوكي', total: 2650000 } }),
  });
  assert.equal(debt.amount, 2650000, 'a debt is described by its total');
  assert.equal(debt.title, 'علوكي');

  const commitment = describe({
    entity_type: 'commitment', entity_id: 'c1',
    payload_json: JSON.stringify({ payload: { name: 'انترنت', amt: 40000 } }),
  });
  assert.equal(commitment.amount, 40000, 'a commitment is described by its amount');

  const goal = describe({
    entity_type: 'goal', entity_id: 'g1',
    payload_json: JSON.stringify({ payload: { name: 'Laptop', target: 1000 } }),
  });
  assert.equal(goal.amount, 1000, 'a goal is described by its target');

  const workspace = describe({ entity_type: 'workspace', entity_id: 'workspace', payload_json: '{}' });
  assert.equal(workspace.amount, null, 'workspace metadata has no amount to show');
}

// Unparseable payloads must degrade, never throw -- a single corrupt row must
// not make the whole review screen unopenable.
{
  const row = describe({ entity_type: 'financial_transaction', entity_id: 'x', payload_json: '{broken' });
  assert.equal(row.entityId, 'x');
  assert.equal(row.title, null);
}
assert.equal(describeAll(null).length, 0);

// Review order must follow the ledger's own sequence, not input order.
{
  const rows = describeAll([
    { sequence_id: 3, mutation_id: 'c', entity_type: 'debt', payload_json: '{}' },
    { sequence_id: 1, mutation_id: 'a', entity_type: 'debt', payload_json: '{}' },
    { sequence_id: 2, mutation_id: 'b', entity_type: 'debt', payload_json: '{}' },
  ]);
  assert.equal(rows.map(r => r.mutationId).join(','), 'a,b,c');
}

// --- the gate that protects real financial rows ------------------------------

const pending = [
  { sequence_id: 1, mutation_id: 'm1', entity_type: 'financial_transaction', payload_json: '{}' },
  { sequence_id: 2, mutation_id: 'm2', entity_type: 'debt', payload_json: '{}' },
  { sequence_id: 3, mutation_id: 'm3', entity_type: 'commitment', payload_json: '{}' },
];

// Nothing decided yet: confirmation must be impossible.
{
  const result = readiness({ pending, decisions: new Map() });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'adoption_pending_mutations_undecided');
  assert.equal(result.undecided.length, 3);
  assert.equal(result.decidedCount, 0);
}

// Partially decided is still blocked, and names exactly what is left.
{
  const result = readiness({
    pending, decisions: new Map([['m1', 'keep'], ['m2', 'discard']]),
  });
  assert.equal(result.ok, false, 'one undecided row must block the whole adoption');
  assert.equal(result.undecided.length, 1);
  assert.equal(result.undecided[0].mutationId, 'm3');
  assert.equal(result.decidedCount, 2);
  assert.equal(result.totalCount, 3);
}

// Fully decided: allowed, and each row lands in the bucket its owner chose.
{
  const result = readiness({
    pending, decisions: new Map([['m1', 'keep'], ['m2', 'discard'], ['m3', 'keep']]),
  });
  assert.equal(result.ok, true);
  assert.equal(result.keep.map(r => r.mutationId).join(','), 'm1,m3');
  assert.equal(result.discard.map(r => r.mutationId).join(','), 'm2');
}

// An unrecognised decision is undecided, never a silent default in either
// direction -- a typo must not become "discard this person's transaction".
for (const bogus of ['KEEP', 'yes', '', 'true', 'delete']) {
  const result = readiness({
    pending, decisions: new Map([['m1', bogus], ['m2', 'keep'], ['m3', 'keep']]),
  });
  assert.equal(result.ok, false, `decision ${JSON.stringify(bogus)} must not be honoured`);
  assert.equal(result.undecided[0].mutationId, 'm1');
}

// A plain object works as well as a Map, since callers differ.
{
  const result = readiness({ pending, decisions: { m1: 'keep', m2: 'keep', m3: 'keep' } });
  assert.equal(result.ok, true);
}

// No pending rows at all is ready by definition -- there is nothing to rule on.
assert.equal(readiness({ pending: [], decisions: new Map() }).ok, true);

// --- the boundary with the existing path -------------------------------------

// The existing recovery path must keep both of its refusals. Loosening either
// would let a mismatched identity or an unreviewed financial row through the
// flow that was never designed to carry them.
const existing = read('src/lib/financialV2ConflictRecoveryV1.js');
assert(
  existing.includes('financial_v2_conflict_recovery_cloud_identity_mismatch'),
  'the existing path must still refuse a mismatched identity',
);
assert(
  existing.includes('financial_v2_conflict_recovery_pending_mutations_not_safe'),
  'the existing path must still refuse unsafe pending mutations',
);

console.log('PASS: financial-v2-identity-adoption');
