// Phase 14 §91 — app killed with a pending outbox, then reopened.
//
// The audit found nothing simulating this: the closest harness kills a real
// process, but for the restore state machine, not the mutation outbox. So this
// spawns the real repository against a real on-disk database, kills the process
// with a literal exit at three boundaries, and reopens the same file to see
// what actually survived. Nothing is mocked away -- if a queued mutation were
// only ever in memory, or a commit were not durable, these cases would fail.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const worker = path.join(root, 'tests/run-p14-outbox-restart-worker.cjs');

const runWorker = (file, env) => spawnSync(process.execPath, [worker, root], {
  cwd: root, encoding: 'utf8',
  env: { ...process.env, MYFI_P14_OUTBOX_DB_FILE: file, ...env },
});

// Read the file directly, without going through the repository, so the
// assertion is about what is on disk rather than what the code reports.
const inspect = (file) => {
  const db = new DatabaseSync(file);
  try {
    return db.prepare(
      `SELECT mutation_id,entity_type,entity_id,operation,attempts,acknowledged_at,next_attempt_at
         FROM ledger_outbox_v3 ORDER BY sequence_id`,
    ).all();
  } finally { db.close(); }
};

const resumeReport = (file) => {
  const resumed = runWorker(file, { MYFI_P14_OUTBOX_RESUME: '1' });
  assert.equal(resumed.status, 0, `resume must succeed: ${resumed.stderr}`);
  const line = resumed.stdout.split(/\r?\n/).find(item => item.includes('P14_OUTBOX_RESUME'));
  assert.ok(line, `resume must report its state: ${resumed.stdout}`);
  return JSON.parse(line);
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'myfi-p14-outbox-restart-'));
try {
  // 1) The scenario itself: the app is killed the instant a mutation is queued,
  //    before anything syncs. On reopen the mutation must still be there and
  //    still drainable -- otherwise the user's edit was silently dropped by a
  //    force-close.
  {
    const file = path.join(temp, 'after_commit.sqlite');
    const killed = runWorker(file, { MYFI_P14_OUTBOX_BOUNDARY: 'after_commit' });
    assert.equal(killed.status, 86, `the worker must literally terminate: ${killed.stderr}`);

    const onDisk = inspect(file);
    assert.equal(onDisk.length, 1, 'the queued mutation must have survived the kill on disk');
    assert.equal(onDisk[0].entity_id, 'wallet-restart');
    assert.equal(onDisk[0].acknowledged_at, null, 'and must still be unacknowledged');

    const report = resumeReport(file);
    assert.equal(report.pending, 1, 'after reopen the mutation must still be drainable');
    assert.deepEqual(report.entityIds, ['wallet-restart']);
    assert.equal(report.acknowledged, 1, 'and the resumed run must be able to complete it');
    assert.equal(report.pendingAfterDrain, 0, 'leaving nothing pending once it lands');
  }

  // 2) Killed after a failed sync attempt. The attempt count and the scheduled
  //    backoff must both survive, so a restart neither loses the mutation nor
  //    resets its retry history into an immediate hot retry.
  {
    const file = path.join(temp, 'after_failed_attempt.sqlite');
    const killed = runWorker(file, { MYFI_P14_OUTBOX_BOUNDARY: 'after_failed_attempt' });
    assert.equal(killed.status, 86, `the worker must literally terminate: ${killed.stderr}`);

    const onDisk = inspect(file);
    assert.equal(onDisk.length, 1, 'a failed mutation is still a queued mutation');
    assert.equal(onDisk[0].attempts, 1, 'the failure must have been recorded durably');
    assert.equal(onDisk[0].acknowledged_at, null);
    assert.ok(onDisk[0].next_attempt_at, 'and its backoff must have survived the kill');
    assert.ok(Date.parse(onDisk[0].next_attempt_at) > Date.now(),
      'a restart must not make a backed-off mutation immediately due again');

    // Still inside its backoff, so a resume correctly declines to drain it yet.
    // That is the ladder working across a restart, not the mutation being lost:
    // the row is on disk, unacknowledged, with its history intact.
    const report = resumeReport(file);
    assert.equal(report.pending, 0, 'a mutation inside its backoff is not drained yet');
    assert.equal(inspect(file).length, 1, 'but it is still there, waiting');
  }

  // 3) Killed after acknowledgement. The opposite failure: a restart must not
  //    resurrect work that already completed and upload it a second time.
  {
    const file = path.join(temp, 'after_ack.sqlite');
    const killed = runWorker(file, { MYFI_P14_OUTBOX_BOUNDARY: 'after_ack' });
    assert.equal(killed.status, 86, `the worker must literally terminate: ${killed.stderr}`);

    const onDisk = inspect(file);
    assert.equal(onDisk.length, 1, 'the row is kept as history');
    assert.ok(onDisk[0].acknowledged_at, 'the acknowledgement must have survived the kill');

    const report = resumeReport(file);
    assert.equal(report.pending, 0, 'an acknowledged mutation must not be re-sent after a restart');
    assert.equal(report.acknowledged, 0);
  }

  console.log('MYFI P14 OUTBOX RESTART: PASSED');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
