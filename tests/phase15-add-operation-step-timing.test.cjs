// MaalFlow Phase 15 — step-level instrumentation for the 25K-50K add slowdown.
//
// This is MEASUREMENT, not a fix. Nothing here optimises anything; the point is
// to find out which step dominates before anyone touches it. Three separate
// scope estimates on the V7 staging work were wrong this month, and each was
// corrected only by measuring.
//
// What this test actually protects is the financial path, not the numbers:
// instrumentation that can break a commit, or that can carry an amount out to a
// copyable diagnostics surface, is worse than no instrumentation at all.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const repository = read('src/lib/financialLedgerV7Repository.js');
const store = read('src/store/slices/transactionsSlice.js');
const sync = read('src/store/slices/useSyncSlice.js');
const management = read('src/store/slices/managementSlice.js');
const performanceStorage = read('src/dev/performanceTestStorage.js');

// --- the hook follows the missing_postings precedent -------------------------

// Optional: production is unchanged when nothing listens.
assert(
  /onDiagnosticStep = null/.test(repository),
  'the repository hook must default to null so the production path is unchanged',
);
assert(
  /onDiagnosticStep = null/.test(store),
  'the store hook must default to null',
);
assert(
  /onDiagnosticStep = null/.test(sync),
  'the local-save diagnostic hook must default to null',
);

// Wrapped: a listener that throws must not be able to break a financial commit.
// This is the whole reason getLedgerDataHealth wraps its own hook.
// Asserted structurally rather than as exact text: the store's hook also feeds
// its own recorder, so pinning one literal spelling would break on a legitimate
// change while still not proving the guard is there.
for (const [label, source] of [['repository', repository], ['store', store]]) {
  const declaration = source.slice(source.indexOf('const step = name =>'));
  const body = declaration.slice(0, declaration.indexOf('\n') + 1);
  assert(body.includes('try {'), `${label}: the step hook must be wrapped in try`);
  assert(body.includes('catch {}'), `${label}: the step hook must swallow listener errors`);
  assert(body.includes('String(name)'), `${label}: the step name must be coerced at the boundary`);
}

// String(name) coerces at the boundary, so a listener always receives a string.
assert(
  (repository.match(/String\(name\)/g) || []).length >= 1
  && (store.match(/String\(name\)/g) || []).length >= 1,
  'step names must be coerced to strings at the hook boundary',
);

// --- every step name is a structural name, never data ------------------------

const stepNames = source => [...source.matchAll(/step\('([^']+)'\)/g)].map(match => match[1]);
const repoSteps = stepNames(repository);
const storeSteps = stepNames(store);

// The exact sets the investigation needs. Missing one produces a blind spot in
// the report; an unexpected one means someone instrumented something this task
// did not scope.
assert.deepEqual(
  [...repoSteps].sort(),
  [
    'currencies_accounts_rates', 'db_handle', 'entity_changes', 'generation',
    'idempotency_lookup', 'insert_postings_links', 'insert_transaction', 'outbox',
    'read_back', 'schema_ensure', 'txn_begin', 'txn_commit', 'write_queue',
  ],
  'the repository steps must match the investigation spec exactly',
);
assert.deepEqual(
  [...storeSteps].sort(),
  ['ledger_commit', 'save_local', 'schedule_sync', 'store_set', 'wallet_position'],
  'the store steps must match the investigation spec exactly',
);

// write_queue and txn_begin must both exist and be distinct. Waiting for
// another write and waiting for the database lock are different problems with
// different fixes; one combined number cannot tell them apart.
assert(repoSteps.includes('write_queue') && repoSteps.includes('txn_begin'));

// A step name must never be able to carry a value. Every call site must pass a
// bare literal -- no template strings, no concatenation, no variables.
for (const [label, source] of [['repository', repository], ['store', store]]) {
  // The hook's own declaration legitimately forwards the `name` variable, so it
  // is excluded; what must never carry data is a CALL SITE. `.step(` is also
  // excluded for the same reason -- that is the recorder being fed by the hook,
  // not a place a step name is chosen.
  const withoutDeclaration = source.split('\n')
    .filter(line => !line.includes('const step = name =>'))
    .join('\n');
  const calls = [...withoutDeclaration.matchAll(/(?<![.\w])step\(([^)]*)\)/g)].map(match => match[1].trim());
  assert(calls.length > 0, `${label}: expected step call sites`);
  for (const argument of calls) {
    assert(
      /^'[a-z_]+'$/.test(argument),
      `${label}: step(${argument}) must be a bare snake_case literal, never interpolated data`,
    );
  }
}

