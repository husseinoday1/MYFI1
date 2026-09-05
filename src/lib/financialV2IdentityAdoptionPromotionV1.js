// MYFI — the promotion for adopting a DIFFERENT cloud ledger identity.
//
// Sibling of promotePreparedCloudConflictRecoveryV1, deliberately not a
// parameter on it. That one requires the local ledger identity to EQUAL the
// cloud one and clears ledger_outbox_v3 by the CLOUD ledger id. Both are right
// for its case and wrong for this one: here the identities differ by
// definition, and the owner's pending rows live under the OLD LOCAL ledger id,
// so clearing by the cloud id would leave them on disk under an identity
// nothing reads again -- present, invisible, and unrecoverable.
//
// What this transaction does, all-or-nothing:
//   1. proves the adoption still applies (identities still differ, intent and
//      staged sessions still match what was reviewed),
//   2. replaces the local projection with the verified cloud copy,
//   3. rewrites ledger_sync_identity_v8 to the cloud identity,
//   4. clears the OLD ledger's sync rows, by the OLD id,
//   5. parks the mutations the owner chose to KEEP in a durable re-entry queue.
//
// Step 5 is deliberately a queue rather than reconstructed rows. A kept
// mutation's revision chain was computed against the ledger being replaced and
// cannot be carried across; re-deriving revisions by hand inside a destructive
// transaction is exactly the kind of arithmetic that goes wrong quietly. The
// queue is drained afterwards through the ordinary commit paths, which already
// compute revisions against current state and write correct outbox rows. If one
// entry fails to re-apply it fails visibly on its own, with the adoption
// already safely committed.

import { runFinancialRestorePromotionTransactionV8 } from './financialLedgerV7Repository';
import { ADOPTION_INTENT_STATUS, adoptionReadinessV1 } from './financialV2IdentityAdoptionV1';

const text = value => String(value ?? '').trim();
const hash = value => /^[a-f0-9]{64}$/i.test(text(value));
const positiveInt = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const nonNegativeInt = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;

export const adoptionIntentKey = namespace => `financial_v2_identity_adoption_intent_v1:${text(namespace)}`;
export const adoptionReentryQueueKey = namespace => `financial_v2_identity_adoption_reentry_v1:${text(namespace)}`;

const parse = (raw, fallback = null) => {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};

const failure = (reason, extra = {}) => ({
  supported: true, ok: false, reason: text(reason) || 'financial_v2_identity_adoption_failed', ...extra,
});

const cloudSourceOf = value => {
  const ledgerId = text(value?.ledgerId);
  const restoreEpoch = Number(value?.restoreEpoch);
  const bootstrapId = text(value?.bootstrapId);
  const manifestHash = text(value?.manifestHash).toLowerCase();
  const expectedRowCount = Number(value?.expectedRowCount);
  if (!ledgerId || !positiveInt(restoreEpoch) || !bootstrapId || !hash(manifestHash)
      || !nonNegativeInt(expectedRowCount)) {
    throw new Error('financial_v2_identity_adoption_source_invalid');
  }
  return { ledgerId, restoreEpoch, bootstrapId, manifestHash, expectedRowCount };
};

