// Phase 10 Step 12 — isolated cloud-fenced restore recovery coordinator.
//
// This module owns durable orchestration only. It has no Supabase, Zustand, UI,
// maintenance-fence or production-sync import. Network, promotion, reload and V2
// preactivation are narrow injected adapters so this code remains dormant until
// P10-013/P10-014 explicitly wire and accept a live entrypoint.

import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';
import {
  deriveCanonicalRestoreProofDigestV11,
  isCanonicalRestoreOperationIdV11,
} from './financialRestoreProofV11';

const INTENT_PREFIX = 'restore_intent:';
const PROMOTION_PREFIX = 'canonical_restore_promotion_v11:';
const RESTORE_STAGE_MARKER = '::restore-stage::';
const PRE_SERVER_STATES = new Set(['intent_pending_server', 'server_outcome_unknown']);
const POST_COMMIT_STATES = new Set([
  'local_promoted_pending_reload',
  'local_reloaded_reconciliation_required',
  'cloud_bootstrapping',
  'cloud_readback_verified',
  'shadow_quiescent',
  'recovery_required',
  'v2_activated',
]);
const ACTIVATION_RESUME_STATES = new Set([
  'local_reloaded_reconciliation_required',
  'cloud_bootstrapping',
  'cloud_readback_verified',
  'shadow_quiescent',
  'recovery_required',
]);
const ACTIVE_RUNS = new Set();
const SAFE_ERROR_CODES = new Set([
  'sqlite_unavailable',
  'canonical_restore_cloud_activation_adapter_required',
  'canonical_restore_cloud_activation_failed',
  'canonical_restore_cloud_activation_identity_mismatch',
  'canonical_restore_cloud_activation_phase_invalid',
  'canonical_restore_cloud_activation_proof_invalid',
  'canonical_restore_cloud_activation_state_invalid',
  'canonical_restore_cloud_activation_state_missing',
  'canonical_restore_cloud_local_promotion_failed',
  'canonical_restore_cloud_namespace_mismatch',
  'canonical_restore_cloud_namespace_required',
  'canonical_restore_cloud_operation_conflict',
  'canonical_restore_cloud_operation_failed',
  'canonical_restore_cloud_operation_in_progress',
  'canonical_restore_cloud_operation_invalid',
  'canonical_restore_cloud_original_session_required',
  'canonical_restore_cloud_post_commit_state_invalid',
  'canonical_restore_cloud_preflight_adapter_required',
  'canonical_restore_cloud_preflight_failed',
  'canonical_restore_cloud_promotion_adapter_required',
  'canonical_restore_cloud_readback_proof_invalid',
  'canonical_restore_cloud_recovery_required',
  'canonical_restore_cloud_reload_adapter_required',
  'canonical_restore_cloud_reload_failed',
  'canonical_restore_cloud_retry_deferred',
  'canonical_restore_cloud_server_adapter_required',
  'canonical_restore_cloud_server_outcome_unknown',
  'canonical_restore_cloud_server_proof_invalid',
  'canonical_restore_cloud_shadow_proof_invalid',
  'canonical_restore_cloud_shadow_state_not_proven',
  'canonical_restore_cloud_state_invalid',
  'canonical_restore_cloud_state_missing',
  'canonical_restore_cloud_state_read_failed',
  'canonical_restore_cloud_transition_compare_and_swap_failed',
  'restore_epoch_access_denied',
  'restore_epoch_conflict',
  'restore_epoch_request_invalid',
  'restore_epoch_rpc_rejected',
  'restore_epoch_rpc_proof_invalid',
  'restore_epoch_server_outcome_unknown',
  'restore_epoch_v3_request_invalid',
]);

