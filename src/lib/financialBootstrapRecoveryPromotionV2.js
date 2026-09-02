// Phase 12-D — the only local promotion allowed after both independent import
// stages have reached READY. This module owns no network or UI work. Its one
// SQLite transaction either installs the verified hot ledger + cold archive and
// cloud identity together, or rolls all of it back.
import { runFinancialRestorePromotionTransactionV8 } from './financialLedgerV7Repository';
import { readLiveGenerationInTransactionV13 } from './financialLiveGenerationV13';

const text = value => String(value ?? '').trim();
const hash = value => /^[a-f0-9]{64}$/i.test(text(value));
const positiveInt = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const nonNegativeInt = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const promotionKey = namespace => `bootstrap_recovery_promotion_v1:${text(namespace)}`;
const restoreIntentKey = namespace => `restore_intent:${text(namespace)}`;
const conflictRecoveryIntentKey = namespace => `financial_v2_conflict_recovery_intent_v1:${text(namespace)}`;
const conflictRecoveryCheckpointKey = (namespace, checkpointId) => (
  `financial_v2_conflict_checkpoint_v1:${text(namespace)}:${text(checkpointId)}`
);

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
const parse = value => { try { return JSON.parse(String(value ?? '')); } catch { return null; } };

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

// READY is necessary but not sufficient: a damaged local database could retain
// the receipt session while losing a materialized stage row. Re-count both
// representations inside the same transaction immediately before live writes.
const assertMaterializedStages = async (db, namespace, hotSession, coldSession) => {
  // Stage namespaces are generated privately by the repository. Keep this
  // independent guard here too: treating the live namespace as a stage would
  // make the later clear-and-copy sequence destructive.
  if (String(hotSession.stage_namespace) === namespace || String(coldSession.stage_namespace) === namespace) {
    throw new Error('financial_v2_bootstrap_recovery_promotion_stage_namespace_live');
  }
  const hotReceipts = await db.getAllAsync(
    `SELECT row_type,COUNT(*) AS n FROM ledger_bootstrap_recovery_rows_v10
      WHERE namespace=? AND session_id=? GROUP BY row_type`, hotSession.namespace, hotSession.session_id,
  );
  const hotExpected = Object.fromEntries(hotReceipts.map(row => [String(row.row_type), Number(row.n || 0)]));
  const hotActual = {
    account: await count(db, `SELECT COUNT(*) AS n FROM ledger_accounts_v7 WHERE namespace=?`, hotSession.stage_namespace),
    exchange_rate: await count(db, `SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=?`, hotSession.stage_namespace),
    financial_transaction: await count(db, `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?`, hotSession.stage_namespace),
    posting: await count(db, `SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=?`, hotSession.stage_namespace),
    transaction_link: await count(db, `SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 WHERE namespace=?`, hotSession.stage_namespace),
    entity: await count(db, `SELECT COUNT(*) AS n FROM ledger_entities_v7 WHERE namespace=?`, hotSession.stage_namespace),
    workspace_state: await count(db, `SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace=?`, hotSession.stage_namespace),
  };
  for (const [type, actual] of Object.entries(hotActual)) {
    if (actual !== Number(hotExpected[type] || 0)) throw new Error('financial_v2_bootstrap_recovery_promotion_hot_stage_incomplete');
  }
  const hotReceiptCount = hotReceipts.reduce((total, row) => total + Number(row.n || 0), 0);
  if (hotReceiptCount !== Number(hotSession.expected_row_count)) {
    throw new Error('financial_v2_bootstrap_recovery_promotion_hot_receipt_incomplete');
  }
  const archiveReceipts = await db.getAllAsync(
    `SELECT row_type,COUNT(*) AS n FROM ledger_archive_recovery_rows_v12
      WHERE namespace=? AND session_id=? GROUP BY row_type`, coldSession.namespace, coldSession.session_id,
  );
  const archiveExpected = Object.fromEntries(archiveReceipts.map(row => [String(row.row_type), Number(row.n || 0)]));
  const archiveYears = await count(db, `SELECT COUNT(*) AS n FROM cold_archive_years WHERE namespace=?`, coldSession.stage_namespace);
  const archiveTransactions = await count(db, `SELECT COUNT(*) AS n FROM cold_archive_transactions WHERE namespace=?`, coldSession.stage_namespace);
  if (archiveYears !== Number(archiveExpected.archive_year || 0)
      || archiveTransactions !== Number(archiveExpected.archive_transaction || 0)) {
    throw new Error('financial_archive_recovery_promotion_stage_incomplete');
  }
  const archiveReceiptCount = archiveReceipts.reduce((total, row) => total + Number(row.n || 0), 0);
  if (archiveReceiptCount !== Number(coldSession.expected_row_count)) {
    throw new Error('financial_archive_recovery_promotion_archive_receipt_incomplete');
  }
};