export const promoteCloudIdentityAdoptionV1 = async ({
  namespace = 'guest', accountId, bootstrapSessionId, archiveSessionId,
  bootstrapSource, archiveHead, decisions = {}, confirmed = false, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const hotId = text(bootstrapSessionId);
  const coldId = text(archiveSessionId);
  if (!confirmed || !target || !owner || !hotId || !coldId) {
    return failure('financial_v2_identity_adoption_confirmation_required');
  }
  let hot;
  try { hot = cloudSourceOf(bootstrapSource); }
  catch (error) { return failure(error?.message); }
  const coldGeneration = Number(archiveHead?.archiveGeneration || 0);

  try {
    return await runFinancialRestorePromotionTransactionV8({ database, task: async actions => {
      const db = actions.database;
      const now = new Date().toISOString();

      const [identity, restoreIntent, intentRow, hotSession, coldSession] = await Promise.all([
        db.getFirstAsync(`SELECT * FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target),
        db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, `restore_intent:${target}`),
        db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, adoptionIntentKey(target)),
        db.getFirstAsync(`SELECT * FROM ledger_bootstrap_recovery_import_v9 WHERE namespace=? AND session_id=? LIMIT 1`, target, hotId),
        db.getFirstAsync(`SELECT * FROM ledger_archive_recovery_import_v11 WHERE namespace=? AND session_id=? LIMIT 1`, target, coldId),
      ]);

      if (restoreIntent?.value) throw new Error('financial_v2_identity_adoption_restore_intent_active');
      if (!identity?.ledger_id) throw new Error('financial_v2_identity_adoption_local_identity_missing');

      // The defining precondition, re-proven here rather than trusted from
      // prepare: if the identities have converged since review, this is no
      // longer an adoption and the ordinary recovery path owns the case.
      const localLedgerId = text(identity.ledger_id);
      const localRestoreEpoch = Number(identity.restore_epoch);
      if (localLedgerId === hot.ledgerId) {
        throw new Error('financial_v2_identity_adoption_not_applicable_same_ledger');
      }

      const intent = parse(intentRow?.value);
      if (!intent || intent.status !== ADOPTION_INTENT_STATUS
          || text(intent.namespace) !== target || text(intent.accountId) !== owner) {
        throw new Error('financial_v2_identity_adoption_intent_missing');
      }
      if (text(intent.cloud?.ledgerId) !== hot.ledgerId
          || Number(intent.cloud?.restoreEpoch) !== hot.restoreEpoch
          || text(intent.cloud?.bootstrapId) !== hot.bootstrapId
          || text(intent.cloud?.manifestHash).toLowerCase() !== hot.manifestHash) {
        throw new Error('financial_v2_identity_adoption_cloud_changed');
      }
      if (text(intent.local?.ledgerId) !== localLedgerId
          || Number(intent.local?.restoreEpoch) !== localRestoreEpoch) {
        throw new Error('financial_v2_identity_adoption_local_identity_changed');
      }

      if (String(hotSession?.status || '') !== 'ready' || String(coldSession?.status || '') !== 'ready') {
        throw new Error('financial_v2_identity_adoption_stage_not_ready');
      }

      // Re-read the pending rows inside the transaction. Reviewing a list and
      // then adopting against a different one is the failure this prevents: a
      // mutation created after the owner finished reviewing must not be swept
      // along by decisions that never covered it.
      const pending = await db.getAllAsync(
        `SELECT sequence_id,mutation_id,command_id,namespace,ledger_id,restore_epoch,entity_type,entity_id,
                operation,revision,base_revision,payload_json,created_at
           FROM ledger_outbox_v3
          WHERE namespace=? AND ledger_id=? AND restore_epoch=?
            AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL
          ORDER BY sequence_id`,
        target, localLedgerId, localRestoreEpoch,
      );
      const readiness = adoptionReadinessV1({ pending, decisions });
      if (!readiness.ok) {
        throw new Error(readiness.reason || 'financial_v2_identity_adoption_pending_undecided');
      }

      // Captured before anything is destroyed. These are the owner's own
      // entries; they are re-applied afterwards through the ordinary commit
      // paths, never reconstructed by hand in here.
      const keptSequenceIds = new Set(readiness.keep.map(row => Number(row.sequenceId)));
      const reentry = pending
        .filter(row => keptSequenceIds.has(Number(row.sequence_id)))
        .map(row => ({
          sequenceId: Number(row.sequence_id),
          entityType: text(row.entity_type),
          entityId: text(row.entity_id),
          operation: text(row.operation) || 'upsert',
          payloadJson: text(row.payload_json),
          createdAt: text(row.created_at),
        }));

      // From here to the receipt, one transaction: either the cloud copy and
      // the adopted identity both land, or nothing does.
      await actions.clearFinancialNamespace(target);
      await actions.replaceColdArchiveNamespaceFromStage({
        namespace: target, stageNamespace: String(coldSession.stage_namespace),
      });
      await actions.copyFinancialNamespaceFromStage({
        namespace: target, stageNamespace: String(hotSession.stage_namespace), includeWorkspaceState: true,
      });

      // Cleared by the OLD ledger id. This is the whole reason this function
      // exists rather than a flag on the other one.
      await db.runAsync(`DELETE FROM ledger_outbox_v3 WHERE ledger_id=? AND restore_epoch=?`, localLedgerId, localRestoreEpoch);
      await db.runAsync(`DELETE FROM ledger_inbox_v3 WHERE ledger_id=? AND restore_epoch=?`, localLedgerId, localRestoreEpoch);
      await db.runAsync(`DELETE FROM ledger_bootstrap_state_v8 WHERE ledger_id=? AND restore_epoch=?`, localLedgerId, localRestoreEpoch);
      await db.runAsync(`DELETE FROM ledger_bootstrap_import_state_v8 WHERE ledger_id=? AND restore_epoch=?`, localLedgerId, localRestoreEpoch);
      await db.runAsync(`DELETE FROM ledger_sync_state_v8 WHERE ledger_id=? AND restore_epoch=?`, localLedgerId, localRestoreEpoch);
      await db.runAsync(`DELETE FROM ledger_outbox_v2 WHERE namespace=?`, target);
      await db.runAsync(`DELETE FROM ledger_inbox_v2 WHERE namespace=?`, target);
      await db.runAsync(`DELETE FROM ledger_sync_state_v7 WHERE namespace=?`, target);
      await db.runAsync(
        `DELETE FROM ledger_v7_meta WHERE key=? OR key=? OR key LIKE ? OR key LIKE ?`,
        `active_sync_protocol:${target}`, `sync_v2_activation_evidence:${target}`,
        `sync_v2_activation_evidence:${target}:%`, `sync_v2_epoch_activation_pending:${target}:%`,
      );

      // The identity swap itself.
      const identitySwap = await db.runAsync(
        `UPDATE ledger_sync_identity_v8
            SET ledger_id=?, restore_epoch=?, protocol_version=2, minimum_supported_version=2, updated_at=?
          WHERE namespace=? AND ledger_id=? AND restore_epoch=?`,
        hot.ledgerId, hot.restoreEpoch, now, target, localLedgerId, localRestoreEpoch,
      );
      if (Number(identitySwap?.changes || 0) !== 1) {
        throw new Error('financial_v2_identity_adoption_identity_swap_failed');
      }

      await db.runAsync(
        `INSERT INTO ledger_bootstrap_state_v8
         (namespace,ledger_id,restore_epoch,bootstrap_id,stage_namespace,checkpoint_outbox_sequence,status,
          expected_row_count,manifest_hash,created_at,finalized_at,last_error)
         VALUES (?,?,?,?,?,0,'finalized',?,?,?,?,NULL)`,
        target, hot.ledgerId, hot.restoreEpoch, hot.bootstrapId, String(hotSession.stage_namespace),
        hot.expectedRowCount, hot.manifestHash, now, now,
      );
      await db.runAsync(
        `INSERT INTO ledger_sync_state_v8
         (ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,last_shadow_success_at,
          last_success_at,activated_at,last_device_id,updated_at)
         VALUES (?,?,0,0,NULL,NULL,NULL,NULL,?)`, hot.ledgerId, hot.restoreEpoch, now,
      );

      // The kept entries survive the identity swap here, and only here.
      if (reentry.length) {
        await db.runAsync(
          `INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
          adoptionReentryQueueKey(target),
          JSON.stringify({
            version: 1, namespace: target, accountId: owner,
            adoptedLedgerId: hot.ledgerId, adoptedRestoreEpoch: hot.restoreEpoch,
            previousLedgerId: localLedgerId, previousRestoreEpoch: localRestoreEpoch,
            queuedAt: now, entries: reentry,
          }),
          now,
        );
      }

      const receipt = {
        ...intent,
        status: 'identity_adopted_pending_activation',
        promotedAt: now,
        adopted: { ledgerId: hot.ledgerId, restoreEpoch: hot.restoreEpoch },
        previous: { ledgerId: localLedgerId, restoreEpoch: localRestoreEpoch },
        decided: { kept: readiness.keep.length, discarded: readiness.discard.length },
        archiveGeneration: coldGeneration,
      };
      const updated = await db.runAsync(
        `UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?`,
        JSON.stringify(receipt), now, adoptionIntentKey(target), String(intentRow.value),
      );
      if (Number(updated?.changes || 0) !== 1) {
        throw new Error('financial_v2_identity_adoption_intent_compare_and_swap_failed');
      }

      const foreignKeys = await db.getAllAsync('PRAGMA foreign_key_check');
      if (foreignKeys.length) throw new Error('financial_v2_identity_adoption_foreign_key_failed');
      const quick = await db.getFirstAsync('PRAGMA quick_check');
      if (String(quick ? Object.values(quick)[0] : '').toLowerCase() !== 'ok') {
        throw new Error('financial_v2_identity_adoption_quick_check_failed');
      }

      return {
        supported: true, ok: true, namespace: target,
        adoptedLedgerId: hot.ledgerId, adoptedRestoreEpoch: hot.restoreEpoch,
        previousLedgerId: localLedgerId, previousRestoreEpoch: localRestoreEpoch,
        kept: readiness.keep.length, discarded: readiness.discard.length,
        reentryQueued: reentry.length,
        activationState: 'pending',
      };
    } });
  } catch (error) {
    return failure(error?.message);
  }
};
