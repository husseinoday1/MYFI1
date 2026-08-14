const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const tests = [
  'tests/financial-core-phase1.test.cjs',
  'tests/financial-core-phase23.test.cjs',
  'tests/database-archive-ux-v53.test.cjs',
  'tests/database-archive-ux-v531.test.cjs',
  'tests/settings-runtime-components-v501.test.cjs',
  'tests/sync-core-v4.test.cjs',
  'tests/supabase-sync-hardening-v4.test.cjs',
  'tests/backup-restore-hardening.test.cjs',
  'tests/real-state-consolidated-v5.test.cjs',
  'tests/runtime-hotfix-v42.test.cjs',
  'tests/settings-navigation-v47.test.cjs',
  'tests/ui-contract.test.cjs',
];
for (const rel of tests) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.error(`RELEASE GATE MISSING: ${rel}`);
    process.exit(1);
  }
  console.log(`\n[MYFI RELEASE GATE] ${rel}`);
  const result = spawnSync(process.execPath, [file, root], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`MYFI RELEASE GATE FAILED: ${rel}`);
    process.exit(result.status || 1);
  }
}
console.log('\nMYFI FINANCIAL CORE PHASE 2+3 RELEASE GATE: PASSED');
