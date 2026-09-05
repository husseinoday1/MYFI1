// MYFI — preparing and confirming the adoption of a different cloud identity.
//
// Sibling of financialV2ConflictRecoveryV1, for the case that one refuses by
// design: the account already has a cloud ledger from another device or
// install, this device made its own, and the two can never match. That refusal
// is right for its case; this is the path for ours.
//
// Same shape as the flow it sits beside, on purpose: verify and stage the cloud
// first, take a complete local checkpoint, record a bounded intent, and let a
// separate confirmed step do anything destructive. Nothing here replaces the
// live namespace.
//
// What is different is the middle: instead of refusing when pending mutations
// are not all stale workspace commands, this catalogues them for the owner to
// rule on one at a time. The promotion will not run until every one carries an
// explicit decision.

import { getLedgerDb } from './ledgerDatabase';
import {
  commitEntityChangesV7,
  commitFinancialTransactionV7,
  createFinancialConflictRecoveryCheckpointV1,
  ensureLedgerSyncIdentityV8,
} from './financialLedgerV7Repository';
import { stageVerifiedBootstrapWithArchiveV2 } from './financialBootstrapRecoveryCoordinatorV2';
import { createSecureUuidV4 } from './secureUuid';
import {
  ADOPTION_INTENT_STATUS,
  adoptionAppliesV1,
  describePendingMutationsV1,
} from './financialV2IdentityAdoptionV1';
import {
  adoptionIntentKey,
  adoptionReentryQueueKey,
  promoteCloudIdentityAdoptionV1,
} from './financialV2IdentityAdoptionPromotionV1';

const text = value => String(value ?? '').trim();
const parse = value => { try { return JSON.parse(String(value ?? '')); } catch { return null; } };
const failure = (reason, extra = {}) => ({
  supported: true, ok: false, reason: text(reason) || 'financial_v2_identity_adoption_failed', ...extra,
});

const readPendingForNamespace = (db, namespace, ledgerId, restoreEpoch) => db.getAllAsync(
  `SELECT sequence_id,mutation_id,command_id,namespace,ledger_id,restore_epoch,entity_type,entity_id,
          operation,revision,base_revision,payload_json,created_at
     FROM ledger_outbox_v3
    WHERE namespace=? AND ledger_id=? AND restore_epoch=?
      AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL
    ORDER BY sequence_id`,
  namespace, ledgerId, Number(restoreEpoch),
);

/**
 * Read-only. Answers "is this device in the state this path is for, and what
 * would the owner have to rule on?" without downloading anything or touching
 * the ledger -- so a screen can ask it freely.
 */
