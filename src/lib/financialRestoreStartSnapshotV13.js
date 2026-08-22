// Phase 10 / P10-013 Strategy B — immutable start snapshot.
// It captures identity/freshness metadata only. No financial payload is persisted.

import { readLiveGenerationInTransactionV13 } from './financialLiveGenerationV13';
import { SEMANTIC_HASH_V3_VERSION } from './financialSemanticProjection';
import {
  CANONICAL_RESTORE_PROOF_V13_VERSION,
  normalizeCanonicalRestoreProofCountsV13,
} from './financialRestoreProofV13';

export const RESTORE_START_SNAPSHOT_V13_VERSION = 1;
export const RESTORE_START_SNAPSHOT_V13_STATUS = 'PREPARING';

const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
const hash = value => /^[a-f0-9]{64}$/i.test(text(value));
const privateNamespace = value => /::(?:shadow-stage|restore-stage|restore-checkpoint)::/.test(text(value));
const key = (namespace, operationId) => `canonical_restore_start_v13:${namespace}:${operationId}`;
const checkpointNamespace = (namespace, checkpointId) => `${namespace}::restore-checkpoint::${checkpointId}`;
const parse = value => { try { const v = JSON.parse(String(value ?? '')); return object(v) ? v : null; } catch { return null; } };
const safeJson = value => JSON.stringify(value);
const exactImmutable = (left, right) => [
  'version','stateVersion','status','namespace','ledgerId','sourceRestoreEpoch','sourceLiveGeneration',
  'operationId','stageNamespace','checkpointId','checkpointNamespace','semanticHashVersion','proofVersion',
  'incomingSemanticHash','validatorVersion','batchPolicyVersion',
].every(name => left?.[name] === right?.[name])
  && JSON.stringify(left?.incomingCounts) === JSON.stringify(right?.incomingCounts);

const requireTxn = database => {
  if (!database || typeof database.getFirstAsync !== 'function' || typeof database.runAsync !== 'function') {
    throw new Error('restore_start_snapshot_transaction_required');
  }
  return database;
};

export const captureRestoreStartSnapshotInTransactionV13 = async ({
  database,
  namespace,
  operationId,
  stageNamespace,
  checkpointId,
  semanticHashVersion,
  incomingSemanticHash,
  incomingCounts,
  validatorVersion,
  batchPolicyVersion,
} = {}) => {
  const txn = requireTxn(database);
  const target = text(namespace);
  const operation = text(operationId).toLowerCase();
  const stage = text(stageNamespace);
  const checkpoint = text(checkpointId).toLowerCase();
  const proofCounts = normalizeCanonicalRestoreProofCountsV13(incomingCounts);
  if (!target || privateNamespace(target) || !uuid(operation) || !uuid(checkpoint)
      || !stage.startsWith(`${target}::restore-stage::`) || stage.length <= `${target}::restore-stage::`.length
      || semanticHashVersion !== SEMANTIC_HASH_V3_VERSION || !hash(incomingSemanticHash) || !proofCounts
      || typeof validatorVersion !== 'number' || !Number.isSafeInteger(validatorVersion) || validatorVersion < 1
      || typeof batchPolicyVersion !== 'number' || !Number.isSafeInteger(batchPolicyVersion) || batchPolicyVersion < 1) {
    throw new Error('restore_start_snapshot_input_invalid');
  }

  const identity = await txn.getFirstAsync(
    `SELECT namespace,ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target,
  );
  if (!identity?.ledger_id || typeof identity.restore_epoch !== 'number'
      || !Number.isSafeInteger(identity.restore_epoch) || identity.restore_epoch < 1) {
    throw new Error('restore_start_snapshot_identity_missing');
  }
  const token = await readLiveGenerationInTransactionV13({
    database: txn,
    namespace: target,
    ledgerId: String(identity.ledger_id),
    restoreEpoch: Number(identity.restore_epoch),
  });

  const now = new Date().toISOString();
  const snapshot = Object.freeze({
    version: RESTORE_START_SNAPSHOT_V13_VERSION,
    stateVersion: 1,
    status: RESTORE_START_SNAPSHOT_V13_STATUS,
    namespace: target,
    ledgerId: String(identity.ledger_id),
    sourceRestoreEpoch: Number(identity.restore_epoch),
    sourceLiveGeneration: Number(token.generation),
    operationId: operation,
    stageNamespace: stage,
    checkpointId: checkpoint,
    checkpointNamespace: checkpointNamespace(target, checkpoint),
    semanticHashVersion,
    proofVersion: CANONICAL_RESTORE_PROOF_V13_VERSION,
    incomingSemanticHash: text(incomingSemanticHash).toLowerCase(),
    incomingCounts: proofCounts,
    validatorVersion,
    batchPolicyVersion,
    createdAt: now,
    updatedAt: now,
  });

  const metaKey = key(target, operation);
  const existingRow = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', metaKey);
  if (existingRow) {
    const existing = parse(existingRow.value);
    if (!existing || !exactImmutable(existing, snapshot)) throw new Error('restore_start_snapshot_conflict');
    return Object.freeze({ ...existing });
  }
  const inserted = await txn.runAsync(
    'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', metaKey, safeJson(snapshot), now,
  );
  if (Number(inserted?.changes || 0) !== 1) throw new Error('restore_start_snapshot_write_failed');
  return snapshot;
};

export const readRestoreStartSnapshotInTransactionV13 = async ({ database, namespace, operationId } = {}) => {
  const txn = requireTxn(database);
  const target = text(namespace);
  const operation = text(operationId).toLowerCase();
  if (!target || !uuid(operation)) throw new Error('restore_start_snapshot_input_invalid');
  const row = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key(target, operation));
  const value = parse(row?.value);
  const proofCounts = normalizeCanonicalRestoreProofCountsV13(value?.incomingCounts);
  if (!value || value.version !== RESTORE_START_SNAPSHOT_V13_VERSION || value.stateVersion !== 1
      || value.status !== RESTORE_START_SNAPSHOT_V13_STATUS
      || value.namespace !== target || value.operationId !== operation || !text(value.ledgerId)
      || typeof value.sourceRestoreEpoch !== 'number' || !Number.isSafeInteger(value.sourceRestoreEpoch) || value.sourceRestoreEpoch < 1
      || typeof value.sourceLiveGeneration !== 'number' || !Number.isSafeInteger(value.sourceLiveGeneration) || value.sourceLiveGeneration < 0
      || !text(value.stageNamespace).startsWith(`${target}::restore-stage::`) || !uuid(value.checkpointId)
      || value.checkpointNamespace !== checkpointNamespace(target, text(value.checkpointId).toLowerCase())
      || value.semanticHashVersion !== SEMANTIC_HASH_V3_VERSION || value.proofVersion !== CANONICAL_RESTORE_PROOF_V13_VERSION
      || !hash(value.incomingSemanticHash) || !proofCounts
      || typeof value.validatorVersion !== 'number' || !Number.isSafeInteger(value.validatorVersion) || value.validatorVersion < 1
      || typeof value.batchPolicyVersion !== 'number' || !Number.isSafeInteger(value.batchPolicyVersion) || value.batchPolicyVersion < 1) {
    throw new Error('restore_start_snapshot_missing_or_invalid');
  }
  return Object.freeze({ ...value, incomingCounts: proofCounts });
};
