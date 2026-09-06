// MYFI — the performance lab must actually stay on outside a __DEV__ build.
//
// Reported from a real device 2026-09-06, the same day the lab was opened up
// in SettingsScreen.js for Phase 15 §96/§98/§100: pressing a tier flickered and
// refused to enter. Signing out did not help, which ruled out auth.
//
// Root cause was a SECOND, independent gate in App.js -- not the one opened in
// Settings. An effect there auto-exits any demoMode it does not recognise as a
// legitimate performance-lab session, and the recognition check was itself
// `__DEV__ && cfg.performanceTestMode === true`. The moment enterDemoMode set
// cfg.demoMode true, this effect re-ran; in a release build __DEV__ is false,
// so the exemption never matched, and exitDemoMode fired in the same tick --
// on then instantly off, which is exactly what read on device as a flicker
// that refuses to enter.
//
// This executes the real effect body against fixtures, and pins the banner
// fix beside it (same stale coupling, different symptom: the "this is test
// data" warning would silently never show in a release build).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'App.js'), 'utf8').replace(/\r\n/g, '\n');

// --- the exit-effect, executed for real --------------------------------------

const effectStart = source.indexOf('  useEffect(() => {\n    // Legacy internal demo data');
assert(effectStart >= 0, 'the demo-mode exit effect is missing -- update this test');
const bodyStart = source.indexOf('if (!ready', effectStart);
const bodyEnd = source.indexOf('  }, [ready, cfg.demoMode', effectStart);
assert(bodyEnd > bodyStart, 'could not isolate the effect body -- update this test');
const body = source.slice(bodyStart, bodyEnd);

const runEffect = ({ dev, ready = true, internalDemoEnabled = false, demoMode, performanceTestMode }) => {
  let exited = false;
  const cfg = { demoMode, performanceTestMode };
  const exitDemoMode = () => { exited = true; return Promise.resolve(); };
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    '__DEV__', 'ready', 'INTERNAL_DEMO_ENABLED', 'cfg', 'exitDemoMode', 'Promise',
    `${body}`,
  );
  fn(dev, ready, internalDemoEnabled, cfg, exitDemoMode, Promise);
  return exited;
};

// THE reported bug, reproduced exactly: a release build (__DEV__ false)
// genuinely inside the performance lab (performanceTestMode true) must not be
// exited the instant it turns on.
assert.equal(
  runEffect({ dev: false, demoMode: true, performanceTestMode: true }),
  false,
  'a release build must not auto-exit a genuine performance-lab session -- this was the flicker',
);

// The same must hold in a dev build, for consistency.
assert.equal(
  runEffect({ dev: true, demoMode: true, performanceTestMode: true }),
  false,
  'a dev build must not auto-exit a genuine performance-lab session either',
);

// What the effect is actually FOR must still work: stray/legacy demoMode that
// is not a real lab session gets exited, in both build types.
assert.equal(
  runEffect({ dev: false, demoMode: true, performanceTestMode: false }),
  true,
  'demoMode without performanceTestMode must still be auto-exited on a release build',
);
assert.equal(
  runEffect({ dev: true, demoMode: true, performanceTestMode: false }),
  true,
  'demoMode without performanceTestMode must still be auto-exited on a dev build',
);

// Not in demo mode at all: nothing to do.
assert.equal(runEffect({ dev: false, demoMode: false, performanceTestMode: false }), false);

// The internal-demo path is untouched: when it is enabled, this effect must
// stay out of the way entirely (its own separate lifecycle owns that case).
assert.equal(
  runEffect({ dev: true, internalDemoEnabled: true, demoMode: true, performanceTestMode: true }),
  false,
  'INTERNAL_DEMO_ENABLED must still short-circuit this effect',
);
// Distinct from performanceTestMode's own exemption: with performanceTestMode
// false, only INTERNAL_DEMO_ENABLED can still be the reason this stays off.
assert.equal(
  runEffect({ dev: true, internalDemoEnabled: true, demoMode: true, performanceTestMode: false }),
  false,
  'INTERNAL_DEMO_ENABLED must own the internal-demo lifecycle regardless of performanceTestMode',
);

// --- the source-level guard: no reintroducing the coupling -------------------

assert.equal(
  /if \(__DEV__ && cfg\.performanceTestMode === true\) return;/.test(source), false,
  'the exemption must not be re-coupled to __DEV__',
);

// --- the banner: same stale coupling, must not silently hide the warning ----

const bannerLine = source.slice(source.indexOf('demoBanner') - 200, source.indexOf('demoBanner') + 50);
assert(
  bannerLine.includes('cfg.performanceTestMode'),
  'the "this is test data" banner must show for a real lab session, not only when INTERNAL_DEMO_ENABLED',
);

console.log('PASS: performance-lab-release-build');