export const inspectCloudIdentityAdoptionV1 = async ({
  namespace = 'guest', cloudLedgerId, cloudRestoreEpoch, database = null,
} = {}) => {
  const target = text(namespace);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  if (!target) return failure('financial_v2_identity_adoption_input_invalid');

  const identity = await db.getFirstAsync(
    `SELECT namespace,ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target,
  );
  const applies = adoptionAppliesV1({
    localIdentity: identity,
    cloudSource: { ledgerId: cloudLedgerId, restoreEpoch: cloudRestoreEpoch },
  });
  if (!applies.applies) return failure(applies.reason, { applies: false });

  const pending = await readPendingForNamespace(db, target, text(identity.ledger_id), identity.restore_epoch);
  return {
    supported: true,
    ok: true,
    applies: true,
    local: { ledgerId: text(identity.ledger_id), restoreEpoch: Number(identity.restore_epoch) },
    cloud: { ledgerId: text(cloudLedgerId), restoreEpoch: Number(cloudRestoreEpoch) },
    // What the owner will be asked to rule on, described well enough to
    // recognise. Not a diagnostics payload -- this is their own data, shown to
    // them, and must not be routed anywhere copyable.
    review: describePendingMutationsV1(pending),
  };
};

/**
 * Downloads and proves the cloud ledger, takes a checkpoint, and records the
 * intent. Still destroys nothing: the promotion is a separate, confirmed step.
 */
export const prepareCloudIdentityAdoptionV1 = async ({
  supabase, namespace = 'guest', accountId, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  if (!target || !owner) return failure('financial_v2_identity_adoption_input_invalid');

  const existing = await db.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, adoptionIntentKey(target),
  );
  if (existing?.value) {
    // An intent already prepared is resumed, never silently replaced: replacing
    // it would discard the checkpoint the owner's data is protected by.
    const intent = parse(existing.value);
    return {
      supported: true, ok: intent?.status === ADOPTION_INTENT_STATUS,
      resumed: true, status: text(intent?.status) || null, intent,
      reason: intent?.status === ADOPTION_INTENT_STATUS ? null : 'financial_v2_identity_adoption_intent_not_resumable',
    };
  }

  const identity = await ensureLedgerSyncIdentityV8({ namespace: target, database: db });
  if (!identity?.ledgerId) return failure('financial_v2_identity_adoption_local_identity_missing');

  // Prove the cloud before anything local is written down about it.
  const staged = await stageVerifiedBootstrapWithArchiveV2({
    supabase, namespace: target, accountId: owner, database: db,
  });
  if (!staged?.ok) return staged;

  const cloud = {
    ledgerId: text(staged.bootstrapSource?.ledgerId),
    restoreEpoch: Number(staged.bootstrapSource?.restoreEpoch),
    bootstrapId: text(staged.bootstrapSource?.bootstrapId),
    manifestHash: text(staged.bootstrapSource?.manifestHash).toLowerCase(),
    expectedRowCount: Number(staged.bootstrapSource?.expectedRowCount),
  };

  // Re-checked against the proven cloud source, not the caller's claim about
  // it. If they match, this is not an adoption and the other path owns it.
  const applies = adoptionAppliesV1({ localIdentity: identity, cloudSource: cloud });
  if (!applies.applies) return failure(applies.reason, { applies: false });

  const pending = await readPendingForNamespace(db, target, text(identity.ledgerId), identity.restoreEpoch);
  const review = describePendingMutationsV1(pending);

  const checkpointId = createSecureUuidV4();
  const checkpointed = await createFinancialConflictRecoveryCheckpointV1({
    namespace: target, checkpointId, database: db,
  });
  if (!checkpointed?.ok) {
    return failure(checkpointed?.reason || 'financial_v2_identity_adoption_checkpoint_failed');
  }

  const now = new Date().toISOString();
  const intent = {
    version: 1,
    status: ADOPTION_INTENT_STATUS,
    namespace: target,
    accountId: owner,
    cloud: {
      ...cloud,
      bootstrapSessionId: staged.bootstrapSessionId,
      archiveSessionId: staged.archiveSessionId,
      archiveGeneration: Number(staged.archiveHead?.archiveGeneration || 0),
    },
    local: {
      ledgerId: text(identity.ledgerId),
      restoreEpoch: Number(identity.restoreEpoch),
      checkpointId,
      checkpointNamespace: checkpointed.checkpoint?.checkpointNamespace || null,
      // The exact set the owner is about to rule on. The promotion re-reads the
      // live rows and refuses if they have changed, so this is a record of what
      // was reviewed rather than the thing it trusts.
      reviewedSequenceIds: review.map(row => row.sequenceId),
      reviewedCount: review.length,
    },
    preparedAt: now,
  };
  await db.runAsync(
    `INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
    adoptionIntentKey(target), JSON.stringify(intent), now,
  );
  return { supported: true, ok: true, status: intent.status, intent, review };
};

/**
 * Re-applies the mutations the owner chose to keep, after the adoption.
 *
 * Through the ORDINARY commit paths, deliberately. A kept mutation's revision
 * chain was computed against the ledger that was just replaced and cannot be
 * carried over; these paths already compute revisions against current state and
 * write correct outbox rows under the adopted identity. Re-deriving that by
 * hand is the arithmetic this whole design avoids.
 *
 * One entry at a time, each removed from the queue only once it has actually
 * been applied. A failure leaves that entry queued with its reason and does not
 * stop the others -- losing one of the owner's entries silently is the outcome
 * that matters most here.
 *
 * The commit functions are injectable so this can be tested without standing up
 * the whole repository; production callers pass nothing and get the real ones.
 */
