// P19-015B0_LEDGER_IDENTITY_FORENSICS
// P19-015B1_LEDGER_IDENTITY_ADOPTION_PREFLIGHT
// Extends P19-014A diagnostics with read-only ledger identity adoption preflight evidence.
// Read-only evidence collector for the already-open native financial SQLite DB.
// This module intentionally never opens, initializes, migrates, writes, deletes, or syncs anything.
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
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

const P19_B1_FINANCIAL_KEYS = new Set([
  'trans',
  'transactions',
  'wallets',
  'debts',
  'goals',
  'commitments',
  'postings',
  'accounts',
  'links',
  'exchangerates',
  'originaltransaction',
  'transaction',
]);

const P19_B1_WORKSPACE_OUTER_KEYS = new Set([
  'namespace',
  'entityType',
  'id',
  'revision',
  'baseRevision',
  'deletedAt',
  'payload',
  'createdAt',
  'updatedAt',
]);

const P19_B1_WORKSPACE_INNER_KEYS = new Set(['cfg', 'notif', 'cloudRevision']);

const p19B1ObjectKeys = value => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort()
    : []
);

const p19B1FinancialKeyPaths = (value, prefix = '', depth = 0, result = []) => {
  if (depth > 8 || value == null) return result;
  if (Array.isArray(value)) {
    for (let index = 0; index < Math.min(value.length, 8); index += 1) {
      p19B1FinancialKeyPaths(value[index], `${prefix}[${index}]`, depth + 1, result);
    }
    return result;
  }
  if (typeof value !== 'object') return result;
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (P19_B1_FINANCIAL_KEYS.has(String(key).toLowerCase())) result.push(path);
    p19B1FinancialKeyPaths(child, path, depth + 1, result);
  }
  return [...new Set(result)].sort();
};

const p19B1Sha256 = async value => String(await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  String(value ?? ''),
)).toLowerCase();

const p19B1ClassifyWorkspaceRows = async (rows = [], { version = 3 } = {}) => {
  const result = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const payloadText = String(row?.payload_json || '');
    let envelope = null;
    let jsonError = null;
    try {
      envelope = payloadText ? JSON.parse(payloadText) : null;
    } catch (error) {
      jsonError = errorText(error);
    }
    const outerKeys = p19B1ObjectKeys(envelope);
    const inner = envelope?.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload)
      ? envelope.payload
      : null;
    const innerKeys = p19B1ObjectKeys(inner);
    const financialKeyPaths = p19B1FinancialKeyPaths(envelope);
    const rowRevision = Number(version === 3 ? row?.revision : row?.entity_revision);
    const rowBaseRevision = version === 3
      ? Number(row?.base_revision)
      : Number(envelope?.baseRevision);
    const expectedOuter = [
      'namespace', 'entityType', 'id', 'revision', 'baseRevision',
      'deletedAt', 'payload', 'createdAt', 'updatedAt',
    ];
    const outerShapeSafe = !!envelope
      && expectedOuter.every(key => Object.prototype.hasOwnProperty.call(envelope, key))
      && outerKeys.every(key => P19_B1_WORKSPACE_OUTER_KEYS.has(key));
    const innerShapeSafe = !!inner
      && ['cfg', 'notif', 'cloudRevision'].every(
        key => Object.prototype.hasOwnProperty.call(inner, key),
      )
      && innerKeys.every(key => P19_B1_WORKSPACE_INNER_KEYS.has(key));
    const workspaceIdentitySafe = String(row?.entity_type || '') === 'workspace'
      && String(row?.entity_id || '') === 'workspace'
      && String(row?.operation || '') === 'upsert'
      && String(envelope?.namespace || '') === String(row?.namespace || '')
      && String(envelope?.entityType || '') === 'workspace'
      && String(envelope?.id || '') === 'workspace';
    const revisionSafe = Number.isSafeInteger(rowRevision)
      && rowRevision > 0
      && Number.isSafeInteger(rowBaseRevision)
      && rowBaseRevision === rowRevision - 1
      && Number(envelope?.revision) === rowRevision
      && Number(envelope?.baseRevision) === rowBaseRevision;
    const noFinancialPayload = financialKeyPaths.length === 0;
    result.push({
      version,
      sequenceId: Number(row?.sequence_id || 0),
      mutationId: row?.mutation_id || null,
      commandId: version === 3 ? (row?.command_id || null) : null,
      namespace: row?.namespace || null,
      ledgerId: version === 3 ? (row?.ledger_id || null) : null,
      restoreEpoch: version === 3 ? Number(row?.restore_epoch || 0) : null,
      entityType: row?.entity_type || null,
      entityId: row?.entity_id || null,
      operation: row?.operation || null,
      revision: rowRevision,
      baseRevision: rowBaseRevision,
      attempts: Number(row?.attempts || 0),
      acknowledged: !!row?.acknowledged_at,
      superseded: version === 3 ? !!row?.superseded_at : false,
      payloadTextLength: payloadText.length,
      payloadSha256: await p19B1Sha256(payloadText),
      jsonValid: !jsonError && !!envelope,
      jsonError,
      topLevelKeys: outerKeys,
      innerKeys,
      financialKeyPaths,
      outerShapeSafe,
      innerShapeSafe,
      workspaceIdentitySafe,
      revisionSafe,
      noFinancialPayload,
      payloadSafe: !jsonError
        && outerShapeSafe
        && innerShapeSafe
        && workspaceIdentitySafe
        && revisionSafe
        && noFinancialPayload,
    });
  }
  return result;
};

