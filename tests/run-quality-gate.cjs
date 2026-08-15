const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const groupArg = [...args].find(value => value.startsWith('--group='));
const selectedGroup = groupArg ? groupArg.slice('--group='.length) : 'all';
const allowedGroups = new Set(['all', 'static', 'runtime']);

if (!allowedGroups.has(selectedGroup)) {
  console.error(`Unknown quality-gate group: ${selectedGroup}`);
  process.exit(2);
}

const staticContracts = [
  'account-cloud-security.test.cjs',
  'account-profile-v44.test.cjs',
  'account-ux-v45.test.cjs',
  'android-native-baseline.test.cjs',
  'backfill-normalized.test.cjs',
  'backup-restore-hardening.test.cjs',
  'database-archive-ux-v53.test.cjs',
  'database-archive-ux-v531.test.cjs',
  'db-schema.test.cjs',
  'financial-core-phase1.test.cjs',
  'financial-core-phase23.test.cjs',
  'field-regressions-20260814.test.cjs',
  'financial-ledger-v7-contract.test.cjs',
  'financial-ledger-v7-device-harness.test.cjs',
  'financial-ledger-migration-infrastructure.test.cjs',
  'financial-mutation-sync-e2e-contract.test.cjs',
  'financial-safety-r02.test.cjs',
  'entity-currency-r03.test.cjs',
  'shadow-migration-phase5.test.cjs',
  'multicurrency-r03.test.cjs',
  'lifecycle-reset-wallet-search.test.cjs',
  'onboarding-preview.test.cjs',
  'performance-data-lab-v51.test.cjs',
  'performance-data-persistence-v511.test.cjs',
  'phase00-governance.test.cjs',
  'product-readiness-batch7.test.cjs',
  'real-state-consolidated-v5.test.cjs',
  'runtime-hotfix-v42.test.cjs',
  'settings-navigation-v47.test.cjs',
  'settings-runtime-components-v501.test.cjs',
  'supabase-sync-hardening-v4.test.cjs',
  'system-identity-v46.test.cjs',
  'terminology-audit.test.cjs',
  'ui-contract.test.cjs',
];

const legacyContracts = [
  ['design-refinement-v1.test.cjs', 'superseded by account/security V4-V5 contracts and asserts the retired direct vault-delete flow'],
  ['ux-core-v4.test.cjs', 'superseded by unified financial settings and V5 settings contracts'],
  ['ux-logic-correction-v3.test.cjs', 'superseded by the current account/settings information architecture'],
  ['ux-logic-refinement-v2.test.cjs', 'superseded by later tracker and task-based guide UX'],
  ['ux-polish-v43.test.cjs', 'superseded by account V4.4, account UX V4.5, and settings V5.0.1'],
];

const runtimeTests = [
  ['STORE_RUNTIME_WEB', 'financial_core_web_compat', 'run-financial-core.cjs'],
  ['REPOSITORY_RUNTIME_MOCK', 'financial_ledger_v7_atomic_operations_and_shadow_projection', 'run-financial-ledger-v7.cjs'],
  ['SQLITE_SCHEMA_RUNTIME', 'financial_ledger_v7_ddl_and_constraints', 'financial-ledger-v7-schema.test.cjs'],
  ['SCHEMA_MIGRATION_RUNTIME', 'financial_schema_migration_recovery', 'financial-ledger-migration-runtime.test.cjs'],
  ['UNIT_RUNTIME', 'forecasting', 'run-forecasting-fix.cjs'],
  ['UNIT_RUNTIME', 'sync_scenarios', 'run-sync-scenarios.cjs'],
  ['UNIT_RUNTIME', 'sync_core', 'sync-core-v4.test.cjs'],
  ['UNIT_RUNTIME', 'performance_data', 'performance-data-runtime-v512.test.cjs'],
  ['UNIT_RUNTIME', 'performance_generator', 'performance-generator-runtime-v51.test.cjs'],
  ['UNIT_RUNTIME', 'performance_storage', 'performance-storage-runtime-v512.test.cjs'],
];

