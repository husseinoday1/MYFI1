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

// Permissions we accept in a release build. Each entry records both its product need and
// its restriction. Anything outside this set fails rather than being waved through.
const ALLOWED_PERMISSIONS = new Set([
  // App lock; Android gates biometric hardware behind its system authentication boundary.
  'android.permission.USE_BIOMETRIC',
  // Compatibility fallback for older biometric APIs; Android enforces the same auth boundary.
  'android.permission.USE_FINGERPRINT',
  // Voice entry only; smart-capture consent runs before Android's runtime microphone prompt.
  'android.permission.RECORD_AUDIO',
  // Voice recorder audio-session configuration only; normal permission, no external component.
  'android.permission.MODIFY_AUDIO_SETTINGS',
  // Supabase and smart-capture HTTPS calls; no exported component gains access from this normal permission.
  'android.permission.INTERNET',
  // React Native's connectivity checks; read-only normal permission with no user data grant.
  'android.permission.ACCESS_NETWORK_STATE',
  // Receipt capture; disclosure precedes the Android runtime camera prompt.
  'android.permission.CAMERA',
  // Local reminders; normal permission and notifications omit financial details when configured.
  'android.permission.VIBRATE',
  // Expo's local reminder scheduler; held only while Android schedules/delivers local work.
  'android.permission.WAKE_LOCK',
  // Receipt/avatar selection through ImagePicker on Android 12 and earlier; maxSdkVersion=32 excludes modern releases.
  'android.permission.READ_EXTERNAL_STORAGE',
  // Legacy camera/image output on Android 9 and earlier; maxSdkVersion=28 excludes scoped-storage releases.
  'android.permission.WRITE_EXTERNAL_STORAGE',
  // User-approved local reminders; Android's runtime notification prompt restricts delivery on Android 13+.
  'android.permission.POST_NOTIFICATIONS',
  // Reschedules local reminders after reboot; Expo's receiver is explicitly non-exported.
  'android.permission.RECEIVE_BOOT_COMPLETED',
]);

// These capabilities are not part of MaalFlow's product. Keep a deny-list as well as the
// allow-list: otherwise a future broad allow-list edit could silently reintroduce one.
const FORBIDDEN_PERMISSIONS = new Set([
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.READ_APP_BADGE',
  'android.permission.DETECT_SCREEN_CAPTURE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.SYSTEM_ALERT_WINDOW',
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
const forbidden = seen.filter(name => FORBIDDEN_PERMISSIONS.has(name));
if (forbidden.length) {
  failures.push(`forbidden permission(s) survived manifest merging:\n    ${forbidden.join('\n    ')}`);
}

// The ImagePicker dependency declares broad legacy storage permissions. They are necessary
// only before the system Photo Picker, so inspect the built APK (not source) for their caps.
const permissionElements = [];
let currentPermission = null;
for (const raw of tree.split(/\r?\n/)) {
  if (/^\s*E: /.test(raw)) {
    currentPermission = /^\s*E: uses-permission(?:-sdk-\d+)? \(line=/.test(raw)
      ? { name: null, maxSdkVersion: null }
      : null;
    if (currentPermission) permissionElements.push(currentPermission);
    continue;
  }
  if (!currentPermission) continue;
  const name = raw.match(/A: android:name\([^)]*\)="([^"]+)"/);
  if (name) currentPermission.name = name[1];
  const maxSdkVersion = raw.match(/A: android:maxSdkVersion\([^)]*\)=(?:\(type [^)]*\))?"?([^"\n]*)"?/);
  if (maxSdkVersion) currentPermission.maxSdkVersion = maxSdkVersion[1].trim();
}
for (const [name, expected] of [
  ['android.permission.READ_EXTERNAL_STORAGE', 32],
  ['android.permission.WRITE_EXTERNAL_STORAGE', 28],
]) {
  const entries = permissionElements.filter(item => item.name === name);
  if (!entries.length) {
    failures.push(`${name} is absent; ImagePicker needs it on legacy Android releases`);
    continue;
  }
  if (entries.some(item => Number.parseInt(item.maxSdkVersion, 0) !== expected)) {
    failures.push(`${name} must be capped at maxSdkVersion=${expected} in the merged manifest`);
  }
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
// The launcher is externally reachable only through its launcher/deep-link filters. AndroidX's
// profile installer must remain exported for system profile installation, but Android restricts
// it with the signature/privileged DUMP permission. Every other export fails closed.
const APPROVED_EXPORTED = new Set([
  // Launcher/deep-link entry point; Android starts it only through declared intent filters.
  'com.maalflow.app.MainActivity',
  // AndroidX baseline-profile installation; guarded by android.permission.DUMP.
  'androidx.profileinstaller.ProfileInstallReceiver',
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
