// Phase 10 production coordinator. It composes the already-accepted V11 decoder
// and V13 Strategy-B primitives; financial payloads stay in canonical SQLite and
// Supabase receives only the opaque proof digest and bounded identifiers.

import { decodeCanonicalBackupV11 } from './financialBackupV11Decoder';
import { stageCanonicalRestoreV11 } from './financialRestoreStageV11';
import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';
import {
  ensureLedgerSyncIdentityV8,
  readFinancialSyncProtocolV8,
} from './financialLedgerV7Repository';
import { CANONICAL_ROW_SOURCE_V3_BATCH_POLICY } from './financialCanonicalRowSourceV3';
import { SEMANTIC_HASH_V3_VERSION } from './financialSemanticProjection';
import { RESTORE_SQL_VALIDATOR_V13_VERSION, proveRestoreNamespaceSqlV13 } from './financialRestoreSqlValidatorV13';
import { semanticHashNamespaceV3Bounded } from './financialSemanticStreamV3';
import { captureRestoreStartSnapshotInTransactionV13 } from './financialRestoreStartSnapshotV13';
import {
  initializeRestoreCheckpointInTransactionV13,
  copyNextRestoreCheckpointBatchInTransactionV13,
} from './financialRestoreCheckpointV13';
import {
  computeRestoreCheckpointProofV13,
  guardRestoreSourceBeforeEpochRpcInTransactionV13,
  markRestoreCheckpointReadyInTransactionV13,
  readNamespaceManifestCountsV13,
  writeCanonicalRestoreStageReadinessV13InTransaction,
} from './financialRestoreSourceGuardV13';
import {
  computeReferencedUndoStageProofV13,
  copyNextReferencedUndoStageBatchInTransactionV13,
  initializeReferencedUndoStageInTransactionV13,
  markReferencedUndoStageReadyInTransactionV13,
} from './financialRestoreUndoV13';
import {
  createStrategyBRestoreIntentV13InTransaction,
  promoteCanonicalRestoreStageV13,
  recordStrategyBServerProofV13InTransaction,
} from './financialRestorePromotionV13';
import { createSecureUuidV4 } from './secureUuid';

const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const parse = value => { try { const result = JSON.parse(String(value ?? '')); return object(result) ? result : null; } catch { return null; } };
const intentKey = namespace => `restore_intent:${namespace}`;
const promotionKey = namespace => `canonical_restore_promotion_v13:${namespace}`;
const undoPointerKey = namespace => `canonical_restore_undo_pointer_v13:${namespace}`;
const failure = (reason, extra = {}) => ({ supported: true, ok: false, reason: text(reason) || 'canonical_restore_production_failed', ...extra });

const withRestoreTransaction = (database, task) => (
  enqueueLedgerWrite(() => runLedgerExclusiveTransaction(database, task))
);

const readMeta = async (database, key) => parse((await database.getFirstAsync(
  'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key,
))?.value);

const preflight = async ({ database, namespace, authUserId, adapters }) => {
  const owner = text(authUserId).toLowerCase();
  if (!owner || namespace !== `user:${owner}`) return failure('canonical_restore_original_session_required');
  const currentOwner = text(await adapters.getAuthenticatedUserId?.()).toLowerCase();
  if (!currentOwner || currentOwner !== owner) return failure('canonical_restore_original_session_required');
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database });
  const protocol = await readFinancialSyncProtocolV8({ namespace, database });
  if (!identity?.ledgerId || Number(identity.restoreEpoch || 0) < 1
      || protocol?.activeProtocolVersion !== 2 || !protocol?.activatedAt
      || text(protocol.ledgerId) !== text(identity.ledgerId)
      || Number(protocol.restoreEpoch) !== Number(identity.restoreEpoch)) {
    return failure('canonical_restore_active_protocol_v2_required');
  }
  const pending = await database.getFirstAsync(
    `SELECT COUNT(*) AS n FROM ledger_outbox_v3
      WHERE namespace=? AND ledger_id=? AND restore_epoch=?
        AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL`,
    namespace, identity.ledgerId, identity.restoreEpoch,
  );
  if (Number(pending?.n || 0) > 0) return failure('canonical_restore_pending_mutations');
  if (typeof adapters.resolveCloudLedger !== 'function') return failure('canonical_restore_cloud_adapter_required');
  const cloud = await adapters.resolveCloudLedger(identity);
  if (text(cloud?.ledgerId) !== text(identity.ledgerId)
      || Number(cloud?.restoreEpoch || 0) !== Number(identity.restoreEpoch)
      || Number(cloud?.protocolVersion || 0) !== 2 || !cloud?.bootstrappedAt) {
    return failure('canonical_restore_cloud_identity_not_ready');
  }
  return { supported: true, ok: true, owner, identity, protocol, cloud };
};