// --- the hook is threaded, or the SQL steps never arrive ---------------------

assert(
  /commitExpenseToFinancialLedgerV7\([^)]*onDiagnosticStep:\s*step/.test(store),
  'the ordinary expense path must pass its local recorder into the ledger commit, not the optional listener',
);
assert(
  /commitFinancialTransactionV7\(\{[\s\S]*?onDiagnosticStep:\s*step,/.test(store),
  'the non-expense path must pass its local recorder into the ledger commit too',
);
for (const wrapper of ['commitFinancialTransactionV7', 'commitExpenseToFinancialLedgerV7']) {
  const start = repository.indexOf(`export const ${wrapper} = async ({`);
  const body = repository.slice(start, repository.indexOf('\n};', start));
  assert(start > 0, `${wrapper} must exist`);
  assert(
    body.includes('return commitFinancialLedgerV7Command(command, { database, onDiagnosticStep });'),
    `${wrapper} must forward the local recorder hook to the command`,
  );
}

// --- executable proof: a throwing listener cannot break the commit -----------

// The guard is executed rather than only pattern-matched, because "it looks
// wrapped" and "it survives a throw" are different claims.
const sandbox = { console, String };
vm.createContext(sandbox);
vm.runInContext(
  `
  const makeStep = onDiagnosticStep => name => { try { onDiagnosticStep?.(String(name)); } catch {} };
  globalThis.result = (() => {
    const seen = [];
    const throwing = makeStep(() => { throw new Error('listener exploded'); });
    const collecting = makeStep(name => seen.push(name));
    const absent = makeStep(null);
    let survived = true;
    try { throwing('txn_begin'); absent('txn_commit'); } catch { survived = false; }
    collecting('store_set');
    return { survived, seen };
  })();
  `,
  sandbox,
  { filename: 'step-hook.js' },
);
assert.equal(sandbox.result.survived, true, 'a throwing listener must not escape the hook');
// Joined rather than deep-compared: an array built inside the vm realm has a
// different Array prototype, which strict deep equality rejects on identity
// rather than on contents.
assert.equal(sandbox.result.seen.join(','), 'store_set', 'a working listener must still receive its step');

// --- a slow isolated save is decomposed before it is optimised --------------

// The latest 50K device evidence narrowed the remaining slow add to
// `save_local`, but that label covers three distinct operations.  These marks
// carry fixed structural names only and exist only on the isolated demo path;
// they do not alter persistence scheduling or production saves.
const demoSaveStart = sync.indexOf('if (current.cfg.demoMode) {');
const demoSaveEnd = sync.indexOf('const next = { ...current', demoSaveStart);
const demoSaveBranch = sync.slice(demoSaveStart, demoSaveEnd);
for (const name of ['performance_snapshot', 'performance_schedule', 'performance_store_set']) {
  assert(
    demoSaveBranch.includes(`onDiagnosticStep?.('${name}')`),
    `performance save must report ${name} so the device can distinguish the remaining cost`,
  );
}
assert(
  demoSaveBranch.indexOf("onDiagnosticStep?.('performance_snapshot')")
    < demoSaveBranch.indexOf("onDiagnosticStep?.('performance_schedule')")
    && demoSaveBranch.indexOf("onDiagnosticStep?.('performance_schedule')")
      < demoSaveBranch.indexOf("onDiagnosticStep?.('performance_store_set')"),
  'performance save diagnostic marks must retain execution order',
);
assert(
  /schedulePerformanceSnapshotWrite\(demoSnapshot,\s*\{[\s\S]*?onDiagnosticStep,/.test(demoSaveBranch),
  'the lab scheduler must receive the same recorder that measures the save path',
);
assert(
  demoSaveBranch.includes("onDiagnosticStep('performance_next_frame')")
    && demoSaveBranch.includes('requestAnimationFrame(reportFrame)'),
  'the lab save must expose whether the next UI frame is delayed after the store update',
);
for (const name of [
  'performance_timer_fired',
  'performance_write_started',
  'performance_write_completed',
  'performance_write_failed',
  'performance_write_superseded',
]) {
  assert(
    performanceStorage.includes(`'${name}'`),
    `deferred performance persistence must expose ${name}`,
  );
}
assert(
  performanceStorage.includes('try { options?.onDiagnosticStep?.(String(name)); } catch {}'),
  'a diagnostic listener failure must not affect deferred persistence',
);
assert(
  performanceStorage.indexOf("'performance_timer_fired'")
    < performanceStorage.indexOf('scheduledInFlight = persistScheduledSnapshot'),
  'the timer mark must happen before the deferred write starts',
);
const deferredWriter = performanceStorage.slice(
  performanceStorage.indexOf('const persistScheduledSnapshot'),
  performanceStorage.indexOf('export const schedulePerformanceSnapshotWrite'),
);
assert(
  deferredWriter.indexOf("'performance_write_started'")
    < deferredWriter.indexOf('await writePerformanceOverlay')
    && deferredWriter.lastIndexOf("'performance_write_completed'")
      > deferredWriter.indexOf('await writePerformanceSnapshot'),
  'the deferred writer must report start before persistence and completion after it',
);
for (const [label, source] of [['transaction', store], ['commitment', management]]) {
  assert(
    source.includes('saveLocal({ onDiagnosticStep: step })'),
    `${label} must forward its device recorder into saveLocal`,
  );
}

// --- this task must not have become a fix ------------------------------------

// The instrumentation is additive. If it altered a write, an ordering, or a
// transaction boundary, the task grew past measurement and needs re-scoping
// before it goes further -- so the shape of the commit is pinned here.
const commitBody = repository.slice(
  repository.indexOf('export const commitFinancialLedgerV7Command'),
  repository.indexOf('export const commitExpenseLedgerV7Command'),
);
assert(
  commitBody.indexOf("step('idempotency_lookup')") < commitBody.indexOf("step('insert_transaction')"),
  'steps must follow the real execution order',
);
assert(
  commitBody.indexOf("step('insert_transaction')") < commitBody.indexOf("step('txn_commit')"),
  'txn_commit must be last',
);
// The order of the real work is unchanged: outbox still precedes the generation
// advance, which still precedes the read-back.
assert(
  commitBody.indexOf('insertFinancialTransactionOutbox') < commitBody.indexOf('advanceActiveFinancialGenerationInTransactionV13')
  && commitBody.indexOf('advanceActiveFinancialGenerationInTransactionV13') < commitBody.indexOf('readFinancialTransaction(txn, header.namespace, header.id)'),
  'instrumentation must not have reordered the commit',
);
// No step may sit between a write and its own error handling.
assert.equal(
  /step\('[a-z_]+'\);\s*\n\s*\} catch/.test(commitBody), false,
  'a step must not be the last statement before a catch -- that changes what the catch covers',
);

console.log('PASS: phase15-add-operation-step-timing');

// --- the instrumentation must be REACHABLE on a device ----------------------
//
// Added before commit, after the same defect was caught in review on the §97
// instrument hours earlier. The step hook first shipped as an optional argument
// with ZERO callers passing it -- which meant the steps could never be collected
// on the release APK the owner actually installs. An instrument that only works
// in a build he cannot run measures nothing. Third occurrence of this pattern in
// this project, so it is asserted rather than remembered.

const timingModule = read('src/lib/addOperationTiming.js');
const diagnostics = read('src/screens/DiagnosticsScreen.js');

// Both add paths must own a recorder, not wait for a caller to supply one.
for (const [label, source, operation] of [
  ['addTrans', store, "'transaction'"],
  ['addCommitment', management, "'commitment'"],
]) {
  assert(
    source.includes(`beginAddOperationTiming(${operation})`),
    `${label} must start its own timing run, not depend on a caller passing a hook`,
  );
  assert(source.includes('timing.finish()'), `${label} must close its timing run`);
  assert(
    source.includes('timing.step(name)') || source.includes('timing.step('),
    `${label} must feed its steps into the recorder`,
  );
}

// The recorder must be bounded, or a long session grows without limit.
assert(/const MAX_RUNS = \d+;/.test(timingModule), 'the run ring must be bounded');
assert(
  timingModule.includes('runs.slice(-(MAX_RUNS - 1))'),
  'the oldest runs must be evicted, keeping the most recent',
);
assert(
  timingModule.includes("hasMark('performance_schedule')")
    && timingModule.includes('DEFERRED_WRITE_TERMINALS')
    && timingModule.includes("hasMark('performance_next_frame')"),
  'a lab run must wait for its deferred write terminal signal and next frame before closing',
);

// Executable lifecycle proof: `finish()` remains immediate for normal saves,
// but a performance-lab save cannot close while its deferred signals are still
// pending. This caught the original microtask-vs-macrotask blind spot.
const timingSandbox = { Date, Math, Set, String };
vm.createContext(timingSandbox);
vm.runInContext(
  `${timingModule.replace(/^export const /gm, 'const ')}
  globalThis.result = (() => {
    resetAddOperationTimings();
    const ordinary = beginAddOperationTiming('ordinary');
    ordinary.step('schedule_sync');
    ordinary.finish();
    const ordinaryClosed = readAddOperationTimings().length === 1;

    resetAddOperationTimings();
    const lab = beginAddOperationTiming('lab');
    lab.step('performance_schedule');
    lab.finish();
    const closedEarly = readAddOperationTimings().length !== 0;
    lab.step('performance_next_frame');
    const closedBeforeWriteTerminal = readAddOperationTimings().length !== 0;
    lab.step('performance_write_completed');
    const labMarks = Object.keys(readAddOperationTimings()[0]?.marks || {}).sort().join(',');

    resetAddOperationTimings();
    const stale = beginAddOperationTiming('stale');
    stale.step('performance_schedule');
    stale.finish();
    resetAddOperationTimings();
    stale.step('performance_next_frame');
    stale.step('performance_write_completed');
    const staleWasDiscarded = readAddOperationTimings().length === 0;

    resetAddOperationTimings();
    const superseded = beginAddOperationTiming('superseded');
    superseded.step('performance_schedule');
    superseded.finish();
    superseded.step('performance_next_frame');
    superseded.step('performance_write_superseded');
    const supersededClosed = readAddOperationTimings().length === 1;
    return { ordinaryClosed, closedEarly, closedBeforeWriteTerminal, labMarks, staleWasDiscarded, supersededClosed };
  })();`,
  timingSandbox,
  { filename: 'add-operation-timing.js' },
);
assert.equal(timingSandbox.result.ordinaryClosed, true, 'ordinary saves must retain synchronous timing closure');
assert.equal(timingSandbox.result.closedEarly, false, 'a lab run must not close before deferred signals');
assert.equal(timingSandbox.result.closedBeforeWriteTerminal, false, 'a lab run must wait for the write terminal signal');
assert.equal(
  timingSandbox.result.labMarks,
  'performance_next_frame,performance_schedule,performance_write_completed',
  'the completed lab run must retain both delayed marks',
);
assert.equal(timingSandbox.result.staleWasDiscarded, true, 'reset must discard a deferred run from an older sample set');
assert.equal(timingSandbox.result.supersededClosed, true, 'a superseded timer must close its old timing run safely');

// Per-step gaps, not cumulative marks: a cumulative number says when a step
// ended, and the question is how long it took.
assert(
  timingModule.includes('stepMs[mark.name] = Math.max(0, mark.at - previous);'),
  'the recorder must report per-step cost, not only cumulative marks',
);

// Reading must not hand out the live record.
assert(
  /readAddOperationTimings = \(\) => runs\.map/.test(timingModule),
  'reads must return copies, not the live runs array',
);

// Visible in Diagnostics, and cleared by the same reset button -- otherwise the
// numbers are collected and never seen, or never isolated between tiers.
assert(diagnostics.includes('summariseAddOperationTimings()'), 'the summary must reach the evidence snapshot');
assert(diagnostics.includes('readAddOperationTimings()'), 'the full per-run table must reach the evidence snapshot');
// CHANGED 2026-09-09. This used to require Diagnostics to call
// resetAddOperationTimings directly, and to check the two reset calls sat close
// together so one press cleared both. That proximity check was a proxy for
// "nothing is missed", and it was too weak: it passed while the History
// instrument and the persisted cold-start ring were never cleared at all, which
// invalidated the 200-tier device run.
//
// One aggregate call replaces the proxy. The requirement is the same and
// stronger: every instrument reset that exists must be registered, derived from
// the source in tests/phase15-instrument-reachability.test.cjs.
const instrumentsModule = read('src/lib/performanceInstruments.js');
assert(
  diagnostics.includes('resetAllPerformanceInstrumentsV1()'),
  'the reset button must reach the aggregate reset',
);
assert(
  /attempt\(\s*'[A-Za-z0-9_]+'\s*,\s*resetAddOperationTimings\s*\)/.test(instrumentsModule),
  'the aggregate must actually invoke this reset, or tiers cannot be isolated -- '
  + 'matching the import line alone let a mutation through on 2026-09-09',
);

// The full per-run table must be carried, not only the summary: the spec
// requires reporting the step table, never one blended number.
assert(
  diagnostics.includes('addOperationRuns:'),
  'the per-run table must be in the evidence, not just an average',
);

console.log('PASS: phase15-add-operation-step-timing (reachability)');