const text = value => String(value ?? '').trim();
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const intentKey = namespace => `${INTENT_PREFIX}${namespace}`;
const promotionKey = namespace => `${PROMOTION_PREFIX}${namespace}`;
const safeJson = value => {
  try { return JSON.stringify(value); } catch { throw new Error('canonical_restore_cloud_state_invalid'); }
};
const parseObject = value => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const safeErrorCode = value => {
  const code = text(value);
  return SAFE_ERROR_CODES.has(code) ? code : 'canonical_restore_cloud_operation_failed';
};
const failure = (reason, extra = {}) => ({ supported: true, ok: false, reason: safeErrorCode(reason), ...extra });
const fault = async (injector, boundary) => {
  if (typeof injector === 'function') await injector(boundary);
};

const readMeta = async (database, key) => {
  const row = await database.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, key,
  );
  return parseObject(row?.value);
};

const readDurableState = async (database, namespace) => {
  const promotion = await readMeta(database, promotionKey(namespace));
  if (promotion) return { key: promotionKey(namespace), phase: 'post_commit', state: promotion };
  const intent = await readMeta(database, intentKey(namespace));
  if (intent) return { key: intentKey(namespace), phase: 'pre_commit', state: intent };
  return null;
};

const exactOperation = (left, right) => (
  text(left?.namespace) === text(right?.namespace)
  && text(left?.authUserId).toLowerCase() === text(right?.authUserId).toLowerCase()
  && text(left?.ledgerId) === text(right?.ledgerId)
  && Number(left?.fromEpoch) === Number(right?.fromEpoch)
  && Number(left?.toEpoch) === Number(right?.toEpoch)
  && text(left?.operationId).toLowerCase() === text(right?.operationId).toLowerCase()
  && text(left?.restoreProofDigest).toLowerCase() === text(right?.restoreProofDigest).toLowerCase()
);

const validOwnedNamespace = (namespace, authUserId) => {
  const target = text(namespace);
  const owner = text(authUserId).toLowerCase();
  if (target === `user:${owner}`) return true;
  const workspace = /^workspace:([^:]+)$/.exec(target);
  return !!text(workspace?.[1]);
};

const validBoundState = (state, namespace, phase = '') => {
  if (!isObject(state)
      || Number(state.version) !== 2
      || !Number.isInteger(Number(state.stateVersion)) || Number(state.stateVersion) < 1
      || text(state.namespace) !== namespace
      || !isCanonicalRestoreOperationIdV11(state.authUserId)
      || !validOwnedNamespace(namespace, state.authUserId)
      || !isCanonicalRestoreOperationIdV11(state.operationId)
      || !text(state.ledgerId) || !text(state.deviceId)
      || !text(state.stageNamespace).startsWith(`${namespace}${RESTORE_STAGE_MARKER}`)
      || !Number.isInteger(Number(state.fromEpoch)) || Number(state.fromEpoch) < 1
      || !Number.isInteger(Number(state.toEpoch)) || Number(state.toEpoch) !== Number(state.fromEpoch) + 1
      || ![...PRE_SERVER_STATES, 'server_epoch_proven', 'recovery_required', ...POST_COMMIT_STATES].includes(text(state.status))) {
    return false;
  }
  if ((text(state.status) === 'server_epoch_proven' || phase === 'post_commit')
      && !isCanonicalRestoreOperationIdV11(state.serverEventId)) return false;
  try {
    return deriveCanonicalRestoreProofDigestV11({
      operationId: state.operationId,
      ledgerId: state.ledgerId,
      fromEpoch: state.fromEpoch,
      toEpoch: state.toEpoch,
      semanticHash: state.semanticHash,
      validatorVersion: state.validatorVersion,
      counts: state.counts,
    }) === text(state.restoreProofDigest).toLowerCase();
  } catch {
    return false;
  }
};