const buildCheckpoint = async ({ database, namespace, operationId, checkpointId }) => {
  await withRestoreTransaction(database, txn => initializeRestoreCheckpointInTransactionV13({
    database: txn, namespace, operationId,
  }));
  let state = null;
  for (let index = 0; index < 100000; index += 1) {
    state = await withRestoreTransaction(database, txn => copyNextRestoreCheckpointBatchInTransactionV13({
      database: txn,
      namespace,
      checkpointId,
      maxRows: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows,
      maxBytes: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes,
    }));
    if (state?.status === 'PROVING_CHECKPOINT') break;
  }
  if (state?.status !== 'PROVING_CHECKPOINT') throw new Error('canonical_restore_checkpoint_copy_incomplete');
  const proof = await computeRestoreCheckpointProofV13({ database, namespace, operationId });
  const ready = await withRestoreTransaction(database, txn => markRestoreCheckpointReadyInTransactionV13({
    database: txn, namespace, operationId, proof,
  }));
  if (!ready?.ok) throw new Error(ready?.reason || 'canonical_restore_checkpoint_not_ready');
  return ready.checkpoint;
};

const prepareImportedStage = async ({ database, namespace, operationId, checkpointId, candidate }) => {
  const decoded = decodeCanonicalBackupV11(candidate);
  if (!decoded?.ok) throw new Error(decoded?.reason || 'canonical_restore_decode_failed');
  const boundStageNamespace = `${namespace}::restore-stage::${operationId}`;
  const staged = await stageCanonicalRestoreV11({
    namespace, stageNamespace: boundStageNamespace, decoded, database,
  });
  if (!staged?.ok) throw new Error(staged?.reason || 'canonical_restore_stage_failed');
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database });
  const sqlProof = await proveRestoreNamespaceSqlV13({ database, namespace: boundStageNamespace });
  if (!sqlProof?.ok || sqlProof.validatorVersion !== RESTORE_SQL_VALIDATOR_V13_VERSION) {
    throw new Error('canonical_restore_stage_sql_proof_failed');
  }
  const counts = await readNamespaceManifestCountsV13({ database, namespace: boundStageNamespace });
  const semanticHash = await semanticHashNamespaceV3Bounded({
    database, namespace: boundStageNamespace, ledgerId: identity.ledgerId,
  });
  await withRestoreTransaction(database, async txn => {
    await captureRestoreStartSnapshotInTransactionV13({
      database: txn,
      namespace,
      operationId,
      stageNamespace: boundStageNamespace,
      checkpointId,
      semanticHashVersion: SEMANTIC_HASH_V3_VERSION,
      incomingSemanticHash: semanticHash,
      incomingCounts: counts,
      validatorVersion: RESTORE_SQL_VALIDATOR_V13_VERSION,
      batchPolicyVersion: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.version,
    });
    await writeCanonicalRestoreStageReadinessV13InTransaction({
      database: txn,
      namespace,
      stageNamespace: boundStageNamespace,
      ledgerId: identity.ledgerId,
      semanticHashVersion: SEMANTIC_HASH_V3_VERSION,
      semanticHash,
      counts,
      validatorVersion: RESTORE_SQL_VALIDATOR_V13_VERSION,
    });
  });
  return { stageNamespace: boundStageNamespace, counts, semanticHash };
};

