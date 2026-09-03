// Phase 14 §86 — the outbox retry ladder and its terminal state.
//
// What this replaced: a flat 60s retry with no cap, so a mutation the server
// will never accept retried once a minute forever and nothing ever surfaced.
// These cases pin the ladder, the jitter bounds, the stop, and — most
// importantly — the directions the policy must fail in when its inputs are
// unreadable, because "permanent" here means a user's financial mutation
// stops being uploaded.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/financialOutboxRetryPolicyV1.js');
const compiled = new Module(target, module);
compiled.filename = target;
compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, target);
const {
  outboxRetryPlanV1, outboxPermanentFailureCutoffV1,
  OUTBOX_RETRY_BASE_MS, OUTBOX_RETRY_MAX_MS, OUTBOX_MAX_ATTEMPTS, OUTBOX_MAX_AGE_MS,
} = compiled.exports;

const NOW = Date.parse('2026-09-04T00:00:00.000Z');
const fresh = new Date(NOW - 60_000).toISOString();
const plan = (attempts, options = {}) => outboxRetryPlanV1({
  attempts, createdAt: fresh, now: NOW, random: () => 0, ...options,
});

// 1) The ladder is exponential, not flat. With jitter pinned to its floor
//    (random 0) each step is half the capped window, doubling until the cap.
{
  const floors = [1, 2, 3, 4].map(attempt => plan(attempt).delayMs);
  assert.deepEqual(floors, [15_000, 30_000, 60_000, 120_000],
    'each attempt must wait about twice the previous one, not a fixed minute');
  for (const attempt of [1, 2, 3, 4]) {
    assert.equal(plan(attempt).state, 'failed_retryable');
  }
}

// 2) The ladder is capped. Left uncapped, attempt 9 would be 30s * 2^8 = 128
//    minutes and climbing; a retry must never drift out to hours.
{
  const late = plan(OUTBOX_MAX_ATTEMPTS - 1, { random: () => 0.999999 });
  assert.equal(late.state, 'failed_retryable');
  assert.ok(late.delayMs <= OUTBOX_RETRY_MAX_MS,
    `capped delay ${late.delayMs} must not exceed ${OUTBOX_RETRY_MAX_MS}`);
  assert.ok(late.delayMs >= Math.floor(OUTBOX_RETRY_MAX_MS / 2),
    'at the cap the floor is half the window, so retries stay bounded on both sides');
}

// 3) Jitter is real and bounded. Two devices failing together must not stay
//    in lockstep, but a retry must never come back sooner than half the
//    intended delay either.
{
  const attempt = 3;
  const capped = Math.min(OUTBOX_RETRY_BASE_MS * (2 ** (attempt - 1)), OUTBOX_RETRY_MAX_MS);
  const half = Math.floor(capped / 2);
  const seen = new Set();
  for (const roll of [0, 0.13, 0.37, 0.5, 0.76, 0.99]) {
    const delay = plan(attempt, { random: () => roll }).delayMs;
    seen.add(delay);
    assert.ok(delay >= half, `jitter must never dip below the ${half}ms floor (got ${delay})`);
    assert.ok(delay <= capped, `jitter must never exceed the ${capped}ms window (got ${delay})`);
  }
  assert.ok(seen.size > 1, 'different rolls must produce different delays, or there is no jitter');
}

// 4) The stop. Attempt limit reached means terminal, with no next attempt
//    scheduled and a reason that names why.
{
  const stopped = plan(OUTBOX_MAX_ATTEMPTS);
  assert.equal(stopped.state, 'failed_permanent');
  assert.equal(stopped.nextAttemptAt, null, 'a stopped row must schedule nothing');
  assert.equal(stopped.delayMs, null);
  assert.equal(stopped.reason, 'outbox_max_attempts_exhausted');
  assert.equal(plan(OUTBOX_MAX_ATTEMPTS + 5).state, 'failed_permanent',
    'past the limit stays stopped rather than wrapping back to retryable');
}

// 5) Age is the other stop: a row too old to be worth retrying stops even if
//    it has not burned through its attempts (a device offline for weeks).
{
  const ancient = plan(2, { createdAt: new Date(NOW - OUTBOX_MAX_AGE_MS - 1000).toISOString() });
  assert.equal(ancient.state, 'failed_permanent');
  assert.equal(ancient.reason, 'outbox_max_age_exceeded');
  const justInside = plan(2, { createdAt: new Date(NOW - OUTBOX_MAX_AGE_MS + 60_000).toISOString() });
  assert.equal(justInside.state, 'failed_retryable', 'just inside the age window must still retry');
}

