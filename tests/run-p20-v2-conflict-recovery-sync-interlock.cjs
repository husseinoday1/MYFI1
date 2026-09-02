// Phase 12 — an active durable conflict-recovery intent must stop every
// automatic sync path before cloud recovery, V1 fallback, or workspace writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const recoveryTarget = path.join(root, 'src/lib/financialV2ConflictRecoveryV1.js');
const sliceTarget = path.join(root, 'src/store/slices/useSyncSlice.js');
const namespace = 'user:sync-interlock';
const accountId = 'account-sync-interlock';
const intentKey = `financial_v2_conflict_recovery_intent_v1:${namespace}`;

const compile = (filename, mocks = {}) => {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === filename && Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    if (parent?.filename === filename && request.startsWith('.')) return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(filename, module);
    compiled.filename = filename;
    compiled.paths = Module._nodeModulePaths(path.dirname(filename));
    compiled._compile(babel.transformFileSync(filename, {
      babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code, filename);
    return compiled.exports;
  } finally {
    Module._load = originalLoad;
  }
};

const recovery = compile(recoveryTarget);

const createIntentDb = intent => {
  const native = new DatabaseSync(':memory:');
  native.exec('CREATE TABLE ledger_v7_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
  if (intent) {
    native.prepare('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)')
      .run(intentKey, JSON.stringify(intent), '2026-09-02T13:00:00.000Z');
  }
  const reads = [];
  return {
    reads,
    async getFirstAsync(sql, ...params) {
      reads.push(String(sql));
      return native.prepare(String(sql)).get(...params) || null;
    },
  };
};

const hasActiveIntent = async intent => {
  const db = createIntentDb(intent);
  const active = await recovery.hasActiveV2ConflictRecoveryIntentV1({ namespace, accountId, database: db });
  assert.ok(db.reads.every(sql => sql.includes('ledger_v7_meta')),
    'the fast gate may read only the durable intent metadata');
  return active;
};

const testIntentGate = async () => {
  for (const status of [
    'ready_for_explicit_cloud_replacement',
    'local_promoted_pending_activation',
  ]) {
    assert.equal(await hasActiveIntent({ accountId, status }), true, `${status} must block automatic sync`);
  }
  assert.equal(await hasActiveIntent({ accountId, status: 'rolled_back_after_activation_failure' }), false,
    'a finished intent must not block ordinary sync');
  assert.equal(await hasActiveIntent({ accountId: 'another-account', status: 'ready_for_explicit_cloud_replacement' }), false,
    'an intent owned by another account must not block this account');
  assert.equal(await hasActiveIntent(null), false, 'an absent intent must not block ordinary sync');
};

const runSyncCloud = async activeIntent => {
  let gateCalls = 0;
  let nextSyncPhaseCalls = 0;
  let workspaceCommitCalls = 0;
  let v1SyncCalls = 0;
  let v2SyncCalls = 0;
  const slice = compile(sliceTarget, {
    'react-native': { Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': {},
    'expo-sqlite/kv-store': {},
    '../../lib/financialMaintenanceBarrier': {
      getFinancialMaintenanceSnapshot: () => {
        nextSyncPhaseCalls += 1;
        return { blocked: true };
      },
      isFinancialMaintenanceBlocked: () => false,
      promoteActiveFinancialMaintenancePresentation: () => {},
      runFinancialMaintenanceTask: async (_name, task) => task(),
    },
    '../../lib/syncErrorClassification': {
      isNeverRetrySyncError: () => false,
      isTransientCloudSyncError: () => false,
      syncDiagnosticCode: () => null,
    },
    '../../lib/activeLedgerRepository': {
      activeLedgerSupported: () => true,
      getLedgerNamespace: value => `ledger:${value}`,
    },
    '../../lib/accountWorkspace': {
      workspaceNamespaceForSession: ({ user }) => `user:${user.id}`,
    },
    '../../lib/financialV2ConflictRecoveryV1': {
      hasActiveV2ConflictRecoveryIntentV1: async input => {
        gateCalls += 1;
        assert.deepEqual(input, { namespace: `ledger:${namespace}`, accountId });
        return activeIntent;
      },
    },
    '../../lib/financialLedgerV7Repository': {
      commitEntityChangesV7: async () => {
        workspaceCommitCalls += 1;
        throw new Error('workspace commit must not be reached in this test');
      },
    },
    '../../lib/financialMutationSync': {
      syncFinancialMutationsV7: async () => {
        v1SyncCalls += 1;
        throw new Error('V1 sync must not be reached in this test');
      },
    },
    '../../lib/financialMutationSyncV2': {
      syncFinancialMutationsV2: async () => {
        v2SyncCalls += 1;
        throw new Error('V2 sync must not be reached in this test');
      },
    },
  });

  const state = {
    user: { id: accountId },
    cfg: { demoMode: false },
    workspaceReady: true,
    workspaceNamespace: namespace,
    financialLedgerV7Cutover: true,
    dirty: false,
  };
  const set = patch => Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  const syncCloud = slice.createSyncSlice(set, () => state).syncCloud;
  const result = await syncCloud({ reason: 'test' });
  return {
    result, state, gateCalls, nextSyncPhaseCalls, workspaceCommitCalls, v1SyncCalls, v2SyncCalls,
  };
};

const testSyncInterlock = async () => {
  for (const status of [
    'ready_for_explicit_cloud_replacement',
    'local_promoted_pending_activation',
  ]) {
    assert.equal(await hasActiveIntent({ accountId, status }), true);
    const blocked = await runSyncCloud(true);
    assert.equal(blocked.result, false);
    assert.equal(blocked.state.lastSyncError, 'financial_v2_conflict_recovery_active');
    assert.equal(blocked.gateCalls, 1);
    assert.equal(blocked.nextSyncPhaseCalls, 0, 'active recovery must stop before cloud-recovery/V1/V2 routing');
    assert.equal(blocked.workspaceCommitCalls, 0);
    assert.equal(blocked.v1SyncCalls, 0);
    assert.equal(blocked.v2SyncCalls, 0);
  }

  for (const intent of [null, { accountId, status: 'rolled_back_after_activation_failure' }]) {
    assert.equal(await hasActiveIntent(intent), false);
    const normal = await runSyncCloud(false);
    assert.equal(normal.gateCalls, 1);
    assert.equal(normal.nextSyncPhaseCalls, 1,
      'an absent or finished intent must continue into the normal sync path');
    assert.equal(normal.workspaceCommitCalls, 0);
    assert.equal(normal.v1SyncCalls, 0);
    assert.equal(normal.v2SyncCalls, 0);
  }
};

const source = fs.readFileSync(sliceTarget, 'utf8');
const syncStart = source.indexOf('syncCloud: async (options = {}) => {');
const gateCall = source.indexOf('hasActiveV2ConflictRecoveryIntentV1', syncStart);
const cloudRecovery = source.indexOf('let cloudRecovery = null;', syncStart);
assert.ok(syncStart >= 0 && gateCall > syncStart && cloudRecovery > gateCall,
  'the durable recovery gate must run before any cloud-recovery/V1/V2 logic');

(async () => {
  await testIntentGate();
  await testSyncInterlock();
  console.log('MYFI P20 V2 CONFLICT RECOVERY SYNC INTERLOCK: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
