// MYFI Phase 15 — the performance instruments must be complete and reachable.
//
// This test exists because the same defect shipped four times:
//
//   1. resetHistoryReadPathTelemetry shipped with zero callers, so the owner had
//      to fully restart the app between dataset tiers on 2026-09-08.
//   2. §97's read/reset/evaluate shipped with zero callers (caught in review).
//   3. The add step hook shipped with nobody passing it (caught before commit).
//   4. The reset button cleared two of three instruments and left the persisted
//      cold-start ring on disk -- which invalidated the 200-tier device run on
//      2026-09-09, and was found only because the numbers came back wrong.
//
// Enumerating the known cases would not have prevented the fourth. So these
// assertions are STRUCTURAL: they derive what must be wired from what exists,
// which means a fifth instrument that forgets to register fails here instead of
// wasting a device run.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const INSTRUMENT_MODULES = [
  'src/lib/performanceTelemetry.js',
  'src/lib/addOperationTiming.js',
  'src/lib/historyReadPathTelemetry.js',
];

const aggregate = read('src/lib/performanceInstruments.js');
const diagnostics = read('src/screens/DiagnosticsScreen.js');
const repository = read('src/lib/financialLedgerV7Repository.js');
const store = read('src/store/slices/transactionsSlice.js');

// --- 1. every reset that exists must be called by the aggregate --------------

// Derived, not listed: any future `resetSomethingV2` in an instrument module is
// picked up automatically and must be registered.
const discoveredResets = [];
for (const rel of INSTRUMENT_MODULES) {
  const source = read(rel);
  for (const match of source.matchAll(/export const (reset[A-Za-z0-9_]*)\s*=/g)) {
    discoveredResets.push({ module: rel, name: match[1] });
  }
}
assert(discoveredResets.length >= 3, 'expected each instrument module to export a reset');

// STRENGTHENED 2026-09-09 after mutation testing. The earlier version of this
// loop asked whether the reset's NAME appeared in the aggregate module. It
// always did -- the import line alone satisfied it -- so deleting the actual
// `attempt(...)` call left the instrument permanently uncleared and every
// assertion still passed. Two mutations survived because of that, which is the
// fifth occurrence in this project of "the symbol exists" being mistaken for
// "the code runs". Imports are stripped before matching now, and the invocation
// is matched as a call rather than as a mention.
const NEWLINE = String.fromCharCode(10);
const aggregateWithoutImports = aggregate
  .split(NEWLINE)
  .filter(line => !/^import /.test(line.trim()))
  .join(NEWLINE);

// Built by hand rather than with a template literal: `\b` and `\s` inside a
// template literal are an escape, not regex syntax, so a pattern assembled that
// way silently stops meaning what it reads as. That produced a false CAUGHT in
// this file's own mutation run on 2026-09-09 -- a test that fails for the wrong
// reason is no better than one that passes for the wrong reason.
const invocationPattern = name => new RegExp(
  'attempt\\(\\s*\'[A-Za-z0-9_]+\'\\s*,\\s*' + name + '\\s*\\)',
);

const importLines = aggregate
  .split(NEWLINE)
  .filter(line => /^import /.test(line.trim()));

for (const { module, name } of discoveredResets) {
  assert(
    importLines.some(line => line.includes(name)),
    `${name} (${module}) must be imported by performanceInstruments.js`,
  );
  // The call itself: registered in the attempt() table, with the reset passed as
  // the function to run. A comment, a string, or an unused import cannot satisfy
  // this -- an unused import is exactly what let two mutations survive before
  // this assertion was tightened.
  assert(
    invocationPattern(name).test(aggregateWithoutImports),
    `${name} (${module}) is imported but never invoked by resetAllPerformanceInstrumentsV1 -- `
    + 'a reset nothing calls is exactly how the 200-tier device run was invalidated',
  );
}

// The persisted ring lives on disk, where an in-memory reset cannot reach it.
assert(
  /removeItem\(\s*STORAGE\.PERF_COLD_START\s*\)/.test(aggregateWithoutImports),
  'the aggregate reset must clear the persisted cold-start ring, not just memory',
);

// A partial clear must be reported, never swallowed: the owner has to know
// before he measures a tier against samples he believes are gone.
// Pinned to the computation, not to the words. `ok: true` also contains "ok:"
// and the word "failed" appears in the comments, so the earlier form of this
// assertion survived a mutation that made a partial clear report success.
assert(
  /ok:\s*failed\.length === 0/.test(aggregateWithoutImports),
  'ok must be derived from the failures, not asserted -- a partial clear that '
  + 'reports success is worse than one that reports nothing',
);
assert(
  /return \{ ok[\s\S]{0,60}failed \}/.test(aggregateWithoutImports),
  'the aggregate reset must return the list of instruments that failed to clear',
);

// --- 2. Diagnostics must use the aggregate, not the individual resets --------

