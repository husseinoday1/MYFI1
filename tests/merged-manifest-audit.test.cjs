// Unit contract for §105's artifact parser. The production workflow supplies aapt output;
// this fixture keeps permission caps and deny-list handling testable without an Android build.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const audit = path.join(root, 'tools', 'audit-merged-manifest.cjs');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maalflow-manifest-audit-'));
const fixturePath = path.join(tempDir, 'tree.txt');

const permission = (name, maxSdkVersion) => [
  '  E: uses-permission (line=1)',
  `    A: android:name(0x01010003)="${name}"`,
  ...(maxSdkVersion == null ? [] : [`    A: android:maxSdkVersion(0x01010271)=(type 0x10)0x${maxSdkVersion.toString(16)}`]),
].join('\n');

const tree = ({ readCap = 32, extraPermission } = {}) => [
  'E: manifest (line=1)',
  '  A: package="com.maalflow.app"',
  permission('android.permission.READ_EXTERNAL_STORAGE', readCap),
  permission('android.permission.WRITE_EXTERNAL_STORAGE', 28),
  permission('android.permission.RECEIVE_BOOT_COMPLETED'),
  ...(extraPermission ? [permission(extraPermission)] : []),
  '  E: application (line=9)',
  '    A: android:allowBackup(0x01010280)=(type 0x12)0x0',
  '    E: activity (line=10)',
  '      A: android:name(0x01010003)="com.maalflow.app.MainActivity"',
  '      A: android:exported(0x01010010)=(type 0x12)0xffffffff',
  '    E: receiver (line=11)',
  '      A: android:name(0x01010003)="androidx.profileinstaller.ProfileInstallReceiver"',
  '      A: android:exported(0x01010010)=(type 0x12)0xffffffff',
].join('\n');

const run = content => {
  fs.writeFileSync(fixturePath, content, 'utf8');
  return spawnSync(process.execPath, [audit, fixturePath], { encoding: 'utf8' });
};

try {
  const accepted = run(tree());
  assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);

  const uncappedRead = run(tree({ readCap: 33 }));
  assert.notEqual(uncappedRead.status, 0, 'the artifact audit must reject a widened legacy-read cap');
  assert.match(uncappedRead.stderr, /READ_EXTERNAL_STORAGE must be capped at maxSdkVersion=32/);

  const forbiddenService = run(tree({ extraPermission: 'android.permission.FOREGROUND_SERVICE' }));
  assert.notEqual(forbiddenService.status, 0, 'the artifact audit must reject a forbidden merged permission');
  assert.match(forbiddenService.stderr, /FOR?EGROUND_SERVICE/);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('MaalFlow §105 merged-manifest artifact audit contract: PASS');
