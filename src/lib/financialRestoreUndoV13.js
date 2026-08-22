// Phase 10 / P10-013 Strategy B — Undo staging from the currently referenced
// verified checkpoint. Undo remains Restore(checkpoint): it builds a normal private
// restore stage and later uses the same guard/RPC/promotion pipeline.

import { copyBoundedFinancialNamespaceBatchInTransactionV13 } from './financialRestoreCheckpointV13';
import { readRestoreStartSnapshotInTransactionV13 } from './financialRestoreStartSnapshotV13';
import {
  readNamespaceManifestCountsV13,
  writeCanonicalRestoreStageReadinessV13InTransaction,
} from './financialRestoreSourceGuardV13';
import { semanticHashNamespaceV3Bounded } from './financialSemanticStreamV3';
import { proveRestoreNamespaceSqlV13 } from './financialRestoreSqlValidatorV13';
import { normalizeCanonicalRestoreProofCountsV13 } from './financialRestoreProofV13';

export const RESTORE_UNDO_STAGE_V13_VERSION = 1;
export const RESTORE_UNDO_STAGE_V13_STATE_COPYING = 'COPYING';
export const RESTORE_UNDO_STAGE_V13_STATE_PROVING = 'PROVING_STAGE';
export const RESTORE_UNDO_STAGE_V13_STATE_READY = 'READY';

const SECTIONS = Object.freeze(['accounts','exchangeRates','transactions','postings','links','entities','archiveHeaders','archiveRecords']);
const countMap = Object.freeze({ accounts:'accounts', exchangeRates:'exchangeRates', transactions:'transactions', postings:'postings', links:'links', entities:'entities' });
const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const parse = value => { try { const v = JSON.parse(String(value ?? '')); return object(v) ? v : null; } catch { return null; } };
const safeJson = value => JSON.stringify(value);
const pointerKey = namespace => `canonical_restore_undo_pointer_v13:${namespace}`;
const checkpointKey = (namespace, checkpointId) => `canonical_restore_checkpoint_v13:${namespace}:${checkpointId}`;
const stateKey = (namespace, operationId) => `canonical_restore_undo_stage_build_v13:${namespace}:${operationId}`;
const stageReadyKey = stageNamespace => `canonical_restore_stage_v13:${stageNamespace}`;
const emptyCounts = () => ({ transactions:0, postings:0, links:0, accounts:0, exchangeRates:0, entities:0, coldArchiveBundles:0, coldArchiveRecords:0 });
const exactCounts = (left, right) => {
  const a = normalizeCanonicalRestoreProofCountsV13(left);
  const b = normalizeCanonicalRestoreProofCountsV13(right);
  return !!a && !!b && Object.keys(a).every(key => a[key] === b[key]);
};
const requireTxn = database => {
  if (!database?.getFirstAsync || !database?.getEachAsync || !database?.runAsync) throw new Error('restore_undo_stage_transaction_required');
  return database;
};

