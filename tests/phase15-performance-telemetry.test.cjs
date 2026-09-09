// MYFI Phase 15 §97 — the baseline p50/p95 instrument.
//
// Runs the real module (not source-string matching) because the whole value of
// this instrument is arithmetic: a percentile that is subtly wrong produces
// confident numbers nobody can tell are wrong.
//
// The junk-input coverage below is the part that matters most. `Number(null)`
// is 0, so a bare coercion records a MISSING measurement as a 0ms operation and
// drags p50 down. That trap emptied every History page until 2026-09-05 and was
// then reintroduced in this project's own duration recorder within the hour --
// caught only because a test asserted junk is REJECTED, not merely that good
// input is accepted.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const source = read('src/lib/performanceTelemetry.js').replace(/^export const /gm, 'const ');
const sandbox = { module: { exports: {} }, exports: {}, Number, String, Math, Object, Array, JSON, console };
vm.createContext(sandbox);
vm.runInContext(
  `${source}\nmodule.exports = { PERFORMANCE_OPERATIONS, PERFORMANCE_SLO_V1, percentile,`
  + ' recordOperationDurationV1, hydrateOperationDurationsV1, exportOperationDurationsV1,'
  + ' readPerformanceTelemetryV1, resetPerformanceTelemetryV1, evaluateSloV1 };',
  sandbox,
  { filename: 'performanceTelemetry.js' },
);
const {
  PERFORMANCE_OPERATIONS: OPS,
  PERFORMANCE_SLO_V1: SLO,
  percentile,
  recordOperationDurationV1: record,
  hydrateOperationDurationsV1: hydrate,
  exportOperationDurationsV1: exportSamples,
  readPerformanceTelemetryV1: readTelemetry,
  resetPerformanceTelemetryV1: reset,
  evaluateSloV1: evaluateSlo,
} = sandbox.module.exports;

const ALL_OPS = Object.values(OPS);
assert.equal(ALL_OPS.length, 4, 'scope is exactly four operations -- a fifth needs a decision, not a commit');

// --- percentile arithmetic ---------------------------------------------------

assert.equal(percentile([], 0.5), null, 'no samples must be null, never 0');
assert.equal(percentile([5], 0.5), 5);
assert.equal(percentile([5], 0.95), 5);
// Nearest-rank, not interpolated: p50 of 10 is the 5th, p95 is the 10th.
const ten = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
assert.equal(percentile(ten, 0.5), 50, 'p50 of 10 samples is the 5th');
assert.equal(percentile(ten, 0.95), 100, 'p95 of 10 samples is the 10th');
// Every percentile must name a value that actually occurred.
for (const fraction of [0.5, 0.95]) {
  assert(ten.includes(percentile(ten, fraction)), 'a percentile must name an observed value');
}
assert.equal(percentile(null, 0.5), null, 'a non-array must not throw');

// --- nothing measured is null, not zero --------------------------------------

reset();
{
  const { operations } = readTelemetry();
  for (const op of ALL_OPS) {
    assert.equal(operations[op].p50Ms, null, `${op} p50 must be null before any sample`);
    assert.equal(operations[op].p95Ms, null, `${op} p95 must be null before any sample`);
    assert.equal(operations[op].maxMs, null, `${op} max must be null before any sample`);
    assert.equal(operations[op].sampleCount, 0);
  }
}

// --- junk input is rejected, and 0 stays valid -------------------------------

reset();
for (const junk of [null, undefined, NaN, Infinity, -Infinity, -1, '42', '', {}, [], true, () => {}]) {
  assert.equal(
    record(OPS.TRANSACTION_SAVE, junk), false,
    `${JSON.stringify(String(junk))} must be rejected, not coerced`,
  );
}
assert.equal(
  readTelemetry().operations[OPS.TRANSACTION_SAVE].sampleCount, 0,
  'no junk value may reach the samples -- this is the Number(null)===0 trap',
);
// A genuinely fast operation can measure 0 on a Date.now() diff.
assert.equal(record(OPS.TRANSACTION_SAVE, 0), true, '0 is a real measurement and must be kept');
assert.equal(readTelemetry().operations[OPS.TRANSACTION_SAVE].p50Ms, 0);

// --- an unknown operation key is rejected ------------------------------------

reset();
assert.equal(record('reports_open', 5), false, 'an unknown operation must not create a bucket');
assert.equal(record(null, 5), false);
assert.equal(record(undefined, 5), false);
{
  const { operations } = readTelemetry();
  assert.equal(Object.keys(operations).length, 4, 'the reported shape must stay exactly four operations');
  assert.equal('reports_open' in operations, false);
}

// --- the bounded ring --------------------------------------------------------

