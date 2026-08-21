// Bug 1 measurement, delivered where the person measuring can reach it.
//
// The startup marks were already being collected and logged. The problem was the only
// way to read them: `adb logcat`, from a workstation, with a cable. The user tests on
// their own phone in ordinary daily use, and when asked for those numbers said plainly
// that they did not understand what was being asked. That is a failure of the delivery
// mechanism, not of the person — a measurement nobody can take produces no numbers, and
// two decisions have now been waiting on numbers that do not exist.
//
// So the marks are kept in memory here and shown in the Settings diagnostic panel,
// beside "Copy evidence" — the one route the user has already used successfully. The
// mechanism for getting numbers off the device should be the one they have done before,
// not a new one invented for each measurement.
//
// Module state, deliberately: one launch produces one set of marks, and they stay
// readable for as long as that launch lives. Nothing is persisted — a killed app has no
// startup to report, and a stale set of marks from a previous launch would be worse
// than none, because it would be read as this one.
//
// Impact
//   Financial data changed:   NO — integers of elapsed milliseconds, and nothing else
//   SQLite schema changed:    NO
//   Migration required:       NO

export const STARTUP_TIMING_VERSION = 1;

let lastStartupTiming = null;

/**
 * Record the marks collected during one launch.
 *
 * @param {object} marks   step name -> ms since the startup clock began
 * @param {string} outcome 'completed' | 'failed'
 */
export const recordStartupTiming = (marks = {}, outcome = 'completed') => {
  const steps = {};
  for (const [name, value] of Object.entries(marks || {})) {
    const elapsed = Number(value);
    if (!Number.isFinite(elapsed)) continue;
    steps[String(name)] = Math.max(0, Math.round(elapsed));
  }

  // The gaps between marks are the answer, not the marks themselves: a cumulative
  // number tells you when a step ended, and the question is how long it took. Working
  // that out by hand from a JSON blob is exactly the kind of step that does not happen.
  const durations = {};
  let previous = 0;
  for (const [name, elapsed] of Object.entries(steps)) {
    durations[name] = Math.max(0, elapsed - previous);
    previous = elapsed;
  }

  lastStartupTiming = {
    version: STARTUP_TIMING_VERSION,
    outcome: String(outcome || 'completed'),
    // Cumulative, as measured.
    marks: steps,
    // Per-step cost, derived. This is the column to read.
    stepMs: durations,
    totalMs: previous,
    // Carried in the payload rather than left in a source comment, for the same reason
    // maintenanceBlockedMs carries its lower-bound note: whoever reads these numbers
    // will be holding this JSON, not this file.
    readyMeansReactWasToldToRender: true,
    caveat: 'ready = React was told to render, not when pixels appeared. If totalMs is '
      + 'far below the delay you feel, the cost is in the first render and reordering '
      + 'startup would not fix it.',
  };
  return lastStartupTiming;
};

/** The marks from this launch, or null if the launch has not finished recording. */
export const readStartupTiming = () => lastStartupTiming;

export const __resetStartupTimingForTests = () => { lastStartupTiming = null; };
