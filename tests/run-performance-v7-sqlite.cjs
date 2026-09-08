// Execute the real generator, migration and lab adapter against SQLite.
// Only native platform bindings are replaced; health/parity SQL stays real.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const babel = require('@babel/core');

const native = new DatabaseSync(':memory:');
const bind = values => values.map(value => value === undefined ? null : value);
const database = {
  execAsync: async sql => native.exec(sql),
  runAsync: async (sql, ...values) => native.prepare(sql).run(...bind(values)),
  getFirstAsync: async (sql, ...values) => native.prepare(sql).get(...bind(values)) || null,
  getAllAsync: async (sql, ...values) => native.prepare(sql).all(...bind(values)),
  prepareAsync: async sql => {
    const statement = native.prepare(sql);
    return { executeAsync: async values => statement.run(values), finalizeAsync: async () => {} };
  },
  withExclusiveTransactionAsync: async task => {
    native.exec('BEGIN IMMEDIATE');
    try { await task(database); native.exec('COMMIT'); }
    catch (error) { native.exec('ROLLBACK'); throw error; }
  },
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'android' } };
  if (request === 'expo-sqlite') return { openDatabaseAsync: async () => database };
  if (request === 'expo-crypto') return {
    randomUUID: crypto.randomUUID,
    getRandomBytes: size => new Uint8Array(crypto.randomBytes(size)),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_, value) => crypto.createHash('sha256').update(value).digest('hex'),
  };
  return originalLoad.call(this, request, parent, isMain);
};
const originalJs = require.extensions['.js'];
require.extensions['.js'] = (mod, filename) => {
  if (!filename.includes(`${path.sep}src${path.sep}`)) return originalJs(mod, filename);
  mod._compile(babel.transformFileSync(filename, {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code, filename);
};

async function run() {
  const { buildPerformanceTestWorkspace } = require('../src/dev/performanceTestData');
  const { ensurePerformanceTestLedgerV7, readPerformanceLedgerAttemptV7 } = require('../src/dev/performanceTestLedgerV7');
  const { getFinancialWorkspaceStateV7, proveFinancialLedgerInvariantsV7 } = require('../src/lib/financialLedgerV7Repository');
  const { snapshotFromState, stateFromSnapshot } = require('../src/store/domain');
  const { storeColdArchiveYears, exportColdArchives, clearColdArchives } = require('../src/lib/localArchiveRepository');
  const verifyRebuild = process.env.MYFI_TEST_VERIFY_REBUILD !== '0';
  const fixture = buildPerformanceTestWorkspace({}, '200');
  for (const cfg of [{}, { demoMode: true }, { performanceTestMode: true }, { demoMode: false, performanceTestMode: true }]) {
    const before = native.prepare('SELECT count(*) AS n FROM sqlite_master').get().n;
    const refused = await ensurePerformanceTestLedgerV7({ workspace: { ...fixture, cfg } });
    assert.equal(refused.reason, 'performance_v7_isolation_required');
    assert.equal(native.prepare('SELECT count(*) AS n FROM sqlite_master').get().n, before, 'invalid isolation must perform no DB work');
  }
  for (const tier of (process.env.MYFI_TEST_TIERS || '200').split(',')) {
    const { __performanceArchives, ...workspace } = buildPerformanceTestWorkspace({}, tier);
    await clearColdArchives('guest::performance-test');
    if (__performanceArchives.length) await storeColdArchiveYears({ namespace: 'guest::performance-test', archives: __performanceArchives });
    const coldArchives = await exportColdArchives('guest::performance-test');
    const result = await ensurePerformanceTestLedgerV7({
      workspaceNamespace: 'guest', workspace, coldArchives, forceReplace: true,
    });
    console.log(JSON.stringify({ tier, ok: result.ok, reason: result.reason, health: result.health }));
    assert.equal(result.ok, true, JSON.stringify(result.health || result));
    const state = await getFinancialWorkspaceStateV7({ namespace: 'guest::performance-test' });
    assert.equal(state.source_mode, 'sqlite');
    if (verifyRebuild) {
      const again = await ensurePerformanceTestLedgerV7({
        workspaceNamespace: 'guest', workspace: stateFromSnapshot(JSON.parse(JSON.stringify(snapshotFromState(workspace)))) , coldArchives,
      });
      assert.equal(again.ok, true, JSON.stringify(again));
      assert.equal(again.alreadyCutover, true);
      // Cold archives are intentionally absent here.  A proven reuse must not
      // need to hydrate them, and a failed proof must not clear the lab.
      const reuseOnly = await ensurePerformanceTestLedgerV7({
        workspaceNamespace: 'guest', workspace: stateFromSnapshot(JSON.parse(JSON.stringify(snapshotFromState(workspace)))), reuseOnly: true,
      });
      assert.equal(reuseOnly.ok, true, JSON.stringify(reuseOnly));
      assert.equal(reuseOnly.alreadyCutover, true);
      const rebuilt = await ensurePerformanceTestLedgerV7({
        workspaceNamespace: 'guest', workspace: stateFromSnapshot(JSON.parse(JSON.stringify(snapshotFromState(workspace)))), coldArchives, forceReplace: true,
      });
      assert.equal(rebuilt.ok, true, JSON.stringify(rebuilt.health || rebuilt));
    }
    for (const table of ['ledger_outbox_v2', 'ledger_outbox_v3', 'ledger_sync_identity_v8']) {
      assert.equal(native.prepare(`SELECT count(*) AS n FROM ${table} WHERE namespace LIKE 'guest::performance-test%'`).get().n, 0, `${table}: lab must not create transport state`);
    }
  }
  // A tier mismatch on startup is allowed to request a rebuild, but the
  // preflight itself must never start one without cold archives.  Preserve the
  // existing row exactly so a future removal of the reuseOnly guard is caught:
  // that mutation would clear/rebuild this namespace with an empty archive
  // source before returning.
  const stateBeforeReuseOnlyMiss = await getFinancialWorkspaceStateV7({ namespace: 'guest::performance-test' });
  const currentTier = JSON.parse(stateBeforeReuseOnlyMiss.payload_json || '{}')?.cfg?.performanceTestTier;
  const missingTier = String(currentTier) === '5000' ? '10000' : '5000';
  const { __performanceArchives: _missingTierArchives, ...missingTierWorkspace } = buildPerformanceTestWorkspace({}, missingTier);
  const reuseOnlyMiss = await ensurePerformanceTestLedgerV7({
    workspaceNamespace: 'guest', workspace: missingTierWorkspace, reuseOnly: true,
  });
  assert.equal(reuseOnlyMiss.ok, false, JSON.stringify(reuseOnlyMiss));
  assert.equal(reuseOnlyMiss.rebuildRequired, true, JSON.stringify(reuseOnlyMiss));
  assert.equal(reuseOnlyMiss.reason, 'performance_v7_rebuild_required');
  assert.deepEqual(
    await getFinancialWorkspaceStateV7({ namespace: 'guest::performance-test' }),
    stateBeforeReuseOnlyMiss,
    'reuse-only preflight must not clear or rebuild the existing lab without cold archives',
  );
  // Reproduce a database-wide failure outside the selected fixture. The real
  // invariant checker must still refuse it (never weaken the global FK guard),
  // while the isolated performance stage verifies only relations it materializes.
  native.exec('CREATE TABLE test_parent(id INTEGER PRIMARY KEY); CREATE TABLE test_orphan(parent_id INTEGER REFERENCES test_parent(id)); PRAGMA foreign_keys=OFF; INSERT INTO test_orphan VALUES(123); PRAGMA foreign_keys=ON;');
  const globalHealth = await proveFinancialLedgerInvariantsV7({ namespace: 'guest::performance-test' });
  assert.equal(globalHealth.ok, false, 'real cutovers must retain database-wide FK blocking');
  assert.deepEqual(globalHealth.issues.map(issue => issue.code), ['foreign_key_violation']);
  // Supplying the lab-only option must never narrow proof for a real workspace.
  // This catches a future regression that removes or weakens the namespace guard.
  const realWorkspaceNarrowRequest = await proveFinancialLedgerInvariantsV7({
    namespace: 'workspace:real-user',
    foreignKeyScope: 'namespace',
  });
  assert.equal(realWorkspaceNarrowRequest.ok, false, 'a real workspace must not opt into namespace FK proof');
  assert.deepEqual(realWorkspaceNarrowRequest.issues.map(issue => issue.code), ['foreign_key_violation']);
  assert.equal(realWorkspaceNarrowRequest.issues[0].scope, 'database');
  const { __performanceArchives, ...workspace } = fixture;
  const isolated = await ensurePerformanceTestLedgerV7({ workspace, coldArchives: __performanceArchives, forceReplace: true });
  assert.equal(isolated.ok, true, JSON.stringify(isolated.health || isolated));
  assert.equal(isolated.cutover, true);
  assert.equal(readPerformanceLedgerAttemptV7().phase, 'complete');
  assert.equal((await getFinancialWorkspaceStateV7({ namespace: 'guest::performance-test' })).source_mode, 'sqlite');

  // A real FK break inside the namespace being proved must still stop the
  // operation. This is the mutation boundary the lab scope is allowed to use.
  const scopeCheckNamespace = 'scope-check::performance-test::shadow-stage::v7-cutover';
  native.exec(`PRAGMA foreign_keys=OFF; INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at) VALUES ('${scopeCheckNamespace}','orphan','orphan','cash','personal','ZZZ','active','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z'); PRAGMA foreign_keys=ON;`);
  const scopedHealth = await proveFinancialLedgerInvariantsV7({ namespace: scopeCheckNamespace, foreignKeyScope: 'namespace' });
  assert.equal(scopedHealth.ok, false, 'namespace proof must reject an FK violation in its own rows');
  assert.deepEqual(scopedHealth.issues.map(issue => issue.code), ['foreign_key_violation']);
  assert.equal(scopedHealth.issues[0].scope, 'namespace');
  native.exec(`DELETE FROM ledger_accounts_v7 WHERE namespace='${scopeCheckNamespace}';`);
  native.exec('DELETE FROM test_orphan');
  console.log('PASS: real SQLite lab entry, saved-snapshot reuse/rebuild, transport isolation, global real-cutover FK blocking, and namespace-stage FK blocking');
  native.close();
}
run().catch(error => { console.error(error); process.exitCode = 1; });