reset();
for (let i = 1; i <= 250; i += 1) record(OPS.HOME_OPEN, i);
{
  const home = readTelemetry().operations[OPS.HOME_OPEN];
  assert.equal(home.sampleCount, 200, 'samples must be capped at 200');
  // Oldest evicted: 1..50 are gone, so the max is the newest and the smallest
  // surviving sample is 51.
  assert.equal(home.maxMs, 250, 'the newest sample must survive');
  assert.equal(Math.min(...exportSamples(OPS.HOME_OPEN)), 51, 'the oldest samples must be dropped first');
}

// --- operations are independent ----------------------------------------------

reset();
record(OPS.COLD_START, 1000);
record(OPS.HOME_OPEN, 10);
{
  const { operations } = readTelemetry();
  assert.equal(operations[OPS.COLD_START].p50Ms, 1000);
  assert.equal(operations[OPS.HOME_OPEN].p50Ms, 10);
  assert.equal(operations[OPS.HISTORY_FIRST_PAGE].sampleCount, 0, 'one operation must not leak into another');
}

// --- hydration (cold start carries across launches) --------------------------

reset();
// Cold start produces one sample per launch, so without hydration its p50/p95
// would describe a single number forever.
assert.equal(hydrate(OPS.COLD_START, [900, 1100, 1000]), 3);
assert.equal(readTelemetry().operations[OPS.COLD_START].p50Ms, 1000);
// A corrupted persisted ring must cost only its bad entries.
reset();
assert.equal(hydrate(OPS.COLD_START, [900, null, 'x', NaN, 1100]), 2, 'junk entries are dropped individually');
assert.equal(readTelemetry().operations[OPS.COLD_START].sampleCount, 2);
assert.equal(hydrate('nope', [1, 2]), 0, 'an unknown operation must hydrate nothing');
assert.equal(hydrate(OPS.COLD_START, 'not-an-array'), 0);
// Hydration must respect the cap too, or a poisoned store could grow unbounded.
reset();
hydrate(OPS.COLD_START, Array.from({ length: 500 }, (_, i) => i + 1));
assert.equal(readTelemetry().operations[OPS.COLD_START].sampleCount, 200, 'hydration must respect the cap');

// --- reading must not mutate --------------------------------------------------

reset();
record(OPS.HOME_OPEN, 5);
exportSamples(OPS.HOME_OPEN).push(999);
assert.equal(readTelemetry().operations[OPS.HOME_OPEN].sampleCount, 1, 'export must return a copy');
assert.equal(exportSamples('unknown').length, 0);

// --- reset is reachable and total --------------------------------------------

reset();
record(OPS.COLD_START, 1);
record(OPS.HOME_OPEN, 2);
reset();
for (const op of ALL_OPS) {
  assert.equal(readTelemetry().operations[op].sampleCount, 0, `${op} must be cleared by reset`);
}

// --- SLO table honesty --------------------------------------------------------

for (const op of ALL_OPS) {
  const target = SLO[op];
  assert(target, `${op} must have an SLO entry`);
  assert(typeof target.p50Ms === 'number' && target.p50Ms > 0, `${op} p50 target must be a real number`);
  assert(target.p95Ms > target.p50Ms, `${op} p95 target must exceed p50`);
  assert(
    ['evidence-based', 'provisional'].includes(target.evidence),
    `${op} must declare whether its threshold is evidence-based or provisional`,
  );
  assert(String(target.note || '').length > 20, `${op} must say where its number came from`);
}
// Exactly one operation has ever been measured on a real device on the V7 path.
// If this count changes, someone either measured something (good -- update it)
// or relabelled a guess as evidence (not good).
assert.equal(
  ALL_OPS.filter(op => SLO[op].evidence === 'evidence-based').length, 1,
  'only history_first_page has a real device baseline; the rest must stay labelled provisional',
);
assert.equal(SLO[OPS.HISTORY_FIRST_PAGE].evidence, 'evidence-based');

// --- SLO evaluation reports, and never calls unmeasured "passing" ------------

reset();
{
  const { results } = evaluateSlo();
  for (const op of ALL_OPS) {
    assert.equal(results[op].measured, false, `${op} with no samples must report measured:false`);
    assert.equal(results[op].breachedP50, false, 'an unmeasured operation must not be reported as breaching');
    assert.equal(results[op].breachedP95, false);
    assert.equal(results[op].p50Ms, null, 'an unmeasured operation must not report a number');
  }
}