const checks = [];
if (selectedGroup === 'all' || selectedGroup === 'static') {
  checks.push({
    type: 'JS_JSX_PARSE',
    name: 'full_source_parse',
    command: process.execPath,
    commandArgs: [path.join(root, 'tests', 'full-jsx-parse-phase23.cjs'), root],
  });
  for (const file of staticContracts) {
    checks.push({
      type: 'STATIC_CONTRACT',
      name: file.replace(/\.test\.cjs$/, ''),
      command: process.execPath,
      commandArgs: [path.join(root, 'tests', file), root],
    });
  }
}
if (selectedGroup === 'all' || selectedGroup === 'runtime') {
  for (const [type, name, file] of runtimeTests) {
    checks.push({
      type,
      name,
      command: process.execPath,
      commandArgs: [path.join(root, 'tests', file), root],
    });
  }
}

if (args.has('--include-cloud')) {
  checks.push({
    type: 'CLOUD_SNAPSHOT_INTEGRATION',
    name: 'supabase_snapshot_staging',
    command: process.execPath,
    commandArgs: [path.join(root, 'tests', 'run-cloud-integration.cjs')],
  });
  checks.push({
    type: 'CLOUD_MUTATION_PROTOCOL_E2E',
    name: 'supabase_two_client_mutations',
    command: process.execPath,
    commandArgs: [path.join(root, 'tests', 'run-financial-mutation-sync-e2e.cjs')],
  });
}

if (args.has('--include-android')) {
  checks.push({
    type: 'ANDROID_BUNDLE_EXPORT',
    name: 'expo_android_export',
    command: process.execPath,
    commandArgs: [
      path.join(root, 'node_modules', 'expo', 'bin', 'cli'),
      'export', '--platform', 'android', '--output-dir', 'dist-android-verify', '--clear',
    ],
  });
}

const results = [];
for (const check of checks) {
  const startedAt = Date.now();
  const result = spawnSync(check.command, check.commandArgs, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const durationMs = Date.now() - startedAt;
  const passed = !result.error && result.status === 0;
  results.push({ ...check, status: passed ? 'PASS' : 'FAIL', durationMs });
  console.log(`[${passed ? 'PASS' : 'FAIL'}][${check.type}] ${check.name} (${durationMs} ms)`);
  if (!passed) {
    if (result.error) console.error(result.error.message);
    if (result.stdout?.trim()) console.error(result.stdout.trim());
    if (result.stderr?.trim()) console.error(result.stderr.trim());
  }
}

const skipped = [];
if (selectedGroup === 'all' || selectedGroup === 'static') {
  for (const [name, reason] of legacyContracts) {
    skipped.push(['LEGACY_STATIC_CONTRACT', name, reason]);
  }
}
if (!args.has('--include-cloud')) {
  skipped.push(['CLOUD_SNAPSHOT_INTEGRATION', 'supabase_snapshot_staging', 'requires explicit --include-cloud plus staging credentials, media fixtures, and network']);
  skipped.push(['CLOUD_MUTATION_PROTOCOL_E2E', 'supabase_two_client_mutations', 'requires deployed V7 mutation migration, staging credentials, and network']);
}
if (!args.has('--include-android')) {
  skipped.push(['ANDROID_BUNDLE_EXPORT', 'expo_android_export', 'requires explicit --include-android']);
}
skipped.push(
  ['NATIVE_SQLITE_INTEGRATION', 'expo_sqlite_device', 'internal device harness requires execution from the development runner on Android/iOS hardware'],
  ['TWO_DEVICE_APP_E2E', 'outbox_two_physical_devices', 'requires deployed V7 mutation migration, staging credentials, and two isolated app/device sessions'],
  ['DEVICE_E2E', 'android_user_flows', 'requires a connected Android device or emulator'],
);

for (const [type, name, reason] of skipped) {
  console.log(`[SKIPPED][${type}] ${name}: ${reason}`);
}

const passedCount = results.filter(item => item.status === 'PASS').length;
const failedCount = results.filter(item => item.status === 'FAIL').length;
console.log(`QUALITY GATE SUMMARY: ${passedCount} passed, ${failedCount} failed, ${skipped.length} skipped (group=${selectedGroup})`);

if (failedCount) process.exit(1);
