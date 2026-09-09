// MaalFlow threat-model F-02 — screen privacy contract.
//
// The finding is the recent-apps snapshot, not screenshots: balances are visible in the
// app switcher without unlocking the app, so the biometric lock never gets a say. These
// assertions guard the two ways that protection silently disappears — the default
// flipping to unprotected, and the flag being applied once at mount instead of on every
// foreground (the snapshot is taken as the app leaves the foreground).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const lib = read('src/lib/screenPrivacy.js');
const app = read('App.js');
const constants = read('src/lib/constants.js');
const settings = read('src/screens/SettingsScreen.js');
const pkg = JSON.parse(read('package.json'));

// --- the native capability is actually declared ---
assert(
  pkg.dependencies['expo-screen-capture'],
  'expo-screen-capture must be a dependency; FLAG_SECURE is what blanks the snapshot',
);

// --- default is protected, and stays protected for configs predating the setting ---
assert(/allowScreenshots: false/.test(constants), 'screenshots must be blocked by default');
assert(
  /cfg\?\.allowScreenshots !== true/.test(lib),
  'protection must be opt-OUT: an older cfg without the field must read as protected, '
  + 'not as exposed',
);

// --- both branches are wired, not just the protective one ---
assert(lib.includes('preventScreenCaptureAsync'), 'protection call missing');
assert(lib.includes('allowScreenCaptureAsync'), 'opt-out must actually release the flag');

// --- a JS-only runtime degrades instead of crashing ---
assert(
  /try \{\s*ScreenCapture = require\('expo-screen-capture'\);\s*\} catch \{\s*ScreenCapture = null;\s*\}/.test(lib),
  'the native import must be guarded so Expo Go / web degrade to a no-op',
);
assert(
  /if \(!ScreenCapture\) return \{ applied: false, reason: 'unsupported' \};/.test(lib),
  'an unsupported runtime must report that it did nothing rather than claim protection',
);

// --- re-applied on foreground, not only at mount ---
// Scoped to the effect itself. Anchoring on the first `applyScreenPrivacy` would match
// the import statement and sweep in the theme and language effects, which have their own
// AppState listeners — the assertion would then pass no matter what this effect does.
const depsAt = app.indexOf('}, [cfg.allowScreenshots]);');
assert(depsAt > 0, 'the screen-privacy effect must be keyed on cfg.allowScreenshots');
const effectStart = app.lastIndexOf('useEffect(', depsAt);
const effect = app.slice(effectStart, depsAt);
assert(
  effect.includes('applyScreenPrivacy'),
  'the cfg.allowScreenshots effect must be the one applying screen privacy',
);
assert(
  effect.includes('AppState.addEventListener') && effect.includes("state === 'active'"),
  'screen privacy must be re-applied on every foreground, not just once at mount: the '
  + 'recent-apps snapshot is taken as the app leaves the foreground',
);

// --- the user can find and change it ---
assert(
  settings.includes('allowScreenshots'),
  'the setting must be reachable from Settings, not hidden in config',
);
assert(
  /value=\{cfg\.allowScreenshots !== true\}/.test(settings),
  'the Settings switch must read as protection ON, matching the opt-out storage',
);

console.log('MaalFlow F-02 screen privacy contract: PASS');
