// Phase 10 / P10-013 Strategy B — atomic local promotion with Undo pointer.
// Isolated: no UI, Supabase client or live maintenance-fence wiring is imported.

import { runFinancialRestorePromotionTransactionV8 } from './financialLedgerV7Repository';
import { FINANCIAL_LEDGER_SCHEMA_VERSION } from './financialLedgerV7Model';
import { cloudWorkspaceCfg, mergeCloudWorkspaceCfg } from './cloudWorkspaceMetadata.js';
import { guardRestoreSourceBeforeEpochRpcInTransactionV13 } from './financialRestoreSourceGuardV13';
import { normalizeCanonicalRestoreProofCountsV13 } from './financialRestoreProofV13';

export const RESTORE_INTENT_V13_VERSION = 3;
export const RESTORE_PROMOTION_V13_VERSION = 1;
export const RESTORE_UNDO_POINTER_V13_VERSION = 1;

const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const parse = value => { try { const v = JSON.parse(String(value ?? '')); return object(v) ? v : null; } catch { return null; } };
const safeJson = value => JSON.stringify(value);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
const intentKey = namespace => `restore_intent:${namespace}`;
const promotionKey = namespace => `canonical_restore_promotion_v13:${namespace}`;
const undoPointerKey = namespace => `canonical_restore_undo_pointer_v13:${namespace}`;
const checkpointKey = (namespace, checkpointId) => `canonical_restore_checkpoint_v13:${namespace}:${checkpointId}`;
const stageKey = stageNamespace => `canonical_restore_stage_v13:${stageNamespace}`;
const failure = reason => ({ supported: true, ok: false, reason });
const fault = async (injector, boundary) => { if (typeof injector === 'function') await injector(boundary); };
const exactCounts = (left, right) => {
  const a = normalizeCanonicalRestoreProofCountsV13(left);
  const b = normalizeCanonicalRestoreProofCountsV13(right);
  return !!a && !!b && Object.keys(a).every(key => a[key] === b[key]);
};
const validOwnedNamespace = (namespace, authUserId) => {
  const target = text(namespace); const owner = text(authUserId).toLowerCase();
  if (target === `user:${owner}`) return true;
  return /^workspace:[^:]+$/.test(target);
};

const mergeRestoredFinancialConfig = ({ currentPayload, stagePayload }) => {
  if (!object(stagePayload) || !object(stagePayload.cfg)) throw new Error('canonical_restore_promotion_v13_stage_workspace_invalid');
  if (currentPayload === null) throw new Error('canonical_restore_promotion_v13_local_workspace_invalid');
  const financialCfg = cloudWorkspaceCfg(stagePayload.cfg);
  if (object(currentPayload.localPreferences)) {
    return { ...currentPayload, localPreferences: { ...currentPayload.localPreferences,
      cfg: mergeCloudWorkspaceCfg(object(currentPayload.localPreferences.cfg) ? currentPayload.localPreferences.cfg : {}, financialCfg) } };
  }
  return { ...currentPayload, cfg: mergeCloudWorkspaceCfg(object(currentPayload.cfg) ? currentPayload.cfg : {}, financialCfg) };
};

const exactImmutableIntent = (intent, guard) => intent
  && intent.version === RESTORE_INTENT_V13_VERSION
  && Number.isSafeInteger(intent.stateVersion) && intent.stateVersion >= 1
  && ['intent_pending_server','server_epoch_proven'].includes(intent.status)
  && intent.namespace === guard.snapshot.namespace
  && intent.ledgerId === guard.snapshot.ledgerId
  && intent.operationId === guard.snapshot.operationId
  && intent.stageNamespace === guard.snapshot.stageNamespace
  && intent.checkpointId === guard.snapshot.checkpointId
  && intent.checkpointNamespace === guard.snapshot.checkpointNamespace
  && intent.fromEpoch === guard.snapshot.sourceRestoreEpoch
  && intent.toEpoch === guard.snapshot.sourceRestoreEpoch + 1
  && intent.sourceLiveGeneration === guard.snapshot.sourceLiveGeneration
  && intent.semanticHashVersion === guard.snapshot.semanticHashVersion
  && intent.incomingSemanticHash === guard.snapshot.incomingSemanticHash
  && intent.checkpointSemanticHash === guard.checkpoint.semanticHash
  && intent.validatorVersion === guard.snapshot.validatorVersion
  && exactCounts(intent.incomingCounts, guard.snapshot.incomingCounts)
  && exactCounts(intent.checkpointCounts, guard.checkpoint.counts)
  && ['restore','undo'].includes(intent.triggerKind)
  && intent.restoreProofDigest === guard.restoreProofDigest;

