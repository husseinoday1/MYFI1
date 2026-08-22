// Phase 10 / P10-013 Strategy B — checkpoint proof and pre-RPC freshness guard.
// No network client is imported here. A caller may invoke P10-012 only after this
// module returns ok:true for the exact durable operation.

import { readLiveGenerationInTransactionV13 } from './financialLiveGenerationV13';
import { readRestoreStartSnapshotInTransactionV13 } from './financialRestoreStartSnapshotV13';
import { semanticHashNamespaceV3Bounded } from './financialSemanticStreamV3';
import { proveRestoreNamespaceSqlV13 } from './financialRestoreSqlValidatorV13';
import {
  deriveCanonicalRestoreProofDigestV13,
  normalizeCanonicalRestoreProofCountsV13,
} from './financialRestoreProofV13';

export const RESTORE_CHECKPOINT_V13_STATE_READY = 'READY';
export const RESTORE_CHECKPOINT_V13_STATE_ABORTED_STALE = 'ABORTED_STALE';

const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const parse = value => { try { const v = JSON.parse(String(value ?? '')); return object(v) ? v : null; } catch { return null; } };
const safeJson = value => JSON.stringify(value);
const checkpointKey = (namespace, checkpointId) => `canonical_restore_checkpoint_v13:${namespace}:${checkpointId}`;
const stageKey = stageNamespace => `canonical_restore_stage_v13:${stageNamespace}`;
const exactCounts = (left, right) => {
  const a = normalizeCanonicalRestoreProofCountsV13(left);
  const b = normalizeCanonicalRestoreProofCountsV13(right);
  return !!a && !!b && Object.keys(a).every(key => a[key] === b[key]);
};
const sourceChanged = () => ({ supported: true, ok: false, reason: 'restore_source_changed' });

const requireTxn = database => {
  if (!database || typeof database.getFirstAsync !== 'function' || typeof database.runAsync !== 'function') {
    throw new Error('restore_source_guard_transaction_required');
  }
  return database;
};

export const readNamespaceManifestCountsV13 = async ({ database, namespace } = {}) => {
  if (!database?.getFirstAsync || !text(namespace)) throw new Error('restore_source_counts_input_invalid');
  const target = text(namespace);
  const scalar = async (table) => Number((await database.getFirstAsync(`SELECT COUNT(*) AS n FROM ${table} WHERE namespace=?`, target))?.n || 0);
  const archiveMeta = await database.getFirstAsync(
    `SELECT COALESCE(SUM(CASE WHEN json_valid(metadata_json) THEN
       COALESCE(json_array_length(json_extract(metadata_json,'$.debts')),0)+
       COALESCE(json_array_length(json_extract(metadata_json,'$.goals')),0)+
       COALESCE(json_array_length(json_extract(metadata_json,'$.wallets')),0)+
       COALESCE(json_array_length(json_extract(metadata_json,'$.commitments')),0)+
       COALESCE(json_array_length(json_extract(metadata_json,'$.cats')),0)
     ELSE -1000000000 END),0) AS n,
     COALESCE(SUM(CASE WHEN json_valid(metadata_json) THEN 0 ELSE 1 END),0) AS invalid
     FROM cold_archive_years WHERE namespace=?`, target,
  );
  if (Number(archiveMeta?.invalid || 0) !== 0 || Number(archiveMeta?.n || 0) < 0) {
    throw new Error('restore_source_archive_metadata_invalid');
  }
  const archiveRows = await scalar('cold_archive_transactions');
  return Object.freeze({
    transactions: await scalar('ledger_financial_transactions_v7'),
    postings: await scalar('ledger_postings_v7'),
    links: await scalar('ledger_transaction_links_v7'),
    accounts: await scalar('ledger_accounts_v7'),
    exchangeRates: await scalar('ledger_exchange_rates_v7'),
    entities: await scalar('ledger_entities_v7'),
    coldArchiveBundles: await scalar('cold_archive_years'),
    coldArchiveRecords: Number(archiveMeta.n || 0) + archiveRows,
  });
};

