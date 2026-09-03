// Phase 12 — the rules that decide what the diagnostics screen offers, and
// whether it tells someone their entries are gone. Both got this wrong twice in
// one day and only human review caught it, so each case is pinned here.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/dev/p12ConflictRecoveryGates.js');
const compiled = new Module(target, module);
compiled.filename = target;
compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, target);
const { conflictRecoveryGatesV1, setupOnlyLegacyRowV1 } = compiled.exports;

const NS = 'user:gates';
const settingsRow = (sequenceId, entityType = 'wallet') => ({
  sequence_id: sequenceId, entity_type: entityType,
  entity_id: entityType === 'workspace' ? 'workspace' : `${entityType}-1`,
  operation: 'upsert', created_at: '2026-09-02T17:00:00.000Z',
});
const financialRow = (sequenceId, operation = 'upsert') => ({
  sequence_id: sequenceId, entity_type: 'financial_transaction', entity_id: `tx-${sequenceId}`,
  operation, created_at: '2026-09-02T17:03:00.000Z',
});

const ledger = ({
  status = 'rolled_back_after_activation_failure', rows = [], pendingCount = null,
  outboxV3 = 0, ok = true, namespace = NS, checkpoint = true,
} = {}) => ({
  ok,
  activeNamespace: namespace,
  intent: status ? { status, checkpointId: 'checkpoint-1' } : null,
  checkpointPresent: checkpoint,
  outboxV2PendingRows: rows,
  outboxV2PendingCount: pendingCount === null ? rows.length : pendingCount,
  outboxV3PendingCount: outboxV3,
});

// 1) Settings-only rows, a complete list: the discard is the right offer.
{
  const gates = conflictRecoveryGatesV1(ledger({ rows: [settingsRow(74), settingsRow(75, 'workspace')] }));
  assert.equal(gates.canDiscard, true, 'settings-only rows must be discardable');
  assert.equal(gates.showUnsyncedFinancialWarning, false, 'settings rows are not lost entries');
  assert.equal(gates.unsyncedFinancialRows.length, 0);
  assert.equal(gates.canActivate, true, 'legacy rows must never gate activation');
}

// 2) Financial rows after a rollback: never offer to delete them, and say so.
//    This is the real device: an opening balance, an expense and its void.
{
  const gates = conflictRecoveryGatesV1(ledger({
    rows: [financialRow(74), financialRow(75), financialRow(76, 'void')],
  }));
  assert.equal(gates.canDiscard, false, 'financial rows must never be offered for deletion');
  assert.equal(gates.showUnsyncedFinancialWarning, true, 'their owner must be told they are kept');
  assert.equal(gates.unsyncedFinancialRows.length, 3);
  assert.equal(gates.canActivate, true, 'the repair must still be able to finish');
}

// 3) The same rows before any rollback — the ordinary state of a device that
//    has not activated V2. The entries are queued uploads, still present.
//    Claiming they are gone would have the owner enter them a second time.
for (const status of ['local_promoted_pending_activation', 'ready_for_explicit_cloud_replacement', '']) {
  const gates = conflictRecoveryGatesV1(ledger({ status, rows: [financialRow(74)] }));
  assert.equal(gates.showUnsyncedFinancialWarning, false,
    `status ${status || '(none)'} must not claim the entries are lost`);
  assert.equal(gates.canDiscard, false);
}

// 4) A truncated list proves nothing about the rows it did not read.
{
  const gates = conflictRecoveryGatesV1(ledger({ rows: [settingsRow(74)], pendingCount: 60 }));
  assert.equal(gates.legacyRowsComplete, false);
  assert.equal(gates.canDiscard, false, 'a truncated list must not authorise a discard');
  assert.equal(gates.showUnsyncedFinancialWarning, false, 'nor a claim about what is missing');
}
{
  // Truncated *and* holding financial rows: still no discard, and still no
  // claim, because the count of lost entries would be wrong.
  const gates = conflictRecoveryGatesV1(ledger({ rows: [financialRow(74)], pendingCount: 60 }));
  assert.equal(gates.canDiscard, false);
  assert.equal(gates.showUnsyncedFinancialWarning, false);
}