const readPointerAndCheckpoint = async ({ database, snapshot }) => {
  const pointer = parse((await database.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', pointerKey(snapshot.namespace)))?.value);
  if (!pointer || pointer.version !== 1 || pointer.namespace !== snapshot.namespace || pointer.ledgerId !== snapshot.ledgerId
      || !text(pointer.checkpointId) || pointer.checkpointNamespace !== `${snapshot.namespace}::restore-checkpoint::${text(pointer.checkpointId)}`
      || pointer.semanticHashVersion !== 3 || !/^[a-f0-9]{64}$/i.test(text(pointer.semanticHash))
      || !Number.isSafeInteger(pointer.validatorVersion) || pointer.validatorVersion < 1
      || !exactCounts(pointer.counts, snapshot.incomingCounts) || text(pointer.semanticHash).toLowerCase() !== snapshot.incomingSemanticHash) {
    throw new Error('restore_undo_pointer_invalid');
  }
  const checkpoint = parse((await database.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', checkpointKey(snapshot.namespace, pointer.checkpointId)))?.value);
  if (!checkpoint || checkpoint.status !== 'REFERENCED_FOR_UNDO' || checkpoint.checkpointId !== pointer.checkpointId
      || checkpoint.checkpointNamespace !== pointer.checkpointNamespace || checkpoint.ledgerId !== pointer.ledgerId
      || checkpoint.semanticHashVersion !== pointer.semanticHashVersion || text(checkpoint.semanticHash).toLowerCase() !== text(pointer.semanticHash).toLowerCase()
      || checkpoint.validatorVersion !== pointer.validatorVersion
      || !exactCounts(checkpoint.counts, pointer.counts)) {
    throw new Error('restore_undo_checkpoint_invalid');
  }
  return { pointer, checkpoint };
};

export const initializeReferencedUndoStageInTransactionV13 = async ({ database, namespace, operationId } = {}) => {
  const txn = requireTxn(database);
  const snapshot = await readRestoreStartSnapshotInTransactionV13({ database:txn, namespace, operationId });
  const { pointer } = await readPointerAndCheckpoint({ database:txn, snapshot });
  const stage = snapshot.stageNamespace;
  const metaKey = stateKey(snapshot.namespace, snapshot.operationId);
  const existing = parse((await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', metaKey))?.value);
  if (existing) {
    if (existing.version !== RESTORE_UNDO_STAGE_V13_VERSION || existing.namespace !== snapshot.namespace
        || existing.operationId !== snapshot.operationId || existing.stageNamespace !== stage
        || existing.sourceCheckpointId !== pointer.checkpointId || existing.sourceCheckpointNamespace !== pointer.checkpointNamespace) {
      throw new Error('restore_undo_stage_state_conflict');
    }
    return Object.freeze({ ...existing });
  }
  for (const table of ['ledger_accounts_v7','ledger_exchange_rates_v7','ledger_financial_transactions_v7','ledger_postings_v7','ledger_transaction_links_v7','ledger_entities_v7','ledger_workspace_state_v7','cold_archive_years','cold_archive_transactions']) {
    if (await txn.getFirstAsync(`SELECT 1 AS present FROM ${table} WHERE namespace=? LIMIT 1`, stage)) throw new Error('restore_undo_stage_namespace_not_empty');
  }
  if (await txn.getFirstAsync('SELECT 1 AS present FROM ledger_v7_meta WHERE key=? LIMIT 1', stageReadyKey(stage))) throw new Error('restore_undo_stage_readiness_exists');
  const sourceWorkspace = await txn.getFirstAsync('SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1', pointer.checkpointNamespace);
  if (!sourceWorkspace?.payload_json) throw new Error('restore_undo_stage_workspace_missing');
  const now = new Date().toISOString();
  await txn.runAsync('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)', stage,'shadow',7,String(sourceWorkspace.payload_json),now);
  const state = {
    version:RESTORE_UNDO_STAGE_V13_VERSION, stateVersion:1, status:RESTORE_UNDO_STAGE_V13_STATE_COPYING,
    namespace:snapshot.namespace, ledgerId:snapshot.ledgerId, operationId:snapshot.operationId,
    stageNamespace:stage, sourceCheckpointId:pointer.checkpointId, sourceCheckpointNamespace:pointer.checkpointNamespace,
    semanticHashVersion:pointer.semanticHashVersion, expectedSemanticHash:text(pointer.semanticHash).toLowerCase(),
    expectedCounts:normalizeCanonicalRestoreProofCountsV13(pointer.counts), validatorVersion:snapshot.validatorVersion,
    sectionIndex:0, section:SECTIONS[0], cursor:null, counts:emptyCounts(), createdAt:now, updatedAt:now,
  };
  await txn.runAsync('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', metaKey,safeJson(state),now);
  return Object.freeze(state);
};

export const copyNextReferencedUndoStageBatchInTransactionV13 = async ({
  database, namespace, operationId, maxRows, maxBytes, faultInjector,
} = {}) => {
  const txn = requireTxn(database);
  const target = text(namespace); const operation = text(operationId).toLowerCase(); const metaKey = stateKey(target, operation);
  const row = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', metaKey);
  const state = parse(row?.value);
  if (!state || state.version !== RESTORE_UNDO_STAGE_V13_VERSION || state.namespace !== target || state.operationId !== operation) throw new Error('restore_undo_stage_state_invalid');
  if (state.status === RESTORE_UNDO_STAGE_V13_STATE_PROVING || state.status === RESTORE_UNDO_STAGE_V13_STATE_READY) return Object.freeze({ ...state });
  if (state.status !== RESTORE_UNDO_STAGE_V13_STATE_COPYING || state.section !== SECTIONS[state.sectionIndex]) throw new Error('restore_undo_stage_state_invalid');
  const section = state.section;
  const copied = await copyBoundedFinancialNamespaceBatchInTransactionV13({
    database:txn, sourceNamespace:state.sourceCheckpointNamespace, targetNamespace:state.stageNamespace,
    section, cursor:state.cursor, maxRows, maxBytes, faultInjector,
  });
  const counts = { ...state.counts };
  if (section === 'archiveHeaders') {
    counts.coldArchiveBundles += copied.rows; counts.coldArchiveRecords += copied.logicalRecords;
  } else if (section === 'archiveRecords') counts.coldArchiveRecords += copied.rows;
  else counts[countMap[section]] += copied.rows;
  let sectionIndex = state.sectionIndex;
  let cursor = copied.nextCursor;
  let status = RESTORE_UNDO_STAGE_V13_STATE_COPYING;
  if (!copied.hasMore) {
    sectionIndex += 1; cursor = null;
    if (sectionIndex >= SECTIONS.length) status = RESTORE_UNDO_STAGE_V13_STATE_PROVING;
  }
  const now = new Date().toISOString();
  const next = { ...state, stateVersion:Number(state.stateVersion)+1, status, sectionIndex:status === RESTORE_UNDO_STAGE_V13_STATE_PROVING ? SECTIONS.length : sectionIndex,
    section:status === RESTORE_UNDO_STAGE_V13_STATE_PROVING ? null : SECTIONS[sectionIndex], cursor, counts, lastBatchRows:copied.rows, lastBatchBytes:copied.bytes, updatedAt:now };
  const updated = await txn.runAsync('UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?', safeJson(next),now,metaKey,String(row.value));
  if (Number(updated?.changes || 0) !== 1) throw new Error('restore_undo_stage_state_compare_and_swap_failed');
  return Object.freeze(next);
};

export const computeReferencedUndoStageProofV13 = async ({ database, namespace, operationId } = {}) => {
  if (!database?.getFirstAsync || !database?.getEachAsync) throw new Error('restore_undo_stage_proof_database_required');
  const target = text(namespace); const operation = text(operationId).toLowerCase();
  const state = parse((await database.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', stateKey(target,operation)))?.value);
  if (!state || state.status !== RESTORE_UNDO_STAGE_V13_STATE_PROVING) throw new Error('restore_undo_stage_not_ready_for_proof');
  const counts = await readNamespaceManifestCountsV13({ database, namespace:state.stageNamespace });
  const semanticHash = await semanticHashNamespaceV3Bounded({ database, namespace:state.stageNamespace, ledgerId:state.ledgerId });
  const sqlProof = await proveRestoreNamespaceSqlV13({ database, namespace:state.stageNamespace });
  if (!exactCounts(counts,state.expectedCounts) || !exactCounts(counts,state.counts) || semanticHash !== state.expectedSemanticHash
      || !sqlProof.ok || sqlProof.validatorVersion !== state.validatorVersion) throw new Error('restore_undo_stage_proof_mismatch');
  return Object.freeze({ namespace:target, operationId:operation, stageNamespace:state.stageNamespace, ledgerId:state.ledgerId,
    semanticHashVersion:state.semanticHashVersion, semanticHash, counts, validatorVersion:state.validatorVersion,
    stateVersion:state.stateVersion });
};

export const markReferencedUndoStageReadyInTransactionV13 = async ({ database, proof } = {}) => {
  const txn = requireTxn(database);
  if (!object(proof)) throw new Error('restore_undo_stage_proof_invalid');
  const metaKey = stateKey(text(proof.namespace),text(proof.operationId).toLowerCase());
  const row = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',metaKey);
  const state = parse(row?.value);
  if (!state || state.status !== RESTORE_UNDO_STAGE_V13_STATE_PROVING || Number(state.stateVersion) !== Number(proof.stateVersion)
      || state.stageNamespace !== proof.stageNamespace || state.ledgerId !== proof.ledgerId
      || state.semanticHashVersion !== proof.semanticHashVersion || state.expectedSemanticHash !== proof.semanticHash
      || !exactCounts(state.expectedCounts,proof.counts) || state.validatorVersion !== proof.validatorVersion) throw new Error('restore_undo_stage_proof_stale');
  await writeCanonicalRestoreStageReadinessV13InTransaction({ database:txn, namespace:state.namespace, stageNamespace:state.stageNamespace,
    ledgerId:state.ledgerId, semanticHashVersion:state.semanticHashVersion, semanticHash:proof.semanticHash, counts:proof.counts, validatorVersion:state.validatorVersion });
  const now = new Date().toISOString();
  const ready = { ...state, stateVersion:Number(state.stateVersion)+1, status:RESTORE_UNDO_STAGE_V13_STATE_READY,
    provedAt:now, updatedAt:now };
  const updated = await txn.runAsync('UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?',safeJson(ready),now,metaKey,String(row.value));
  if (Number(updated?.changes || 0) !== 1) throw new Error('restore_undo_stage_state_compare_and_swap_failed');
  return Object.freeze(ready);
};