const p19B1ContiguousRevisionChain = rows => {
  const ordered = [...(Array.isArray(rows) ? rows : [])]
    .sort((left, right) => Number(left.revision) - Number(right.revision));
  if (!ordered.length) return true;
  const first = Number(ordered[0].revision);
  if (first !== 1) return false;
  return ordered.every((row, index) => (
    Number(row.revision) === index + 1
    && Number(row.baseRevision) === index
  ));
};

const p19B1OutboxPairing = (legacyRows, shadowRows) => {
  const left = Array.isArray(legacyRows) ? legacyRows : [];
  const right = Array.isArray(shadowRows) ? shadowRows : [];
  const byRevision = new Map(left.map(row => [Number(row.revision), row]));
  const exact = left.length === right.length
    && right.every(row => {
      const legacy = byRevision.get(Number(row.revision));
      return !!legacy
        && legacy.payloadSha256 === row.payloadSha256
        && legacy.entityType === row.entityType
        && legacy.entityId === row.entityId
        && legacy.operation === row.operation
        && Number(legacy.baseRevision) === Number(row.baseRevision);
    });
  return {
    exact,
    legacyRowCount: left.length,
    shadowRowCount: right.length,
    legacyRevisionChain: p19B1ContiguousRevisionChain(left),
    shadowRevisionChain: p19B1ContiguousRevisionChain(right),
    pairedRevisions: right
      .filter(row => byRevision.has(Number(row.revision)))
      .map(row => Number(row.revision))
      .sort((a, b) => a - b),
  };
};