export const computeRestoreCheckpointProofV13 = async ({
  database, namespace, operationId,
} = {}) => {
  if (!database?.getFirstAsync || !database?.getEachAsync) throw new Error('restore_checkpoint_proof_database_required');
  const snapshot = await readRestoreStartSnapshotInTransactionV13({ database, namespace, operationId });
  const checkpointRow = await database.getFirstAsync(
    'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', checkpointKey(snapshot.namespace, snapshot.checkpointId),
  );
  const checkpoint = parse(checkpointRow?.value);
  if (!checkpoint || checkpoint.status !== 'PROVING_CHECKPOINT'
      || checkpoint.operationId !== snapshot.operationId
      || checkpoint.checkpointNamespace !== snapshot.checkpointNamespace) {
    throw new Error('restore_checkpoint_not_ready_for_proof');
  }
  const sourceCounts = await readNamespaceManifestCountsV13({ database, namespace: snapshot.namespace });
  const checkpointCounts = await readNamespaceManifestCountsV13({ database, namespace: snapshot.checkpointNamespace });
  if (!exactCounts(checkpoint.counts, checkpointCounts) || !exactCounts(sourceCounts, checkpointCounts)) {
    throw new Error('restore_checkpoint_counts_mismatch');
  }
  // The active namespace itself is not accepted by the private-only validator. The
  // checkpoint is an exact copy; validate that private copy before READY. Any active
  // source mutation still fails later through the generation revalidation.
  const checkpointSqlProof = await proveRestoreNamespaceSqlV13({ database, namespace: snapshot.checkpointNamespace });
  if (!checkpointSqlProof.ok || checkpointSqlProof.validatorVersion !== snapshot.validatorVersion) {
    throw new Error('restore_checkpoint_sql_validation_failed');
  }
  const sourceSemanticHash = await semanticHashNamespaceV3Bounded({
    database, namespace: snapshot.namespace, ledgerId: snapshot.ledgerId,
  });
  const checkpointSemanticHash = await semanticHashNamespaceV3Bounded({
    database, namespace: snapshot.checkpointNamespace, ledgerId: snapshot.ledgerId,
  });
  if (sourceSemanticHash !== checkpointSemanticHash) throw new Error('restore_checkpoint_semantic_mismatch');
  return Object.freeze({
    namespace: snapshot.namespace,
    operationId: snapshot.operationId,
    checkpointId: snapshot.checkpointId,
    sourceRestoreEpoch: snapshot.sourceRestoreEpoch,
    sourceLiveGeneration: snapshot.sourceLiveGeneration,
    semanticHashVersion: snapshot.semanticHashVersion,
    checkpointSemanticHash,
    checkpointCounts,
    validatorVersion: checkpointSqlProof.validatorVersion,
  });
};

const currentMatchesSnapshot = async (txn, snapshot) => {
  const identity = await txn.getFirstAsync(
    'SELECT namespace,ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1', snapshot.namespace,
  );
  if (!identity?.ledger_id || String(identity.ledger_id) !== snapshot.ledgerId
      || Number(identity.restore_epoch) !== snapshot.sourceRestoreEpoch) return false;
  try {
    const token = await readLiveGenerationInTransactionV13({
      database: txn, namespace: snapshot.namespace, ledgerId: snapshot.ledgerId, restoreEpoch: snapshot.sourceRestoreEpoch,
    });
    return Number(token.generation) === snapshot.sourceLiveGeneration;
  } catch {
    return false;
  }
};

export const markRestoreCheckpointReadyInTransactionV13 = async ({
  database, namespace, operationId, proof,
} = {}) => {
  const txn = requireTxn(database);
  const snapshot = await readRestoreStartSnapshotInTransactionV13({ database: txn, namespace, operationId });
  const key = checkpointKey(snapshot.namespace, snapshot.checkpointId);
  const row = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key);
  const checkpoint = parse(row?.value);
  if (!checkpoint || checkpoint.status !== 'PROVING_CHECKPOINT'
      || checkpoint.operationId !== snapshot.operationId || checkpoint.checkpointNamespace !== snapshot.checkpointNamespace
      || !object(proof) || proof.namespace !== snapshot.namespace || proof.operationId !== snapshot.operationId
      || proof.checkpointId !== snapshot.checkpointId || proof.sourceRestoreEpoch !== snapshot.sourceRestoreEpoch
      || proof.sourceLiveGeneration !== snapshot.sourceLiveGeneration || proof.semanticHashVersion !== snapshot.semanticHashVersion
      || proof.validatorVersion !== snapshot.validatorVersion
      || !/^[a-f0-9]{64}$/i.test(text(proof.checkpointSemanticHash))
      || !exactCounts(proof.checkpointCounts, checkpoint.counts)) {
    throw new Error('restore_checkpoint_proof_binding_invalid');
  }
  const fresh = await currentMatchesSnapshot(txn, snapshot);
  const now = new Date().toISOString();
  if (!fresh) {
    const aborted = { ...checkpoint, stateVersion: Number(checkpoint.stateVersion) + 1,
      status: RESTORE_CHECKPOINT_V13_STATE_ABORTED_STALE, updatedAt: now };
    const updated = await txn.runAsync('UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?', safeJson(aborted), now, key, String(row.value));
    if (Number(updated?.changes || 0) !== 1) throw new Error('restore_checkpoint_state_compare_and_swap_failed');
    return sourceChanged();
  }
  const ready = {
    ...checkpoint,
    stateVersion: Number(checkpoint.stateVersion) + 1,
    status: RESTORE_CHECKPOINT_V13_STATE_READY,
    semanticHashVersion: proof.semanticHashVersion,
    semanticHash: text(proof.checkpointSemanticHash).toLowerCase(),
    counts: proof.checkpointCounts,
    validatorVersion: proof.validatorVersion,
    provedAt: now,
    updatedAt: now,
  };
  const updated = await txn.runAsync('UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?', safeJson(ready), now, key, String(row.value));
  if (Number(updated?.changes || 0) !== 1) throw new Error('restore_checkpoint_state_compare_and_swap_failed');
  return { supported: true, ok: true, checkpoint: Object.freeze(ready) };
};

