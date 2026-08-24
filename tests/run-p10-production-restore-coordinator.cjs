const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialRestoreProductionV13.js');
const compile = (source) => {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};

const meta = new Map();
const db = {
  async getFirstAsync(sql, ...params) {
    if (sql.includes('SELECT value FROM ledger_v7_meta')) {
      const value = meta.get(params[0]);
      return value === undefined ? null : { value };
    }
    return null;
  },
  async runAsync(sql, ...params) {
    if (sql.includes('UPDATE ledger_v7_meta SET value=')) {
      const [value, , key, expected] = params;
      if (meta.get(key) !== expected) return { changes: 0 };
      meta.set(key, value);
      return { changes: 1 };
    }
    return { changes: 1 };
  },
};

const calls = [];
const deps = {
  decodeCanonicalBackupV11: () => ({ ok: true }),
  stageCanonicalRestoreV11: async () => ({ ok: true }),
  enqueueLedgerWrite: task => task(),
  getLedgerDb: async () => db,
  runLedgerExclusiveTransaction: (database, task) => task(database),
  ensureLedgerSyncIdentityV8: async () => ({ ledgerId: 'ledger', restoreEpoch: 1 }),
  readFinancialSyncProtocolV8: async () => ({ activeProtocolVersion: 2, activatedAt: 'now', ledgerId: 'ledger', restoreEpoch: 1 }),
  CANONICAL_ROW_SOURCE_V3_BATCH_POLICY: { version: 1, defaultMaxRows: 128, defaultMaxBytes: 131072 },
  SEMANTIC_HASH_V3_VERSION: 3,
  RESTORE_SQL_VALIDATOR_V13_VERSION: 1,
  proveRestoreNamespaceSqlV13: async () => ({ ok: true, validatorVersion: 1 }),
  semanticHashNamespaceV3Bounded: async () => 'a'.repeat(64),
  captureRestoreStartSnapshotInTransactionV13: async () => ({}),
  initializeRestoreCheckpointInTransactionV13: async () => ({}),
  copyNextRestoreCheckpointBatchInTransactionV13: async () => ({ status: 'PROVING_CHECKPOINT' }),
  computeRestoreCheckpointProofV13: async () => ({}),
  guardRestoreSourceBeforeEpochRpcInTransactionV13: async () => ({ ok: true, restoreProofDigest: 'b'.repeat(64) }),
  markRestoreCheckpointReadyInTransactionV13: async () => ({ ok: true, checkpoint: {} }),
  readNamespaceManifestCountsV13: async () => ({}),
  writeCanonicalRestoreStageReadinessV13InTransaction: async () => ({}),
  computeReferencedUndoStageProofV13: async () => ({}),
  copyNextReferencedUndoStageBatchInTransactionV13: async () => ({ status: 'PROVING_STAGE' }),
  initializeReferencedUndoStageInTransactionV13: async () => ({}),
  markReferencedUndoStageReadyInTransactionV13: async () => ({}),
  createStrategyBRestoreIntentV13InTransaction: async () => ({}),
  promoteCanonicalRestoreStageV13: async ({ operationId }) => {
    calls.push('promote');
    return { ok: true, ledgerId: 'ledger', restoreEpoch: 2, operationId };
  },
  recordStrategyBServerProofV13InTransaction: async ({ namespace }) => {
    calls.push('record');
    const key = `restore_intent:${namespace}`;
    const current = JSON.parse(meta.get(key));
    const next = { ...current, status: 'server_epoch_proven', stateVersion: current.stateVersion + 1 };
    meta.set(key, JSON.stringify(next));
    return next;
  },
  createSecureUuidV4: () => '11111111-1111-4111-8111-111111111111',
};

let source = fs.readFileSync(filename, 'utf8')
  .replace(/import[\s\S]*?from ['"][^'"]+['"];\r?\n/g, '')
  .replace(/export const /g, 'const ');
source = `const {
${Object.keys(deps).join(',\n')}
} = globalThis.__P10_PRODUCTION_DEPS__;\n${source}\nmodule.exports = {
  resumeCanonicalRestoreProductionV13,
  markCanonicalRestoreActivatedV13,
};\n`;
globalThis.__P10_PRODUCTION_DEPS__ = deps;
const { resumeCanonicalRestoreProductionV13, markCanonicalRestoreActivatedV13 } = compile(source);

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId = '11111111-1111-4111-8111-111111111111';
const namespace = `user:${owner}`;
const pendingIntent = () => ({
  version: 3,
  stateVersion: 1,
  status: 'intent_pending_server',
  namespace,
  authUserId: owner,
  ledgerId: 'ledger',
  fromEpoch: 1,
  toEpoch: 2,
  deviceId: 'device',
  operationId,
  restoreProofDigest: 'b'.repeat(64),
  triggerKind: 'restore',
});

(async () => {
  meta.clear(); calls.length = 0;
  meta.set(`restore_intent:${namespace}`, JSON.stringify(pendingIntent()));
  const success = await resumeCanonicalRestoreProductionV13({
    database: db,
    namespace,
    authUserId: owner,
    adapters: {
      getAuthenticatedUserId: async () => owner,
      advanceRestoreEpoch: async () => {
        calls.push('rpc');
        return { ok: true, outcome: 'advanced' };
      },
    },
  });
  assert.equal(success.ok, true); assert.equal(success.promoted, true);
  assert.deepEqual(calls, ['rpc', 'record', 'promote'],
    'server response must be recorded durably before local promotion');

  meta.clear(); calls.length = 0;
  meta.set(`restore_intent:${namespace}`, JSON.stringify(pendingIntent()));
  const ambiguous = await resumeCanonicalRestoreProductionV13({
    database: db,
    namespace,
    authUserId: owner,
    adapters: {
      getAuthenticatedUserId: async () => owner,
      advanceRestoreEpoch: async () => {
        calls.push('rpc');
        return { ok: false, ambiguous: true, reason: 'restore_epoch_server_outcome_unknown' };
      },
    },
  });
  assert.equal(ambiguous.ok, false); assert.equal(ambiguous.pending, true);
  assert.equal(ambiguous.ambiguous, true); assert.deepEqual(calls, ['rpc']);
  assert.equal(JSON.parse(meta.get(`restore_intent:${namespace}`)).status, 'intent_pending_server',
    'ambiguous server outcome must preserve the exact durable operation');

  meta.clear(); calls.length = 0;
  meta.set(`canonical_restore_promotion_v13:${namespace}`, JSON.stringify({
    version: 1, stateVersion: 3, status: 'local_promoted_pending_reload', namespace,
    operationId, ledgerId: 'ledger', toEpoch: 2, triggerKind: 'undo',
  }));
  const resumedPromotion = await resumeCanonicalRestoreProductionV13({ database: db, namespace, authUserId: owner });
  assert.equal(resumedPromotion.ok, true); assert.equal(resumedPromotion.activationRequired, true);

  const marked = await markCanonicalRestoreActivatedV13({
    database: db,
    namespace,
    operationId,
    activation: { ok: true, protocol: {
      activeProtocolVersion: 2, ledgerId: 'ledger', restoreEpoch: 2, activatedAt: '2026-08-24T00:00:00Z',
    } },
  });
  assert.equal(marked.ok, true);
  assert.equal(JSON.parse(meta.get(`canonical_restore_promotion_v13:${namespace}`)).status, 'v2_activated');
  console.log('MYFI P10 PRODUCTION RESTORE COORDINATOR: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