const operationFromInput = (operation = {}) => {
  const namespace = text(operation.namespace);
  const authUserId = text(operation.authUserId).toLowerCase();
  const ledgerId = text(operation.ledgerId);
  const fromEpoch = Number(operation.fromEpoch);
  const toEpoch = Number(operation.toEpoch);
  const deviceId = text(operation.deviceId);
  const operationId = text(operation.operationId).toLowerCase();
  const stageNamespace = text(operation.stageNamespace);
  const stageProof = isObject(operation.stageProof) ? operation.stageProof : {};
  const stagePrefix = `${namespace}${RESTORE_STAGE_MARKER}`;
  if (!namespace || !isCanonicalRestoreOperationIdV11(authUserId)
      || !validOwnedNamespace(namespace, authUserId)
      || !ledgerId || !deviceId || !isCanonicalRestoreOperationIdV11(operationId)
      || !stageNamespace.startsWith(stagePrefix) || stageNamespace.length <= stagePrefix.length
      || !Number.isInteger(fromEpoch) || fromEpoch < 1
      || !Number.isInteger(toEpoch) || toEpoch !== fromEpoch + 1) {
    throw new Error('canonical_restore_cloud_operation_invalid');
  }
  const semanticHash = text(stageProof.semanticHash).toLowerCase();
  const validatorVersion = Number(stageProof.validatorVersion);
  const counts = stageProof.counts;
  const restoreProofDigest = deriveCanonicalRestoreProofDigestV11({
    operationId, ledgerId, fromEpoch, toEpoch, semanticHash, validatorVersion, counts,
  });
  return {
    version: 2,
    stateVersion: 1,
    status: 'intent_pending_server',
    operation: 'backup_restore',
    namespace,
    authUserId,
    ledgerId,
    fromEpoch,
    toEpoch,
    deviceId,
    operationId,
    stageNamespace,
    semanticHash,
    counts,
    validatorVersion,
    restoreProofDigest,
  };
};

const validPreflight = (result, operation, phase = 'pre_commit') => (
  isObject(result)
  && result.ok === true
  && text(result.namespace) === operation.namespace
  && text(result.authUserId).toLowerCase() === operation.authUserId
  && text(result.ledgerId) === operation.ledgerId
  && Number(result.restoreEpoch) === (phase === 'post_commit' ? operation.toEpoch : operation.fromEpoch)
  && Number(result.activeProtocolVersion) === 2
  && Number(result.pendingMutationCount) === 0
  && (phase === 'post_commit' || result.stageReady === true)
  && result.sqliteIntegrity === true
  && result.writerQueueDrained === true
  && result.storageReady === true
  && result.maintenanceOwned === true
  && result.workspaceAuthorized === true
);

const validServerProof = (result, operation) => (
  isObject(result)
  && result.ok === true
  && ['advanced', 'already_advanced', 'evidence_resolved'].includes(text(result.outcome))
  && isCanonicalRestoreOperationIdV11(result.eventId)
  && text(result.ownerId).toLowerCase() === operation.authUserId
  && text(result.ledgerId) === operation.ledgerId
  && Number(result.fromEpoch) === operation.fromEpoch
  && Number(result.toEpoch) === operation.toEpoch
  && text(result.reason) === 'backup_restore'
  && text(result.deviceId) === operation.deviceId
  && text(result.operationId).toLowerCase() === operation.operationId
  && text(result.restoreProofDigest).toLowerCase() === operation.restoreProofDigest
);

