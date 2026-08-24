// Phase 10 — narrow recovery for a restore blocked by one stale setup-shell
// workspace mutation. This never resolves ordinary financial conflicts. It may
// run only inside the same exclusive SQLite transaction that creates the
// canonical restore intent, so a failed guard/intent rolls the quarantine back.

export const RESTORE_WORKSPACE_CONFLICT_QUARANTINE_V13_VERSION = 1;

const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
const parse = value => { try { return JSON.parse(String(value ?? '')); } catch { return null; } };
const safeJson = value => JSON.stringify(value);
const markerKey = (namespace, operationId) => `canonical_restore_workspace_conflict_v13:${namespace}:${operationId}`;

const FINANCIAL_KEYS = new Set([
  'trans', 'transactions', 'wallets', 'debts', 'goals', 'commitments',
  'postings', 'accounts', 'links', 'exchangerates', 'originaltransaction', 'transaction',
]);
const OUTER_KEYS = new Set([
  'namespace', 'entityType', 'id', 'revision', 'baseRevision', 'deletedAt',
  'payload', 'createdAt', 'updatedAt',
]);
const INNER_KEYS = new Set(['cfg', 'notif', 'cloudRevision']);

const hasFinancialKey = (value, depth = 0) => {
  if (value == null || depth > 8) return false;
  if (Array.isArray(value)) return value.slice(0, 16).some(item => hasFinancialKey(item, depth + 1));
  if (!object(value)) return false;
  return Object.entries(value).some(([key, child]) => (
    FINANCIAL_KEYS.has(String(key).toLowerCase()) || hasFinancialKey(child, depth + 1)
  ));
};

const safeWorkspaceEnvelope = (row, version) => {
  const envelope = parse(row?.payload_json);
  const inner = object(envelope?.payload) ? envelope.payload : null;
  const revision = Number(version === 3 ? row?.revision : row?.entity_revision);
  const baseRevision = Number(version === 3 ? row?.base_revision : envelope?.baseRevision);
  return object(envelope)
    && object(inner)
    && Object.keys(envelope).every(key => OUTER_KEYS.has(key))
    && Object.keys(inner).every(key => INNER_KEYS.has(key))
    && object(inner.cfg)
    && Object.prototype.hasOwnProperty.call(inner, 'cloudRevision')
    && !hasFinancialKey(envelope)
    && text(row?.entity_type) === 'workspace'
    && text(row?.entity_id) === 'workspace'
    && text(row?.operation) === 'upsert'
    && text(envelope.namespace) === text(row?.namespace)
    && text(envelope.entityType) === 'workspace'
    && text(envelope.id) === 'workspace'
    && Number.isSafeInteger(revision) && revision > 0
    && Number.isSafeInteger(baseRevision) && baseRevision === revision - 1
    && Number(envelope.revision) === revision
    && Number(envelope.baseRevision) === baseRevision;
};

const count = async (database, sql, ...params) => {
  const row = await database.getFirstAsync(sql, ...params);
  return Math.max(0, Number(row?.n || 0));
};

const tableExists = async (database, name) => !!(await database.getFirstAsync(
  "SELECT 1 AS yes FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", name,
));

