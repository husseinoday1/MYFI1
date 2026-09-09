// MaalFlow Phase 15 — History read-path telemetry.
//
// The counters exist to answer one question: how often does a RETURNED SQL page
// get rejected? The answer is only meaningful if the by-design first paint from
// memory is excluded — counting that would report a ~100% reject rate and make
// the fallback look permanently load-bearing when it may not be.
//
// So this test runs the module for real (not source-string matching) and pins
// both the arithmetic and the wiring in HistoryScreen.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// --- Run the telemetry module for real ---------------------------------------

// The shared §97 module is inlined rather than stubbed: this test asserts real
// p50/p95 values, and a stubbed percentile would be asserting the stub.
const sharedSource = read('src/lib/performanceTelemetry.js').replace(/^export const /gm, 'const ');
const historySource = read('src/lib/historyReadPathTelemetry.js')
  .replace(/import \{[\s\S]*?\} from '\.\/performanceTelemetry';/, '');
let source = `${sharedSource}\n${historySource}`.replace(/^export const /gm, 'const ');
source += '\nmodule.exports = { recordHistoryLedgerQueryOutcome, recordHistoryLedgerQueryDuration, readHistoryReadPathTelemetry, resetHistoryReadPathTelemetry };\n';
const sandbox = { module: { exports: {} }, exports: {}, Date, Number, Boolean, String, Math, Object, Array, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'historyReadPathTelemetry.js' });
const {
  recordHistoryLedgerQueryOutcome: record,
  readHistoryReadPathTelemetry: readTelemetry,
  resetHistoryReadPathTelemetry: reset,
} = sandbox.module.exports;

// Nothing observed yet: rejectRate must be null, not 0. "No data" and "a perfect
// score" must not look the same on the diagnostics screen.
reset();
assert.equal(readTelemetry().rejectRate, null, 'rejectRate must be null before any query resolves');
assert.equal(readTelemetry().resolvedQueries, 0);

// Arithmetic: every non-accepted outcome counts against the rate.
reset();
for (let i = 0; i < 7; i += 1) record('accepted');
record('rejected_coverage', { sqlRows: 250, fallbackRows: 251 });
record('unsupported');
record('error', { reason: 'boom' });
const stats = readTelemetry();
assert.equal(stats.accepted, 7);
assert.equal(stats.rejectedCoverage, 1);
assert.equal(stats.unsupported, 1);
assert.equal(stats.errored, 1);
assert.equal(stats.resolvedQueries, 10);
assert.equal(stats.rejectRate, 0.3, 'rejectRate must count coverage, unsupported and error against accepted');
assert(stats.firstAt && stats.lastAt, 'first/last timestamps must be recorded');

// An unknown outcome must not silently inflate any counter.
reset();
record('accepted');
record('something_else');
assert.equal(readTelemetry().resolvedQueries, 1, 'an unrecognised outcome must not be counted');

// The rejection ring is bounded, and keeps the MOST RECENT entries. An unbounded
// list would grow for the whole session on a device that rejects often — exactly
// the device we most want to collect from.
reset();
for (let i = 0; i < 25; i += 1) record('rejected_coverage', { sqlRows: i, fallbackRows: i + 1 });
const ring = readTelemetry().recentRejections;
assert.equal(ring.length, 10, 'recentRejections must be capped at 10');
assert.equal(readTelemetry().rejectedCoverage, 25, 'the counter must keep counting past the sample cap');
assert.equal(ring[ring.length - 1].sqlRows, 24, 'the ring must keep the newest sample');
assert.equal(ring[0].sqlRows, 15, 'the ring must drop the oldest samples');

// Samples must carry sizes and filter shape only. This is copied to the
// clipboard from the Diagnostics screen, so it must never carry row contents.
reset();
record('rejected_coverage', {
  sqlRows: 250, fallbackRows: 300, search: true, transactionClass: 'expense',
  category: true, wallet: false, scope: 'personal', dated: true,
  // A caller passing extra context must not be able to leak it into the report.
  rows: [{ id: 'tx_1', amt: -12345, title: 'secret' }],
});
const sample = readTelemetry().recentRejections[0];
assert.deepEqual(Object.keys(sample).sort(), ['at', 'fallbackRows', 'filters', 'kind', 'sqlRows']);
assert.equal(sample.filters.transactionClass, 'expense');
assert.equal(sample.filters.search, true);
assert.equal(
  JSON.stringify(sample).includes('secret'), false,
  'a rejection sample must never carry transaction contents',
);

// Reading must not mutate: the returned arrays are copies.
reset();
record('rejected_coverage', { sqlRows: 1, fallbackRows: 2 });
readTelemetry().recentRejections.push({ injected: true });
assert.equal(readTelemetry().recentRejections.length, 1, 'readTelemetry must return a copy, not the live array');

// --- Pin the wiring ----------------------------------------------------------

const history = read('src/screens/HistoryScreen.js');
assert(
  history.includes('recordHistoryLedgerQueryOutcome') && history.includes("from '../lib/historyReadPathTelemetry'"),
  'HistoryScreen must import the telemetry recorder',
);
for (const outcome of ["'accepted'", "'rejected_coverage'", "'unsupported'", "'error'"]) {
  assert(
    history.includes(`recordHistoryLedgerQueryOutcome(${outcome}`),
    `HistoryScreen must record the ${outcome} outcome`,
  );
}

