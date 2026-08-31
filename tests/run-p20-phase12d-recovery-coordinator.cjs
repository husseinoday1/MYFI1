const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/financialBootstrapRecoveryCoordinatorV2.js');
const source = { ok: true, mode: 'v2_bootstrap', ledgerId: 'ledger-coordinator', restoreEpoch: 2, bootstrapId: 'bootstrap-coordinator', manifestHash: 'a'.repeat(64), expectedRowCount: 3 };
const head = { ok: true, ledgerId: 'ledger-coordinator', restoreEpoch: 2, archivePresent: false, archiveGeneration: 0, snapshotId: '', manifestHash: '', expectedRowCount: 0 };
let fetches = 0; let promoted = 0;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === target && request === './financialCloudRecoveryV2') return { fetchVerifiedFinancialCloudRecoverySourceV2: async () => { fetches += 1; return source; } };
  if (parent?.filename === target && request === './financialArchiveSnapshotV2') return { readFinancialArchiveHeadV2: async () => head };
  if (parent?.filename === target && request === './financialBootstrapRecoveryImportV2') return { stageFinancialBootstrapRecoveryImportV2: async () => ({ ok: true, session: { session_id: 'hot' } }) };
  if (parent?.filename === target && request === './financialArchiveRecoveryImportV2') return { stageFinancialArchiveRecoveryImportV2: async () => ({ ok: true, session: { session_id: 'cold' }, head }) };
  if (parent?.filename === target && request === './financialBootstrapRecoveryPromotionV2') return { promoteVerifiedBootstrapRecoveryV2: async input => { promoted += 1; assert.equal(input.bootstrapSessionId, 'hot'); assert.equal(input.archiveSessionId, 'cold'); return { ok: true, promoted: true }; } };
  return originalLoad.call(this, request, parent, isMain);
};
const compiled = new Module(target, module); compiled.filename = target; compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, target);
Module._load = originalLoad;

(async () => {
  const done = await compiled.exports.recoverVerifiedBootstrapWithArchiveV2({ supabase: { rpc: async () => ({}) }, namespace: 'user:coordinator', accountId: 'account-1' });
  assert.equal(done.ok, true); assert.equal(fetches, 2, 'source must be read again immediately before local promotion'); assert.equal(promoted, 1);
  console.log('MYFI P20 PHASE 12-D BOOTSTRAP RECOVERY COORDINATOR: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
