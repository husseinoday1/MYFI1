// Phase 12 — read-only diagnostics for the V2 sync-conflict / restore-recovery
// chain. A real-device test round today only surfaces one problem at a time,
// each costing a full fix -> commit -> approve -> build -> install -> test ->
// read-log cycle. This bundles every piece of that chain's state into one
// read so a single round can see all of it at once.
//
// Same safety property as p19LocalSqliteDiagnostics.js: never opens or
// initializes the database (uses peekLedgerDb, not getLedgerDb), never
// writes, never touches Supabase or the network.
import { Platform } from 'react-native';
import { getLedgerNamespace } from '../lib/activeLedgerRepository';
import { peekLedgerDb } from '../lib/ledgerDatabase';
import { resumePreparedCloudConflictRecoveryV1 } from '../lib/financialV2ConflictRecoveryV1';

const REQUIRED_TABLES = [
  'ledger_sync_identity_v8',
  'ledger_v7_meta',
  'ledger_bootstrap_recovery_import_v9',
  'ledger_archive_recovery_import_v11',
  'ledger_outbox_v3',
  'ledger_outbox_v2',
];

const text = value => String(value ?? '').trim();
const errorText = error => String(error?.message || error || 'unknown_error');
const parseJson = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };

const readRows = async ({ db, present, table, sql, params = [] }) => {
  if (!present.has(table)) return { available: false, rows: [] };
  try {
    const rows = await db.getAllAsync(sql, ...params);
    return { available: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    return { available: true, error: errorText(error), rows: [] };
  }
};

const intentKey = namespace => `financial_v2_conflict_recovery_intent_v1:${namespace}`;
const checkpointKey = (namespace, id) => `financial_v2_conflict_checkpoint_v1:${namespace}:${id}`;

export async function collectP12ConflictRecoveryDiagnostics({
  workspaceNamespace = 'guest', cfg = {}, user = null,
} = {}) {
  const activeNamespace = getLedgerNamespace(workspaceNamespace, cfg);
  const accountId = text(user?.id);
  const base = {
    marker: 'P12_CONFLICT_RECOVERY_DIAGNOSTICS',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    activeNamespace,
    accountId: accountId || null,
  };

  if (Platform.OS === 'web') return { ...base, supported: false, ok: false, reason: 'sqlite_native_only' };

  // Critical safety property: never invoke the database opener from a
  // diagnostics read. If the normal app runtime has not already opened the
  // ledger, this stops instead of opening/migrating it.
  const existingDbPromise = peekLedgerDb();
  if (!existingDbPromise) return { ...base, supported: true, ok: false, reason: 'database_not_open' };

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
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (
        'ledger_sync_identity_v8','ledger_v7_meta','ledger_bootstrap_recovery_import_v9',
        'ledger_archive_recovery_import_v11','ledger_outbox_v3','ledger_outbox_v2'
      )`,
    );
  } catch (error) {
    return { ...base, supported: true, ok: false, reason: `sqlite_master_read_failed:${errorText(error)}` };
  }
  const present = new Set((tableRows || []).map(row => String(row?.name || '')));
  const tables = {
    present: REQUIRED_TABLES.filter(name => present.has(name)),
    missing: REQUIRED_TABLES.filter(name => !present.has(name)),
  };

  const identity = await readRows({
    db, present, table: 'ledger_sync_identity_v8',
    sql: `SELECT ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
    params: [activeNamespace],
  });

  const intentRow = await readRows({
    db, present, table: 'ledger_v7_meta',
    sql: `SELECT value,updated_at FROM ledger_v7_meta WHERE key=? LIMIT 1`,
    params: [intentKey(activeNamespace)],
  });
  const intent = parseJson(intentRow.rows?.[0]?.value);
  const checkpointId = text(intent?.local?.checkpointId);

  let checkpointRow = { available: present.has('ledger_v7_meta'), rows: [] };
  if (checkpointId) {
    checkpointRow = await readRows({
      db, present, table: 'ledger_v7_meta',
      sql: `SELECT value,updated_at FROM ledger_v7_meta WHERE key=? LIMIT 1`,
      params: [checkpointKey(activeNamespace, checkpointId)],
    });
  }
  const checkpoint = parseJson(checkpointRow.rows?.[0]?.value);

  const bootstrapImports = await readRows({
    db, present, table: 'ledger_bootstrap_recovery_import_v9',
    sql: `SELECT session_id,status,source_ledger_id,source_restore_epoch,
                 created_at,updated_at,verified_at,last_error
            FROM ledger_bootstrap_recovery_import_v9
           WHERE namespace=?
           ORDER BY created_at DESC LIMIT 10`,
    params: [activeNamespace],
  });

  const archiveImports = await readRows({
    db, present, table: 'ledger_archive_recovery_import_v11',
    sql: `SELECT session_id,status,source_ledger_id,source_restore_epoch,
                 created_at,updated_at,verified_at,last_error
            FROM ledger_archive_recovery_import_v11
           WHERE namespace=?
           ORDER BY created_at DESC LIMIT 10`,
    params: [activeNamespace],
  });

  const outboxV3Pending = await readRows({
    db, present, table: 'ledger_outbox_v3',
    sql: `SELECT COUNT(*) AS row_count FROM ledger_outbox_v3
           WHERE namespace=? AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL`,
    params: [activeNamespace],
  });

  const identityLedgerId = text(identity.rows?.[0]?.ledger_id);
  const identityRestoreEpoch = Number(identity.rows?.[0]?.restore_epoch || 0);
  let outboxV3PendingRows = { available: present.has('ledger_outbox_v3'), rows: [] };
  if (identityLedgerId && identityRestoreEpoch > 0) {
    outboxV3PendingRows = await readRows({
      db, present, table: 'ledger_outbox_v3',
      sql: `SELECT sequence_id,mutation_id,command_id,namespace,ledger_id,restore_epoch,
                   entity_type,entity_id,operation,revision,base_revision,payload_json,
                   created_at,acknowledged_at,superseded_by_bootstrap_id
              FROM ledger_outbox_v3
             WHERE ledger_id=? AND restore_epoch=?
               AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL
             ORDER BY sequence_id ASC`,
      params: [identityLedgerId, identityRestoreEpoch],
    });
  }

  const outboxV2Pending = await readRows({
    db, present, table: 'ledger_outbox_v2',
    sql: `SELECT COUNT(*) AS row_count FROM ledger_outbox_v2 WHERE namespace=? AND acknowledged_at IS NULL`,
    params: [activeNamespace],
  });

  // Whether V2 is live. Only then is the legacy outbox provably unreadable by
  // the sync path, which is what makes reviewing those rows for removal safe.
  const syncState = await readRows({
    db, present, table: 'ledger_sync_identity_v8',
    sql: `SELECT activated_at FROM ledger_sync_state_v8
           WHERE ledger_id=(SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1)
             AND restore_epoch=(SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1)
           LIMIT 1`,
    params: [activeNamespace, activeNamespace],
  });

  // What the owner has already reviewed and confirmed, so the screen can show
  // each row's state instead of asking again.
  const legacyAckRow = await readRows({
    db, present, table: 'ledger_v7_meta',
    sql: `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
    params: [`financial_v2_legacy_outbox_ack_v1:${activeNamespace}`],
  });
  const legacyAck = parseJson(legacyAckRow.rows?.[0]?.value);

  // The legacy V1 outbox is written again whenever V2 is not activated, so rows
  // can survive a recovery that only cleared V3. A count alone cannot say what
  // they carry: payload_json here is the whole entity envelope, and after a
  // checkpoint restore it may be the last local copy of something the owner
  // created. Read them in full. The bounded limit is intentional — compare
  // rows.length against outboxV2PendingCount to detect a truncated list.
  const outboxV2PendingRows = await readRows({
    db, present, table: 'ledger_outbox_v2',
    sql: `SELECT sequence_id,namespace,mutation_id,entity_type,entity_id,operation,
                 entity_revision,payload_version,payload_json,created_at,
                 attempts,next_attempt_at,acknowledged_at,last_error
            FROM ledger_outbox_v2
           WHERE namespace=? AND acknowledged_at IS NULL
           ORDER BY sequence_id ASC LIMIT 50`,
    params: [activeNamespace],
  });

  // resumePreparedCloudConflictRecoveryV1 is called exactly as shipped, with
  // the already-open handle passed in explicitly so it never calls
  // getLedgerDb() itself and cannot trigger a database open from here.
  let resume = { supported: false, ok: false, found: false, reason: 'account_id_missing' };
  if (accountId) {
    try {
      resume = await resumePreparedCloudConflictRecoveryV1({ namespace: activeNamespace, accountId, database: db });
    } catch (error) {
      resume = { supported: true, ok: false, found: false, reason: `resume_threw:${errorText(error)}` };
    }
  }

  return {
    ...base,
    supported: true,
    ok: true,
    tables,
    identity: identity.rows?.[0] || null,
    intentPresent: !!intent,
    intent: intent ? {
      status: intent.status || null,
      checkpointId: intent.local?.checkpointId || null,
      preparedAt: intent.preparedAt || null,
      cloudLedgerId: intent.cloud?.ledgerId || null,
      cloudRestoreEpoch: intent.cloud?.restoreEpoch ?? null,
    } : null,
    checkpointPresent: !!checkpoint,
    checkpoint: checkpoint ? {
      checkpointId: checkpoint.checkpointId || null,
      checkpointNamespace: checkpoint.checkpointNamespace || null,
      sourceGeneration: checkpoint.sourceGeneration ?? null,
      counts: checkpoint.counts || null,
      // The moment the owner's data was preserved: the only evidence-backed
      // boundary between rows that predate this incident and rows it produced.
      createdAt: checkpoint.createdAt || null,
    } : null,
    bootstrapImports: bootstrapImports.rows || [],
    archiveImports: archiveImports.rows || [],
    outboxV3PendingCount: Number(outboxV3Pending.rows?.[0]?.row_count || 0),
    outboxV3PendingRows: outboxV3PendingRows.rows || [],
    outboxV2PendingCount: Number(outboxV2Pending.rows?.[0]?.row_count || 0),
    outboxV2PendingRows: outboxV2PendingRows.rows || [],
    activatedAt: syncState.rows?.[0]?.activated_at || null,
    legacyOutboxAcknowledged: legacyAck?.version === 1 && legacyAck.rows && typeof legacyAck.rows === 'object'
      ? Object.values(legacyAck.rows).map(entry => Number(entry?.sequenceId))
      : [],
    resume,
  };
}