const prepareUndoStage = async ({ database, namespace, operationId, checkpointId }) => {
  const pointer = await readMeta(database, undoPointerKey(namespace));
  if (!pointer || pointer.version !== 1 || !text(pointer.semanticHash) || !object(pointer.counts)) {
    throw new Error('canonical_restore_undo_unavailable');
  }
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database });
  const stageNamespace = `${namespace}::restore-stage::${operationId}`;
  await withRestoreTransaction(database, txn => captureRestoreStartSnapshotInTransactionV13({
    database: txn,
    namespace,
    operationId,
    stageNamespace,
    checkpointId,
    semanticHashVersion: SEMANTIC_HASH_V3_VERSION,
    incomingSemanticHash: text(pointer.semanticHash).toLowerCase(),
    incomingCounts: pointer.counts,
    validatorVersion: RESTORE_SQL_VALIDATOR_V13_VERSION,
    batchPolicyVersion: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.version,
  }));
  await withRestoreTransaction(database, txn => initializeReferencedUndoStageInTransactionV13({
    database: txn, namespace, operationId,
  }));
  let state = null;
  for (let index = 0; index < 100000; index += 1) {
    state = await withRestoreTransaction(database, txn => copyNextReferencedUndoStageBatchInTransactionV13({
      database: txn,
      namespace,
      operationId,
      maxRows: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows,
      maxBytes: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes,
    }));
    if (state?.status === 'PROVING_STAGE') break;
  }
  if (state?.status !== 'PROVING_STAGE') throw new Error('canonical_restore_undo_stage_copy_incomplete');
  const proof = await computeReferencedUndoStageProofV13({ database, namespace, operationId });
  await withRestoreTransaction(database, txn => markReferencedUndoStageReadyInTransactionV13({
    database: txn, proof,
  }));
  if (text(proof.ledgerId) !== text(identity.ledgerId)) throw new Error('canonical_restore_undo_identity_mismatch');
  return { stageNamespace, counts: proof.counts, semanticHash: proof.semanticHash };
};

const createIntent = async ({ database, namespace, operationId, authUserId, deviceId, triggerKind }) => (
  withRestoreTransaction(database, async txn => {
    const guard = await guardRestoreSourceBeforeEpochRpcInTransactionV13({
      database: txn, namespace, operationId,
    });
    if (!guard?.ok) throw new Error(guard?.reason || 'restore_source_changed');
    const intent = await createStrategyBRestoreIntentV13InTransaction({
      database: txn,
      guardResult: guard,
      authUserId,
      deviceId,
      triggerKind,
    });
    return { guard, intent };
  })
);

const continuePrepared = async ({ database, namespace, authUserId, adapters }) => {
  let intent = await readMeta(database, intentKey(namespace));
  if (!intent) {
    const promotion = await readMeta(database, promotionKey(namespace));
    if (promotion && ['local_promoted_pending_reload', 'v2_activated'].includes(text(promotion.status))) {
      return {
        supported: true,
        ok: true,
        promoted: true,
        activationRequired: promotion.status !== 'v2_activated',
        namespace,
        operationId: promotion.operationId,
        ledgerId: promotion.ledgerId,
        restoreEpoch: Number(promotion.toEpoch),
        triggerKind: promotion.triggerKind,
      };
    }
    return failure('canonical_restore_no_pending_operation', { pending: false });
  }
  if (intent.version !== 3 || intent.namespace !== namespace
      || text(intent.authUserId).toLowerCase() !== text(authUserId).toLowerCase()) {
    return failure('canonical_restore_pending_operation_invalid', { pending: true });
  }
  const currentOwner = text(await adapters.getAuthenticatedUserId?.()).toLowerCase();
  if (currentOwner !== text(intent.authUserId).toLowerCase()) {
    return failure('canonical_restore_original_session_required', { pending: true });
  }
  if (intent.status === 'intent_pending_server') {
    const guard = await withRestoreTransaction(database, txn => guardRestoreSourceBeforeEpochRpcInTransactionV13({
      database: txn, namespace, operationId: intent.operationId,
    }));
    if (!guard?.ok || text(guard.restoreProofDigest) !== text(intent.restoreProofDigest)) {
      return failure(guard?.reason || 'restore_source_changed', { pending: true });
    }
    if (typeof adapters.advanceRestoreEpoch !== 'function') {
      return failure('canonical_restore_server_adapter_required', { pending: true });
    }
    const serverProof = await adapters.advanceRestoreEpoch({
      ownerId: intent.authUserId,
      ledgerId: intent.ledgerId,
      fromEpoch: Number(intent.fromEpoch),
      toEpoch: Number(intent.toEpoch),
      deviceId: intent.deviceId,
      operationId: intent.operationId,
      restoreProofDigest: intent.restoreProofDigest,
      reason: 'backup_restore',
    });
    if (!serverProof?.ok) {
      return failure(serverProof?.reason || 'canonical_restore_server_outcome_unknown', {
        pending: true, ambiguous: serverProof?.ambiguous === true,
      });
    }
    intent = await withRestoreTransaction(database, txn => recordStrategyBServerProofV13InTransaction({
      database: txn,
      namespace,
      operationId: intent.operationId,
      serverProof,
    }));
  }
  if (intent.status !== 'server_epoch_proven') {
    return failure('canonical_restore_server_proof_state_invalid', { pending: true });
  }
  const promoted = await promoteCanonicalRestoreStageV13({
    namespace, operationId: intent.operationId, database,
  });
  if (!promoted?.ok) return failure(promoted?.reason || 'canonical_restore_promotion_failed', { pending: true });
  return {
    supported: true,
    ok: true,
    promoted: true,
    activationRequired: true,
    namespace,
    operationId: intent.operationId,
    ledgerId: promoted.ledgerId,
    restoreEpoch: Number(promoted.restoreEpoch),
    triggerKind: intent.triggerKind,
  };
};

