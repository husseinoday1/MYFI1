const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const run = args => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.devDependencies['eas-cli'], '21.7.0');
assert.equal(pkg.scripts['build:apk'], 'node tools/run-eas-build.cjs --profile preview');
assert.equal(pkg.scripts['build:aab'], 'node tools/run-eas-build.cjs --profile production');
assert.equal(pkg.scripts['build:check'], 'node tools/run-eas-build.cjs --profile preview --check');

const preview = run(['tools/run-eas-build.cjs', '--profile', 'preview', '--dry-run']);
assert.equal(preview.status, 0, preview.stderr);
const previewPlan = JSON.parse(preview.stdout.trim());
assert.equal(previewPlan.platform, 'android');
assert.equal(previewPlan.profile, 'preview');
assert.equal(previewPlan.artifact, 'apk');
assert.match(previewPlan.easCli, /node_modules[\\/]eas-cli[\\/]bin[\\/]run(?:\.js)?$/);

const production = run(['tools/run-eas-build.cjs', '--profile', 'production', '--dry-run', '--non-interactive']);
assert.equal(production.status, 0, production.stderr);
const productionPlan = JSON.parse(production.stdout.trim());
assert.equal(productionPlan.artifact, 'aab');
assert.deepEqual(productionPlan.passthrough, ['--non-interactive']);

const invalid = run(['tools/run-eas-build.cjs', '--profile', 'unsafe', '--dry-run']);
assert.equal(invalid.status, 2);

const fallbackProbe = run(['-e', `
  const os = require('node:os');
  os.userInfo = () => { const error = new Error('probe'); error.code = 'ERR_SYSTEM_ERROR'; throw error; };
  require('./tools/node-userinfo-fallback.cjs');
  const result = os.userInfo();
  if (!result.username || !result.homedir) process.exit(3);
`]);
assert.equal(fallbackProbe.status, 0, fallbackProbe.stderr);

const decision = read('src/components/DecisionModal.js');
const settings = read('src/screens/SettingsScreen.js');
assert.match(decision, /cancelIcon = 'close-outline'/);
assert.match(decision, /confirmIcon = 'checkmark-circle-outline'/);
assert.match(settings, /<DecisionModal[\s\S]*heroIcon="cloud-download-outline"/);
assert.match(settings, /setRestoreConfirmOpen\(true\)/);
assert.doesNotMatch(settings, /const restoreImport = async \(\) => \{[\s\S]{0,500}Alert\.alert/);
const app = read('App.js');
assert.match(app, /<DecisionModal[\s\S]*confirmIcon="checkmark-circle-outline"[\s\S]*cancelIcon="arrow-undo-outline"/);
assert.doesNotMatch(app, /text: ar \? 'رجوع' : 'Roll back',[\s\S]{0,120}style: 'destructive'/);

console.log('MYFI P04R1-004 CRITICAL UX + CONTROLLED EAS BUILD: PASSED');