// Every table a conflict checkpoint carries. The checkpoint receipt counts one
// entry per key, so a checkpoint may be trusted only while all nine still match.
const CONFLICT_CHECKPOINT_TABLES = {
  accounts: 'ledger_accounts_v7', exchangeRates: 'ledger_exchange_rates_v7',
  transactions: 'ledger_financial_transactions_v7', postings: 'ledger_postings_v7',
  links: 'ledger_transaction_links_v7', entities: 'ledger_entities_v7', workspace: 'ledger_workspace_state_v7',
  coldArchiveYears: 'cold_archive_years', coldArchiveTransactions: 'cold_archive_transactions',
};

const assertCheckpointCounts = async (db, namespace, counts, reason) => {
  for (const [key, table] of Object.entries(CONFLICT_CHECKPOINT_TABLES)) {
    if (await count(db, `SELECT COUNT(*) AS n FROM ${table} WHERE namespace=?`, namespace) !== Number(counts?.[key] || 0)) {
      throw new Error(reason);
    }
  }
};

const exactConflictIntent = ({ value, namespace, accountId, hot, cold, checkpointId }) => (
  value && value.version === 1 && value.status === 'ready_for_explicit_cloud_replacement'
  && text(value.namespace) === namespace && text(value.accountId) === accountId
  && text(value.cloud?.ledgerId) === hot.ledgerId && Number(value.cloud?.restoreEpoch) === hot.restoreEpoch
  && text(value.cloud?.bootstrapId) === hot.bootstrapId && text(value.cloud?.manifestHash).toLowerCase() === hot.manifestHash
  && Number(value.cloud?.expectedRowCount) === hot.expectedRowCount
  && Boolean(value.cloud?.archivePresent) === cold.archivePresent
  && Number(value.cloud?.archiveGeneration || 0) === cold.archiveGeneration
  && text(value.cloud?.archiveSnapshotId) === cold.snapshotId
  && text(value.cloud?.archiveManifestHash).toLowerCase() === cold.manifestHash
  && Number(value.cloud?.archiveExpectedRowCount || 0) === cold.expectedRowCount
  && text(value.local?.checkpointId) === checkpointId
  && Array.isArray(value.local?.staleWorkspaceMutationIds)
  && value.local.staleWorkspaceMutationIds.length > 0
  && Array.isArray(value.local?.staleWorkspaceMutations)
  && value.local.staleWorkspaceMutations.length === value.local.staleWorkspaceMutationIds.length
);

export const assertConflictCheckpoint = async (db, namespace, checkpointId, identity, intent) => {
  const receiptRow = await db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, conflictRecoveryCheckpointKey(namespace, checkpointId));
  const checkpoint = parse(receiptRow?.value);
  if (!checkpoint || checkpoint.version !== 1 || checkpoint.checkpointId !== checkpointId
      || !text(checkpoint.checkpointNamespace) || text(checkpoint.ledgerId) !== text(identity.ledger_id)
      || Number(checkpoint.restoreEpoch) !== Number(identity.restore_epoch)
      || Number(checkpoint.sourceGeneration) !== Number(intent.local?.sourceGeneration)) {
    throw new Error('financial_v2_conflict_recovery_promotion_checkpoint_invalid');
  }
  const generation = await readLiveGenerationInTransactionV13({
    database: db, namespace, ledgerId: String(identity.ledger_id), restoreEpoch: Number(identity.restore_epoch),
  });
  if (Number(generation.generation) !== Number(checkpoint.sourceGeneration)) {
    throw new Error('financial_v2_conflict_recovery_promotion_generation_changed');
  }
  await assertCheckpointCounts(
    db, checkpoint.checkpointNamespace, checkpoint.counts,
    'financial_v2_conflict_recovery_promotion_checkpoint_incomplete',
  );
  return checkpoint;
};