// 5b) Age alone must never retire a row that has not actually been failing.
//     The ladder burns its ten attempts in about ninety minutes, so an old row
//     with no failure history is not a stuck mutation -- it is a phone that was
//     off or offline. Retiring it would silently drop the pending work of
//     someone who came back after three weeks away.
{
  const untried = plan(1, { createdAt: new Date(NOW - OUTBOX_MAX_AGE_MS - 86_400_000).toISOString() });
  assert.equal(untried.state, 'failed_retryable',
    'a first attempt on an old row must still be tried, however old the row is');
  assert.ok(untried.nextAttemptAt, 'and it must be scheduled, not left unplanned');
  // Once it has actually failed before, age applies as intended.
  const triedAndOld = plan(2, { createdAt: new Date(NOW - OUTBOX_MAX_AGE_MS - 86_400_000).toISOString() });
  assert.equal(triedAndOld.state, 'failed_permanent',
    'an old row that has already failed at least once is genuinely stuck');
  assert.equal(triedAndOld.reason, 'outbox_max_age_exceeded');
}

// 6) Fail-safe directions. "Permanent" stops uploading a real financial
//    mutation, so an unreadable input must never be what causes it.
{
  for (const attempts of [undefined, null, 0, -3, NaN, 'many', {}]) {
    const guessed = plan(attempts);
    assert.equal(guessed.state, 'failed_retryable',
      `an unreadable attempt count (${String(attempts)}) must not retire a pending mutation`);
    assert.equal(guessed.delayMs, 15_000, 'it is treated as a first attempt, not a late one');
  }
  for (const createdAt of [undefined, null, '', 'not-a-date', 0]) {
    assert.equal(plan(2, { createdAt }).state, 'failed_retryable',
      `an unreadable created_at (${String(createdAt)}) must drop the age check, not trigger it`);
  }
  // A broken RNG must not push a delay outside its window either. Bounds come
  // from the constants, not a hand-copied number: attempt 2's window is
  // 30s-60s, and writing it out by hand is how this assertion got it wrong.
  const window2 = Math.min(OUTBOX_RETRY_BASE_MS * 2, OUTBOX_RETRY_MAX_MS);
  for (const random of [() => NaN, () => -1, () => 1, () => 'x', null, undefined]) {
    const delay = plan(2, { random }).delayMs;
    assert.ok(delay >= Math.floor(window2 / 2) && delay <= window2,
      `a broken RNG must stay in window (got ${delay})`);
  }
}

// 7) Repeat action. The ladder is a pure function of the row's own attempt
//    count, so replaying the same failure twice must produce the same class of
//    answer both times — the counter lives in the row, never in this module.
{
  const first = plan(4);
  const second = plan(4);
  assert.deepEqual(first, second, 'the same input must plan identically twice in a row');
  // And a real sequence advances monotonically to the stop, exactly once.
  const states = [];
  for (let attempt = 1; attempt <= OUTBOX_MAX_ATTEMPTS + 1; attempt += 1) {
    states.push(plan(attempt).state);
  }
  assert.equal(states.filter(state => state === 'failed_retryable').length, OUTBOX_MAX_ATTEMPTS - 1);
  assert.ok(states.slice(OUTBOX_MAX_ATTEMPTS - 1).every(state => state === 'failed_permanent'),
    'once stopped it stays stopped for every later attempt');
}

// 8) The SQL cutoff must describe the same boundary the plan does, or the
//    pending query and the policy would disagree about which rows stopped.
{
  const cutoff = outboxPermanentFailureCutoffV1(NOW);
  assert.equal(cutoff.maxAttempts, OUTBOX_MAX_ATTEMPTS);
  assert.equal(cutoff.createdAfter, new Date(NOW - OUTBOX_MAX_AGE_MS).toISOString());
  // The boundary the query uses (`attempts < maxAttempts`) must admit exactly
  // the attempts the plan still calls retryable.
  assert.equal(plan(cutoff.maxAttempts - 1).state, 'failed_retryable');
  assert.equal(plan(cutoff.maxAttempts).state, 'failed_permanent');
  assert.ok(Number.isFinite(Date.parse(outboxPermanentFailureCutoffV1().createdAfter)),
    'the default-now cutoff must still be a real timestamp');
}

console.log('MYFI P14 OUTBOX RETRY POLICY RUNTIME: PASSED');