export const createStrategyBRestoreIntentV13InTransaction = async ({
  database, guardResult, authUserId, deviceId, triggerKind = 'restore',
} = {}) => {
  if (!database?.getFirstAsync || !database?.runAsync || !guardResult?.ok || !uuid(authUserId) || !text(deviceId)
      || text(deviceId).length > 200 || !validOwnedNamespace(guardResult?.snapshot?.namespace, authUserId)
      || !['restore','undo'].includes(text(triggerKind))) {
    throw new Error('restore_intent_v13_input_invalid');
  }
  const guard = guardResult;
  const now = new Date().toISOString();
  const state = {
    version: RESTORE_INTENT_V13_VERSION, stateVersion: 1, status: 'intent_pending_server', operation: 'backup_restore',
    triggerKind: text(triggerKind),
    namespace: guard.snapshot.namespace, authUserId: text(authUserId).toLowerCase(), ledgerId: guard.snapshot.ledgerId,
    fromEpoch: guard.snapshot.sourceRestoreEpoch, toEpoch: guard.snapshot.sourceRestoreEpoch + 1,
    sourceLiveGeneration: guard.snapshot.sourceLiveGeneration, semanticHashVersion: guard.snapshot.semanticHashVersion,
    operationId: guard.snapshot.operationId, deviceId: text(deviceId), stageNamespace: guard.snapshot.stageNamespace,
    checkpointId: guard.snapshot.checkpointId, checkpointNamespace: guard.snapshot.checkpointNamespace,
    incomingSemanticHash: guard.snapshot.incomingSemanticHash, incomingCounts: guard.snapshot.incomingCounts,
    checkpointSemanticHash: guard.checkpoint.semanticHash, checkpointCounts: guard.checkpoint.counts,
    validatorVersion: guard.snapshot.validatorVersion, restoreProofDigest: guard.restoreProofDigest,
    createdAt: now, updatedAt: now,
  };
  const key = intentKey(state.namespace);
  const existing = parse((await database.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key))?.value);
  if (existing) {
    if (!exactImmutableIntent(existing, guard) || existing.authUserId !== state.authUserId || existing.deviceId !== state.deviceId
        || existing.triggerKind !== state.triggerKind) {
      throw new Error('restore_intent_v13_conflict');
    }
    return Object.freeze({ ...existing });
  }
  await database.runAsync('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', key, safeJson(state), now);
  return Object.freeze(state);
};

export const recordStrategyBServerProofV13InTransaction = async ({
  database, namespace, operationId, serverProof,
} = {}) => {
  if (!database?.getFirstAsync || !database?.runAsync || !object(serverProof)) throw new Error('restore_server_proof_v13_input_invalid');
  const key = intentKey(text(namespace));
  const row = await database.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key);
  const intent = parse(row?.value);
  if (!intent || intent.version !== RESTORE_INTENT_V13_VERSION || intent.status !== 'intent_pending_server'
      || !Number.isSafeInteger(intent.stateVersion) || intent.stateVersion < 1
      || intent.operationId !== text(operationId).toLowerCase()) throw new Error('restore_server_proof_v13_intent_invalid');
  if (!serverProof.ok || !['advanced','already_advanced','evidence_resolved'].includes(text(serverProof.outcome))
      || !uuid(serverProof.eventId) || text(serverProof.ownerId).toLowerCase() !== intent.authUserId
      || text(serverProof.ledgerId) !== intent.ledgerId || Number(serverProof.fromEpoch) !== intent.fromEpoch
      || Number(serverProof.toEpoch) !== intent.toEpoch || text(serverProof.reason) !== 'backup_restore'
      || text(serverProof.deviceId) !== intent.deviceId || text(serverProof.operationId).toLowerCase() !== intent.operationId
      || text(serverProof.restoreProofDigest).toLowerCase() !== intent.restoreProofDigest) {
    throw new Error('restore_server_proof_v13_mismatch');
  }
  const now = new Date().toISOString();
  const next = { ...intent, stateVersion: intent.stateVersion + 1, status: 'server_epoch_proven',
    serverEventId: text(serverProof.eventId).toLowerCase(), serverProvedAt: serverProof.provedAt || now, updatedAt: now };
  const updated = await database.runAsync('UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?', safeJson(next), now, key, String(row.value));
  if (Number(updated?.changes || 0) !== 1) throw new Error('restore_server_proof_v13_compare_and_swap_failed');
  return Object.freeze(next);
};