export const quarantineRestoreWorkspaceConflictInTransactionV13 = async ({
  database,
  namespace,
  ledgerId,
  restoreEpoch,
  operationId,
} = {}) => {
  if (!database || typeof database.getFirstAsync !== 'function'
      || typeof database.getAllAsync !== 'function' || typeof database.runAsync !== 'function') {
    throw new Error('canonical_restore_workspace_conflict_transaction_required');
  }
  const target = text(namespace);
  const ledger = text(ledgerId);
  const epoch = Number(restoreEpoch);
  const operation = text(operationId).toLowerCase();
  if (!target.startsWith('user:') || !ledger || !Number.isSafeInteger(epoch) || epoch < 1 || !uuid(operation)) {
    throw new Error('canonical_restore_workspace_conflict_input_invalid');
  }

  const identity = await database.getFirstAsync(
    'SELECT namespace,ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1', target,
  );
  if (text(identity?.ledger_id) !== ledger || Number(identity?.restore_epoch) !== epoch) {
    throw new Error('canonical_restore_workspace_conflict_identity_changed');
  }
  const activation = await database.getFirstAsync(
    'SELECT activated_at FROM ledger_sync_state_v8 WHERE ledger_id=? AND restore_epoch=? LIMIT 1', ledger, epoch,
  );
  if (!activation?.activated_at) throw new Error('canonical_restore_workspace_conflict_v2_not_active');

  const wallets = await database.getAllAsync(
    "SELECT id,payload_json,deleted_at FROM ledger_entities_v7 WHERE namespace=? AND entity_type='wallet' ORDER BY id", target,
  );
  const accounts = await database.getAllAsync(
    'SELECT id,archived_at FROM ledger_accounts_v7 WHERE namespace=? ORDER BY id', target,
  );
  const walletIds = new Set(wallets.map(row => text(row.id)));
  const walletSafe = wallets.length <= 1 && wallets.every(row => {
    const payload = parse(row.payload_json) || {};
    return !row.deleted_at && Number(payload.openingBalance || 0) === 0
      && Number(payload.openingBaseBalance || 0) === 0;
  });
  const accountsSafe = accounts.length <= 1 && accounts.length <= wallets.length
    && accounts.every(row => walletIds.has(text(row.id)) && !row.archived_at);
  const financialCounts = {
    transactions: await count(database, 'SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?', target),
    exchangeRates: await count(database, 'SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=?', target),
    postings: await count(database, 'SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=?', target),
    links: await count(database, 'SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 WHERE namespace=?', target),
    unsafeEntities: await count(database, `SELECT COUNT(*) AS n FROM ledger_entities_v7
      WHERE namespace=? AND NOT ((entity_type='workspace' AND id='workspace') OR entity_type IN ('wallet','category'))`, target),
    coldArchiveYears: await tableExists(database, 'cold_archive_years')
      ? await count(database, 'SELECT COUNT(*) AS n FROM cold_archive_years WHERE namespace=?', target) : 0,
    coldArchiveTransactions: await tableExists(database, 'cold_archive_transactions')
      ? await count(database, 'SELECT COUNT(*) AS n FROM cold_archive_transactions WHERE namespace=?', target) : 0,
  };
  if (!walletSafe || !accountsSafe || Object.values(financialCounts).some(value => value !== 0)) {
    throw new Error('canonical_restore_workspace_conflict_financial_shell_not_empty');
  }

  const shadow = await database.getAllAsync(
    `SELECT sequence_id,mutation_id,command_id,namespace,ledger_id,restore_epoch,entity_type,entity_id,
            operation,revision,base_revision,payload_json,attempts,last_error
       FROM ledger_outbox_v3
      WHERE namespace=? AND ledger_id=? AND restore_epoch=?
        AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL
      ORDER BY sequence_id`, target, ledger, epoch,
  );
  const legacy = await database.getAllAsync(
    `SELECT sequence_id,mutation_id,namespace,entity_type,entity_id,operation,entity_revision,payload_json,attempts,last_error
       FROM ledger_outbox_v2 WHERE namespace=? AND acknowledged_at IS NULL ORDER BY sequence_id`, target,
  );
  if (!shadow.length || shadow.length > 16 || shadow.length !== legacy.length
      || !shadow.every(row => safeWorkspaceEnvelope(row, 3))
      || !legacy.every(row => safeWorkspaceEnvelope(row, 2))) {
    throw new Error('canonical_restore_workspace_conflict_outbox_not_safe');
  }
  const legacyByRevision = new Map(legacy.map(row => [Number(row.entity_revision), row]));
  const exactPair = shadow.every(row => {
    const paired = legacyByRevision.get(Number(row.revision));
    return paired && text(paired.entity_type) === text(row.entity_type)
      && text(paired.entity_id) === text(row.entity_id)
      && text(paired.operation) === text(row.operation)
      && String(paired.payload_json) === String(row.payload_json);
  });
  if (!exactPair) throw new Error('canonical_restore_workspace_conflict_outbox_pair_mismatch');

  const foreignKeys = await database.getAllAsync('PRAGMA foreign_key_check');
  if (foreignKeys.length) throw new Error('canonical_restore_workspace_conflict_foreign_key_failed');
  const existing = await database.getFirstAsync(
    'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', markerKey(target, operation),
  );
  if (existing) throw new Error('canonical_restore_workspace_conflict_marker_exists');

  const now = new Date().toISOString();
  const quarantineId = `restore-preflight:${operation}`;
  const shadowUpdate = await database.runAsync(
    `UPDATE ledger_outbox_v3 SET superseded_by_bootstrap_id=?,superseded_at=?,last_error=NULL
      WHERE namespace=? AND ledger_id=? AND restore_epoch=?
        AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL`,
    quarantineId, now, target, ledger, epoch,
  );
  const legacyUpdate = await database.runAsync(
    `UPDATE ledger_outbox_v2 SET acknowledged_at=?,next_attempt_at=NULL,last_error=NULL
      WHERE namespace=? AND acknowledged_at IS NULL`, now, target,
  );
  if (Number(shadowUpdate?.changes || 0) !== shadow.length
      || Number(legacyUpdate?.changes || 0) !== legacy.length) {
    throw new Error('canonical_restore_workspace_conflict_quarantine_compare_and_swap_failed');
  }

  const evidence = Object.freeze({
    version: RESTORE_WORKSPACE_CONFLICT_QUARANTINE_V13_VERSION,
    status: 'QUARANTINED_WITH_RESTORE_INTENT',
    namespace: target,
    ledgerId: ledger,
    restoreEpoch: epoch,
    operationId: operation,
    reason: 'financial_v2_revision_conflict',
    financialShellEmpty: true,
    shadowMutationIds: shadow.map(row => text(row.mutation_id)),
    legacyMutationIds: legacy.map(row => text(row.mutation_id)),
    revisions: shadow.map(row => Number(row.revision)),
    payloadsPersisted: false,
    quarantinedAt: now,
  });
  const inserted = await database.runAsync(
    'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
    markerKey(target, operation), safeJson(evidence), now,
  );
  if (Number(inserted?.changes || 0) !== 1) {
    throw new Error('canonical_restore_workspace_conflict_evidence_write_failed');
  }
  return evidence;
};