// The load-bearing wiring rule: the recorder must NOT be called from the effect
// that performs the by-design pre-query reset. If it ever is, every mount and
// every mutation would count as a rejection and the number becomes worthless.
const preQueryEffect = history.slice(
  history.indexOf('// Show the fresh in-memory rows immediately after a mutation.'),
  history.indexOf('const filtered = ledgerQueryOk ?'),
);
assert(preQueryEffect.length > 0, 'could not locate the pre-query effect — update this test');
assert.equal(
  preQueryEffect.includes('recordHistoryLedgerQueryOutcome'), false,
  'the by-design first paint must never be counted as a rejection',
);

// Appended pages skip the coverage check, so counting them would inflate
// "accepted" every time the user scrolls and push the reject rate toward zero
// for a reason unrelated to whether the fallback is needed. Every recording site
// must be gated on !append.
const recordingSites = history
  .split('\n')
  .map((line, index) => ({ line, index }))
  .filter(entry => entry.line.includes('recordHistoryLedgerQueryOutcome('));
assert.equal(recordingSites.length, 4, 'expected exactly four recording sites in HistoryScreen');
for (const site of recordingSites) {
  const window = history.split('\n').slice(Math.max(0, site.index - 4), site.index + 1).join('\n');
  assert(
    /!append/.test(window),
    `recording site at line ${site.index + 1} must be gated on !append: ${site.line.trim()}`,
  );
}

// The collector must report the device's real cutover state, since that is the
// half of the question source code cannot answer.
const collector = read('src/dev/historyReadPathDiagnostics.js');
for (const required of ['getFinancialWorkspaceStateV7', 'sourceMode', "state.source_mode === 'sqlite'", 'workspaceStateFound']) {
  assert(collector.includes(required), `the collector must report ${required}`);
}
assert.equal(
  /INSERT|UPDATE|DELETE|runAsync|execAsync/.test(collector), false,
  'the diagnostics collector must be read-only',
);

const diagnostics = read('src/screens/DiagnosticsScreen.js');
assert(
  diagnostics.includes('collectHistoryReadPathDiagnostics'),
  'DiagnosticsScreen must surface the history read-path collector',
);
assert(
  diagnostics.includes('rejectedCoverage') && diagnostics.includes('rejectRate'),
  'DiagnosticsScreen must display the reject counters',
);

console.log('PASS: phase15-history-read-path-telemetry');

// --- §97 duration percentiles -----------------------------------------------
//
// The Phase 15 audit found no timing instrumentation of any kind. These are the
// first numbers for it. They only became meaningful on 2026-09-05, when the
// year-filter fix let the SQL path return rows: before that, any timing would
// have measured how fast SQLite returns nothing.

const { recordHistoryLedgerQueryDuration: recordDuration } = sandbox.module.exports;

// Nothing measured must read as null, never 0 -- "not observed" and "instant"
// are opposite facts and must not share a value.
reset();
{
  const stats = readTelemetry();
  assert.equal(stats.p50Ms, null);
  assert.equal(stats.p95Ms, null);
  assert.equal(stats.maxMs, null);
  assert.equal(stats.durationSampleCount, 0);
}

// Nearest-rank percentiles over a known set.
reset();
for (const ms of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) recordDuration(ms);
{
  const stats = readTelemetry();
  assert.equal(stats.durationSampleCount, 10);
  assert.equal(stats.p50Ms, 50, 'p50 of 10 samples is the 5th');
  assert.equal(stats.p95Ms, 100, 'p95 of 10 samples is the 10th');
  assert.equal(stats.maxMs, 100);
}

// Order of arrival must not change the percentiles.
reset();
for (const ms of [100, 30, 70, 10, 50]) recordDuration(ms);
assert.equal(readTelemetry().p50Ms, 50, 'percentiles must sort, not take arrival order');

// Junk must not enter the sample and quietly drag a percentile down.
reset();
recordDuration(40);
for (const junk of [null, undefined, NaN, -1, 'abc', {}]) recordDuration(junk);
assert.equal(readTelemetry().durationSampleCount, 1, 'only real durations may be recorded');
assert.equal(readTelemetry().p50Ms, 40);

// Bounded, keeping the most recent -- percentiles should describe recent
// behaviour, not app start, and a long session must not grow this forever.
reset();
for (let i = 1; i <= 250; i += 1) recordDuration(i);
{
  const stats = readTelemetry();
  assert.equal(stats.durationSampleCount, 200, 'the duration sample must be bounded');
  assert.equal(stats.maxMs, 250, 'the newest samples must be the ones kept');
}

// The raw array must not leak into the snapshot; only the summary is reported.
assert.equal(readTelemetry().durationsMs, undefined, 'raw durations must not be exposed');

// Wired at the call site, and only for first-page queries -- an appended page
// is a different, cheaper operation and would skew the percentiles.
assert(
  history.includes('recordHistoryLedgerQueryDuration(Date.now() - startedAt)'),
  'HistoryScreen must record the query duration',
);
assert(
  /if \(!append\) recordHistoryLedgerQueryDuration/.test(history),
  'only first-page queries may be timed',
);

const diagnosticsSource = read('src/screens/DiagnosticsScreen.js');
for (const field of ['p50Ms', 'p95Ms', 'durationSampleCount']) {
  assert(diagnosticsSource.includes(field), `Diagnostics must surface ${field}`);
}

console.log('PASS: phase15-history-read-path-telemetry (§97 durations)');
