// Phase 12-D — the only local promotion allowed after both independent import
// stages have reached READY. This module owns no network or UI work. Its one
// SQLite transaction either installs the verified hot ledger + cold archive and
// cloud identity together, or rolls all of it back.
import { runFinancialRestorePromotionTransactionV8 } from './financialLedgerV7Repository';

const text = value => String(value ?? '').trim();
const hash = value => /^[a-f0-9]{64}$/i.test(text(value));
const positiveInt = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const nonNegativeInt = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const promotionKey = namespace => `bootstrap_recovery_promotion_v1:${text(namespace)}`;
const restoreIntentKey = namespace => `restore_intent:${text(namespace)}`;

const source = value => {
  const ledgerId = text(value?.ledgerId);
  const restoreEpoch = Number(value?.restoreEpoch);
  const bootstrapId = text(value?.bootstrapId);
  const manifestHash = text(value?.manifestHash).toLowerCase();
  const expectedRowCount = Number(value?.expectedRowCount);
  if (!ledgerId || !positiveInt(restoreEpoch) || !bootstrapId || !hash(manifestHash) || !nonNegativeInt(expectedRowCount)) {
    throw new Error('financial_v2_bootstrap_recovery_promotion_source_invalid');
  }
  return { ledgerId, restoreEpoch, bootstrapId, manifestHash, expectedRowCount };
};

const archiveSource = (value, hot) => {
  const ledgerId = text(value?.ledgerId);
  const restoreEpoch = Number(value?.restoreEpoch);
  const archivePresent = value?.archivePresent === true || Number(value?.archivePresent) === 1;
  const archiveGeneration = Number(value?.archiveGeneration ?? 0);
  const snapshotId = text(value?.snapshotId);
  const manifestHash = text(value?.manifestHash).toLowerCase();
  const expectedRowCount = Number(value?.expectedRowCount ?? 0);
  if (ledgerId !== hot.ledgerId || restoreEpoch !== hot.restoreEpoch || !nonNegativeInt(archiveGeneration)
      || !nonNegativeInt(expectedRowCount)) {
    throw new Error('financial_archive_recovery_promotion_source_invalid');
  }
  if (!archivePresent) {
    if (archiveGeneration !== 0 || snapshotId || manifestHash || expectedRowCount !== 0) {
      throw new Error('financial_archive_recovery_promotion_absent_source_invalid');
    }
    return { ledgerId, restoreEpoch, archivePresent: false, archiveGeneration: 0, snapshotId: '', manifestHash: '', expectedRowCount: 0 };
  }
  if (!positiveInt(archiveGeneration) || !snapshotId || !hash(manifestHash)) {
    throw new Error('financial_archive_recovery_promotion_present_source_invalid');
  }
  return { ledgerId, restoreEpoch, archivePresent: true, archiveGeneration, snapshotId, manifestHash, expectedRowCount };
};

const failure = reason => ({ supported: true, ok: false, reason: text(reason) || 'financial_v2_bootstrap_recovery_promotion_failed' });

const count = async (db, sql, ...params) => Math.max(0, Number((await db.getFirstAsync(sql, ...params))?.n || 0));

