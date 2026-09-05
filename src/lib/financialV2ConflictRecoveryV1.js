// Phase 12 — preparation for the one proven V2 recovery case: a stale,
// non-financial workspace command blocks downloads although the cloud is the
// authoritative ledger.  This module *never* replaces the live namespace.
// It verifies and stages the cloud first, creates a complete local checkpoint,
// then records a bounded intent for a separately confirmed promotion.

import { getLedgerDb } from './ledgerDatabase';
import {
  createFinancialConflictRecoveryCheckpointV1,
  runFinancialRestorePromotionTransactionV8,
} from './financialLedgerV7Repository';
import { readLiveGenerationInTransactionV13 } from './financialLiveGenerationV13';
import { stageVerifiedBootstrapWithArchiveV2 } from './financialBootstrapRecoveryCoordinatorV2';
import {
  assertConflictCheckpoint,
  assertOnlyPreparedWorkspaceMutations,
  promotePreparedCloudConflictRecoveryV1,
} from './financialBootstrapRecoveryPromotionV2';
import { createSecureUuidV4 } from './secureUuid';

const text = value => String(value ?? '').trim();
const parse = value => { try { return JSON.parse(String(value ?? '')); } catch { return null; } };
const intentKey = namespace => `financial_v2_conflict_recovery_intent_v1:${text(namespace)}`;
const checkpointKey = (namespace, id) => `financial_v2_conflict_checkpoint_v1:${text(namespace)}:${text(id)}`;
// A rolled-back recovery is finished as an *operation*, but the V2 conflict it
// was meant to repair is still there: the restored ledger sits at its old
// revision while the cloud has moved on. Releasing the gate here would let the
// V1 fallback resume writing the same rejected workspace commands that made
// this recovery necessary, so the block stays until a reviewed path ends it.
const ACTIVE_CONFLICT_RECOVERY_INTENT_STATUSES = new Set([
  'ready_for_explicit_cloud_replacement',
  'local_promoted_pending_activation',
  'rolled_back_after_activation_failure',
]);
const failure = (reason, extra = {}) => ({
  supported: true, ok: false, reason: text(reason) || 'financial_v2_conflict_recovery_prepare_failed', ...extra,
});

const FINANCIAL_KEYS = new Set([
  'trans', 'transactions', 'wallets', 'debts', 'goals', 'commitments',
  'postings', 'accounts', 'links', 'exchangerates', 'originaltransaction', 'transaction',
]);
const OUTER_KEYS = new Set([
  'namespace', 'entityType', 'id', 'revision', 'baseRevision', 'deletedAt',
  'payload', 'createdAt', 'updatedAt',
]);
const INNER_KEYS = new Set(['cfg', 'notif', 'cloudRevision']);

const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const containsFinancialData = (value, depth = 0) => {
  if (value == null || depth > 8) return false;
  if (Array.isArray(value)) return value.slice(0, 16).some(item => containsFinancialData(item, depth + 1));
  if (!object(value)) return false;
  return Object.entries(value).some(([key, child]) => (
    FINANCIAL_KEYS.has(String(key).toLowerCase()) || containsFinancialData(child, depth + 1)
  ));
};