export const assertOnlyPreparedWorkspaceMutations = async (db, namespace, identity, intent) => {
  const rows = await db.getAllAsync(
    `SELECT sequence_id,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,payload_json
       FROM ledger_outbox_v3 WHERE namespace=? AND ledger_id=? AND restore_epoch=?
       AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL ORDER BY sequence_id`,
    namespace, String(identity.ledger_id), Number(identity.restore_epoch),
  );
  const expected = Array.isArray(intent.local?.staleWorkspaceMutationIds) ? intent.local.staleWorkspaceMutationIds.map(text) : [];
  const snapshots = Array.isArray(intent.local?.staleWorkspaceMutations) ? intent.local.staleWorkspaceMutations : [];
  if (rows.length !== expected.length || rows.some((row, index) => (
    text(row.mutation_id) !== expected[index] || text(row.entity_type) !== 'workspace'
    || text(row.entity_id) !== 'workspace' || text(row.operation) !== 'upsert'
    || Number(row.base_revision) >= Number(intent.local?.cloudWorkspaceRevision)
    || Number(row.revision) > Number(intent.local?.cloudWorkspaceRevision)
    || Number(row.sequence_id) !== Number(snapshots[index]?.sequenceId)
    || text(row.command_id) !== text(snapshots[index]?.commandId)
    || Number(row.revision) !== Number(snapshots[index]?.revision)
    || Number(row.base_revision) !== Number(snapshots[index]?.baseRevision)
    || text(row.payload_json) !== text(snapshots[index]?.payloadJson)
  ))) {
    throw new Error('financial_v2_conflict_recovery_promotion_pending_state_changed');
  }
};

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
      await assertMaterializedStages(db, target, hotSession, coldSession);

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
      // This is deliberately not advanceRestoreEpoch(): that operation moves
      // one existing ledger forward by exactly one epoch and rebinds its live
      // generation. Recovery instead replaces an empty local shell with a
      // different, already-existing cloud ledger and leaves it unactivated.
      // The first normal V2 activation owns generation registration.
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