export const drainCloudIdentityAdoptionReentryV1 = async ({
  namespace = 'guest', wallets = [], baseCurrency = 'IQD', database = null,
  commitTransaction = null, commitEntities = null,
} = {}) => {
  const target = text(namespace);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };

  const row = await db.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, adoptionReentryQueueKey(target),
  );
  if (!row?.value) return { supported: true, ok: true, drained: 0, remaining: 0, empty: true };

  const queue = parse(row.value);
  const entries = Array.isArray(queue?.entries) ? queue.entries : [];
  if (!entries.length) {
    await db.runAsync(`DELETE FROM ledger_v7_meta WHERE key=?`, adoptionReentryQueueKey(target));
    return { supported: true, ok: true, drained: 0, remaining: 0, empty: true };
  }

  const commitTx = commitTransaction || commitFinancialTransactionV7;
  const commitEnt = commitEntities || commitEntityChangesV7;

  const remaining = [];
  const applied = [];
  const failed = [];
  for (const entry of entries) {
    const payload = parse(entry?.payloadJson) || {};
    try {
      let result;
      if (text(entry?.entityType) === 'financial_transaction') {
        // The stored payload keeps the transaction exactly as the app first
        // submitted it, which is what this path expects.
        const original = payload.originalTransaction;
        if (!original) throw new Error('financial_v2_identity_adoption_reentry_payload_missing');
        result = await commitTx({
          namespace: target, transaction: original, wallets, baseCurrency, entityChanges: [],
        });
      } else {
        const entityPayload = payload.payload ?? payload;
        result = await commitEnt({
          namespace: target,
          changes: [{ entityType: text(entry.entityType), id: text(entry.entityId), payload: entityPayload }],
        });
      }
      if (result?.supported && !result?.ok) {
        throw new Error(result.reason || 'financial_v2_identity_adoption_reentry_rejected');
      }
      applied.push({ sequenceId: entry.sequenceId, entityType: entry.entityType, entityId: entry.entityId });
    } catch (error) {
      const reason = text(error?.message) || 'financial_v2_identity_adoption_reentry_failed';
      failed.push({ sequenceId: entry.sequenceId, entityType: entry.entityType, entityId: entry.entityId, reason });
      remaining.push({ ...entry, lastError: reason });
    }
  }

  const now = new Date().toISOString();
  if (remaining.length) {
    await db.runAsync(
      `UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=?`,
      JSON.stringify({ ...queue, entries: remaining, lastDrainAt: now }), now,
      adoptionReentryQueueKey(target),
    );
  } else {
    await db.runAsync(`DELETE FROM ledger_v7_meta WHERE key=?`, adoptionReentryQueueKey(target));
  }

  return {
    supported: true,
    ok: failed.length === 0,
    drained: applied.length,
    remaining: remaining.length,
    applied,
    failed,
    reason: failed.length ? 'financial_v2_identity_adoption_reentry_partial' : null,
  };
};

/**
 * Re-downloads and re-proves the cloud, checks it still matches what was
 * reviewed, then hands the owner's per-row decisions to the promotion.
 */
export const confirmCloudIdentityAdoptionV1 = async ({
  supabase, namespace = 'guest', accountId, decisions = {}, confirmed = false, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  if (!confirmed || !target || !owner) return failure('financial_v2_identity_adoption_confirmation_required');

  const intent = parse((await db.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, adoptionIntentKey(target),
  ))?.value);
  if (!intent || intent.status !== ADOPTION_INTENT_STATUS
      || text(intent.namespace) !== target || text(intent.accountId) !== owner) {
    return failure('financial_v2_identity_adoption_intent_missing');
  }

  // Downloaded again rather than trusted from prepare: an old intent must never
  // promote a cloud that has moved on since it was reviewed.
  const staged = await stageVerifiedBootstrapWithArchiveV2({
    supabase, namespace: target, accountId: owner, database: db,
  });
  if (!staged?.ok) return staged;
  if (text(staged.bootstrapSource?.ledgerId) !== text(intent.cloud?.ledgerId)
      || Number(staged.bootstrapSource?.restoreEpoch) !== Number(intent.cloud?.restoreEpoch)
      || text(staged.bootstrapSource?.bootstrapId) !== text(intent.cloud?.bootstrapId)
      || text(staged.bootstrapSource?.manifestHash).toLowerCase()
        !== text(intent.cloud?.manifestHash).toLowerCase()) {
    return failure('financial_v2_identity_adoption_cloud_changed');
  }

  return promoteCloudIdentityAdoptionV1({
    namespace: target,
    accountId: owner,
    bootstrapSessionId: staged.bootstrapSessionId,
    archiveSessionId: staged.archiveSessionId,
    bootstrapSource: staged.bootstrapSource,
    archiveHead: staged.archiveHead,
    decisions,
    confirmed: true,
    database: db,
  });
};