export const startCanonicalRestoreProductionV13 = async ({
  candidate,
  namespace,
  authUserId,
  deviceId,
  adapters = {},
  database = null,
  triggerKind = 'restore',
} = {}) => {
  const target = text(namespace);
  const db = database || await getLedgerDb();
  if (!db) return failure('sqlite_unavailable');
  try {
    const pendingIntent = await readMeta(db, intentKey(target));
    if (pendingIntent) return continuePrepared({ database: db, namespace: target, authUserId, adapters });
    const pendingPromotion = await readMeta(db, promotionKey(target));
    if (pendingPromotion?.status === 'local_promoted_pending_reload') {
      return continuePrepared({ database: db, namespace: target, authUserId, adapters });
    }
    const gate = await preflight({ database: db, namespace: target, authUserId, adapters });
    if (!gate.ok) return gate;
    if (!text(deviceId) || text(deviceId).length > 200) return failure('canonical_restore_device_id_invalid');
    const operationId = createSecureUuidV4();
    const checkpointId = createSecureUuidV4();
    if (triggerKind === 'undo') {
      await prepareUndoStage({ database: db, namespace: target, operationId, checkpointId });
    } else {
      await prepareImportedStage({ database: db, namespace: target, operationId, checkpointId, candidate });
    }
    await buildCheckpoint({ database: db, namespace: target, operationId, checkpointId });
    await createIntent({
      database: db,
      namespace: target,
      operationId,
      authUserId: gate.owner,
      deviceId,
      triggerKind,
    });
    return continuePrepared({ database: db, namespace: target, authUserId: gate.owner, adapters });
  } catch (error) {
    return failure(error?.message || 'canonical_restore_production_failed');
  }
};

export const resumeCanonicalRestoreProductionV13 = async ({
  namespace,
  authUserId,
  adapters = {},
  database = null,
} = {}) => {
  const target = text(namespace);
  const db = database || await getLedgerDb();
  if (!db) return failure('sqlite_unavailable');
  try {
    return await continuePrepared({ database: db, namespace: target, authUserId, adapters });
  } catch (error) {
    return failure(error?.message || 'canonical_restore_resume_failed', { pending: true });
  }
};

export const markCanonicalRestoreActivatedV13 = async ({
  namespace,
  operationId,
  activation,
  database = null,
} = {}) => {
  const target = text(namespace);
  const operation = text(operationId).toLowerCase();
  const db = database || await getLedgerDb();
  if (!db) return failure('sqlite_unavailable');
  try {
    return await withRestoreTransaction(db, async txn => {
      const key = promotionKey(target);
      const row = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key);
      const promotion = parse(row?.value);
      if (!promotion || promotion.version !== 1 || promotion.namespace !== target
          || text(promotion.operationId).toLowerCase() !== operation
          || !['local_promoted_pending_reload', 'v2_activated'].includes(text(promotion.status))) {
        throw new Error('canonical_restore_activation_state_invalid');
      }
      if (promotion.status === 'v2_activated') return { supported: true, ok: true, idempotent: true, promotion };
      const protocol = activation?.protocol || activation?.activated || activation;
      if (!activation?.ok || Number(protocol?.activeProtocolVersion || 0) !== 2
          || text(protocol?.ledgerId) !== text(promotion.ledgerId)
          || Number(protocol?.restoreEpoch || 0) !== Number(promotion.toEpoch)) {
        throw new Error('canonical_restore_activation_proof_invalid');
      }
      const now = new Date().toISOString();
      const next = {
        ...promotion,
        stateVersion: Number(promotion.stateVersion || 1) + 1,
        status: 'v2_activated',
        activatedAt: protocol.activatedAt || now,
        completedAt: now,
      };
      const updated = await txn.runAsync(
        'UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?',
        JSON.stringify(next), now, key, String(row.value),
      );
      if (Number(updated?.changes || 0) !== 1) throw new Error('canonical_restore_activation_compare_and_swap_failed');
      return { supported: true, ok: true, idempotent: false, promotion: next };
    });
  } catch (error) {
    return failure(error?.message || 'canonical_restore_activation_failed');
  }
};
