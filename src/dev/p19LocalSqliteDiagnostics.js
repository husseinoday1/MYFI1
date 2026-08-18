// P19-015B0_LEDGER_IDENTITY_FORENSICS
// Extends P19-014A diagnostics with read-only ledger identity adoption preflight evidence.
// Read-only evidence collector for the already-open native financial SQLite DB.
// This module intentionally never opens, initializes, migrates, writes, deletes, or syncs anything.
import { Platform } from 'react-native';
import { getLedgerNamespace } from '../lib/activeLedgerRepository';
import { peekLedgerDb } from '../lib/ledgerDatabase';

const REQUIRED_TABLES = [
  'ledger_bootstrap_state_v8',
  'ledger_bootstrap_import_state_v8',
  'ledger_sync_identity_v8',
  'ledger_sync_state_v8',
  'ledger_outbox_v3',
  'ledger_inbox_v3',
  'ledger_outbox_v2',
  'ledger_accounts_v7',
  'ledger_currencies',
  'ledger_financial_transactions_v7',
  'ledger_postings_v7',
  'ledger_transaction_links_v7',
  'ledger_entities_v7',
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
  cloudRecovery = null,
} = {}) {
  const activeNamespace = getLedgerNamespace(workspaceNamespace, cfg);
  const base = {
    patchId: 'P19-015B0',
    parentPatchId: 'P19-014A',
    marker: 'P19-015B0_LEDGER_IDENTITY_FORENSICS',
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
            'ledger_bootstrap_import_state_v8',
            'ledger_sync_identity_v8',
            'ledger_sync_state_v8',
            'ledger_outbox_v3',
            'ledger_inbox_v3',
            'ledger_outbox_v2',
            'ledger_accounts_v7',
            'ledger_currencies',
            'ledger_financial_transactions_v7',
            'ledger_postings_v7',
            'ledger_transaction_links_v7',
            'ledger_entities_v7',
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
  const activeLedgerId = String(activeIdentity?.ledger_id || '').trim();
  const reservedLedgerId = String(cloudRecovery?.cloudLedgerId || cloudRecovery?.reservedLedgerId || '').trim();

  const allV3Outbox = activeLedgerId ? await readRows({ db, present, table: 'ledger_outbox_v3', sql: `SELECT COUNT(*) AS row_count, COUNT(DISTINCT restore_epoch) AS epoch_count, SUM(CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END) AS pending_count, SUM(CASE WHEN superseded_at IS NOT NULL THEN 1 ELSE 0 END) AS superseded_count FROM ledger_outbox_v3 WHERE ledger_id=?`, params: [activeLedgerId] }) : { available: present.has('ledger_outbox_v3'), rows: [] };
  const allV3Inbox = activeLedgerId ? await readRows({ db, present, table: 'ledger_inbox_v3', sql: `SELECT COUNT(*) AS row_count, COUNT(DISTINCT restore_epoch) AS epoch_count, MIN(server_sequence) AS first_server_sequence, MAX(server_sequence) AS last_server_sequence FROM ledger_inbox_v3 WHERE ledger_id=?`, params: [activeLedgerId] }) : { available: present.has('ledger_inbox_v3'), rows: [] };
  const allBootstrapState = activeLedgerId ? await readRows({ db, present, table: 'ledger_bootstrap_state_v8', sql: `SELECT COUNT(*) AS row_count, COUNT(DISTINCT restore_epoch) AS epoch_count, SUM(CASE WHEN status='finalized' THEN 1 ELSE 0 END) AS finalized_count, SUM(CASE WHEN status IN ('staged','uploading') THEN 1 ELSE 0 END) AS active_count FROM ledger_bootstrap_state_v8 WHERE ledger_id=?`, params: [activeLedgerId] }) : { available: present.has('ledger_bootstrap_state_v8'), rows: [] };
  const bootstrapImportState = await readRows({ db, present, table: 'ledger_bootstrap_import_state_v8', sql: `SELECT namespace,ledger_id,restore_epoch,bootstrap_id,stage_namespace,status,expected_row_count,expected_manifest_hash,last_cloud_row_sequence,created_at,verified_at,finalized_at,last_error FROM ledger_bootstrap_import_state_v8 ORDER BY created_at DESC,ledger_id,restore_epoch,bootstrap_id` });
  const allBootstrapImport = activeLedgerId ? await readRows({ db, present, table: 'ledger_bootstrap_import_state_v8', sql: `SELECT COUNT(*) AS row_count, COUNT(DISTINCT restore_epoch) AS epoch_count, SUM(CASE WHEN status='finalized' THEN 1 ELSE 0 END) AS finalized_count, SUM(CASE WHEN status IN ('downloading','verifying') THEN 1 ELSE 0 END) AS active_count FROM ledger_bootstrap_import_state_v8 WHERE ledger_id=?`, params: [activeLedgerId] }) : { available: present.has('ledger_bootstrap_import_state_v8'), rows: [] };
  const allSyncState = activeLedgerId ? await readRows({ db, present, table: 'ledger_sync_state_v8', sql: `SELECT COUNT(*) AS row_count, COUNT(DISTINCT restore_epoch) AS epoch_count, MAX(CASE WHEN activated_at IS NOT NULL THEN 1 ELSE 0 END) AS any_activated, MAX(shadow_last_server_sequence) AS max_shadow_sequence, MAX(last_server_sequence) AS max_production_sequence FROM ledger_sync_state_v8 WHERE ledger_id=?`, params: [activeLedgerId] }) : { available: present.has('ledger_sync_state_v8'), rows: [] };
  const v1Outbox = await readRows({ db, present, table: 'ledger_outbox_v2', sql: `SELECT COUNT(*) AS row_count, SUM(CASE WHEN acknowledged_at IS NULL THEN 1 ELSE 0 END) AS pending_count, SUM(CASE WHEN last_error IS NOT NULL AND trim(last_error)<>'' THEN 1 ELSE 0 END) AS error_count FROM ledger_outbox_v2 WHERE namespace=?`, params: [activeNamespace] });

  const financialCounts = {};
  const countSpecs = [
    ['accounts','ledger_accounts_v7','SELECT COUNT(*) AS row_count FROM ledger_accounts_v7 WHERE namespace=?',[activeNamespace]],
    ['transactions','ledger_financial_transactions_v7',`SELECT COUNT(*) AS row_count, SUM(CASE WHEN status='posted' AND deleted_at IS NULL THEN 1 ELSE 0 END) AS posted_live_count, SUM(CASE WHEN status='voided' THEN 1 ELSE 0 END) AS voided_count, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted_count FROM ledger_financial_transactions_v7 WHERE namespace=?`,[activeNamespace]],
    ['postings','ledger_postings_v7','SELECT COUNT(*) AS row_count FROM ledger_postings_v7 WHERE namespace=?',[activeNamespace]],
    ['links','ledger_transaction_links_v7','SELECT COUNT(*) AS row_count FROM ledger_transaction_links_v7 WHERE namespace=?',[activeNamespace]],
    ['entities','ledger_entities_v7',`SELECT COUNT(*) AS row_count, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS live_count, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted_count FROM ledger_entities_v7 WHERE namespace=?`,[activeNamespace]],
    ['currencies','ledger_currencies','SELECT COUNT(*) AS row_count FROM ledger_currencies',[]],
  ];
  for (const [name, table, sql, params] of countSpecs) financialCounts[name] = await readRows({ db, present, table, sql, params });
  const entityTypeSummary = await readRows({ db, present, table: 'ledger_entities_v7', sql: `SELECT entity_type,COUNT(*) AS row_count,SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS live_count,SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted_count FROM ledger_entities_v7 WHERE namespace=? GROUP BY entity_type ORDER BY entity_type`, params: [activeNamespace] });

  let foreignKeyCheck = { available: true, rows: [] };
  try { const rows = await db.getAllAsync('PRAGMA foreign_key_check'); foreignKeyCheck = { available: true, rows: Array.isArray(rows) ? rows : [] }; }
  catch (error) { foreignKeyCheck = { available: true, error: errorText(error), rows: [] }; }
  const reservedIdentity = reservedLedgerId ? await readRows({ db, present, table: 'ledger_sync_identity_v8', sql: `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at FROM ledger_sync_identity_v8 WHERE ledger_id=?`, params: [reservedLedgerId] }) : { available: present.has('ledger_sync_identity_v8'), rows: [] };
  const rowCount = evidence => Number(evidence?.rows?.[0]?.row_count || 0);
  const childCounts = { ledger_outbox_v3: rowCount(allV3Outbox), ledger_inbox_v3: rowCount(allV3Inbox), ledger_bootstrap_state_v8: rowCount(allBootstrapState), ledger_bootstrap_import_state_v8: rowCount(allBootstrapImport), ledger_sync_state_v8: rowCount(allSyncState) };
  const blockers = [];
  if (!activeLedgerId) blockers.push('local_ledger_identity_missing');
  if (!reservedLedgerId) blockers.push('reserved_cloud_ledger_identity_missing');
  if (activeLedgerId && reservedLedgerId && activeLedgerId === reservedLedgerId) blockers.push('identity_already_matches_no_adoption_needed');
  for (const [table, count] of Object.entries(childCounts)) if (count > 0) blockers.push(`fk_child_rows_present:${table}:${count}`);
  if ((reservedIdentity.rows || []).length > 0 && reservedLedgerId !== activeLedgerId) blockers.push('reserved_ledger_id_already_exists_locally');
  if (foreignKeyCheck.error) blockers.push('foreign_key_check_failed');
  if ((foreignKeyCheck.rows || []).length > 0) blockers.push('existing_foreign_key_violations');
  const directLedgerIdUpdateSafeByCurrentFKState = blockers.length === 0;
  const cloudEvidence = cloudRecovery && typeof cloudRecovery === 'object' ? { status: cloudRecovery.status || null, mode: cloudRecovery.mode || null, workspaceNamespace: cloudRecovery.workspaceNamespace || null, ledgerNamespace: cloudRecovery.ledgerNamespace || null, localLedgerId: cloudRecovery.localLedgerId || null, cloudLedgerId: cloudRecovery.cloudLedgerId || cloudRecovery.reservedLedgerId || null, cloudRestoreEpoch: Number(cloudRecovery.cloudRestoreEpoch || cloudRecovery.restoreEpoch || 0) || null, cloudRevision: Number(cloudRecovery.cloudRevision || 0) || 0, cloudUpdatedAt: cloudRecovery.cloudUpdatedAt || null, sourceHash: cloudRecovery.sourceHash || cloudRecovery.snapshotHash || null, verifiedAt: cloudRecovery.verifiedAt || null, legacyFinancialCount: Number(cloudRecovery.legacyFinancialCount || 0) || 0, walletCount: Number(cloudRecovery.walletCount || 0) || 0, bootstrapId: cloudRecovery.bootstrapId || null, error: cloudRecovery.error || null } : null;

  return {
    ...base,
    supported: true,
    ok: true,
    databaseOpenedBeforeDiagnostic: true,
    tables,
    activeIdentity,
    cloudEvidence,
    identityAdoptionPreflight: { activeLedgerId: activeLedgerId || null, reservedLedgerId: reservedLedgerId || null, childCounts, reservedIdentity, foreignKeyCheck, directLedgerIdUpdateSafeByCurrentFKState, blockers },
    bootstrapState,
    bootstrapImportState,
    syncIdentity,
    syncState,
    v1Outbox,
    financialCounts,
    entityTypeSummary,
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