reset();
// Comfortably inside budget.
record(OPS.HISTORY_FIRST_PAGE, 40);
// Well past it.
record(OPS.HOME_OPEN, 5000);
{
  const { results } = evaluateSlo();
  assert.equal(results[OPS.HISTORY_FIRST_PAGE].measured, true);
  assert.equal(results[OPS.HISTORY_FIRST_PAGE].breachedP50, false, '40ms is inside the 120ms p50 target');
  assert.equal(results[OPS.HOME_OPEN].breachedP50, true, '5000ms must breach the 300ms p50 target');
  assert.equal(results[OPS.HOME_OPEN].breachedP95, true);
  // Reporting only. A breach must not carry a verdict: what happens on breach
  // is a product decision, deliberately not encoded here.
  assert.equal('failed' in results[OPS.HOME_OPEN], false, 'the evaluator must report, not judge');
  assert.equal('blocksRelease' in results[OPS.HOME_OPEN], false);
}

// --- the four call sites are actually wired ----------------------------------

const wiring = [
  ['App.js', 'COLD_START', 'cold start must be sampled once per launch'],
  ['src/screens/HomeScreen.js', 'HOME_OPEN', 'Home must record when its data is ready'],
  ['src/lib/historyReadPathTelemetry.js', 'HISTORY_FIRST_PAGE', 'History must forward its existing duration'],
  ['src/store/slices/transactionsSlice.js', 'TRANSACTION_SAVE', 'addTrans must record the save'],
];
for (const [file, opConst, message] of wiring) {
  const text = read(file);
  assert(text.includes('recordOperationDurationV1'), `${file}: ${message}`);
  assert(text.includes(`PERFORMANCE_OPERATIONS.${opConst}`), `${file}: must use the ${opConst} key`);
}

// One percentile implementation, not two: historyReadPathTelemetry must import
// it rather than keep its own copy, or the two modules will eventually disagree
// about what p95 means for the same operation.
const historyModule = read('src/lib/historyReadPathTelemetry.js');
assert(
  historyModule.includes("from './performanceTelemetry'"),
  'historyReadPathTelemetry must share the percentile, not redefine it',
);
assert.equal(
  /const percentile = \(/.test(historyModule), false,
  'a second percentile implementation must not exist',
);

// Cold start must persist across launches, or its p50/p95 describes one number.
const app = read('App.js');
assert(app.includes('hydrateOperationDurationsV1'), 'cold start must hydrate the previous ring');
assert(app.includes('PERF_COLD_START'), 'cold start samples must be persisted');

console.log('PASS: phase15-performance-telemetry');

// --- the instrument must be REACHABLE, not merely defined --------------------
//
// Added after review 2026-09-09. The module comment claimed the reset was
// "wired to a button in Diagnostics" and it was not: all three read/reset/
// evaluate entry points had zero callers anywhere in src/. That is the exact
// defect this module's own comment cites as the reason it exists --
// resetHistoryReadPathTelemetry shipped unreachable, so the owner had to fully
// restart the app between dataset tiers. Reproduced here in the same session.
//
// So this asserts INVOCATION, not text presence: a call with parentheses, in a
// file the owner can actually reach.

const diagnostics = read('src/screens/DiagnosticsScreen.js');

for (const entry of ['readPerformanceTelemetryV1', 'evaluateSloV1', 'resetPerformanceTelemetryV1']) {
  assert(
    diagnostics.includes(`${entry}(`),
    `${entry} must actually be CALLED from Diagnostics, not just defined`,
  );
}

// Imported, not shadowed by a local of the same name.
assert(
  /import \{[\s\S]*?\} from '\.\.\/lib\/performanceTelemetry';/.test(diagnostics),
  'Diagnostics must import the telemetry module',
);

// The read must feed the evidence snapshot the owner copies, or the numbers are
// collected and never seen.
const refreshBody = diagnostics.slice(
  diagnostics.indexOf('const refresh = useCallback'),
  diagnostics.indexOf('useEffect(() => { refresh(); }'),
);
assert(
  refreshBody.includes('readPerformanceTelemetryV1()') && refreshBody.includes('evaluateSloV1()'),
  'the telemetry must be read into the same snapshot the owner copies',
);
assert(
  /performance:\s*readPerformanceTelemetryV1\(\)/.test(refreshBody)
  && /performanceSlo:\s*evaluateSloV1\(\)/.test(refreshBody),
  'the snapshot must carry both the raw numbers and the SLO evaluation',
);

// The reset must be attached to a pressable, not merely called somewhere.
const resetIndex = diagnostics.indexOf('resetPerformanceTelemetryV1()');
assert(resetIndex > 0, 'reset must be called');
const aroundReset = diagnostics.slice(Math.max(0, resetIndex - 700), resetIndex);
assert(
  aroundReset.includes('onPress'),
  'the reset must hang off an onPress handler -- a function nobody can press is the bug this replaces',
);
// And the screen must re-read afterwards, or the owner presses reset and still
// sees the old numbers.
const afterReset = diagnostics.slice(resetIndex, resetIndex + 300);
assert(
  afterReset.includes('refresh()'),
  'reset must be followed by a refresh, or the cleared state is not visible',
);

console.log('PASS: phase15-performance-telemetry (reachability)');
