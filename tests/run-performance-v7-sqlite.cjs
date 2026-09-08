// Execute the real generator, migration and lab adapter against SQLite.
// Only native platform bindings are replaced; health/parity SQL stays real.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const babel = require('@babel/core');

const native = new DatabaseSync(':memory:');
let stageWorkspaceWriteCount = 0;
let corruptNextStageNamespace = null;
let stageHeaderWrites = [];
const bind = values => values.map(value => value === undefined ? null : value);
const database = {
  execAsync: async sql => native.exec(sql),
  runAsync: async (sql, ...values) => {
    const result = native.prepare(sql).run(...bind(values));
    if (
      sql.includes('INSERT INTO ledger_financial_transactions_v7')
      && sql.includes('VALUES')
      && String(values[0] || '').includes('::shadow-stage::')
    ) {
      stageHeaderWrites.push({ namespace: values[0], rows: values.length / 21 });
    }
    const wroteStageState = sql.includes('INSERT INTO ledger_workspace_state_v7')
        && String(values[0] || '').includes('::shadow-stage::')
        && values[1] === 'shadow';
    if (wroteStageState) {
      stageWorkspaceWriteCount += 1;
      if (corruptNextStageNamespace === values[0]) {
        native.prepare(`DELETE FROM ledger_postings_v7
          WHERE namespace=? AND id=(SELECT id FROM ledger_postings_v7 WHERE namespace=? ORDER BY id LIMIT 1)`)
          .run(values[0], values[0]);
        corruptNextStageNamespace = null;
      }
    }
    return result;
  },
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
  const {
    discardFinancialWorkspaceStageV7,
    getFinancialWorkspaceStateV7,
    proveFinancialLedgerInvariantsV7,
    stageFinancialWorkspaceV7,
  } = require('../src/lib/financialLedgerV7Repository');
  const {
    buildFinancialShadowProjectionV7,
    runFinancialOperationalCutoverV7,
    runFinancialShadowMigrationV7,
  } = require('../src/lib/financialLedgerV7Migration');
  const { snapshotFromState, stateFromSnapshot } = require('../src/store/domain');
  const { storeColdArchiveYears, exportColdArchives, clearColdArchives } = require('../src/lib/localArchiveRepository');
  const verifyRebuild = process.env.MYFI_TEST_VERIFY_REBUILD !== '0';
  const fixture = buildPerformanceTestWorkspace({}, '200');
  // This is a correctness comparison, not a Node performance measurement:
  // batch size 1 reproduces the former one-row statements, while 500 exercises
  // the production batching path against the exact same source projection.
  const batchParityNamespace = 'guest::performance-test::shadow-stage::batch-parity-v7';
  const { __performanceArchives: parityArchives, ...parityWorkspace } = fixture;
  const batchParityProjection = buildFinancialShadowProjectionV7({
    namespace: batchParityNamespace,
    workspace: parityWorkspace,
    coldArchives: parityArchives,
    now: '2026-09-08T00:00:00.000Z',
  });
  const readBatchParityRows = () => ({
    currencies: native.prepare('SELECT * FROM ledger_currencies ORDER BY code').all(),
    accounts: native.prepare('SELECT * FROM ledger_accounts_v7 WHERE namespace=? ORDER BY id').all(batchParityNamespace),
    rates: native.prepare('SELECT * FROM ledger_exchange_rates_v7 WHERE namespace=? ORDER BY id').all(batchParityNamespace),
    transactions: native.prepare('SELECT * FROM ledger_financial_transactions_v7 WHERE namespace=? ORDER BY id').all(batchParityNamespace),
    postings: native.prepare('SELECT * FROM ledger_postings_v7 WHERE namespace=? ORDER BY id').all(batchParityNamespace),
    links: native.prepare('SELECT * FROM ledger_transaction_links_v7 WHERE namespace=? ORDER BY id').all(batchParityNamespace),
    entities: native.prepare('SELECT * FROM ledger_entities_v7 WHERE namespace=? ORDER BY entity_type,id').all(batchParityNamespace),
    workspace: native.prepare(`SELECT namespace,source_mode,schema_version,payload_json
      FROM ledger_workspace_state_v7 WHERE namespace=?`).get(batchParityNamespace),
  });
  await stageFinancialWorkspaceV7({
    stageNamespace: batchParityNamespace,
    commands: batchParityProjection.commands,
    entities: batchParityProjection.entities,
    workspacePayload: batchParityProjection.workspacePayload,
    database,
    batchSize: 1,
  });
  const healthProofPlan = native.prepare(`EXPLAIN QUERY PLAN
    SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 tx
     WHERE tx.namespace=? AND tx.deleted_at IS NULL AND NOT EXISTS (
       SELECT 1 FROM ledger_postings_v7 p
        WHERE p.namespace=tx.namespace AND p.transaction_id=tx.id
     )`).all(batchParityNamespace);
  assert.equal(
    healthProofPlan.some(row => String(row.detail || '').includes('idx_ledger_v7_posting_transaction')),
    true,
    'missing-posting health proof must seek postings by namespace and transaction ID, not rescan them per transaction',
  );
  const singleRowResult = readBatchParityRows();
  await stageFinancialWorkspaceV7({
    stageNamespace: batchParityNamespace,
    commands: batchParityProjection.commands,
    entities: batchParityProjection.entities,
    workspacePayload: batchParityProjection.workspacePayload,
    database,
    batchSize: 500,
  });
  assert.deepEqual(
    readBatchParityRows(),
    singleRowResult,
    'bound multi-row staging must be byte-for-byte equivalent to one-row staging on the same projection',
  );
  await discardFinancialWorkspaceStageV7({ stageNamespace: batchParityNamespace, database });

  // A health failure after stage verification must commit neither a live
  // cutover nor a replayable stage. The unrelated orphan forces that exact
  // branch while the stage itself remains internally valid.
  native.exec('CREATE TABLE stage_session_parent(id INTEGER PRIMARY KEY); CREATE TABLE stage_session_orphan(parent_id INTEGER REFERENCES stage_session_parent(id)); PRAGMA foreign_keys=OFF; INSERT INTO stage_session_orphan VALUES(123); PRAGMA foreign_keys=ON;');
  const failedSessionNamespace = 'guest::stage-session-failure';
  const failedSession = await runFinancialOperationalCutoverV7({
    namespace: failedSessionNamespace,
    workspace: parityWorkspace,
    coldArchives: parityArchives,
    database,
    forceReplace: true,
  });
  assert.equal(failedSession.ok, false, JSON.stringify(failedSession));
  assert.equal(failedSession.reason, 'financial_v7_health_blocking', JSON.stringify(failedSession));
  assert.equal(
    native.prepare("SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace LIKE 'guest::stage-session-failure::shadow-stage::%'").get().n,
    0,
    'failed verification must not leave a promotable stage after the session commits',
  );
  assert.equal(
    native.prepare('SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace=?').get(failedSessionNamespace).n,
    0,
    'failed verification must not change the live workspace',
  );
  native.exec('DELETE FROM stage_session_orphan');

  const standaloneShadowNamespace = 'guest::standalone-shadow-proof';
  const standaloneShadow = await runFinancialShadowMigrationV7({
    namespace: standaloneShadowNamespace,
    workspace: parityWorkspace,
    coldArchives: parityArchives,
    database,
    forceReplace: true,
  });
  assert.equal(standaloneShadow.ok, true, JSON.stringify(standaloneShadow));
  assert.equal(standaloneShadow.migrationReady, true, JSON.stringify(standaloneShadow));
  assert.equal(standaloneShadow.cutover, false, JSON.stringify(standaloneShadow));
  assert.equal(
    native.prepare('SELECT source_mode FROM ledger_workspace_state_v7 WHERE namespace=?').get(standaloneShadowNamespace).source_mode,
    'shadow',
    'standalone shadow proof must not make SQLite operationally authoritative',
  );
  assert.equal(
    native.prepare("SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace LIKE 'guest::standalone-shadow-proof::shadow-stage::%'").get().n,
    0,
    'standalone shadow proof must not leave a promotable stage',
  );

  const parityFailureNamespace = 'guest::stage-session-parity-failure';
  corruptNextStageNamespace = `${parityFailureNamespace}::shadow-stage::v7-cutover`;
  const parityFailure = await runFinancialOperationalCutoverV7({
    namespace: parityFailureNamespace,
    workspace: parityWorkspace,
    coldArchives: parityArchives,
    database,
    forceReplace: true,
  });
  assert.equal(parityFailure.ok, false, JSON.stringify(parityFailure));
  assert.equal(parityFailure.reason, 'final_cutover_parity_failed', JSON.stringify(parityFailure));
  assert.equal(
    native.prepare("SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace LIKE 'guest::stage-session-parity-failure::shadow-stage::%'").get().n,
    0,
    'parity failure must not leave a promotable stage',
  );
  assert.equal(
    native.prepare('SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace=?').get(parityFailureNamespace).n,
    0,
    'parity failure must not change the live workspace',
  );
  for (const cfg of [{}, { demoMode: true }, { performanceTestMode: true }, { demoMode: false, performanceTestMode: true }]) {
    const before = native.prepare('SELECT count(*) AS n FROM sqlite_master').get().n;
    const refused = await ensurePerformanceTestLedgerV7({ workspace: { ...fixture, cfg } });
    assert.equal(refused.reason, 'performance_v7_isolation_required');
    assert.equal(native.prepare('SELECT count(*) AS n FROM sqlite_master').get().n, before, 'invalid isolation must perform no DB work');
  }
  // A first-start preflight must report why it cannot reuse, without exposing
  // rows or falling through into a rebuild with no archive source.
  const missingStateReuseOnly = await ensurePerformanceTestLedgerV7({ workspace: fixture, reuseOnly: true });
  assert.equal(missingStateReuseOnly.ok, false, JSON.stringify(missingStateReuseOnly));
  assert.equal(missingStateReuseOnly.rebuildRequired, true, JSON.stringify(missingStateReuseOnly));
  assert.equal(missingStateReuseOnly.reuseFailureReason, 'performance_v7_reuse_state_missing');

  // The lab's batch-size knob must reach the same bound multi-row writer used
  // by operational cutover. These are structural assertions, not timing claims.
  const assertLabBatchRows = async (tier, batchSize, expectedMaxRows, expectedFullBatchRows) => {
    const { __performanceArchives, ...workspace } = buildPerformanceTestWorkspace({}, tier);
    await clearColdArchives('guest::performance-test');
    if (__performanceArchives.length) {
      await storeColdArchiveYears({ namespace: 'guest::performance-test', archives: __performanceArchives });
    }
    stageHeaderWrites = [];
    const result = await ensurePerformanceTestLedgerV7({
      workspaceNamespace: 'guest',
      workspace,
      coldArchives: await exportColdArchives('guest::performance-test'),
      forceReplace: true,
      batchSize,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    const rows = stageHeaderWrites
      .filter(event => event.namespace === 'guest::performance-test::shadow-stage::v7-cutover')
      .map(event => event.rows);
    assert.ok(rows.length > 0, `lab batchSize=${batchSize} must reach stage header writes`);
    assert.equal(rows.every(count => count >= 1 && count <= expectedMaxRows), true,
      `lab batchSize=${batchSize} must constrain every stage header INSERT to ${expectedMaxRows} rows`);
    assert.equal(rows.includes(expectedFullBatchRows), true,
      `lab batchSize=${batchSize} must produce a full ${expectedFullBatchRows}-row bound INSERT`);
  };
  await assertLabBatchRows('1000', 250, 250, 250);
  await assertLabBatchRows('1000', 5000, 1000, 1000);
  await assertLabBatchRows('200', 0, 1, 1);
  await assertLabBatchRows('200', -1, 1, 1);

  for (const tier of (process.env.MYFI_TEST_TIERS || '200').split(',')) {
    const { __performanceArchives, ...workspace } = buildPerformanceTestWorkspace({}, tier);
    await clearColdArchives('guest::performance-test');
    if (__performanceArchives.length) await storeColdArchiveYears({ namespace: 'guest::performance-test', archives: __performanceArchives });
    const coldArchives = await exportColdArchives('guest::performance-test');
    const stageWritesBeforeCutover = stageWorkspaceWriteCount;
    const result = await ensurePerformanceTestLedgerV7({
      workspaceNamespace: 'guest', workspace, coldArchives, forceReplace: true,
    });
    console.log(JSON.stringify({ tier, ok: result.ok, reason: result.reason, health: result.health }));
    assert.equal(result.ok, true, JSON.stringify(result.health || result));
    assert.equal(
      stageWorkspaceWriteCount - stageWritesBeforeCutover,
      1,
      'performance operational cutover must build exactly one stage',
    );
    assert.equal(
      native.prepare("SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace LIKE 'guest::performance-test::shadow-stage::%'").get().n,
      0,
      'successful operational cutover must consume its verified stage',
    );
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
      const diagnosticSteps = [];
      const reuseOnly = await ensurePerformanceTestLedgerV7({
        workspaceNamespace: 'guest', workspace: stateFromSnapshot(JSON.parse(JSON.stringify(snapshotFromState(workspace)))), reuseOnly: true,
        onDiagnosticStep: step => diagnosticSteps.push(step),
      });
      assert.equal(reuseOnly.ok, true, JSON.stringify(reuseOnly));
      assert.equal(reuseOnly.alreadyCutover, true);
      assert.deepEqual(diagnosticSteps, [
        'state', 'v7_source', 'invalid_dates', 'missing_postings',
        'invalid_transfer_legs', 'posting_currency', 'active_count',
        'outbox', 'wallet_refs', 'complete',
      ], 'startup diagnostics must expose only the fixed V7 reuse-proof steps');
      // A broken V7 stage must remain a non-mutating preflight failure. The
      // final full rebuild below restores the fixture for the next assertion.
      native.exec("DELETE FROM ledger_postings_v7 WHERE namespace='guest::performance-test' AND transaction_id=(SELECT id FROM ledger_financial_transactions_v7 WHERE namespace='guest::performance-test' LIMIT 1)");
      const unhealthyReuseOnly = await ensurePerformanceTestLedgerV7({
        workspaceNamespace: 'guest', workspace: stateFromSnapshot(JSON.parse(JSON.stringify(snapshotFromState(workspace)))), reuseOnly: true,
      });
      assert.equal(unhealthyReuseOnly.ok, false, JSON.stringify(unhealthyReuseOnly));
      assert.equal(unhealthyReuseOnly.rebuildRequired, true, JSON.stringify(unhealthyReuseOnly));
      assert.equal(unhealthyReuseOnly.reuseFailureReason, 'performance_v7_reuse_health_failed');
      assert.ok(unhealthyReuseOnly.issueCodes.includes('transactions_without_postings'), JSON.stringify(unhealthyReuseOnly));
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
  assert.equal(reuseOnlyMiss.reuseFailureReason, 'performance_v7_reuse_tier_mismatch');
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
