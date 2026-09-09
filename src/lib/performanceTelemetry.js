// MaalFlow Phase 15 §97 — baseline p50/p95 for the four operations that matter.
//
// Diagnostic only. Nothing here changes behaviour; it records how long four
// named operations took and reports percentiles over a bounded sample.
//
// SCOPE IS DELIBERATELY FOUR. Not Reports, not search, not sync, not archive.
// A small instrument that ships beats a complete one that does not, and every
// extra operation is another call site that can drift out of date.
//
// The percentile and the recording guard live here rather than in each caller
// so all four report identically. `historyReadPathTelemetry` imports the same
// `percentile` for exactly that reason -- two implementations would eventually
// disagree about what p95 means.

/**
 * The only operations this module accepts. An unknown key is rejected rather
 * than silently creating a new bucket: a typo at a call site would otherwise
 * produce an operation nobody reads and an empty one everybody does.
 */
export const PERFORMANCE_OPERATIONS = Object.freeze({
  COLD_START: 'cold_start',
  HOME_OPEN: 'home_open',
  HISTORY_FIRST_PAGE: 'history_first_page',
  TRANSACTION_SAVE: 'transaction_save',
});

const OPERATION_KEYS = Object.freeze(Object.values(PERFORMANCE_OPERATIONS));

// Bounded, oldest evicted first, so a long session cannot grow this and the
// percentiles describe recent behaviour rather than app start.
const MAX_SAMPLES_PER_OPERATION = 200;

const emptyBuckets = () => {
  const buckets = {};
  for (const key of OPERATION_KEYS) buckets[key] = [];
  return buckets;
};

let durations = emptyBuckets();

/**
 * Nearest-rank percentile over an ascending-sorted array.
 *
 * Deliberately not interpolated: with a bounded sample an exact observed value
 * is easier to reason about than a synthetic one, and p95 should name an
 * operation that really happened.
 */
export const percentile = (sortedAscending, fraction) => {
  if (!Array.isArray(sortedAscending) || !sortedAscending.length) return null;
  const rank = Math.max(1, Math.ceil(fraction * sortedAscending.length));
  return sortedAscending[Math.min(rank, sortedAscending.length) - 1];
};

/**
 * True only for a real measurement.
 *
 * `typeof` first, on purpose. `Number(null)` is 0 and `Number.isInteger(0)` is
 * true, so a bare coercion records a MISSING measurement as a 0ms operation and
 * quietly drags p50 down. That exact trap (`Number(null) === 0`) emptied every
 * History page until 2026-09-05 and was then reintroduced in this project's
 * duration recorder within the hour -- caught only because a test asserted junk
 * input is REJECTED, not merely that good input is accepted.
 *
 * 0 itself stays valid: a genuinely fast operation can measure 0 on a
 * `Date.now()` diff.
 */
const isRealDuration = value => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0
);

const isKnownOperation = operation => OPERATION_KEYS.includes(operation);

/**
 * Record one completed operation.
 *
 * @param {string} operation one of PERFORMANCE_OPERATIONS
 * @param {number} durationMs wall time in ms
 * @returns {boolean} whether the sample was accepted (useful in tests)
 */
export const recordOperationDurationV1 = (operation, durationMs) => {
  if (!isKnownOperation(operation) || !isRealDuration(durationMs)) return false;
  durations[operation] = [
    ...durations[operation].slice(-(MAX_SAMPLES_PER_OPERATION - 1)),
    durationMs,
  ];
  return true;
};

/**
 * Seed samples measured before this process, or in a previous launch.
 *
 * Cold start produces exactly ONE sample per launch, so without this its p50/p95
 * would describe a single number forever. The caller owns persistence; this
 * module stays free of storage so it can be tested without one.
 *
 * Junk entries are dropped individually rather than rejecting the whole batch --
 * a corrupted persisted ring should cost the bad samples, not the good ones.
 */
export const hydrateOperationDurationsV1 = (operation, samples = []) => {
  if (!isKnownOperation(operation) || !Array.isArray(samples)) return 0;
  const clean = samples.filter(isRealDuration);
  durations[operation] = [
    ...durations[operation],
    ...clean,
  ].slice(-MAX_SAMPLES_PER_OPERATION);
  return clean.length;
};

/** The raw samples for one operation, for a caller that persists them. */
export const exportOperationDurationsV1 = operation => (
  isKnownOperation(operation) ? [...durations[operation]] : []
);