export async function collectP19LocalSqliteDiagnostics({
  workspaceNamespace = 'guest',
  cfg = {},
  cloudRecovery = null,
} = {}) {
  const activeNamespace = getLedgerNamespace(workspaceNamespace, cfg);
  const base = {
    patchId: 'P19-015B1',
    parentPatchId: 'P19-015B0',
    marker: 'P19-015B1_LEDGER_IDENTITY_ADOPTION_PREFLIGHT',
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

const p19B1IdentityChildTables = [
    'ledger_outbox_v3',
    'ledger_inbox_v3',
    'ledger_bootstrap_state_v8',
    'ledger_bootstrap_import_state_v8',
    'ledger_sync_state_v8',
  ];
  const identityTopology = {
    available: true,
    parentTable: 'ledger_sync_identity_v8',
    tables: {},
    expectedReferenceTablesAllObserved: true,
    parentChangeCascadeCovered: false,
  };
  const identityReferenceRows = [];
  for (const table of p19B1IdentityChildTables) {
    if (!present.has(table)) {
      identityTopology.tables[table] = { available: false, rows: [] };
      identityTopology.expectedReferenceTablesAllObserved = false;
      continue;
    }
    try {
      const rows = await db.getAllAsync(`PRAGMA foreign_key_list(${table})`);
      const refs = (Array.isArray(rows) ? rows : [])
        .filter(row => String(row?.table || '') === 'ledger_sync_identity_v8')
        .map(row => ({
          id: Number(row?.id ?? -1),
          seq: Number(row?.seq ?? -1),
          from: row?.from || null,
          to: row?.to || null,
          onUpdate: row?.on_update || null,
          onDelete: row?.on_delete || null,
          match: row?.match || null,
        }));
      identityTopology.tables[table] = { available: true, rows: refs };
      if (!refs.length) identityTopology.expectedReferenceTablesAllObserved = false;
      for (const ref of refs) identityReferenceRows.push({ table, ...ref });
    } catch (error) {
      identityTopology.tables[table] = { available: true, error: errorText(error), rows: [] };
      identityTopology.expectedReferenceTablesAllObserved = false;
    }
  }
  identityTopology.referenceCount = identityReferenceRows.length;
  identityTopology.references = identityReferenceRows;
  identityTopology.parentChangeCascadeCovered = identityReferenceRows.length > 0
    && identityReferenceRows.every(row => String(row.onUpdate || '').toUpperCase() === 'CASCADE');

  const activeRestoreEpoch = Math.max(1, Number(activeIdentity?.restore_epoch || 1));
  const activeV3PayloadRows = activeLedgerId ? await readRows({
    db,
    present,
    table: 'ledger_outbox_v3',
    sql: `SELECT sequence_id,namespace,ledger_id,restore_epoch,mutation_id,command_id,
                 entity_type,entity_id,operation,revision,base_revision,payload_json,
                 created_at,attempts,acknowledged_at,last_error,superseded_at
            FROM ledger_outbox_v3
           WHERE namespace=? AND ledger_id=? AND restore_epoch=?
             AND acknowledged_at IS NULL
             AND superseded_by_bootstrap_id IS NULL
           ORDER BY sequence_id`,
    params: [activeNamespace, activeLedgerId, activeRestoreEpoch],
  }) : { available: present.has('ledger_outbox_v3'), rows: [] };

  const activeV1PayloadRows = await readRows({
    db,
    present,
    table: 'ledger_outbox_v2',
    sql: `SELECT sequence_id,namespace,mutation_id,entity_type,entity_id,operation,
                 entity_revision,payload_version,payload_json,created_at,attempts,
                 acknowledged_at,last_error
            FROM ledger_outbox_v2
           WHERE namespace=? AND acknowledged_at IS NULL
           ORDER BY sequence_id`,
    params: [activeNamespace],
  });

  const shadowRows = await p19B1ClassifyWorkspaceRows(activeV3PayloadRows.rows, { version: 3 });
  const legacyRows = await p19B1ClassifyWorkspaceRows(activeV1PayloadRows.rows, { version: 2 });
  const legacyToShadowPairing = p19B1OutboxPairing(legacyRows, shadowRows);

  const reservedChildCounts = {};
  for (const table of p19B1IdentityChildTables) {
    if (!reservedLedgerId || !present.has(table)) {
      reservedChildCounts[table] = 0;
      continue;
    }
    const evidence = await readRows({
      db,
      present,
      table,
      sql: `SELECT COUNT(*) AS row_count FROM ${table} WHERE ledger_id=?`,
      params: [reservedLedgerId],
    });
    reservedChildCounts[table] = rowCount(evidence);
  }

  const financialRowCount = name => Number(financialCounts?.[name]?.rows?.[0]?.row_count || 0);
  const activeEntityTypes = (entityTypeSummary.rows || []).filter(row => Number(row?.row_count || 0) > 0);
  const strictEmptyFinancialShell = financialRowCount('accounts') === 0
    && financialRowCount('transactions') === 0
    && financialRowCount('postings') === 0
    && financialRowCount('links') === 0
    && financialRowCount('entities') <= 1
    && activeEntityTypes.every(row => String(row?.entity_type || '') === 'workspace');

  const activeTransportStateEmptyExceptShadowOutbox = childCounts.ledger_inbox_v3 === 0
    && childCounts.ledger_bootstrap_state_v8 === 0
    && childCounts.ledger_bootstrap_import_state_v8 === 0
    && childCounts.ledger_sync_state_v8 === 0;
  const allShadowRowsSafe = shadowRows.every(row => row.payloadSafe);
  const allLegacyRowsSafe = legacyRows.every(row => row.payloadSafe);
  const activeV3Summary = allV3Outbox.rows?.[0] || {};
  const activeV1Summary = v1Outbox.rows?.[0] || {};
  const activeV3RowsFullyClassified = Number(activeV3Summary.row_count || 0) === shadowRows.length
    && Number(activeV3Summary.pending_count || 0) === shadowRows.length
    && Number(activeV3Summary.superseded_count || 0) === 0
    && Number(activeV3Summary.epoch_count || 0) <= 1;
  const activeV1RowsFullyClassified = Number(activeV1Summary.row_count || 0) === legacyRows.length
    && Number(activeV1Summary.pending_count || 0) === legacyRows.length;
  const reservedChildrenEmpty = Object.values(reservedChildCounts).every(value => Number(value) === 0);
  const foreignKeyClean = !foreignKeyCheck.error && (foreignKeyCheck.rows || []).length === 0;
  const sourceHashValid = /^[0-9a-f]{64}$/i.test(String(cloudEvidence?.sourceHash || ''));
  const cloudSourceVerified = cloudEvidence?.mode === 'legacy_snapshot'
    && cloudEvidence?.status === 'blocked_reserved_ledger_identity'
    && cloudEvidence?.error === 'financial_v2_reserved_ledger_identity_adoption_required'
    && sourceHashValid
    && Number(cloudEvidence?.cloudRevision || 0) > 0
    && Number(cloudEvidence?.legacyFinancialCount || 0) > 0
    && Number(cloudEvidence?.walletCount || 0) > 0
    && !cloudEvidence?.bootstrapId;
  const epochMatches = Number(cloudEvidence?.cloudRestoreEpoch || 0) === activeRestoreEpoch;
  const reservedIdentityAbsentLocally = (reservedIdentity.rows || []).length === 0;
  const identitySplitConfirmed = !!activeLedgerId
    && !!reservedLedgerId
    && activeLedgerId !== reservedLedgerId;
  const topologyRequiresCoordinatedChildHandling = identityTopology.expectedReferenceTablesAllObserved
    && !identityTopology.parentChangeCascadeCovered;

  const adoptionDesignBlockers = [];
  if (!identitySplitConfirmed) adoptionDesignBlockers.push('identity_split_not_confirmed');
  if (!epochMatches) adoptionDesignBlockers.push('restore_epoch_mismatch');
  if (!cloudSourceVerified) adoptionDesignBlockers.push('verified_legacy_cloud_source_missing');
  if (!strictEmptyFinancialShell) adoptionDesignBlockers.push('local_financial_shell_not_empty');
  if (!activeTransportStateEmptyExceptShadowOutbox) adoptionDesignBlockers.push('active_transport_state_present');
  if (!activeV3RowsFullyClassified) adoptionDesignBlockers.push('shadow_outbox_not_fully_classified');
  if (!activeV1RowsFullyClassified) adoptionDesignBlockers.push('legacy_outbox_not_fully_classified');
  if (!allShadowRowsSafe) adoptionDesignBlockers.push('shadow_outbox_payload_not_workspace_safe');
  if (!allLegacyRowsSafe) adoptionDesignBlockers.push('legacy_outbox_payload_not_workspace_safe');
  if (!legacyToShadowPairing.exact
      || !legacyToShadowPairing.legacyRevisionChain
      || !legacyToShadowPairing.shadowRevisionChain) {
    adoptionDesignBlockers.push('legacy_shadow_outbox_pairing_mismatch');
  }
  if (!reservedIdentityAbsentLocally) adoptionDesignBlockers.push('reserved_identity_present_locally');
  if (!reservedChildrenEmpty) adoptionDesignBlockers.push('reserved_identity_child_state_present');
  if (!foreignKeyClean) adoptionDesignBlockers.push('foreign_key_state_not_clean');
  if (!identityTopology.expectedReferenceTablesAllObserved) {
    adoptionDesignBlockers.push('identity_fk_topology_incomplete');
  }
  if (!topologyRequiresCoordinatedChildHandling) {
    adoptionDesignBlockers.push('identity_fk_topology_unexpected');
  }
  if (activeV3PayloadRows.error) adoptionDesignBlockers.push('shadow_outbox_payload_read_failed');
  if (activeV1PayloadRows.error) adoptionDesignBlockers.push('legacy_outbox_payload_read_failed');

  const outboxPayloadForensics = {
    rawPayloadReturned: false,
    shadowV2: {
      available: activeV3PayloadRows.available,
      error: activeV3PayloadRows.error || null,
      rows: shadowRows,
      allWorkspaceSafe: allShadowRowsSafe,
      fullyClassified: activeV3RowsFullyClassified,
    },
    legacyV1: {
      available: activeV1PayloadRows.available,
      error: activeV1PayloadRows.error || null,
      rows: legacyRows,
      allWorkspaceSafe: allLegacyRowsSafe,
      fullyClassified: activeV1RowsFullyClassified,
    },
    pairing: legacyToShadowPairing,
  };

  const adoptionDesignPreflight = {
    readOnly: true,
    authorizedToMutate: false,
    identitySplitConfirmed,
    epochMatches,
    cloudSourceVerified,
    strictEmptyFinancialShell,
    activeTransportStateEmptyExceptShadowOutbox,
    reservedIdentityAbsentLocally,
    reservedChildrenEmpty,
    foreignKeyClean,
    topologyRequiresCoordinatedChildHandling,
    activeShadowOutboxRows: shadowRows.length,
    activeLegacyOutboxRows: legacyRows.length,
    eligibleForB2Design: adoptionDesignBlockers.length === 0,
    blockers: adoptionDesignBlockers,
  };

  const recoveryContract = {
    version: 1,
    phase: 'P19-015B1',
    readOnlyEvidenceOnly: true,
    b2MutationAuthorized: false,
    maintenanceLockRequired: true,
    singleExclusiveTransactionRequiredForIdentityRebind: true,
    parentOnlyIdentityChangeForbidden: true,
    preserveLegacyCloudSourceUntilV2Readback: true,
    preserveOldLocalIdentityEvidenceUntilRecoveryProof: true,
    workspaceShadowRowsMustNotReachCloudBeforeBootstrapProof: true,
    workspaceShadowRowsMayBeSupersededOnlyAfterVerifiedBootstrap: true,
    verifiedLegacyRestoreRequiredBeforeV2Bootstrap: true,
    localInvariantProofRequiredAfterLegacyRestore: true,
    localRoundTripProofRequiredAfterLegacyRestore: true,
    durableRecoveryResumeMarkerRequired: true,
    v1FallbackMustRemainBlockedAcrossRestartAfterRecoveryStarts: true,
    cloudBootstrapReadbackRequiredBeforeActivation: true,
    rollbackEvidenceRequired: true,
    sqliteSchemaMustRemainV8ForB2: true,
    secureStoreChangeRequired: false,
  };

  return {
    ...base,
    supported: true,
    ok: true,
    databaseOpenedBeforeDiagnostic: true,
    tables,
    activeIdentity,
    cloudEvidence,
    identityTopology,
    outboxPayloadForensics,
    adoptionDesignPreflight,
    recoveryContract,
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
