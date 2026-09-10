const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const orientation = fs.readFileSync(path.join(root, 'src/lib/screenOrientation.js'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'docs/01_CORE_AUTHORITY/MAALFLOW_RELEASE_GATE_STATUS_AR.md'), 'utf8');

assert.equal(app.expo.android.allowBackup, false, 'Expo config must disable Android backup');
assert.match(manifest, /android:allowBackup="false"/, 'Native source manifest must disable Android backup');
assert.doesNotMatch(manifest, /android:screenOrientation="portrait"/, 'Native manifest must not override system/default orientation');
assert.equal(app.expo.orientation, 'default');
assert.match(orientation, /unlockAsync\(\)/, 'System orientation mode must respect device settings');
// §106. A real production signing path now exists (android/keystore.properties,
// git-ignored, created locally by the app owner -- this repo never holds the real
// keystore or its passwords). These assertions guard the two ways that could quietly
// break: falling through to debug signing even when a real keystore.properties exists
// (shipping an unsigned-for-Play build believing it's the real thing), or the reverse
// -- a fresh checkout / today's CI run, which has no keystore.properties, failing to
// build at all instead of safely producing its existing debug-signed test APK.
assert.match(
  gradle,
  /def releaseSigningReady = keystorePropertiesFile\.exists\(\)/,
  'release signing readiness must be derived from whether the local keystore.properties file exists',
);
assert.match(
  gradle,
  /signingConfig releaseSigningReady \? signingConfigs\.release : signingConfigs\.debug/,
  'release build type must sign with the real keystore when configured, and fall back to debug otherwise',
);
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
assert.match(gitignore, /^android\/keystore\.properties$/m, 'the local keystore.properties file (real passwords) must be git-ignored');
assert.ok(
  fs.existsSync(path.join(root, 'android/keystore.properties.example')),
  'a committed, secret-free template for keystore.properties is missing',
);
assert.doesNotMatch(
  fs.readFileSync(path.join(root, 'android/keystore.properties.example'), 'utf8'),
  /^(storePassword|keyPassword)=(?!CHANGE_ME).+$/m,
  'the committed example file must not carry a real password',
);
assert.match(gate, /P01-SIGN-001[\s\S]*in_progress/, 'P01-SIGN-001 must reflect the conditional signing path, not the old debug-only blocker');
assert.match(gate, /P01-SIGN-001[\s\S]{0,600}لا ادعاء Release Ready/, 'the row must keep explicitly denying Release Ready until a real signed build is verified');

// The committed android/ project overrides app.json, so the two must not drift. During
// the MaalFlow rename they did: app.json said com.maalflow.app while build.gradle, the
// Kotlin package and strings.xml still shipped the previous brand — including app_name,
// the label under the launcher icon.
assert.equal(
  app.expo.android.package,
  'com.maalflow.app',
  'Expo config package changed without updating this contract',
);
assert.match(gradle, /applicationId 'com\.maalflow\.app'/, 'Native applicationId must match app.json');
assert.match(gradle, /namespace 'com\.maalflow\.app'/, 'Native namespace must match app.json');
const strings = fs.readFileSync(path.join(root, 'android/app/src/main/res/values/strings.xml'), 'utf8');
assert.match(
  strings,
  /<string name="app_name">MaalFlow<\/string>/,
  'Launcher label must match the product name; strings.xml is what the user reads under the icon',
);
assert.match(manifest, /android:scheme="maalflow"/, 'Native deep-link scheme must match app.json');
assert.ok(
  fs.existsSync(path.join(root, 'android/app/src/main/java/com/maalflow/app/MainActivity.kt')),
  'Kotlin sources must live under the current package path',
);
assert.ok(
  !fs.existsSync(path.join(root, 'android/app/src/main/java/com/myfi')),
  'Stale package directory left behind by the rename',
);

// §105. Source config is not proof, so the release build must audit the artifact it
// actually produced.
const apkWorkflow = fs.readFileSync(path.join(root, '.github/workflows/p10-014a-normal-apk.yml'), 'utf8');
assert.match(apkWorkflow, /dump xmltree/, 'Release build must extract the merged manifest from the APK');
assert.match(
  apkWorkflow,
  /dump xmltree "\$APK" AndroidManifest\.xml/,
  '§105 must pass AndroidManifest.xml as the aapt asset argument',
);
assert.doesNotMatch(
  apkWorkflow,
  /dump xmltree[^\n]*--file/,
  'aapt dump xmltree does not support --file; it would skip the artifact audit',
);
assert.match(
  apkWorkflow,
  /node tools\/audit-merged-manifest\.cjs/,
  '§105 merged-manifest audit must run in the release build',
);
assert.ok(
  fs.existsSync(path.join(root, 'tools/audit-merged-manifest.cjs')),
  '§105 audit script is missing',
);

console.log('MaalFlow Android native baseline hardening/static audit passed; conditional production signing path verified, no Release Ready claim made.');