// The whitelist is deliberately smaller than a normal workspace payload. A
// recovery may quarantine only setup metadata; a financial value makes this
// path fail closed and leaves all data untouched for manual recovery.
// Exported so the narrow repair path proves staleness with this exact
// definition rather than a second copy of it: the two must never drift.
export const staleWorkspaceCommand = (row, cloudWorkspaceRevision) => {
  const envelope = parse(row?.payload_json);
  const payload = object(envelope?.payload) ? envelope.payload : null;
  const revision = Number(row?.revision);
  const baseRevision = Number(row?.base_revision);
  return object(envelope)
    && object(payload)
    && Object.keys(envelope).every(key => OUTER_KEYS.has(key))
    && Object.keys(payload).every(key => INNER_KEYS.has(key))
    && object(payload.cfg)
    && Object.prototype.hasOwnProperty.call(payload, 'cloudRevision')
    && !containsFinancialData(envelope)
    && text(row?.entity_type) === 'workspace'
    && text(row?.entity_id) === 'workspace'
    && text(row?.operation) === 'upsert'
    && text(envelope.namespace) === text(row?.namespace)
    && text(envelope.entityType) === 'workspace'
    && text(envelope.id) === 'workspace'
    && Number.isSafeInteger(revision) && revision > 0
    && Number.isSafeInteger(baseRevision) && baseRevision === revision - 1
    && Number(envelope.revision) === revision
    && Number(envelope.baseRevision) === baseRevision
    && baseRevision < cloudWorkspaceRevision
    && revision <= cloudWorkspaceRevision;
};

const sameCandidate = (left, right) => (
  left?.ledgerId === right?.ledgerId
  && Number(left?.restoreEpoch) === Number(right?.restoreEpoch)
  && Number(left?.cloudWorkspaceRevision) === Number(right?.cloudWorkspaceRevision)
  && Number(left?.legacyOutboxCount) === Number(right?.legacyOutboxCount)
  && JSON.stringify(left?.shadow || []) === JSON.stringify(right?.shadow || [])
);

const sameVerifiedCloud = (intent, staged) => (
  text(intent?.cloud?.ledgerId) === text(staged?.bootstrapSource?.ledgerId)
  && Number(intent?.cloud?.restoreEpoch) === Number(staged?.bootstrapSource?.restoreEpoch)
  && text(intent?.cloud?.bootstrapId) === text(staged?.bootstrapSource?.bootstrapId)
  && text(intent?.cloud?.manifestHash).toLowerCase() === text(staged?.bootstrapSource?.manifestHash).toLowerCase()
  && Number(intent?.cloud?.expectedRowCount) === Number(staged?.bootstrapSource?.expectedRowCount)
  && Boolean(intent?.cloud?.archivePresent) === Boolean(staged?.archiveHead?.archivePresent)
  && Number(intent?.cloud?.archiveGeneration || 0) === Number(staged?.archiveHead?.archiveGeneration || 0)
  && text(intent?.cloud?.archiveSnapshotId) === text(staged?.archiveHead?.snapshotId)
  && text(intent?.cloud?.archiveManifestHash).toLowerCase() === text(staged?.archiveHead?.manifestHash).toLowerCase()
  && Number(intent?.cloud?.archiveExpectedRowCount || 0) === Number(staged?.archiveHead?.expectedRowCount || 0)
);

