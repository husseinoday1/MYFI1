// Phase 14 §86 -- how a failed outbox mutation waits, and when it stops.
//
// What this replaces: a flat `Date.now() + 60_000` with no attempt cap. Every
// failing mutation retried once a minute, forever, and nothing ever became
// visible as "this one is not going to succeed." A device with a genuinely
// rejected mutation would retry it every minute for the life of the install.
//
// Two things matter here beyond the arithmetic:
//
//   Jitter is not decoration. Without it every mutation queued in the same
//   outage retries on the same schedule forever, so a backend that failed
//   under load gets the identical burst back at each step.
//
//   `failed_permanent` stops retrying; it never deletes. Post-cutover the
//   local SQLite ledger is authoritative, so a permanently-failed row is a
//   sync divergence to surface, not lost money -- the row stays exactly where
//   it is, readable, for an explicit reviewed action to pick up.
//
// The state is derived from `attempts` and `created_at`, both already on
// ledger_outbox_v3/v2. Nothing here needs a schema change, so nothing here
// needs a migration gate.

export const OUTBOX_RETRY_BASE_MS = 30_000;
export const OUTBOX_RETRY_MAX_MS = 30 * 60_000;
export const OUTBOX_MAX_ATTEMPTS = 10;
export const OUTBOX_MAX_AGE_MS = 14 * 24 * 60 * 60_000;

// `created_at` is always written as an ISO string, so it is required to look
// like one. Date's own parsing is far too permissive to lean on here: it reads
// "0" as the year 2000, which would silently make a garbage timestamp look
// decades old and retire a live mutation on the age rule.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const finiteTime = (value) => {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

// Attempt counting: callers pass the count INCLUDING the failure being
// recorded now, i.e. `row.attempts + 1`. Attempt 1 waits the base delay.
const normalizedAttempts = (value) => {
  const attempts = Math.floor(Number(value));
  // An unreadable attempt count must not be treated as "many" -- that would
  // retire a pending financial mutation on a bad read. Fail toward retrying.
  return Number.isFinite(attempts) && attempts > 0 ? attempts : 1;
};

export const outboxRetryPlanV1 = ({
  attempts, createdAt = null, now = Date.now(), random = Math.random,
} = {}) => {
  const attempt = normalizedAttempts(attempts);
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const createdTime = finiteTime(createdAt);
  // An unparseable created_at drops the age dimension rather than declaring
  // the row permanently failed. Same reason as above: never strand a user's
  // pending mutation because a timestamp did not read back.
  // Age only retires a row that has actually been failing. Age alone would
  // retire a row that was never attempted, and that is not a stuck mutation --
  // it is a phone that was off, or offline, or simply not synced for a while.
  // The ladder exhausts in about ninety minutes of real failing, so age is
  // almost never what stops a genuinely failing row; without this clause its
  // main effect would be to silently drop the pending work of someone who
  // came back after three weeks away.
  const hasFailedBefore = attempt > 1;
  const tooOld = hasFailedBefore
    && createdTime !== null
    && (currentTime - createdTime) > OUTBOX_MAX_AGE_MS;
  const tooManyAttempts = attempt >= OUTBOX_MAX_ATTEMPTS;

  if (tooManyAttempts || tooOld) {
    return {
      state: 'failed_permanent',
      attempts: attempt,
      delayMs: null,
      nextAttemptAt: null,
      reason: tooManyAttempts ? 'outbox_max_attempts_exhausted' : 'outbox_max_age_exceeded',
    };
  }

  // Exponential, capped. Then equal jitter: half the window is guaranteed
  // spacing, half is spread, so two devices never stay in lockstep but a
  // retry can still never come back sooner than half the intended delay.
  const uncapped = OUTBOX_RETRY_BASE_MS * (2 ** (attempt - 1));
  const capped = Math.min(uncapped, OUTBOX_RETRY_MAX_MS);
  const half = Math.floor(capped / 2);
  const roll = Number(random?.());
  const spread = Number.isFinite(roll) && roll >= 0 && roll < 1 ? roll : 0;
  const delayMs = half + Math.floor(spread * (capped - half + 1));

  return {
    state: 'failed_retryable',
    attempts: attempt,
    delayMs,
    nextAttemptAt: new Date(currentTime + delayMs).toISOString(),
    reason: null,
  };
};

// The cutoff a SELECT uses to leave permanently-failed rows out of the
// pending set. Derived from the same constants as the plan above so the
// query and the policy can never disagree about what "permanent" means.
//
// The matching SQL is:
//   pending: attempts < maxAttempts AND (attempts = 0 OR created_at > createdAfter)
//   stopped: attempts >= maxAttempts OR (attempts > 0 AND created_at <= createdAfter)
// The `attempts` term on the age clause is the same "never attempted is not
// failing" rule the plan applies above; dropping it there would silently
// retire an untried row.
export const outboxPermanentFailureCutoffV1 = (now = Date.now()) => {
  const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return {
    maxAttempts: OUTBOX_MAX_ATTEMPTS,
    createdAfter: new Date(currentTime - OUTBOX_MAX_AGE_MS).toISOString(),
  };
};