export const writeCanonicalRestoreStageReadinessV13InTransaction = async ({
  database, namespace, stageNamespace, ledgerId, semanticHashVersion, semanticHash, counts, validatorVersion,
} = {}) => {
  const txn = requireTxn(database);
  const target = text(namespace);
  const stage = text(stageNamespace);
  const proofCounts = normalizeCanonicalRestoreProofCountsV13(counts);
  if (!target || !stage.startsWith(`${target}::restore-stage::`) || stage.length <= `${target}::restore-stage::`.length
      || !text(ledgerId) || semanticHashVersion !== 3 || !/^[a-f0-9]{64}$/i.test(text(semanticHash))
      || !proofCounts || typeof validatorVersion !== 'number' || !Number.isSafeInteger(validatorVersion) || validatorVersion < 1) {
    throw new Error('restore_stage_v13_readiness_invalid');
  }
  const now = new Date().toISOString();
  const state = { version: 1, state: 'ready', namespace: stage, ledgerId: text(ledgerId), semanticHashVersion,
    semanticHash: text(semanticHash).toLowerCase(), counts: proofCounts, validatorVersion, provedAt: now };
  const key = stageKey(stage);
  const existingRow = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key);
  if (existingRow) {
    const existing = parse(existingRow.value);
    if (!existing || existing.state !== 'ready' || existing.namespace !== state.namespace
        || existing.ledgerId !== state.ledgerId || existing.semanticHashVersion !== state.semanticHashVersion
        || existing.semanticHash !== state.semanticHash || existing.validatorVersion !== state.validatorVersion
        || !exactCounts(existing.counts, state.counts)) {
      throw new Error('restore_stage_v13_readiness_conflict');
    }
    return Object.freeze({ ...existing });
  }
  await txn.runAsync('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', key, safeJson(state), now);
  return Object.freeze(state);
};

export const guardRestoreSourceBeforeEpochRpcInTransactionV13 = async ({
  database, namespace, operationId,
} = {}) => {
  const txn = requireTxn(database);
  const snapshot = await readRestoreStartSnapshotInTransactionV13({ database: txn, namespace, operationId });
  if (!(await currentMatchesSnapshot(txn, snapshot))) return sourceChanged();
  const checkpoint = parse((await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', checkpointKey(snapshot.namespace, snapshot.checkpointId)))?.value);
  if (!checkpoint || checkpoint.status !== RESTORE_CHECKPOINT_V13_STATE_READY
      || checkpoint.operationId !== snapshot.operationId || checkpoint.checkpointNamespace !== snapshot.checkpointNamespace
      || checkpoint.semanticHashVersion !== snapshot.semanticHashVersion || checkpoint.validatorVersion !== snapshot.validatorVersion
      || !object(checkpoint.counts)
      || !/^[a-f0-9]{64}$/i.test(text(checkpoint.semanticHash))) {
    return { supported: true, ok: false, reason: 'restore_checkpoint_not_ready' };
  }
  const stage = parse((await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', stageKey(snapshot.stageNamespace)))?.value);
  if (!stage || stage.state !== 'ready' || stage.namespace !== snapshot.stageNamespace || stage.ledgerId !== snapshot.ledgerId
      || stage.semanticHashVersion !== snapshot.semanticHashVersion || stage.semanticHash !== snapshot.incomingSemanticHash
      || stage.validatorVersion !== snapshot.validatorVersion || !exactCounts(stage.counts, snapshot.incomingCounts)) {
    return { supported: true, ok: false, reason: 'restore_stage_not_ready' };
  }
  const restoreProofDigest = deriveCanonicalRestoreProofDigestV13({
    operationId: snapshot.operationId,
    ledgerId: snapshot.ledgerId,
    fromEpoch: snapshot.sourceRestoreEpoch,
    toEpoch: snapshot.sourceRestoreEpoch + 1,
    sourceLiveGeneration: snapshot.sourceLiveGeneration,
    semanticHashVersion: snapshot.semanticHashVersion,
    incomingSemanticHash: snapshot.incomingSemanticHash,
    checkpointId: snapshot.checkpointId,
    checkpointSemanticHash: checkpoint.semanticHash,
    validatorVersion: snapshot.validatorVersion,
    incomingCounts: snapshot.incomingCounts,
    checkpointCounts: checkpoint.counts,
  });
  return { supported: true, ok: true, snapshot, checkpoint, stage, restoreProofDigest };
};
