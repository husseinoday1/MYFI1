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
  const { getFinancialWorkspaceStateV7 } = require('../src/lib/financialLedgerV7Repository');
  const { snapshotFromState, stateFromSnapshot } = require('../src/store/domain');
  const { storeColdArchiveYears, exportColdArchives, clearColdArchives } = require('../src/lib/localArchiveRepository');
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
    const again = await ensurePerformanceTestLedgerV7({
      workspaceNamespace: 'guest', workspace: stateFromSnapshot(JSON.parse(JSON.stringify(snapshotFromState(workspace)))) , coldArchives,
    });
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.alreadyCutover, true);
    const rebuilt = await ensurePerformanceTestLedgerV7({
      workspaceNamespace: 'guest', workspace: stateFromSnapshot(JSON.parse(JSON.stringify(snapshotFromState(workspace)))), coldArchives, forceReplace: true,
    });
    assert.equal(rebuilt.ok, true, JSON.stringify(rebuilt.health || rebuilt));
    for (const table of ['ledger_outbox_v2', 'ledger_outbox_v3', 'ledger_sync_identity_v8']) {
      assert.equal(native.prepare(`SELECT count(*) AS n FROM ${table} WHERE namespace LIKE 'guest::performance-test%'`).get().n, 0, `${table}: lab must not create transport state`);
    }
  }
  // Reproduce a database-wide failure outside the selected fixture. The real
  // invariant checker must still refuse it (never weaken the global FK guard).
  native.exec('CREATE TABLE test_parent(id INTEGER PRIMARY KEY); CREATE TABLE test_orphan(parent_id INTEGER REFERENCES test_parent(id)); PRAGMA foreign_keys=OFF; INSERT INTO test_orphan VALUES(123); PRAGMA foreign_keys=ON;');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { __performanceArchives, ...workspace } = fixture;
    const failed = await ensurePerformanceTestLedgerV7({ workspace, coldArchives: __performanceArchives, forceReplace: true });
    assert.equal(failed.ok, false);
    assert.equal(failed.cutover, false);
    assert.equal(failed.reason, 'financial_v7_health_blocking');
    assert.deepEqual(failed.issueCodes, ['foreign_key_violation']);
    const diagnostic = readPerformanceLedgerAttemptV7();
    assert.equal(diagnostic.tier, '200');
    assert.equal(diagnostic.phase, 'operational_cutover');
    assert.deepEqual(Object.keys(diagnostic).sort(), ['at', 'cutover', 'issueCodes', 'ok', 'phase', 'tier']);
    assert.equal((await getFinancialWorkspaceStateV7({ namespace: 'guest::performance-test' })).source_mode, 'shadow');
  }
  native.exec('DELETE FROM test_orphan');
  console.log('PASS: real SQLite lab entry, saved-snapshot reuse/rebuild, transport isolation, repeated global-health refusal and diagnostic codes');
  native.close();
}
run().catch(error => { console.error(error); process.exitCode = 1; });