const inspectCandidate = async ({ db, namespace, cloudSource }) => {
  const target = text(namespace);
  const [identity, sync, liveWorkspace, cloudWorkspace, pending, legacy] = await Promise.all([
    db.getFirstAsync(`SELECT namespace,ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target),
    db.getFirstAsync(`SELECT activated_at FROM ledger_sync_state_v8 WHERE ledger_id=(SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1)
      AND restore_epoch=(SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1) LIMIT 1`, target, target),
    db.getFirstAsync(`SELECT 1 AS present FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1`, target),
    db.getFirstAsync(`SELECT revision,deleted_at FROM ledger_entities_v7 WHERE namespace=? AND entity_type='workspace' AND id='workspace' LIMIT 1`, cloudSource.stageNamespace),
    db.getAllAsync(`SELECT sequence_id,mutation_id,command_id,namespace,ledger_id,restore_epoch,entity_type,entity_id,operation,revision,base_revision,payload_json
      FROM ledger_outbox_v3 WHERE namespace=? AND ledger_id=(SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1)
      AND restore_epoch=(SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1)
      AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL ORDER BY sequence_id`, target, target, target),
    db.getFirstAsync(`SELECT COUNT(*) AS n FROM ledger_outbox_v2 WHERE namespace=? AND acknowledged_at IS NULL`, target),
  ]);
  if (!identity?.ledger_id || !sync?.activated_at || !liveWorkspace?.present) {
    throw new Error('financial_v2_conflict_recovery_local_protocol_not_active');
  }
  if (text(identity.ledger_id) !== text(cloudSource.ledgerId)
      || Number(identity.restore_epoch) !== Number(cloudSource.restoreEpoch)) {
    throw new Error('financial_v2_conflict_recovery_cloud_identity_mismatch');
  }
  const cloudWorkspaceRevision = Number(cloudWorkspace?.revision);
  if (!cloudWorkspace || cloudWorkspace.deleted_at || !Number.isSafeInteger(cloudWorkspaceRevision) || cloudWorkspaceRevision < 1) {
    throw new Error('financial_v2_conflict_recovery_cloud_workspace_missing');
  }
  if (!pending.length || pending.length > 16
      || !pending.every(row => staleWorkspaceCommand(row, cloudWorkspaceRevision))) {
    throw new Error('financial_v2_conflict_recovery_pending_mutations_not_safe');
  }
  return Object.freeze({
    ledgerId: text(identity.ledger_id),
    restoreEpoch: Number(identity.restore_epoch),
    cloudWorkspaceRevision,
    legacyOutboxCount: Math.max(0, Number(legacy?.n || 0)),
    shadow: pending.map(row => Object.freeze({
      sequenceId: Number(row.sequence_id), mutationId: text(row.mutation_id), commandId: text(row.command_id),
      revision: Number(row.revision), baseRevision: Number(row.base_revision), payloadJson: text(row.payload_json),
    })),
  });
};

// This intentionally narrow read gate is used before an ordinary cloud sync
// starts. It does not resume, validate, or mutate recovery state: its only job
// is to keep every automatic sync path outside a still-active recovery.
export const hasActiveV2ConflictRecoveryIntentV1 = async ({
  namespace = 'guest', accountId, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const db = database || await getLedgerDb();
  if (!db || !target || !owner) return false;
  try {
    const row = await db.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, intentKey(target),
    );
    const intent = parse(row?.value);
    return text(intent?.accountId) === owner
      && ACTIVE_CONFLICT_RECOVERY_INTENT_STATUSES.has(text(intent?.status));
  } catch {
    return false;
  }
};

/**
 * This only reaches "ready_for_explicit_cloud_replacement".  The caller must
 * still ask the user to confirm the already-verified cloud copy; no live data,
 * transport row, cursor, or cloud state is changed here.
 */
export const prepareVerifiedCloudConflictRecoveryV1 = async ({
  supabase, namespace = 'guest', accountId, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  if (!target || !owner) return failure('financial_v2_conflict_recovery_input_invalid');

  // Download and prove cloud data before retaining a new local checkpoint.
  const staged = await stageVerifiedBootstrapWithArchiveV2({
    supabase, namespace: target, accountId: owner, database: db,
  });
  if (!staged?.ok) return staged;
  const cloudSource = {
    ledgerId: text(staged.bootstrapSource?.ledgerId),
    restoreEpoch: Number(staged.bootstrapSource?.restoreEpoch),
    bootstrapId: text(staged.bootstrapSource?.bootstrapId),
    manifestHash: text(staged.bootstrapSource?.manifestHash).toLowerCase(),
    expectedRowCount: Number(staged.bootstrapSource?.expectedRowCount),
    stageNamespace: text(staged.bootstrap?.session?.stage_namespace),
  };
  if (!cloudSource.stageNamespace) return failure('financial_v2_conflict_recovery_stage_namespace_missing');

  let candidate;
  try { candidate = await inspectCandidate({ db, namespace: target, cloudSource }); }
  catch (error) { return failure(error?.message); }

  const checkpointId = createSecureUuidV4();
  const checkpointed = await createFinancialConflictRecoveryCheckpointV1({
    namespace: target, checkpointId, database: db,
  });
  if (!checkpointed?.ok) return failure(checkpointed?.reason || 'financial_v2_conflict_recovery_checkpoint_failed');

  try {
    return await runFinancialRestorePromotionTransactionV8({ database: db, task: async actions => {
      const [existing, checkpointRow] = await Promise.all([
        actions.database.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, intentKey(target)),
        actions.database.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, checkpointKey(target, checkpointId)),
      ]);
      if (existing?.value) throw new Error('financial_v2_conflict_recovery_intent_already_exists');
      const checkpoint = parse(checkpointRow?.value);
      if (!checkpoint || checkpoint.checkpointId !== checkpointId
          || checkpoint.checkpointNamespace !== checkpointed.checkpoint?.checkpointNamespace
          || checkpoint.ledgerId !== candidate.ledgerId || Number(checkpoint.restoreEpoch) !== candidate.restoreEpoch) {
        throw new Error('financial_v2_conflict_recovery_checkpoint_receipt_invalid');
      }
      const current = await inspectCandidate({ db: actions.database, namespace: target, cloudSource });
      if (!sameCandidate(candidate, current)) throw new Error('financial_v2_conflict_recovery_local_state_changed');
      const generation = await readLiveGenerationInTransactionV13({
        database: actions.database, namespace: target, ledgerId: candidate.ledgerId, restoreEpoch: candidate.restoreEpoch,
      });
      if (Number(generation.generation) !== Number(checkpoint.sourceGeneration)) {
        throw new Error('financial_v2_conflict_recovery_generation_changed');
      }
      const now = new Date().toISOString();
      const intent = {
        version: 1, status: 'ready_for_explicit_cloud_replacement', namespace: target, accountId: owner,
        cloud: {
          ledgerId: cloudSource.ledgerId, restoreEpoch: cloudSource.restoreEpoch,
          bootstrapId: cloudSource.bootstrapId, manifestHash: cloudSource.manifestHash,
          expectedRowCount: cloudSource.expectedRowCount, bootstrapSessionId: staged.bootstrapSessionId,
          archiveSessionId: staged.archiveSessionId,
          archivePresent: staged.archiveHead?.archivePresent === true,
          archiveGeneration: Number(staged.archiveHead?.archiveGeneration || 0),
          archiveSnapshotId: text(staged.archiveHead?.snapshotId),
          archiveManifestHash: text(staged.archiveHead?.manifestHash).toLowerCase(),
          archiveExpectedRowCount: Number(staged.archiveHead?.expectedRowCount || 0),
        },
        local: {
          checkpointId, checkpointNamespace: checkpoint.checkpointNamespace,
          sourceGeneration: Number(checkpoint.sourceGeneration), legacyOutboxCount: candidate.legacyOutboxCount,
          staleWorkspaceMutationIds: candidate.shadow.map(row => row.mutationId),
          staleWorkspaceMutations: candidate.shadow,
          cloudWorkspaceRevision: candidate.cloudWorkspaceRevision,
        },
        preparedAt: now,
      };
      await actions.database.runAsync(`INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, intentKey(target), JSON.stringify(intent), now);
      return { supported: true, ok: true, status: intent.status, intent };
    }});
  } catch (error) {
    return failure(error?.message);
  }
};

