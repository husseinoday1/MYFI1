// Phase 14 §92 — a migration or cutover must resume sync after the maintenance
// barrier releases, the way restore already does. The gap was that
// `resumeSync:false` is hardcoded at the loadLocal/setUser call sites, so a
// migration that ran nested inside one of them left sync paused until the user
// happened to edit something. These cases pin the override, and pin that
// ordinary maintenance calls did NOT change behavior.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const sliceTarget = path.join(root, 'src/store/slices/useSyncSlice.js');
const signalTarget = path.join(root, 'src/lib/financialMaintenanceResumeSignal.js');

const compileRaw = (filename, mocks = {}) => {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === filename && Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    if (parent?.filename === filename && request.startsWith('.')) return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(filename, module);
    compiled.filename = filename;
    compiled.paths = Module._nodeModulePaths(path.dirname(filename));
    compiled._compile(babel.transformFileSync(filename, {
      babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code, filename);
    return compiled.exports;
  } finally {
    Module._load = originalLoad;
  }
};

// The slice and the test must share ONE signal module instance, otherwise the
// test would be raising a signal the slice never sees.
const signal = compileRaw(signalTarget);

// armScheduledCloudSync's real delay is the 1.2s post-edit quiet period. Clamp
// every timer to 0 rather than faking the clock, so ordering still holds.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args);
const settle = () => new Promise(resolve => realSetTimeout(resolve, 15));

const buildSlice = () => {
  const slice = compileRaw(sliceTarget, {
    'react-native': { Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': {},
    'expo-sqlite/kv-store': {},
    '../../lib/ledgerDatabase': { flushLedgerWrites: async () => {} },
    '../../lib/nativeKvQueue': { enqueueNativeKvOperation: async fn => fn?.() },
    '../../lib/automaticSyncInteractionHold': {
      // No finance editor is open in these cases; the hold has its own test.
      isAutomaticSyncInteractionHeld: () => false,
      acquireAutomaticSyncInteractionHold: () => 'hold',
      releaseAutomaticSyncInteractionHold: () => true,
    },
    '../../lib/financialMaintenanceResumeSignal': signal,
    '../../lib/financialMaintenanceBarrier': {
      getFinancialMaintenanceSnapshot: () => ({ blocked: false }),
      isFinancialMaintenanceBlocked: () => false,
      promoteActiveFinancialMaintenancePresentation: () => {},
      // Real ordering: beforeEnter -> task -> afterExit, afterExit always runs.
      runFinancialMaintenanceTask: async (options, task) => {
        if (options?.beforeEnter) await options.beforeEnter({});
        try {
          return await task({});
        } finally {
          if (options?.afterExit) await options.afterExit({});
        }
      },
    },
  });

  const syncCalls = [];
  const state = {
    user: { id: 'account-resume' },
    cfg: { demoMode: false },
    workspaceReady: true,
    workspaceNamespace: 'user:account-resume',
    dirty: true,
    syncCloud: async ({ reason } = {}) => { syncCalls.push(reason); return true; },
  };
  const set = patch => Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  return { api: slice.createSyncSlice(set, () => state), state, syncCalls };
};

const runMaintenance = async ({ options, raise = null, dirty = true }) => {
  const { api, state, syncCalls } = buildSlice();
  state.dirty = dirty;
  signal.__resetMaintenanceResumeSignalForTests();
  await api.runFinancialMaintenance('startup_local_load', async () => {
    // Stand-in for the nested migration/cutover work: it raises the signal
    // from inside the task, exactly where loadLocal/activateFinancialV7Cutover
    // now raise it, while the barrier is still held.
    if (raise) signal.requestMaintenanceResumeSync(raise);
    return true;
  }, options);
  await settle();
  return syncCalls;
};

(async () => {
  // 1) The bug: resumeSync:false with a migration raised inside must still
  //    resume, and must carry the migration's own reason.
  assert.deepEqual(
    await runMaintenance({ options: { resumeSync: false }, raise: 'financial_v7_schema_migration_resume' }),
    ['financial_v7_schema_migration_resume'],
    'a migration nested inside a resumeSync:false call must still resume sync',
  );

  // 2) Cutover reason travels the same way.
  assert.deepEqual(
    await runMaintenance({ options: { resumeSync: false }, raise: 'canonical_cutover_resume' }),
    ['canonical_cutover_resume'],
    'a cutover nested inside a resumeSync:false call must still resume sync',
  );

  // 3) Unchanged behavior: an ordinary resumeSync:false call that raised
  //    nothing stays silent. This is every routine app-open load, and is the
  //    reason the flag exists -- the fix must not turn it into a sync storm.
  assert.deepEqual(
    await runMaintenance({ options: { resumeSync: false } }), [],
    'routine maintenance with nothing to report must not arm a sync',
  );

  // 4) Unchanged behavior: a call that never asked to be suppressed still
  //    resumes under its own reason.
  assert.deepEqual(
    await runMaintenance({ options: {} }), ['startup_local_load'],
    'an ordinary resuming call must keep resuming under its own reason',
  );

  // 5) The dirty gate still applies. A migration on a device with nothing
  //    pending must not force a network round-trip.
  assert.deepEqual(
    await runMaintenance({ options: { resumeSync: false }, raise: 'canonical_cutover_resume', dirty: false }), [],
    'a clean device must not sync just because a migration ran',
  );

  // 6) Repeat action. The signal is module-scope, so the failure mode is it
  //    sticking: a second, unrelated maintenance call inheriting the first
  //    call's resume and syncing when it should not.
  const { api, state, syncCalls } = buildSlice();
  signal.__resetMaintenanceResumeSignalForTests();
  await api.runFinancialMaintenance('startup_local_load', async () => {
    signal.requestMaintenanceResumeSync('canonical_cutover_resume');
    return true;
  }, { resumeSync: false });
  await settle();
  assert.deepEqual(syncCalls, ['canonical_cutover_resume'], 'first cutover resumes');

  state.dirty = true;
  await api.runFinancialMaintenance('startup_local_load', async () => true, { resumeSync: false });
  await settle();
  assert.deepEqual(syncCalls, ['canonical_cutover_resume'],
    'the next routine call must not inherit the previous cutover resume');

  await api.runFinancialMaintenance('startup_local_load', async () => {
    signal.requestMaintenanceResumeSync('canonical_cutover_resume');
    return true;
  }, { resumeSync: false });
  await settle();
  assert.deepEqual(syncCalls, ['canonical_cutover_resume', 'canonical_cutover_resume'],
    'a second real cutover resumes again, identically to the first');

  global.setTimeout = realSetTimeout;
  console.log('MYFI FINANCIAL MAINTENANCE RESUME WIRING: PASSED');
})().catch(error => {
  global.setTimeout = realSetTimeout;
  console.error(error);
  process.exit(1);
});
