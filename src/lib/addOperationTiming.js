// MaalFlow Phase 15 — step timings for the 25K-50K add slowdown investigation.
//
// Measurement only. Nothing here changes an add; it records how long each named
// step took so the report can say WHICH step dominates instead of guessing.
//
// WHY THIS MODULE EXISTS RATHER THAN A CALLER-SUPPLIED HOOK
//
// The instrumentation shipped first as an optional `onDiagnosticStep` argument.
// It had zero callers, which made it unmeasurable on a device -- the same defect
// that shipped with `resetHistoryReadPathTelemetry` (zero callers, so the owner
// had to restart the app between every dataset tier), and the same one caught in
// review on the §97 instrument hours earlier. Three times is a pattern, so the
// recorder is now owned here and started by the add itself. The optional hook
// stays for tests and for any caller that wants its own listener.
//
// The cost of being always-on is a Date.now() per step -- about eighteen per
// add, against a SQLite transaction. That is a deliberate trade: an instrument
// that only works in a build the owner cannot install measures nothing.
//
// Durations and structural step names only. No amounts, no ids, no rows.

// Bounded: a long session must not grow this. The most recent runs are the
// interesting ones, so the oldest are evicted.
const MAX_RUNS = 20;

let runs = [];

const nowMs = () => Date.now();

/**
 * Start recording one add.
 *
 * @param {string} operation e.g. 'transaction' or 'commitment'
 * @returns {{ step: (name: string) => void, finish: () => void }}
 */
export const beginAddOperationTiming = (operation = 'unknown') => {
  const startedAt = nowMs();
  const marks = [];
  let finished = false;

  const step = name => {
    if (finished) return;
    // Structural names only. Coerced at the boundary so a caller cannot pass an
    // object whose toString leaks something.
    marks.push({ name: String(name), at: nowMs() - startedAt });
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    // The gaps are the answer, not the marks. A cumulative number says when a
    // step ended; the question is how long it took, and working that out by
    // hand from a JSON blob is exactly the step that does not happen.
    const stepMs = {};
    let previous = 0;
    for (const mark of marks) {
      stepMs[mark.name] = Math.max(0, mark.at - previous);
      previous = mark.at;
    }
    runs = [
      ...runs.slice(-(MAX_RUNS - 1)),
      {
        operation: String(operation),
        totalMs: previous,
        stepMs,
        // Cumulative too, so an unexpected gap between two steps is visible
        // rather than silently folded into the later one.
        marks: marks.reduce((all, mark) => ({ ...all, [mark.name]: mark.at }), {}),
      },
    ];
  };

  return { step, finish };
};

/**
 * The recorded runs, newest last.
 *
 * Returned as copies so a reader cannot mutate the record it is reading.
 */
export const readAddOperationTimings = () => runs.map(run => ({
  ...run,
  stepMs: { ...run.stepMs },
  marks: { ...run.marks },
}));

/**
 * Per-operation summary, so the report can be read without doing arithmetic by
 * hand across twenty runs.
 *
 * Deliberately reports the count alongside every number: an average over one
 * run is not an average, and reading it as one is how a single outlier becomes
 * a conclusion.
 */
export const summariseAddOperationTimings = () => {
  const byOperation = {};
  for (const run of runs) {
    const bucket = byOperation[run.operation] || (byOperation[run.operation] = {
      runCount: 0, totalMs: [], stepMs: {},
    });
    bucket.runCount += 1;
    bucket.totalMs.push(run.totalMs);
    for (const [name, ms] of Object.entries(run.stepMs)) {
      (bucket.stepMs[name] || (bucket.stepMs[name] = [])).push(ms);
    }
  }
  const summary = {};
  for (const [operation, bucket] of Object.entries(byOperation)) {
    const steps = {};
    for (const [name, values] of Object.entries(bucket.stepMs)) {
      const sorted = [...values].sort((a, b) => a - b);
      steps[name] = {
        runs: sorted.length,
        medianMs: sorted[Math.floor((sorted.length - 1) / 2)],
        maxMs: sorted[sorted.length - 1],
      };
    }
    const totals = [...bucket.totalMs].sort((a, b) => a - b);
    summary[operation] = {
      runCount: bucket.runCount,
      medianTotalMs: totals[Math.floor((totals.length - 1) / 2)],
      maxTotalMs: totals[totals.length - 1],
      steps,
    };
  }
  return summary;
};

export const resetAddOperationTimings = () => { runs = []; };