// A process restart can discard the in-memory UI state after preparation while
// leaving its intentionally durable checkpoint and intent intact. This is only
// an advisory read path: confirm still re-downloads cloud data and repeats all
// destructive preconditions inside its one atomic local transaction.
export const resumePreparedCloudConflictRecoveryV1 = async ({
  namespace = 'guest', accountId, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, found: false, reason: 'sqlite_unavailable' };
  if (!target || !owner) return failure('financial_v2_conflict_recovery_input_invalid', { found: false });

  try {
    const restoreIntent = await db.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, `restore_intent:${target}`,
    );
    if (restoreIntent?.value) {
      return failure('financial_v2_conflict_recovery_resume_restore_intent_active', { found: true });
    }
    const intentRow = await db.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, intentKey(target),
    );
    if (!intentRow?.value) return { supported: true, ok: false, found: false };
    const intent = parse(intentRow.value);
    // These five were one reason string. Every one of them still fails closed
    // exactly as before -- what changes is only that the device can say WHICH
    // one, because a real account reached this state on 2026-09-05 and neither
    // Planning & Audit nor Implementation could tell an abandoned intent from a
    // wrong-account one without a device round-trip. An intent for a different
    // account is a very different fact from an intent left by an older build.
    const intentReason = !intent
      ? 'financial_v2_conflict_recovery_resume_intent_unparseable'
      : intent.version !== 1
        ? 'financial_v2_conflict_recovery_resume_intent_version'
        : intent.status !== 'ready_for_explicit_cloud_replacement'
          ? 'financial_v2_conflict_recovery_resume_intent_status'
          : intent.namespace !== target
            ? 'financial_v2_conflict_recovery_resume_intent_namespace'
            : intent.accountId !== owner
              ? 'financial_v2_conflict_recovery_resume_intent_account'
              : null;
    if (intentReason) {
      return failure(intentReason, {
        found: true,
        // Enough to classify the stale intent without exposing its contents:
        // no amounts, no ids beyond what the caller already knows.
        intentDiagnostics: {
          parsed: !!intent,
          version: intent ? Number(intent.version) || null : null,
          status: intent ? text(intent.status) || null : null,
          namespaceMatches: intent ? intent.namespace === target : null,
          accountMatches: intent ? intent.accountId === owner : null,
        },
      });
    }
    const identity = await db.getFirstAsync(
      `SELECT namespace,ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target,
    );
    if (!identity?.ledger_id || text(identity.namespace) !== target
        || text(identity.ledger_id) !== text(intent.cloud?.ledgerId)
        || Number(identity.restore_epoch) !== Number(intent.cloud?.restoreEpoch)) {
      return failure('financial_v2_conflict_recovery_resume_identity_changed', { found: true });
    }
    await assertConflictCheckpoint(db, target, text(intent.local?.checkpointId), identity, intent);
    await assertOnlyPreparedWorkspaceMutations(db, target, identity, intent);
    return { supported: true, ok: true, found: true, resumed: true, intent };
  } catch (error) {
    return failure(error?.message, { found: true });
  }
};

// This second half must be called only after the UI presents the checkpoint
// information and the account owner explicitly confirms that the verified
// cloud ledger should replace the currently inconsistent local projection.
// It re-downloads and re-proves the cloud immediately before the atomic local
// replacement, so an old prepared intent can never promote a changed source.
export const confirmPreparedCloudConflictRecoveryV1 = async ({
  supabase, namespace = 'guest', accountId, confirmed = false, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  if (!confirmed || !target || !owner) return failure('financial_v2_conflict_recovery_confirmation_required');
  const intent = parse((await db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, intentKey(target)))?.value);
  if (!intent || intent.status !== 'ready_for_explicit_cloud_replacement' || intent.namespace !== target || intent.accountId !== owner) {
    return failure('financial_v2_conflict_recovery_confirmation_intent_missing');
  }
  const staged = await stageVerifiedBootstrapWithArchiveV2({
    supabase, namespace: target, accountId: owner, database: db,
  });
  if (!staged?.ok) return staged;
  if (!sameVerifiedCloud(intent, staged)) return failure('financial_v2_conflict_recovery_cloud_changed');
  return promotePreparedCloudConflictRecoveryV1({
    namespace: target, accountId: owner, checkpointId: text(intent.local?.checkpointId),
    bootstrapSessionId: staged.bootstrapSessionId, archiveSessionId: staged.archiveSessionId,
    bootstrapSource: staged.bootstrapSource, archiveHead: staged.archiveHead,
    confirmed: true, database: db,
  });
};
