const assert = require('node:assert/strict');

// Deterministic executable contract model. This does not substitute for the
// repository implementation test or real-device SQLite acceptance; it verifies
// the P19-013 command-level CAS/no-partial-write semantics independently.
const clone = value => JSON.parse(JSON.stringify(value));

const applyCommandModel = ({ state, command, exactLocalMutationIds = new Set() }) => {
  const before = clone(state);
  const conflicts = [];
  const plans = [];

  for (const m of command.mutations) {
    if (exactLocalMutationIds.has(m.mutationId)) {
      plans.push({ m, echo: true });
      continue;
    }
    const current = Number(state.revisions[`${m.entityType}:${m.entityId}`] || 0);
    if (current !== m.baseRevision) {
      conflicts.push({ mutationId: m.mutationId, current, baseRevision: m.baseRevision });
      continue;
    }
    if (m.accountIdentity && state.accounts[m.entityId]) {
      const a = state.accounts[m.entityId];
      if (a.currency !== m.accountIdentity.currency
          || a.type !== m.accountIdentity.type
          || a.scope !== m.accountIdentity.scope) {
        conflicts.push({ mutationId: m.mutationId, code: 'account_identity' });
        continue;
      }
    }
    plans.push({ m, echo: false });
  }

  if (conflicts.length) {
    return { ok: false, state: before, conflicts, cursor: before.cursor };
  }

  const next = clone(state);
  for (const { m, echo } of plans) {
    if (!echo) next.revisions[`${m.entityType}:${m.entityId}`] = m.revision;
  }
  next.cursor = command.commandSequence;
  return { ok: true, state: next, cursor: next.cursor };
};

const base = {
  revisions: { 'financial_transaction:t1': 2, 'wallet:w1': 4 },
  accounts: { w1: { currency: 'IQD', type: 'wallet', scope: 'personal' } },
  cursor: 10,
};

// Whole command CAS succeeds atomically.
{
  const result = applyCommandModel({
    state: base,
    command: { commandSequence: 11, mutations: [
      { mutationId: 'm1', entityType: 'financial_transaction', entityId: 't1', baseRevision: 2, revision: 3 },
      { mutationId: 'm2', entityType: 'wallet', entityId: 'w1', baseRevision: 4, revision: 5 },
    ] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.revisions['financial_transaction:t1'], 3);
  assert.equal(result.state.revisions['wallet:w1'], 5);
  assert.equal(result.cursor, 11);
}

// One CAS failure means no partial command writes and no cursor advance.
{
  const result = applyCommandModel({
    state: base,
    command: { commandSequence: 11, mutations: [
      { mutationId: 'm1', entityType: 'financial_transaction', entityId: 't1', baseRevision: 2, revision: 3 },
      { mutationId: 'm2', entityType: 'wallet', entityId: 'w1', baseRevision: 3, revision: 4 },
    ] },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.state, base);
  assert.equal(result.cursor, 10);
}

// Exact local cloud echo is a no-op but the command cursor may advance.
{
  const result = applyCommandModel({
    state: base,
    exactLocalMutationIds: new Set(['echo-1']),
    command: { commandSequence: 11, mutations: [
      { mutationId: 'echo-1', entityType: 'financial_transaction', entityId: 't1', baseRevision: 1, revision: 2 },
    ] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.revisions['financial_transaction:t1'], 2);
  assert.equal(result.cursor, 11);
}

// Immutable account identity mismatch fails the entire command.
{
  const result = applyCommandModel({
    state: base,
    command: { commandSequence: 11, mutations: [
      {
        mutationId: 'm-account', entityType: 'wallet', entityId: 'w1', baseRevision: 4, revision: 5,
        accountIdentity: { currency: 'USD', type: 'wallet', scope: 'personal' },
      },
    ] },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.state, base);
  assert.equal(result.cursor, 10);
}

console.log('MYFI P19-013 ATOMIC V2 COMMAND MODEL: PASSED');