// This is intentionally separate from the empty-shell promotion above. It is
// the only path allowed to replace a non-empty namespace, and only after the
// narrow conflict-preparation step has preserved a complete local checkpoint
// and a UI has received an explicit confirmation from the account owner.
export const promotePreparedCloudConflictRecoveryV1 = async ({
  namespace = 'guest', accountId, bootstrapSessionId, archiveSessionId,
  bootstrapSource, archiveHead, checkpointId, confirmed = false, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const hotId = text(bootstrapSessionId);
  const coldId = text(archiveSessionId);
  const checkpoint = text(checkpointId);
  if (!confirmed || !target || !owner || !hotId || !coldId || !checkpoint) {
    return failure('financial_v2_conflict_recovery_promotion_confirmation_required');
  }
  let hot; let cold;
  try { hot = source(bootstrapSource); cold = archiveSource(archiveHead, hot); }
  catch (error) { return failure(error?.message); }

  try {
    return await runFinancialRestorePromotionTransactionV8({ database, task: async actions => {
      const db = actions.database;
      const [identity, restoreIntent, intentRow, hotSession, coldSession] = await Promise.all([
        db.getFirstAsync(`SELECT * FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target),
        db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, restoreIntentKey(target)),
        db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, conflictRecoveryIntentKey(target)),
        db.getFirstAsync(`SELECT * FROM ledger_bootstrap_recovery_import_v9 WHERE namespace=? AND session_id=? LIMIT 1`, target, hotId),
        db.getFirstAsync(`SELECT * FROM ledger_archive_recovery_import_v11 WHERE namespace=? AND session_id=? LIMIT 1`, target, coldId),
      ]);
      if (restoreIntent?.value) throw new Error('financial_v2_conflict_recovery_promotion_restore_intent_active');
      if (!identity?.ledger_id || String(identity.ledger_id) !== hot.ledgerId || Number(identity.restore_epoch) !== hot.restoreEpoch) {
        throw new Error('financial_v2_conflict_recovery_promotion_identity_changed');
      }
      const intent = parse(intentRow?.value);
      if (!exactConflictIntent({ value: intent, namespace: target, accountId: owner, hot, cold, checkpointId: checkpoint })) {
        throw new Error('financial_v2_conflict_recovery_promotion_intent_invalid');
      }
      if (!exactHotSession(hotSession, target, owner, hot) || !exactArchiveSession(coldSession, target, owner, cold)) {
        throw new Error('financial_v2_conflict_recovery_promotion_stage_source_mismatch');
      }
      await assertConflictCheckpoint(db, target, checkpoint, identity, intent);
      await assertOnlyPreparedWorkspaceMutations(db, target, identity, intent);
      await assertMaterializedStages(db, target, hotSession, coldSession);

      const now = new Date().toISOString();
      // The checkpoint has been independently proven above. From here to the
      // receipt write every edit belongs to this one transaction: either the
      // verified cloud copy replaces the local projection, or nothing changes.
      await actions.clearFinancialNamespace(target);
      await actions.replaceColdArchiveNamespaceFromStage({ namespace: target, stageNamespace: String(coldSession.stage_namespace) });
      await actions.copyFinancialNamespaceFromStage({
        namespace: target, stageNamespace: String(hotSession.stage_namespace), includeWorkspaceState: true,
      });
      await db.runAsync(`DELETE FROM ledger_outbox_v2 WHERE namespace=?`, target);
      await db.runAsync(`DELETE FROM ledger_inbox_v2 WHERE namespace=?`, target);
      await db.runAsync(`DELETE FROM ledger_sync_state_v7 WHERE namespace=?`, target);
      await db.runAsync(`DELETE FROM ledger_outbox_v3 WHERE ledger_id=? AND restore_epoch=?`, hot.ledgerId, hot.restoreEpoch);
      await db.runAsync(`DELETE FROM ledger_inbox_v3 WHERE ledger_id=? AND restore_epoch=?`, hot.ledgerId, hot.restoreEpoch);
      await db.runAsync(`DELETE FROM ledger_bootstrap_state_v8 WHERE ledger_id=? AND restore_epoch=?`, hot.ledgerId, hot.restoreEpoch);
      await db.runAsync(`DELETE FROM ledger_bootstrap_import_state_v8 WHERE ledger_id=? AND restore_epoch=?`, hot.ledgerId, hot.restoreEpoch);
      await db.runAsync(`DELETE FROM ledger_sync_state_v8 WHERE ledger_id=? AND restore_epoch=?`, hot.ledgerId, hot.restoreEpoch);
      await db.runAsync(`DELETE FROM ledger_v7_meta WHERE key=? OR key=? OR key LIKE ? OR key LIKE ?`,
        `active_sync_protocol:${target}`, `sync_v2_activation_evidence:${target}`,
        `sync_v2_activation_evidence:${target}:%`, `sync_v2_epoch_activation_pending:${target}:%`,
      );
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
        ...intent,
        version: 1,
        status: 'local_promoted_pending_activation',
        promotedAt: now,
        activation: { required: true, productionCursor: 0 },
      };
      const updated = await db.runAsync(
        `UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?`,
        JSON.stringify(receipt), now, conflictRecoveryIntentKey(target), String(intentRow.value),
      );
      if (Number(updated?.changes || 0) !== 1) throw new Error('financial_v2_conflict_recovery_promotion_intent_compare_and_swap_failed');
      const foreignKeys = await db.getAllAsync('PRAGMA foreign_key_check');
      if (foreignKeys.length) throw new Error('financial_v2_conflict_recovery_promotion_foreign_key_failed');
      const quick = await db.getFirstAsync('PRAGMA quick_check');
      if (String(quick ? Object.values(quick)[0] : '').toLowerCase() !== 'ok') {
        throw new Error('financial_v2_conflict_recovery_promotion_quick_check_failed');
      }
      return {
        supported: true, ok: true, namespace: target, ledgerId: hot.ledgerId, restoreEpoch: hot.restoreEpoch,
        checkpointId: checkpoint, activationState: 'pending',
      };
    }});
  } catch (error) {
    return failure(error?.message);
  }
};

// A checkpoint receipt is only as trustworthy as its own shape. Restoring reads
// the live namespace back *from* these numbers, so an absent or malformed key
// must fail closed instead of silently meaning "expect zero rows".
const exactCheckpointCounts = value => (
  !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === Object.keys(CONFLICT_CHECKPOINT_TABLES).length
  && Object.keys(CONFLICT_CHECKPOINT_TABLES).every(key => nonNegativeInt(value[key]))
);

/**
 * The inverse of the promotion above: it copies the private checkpoint that
 * promotion preserved back over the live namespace after an activation that
 * never completed. It is deliberately not a general "undo my ledger" tool — it
 * refuses unless the recorded intent is exactly `local_promoted_pending_
 * activation`, and it proves the checkpoint is complete *before* clearing any
 * live row, so a damaged checkpoint leaves the current data untouched. The
 * checkpoint itself is never deleted.
 */
export const restoreFinancialConflictRecoveryCheckpointV1 = async ({
  namespace = 'guest', checkpointId, database = null,
} = {}) => {
  const target = text(namespace);
  const checkpoint = text(checkpointId);
  if (!target || !checkpoint) return failure('financial_v2_conflict_recovery_restore_input_invalid');

  try {
    return await runFinancialRestorePromotionTransactionV8({ database, task: async actions => {
      const db = actions.database;
      const [identity, restoreIntent, intentRow, receiptRow] = await Promise.all([
        db.getFirstAsync(`SELECT * FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target),
        db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, restoreIntentKey(target)),
        db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, conflictRecoveryIntentKey(target)),
        db.getFirstAsync(`SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, conflictRecoveryCheckpointKey(target, checkpoint)),
      ]);
      if (restoreIntent?.value) throw new Error('financial_v2_conflict_recovery_restore_restore_intent_active');
      if (!identity?.ledger_id) throw new Error('financial_v2_conflict_recovery_restore_identity_missing');

      // The single safety gate. Any other status — prepared but not promoted,
      // already rolled back, or activated — means the live namespace is not the
      // failed promotion's output and must never be overwritten from here.
      const intent = parse(intentRow?.value);
      if (!intent || intent.version !== 1 || text(intent.status) !== 'local_promoted_pending_activation'
          || text(intent.namespace) !== target || text(intent.local?.checkpointId) !== checkpoint) {
        throw new Error('financial_v2_conflict_recovery_restore_intent_not_restorable');
      }
      const receipt = parse(receiptRow?.value);
      const stage = text(receipt?.checkpointNamespace);
      if (!receipt || receipt.version !== 1 || text(receipt.checkpointId) !== checkpoint
          || text(receipt.namespace) !== target || !stage || stage === target
          || text(receipt.ledgerId) !== text(identity.ledger_id)
          || Number(receipt.restoreEpoch) !== Number(identity.restore_epoch)
          || !exactCheckpointCounts(receipt.counts) || Number(receipt.counts.workspace) < 1) {
        throw new Error('financial_v2_conflict_recovery_restore_checkpoint_invalid');
      }
      await assertCheckpointCounts(db, stage, receipt.counts, 'financial_v2_conflict_recovery_restore_checkpoint_incomplete');

      const now = new Date().toISOString();
      // Every precondition is accepted above. From here the checkpoint either
      // replaces the promoted projection completely, or nothing changes at all.
      await actions.clearFinancialNamespace(target);
      await actions.clearColdArchiveNamespace(target);
      await actions.copyFinancialNamespaceFromStage({
        namespace: target, stageNamespace: stage, includeWorkspaceState: true,
      });
      await actions.replaceColdArchiveNamespaceFromStage({ namespace: target, stageNamespace: stage });
      await assertCheckpointCounts(db, target, receipt.counts, 'financial_v2_conflict_recovery_restore_counts_mismatch');
      // The outbox rows of this epoch are all rejected retries produced *by* the
      // failed recovery; they can never be accepted by the cloud and would keep
      // accumulating. The restored ledger re-uploads through a normal sync.
      await db.runAsync(
        `DELETE FROM ledger_outbox_v3 WHERE ledger_id=? AND restore_epoch=?`,
        text(identity.ledger_id), Number(identity.restore_epoch),
      );
      const rolledBack = {
        ...intent,
        status: 'rolled_back_after_activation_failure',
        restoredAt: now,
        restoredFrom: { checkpointId: checkpoint, checkpointNamespace: stage, counts: receipt.counts },
      };
      const updated = await db.runAsync(
        `UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?`,
        JSON.stringify(rolledBack), now, conflictRecoveryIntentKey(target), String(intentRow.value),
      );
      if (Number(updated?.changes || 0) !== 1) throw new Error('financial_v2_conflict_recovery_restore_intent_compare_and_swap_failed');
      const foreignKeys = await db.getAllAsync('PRAGMA foreign_key_check');
      if (foreignKeys.length) throw new Error('financial_v2_conflict_recovery_restore_foreign_key_failed');
      const quick = await db.getFirstAsync('PRAGMA quick_check');
      if (String(quick ? Object.values(quick)[0] : '').toLowerCase() !== 'ok') {
        throw new Error('financial_v2_conflict_recovery_restore_quick_check_failed');
      }
      return {
        supported: true, ok: true, namespace: target, checkpointId: checkpoint,
        ledgerId: text(identity.ledger_id), restoreEpoch: Number(identity.restore_epoch),
        status: rolledBack.status, counts: receipt.counts,
      };
    }});
  } catch (error) {
    return failure(error?.message);
  }
};
