// MaalFlow threat-model F-02 — native screen-privacy contract.
// FLAG_SECURE is deliberately native and unconditional: JavaScript startup, an old
// persisted config, or a foreground lifecycle race must never expose financial screens.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const mainActivity = read('android/app/src/main/java/com/maalflow/app/MainActivity.kt');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const app = read('App.js');
const constants = read('src/lib/constants.js');
const settings = read('src/screens/SettingsScreen.js');
const pkg = JSON.parse(read('package.json'));

assert.match(mainActivity, /import android\.view\.WindowManager/, 'MainActivity must import WindowManager for FLAG_SECURE');
assert.match(
  mainActivity,
  /super\.onCreate\(null\)[\s\S]{0,300}window\.setFlags\(\s*WindowManager\.LayoutParams\.FLAG_SECURE,\s*WindowManager\.LayoutParams\.FLAG_SECURE\s*\)/,
  'FLAG_SECURE must be applied immediately after native activity creation',
);

assert.equal(pkg.dependencies['expo-screen-capture'], undefined, 'expo-screen-capture must not return as a dependency');
assert.equal(fs.existsSync(path.join(root, 'src/lib/screenPrivacy.js')), false, 'the JS screen-privacy shim must stay deleted');
assert.equal(app.includes('applyScreenPrivacy'), false, 'App must not rely on a JS lifecycle effect for screen privacy');
assert.equal(constants.includes('allowScreenshots'), false, 'screenshots must not be a user-configurable option');

assert.match(settings, /information-circle-outline/, 'Settings must show a non-interactive privacy information row');
assert.match(settings, /لقطات الشاشة معطّلة/, 'Arabic screen-privacy explanation is missing');
assert.match(settings, /Screenshots are disabled/, 'English screen-privacy explanation is missing');
assert.doesNotMatch(settings, /allowScreenshots/, 'Settings must not expose an opt-out for FLAG_SECURE');

assert.match(
  manifest,
  /READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" tools:replace="android:maxSdkVersion"/,
  'legacy album access must be constrained to Android 12 and earlier in the merged manifest',
);
assert.match(
  manifest,
  /WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" tools:replace="android:maxSdkVersion"/,
  'legacy write access must be constrained to Android 9 and earlier in the merged manifest',
);

console.log('MaalFlow F-02 native screen privacy contract: PASS');