const summarise = samples => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    sampleCount: sorted.length,
    // Null, never 0, when nothing was observed: "not measured" must never be
    // readable as "instant".
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.length ? sorted[sorted.length - 1] : null,
  };
};

export const readPerformanceTelemetryV1 = () => {
  const operations = {};
  for (const key of OPERATION_KEYS) operations[key] = summarise(durations[key]);
  return { version: 1, operations };
};

/**
 * A reachable reset.
 *
 * `resetHistoryReadPathTelemetry` shipped with zero callers anywhere in the
 * app, which is why the owner had to fully restart the app between every
 * dataset tier on 2026-09-08 to get isolated numbers. This one is wired to a
 * button in Diagnostics.
 */
export const resetPerformanceTelemetryV1 = () => { durations = emptyBuckets(); };

// --- SLO thresholds ---------------------------------------------------------
//
// `evidence` is the honest part of this table. Only one of the four operations
// has ever been measured on the real V7 path on a device; the rest are
// placeholders that a device run has to confirm or move. Labelling them keeps
// a provisional number from being quoted later as if it were established.
//
// What a breach MEANS is deliberately not defined here. Whether it blocks a
// release, warns, or is only recorded is a product/risk decision for the owner,
// not something this module should encode.
export const PERFORMANCE_SLO_V1 = Object.freeze({
  [PERFORMANCE_OPERATIONS.COLD_START]: Object.freeze({
    p50Ms: 2000,
    p95Ms: 4000,
    evidence: 'provisional',
    note: 'No p50/p95 baseline yet. Startup marks exist per launch '
      + '(startupTiming.js) but were never aggregated across launches. The '
      + '2026-09-08 device work measured 40-70s cold start at the 50K tier '
      + 'before the reuse-proof fix, and a 33x improvement after, so a real '
      + 'baseline is now worth taking.',
  }),
  [PERFORMANCE_OPERATIONS.HOME_OPEN]: Object.freeze({
    p50Ms: 300,
    p95Ms: 800,
    evidence: 'provisional',
    note: 'Never measured. The owner reports Home slowing noticeably beyond '
      + '10K rows, so this threshold is a guess that the first device run '
      + 'should be expected to move.',
  }),
  [PERFORMANCE_OPERATIONS.HISTORY_FIRST_PAGE]: Object.freeze({
    p50Ms: 120,
    p95Ms: 250,
    evidence: 'evidence-based',
    note: 'Measured on a real device on the V7 path: p50 45-47ms, p95 61-64ms '
      + 'over 33 and 50 samples (2026-09-05/06). Thresholds set roughly 2.5x '
      + 'and 4x above observed, leaving room for larger ledgers without being '
      + 'so loose that a regression hides.',
  }),
  [PERFORMANCE_OPERATIONS.TRANSACTION_SAVE]: Object.freeze({
    p50Ms: 400,
    p95Ms: 1000,
    evidence: 'provisional',
    note: 'Never measured. The owner reports adds slowing at 25K-50K, which is '
      + 'the subject of the separate step-level investigation; expect this '
      + 'number to move once that returns.',
  }),
});

/**
 * Compare current telemetry against the thresholds.
 *
 * Reports. Does not act, and deliberately has no notion of "fail" -- see the
 * comment on PERFORMANCE_SLO_V1.
 */
export const evaluateSloV1 = (telemetry = readPerformanceTelemetryV1()) => {
  const results = {};
  for (const key of OPERATION_KEYS) {
    const observed = telemetry?.operations?.[key] || {};
    const target = PERFORMANCE_SLO_V1[key];
    // No samples means unknown, not "within budget". Reporting an unmeasured
    // operation as passing is the failure mode this guards against.
    const measured = Number(observed.sampleCount || 0) > 0;
    results[key] = {
      measured,
      sampleCount: Number(observed.sampleCount || 0),
      p50Ms: observed.p50Ms ?? null,
      p95Ms: observed.p95Ms ?? null,
      targetP50Ms: target.p50Ms,
      targetP95Ms: target.p95Ms,
      evidence: target.evidence,
      breachedP50: measured && observed.p50Ms > target.p50Ms,
      breachedP95: measured && observed.p95Ms > target.p95Ms,
    };
  }
  return { version: 1, results };
};