// 5) The restore gate needs its whole state, not part of it.
{
  assert.equal(conflictRecoveryGatesV1(ledger({ status: 'local_promoted_pending_activation' })).canRestore, true);
  assert.equal(conflictRecoveryGatesV1(ledger({ status: 'local_promoted_pending_activation', checkpoint: false })).canRestore,
    false, 'no checkpoint means nothing to restore from');
  assert.equal(conflictRecoveryGatesV1(ledger({ status: 'rolled_back_after_activation_failure' })).canRestore,
    false, 'a completed rollback is not restorable again');
}

// 6) Nothing is offered on a namespace-less or failed read: a write helper
//    defaulting to 'guest' would touch the wrong ledger entirely.
for (const broken of [ledger({ namespace: '' }), ledger({ ok: false }), null, undefined]) {
  const gates = conflictRecoveryGatesV1(broken);
  assert.equal(gates.canRestore, false);
  assert.equal(gates.canDiscard, false);
  assert.equal(gates.canActivate, false);
  assert.equal(gates.showUnsyncedFinancialWarning, false);
}

// 7) A pending V2 command means the device is not quiet yet.
{
  assert.equal(conflictRecoveryGatesV1(ledger({ outboxV3: 1 })).canActivate, false,
    'activation must wait for the active queue to drain');
}

// 9) Reviewing legacy rows for removal is only offered once V2 is live, because
//    only then can none of them still reach the cloud.
{
  const rows = [financialRow(74), financialRow(75)];
  const live = conflictRecoveryGatesV1({ ...ledger({ rows }), activatedAt: '2026-09-03T07:11:08.380Z' });
  assert.equal(live.reviewableLegacyRows.length, 2, 'an activated ledger may review its dead legacy rows');
  assert.equal(live.canDiscardAcknowledgedLegacy, false, 'but nothing is removable before it is acknowledged');

  const notLive = conflictRecoveryGatesV1(ledger({ rows }));
  assert.equal(notLive.reviewableLegacyRows.length, 0,
    'before activation those rows may still be queued work, so they are not offered');
  assert.equal(notLive.canDiscardAcknowledgedLegacy, false);
}

// 10) Only the rows actually acknowledged become removable, one at a time.
{
  const gates = conflictRecoveryGatesV1({
    ...ledger({ rows: [financialRow(74), financialRow(75), financialRow(76)] }),
    activatedAt: '2026-09-03T07:11:08.380Z',
    legacyOutboxAcknowledged: [75],
  });
  assert.equal(gates.canDiscardAcknowledgedLegacy, true);
  assert.deepEqual(gates.acknowledgedLegacyRows.map(row => row.sequence_id), [75],
    'an acknowledgement covers the row it was given, and no other');
}

// 11) A truncated list cannot be reviewed either: rows it never read would be
//     invisible to the owner while the ones shown looked like the whole set.
{
  const gates = conflictRecoveryGatesV1({
    ...ledger({ rows: [financialRow(74)], pendingCount: 9 }),
    activatedAt: '2026-09-03T07:11:08.380Z',
    legacyOutboxAcknowledged: [74],
  });
  assert.equal(gates.reviewableLegacyRows.length, 0);
  assert.equal(gates.canDiscardAcknowledgedLegacy, false);
}

// 8) The allow-list itself: a delete or a void is not setup metadata, whatever
//    entity it names.
assert.equal(setupOnlyLegacyRowV1(settingsRow(1)), true);
assert.equal(setupOnlyLegacyRowV1({ ...settingsRow(1), operation: 'delete' }), false);
assert.equal(setupOnlyLegacyRowV1(financialRow(1)), false);
assert.equal(setupOnlyLegacyRowV1({ sequence_id: 1, entity_type: 'workspace', entity_id: 'other', operation: 'upsert' }), false);
assert.equal(setupOnlyLegacyRowV1(null), false);

console.log('MYFI P20 V2 RECOVERY GATES RUNTIME: PASSED');