const createIntent = async (database, operation) => enqueueLedgerWrite(() => (
  runLedgerExclusiveTransaction(database, async txn => {
    const existing = await readDurableState(txn, operation.namespace);
    if (existing) {
      if (!exactOperation(existing.state, operation)) {
        throw new Error('canonical_restore_cloud_operation_conflict');
      }
      return existing.state;
    }
    const now = new Date().toISOString();
    const state = { ...operation, createdAt: now, updatedAt: now };
    await txn.runAsync(
      `INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
      intentKey(operation.namespace), safeJson(state), now,
    );
    return state;
  })
));

const compareAndSetState = async ({
  database,
  namespace,
  operationId,
  expectedStateVersion,
  expectedStatuses,
  nextStatus,
  patch = {},
}) => enqueueLedgerWrite(() => runLedgerExclusiveTransaction(database, async txn => {
  const durable = await readDurableState(txn, namespace);
  const current = durable?.state;
  if (!durable || !isObject(current)
      || text(current.operationId).toLowerCase() !== text(operationId).toLowerCase()
      || !expectedStatuses.includes(text(current.status))
      || !Number.isInteger(Number(expectedStateVersion)) || Number(expectedStateVersion) < 1
      || Number(current.stateVersion) !== Number(expectedStateVersion)) {
    throw new Error('canonical_restore_cloud_transition_compare_and_swap_failed');
  }
  const now = new Date().toISOString();
  const next = {
    ...current,
    ...patch,
    status: nextStatus,
    stateVersion: Number(current.stateVersion) + 1,
    updatedAt: now,
  };
  await txn.runAsync(
    `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
    durable.key, safeJson(next), now,
  );
  return next;
}));

const markRecoveryRequired = async ({ database, state, reason, patch = {} }) => {
  if (!state || text(state.status) === 'v2_activated') return state;
  try {
    return await compareAndSetState({
      database,
      namespace: text(state.namespace),
      operationId: text(state.operationId),
      expectedStateVersion: Number(state.stateVersion),
      expectedStatuses: [text(state.status)],
      nextStatus: 'recovery_required',
      patch: {
        resumeStatus: text(state.status),
        lastErrorCode: safeErrorCode(reason),
        reconciliationRequired: true,
        ...patch,
      },
    });
  } catch {
    return state;
  }
};

const requireOriginalSession = async (adapter, state) => {
  if (typeof adapter !== 'function') return false;
  try {
    const current = await adapter();
    return text(current?.authUserId ?? current).toLowerCase() === text(state.authUserId).toLowerCase();
  } catch {
    return false;
  }
};

const continueOperation = async ({ namespace, adapters, database, faultInjector }) => {
  let durable = await readDurableState(database, namespace);
  if (!durable) return failure('canonical_restore_cloud_state_missing');
  if (!validBoundState(durable.state, namespace, durable.phase)) return failure('canonical_restore_cloud_state_invalid');
  let state = durable.state;

  if (durable.phase === 'pre_commit' && PRE_SERVER_STATES.has(text(state.status))) {
    const retryAtMs = Date.parse(text(state.nextRetryAt));
    if (text(state.status) === 'server_outcome_unknown'
        && Number.isFinite(retryAtMs) && retryAtMs > Date.now()) {
      return failure('canonical_restore_cloud_retry_deferred', {
        pending: true,
        status: text(state.status),
        operationId: state.operationId,
        nextRetryAt: state.nextRetryAt,
      });
    }
    const sessionMatches = await requireOriginalSession(adapters.getAuthenticatedUserId, state);
    if (!sessionMatches) {
      return failure('canonical_restore_cloud_original_session_required', { pending: true, status: text(state.status) });
    }
    if (typeof adapters.advanceOrResolveRestoreEpoch !== 'function') {
      return failure('canonical_restore_cloud_server_adapter_required');
    }
    let serverResult;
    try {
      serverResult = await adapters.advanceOrResolveRestoreEpoch({
        ownerId: state.authUserId,
        ledgerId: state.ledgerId,
        fromEpoch: Number(state.fromEpoch),
        toEpoch: Number(state.toEpoch),
        deviceId: state.deviceId,
        operationId: state.operationId,
        restoreProofDigest: state.restoreProofDigest,
        reason: 'backup_restore',
      });
    } catch (error) {
      serverResult = {
        ok: false,
        ambiguous: true,
        reason: safeErrorCode(error?.code || error?.message || 'canonical_restore_cloud_server_outcome_unknown'),
      };
    }
    await fault(faultInjector, 'after_server_response_before_proof_state');
    if (!validServerProof(serverResult, state)) {
      if (serverResult?.ambiguous === true) {
        const retryCount = Math.max(0, Number(state.retryCount) || 0) + 1;
        const boundedDelayMs = Math.min(60000, 5000 * (2 ** Math.min(retryCount - 1, 4)));
        const jitterSeed = [...text(state.operationId)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const durableRetryMs = Date.now() + boundedDelayMs + ((jitterSeed * retryCount) % 1001);
        const suppliedRetryMs = Date.parse(text(serverResult.nextRetryAt));
        const nextRetryAt = new Date(Math.max(
          durableRetryMs,
          Number.isFinite(suppliedRetryMs) ? suppliedRetryMs : 0,
        )).toISOString();
        state = await compareAndSetState({
          database, namespace, operationId: state.operationId,
          expectedStateVersion: Number(state.stateVersion),
          expectedStatuses: [text(state.status)], nextStatus: 'server_outcome_unknown',
          patch: {
            lastErrorCode: safeErrorCode(serverResult.reason || 'canonical_restore_cloud_server_outcome_unknown'),
            nextRetryAt,
            retryCount,
          },
        });
        return failure('canonical_restore_cloud_server_outcome_unknown', {
          pending: true, status: state.status, operationId: state.operationId,
        });
      }
      state = await markRecoveryRequired({
        database, state,
        reason: serverResult?.reason || 'canonical_restore_cloud_server_proof_invalid',
      });
      return failure(serverResult?.reason || 'canonical_restore_cloud_server_proof_invalid', {
        pending: true, status: state.status, operationId: state.operationId,
      });
    }
    state = await compareAndSetState({
      database, namespace, operationId: state.operationId,
      expectedStateVersion: Number(state.stateVersion),
      expectedStatuses: [text(state.status)], nextStatus: 'server_epoch_proven',
      patch: {
        serverEventId: text(serverResult.eventId).toLowerCase(),
        serverProvedAt: serverResult.provedAt || new Date().toISOString(),
        lastErrorCode: null,
        nextRetryAt: null,
        retryCount: Number(state.retryCount) || 0,
      },
    });
    await fault(faultInjector, 'after_server_proof');
    durable = await readDurableState(database, namespace);
  }

  if (durable?.phase === 'pre_commit' && text(durable.state.status) === 'recovery_required') {
    return failure(durable.state.lastErrorCode || 'canonical_restore_cloud_recovery_required', {
      pending: true, status: 'recovery_required', operationId: durable.state.operationId,
    });
  }

  if (durable?.phase === 'pre_commit' && text(durable.state.status) === 'server_epoch_proven') {
    state = durable.state;
    if (typeof adapters.promoteCanonicalRestoreStage !== 'function') {
      return failure('canonical_restore_cloud_promotion_adapter_required');
    }
    const promoted = await adapters.promoteCanonicalRestoreStage({
      namespace: state.namespace,
      stageNamespace: state.stageNamespace,
      stageProof: {
        semanticHash: state.semanticHash,
        counts: state.counts,
        validatorVersion: Number(state.validatorVersion),
      },
      expectedFromEpoch: Number(state.fromEpoch),
      toEpoch: Number(state.toEpoch),
      database,
    });
    if (!promoted?.ok
        || text(promoted.operationId).toLowerCase() !== text(state.operationId).toLowerCase()
        || text(promoted.restoreProofDigest).toLowerCase() !== text(state.restoreProofDigest).toLowerCase()
        || Number(promoted.restoreEpoch) !== Number(state.toEpoch)) {
      return failure(promoted?.reason || 'canonical_restore_cloud_local_promotion_failed', {
        pending: true, status: 'server_epoch_proven', operationId: state.operationId,
      });
    }
    await fault(faultInjector, 'after_local_promotion');
    durable = await readDurableState(database, namespace);
  }

  if (!durable || durable.phase !== 'post_commit' || !POST_COMMIT_STATES.has(text(durable.state.status))) {
    return failure('canonical_restore_cloud_post_commit_state_invalid');
  }
  state = durable.state;
  if (text(state.status) === 'v2_activated') {
    return {
      supported: true, ok: true, complete: true, idempotent: true,
      namespace, operationId: state.operationId, ledgerId: state.ledgerId,
      restoreEpoch: Number(state.toEpoch), status: state.status,
    };
  }

  if (text(state.status) === 'local_promoted_pending_reload') {
    if (typeof adapters.reloadCanonicalRestore !== 'function') {
      return failure('canonical_restore_cloud_reload_adapter_required');
    }
    const reloaded = await adapters.reloadCanonicalRestore({ namespace, database });
    if (!reloaded?.ok
        || text(reloaded.operationId).toLowerCase() !== text(state.operationId).toLowerCase()
        || Number(reloaded.restoreEpoch) !== Number(state.toEpoch)) {
      return failure(reloaded?.reason || 'canonical_restore_cloud_reload_failed', {
        pending: true, status: text(state.status), operationId: state.operationId,
      });
    }
    await fault(faultInjector, 'after_local_reload');
    durable = await readDurableState(database, namespace);
    state = durable?.state;
  }

  if (!state || !ACTIVATION_RESUME_STATES.has(text(state.status))) {
    return failure('canonical_restore_cloud_activation_state_invalid');
  }
  const sessionMatches = await requireOriginalSession(adapters.getAuthenticatedUserId, state);
  if (!sessionMatches) {
    return failure('canonical_restore_cloud_original_session_required', {
      pending: true, status: text(state.status), operationId: state.operationId,
    });
  }
  if (typeof adapters.activateRestoreBaselineV2 !== 'function') {
    return failure('canonical_restore_cloud_activation_adapter_required');
  }

  let activationStartStatus = text(state.status);
  if (activationStartStatus === 'local_reloaded_reconciliation_required') {
    activationStartStatus = 'cloud_bootstrapping';
  } else if (activationStartStatus === 'recovery_required') {
    activationStartStatus = ['cloud_bootstrapping', 'cloud_readback_verified', 'shadow_quiescent']
      .includes(text(state.resumeStatus)) ? text(state.resumeStatus) : 'cloud_bootstrapping';
  }
  if (text(state.status) !== activationStartStatus) {
    state = await compareAndSetState({
      database, namespace, operationId: state.operationId,
      expectedStateVersion: Number(state.stateVersion),
      expectedStatuses: [text(state.status)], nextStatus: activationStartStatus,
      patch: { reconciliationRequired: true, lastErrorCode: null },
    });
  }
  await fault(faultInjector, 'after_cloud_bootstrap_state');
  let activationCursor = state;

  const onPhase = async (phase, evidence = {}) => {
    const nextStatus = text(phase);
    if (!['cloud_readback_verified', 'shadow_quiescent'].includes(nextStatus)) {
      throw new Error('canonical_restore_cloud_activation_phase_invalid');
    }
    if (text(evidence.ledgerId) !== text(state.ledgerId)
        || Number(evidence.restoreEpoch) !== Number(state.toEpoch)) {
      throw new Error('canonical_restore_cloud_activation_identity_mismatch');
    }
    if (nextStatus === 'cloud_readback_verified'
        && (!text(evidence.bootstrapId)
          || evidence.identityVerified !== true
          || evidence.manifestVerified !== true
          || evidence.rowCountVerified !== true)) {
      throw new Error('canonical_restore_cloud_readback_proof_invalid');
    }
    if (nextStatus === 'shadow_quiescent'
        && (Number(evidence.pendingAfterSync) !== 0
          || Number(evidence.conflictCount) !== 0
          || evidence.shadowOnly !== true
          || evidence.productionApplyPerformed !== false)) {
      throw new Error('canonical_restore_cloud_shadow_proof_invalid');
    }
    // An idempotent bootstrap adapter may replay an earlier proof after restart.
    // Never regress a stronger durable state; accept the weaker callback as an
    // already-satisfied prerequisite and keep the stronger proof untouched.
    if (nextStatus === 'cloud_readback_verified'
        && text(activationCursor.status) === 'shadow_quiescent') {
      return activationCursor;
    }
    const expected = nextStatus === 'cloud_readback_verified'
      ? ['cloud_bootstrapping', 'cloud_readback_verified']
      : ['cloud_readback_verified', 'shadow_quiescent'];
    if (!expected.includes(text(activationCursor.status))) {
      throw new Error('canonical_restore_cloud_activation_state_missing');
    }
    if (text(activationCursor.status) === nextStatus) return activationCursor;
    const next = await compareAndSetState({
      database, namespace, operationId: state.operationId,
      expectedStateVersion: Number(activationCursor.stateVersion),
      expectedStatuses: [text(activationCursor.status)], nextStatus,
      patch: {
        bootstrapId: text(evidence.bootstrapId) || activationCursor.bootstrapId || null,
        cloudEvidenceAt: evidence.verifiedAt || new Date().toISOString(),
      },
    });
    activationCursor = next;
    await fault(faultInjector, nextStatus === 'cloud_readback_verified'
      ? 'after_cloud_readback_state' : 'after_shadow_quiescent_state');
    return next;
  };

  let activated;
  try {
    activated = await adapters.activateRestoreBaselineV2({
      namespace,
      authUserId: state.authUserId,
      ledgerId: state.ledgerId,
      restoreEpoch: Number(state.toEpoch),
      operationId: state.operationId,
      restoreProofDigest: state.restoreProofDigest,
      allowProductionApply: false,
      resumeFromStatus: activationStartStatus,
      onPhase,
    });
  } catch (error) {
    const current = await readDurableState(database, namespace);
    state = await markRecoveryRequired({ database, state: current?.state, reason: error?.message });
    return failure(error?.message || 'canonical_restore_cloud_activation_failed', {
      pending: true, status: text(state?.status), operationId: state?.operationId,
    });
  }
  await fault(faultInjector, 'after_v2_activation_before_state');
  if (!activated?.ok
      || Number(activated.activeProtocolVersion) !== 2
      || activated.productionApplyPerformed !== false
      || activated.readbackVerified !== true
      || activated.shadowQuiescent !== true
      || text(activated.operationId).toLowerCase() !== text(state.operationId).toLowerCase()
      || text(activated.ledgerId) !== text(state.ledgerId)
      || Number(activated.restoreEpoch) !== Number(state.toEpoch)) {
    const current = await readDurableState(database, namespace);
    state = await markRecoveryRequired({
      database, state: current?.state,
      reason: activated?.reason || 'canonical_restore_cloud_activation_proof_invalid',
    });
    return failure(activated?.reason || 'canonical_restore_cloud_activation_proof_invalid', {
      pending: true, status: text(state?.status), operationId: state?.operationId,
    });
  }
  const current = await readDurableState(database, namespace);
  if (text(current?.state?.status) !== 'shadow_quiescent'
      || Number(current?.state?.stateVersion) !== Number(activationCursor.stateVersion)) {
    state = await markRecoveryRequired({
      database, state: current?.state,
      reason: 'canonical_restore_cloud_shadow_state_not_proven',
    });
    return failure('canonical_restore_cloud_shadow_state_not_proven', {
      pending: true, status: text(state?.status), operationId: state?.operationId,
    });
  }
  state = await compareAndSetState({
    database, namespace, operationId: state.operationId,
    expectedStateVersion: Number(activationCursor.stateVersion),
    expectedStatuses: [text(current?.state?.status)], nextStatus: 'v2_activated',
    patch: {
      reconciliationRequired: false,
      activatedAt: activated.activatedAt || new Date().toISOString(),
      lastErrorCode: null,
    },
  });
  return {
    supported: true, ok: true, complete: true, idempotent: false,
    namespace, operationId: state.operationId, ledgerId: state.ledgerId,
    restoreEpoch: Number(state.toEpoch), status: state.status,
  };
};

/**
 * Start or resume one proof-bound restore. Starting requires a complete local
 * preflight; resuming reads the durable operation and never invents another ID.
 */
export const runCanonicalRestoreCloudRecoveryV11 = async ({
  operation = null,
  namespace = '',
  adapters = {},
  database = null,
  faultInjector = null,
} = {}) => {
  let normalizedOperation = null;
  if (operation) {
    try {
      normalizedOperation = operationFromInput(operation);
    } catch (error) {
      return failure(error?.message || 'canonical_restore_cloud_operation_invalid');
    }
  }
  let target = text(namespace || normalizedOperation?.namespace);
  if (!target) return failure('canonical_restore_cloud_namespace_required');
  if (normalizedOperation && target !== normalizedOperation.namespace) {
    return failure('canonical_restore_cloud_namespace_mismatch');
  }
  if (ACTIVE_RUNS.has(target)) return failure('canonical_restore_cloud_operation_in_progress', { pending: true });
  ACTIVE_RUNS.add(target);
  try {
    const db = database || await getLedgerDb();
    if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
    const existing = await readDurableState(db, target);
    if (existing && !validBoundState(existing.state, target, existing.phase)) {
      return failure('canonical_restore_cloud_state_invalid');
    }
    if (normalizedOperation) {
      if (existing && !exactOperation(existing.state, normalizedOperation)) {
        return failure('canonical_restore_cloud_operation_conflict');
      }
      if (!existing) {
        if (typeof adapters.preflight !== 'function') {
          return failure('canonical_restore_cloud_preflight_adapter_required');
        }
        const preflight = await adapters.preflight({ ...normalizedOperation, resumePhase: 'pre_commit' });
        if (!validPreflight(preflight, normalizedOperation, 'pre_commit')) {
          return failure(preflight?.reason || 'canonical_restore_cloud_preflight_failed');
        }
        await createIntent(db, normalizedOperation);
        await fault(faultInjector, 'after_intent');
      }
    } else if (!existing) {
      return failure('canonical_restore_cloud_state_missing');
    }
    if (existing && text(existing.state.status) !== 'v2_activated') {
      if (typeof adapters.preflight !== 'function') {
        return failure('canonical_restore_cloud_preflight_adapter_required');
      }
      const resumedPreflight = await adapters.preflight({
        ...existing.state,
        resumePhase: existing.phase,
      });
      if (!validPreflight(resumedPreflight, existing.state, existing.phase)) {
        return failure(resumedPreflight?.reason || 'canonical_restore_cloud_preflight_failed');
      }
    }
    return await continueOperation({
      namespace: target, adapters, database: db, faultInjector,
    });
  } catch (error) {
    return failure(error?.message || 'canonical_restore_cloud_operation_failed');
  } finally {
    ACTIVE_RUNS.delete(target);
  }
};

/** Read identifiers/status only; no financial proof inputs or payloads are returned. */
export const readCanonicalRestoreCloudRecoveryV11 = async ({ namespace, database = null } = {}) => {
  const target = text(namespace);
  if (!target) return failure('canonical_restore_cloud_namespace_required');
  try {
    const db = database || await getLedgerDb();
    if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
    const durable = await readDurableState(db, target);
    if (!durable) return { supported: true, ok: true, pending: false, recovery: null };
    if (!validBoundState(durable.state, target, durable.phase)) {
      return failure('canonical_restore_cloud_state_invalid');
    }
    const state = durable.state;
    return {
      supported: true,
      ok: true,
      pending: text(state.status) !== 'v2_activated',
      recovery: {
        namespace: target,
        operationId: text(state.operationId).toLowerCase(),
        ledgerId: text(state.ledgerId),
        restoreEpoch: Number(state.toEpoch),
        status: text(state.status),
        lastErrorCode: state.lastErrorCode ? safeErrorCode(state.lastErrorCode) : null,
      },
    };
  } catch (error) {
    return failure(error?.message || 'canonical_restore_cloud_state_read_failed');
  }
};