assert(
  diagnostics.includes('resetAllPerformanceInstrumentsV1()'),
  'the reset button must call the aggregate',
);
// Calling the individual resets from the screen is exactly the shape that left
// one behind. If a future edit reintroduces them there, completeness goes back
// to being maintained by memory.
for (const { name } of discoveredResets) {
  assert.equal(
    new RegExp(`${name}\\(\\)`).test(diagnostics), false,
    `DiagnosticsScreen must not call ${name} directly -- use the aggregate so nothing can be missed`,
  );
}
// And the outcome must be surfaced, or a partial clear looks like a clean one.
const resetIndex = diagnostics.indexOf('resetAllPerformanceInstrumentsV1()');
const afterReset = diagnostics.slice(resetIndex, resetIndex + 900);
assert(afterReset.includes('outcome.ok'), 'the reset result must be shown to the owner');
assert(afterReset.includes('outcome.failed'), 'a partial clear must name what did not clear');
assert(afterReset.includes('refresh()'), 'the screen must re-read after a reset');

// --- 3. every commit wrapper must forward the step hook ----------------------

// Derived from the source: any exported function that reaches
// commitFinancialLedgerV7Command has to pass onDiagnosticStep through, or the
// 13 inner steps silently vanish on whichever path it serves. That is what
// happened to the ordinary expense save -- the most common path of all.
const wrapperCalls = [...repository.matchAll(
  /commitFinancialLedgerV7Command\(([^)]*)\)/g,
)].map(match => match[1]);
assert(wrapperCalls.length >= 3, 'expected several call sites to the command');
for (const args of wrapperCalls) {
  // The definition itself and the spread-through wrapper are not call sites
  // that name options explicitly.
  if (!args.includes('{')) continue;
  assert(
    args.includes('onDiagnosticStep') || /,\s*options\s*\)?$/.test(args),
    `commitFinancialLedgerV7Command(${args}) must forward onDiagnosticStep, or its path cannot be measured`,
  );
}

// The two exported wrappers by name, so a rename cannot quietly drop one.
for (const wrapper of ['commitFinancialTransactionV7', 'commitExpenseToFinancialLedgerV7']) {
  const start = repository.indexOf(`export const ${wrapper} = async ({`);
  assert(start > 0, `${wrapper} must exist`);
  const body = repository.slice(start, repository.indexOf('\n};', start));
  assert(
    body.includes('onDiagnosticStep = null'),
    `${wrapper} must accept onDiagnosticStep`,
  );
  assert(
    body.includes('onDiagnosticStep }'),
    `${wrapper} must forward onDiagnosticStep to the command`,
  );
}

// --- 4. the common expense path must pass the hook ---------------------------

// This is the branch a plain, non-recurring expense takes -- the most common
// save in the app, and the one that produced only four store steps and none of
// the thirteen on the 200-tier run.
//
// `onDiagnosticStep` is optional at the public add boundary, so merely
// forwarding its *name* proves nothing: it is normally null. Each ledger
// wrapper must instead receive `step`, which writes to the owned recorder and
// then forwards to that optional listener. This is intentionally pinned to the
// argument value; the earlier assertion only checked the symbol was present
// and passed while the device instrument remained unreachable.
const expenseBranch = store.slice(
  store.indexOf('v7Commit = tx.flowType === FLOW_TYPES.EXPENSE'),
  store.indexOf('if (v7Commit.supported && !v7Commit.ok)'),
);
assert(expenseBranch.length > 0, 'could not locate the expense branch -- update this test');
assert(
  expenseBranch.includes('commitExpenseToFinancialLedgerV7')
  && /commitExpenseToFinancialLedgerV7\([^)]*onDiagnosticStep:\s*step/.test(expenseBranch),
  'the ordinary expense save must pass the local step recorder, not the optional listener, or its 13 inner steps never appear',
);
// Both branches, not just the one that was already correct.
assert(
  /commitFinancialTransactionV7\(\{[\s\S]*?onDiagnosticStep:\s*step,/.test(expenseBranch),
  'the non-expense branch must pass the local step recorder too',
);

console.log('PASS: phase15-instrument-reachability');

// --- 5. every declared operation must have a real recording site -------------
//
// An operation key that nothing records reports `null` forever and looks like
// "not measured yet" rather than "wired wrong" -- indistinguishable on the
// device, which is how a wasted tier run happens. Derived from the frozen key
// list so adding a fifth key without wiring it fails here.
//
// App.js is searched too: cold_start is recorded at the repo root, outside src/,
// and a search that missed it would report a false defect. That happened while
// writing this test.
const SEARCH_ROOTS = ['src', 'App.js'];
const collectSources = target => {
  const full = path.join(root, target);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [full];
  const out = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    out.push(...collectSources(path.join(target, entry.name)));
  }
  return out;
};
const allSources = SEARCH_ROOTS
  .flatMap(collectSources)
  .filter(file => file.endsWith('.js') && !file.endsWith('performanceTelemetry.js'))
  .map(file => fs.readFileSync(file, 'utf8'));

const telemetryModule = read('src/lib/performanceTelemetry.js');
const declaredKeys = [...telemetryModule.matchAll(/^\s+([A-Z_]+): '([a-z_]+)',$/gm)]
  .map(match => match[1]);
assert.equal(declaredKeys.length, 4, 'expected exactly four declared operations');

for (const key of declaredKeys) {
  const recorded = allSources.some(source => (
    source.includes(`recordOperationDurationV1(PERFORMANCE_OPERATIONS.${key}`)
  ));
  assert(
    recorded,
    `PERFORMANCE_OPERATIONS.${key} is declared but never recorded -- it would report `
    + 'null forever and read as "not measured yet" on the device',
  );
}

console.log('PASS: phase15-instrument-reachability (operations recorded)');
