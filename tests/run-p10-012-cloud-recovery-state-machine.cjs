// Phase 10 Step 12 — execute the production durable coordinator with strict fake
// cloud/V2 adapters and a real SQLite metadata store. P10-010/P10-011 themselves
// remain covered by their operational SQLite tests; this file attacks orchestration.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const compile = (filename, source) => {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};

class AsyncSqlite {
  constructor() { this.native = new DatabaseSync(':memory:'); }
  async execAsync(sql) { this.native.exec(String(sql)); }
  async runAsync(sql, ...params) {
    const result = this.native.prepare(String(sql)).run(...params);
    return { changes: Number(result.changes || 0) };
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async withExclusiveTransactionAsync(task) {
    this.native.exec('BEGIN IMMEDIATE');
    try {
      const result = await task(this);
      this.native.exec('COMMIT');
      return result;
    } catch (error) {
      this.native.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.native.close(); }
}

const database = new AsyncSqlite();
const countKeys = Object.freeze([
  'transactions', 'postings', 'links', 'accounts', 'exchangeRates', 'entities',
  'coldArchiveBundles', 'coldArchiveRecords',
]);
const isCanonicalRestoreOperationIdV11 = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
const deriveCanonicalRestoreProofDigestV11 = ({ operationId, ledgerId, fromEpoch, toEpoch, semanticHash, validatorVersion, counts }) => {
  if (!isCanonicalRestoreOperationIdV11(operationId) || Object.keys(counts || {}).length !== countKeys.length) {
    throw new Error('canonical_restore_proof_input_invalid');
  }
  const ordered = Object.fromEntries(countKeys.map(key => [key, Number(counts[key])]));
  return crypto.createHash('sha256').update(JSON.stringify({
    domain: 'MYFI:P10-012:RESTORE-PROOF:V1', operationId: String(operationId).toLowerCase(),
    ledgerId: String(ledgerId), fromEpoch: Number(fromEpoch), toEpoch: Number(toEpoch),
    semanticHash: String(semanticHash).toLowerCase(), validatorVersion: Number(validatorVersion), counts: ordered,
  })).digest('hex');
};

globalThis.__P10_DB__ = database;
globalThis.__P10_RESTORE_PROOF__ = { deriveCanonicalRestoreProofDigestV11, isCanonicalRestoreOperationIdV11 };
globalThis.__P10_QUEUE__ = task => task();
globalThis.__P10_EXCLUSIVE__ = (db, task) => db.withExclusiveTransactionAsync(task);

const filename = path.join(root, 'src/lib/financialRestoreCloudRecoveryV11.js');
let source = fs.readFileSync(filename, 'utf8')
  .replace(/import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__P10_QUEUE__(task);
const getLedgerDb = async () => globalThis.__P10_DB__;
const runLedgerExclusiveTransaction = (db, task) => globalThis.__P10_EXCLUSIVE__(db, task);`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialRestoreProofV11';/,
    `const { deriveCanonicalRestoreProofDigestV11, isCanonicalRestoreOperationIdV11 } = globalThis.__P10_RESTORE_PROOF__;`)
  .replace(/export const /g, 'const ');
source += `\nmodule.exports = { runCanonicalRestoreCloudRecoveryV11, readCanonicalRestoreCloudRecoveryV11 };\n`;
const { runCanonicalRestoreCloudRecoveryV11, readCanonicalRestoreCloudRecoveryV11 } = compile(filename, source);

const authUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const eventId = '33333333-3333-4333-8333-333333333333';
const counts = Object.freeze({
  transactions: 1, postings: 1, links: 0, accounts: 1, exchangeRates: 0, entities: 0,
  coldArchiveBundles: 1, coldArchiveRecords: 1,
});
const operationFor = (suffix, operationId = '11111111-1111-4111-8111-111111111111') => ({
  namespace: `workspace:p10-012-${suffix}`,
  authUserId,
  ledgerId: `ledger-${suffix}`,
  fromEpoch: 7,
  toEpoch: 8,
  deviceId: 'device-p10-012',
  operationId,
  stageNamespace: `workspace:p10-012-${suffix}::restore-stage::proved`,
  stageProof: { semanticHash: 'a'.repeat(64), counts, validatorVersion: 2 },
});

const readRaw = async (namespace) => {
  const promotion = await database.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=?`, `canonical_restore_promotion_v11:${namespace}`);
  const intent = await database.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=?`, `restore_intent:${namespace}`);
  return JSON.parse((promotion || intent).value);
};
const writeRaw = async (key, state) => database.runAsync(
  `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, key, JSON.stringify(state), new Date().toISOString(),
);

const adaptersFor = (operation, controls = {}) => {
  const calls = controls.calls || { server: 0, promote: 0, reload: 0, activate: 0 };
  return {
    calls,
    preflight: async () => ({
      ok: true, namespace: operation.namespace, authUserId,
      ledgerId: operation.ledgerId, restoreEpoch: operation.fromEpoch,
      activeProtocolVersion: 2, pendingMutationCount: 0, stageReady: true,
      sqliteIntegrity: true, writerQueueDrained: true, storageReady: true,
      maintenanceOwned: controls.maintenanceOwned !== false,
      workspaceAuthorized: controls.workspaceAuthorized !== false,
    }),
    getAuthenticatedUserId: async () => ({ authUserId: controls.sessionUser || authUserId }),
    advanceOrResolveRestoreEpoch: async (request) => {
      calls.server += 1;
      if (controls.server) return controls.server(request, calls.server);
      return {
        ok: true, outcome: 'advanced', eventId, ownerId: authUserId,
        ledgerId: operation.ledgerId, fromEpoch: 7, toEpoch: 8,
        reason: 'backup_restore', deviceId: operation.deviceId,
        operationId: operation.operationId, restoreProofDigest: request.restoreProofDigest,
      };
    },
    promoteCanonicalRestoreStage: async () => {
      calls.promote += 1;
      const intent = await readRaw(operation.namespace);
      await database.withExclusiveTransactionAsync(async txn => {
        await txn.runAsync(`DELETE FROM ledger_v7_meta WHERE key=?`, `restore_intent:${operation.namespace}`);
        await writeRaw(`canonical_restore_promotion_v11:${operation.namespace}`, {
          ...intent, stateVersion: intent.stateVersion + 1,
          status: 'local_promoted_pending_reload', promotedAt: new Date().toISOString(),
        });
      });
      return {
        ok: true, operationId: intent.operationId, restoreProofDigest: intent.restoreProofDigest,
        restoreEpoch: intent.toEpoch,
      };
    },
    reloadCanonicalRestore: async () => {
      calls.reload += 1;
      const state = await readRaw(operation.namespace);
      await writeRaw(`canonical_restore_promotion_v11:${operation.namespace}`, {
        ...state, stateVersion: state.stateVersion + 1,
        status: 'local_reloaded_reconciliation_required', reconciliationRequired: true,
      });
      return { ok: true, operationId: state.operationId, restoreEpoch: state.toEpoch };
    },
    activateRestoreBaselineV2: async ({ onPhase, operationId }) => {
      calls.activate += 1;
      await onPhase('cloud_readback_verified', {
        ledgerId: operation.ledgerId, restoreEpoch: 8, bootstrapId: `bootstrap-${operation.ledgerId}`,
        identityVerified: true, manifestVerified: true, rowCountVerified: true,
      });
      if (!controls.omitShadowPhase) {
        await onPhase('shadow_quiescent', {
          ledgerId: operation.ledgerId, restoreEpoch: 8, pendingAfterSync: 0, conflictCount: 0,
          shadowOnly: true, productionApplyPerformed: false,
        });
      }
      return {
        ok: true, operationId, ledgerId: operation.ledgerId, restoreEpoch: 8,
        activeProtocolVersion: 2, productionApplyPerformed: false,
        readbackVerified: true, shadowQuiescent: true,
      };
    },
  };
};

(async () => {
  await database.execAsync(`CREATE TABLE ledger_v7_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`);

  const dropped = operationFor('dropped');
  const calls = { server: 0, promote: 0, reload: 0, activate: 0 };
  const adapters = adaptersFor(dropped, {
    calls,
    server: async (request, attempt) => attempt === 1
      ? { ok: false, ambiguous: true, reason: 'postgrest_timeout' }
      : {
        ok: true, outcome: 'evidence_resolved', eventId, ownerId: authUserId,
        ledgerId: dropped.ledgerId, fromEpoch: 7, toEpoch: 8, reason: 'backup_restore',
        deviceId: dropped.deviceId, operationId: dropped.operationId,
        restoreProofDigest: request.restoreProofDigest,
      },
  });
  const ambiguous = await runCanonicalRestoreCloudRecoveryV11({ operation: dropped, adapters, database });
  assert.equal(ambiguous.ok, false); assert.equal(ambiguous.status, 'server_outcome_unknown');
  assert.equal(calls.promote, 0, 'an ambiguous server response must never permit local promotion');
  assert.equal((await readRaw(dropped.namespace)).lastErrorCode, 'canonical_restore_cloud_operation_failed',
    'unrecognized adapter details must collapse to an allowlisted generic code');

  const deferred = await runCanonicalRestoreCloudRecoveryV11({ namespace: dropped.namespace, adapters, database });
  assert.equal(deferred.reason, 'canonical_restore_cloud_retry_deferred');
  assert.equal(calls.server, 1, 'durable retry scheduling must suppress immediate repeated Supabase requests');
  const deferredState = await readRaw(dropped.namespace);
  await writeRaw(`restore_intent:${dropped.namespace}`, {
    ...deferredState,
    nextRetryAt: new Date(Date.now() - 1000).toISOString(),
  });
  const resumed = await runCanonicalRestoreCloudRecoveryV11({ namespace: dropped.namespace, adapters, database });
  assert.equal(resumed.ok, true); assert.equal(resumed.status, 'v2_activated');
  assert.deepEqual(calls, { server: 2, promote: 1, reload: 1, activate: 1 });
  const repeated = await runCanonicalRestoreCloudRecoveryV11({ namespace: dropped.namespace, adapters: {}, database });
  assert.equal(repeated.ok, true); assert.equal(repeated.idempotent, true);
  assert.deepEqual(calls, { server: 2, promote: 1, reload: 1, activate: 1 }, 'completed recovery must not repeat side effects');
  console.log('[PASS] dropped server response is resolved by the same operation, then promotes exactly once');

  const publicState = await readCanonicalRestoreCloudRecoveryV11({ namespace: dropped.namespace, database });
  assert.equal(publicState.pending, false);
  assert.equal(Object.hasOwn(publicState.recovery, 'restoreProofDigest'), false);
  assert.equal(Object.hasOwn(publicState.recovery, 'semanticHash'), false);
  assert.equal(Object.hasOwn(publicState.recovery, 'counts'), false);
  console.log('[PASS] bounded recovery diagnostics expose no semantic proof or financial counts');

  const conflict = await runCanonicalRestoreCloudRecoveryV11({
    operation: { ...dropped, operationId: '22222222-2222-4222-8222-222222222222' },
    adapters, database,
  });
  assert.equal(conflict.ok, false); assert.equal(conflict.reason, 'canonical_restore_cloud_operation_conflict');

  const namespaceMismatch = await runCanonicalRestoreCloudRecoveryV11({
    operation: operationFor('mismatch', '66666666-6666-4666-8666-666666666666'),
    namespace: 'user:a-different-namespace', adapters, database,
  });
  assert.equal(namespaceMismatch.reason, 'canonical_restore_cloud_namespace_mismatch');

  const wrongOwnerNamespace = operationFor('wrong-owner', '77777777-7777-4777-8777-777777777777');
  wrongOwnerNamespace.namespace = 'user:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  wrongOwnerNamespace.stageNamespace = `${wrongOwnerNamespace.namespace}::restore-stage::proved`;
  const ownerMismatch = await runCanonicalRestoreCloudRecoveryV11({
    operation: wrongOwnerNamespace, adapters, database,
  });
  assert.equal(ownerMismatch.reason, 'canonical_restore_cloud_operation_invalid');

  const emptyStage = operationFor('empty-stage', '88888888-8888-4888-8888-888888888888');
  emptyStage.stageNamespace = `${emptyStage.namespace}::restore-stage::`;
  const emptyStageResult = await runCanonicalRestoreCloudRecoveryV11({ operation: emptyStage, adapters, database });
  assert.equal(emptyStageResult.reason, 'canonical_restore_cloud_operation_invalid');

  const resumeGuard = operationFor('resume-guard', '99999999-9999-4999-8999-999999999999');
  const resumeGuardCalls = { server: 0, promote: 0, reload: 0, activate: 0 };
  const resumeGuardAdapters = adaptersFor(resumeGuard, {
    calls: resumeGuardCalls,
    server: async () => ({ ok: false, ambiguous: true, reason: 'postgrest_timeout' }),
  });
  await runCanonicalRestoreCloudRecoveryV11({ operation: resumeGuard, adapters: resumeGuardAdapters, database });
  const resumeGuardState = await readRaw(resumeGuard.namespace);
  await writeRaw(`restore_intent:${resumeGuard.namespace}`, {
    ...resumeGuardState, nextRetryAt: new Date(Date.now() - 1000).toISOString(),
  });
  const blockedResume = await runCanonicalRestoreCloudRecoveryV11({
    namespace: resumeGuard.namespace,
    adapters: adaptersFor(resumeGuard, { calls: resumeGuardCalls, maintenanceOwned: false }),
    database,
  });
  assert.equal(blockedResume.reason, 'canonical_restore_cloud_preflight_failed');
  assert.equal(resumeGuardCalls.server, 1,
    'restart without the maintenance owner must not issue another irreversible server request');

  const backoff = operationFor('backoff', 'abababab-abab-4bab-8bab-abababababab');
  const backoffAdapters = adaptersFor(backoff, {
    server: async () => ({ ok: false, ambiguous: true, reason: 'postgrest_timeout', nextRetryAt: new Date(Date.now() + 5000).toISOString() }),
  });
  await runCanonicalRestoreCloudRecoveryV11({ operation: backoff, adapters: backoffAdapters, database });
  const firstBackoff = await readRaw(backoff.namespace);
  await writeRaw(`restore_intent:${backoff.namespace}`, {
    ...firstBackoff, nextRetryAt: new Date(Date.now() - 1000).toISOString(),
  });
  const secondBackoffStartedAt = Date.now();
  await runCanonicalRestoreCloudRecoveryV11({ namespace: backoff.namespace, adapters: backoffAdapters, database });
  const secondBackoff = await readRaw(backoff.namespace);
  assert.equal(secondBackoff.retryCount, 2);
  assert.ok(Date.parse(secondBackoff.nextRetryAt) >= secondBackoffStartedAt + 10000,
    'coordinator must take the longer exponential delay, not the adapter fixed five seconds');
  console.log('[PASS] resume revalidates maintenance ownership and durable backoff grows exponentially');

  const noShadow = operationFor('no-shadow', '22222222-2222-4222-8222-222222222222');
  const noShadowResult = await runCanonicalRestoreCloudRecoveryV11({
    operation: noShadow, adapters: adaptersFor(noShadow, { omitShadowPhase: true }), database,
  });
  assert.equal(noShadowResult.ok, false);
  assert.equal(noShadowResult.reason, 'canonical_restore_cloud_shadow_state_not_proven');
  assert.equal((await readRaw(noShadow.namespace)).status, 'recovery_required');
  console.log('[PASS] activation cannot complete unless durable readback and shadow-quiescence proofs both exist');

  const switched = operationFor('switched', '55555555-5555-4555-8555-555555555555');
  const switchedCalls = { server: 0, promote: 0, reload: 0, activate: 0 };
  const switchedResult = await runCanonicalRestoreCloudRecoveryV11({
    operation: switched,
    adapters: adaptersFor(switched, {
      calls: switchedCalls,
      sessionUser: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }),
    database,
  });
  assert.equal(switchedResult.reason, 'canonical_restore_cloud_original_session_required');
  assert.deepEqual(switchedCalls, { server: 0, promote: 0, reload: 0, activate: 0 });
  console.log('[PASS] an account switch cannot adopt or advance another account restore');

  console.log('MYFI P10-012 CLOUD RECOVERY STATE MACHINE: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => database.close());