// This is deliberately stricter than normal login. Promotion is destructive to
// the *empty setup shell* only; any actual financial or transport history makes
// the caller stop rather than decide which side should win silently.
const assertSafeEmptyShell = async (db, namespace, identity) => {
  const walletRows = await db.getAllAsync(
    `SELECT id,payload_json,deleted_at FROM ledger_entities_v7
      WHERE namespace=? AND entity_type='wallet' ORDER BY id`, namespace,
  );
  const accountRows = await db.getAllAsync(
    `SELECT id,archived_at FROM ledger_accounts_v7 WHERE namespace=? ORDER BY id`, namespace,
  );
  const wallets = new Set(walletRows.map(row => String(row.id || '')));
  const walletSafe = walletRows.length <= 1 && walletRows.every(row => {
    let payload = null;
    try { payload = JSON.parse(String(row.payload_json || '{}')); } catch { payload = null; }
    return !!payload && !row.deleted_at && Number(payload.openingBalance || 0) === 0
      && Number(payload.openingBaseBalance || 0) === 0;
  });
  const accountSafe = accountRows.length <= 1 && accountRows.length <= walletRows.length
    && accountRows.every(row => wallets.has(String(row.id || '')) && !row.archived_at);
  const financial = {
    exchangeRates: await count(db, `SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=?`, namespace),
    transactions: await count(db, `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?`, namespace),
    postings: await count(db, `SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=?`, namespace),
    links: await count(db, `SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 WHERE namespace=?`, namespace),
    unsafeEntities: await count(db, `SELECT COUNT(*) AS n FROM ledger_entities_v7 WHERE namespace=?
      AND NOT ((entity_type='workspace' AND id='workspace') OR entity_type='wallet' OR entity_type='category')`, namespace),
  };
  if (!walletSafe || !accountSafe || Object.values(financial).some(value => value > 0)) {
    throw new Error('financial_v2_bootstrap_recovery_promotion_live_state_present');
  }
  const unsafeTransport = {
    legacyOutbox: await count(db, `SELECT COUNT(*) AS n FROM ledger_outbox_v2 WHERE namespace=?`, namespace),
    legacyInbox: await count(db, `SELECT COUNT(*) AS n FROM ledger_inbox_v2 WHERE namespace=?`, namespace),
    legacyCursor: await count(db, `SELECT COUNT(*) AS n FROM ledger_sync_state_v7 WHERE namespace=? AND last_server_sequence > 0`, namespace),
    shadowOutbox: await count(db, `SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?`, identity.ledger_id),
    inbox: await count(db, `SELECT COUNT(*) AS n FROM ledger_inbox_v3 WHERE ledger_id=?`, identity.ledger_id),
    bootstrap: await count(db, `SELECT COUNT(*) AS n FROM ledger_bootstrap_state_v8 WHERE ledger_id=?`, identity.ledger_id),
    bootstrapImport: await count(db, `SELECT COUNT(*) AS n FROM ledger_bootstrap_import_state_v8 WHERE ledger_id=?`, identity.ledger_id),
    activeV2Cursor: await count(db, `SELECT COUNT(*) AS n FROM ledger_sync_state_v8 WHERE ledger_id=? AND last_server_sequence > 0`, identity.ledger_id),
  };
  if (Object.values(unsafeTransport).some(value => value > 0)) {
    throw new Error('financial_v2_bootstrap_recovery_promotion_transport_present');
  }
};

const exactHotSession = (row, namespace, accountId, expected) => (
  row && String(row.namespace) === namespace && String(row.account_id) === accountId
  && String(row.source_ledger_id) === expected.ledgerId && Number(row.source_restore_epoch) === expected.restoreEpoch
  && String(row.source_bootstrap_id) === expected.bootstrapId
  && String(row.source_manifest_hash).toLowerCase() === expected.manifestHash
  && Number(row.expected_row_count) === expected.expectedRowCount && String(row.status) === 'ready'
  && hash(row.proof_digest) && text(row.stage_namespace)
);

const exactArchiveSession = (row, namespace, accountId, expected) => (
  row && String(row.namespace) === namespace && String(row.account_id) === accountId
  && String(row.source_ledger_id) === expected.ledgerId && Number(row.source_restore_epoch) === expected.restoreEpoch
  && Number(row.archive_present) === Number(expected.archivePresent)
  && Number(row.source_archive_generation) === expected.archiveGeneration
  && String(row.source_snapshot_id || '') === expected.snapshotId
  && String(row.source_manifest_hash || '').toLowerCase() === expected.manifestHash
  && Number(row.expected_row_count) === expected.expectedRowCount && String(row.status) === 'ready'
  && hash(row.proof_digest) && text(row.stage_namespace)
);

/**
 * The caller refreshes both source heads immediately before calling this local
 * function, then passes those exact values. Network is intentionally outside
 * the SQLite critical section; this function refuses even a one-field mismatch.
 */
