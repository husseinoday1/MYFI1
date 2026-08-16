const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const rawArgs = process.argv.slice(2);
const allowedProfiles = Object.freeze({ preview: 'apk', production: 'aab' });
let profile = '';
let dryRun = false;
let checkOnly = false;
const passthrough = [];

for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--dry-run') {
    dryRun = true;
    continue;
  }
  if (arg === '--check') {
    checkOnly = true;
    continue;
  }
  if (arg === '--profile') {
    profile = rawArgs[index + 1] || '';
    index += 1;
    continue;
  }
  if (arg === '--platform' || arg.startsWith('--platform=') || arg.startsWith('--profile=')) {
    console.error('Platform and profile are controlled by MYFI build scripts.');
    process.exit(2);
  }
  passthrough.push(arg);
}

if (!Object.prototype.hasOwnProperty.call(allowedProfiles, profile)) {
  console.error('Use --profile preview or --profile production.');
  process.exit(2);
}

const fallback = path.join(root, 'tools', 'node-userinfo-fallback.cjs');
const easCandidates = [
  path.join(root, 'node_modules', 'eas-cli', 'bin', 'run'),
  path.join(root, 'node_modules', 'eas-cli', 'bin', 'run.js'),
];
const easCli = easCandidates.find(candidate => fs.existsSync(candidate));

if (!fs.existsSync(fallback) || !easCli) {
  console.error('Local EAS CLI is unavailable. Run npm install before building.');
  process.exit(1);
}

const easArgs = [
  '-r', fallback,
  easCli,
  'build',
  '--platform', 'android',
  '--profile', profile,
  ...passthrough,
];
const childEnv = {
  ...process.env,
  EAS_NO_UPDATE_NOTIFIER: '1',
  MYFI_EAS_ARTIFACT: allowedProfiles[profile],
  ...(process.platform === 'win32' && !process.env.SHELL ? { SHELL: 'powershell.exe' } : {}),
};

if (dryRun) {
  console.log(JSON.stringify({
    ok: true,
    platform: 'android',
    profile,
    artifact: allowedProfiles[profile],
    node: process.execPath,
    fallback,
    easCli,
    passthrough,
  }));
  process.exit(0);
}

if (checkOnly) {
  const check = spawnSync(process.execPath, ['-r', fallback, easCli, '--version'], {
    cwd: root,
    stdio: 'inherit',
    env: childEnv,
  });
  process.exit(check.error ? 1 : (check.status ?? 1));
}

const result = spawnSync(process.execPath, easArgs, {
  cwd: root,
  stdio: 'inherit',
  env: childEnv,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