export const promoteCanonicalRestoreStageV13 = async ({
  namespace, operationId, database = null, faultInjector = null,
} = {}) => {
  const target = text(namespace);
  const operation = text(operationId).toLowerCase();
  if (!target || !uuid(operation)) return failure('canonical_restore_promotion_v13_input_invalid');
  try {
    return await runFinancialRestorePromotionTransactionV8({ database, task: async actions => {
      const guard = await guardRestoreSourceBeforeEpochRpcInTransactionV13({ database: actions.database, namespace: target, operationId: operation });
      if (!guard.ok) throw new Error(guard.reason || 'restore_source_changed');
      const intentRow = await actions.database.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', intentKey(target));
      const intent = parse(intentRow?.value);
      const checkpointRow = await actions.database.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', checkpointKey(target, guard.snapshot.checkpointId));
      const checkpoint = parse(checkpointRow?.value);
      const stageWorkspaceRow = await actions.database.getFirstAsync('SELECT source_mode,schema_version,payload_json FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1', guard.snapshot.stageNamespace);
      const currentWorkspaceRow = await actions.database.getFirstAsync('SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1', target);

      if (!exactImmutableIntent(intent, guard) || intent.status !== 'server_epoch_proven' || intent.operation !== 'backup_restore'
          || !uuid(intent.authUserId) || !uuid(intent.serverEventId) || !text(intent.deviceId)
          || !checkpoint || checkpoint.status !== 'READY' || checkpoint.operationId !== operation
          || text(stageWorkspaceRow?.source_mode) !== 'shadow' || Number(stageWorkspaceRow?.schema_version) !== FINANCIAL_LEDGER_SCHEMA_VERSION) {
        throw new Error('canonical_restore_promotion_v13_precondition_failed');
      }
      const stagePayload = parse(stageWorkspaceRow.payload_json);
      const currentPayload = currentWorkspaceRow ? parse(currentWorkspaceRow.payload_json) : {};
      const restoredWorkspacePayload = mergeRestoredFinancialConfig({ currentPayload, stagePayload });
      const now = new Date().toISOString();
      await fault(faultInjector, 'before_live_clear');
      await actions.clearFinancialNamespace(target);
      await fault(faultInjector, 'after_live_clear');
      await actions.copyFinancialNamespaceFromStage({ namespace: target, stageNamespace: guard.snapshot.stageNamespace });
      await fault(faultInjector, 'after_hot_copy');
      await actions.replaceColdArchiveNamespaceFromStage({ namespace: target, stageNamespace: guard.snapshot.stageNamespace });
      await fault(faultInjector, 'after_archive_replace');
      await actions.database.runAsync(
        `INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`, target, 'sqlite', FINANCIAL_LEDGER_SCHEMA_VERSION, guard.snapshot.incomingSemanticHash,
        now, now, now, safeJson(restoredWorkspacePayload), now,
      );
      await fault(faultInjector, 'after_workspace_state');

      const previousPointerRow = await actions.database.getFirstAsync(
        'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', undoPointerKey(target),
      );
      const previousPointer = previousPointerRow ? parse(previousPointerRow.value) : null;
      if (previousPointerRow) {
        if (!previousPointer || previousPointer.version !== RESTORE_UNDO_POINTER_V13_VERSION
            || previousPointer.namespace !== target || previousPointer.ledgerId !== guard.snapshot.ledgerId
            || !uuid(previousPointer.checkpointId)
            || previousPointer.checkpointNamespace !== `${target}::restore-checkpoint::${previousPointer.checkpointId}`) {
          throw new Error('canonical_restore_promotion_v13_existing_undo_pointer_invalid');
        }
        if (previousPointer.checkpointId !== guard.snapshot.checkpointId) {
          const previousCheckpointKey = checkpointKey(target, previousPointer.checkpointId);
          const previousCheckpointRow = await actions.database.getFirstAsync(
            'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', previousCheckpointKey,
          );
          const previousCheckpoint = parse(previousCheckpointRow?.value);
          if (!previousCheckpoint || previousCheckpoint.status !== 'REFERENCED_FOR_UNDO'
              || previousCheckpoint.checkpointId !== previousPointer.checkpointId
              || previousCheckpoint.checkpointNamespace !== previousPointer.checkpointNamespace
              || previousCheckpoint.ledgerId !== previousPointer.ledgerId) {
            throw new Error('canonical_restore_promotion_v13_existing_undo_checkpoint_invalid');
          }
          const demotedCheckpoint = {
            ...previousCheckpoint,
            stateVersion: Number(previousCheckpoint.stateVersion) + 1,
            status: 'GARBAGE_COLLECTABLE',
            unreferencedAt: now,
            supersededByCheckpointId: guard.snapshot.checkpointId,
            updatedAt: now,
          };
          const previousUpdated = await actions.database.runAsync(
            'UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?',
            safeJson(demotedCheckpoint), now, previousCheckpointKey, String(previousCheckpointRow.value),
          );
          if (Number(previousUpdated?.changes || 0) !== 1) {
            throw new Error('canonical_restore_promotion_v13_existing_undo_checkpoint_compare_and_swap_failed');
          }
          await fault(faultInjector, 'after_previous_undo_checkpoint_demoted');
        }
      }

      const pointer = {
        version: RESTORE_UNDO_POINTER_V13_VERSION,
        namespace: target,
        checkpointId: guard.snapshot.checkpointId,
        checkpointNamespace: guard.snapshot.checkpointNamespace,
        ledgerId: guard.snapshot.ledgerId,
        sourceRestoreEpoch: guard.snapshot.sourceRestoreEpoch,
        sourceLiveGeneration: guard.snapshot.sourceLiveGeneration,
        semanticHashVersion: guard.snapshot.semanticHashVersion,
        semanticHash: guard.checkpoint.semanticHash,
        counts: normalizeCanonicalRestoreProofCountsV13(guard.checkpoint.counts),
        validatorVersion: guard.checkpoint.validatorVersion,
        sourceOperationId: operation,
        referencedAt: now,
      };
      if (!pointer.counts || !Number.isSafeInteger(pointer.validatorVersion) || pointer.validatorVersion < 1) {
        throw new Error('canonical_restore_promotion_v13_checkpoint_proof_invalid');
      }
      await actions.database.runAsync('INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', undoPointerKey(target), safeJson(pointer), now);
      const referencedCheckpoint = { ...checkpoint, stateVersion: Number(checkpoint.stateVersion) + 1,
        status: 'REFERENCED_FOR_UNDO', referencedAt: now, updatedAt: now };
      const checkpointUpdated = await actions.database.runAsync(
        'UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?', safeJson(referencedCheckpoint), now,
        checkpointKey(target, guard.snapshot.checkpointId), String(checkpointRow.value),
      );
      if (Number(checkpointUpdated?.changes || 0) !== 1) throw new Error('canonical_restore_promotion_v13_checkpoint_compare_and_swap_failed');
      await fault(faultInjector, 'after_undo_pointer');

      const promotion = {
        version: RESTORE_PROMOTION_V13_VERSION, stateVersion: Number(intent.stateVersion) + 1,
        status: 'local_promoted_pending_reload', namespace: target, authUserId: intent.authUserId,
        ledgerId: intent.ledgerId, fromEpoch: intent.fromEpoch, toEpoch: intent.toEpoch,
        operation: 'backup_restore', operationId: operation, triggerKind: text(intent.triggerKind || 'restore'),
        serverEventId: intent.serverEventId, deviceId: intent.deviceId, restoreProofDigest: intent.restoreProofDigest,
        stageNamespace: guard.snapshot.stageNamespace, checkpointId: guard.snapshot.checkpointId,
        semanticHashVersion: guard.snapshot.semanticHashVersion, semanticHash: guard.snapshot.incomingSemanticHash,
        counts: guard.snapshot.incomingCounts, validatorVersion: guard.snapshot.validatorVersion,
        sourceLiveGeneration: guard.snapshot.sourceLiveGeneration, serverProvedAt: intent.serverProvedAt || null, promotedAt: now,
      };
      await actions.database.runAsync('INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', promotionKey(target), safeJson(promotion), now);
      await fault(faultInjector, 'after_restore_metadata');

      const advanced = await actions.advanceRestoreEpoch({ namespace: target, expectedFromEpoch: intent.fromEpoch, toEpoch: intent.toEpoch });
      await fault(faultInjector, 'after_epoch_cas');

      await actions.clearFinancialNamespace(guard.snapshot.stageNamespace);
      await actions.clearColdArchiveNamespace(guard.snapshot.stageNamespace);
      await actions.database.runAsync('DELETE FROM ledger_v7_meta WHERE key=?', stageKey(guard.snapshot.stageNamespace));
      await actions.database.runAsync('DELETE FROM ledger_v7_meta WHERE key=?', `canonical_restore_undo_stage_build_v13:${target}:${operation}`);
      await fault(faultInjector, 'after_stage_cleanup');
      return { supported: true, ok: true, namespace: target, ledgerId: advanced.ledgerId,
        restoreEpoch: advanced.restoreEpoch, liveGeneration: advanced.liveGeneration,
        operationId: operation, restoreProofDigest: intent.restoreProofDigest, undoPointer: pointer };
    }});
  } catch (error) {
    return failure(text(error?.message) || 'canonical_restore_promotion_v13_failed');
  }
};
