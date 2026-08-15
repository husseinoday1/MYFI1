const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
const orientation = fs.readFileSync(path.join(root, 'src/lib/screenOrientation.js'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'docs/MYFI_RELEASE_GATE_STATUS_AR.md'), 'utf8');

assert.equal(app.expo.android.allowBackup, false, 'Expo config must disable Android backup');
assert.match(manifest, /android:allowBackup="false"/, 'Native source manifest must disable Android backup');
assert.doesNotMatch(manifest, /android:screenOrientation="portrait"/, 'Native manifest must not override system/default orientation');
assert.equal(app.expo.orientation, 'default');
assert.match(orientation, /unlockAsync\(\)/, 'System orientation mode must respect device settings');
assert.match(gradle, /release\s*\{[\s\S]*signingConfig signingConfigs\.debug/, 'Current release-signing blocker changed without a dedicated signing gate');
assert.match(gate, /P01-SIGN-001[\s\S]*blocked/, 'Debug release signing must remain explicitly blocked in the release gate');
console.log('MYFI Android native baseline hardening/static audit passed; production signing remains explicitly blocked.');