export const promoteVerifiedBootstrapRecoveryV2 = async ({
  namespace = 'guest', accountId, bootstrapSessionId, archiveSessionId,
  bootstrapSource, archiveHead, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const hotId = text(bootstrapSessionId);
  const coldId = text(archiveSessionId);
  if (!target || !owner || !hotId || !coldId) return failure('financial_v2_bootstrap_recovery_promotion_input_invalid');
  let hot; let cold;
  try { hot = source(bootstrapSource); cold = archiveSource(archiveHead, hot); } catch (error) { return failure(error?.message); }

  try {
    return await runFinancialRestorePromotionTransactionV8({ database, task: async actions => {
      const db = actions.database;
      const restoreIntent = await db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, restoreIntentKey(target));
      if (restoreIntent?.value) throw new Error('financial_v2_bootstrap_recovery_promotion_restore_intent_active');
      const [identity, remoteOwner, hotSession, coldSession, priorPromotion] = await Promise.all([
        db.getFirstAsync(`SELECT * FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target),
        db.getFirstAsync(`SELECT namespace FROM ledger_sync_identity_v8 WHERE ledger_id=? LIMIT 1`, hot.ledgerId),
        db.getFirstAsync(`SELECT * FROM ledger_bootstrap_recovery_import_v9 WHERE namespace=? AND session_id=? LIMIT 1`, target, hotId),
        db.getFirstAsync(`SELECT * FROM ledger_archive_recovery_import_v11 WHERE namespace=? AND session_id=? LIMIT 1`, target, coldId),
        db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, promotionKey(target)),
      ]);
      if (!identity?.ledger_id) throw new Error('financial_v2_bootstrap_recovery_promotion_local_identity_missing');
      if (remoteOwner?.namespace && String(remoteOwner.namespace) !== target) {
        throw new Error('financial_v2_bootstrap_recovery_promotion_remote_identity_reserved');
      }
      if (!exactHotSession(hotSession, target, owner, hot) || !exactArchiveSession(coldSession, target, owner, cold)) {
        throw new Error('financial_v2_bootstrap_recovery_promotion_stage_source_mismatch');
      }
      if (priorPromotion?.value) throw new Error('financial_v2_bootstrap_recovery_promotion_already_recorded');
      await assertSafeEmptyShell(db, target, identity);

      const now = new Date().toISOString();
      // All destructive edits begin only after every source, archive, identity,
      // live-shell and transport precondition has been accepted above.
      await actions.clearFinancialNamespace(target);
      await actions.replaceColdArchiveNamespaceFromStage({ namespace: target, stageNamespace: String(coldSession.stage_namespace) });
      await actions.copyFinancialNamespaceFromStage({
        namespace: target, stageNamespace: String(hotSession.stage_namespace), includeWorkspaceState: true,
      });
      await db.runAsync(`DELETE FROM ledger_outbox_v2 WHERE namespace=?`, target);
      await db.runAsync(`DELETE FROM ledger_inbox_v2 WHERE namespace=?`, target);
      await db.runAsync(`DELETE FROM ledger_sync_state_v7 WHERE namespace=?`, target);
      await db.runAsync(`DELETE FROM ledger_outbox_v3 WHERE ledger_id=?`, String(identity.ledger_id));
      await db.runAsync(`DELETE FROM ledger_inbox_v3 WHERE ledger_id=?`, String(identity.ledger_id));
      await db.runAsync(`DELETE FROM ledger_bootstrap_state_v8 WHERE ledger_id=?`, String(identity.ledger_id));
      await db.runAsync(`DELETE FROM ledger_bootstrap_import_state_v8 WHERE ledger_id=?`, String(identity.ledger_id));
      await db.runAsync(`DELETE FROM ledger_sync_state_v8 WHERE ledger_id=?`, String(identity.ledger_id));
      await db.runAsync(`DELETE FROM ledger_v7_meta WHERE key=? OR key=? OR key LIKE ? OR key LIKE ?`,
        `active_sync_protocol:${target}`, `sync_v2_activation_evidence:${target}`,
        `sync_v2_activation_evidence:${target}:%`, `sync_v2_epoch_activation_pending:${target}:%`,
      );
      const cas = await db.runAsync(
        `UPDATE ledger_sync_identity_v8
            SET ledger_id=?,restore_epoch=?,protocol_version=2,minimum_supported_version=2,updated_at=?
          WHERE namespace=? AND ledger_id=? AND restore_epoch=?`,
        hot.ledgerId, hot.restoreEpoch, now, target, String(identity.ledger_id), Number(identity.restore_epoch),
      );
      if (Number(cas?.changes || 0) !== 1) throw new Error('financial_v2_bootstrap_recovery_promotion_identity_compare_and_swap_failed');
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
      const receipt = {
        version: 1, status: 'promoted_pending_activation', namespace: target, accountId: owner,
        ledgerId: hot.ledgerId, restoreEpoch: hot.restoreEpoch, bootstrap: {
          sessionId: hotId, bootstrapId: hot.bootstrapId, manifestHash: hot.manifestHash,
          expectedRowCount: hot.expectedRowCount, proofDigest: String(hotSession.proof_digest),
        },
        archive: {
          sessionId: coldId, archivePresent: cold.archivePresent, archiveGeneration: cold.archiveGeneration,
          snapshotId: cold.snapshotId, manifestHash: cold.manifestHash, expectedRowCount: cold.expectedRowCount,
          proofDigest: String(coldSession.proof_digest),
        },
        promotedAt: now,
      };
      await db.runAsync(`INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`, promotionKey(target), JSON.stringify(receipt), now);
      const foreignKeys = await db.getAllAsync('PRAGMA foreign_key_check');
      if (foreignKeys.length) throw new Error('financial_v2_bootstrap_recovery_promotion_foreign_key_failed');
      const quick = await db.getFirstAsync('PRAGMA quick_check');
      if (String(quick ? Object.values(quick)[0] : '').toLowerCase() !== 'ok') {
        throw new Error('financial_v2_bootstrap_recovery_promotion_quick_check_failed');
      }
      return { supported: true, ok: true, namespace: target, ledgerId: hot.ledgerId, restoreEpoch: hot.restoreEpoch,
        bootstrapSessionId: hotId, archiveSessionId: coldId, activationState: 'pending' };
    }});
  } catch (error) {
    return failure(error?.message);
  }
};
