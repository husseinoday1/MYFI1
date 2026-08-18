// P19-014A_LOCAL_SQLITE_DIAGNOSTICS
// Runner/package revision: R1 (PowerShell encoding-safe packaging only).
// Read-only evidence collector for the already-open native financial SQLite DB.
// This module intentionally never opens, initializes, migrates, writes, or syncs anything.
import { Platform } from 'react-native';
import { getLedgerNamespace } from '../lib/activeLedgerRepository';
import { peekLedgerDb } from '../lib/ledgerDatabase';

const REQUIRED_TABLES = [
  'ledger_bootstrap_state_v8',
  'ledger_sync_identity_v8',
  'ledger_sync_state_v8',
  'ledger_outbox_v3',
  'ledger_financial_transactions_v7',
  'ledger_workspace_state_v7',
  'ledger_v7_meta',
];

const errorText = error => String(error?.message || error || 'unknown_error');

const readRows = async ({ db, present, table, sql, params = [] }) => {
  if (!present.has(table)) return { available: false, rows: [] };
  try {
    const rows = await db.getAllAsync(sql, ...params);
    return { available: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    return { available: true, error: errorText(error), rows: [] };
  }
};

export async function collectP19LocalSqliteDiagnostics({
  workspaceNamespace = 'guest',
  cfg = {},
} = {}) {
  const activeNamespace = getLedgerNamespace(workspaceNamespace, cfg);
  const base = {
    patchId: 'P19-014A',
    marker: 'P19-014A_LOCAL_SQLITE_DIAGNOSTICS',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    activeNamespace,
    financialDataChanged: false,
    sqliteSchemaChanged: false,
    supabaseTouched: false,
  };

  if (Platform.OS === 'web') {
    return { ...base, supported: false, ok: false, reason: 'sqlite_native_only' };
  }

  // Critical safety property: do not invoke the database opener. If the normal app runtime
  // has not already opened the ledger, diagnostics stop instead of opening/migrating it.
  const existingDbPromise = peekLedgerDb();
  if (!existingDbPromise) {
    return { ...base, supported: true, ok: false, reason: 'database_not_open' };
  }

  let db;
  try {
    db = await existingDbPromise;
  } catch (error) {
    return { ...base, supported: true, ok: false, reason: `database_open_failed:${errorText(error)}` };
  }
  if (!db) return { ...base, supported: true, ok: false, reason: 'database_handle_missing' };

  let tableRows = [];
  try {
    tableRows = await db.getAllAsync(
      `SELECT name
         FROM sqlite_master
        WHERE type='table'
          AND name IN (
            'ledger_bootstrap_state_v8',
            'ledger_sync_identity_v8',
            'ledger_sync_state_v8',
            'ledger_outbox_v3',
            'ledger_financial_transactions_v7',
            'ledger_workspace_state_v7',
            'ledger_v7_meta'
          )
        ORDER BY name`,
    );
  } catch (error) {
    return { ...base, supported: true, ok: false, reason: `sqlite_master_read_failed:${errorText(error)}` };
  }

  const present = new Set((tableRows || []).map(row => String(row?.name || '')));
  const tables = {
    present: REQUIRED_TABLES.filter(name => present.has(name)),
    missing: REQUIRED_TABLES.filter(name => !present.has(name)),
  };

  const bootstrapState = await readRows({
    db, present, table: 'ledger_bootstrap_state_v8',
    sql: `SELECT namespace,ledger_id,restore_epoch,bootstrap_id,stage_namespace,
                 checkpoint_outbox_sequence,status,expected_row_count,manifest_hash,
                 created_at,finalized_at,last_error
            FROM ledger_bootstrap_state_v8
           ORDER BY created_at DESC, ledger_id, restore_epoch, bootstrap_id`,
  });

  const syncIdentity = await readRows({
    db, present, table: 'ledger_sync_identity_v8',
    sql: `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,
                 created_at,updated_at
            FROM ledger_sync_identity_v8
           ORDER BY namespace,ledger_id`,
  });

  const syncStateSql = present.has('ledger_sync_identity_v8')
    ? `SELECT i.namespace,s.ledger_id,s.restore_epoch,s.shadow_last_server_sequence,
              s.last_server_sequence,s.last_shadow_success_at,s.last_success_at,
              s.activated_at,s.last_device_id,s.updated_at
         FROM ledger_sync_state_v8 s
         LEFT JOIN ledger_sync_identity_v8 i ON i.ledger_id=s.ledger_id
        ORDER BY i.namespace,s.ledger_id,s.restore_epoch`
    : `SELECT ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,
              last_shadow_success_at,last_success_at,activated_at,last_device_id,updated_at
         FROM ledger_sync_state_v8
        ORDER BY ledger_id,restore_epoch`;
  const syncState = await readRows({
    db, present, table: 'ledger_sync_state_v8', sql: syncStateSql,
  });

  const outboxSummary = await readRows({
    db, present, table: 'ledger_outbox_v3',
    sql: `SELECT namespace,ledger_id,restore_epoch,
                 COUNT(*) AS row_count,
                 SUM(CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END) AS pending_count,
                 SUM(CASE WHEN last_error IS NOT NULL AND trim(last_error)<>'' THEN 1 ELSE 0 END) AS error_count,
                 SUM(CASE WHEN superseded_at IS NOT NULL THEN 1 ELSE 0 END) AS superseded_count,
                 MIN(sequence_id) AS first_sequence_id,
                 MAX(sequence_id) AS last_sequence_id
            FROM ledger_outbox_v3
           GROUP BY namespace,ledger_id,restore_epoch
           ORDER BY namespace,restore_epoch`,
  });

  const outboxWorkspaceOrErrors = await readRows({
    db, present, table: 'ledger_outbox_v3',
    sql: `SELECT sequence_id,namespace,ledger_id,restore_epoch,mutation_id,command_id,
                 entity_type,entity_id,operation,revision,base_revision,protocol_version,
                 minimum_supported_version,payload_schema_version,created_at,attempts,
                 next_attempt_at,acknowledged_at,last_error,superseded_by_bootstrap_id,superseded_at
            FROM ledger_outbox_v3
           WHERE entity_type='workspace'
              OR entity_id='workspace'
              OR (last_error IS NOT NULL AND trim(last_error)<>'')
           ORDER BY sequence_id DESC
           LIMIT 250`,
  });

  const outboxRecent = await readRows({
    db, present, table: 'ledger_outbox_v3',
    sql: `SELECT sequence_id,namespace,ledger_id,restore_epoch,mutation_id,command_id,
                 entity_type,entity_id,operation,revision,base_revision,created_at,attempts,
                 acknowledged_at,last_error,superseded_by_bootstrap_id,superseded_at
            FROM ledger_outbox_v3
           ORDER BY sequence_id DESC
           LIMIT 100`,
  });

  const transactionNamespaceSummary = await readRows({
    db, present, table: 'ledger_financial_transactions_v7',
    sql: `SELECT namespace,COUNT(*) AS transaction_count,
                 COUNT(DISTINCT idempotency_key) AS distinct_idempotency_keys,
                 MIN(created_at) AS first_created_at,MAX(updated_at) AS last_updated_at
            FROM ledger_financial_transactions_v7
           GROUP BY namespace
           ORDER BY namespace`,
  });

  const idempotencyCollisions = await readRows({
    db, present, table: 'ledger_financial_transactions_v7',
    sql: `SELECT idempotency_key,COUNT(*) AS row_count,
                 COUNT(DISTINCT namespace) AS namespace_count,
                 GROUP_CONCAT(DISTINCT namespace) AS namespaces
            FROM ledger_financial_transactions_v7
           WHERE idempotency_key IS NOT NULL AND trim(idempotency_key)<>''
           GROUP BY idempotency_key
          HAVING COUNT(*)>1
           ORDER BY row_count DESC,idempotency_key
           LIMIT 250`,
  });

  const idempotencyCollisionRows = await readRows({
    db, present, table: 'ledger_financial_transactions_v7',
    sql: `SELECT namespace,id,kind,status,idempotency_key,device_id,revision,
                 created_at,updated_at
            FROM ledger_financial_transactions_v7
           WHERE idempotency_key IN (
                 SELECT idempotency_key
                   FROM ledger_financial_transactions_v7
                  WHERE idempotency_key IS NOT NULL AND trim(idempotency_key)<>''
                  GROUP BY idempotency_key
                 HAVING COUNT(*)>1
           )
           ORDER BY idempotency_key,namespace,id
           LIMIT 500`,
  });

  const activeNamespaceTransactions = await readRows({
    db, present, table: 'ledger_financial_transactions_v7',
    sql: `SELECT namespace,id,kind,status,idempotency_key,device_id,revision,created_at,updated_at
            FROM ledger_financial_transactions_v7
           WHERE namespace=?
           ORDER BY updated_at DESC,id DESC
           LIMIT 100`,
    params: [activeNamespace],
  });

  const activeWorkspaceState = await readRows({
    db, present, table: 'ledger_workspace_state_v7',
    sql: `SELECT namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,
                 cutover_at,last_reconciled_at,length(payload_json) AS payload_json_bytes,updated_at
            FROM ledger_workspace_state_v7
           WHERE namespace=?
           LIMIT 1`,
    params: [activeNamespace],
  });

  const relevantMeta = await readRows({
    db, present, table: 'ledger_v7_meta',
    sql: `SELECT key,value,updated_at
            FROM ledger_v7_meta
           WHERE key IN ('schema_version','sqlite_schema_version','sync_protocol_version')
              OR key LIKE 'restore_intent:%'
              OR key LIKE 'cloud_recovery_v2:%'
              OR key LIKE 'sync_v2_activation_evidence:%'
              OR key LIKE 'active_sync_protocol:%'
           ORDER BY key`,
  });

  const identities = syncIdentity.rows || [];
  const activeIdentity = identities.find(row => String(row?.namespace || '') === activeNamespace) || null;

  return {
    ...base,
    supported: true,
    ok: true,
    databaseOpenedBeforeDiagnostic: true,
    tables,
    activeIdentity,
    bootstrapState,
    syncIdentity,
    syncState,
    outbox: {
      summary: outboxSummary,
      workspaceOrErrors: outboxWorkspaceOrErrors,
      recent: outboxRecent,
    },
    transactions: {
      namespaceSummary: transactionNamespaceSummary,
      idempotencyCollisions,
      collisionRows: idempotencyCollisionRows,
      activeNamespaceRecent: activeNamespaceTransactions,
    },
    activeWorkspaceState,
    relevantMeta,
  };
}
