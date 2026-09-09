#!/usr/bin/env node
// MaalFlow §105 — merged release manifest audit.
//
// §105 exists because source config is not proof. app.json can say allowBackup=false
// while the shipped artifact says otherwise: a committed android/ directory overrides
// app.json, and any dependency can merge permissions and exported components into the
// final manifest without touching a file we read. This audits what actually shipped.
//
// Usage:
//   aapt dump xmltree app-release.apk AndroidManifest.xml > tree.txt
//   node tools/audit-merged-manifest.cjs tree.txt
//
// Exits non-zero with a readable diff on any violation.

const fs = require('fs');

// Permissions we accept in a release build. Anything outside this set fails the audit
// rather than being waved through: a dependency quietly adding ACCESS_FINE_LOCATION or
// READ_CONTACTS is exactly the surprise this gate is for. Adding an entry here is a
// deliberate act that shows up in review.
const ALLOWED_PERMISSIONS = new Set([
  // Declared in app.json
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  // Added by Expo / React Native runtime and the media pickers we use
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CAMERA',
  'android.permission.VIBRATE',
  'android.permission.WAKE_LOCK',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
]);

const EXPECTED_PACKAGE = 'com.maalflow.app';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/audit-merged-manifest.cjs <aapt-xmltree-output>');
  process.exit(2);
}
const tree = fs.readFileSync(file, 'utf8');
const failures = [];
const notes = [];

// aapt xmltree renders attributes as:  A: android:allowBackup(0x01010280)=(type 0x12)0x0
const attr = name => {
  const re = new RegExp(`A: (?:android:)?${name}\\([^)]*\\)=(?:\\(type [^)]*\\))?"?([^"\\n]*)"?`, 'g');
  return [...tree.matchAll(re)].map(m => m[1].trim());
};

// --- package identity ---
const pkg = attr('package').concat([...tree.matchAll(/A: package="([^"]+)"/g)].map(m => m[1]));
if (!pkg.some(value => value === EXPECTED_PACKAGE)) {
  failures.push(`package is not ${EXPECTED_PACKAGE} (saw: ${pkg.join(', ') || 'nothing'})`);
}

// --- allowBackup=false ---
// aapt encodes booleans as 0x0 (false) / 0xffffffff (true).
const backup = attr('allowBackup');
if (backup.length === 0) {
  failures.push('allowBackup is absent from the merged manifest; it defaults to true');
} else if (backup.some(value => value !== '0x0' && value !== 'false')) {
  failures.push(`allowBackup=false violated in the merged manifest (saw: ${backup.join(', ')})`);
}

// --- orientation must not be pinned ---
const orientation = attr('screenOrientation');
if (orientation.length && orientation.some(value => value !== '0xffffffff' && value !== '-1' && value !== 'unspecified')) {
  failures.push(`merged manifest pins screenOrientation (${orientation.join(', ')}); §107 requires the device setting to be respected`);
}

// --- permissions ---
const permissions = [...tree.matchAll(/A: android:name\([^)]*\)="([^"]+)"/g)]
  .map(m => m[1])
  .filter(name => name.startsWith('android.permission.') || name.startsWith('com.google.android'));
const seen = [...new Set(permissions)];
const unexpected = seen.filter(name => name.startsWith('android.permission.') && !ALLOWED_PERMISSIONS.has(name));
if (unexpected.length) {
  failures.push(`unexpected permission(s) in the merged manifest:\n    ${unexpected.join('\n    ')}`);
}
notes.push(`permissions found: ${seen.length}`);

// --- exported components ---
// Every exported component is reachable by any other app on the device, so the audit
// names them rather than counting them: "3 exported components" is not something a
// reviewer can act on, but "expo.modules.devlauncher.DevLauncherActivity is exported" is.
//
// Walked line by line because aapt's xmltree is indentation-scoped: an `exported`
// attribute belongs to the nearest enclosing E:, and a flat regex cannot tell which.
const exported = [];
{
  let current = null;
  for (const raw of tree.split(/\r?\n/)) {
    const element = raw.match(/^(\s*)E: (\w+) \(line=/);
    if (element) {
      current = { kind: element[2], name: null, exported: false, indent: element[1].length };
      if (['activity', 'service', 'receiver', 'provider', 'activity-alias'].includes(current.kind)) {
        exported.push(current);
      } else {
        current = exported.length ? current : null;
      }
      continue;
    }
    if (!current) continue;
    const name = raw.match(/A: android:name\([^)]*\)="([^"]+)"/);
    if (name && current.name === null) current.name = name[1];
    if (/A: android:exported\([^)]*\)=\(type [^)]*\)0xffffffff/.test(raw)) current.exported = true;
  }
}
const exportedComponents = exported.filter(item => item.exported);
notes.push(`components: ${exported.length}, exported: ${exportedComponents.length}`);
for (const item of exportedComponents) {
  notes.push(`  exported ${item.kind}: ${item.name || '(unnamed)'}`);
}
// Fails closed. The launcher activity is the one component that must be exported; the
// first release build will list whatever else Expo merges in, and each entry gets
// reviewed and added to APPROVED_EXPORTED deliberately rather than by default.
const APPROVED_EXPORTED = new Set([
  'com.maalflow.app.MainActivity',
]);
const unreviewedExports = exportedComponents
  .map(item => item.name || '(unnamed)')
  .filter(name => !APPROVED_EXPORTED.has(name));
if (unreviewedExports.length) {
  failures.push(
    'exported component(s) not in the reviewed set — each is reachable by any other app '
    + `on the device:\n    ${unreviewedExports.join('\n    ')}`,
  );
}

for (const note of notes) console.log(`[note] ${note}`);
if (failures.length) {
  console.error('\n§105 MERGED MANIFEST AUDIT: FAILED');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('§105 MERGED MANIFEST AUDIT: PASSED');
