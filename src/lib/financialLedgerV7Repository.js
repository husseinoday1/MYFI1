import { Platform } from 'react-native';
import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';
import { runLedgerSchemaMigrations } from './financialLedgerSchemaMigrations';
import {
  buildExpenseLedgerCommand,
  buildFinancialLedgerCommand,
  FINANCIAL_LEDGER_SCHEMA_VERSION,
} from './financialLedgerV7Model';

const readyDatabases = new WeakSet();
const readyDatabasePromises = new WeakMap();
export const FINANCIAL_SQLITE_SCHEMA_VERSION = 8;

const safeJson = value => {
  try { return JSON.stringify(value ?? null); } catch { return 'null'; }
};

const parseJson = (value, fallback = null) => {
  try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
};

const enqueueWrite = enqueueLedgerWrite;

export const financialLedgerV7Supported = () => Platform.OS !== 'web';

export const FINANCIAL_LEDGER_V7_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ledger_v7_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_currencies (
  code TEXT PRIMARY KEY,
  minor_exponent INTEGER NOT NULL CHECK(minor_exponent BETWEEN 0 AND 6),
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS ledger_accounts_v7 (
  namespace TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT,
  account_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  PRIMARY KEY(namespace, id),
  FOREIGN KEY(currency_code) REFERENCES ledger_currencies(code)
);
CREATE TABLE IF NOT EXISTS ledger_exchange_rates_v7 (
  namespace TEXT NOT NULL,
  id TEXT NOT NULL,
  base_currency_code TEXT NOT NULL,
  quote_currency_code TEXT NOT NULL,
  numerator INTEGER NOT NULL CHECK(numerator > 0),
  denominator INTEGER NOT NULL CHECK(denominator > 0),
  rate_date TEXT NOT NULL,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  PRIMARY KEY(namespace, id),
  FOREIGN KEY(base_currency_code) REFERENCES ledger_currencies(code),
  FOREIGN KEY(quote_currency_code) REFERENCES ledger_currencies(code)
);
CREATE TABLE IF NOT EXISTS ledger_financial_transactions_v7 (
  namespace TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('posted','voided')),
  scope TEXT NOT NULL,
  date_iso TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  category_id TEXT,
  title TEXT,
  note TEXT,
  source_type TEXT,
  source_id TEXT,
  idempotency_key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  archive_year INTEGER,
  archived_at TEXT,
  deleted_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(namespace, id),
  UNIQUE(namespace, idempotency_key)
);
CREATE TABLE IF NOT EXISTS ledger_postings_v7 (
  namespace TEXT NOT NULL,
  id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK(bucket IN ('physical','reserved')),
  role TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor != 0),
  currency_code TEXT NOT NULL,
  exchange_rate_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(namespace, id),
  FOREIGN KEY(namespace, transaction_id) REFERENCES ledger_financial_transactions_v7(namespace, id) ON DELETE RESTRICT,
  FOREIGN KEY(namespace, account_id) REFERENCES ledger_accounts_v7(namespace, id) ON DELETE RESTRICT,
  FOREIGN KEY(namespace, exchange_rate_id) REFERENCES ledger_exchange_rates_v7(namespace, id) ON DELETE RESTRICT,
  FOREIGN KEY(currency_code) REFERENCES ledger_currencies(code)
);
CREATE TABLE IF NOT EXISTS ledger_transaction_links_v7 (
  namespace TEXT NOT NULL,
  id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  link_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  applied_amount_minor INTEGER,
  currency_code TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(namespace, id),
  FOREIGN KEY(namespace, transaction_id) REFERENCES ledger_financial_transactions_v7(namespace, id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS ledger_entities_v7 (
  namespace TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  deleted_at TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(namespace, entity_type, id)
);
CREATE TABLE IF NOT EXISTS ledger_workspace_state_v7 (
  namespace TEXT PRIMARY KEY,
  source_mode TEXT NOT NULL CHECK(source_mode IN ('shadow','sqlite')),
  schema_version INTEGER NOT NULL,
  shadow_checksum TEXT,
  shadow_verified_at TEXT,
  cutover_at TEXT,
  last_reconciled_at TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_migration_audits_v7 (
  namespace TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_checksum TEXT NOT NULL,
  target_checksum TEXT NOT NULL,
  source_counts_json TEXT NOT NULL,
  target_counts_json TEXT NOT NULL,
  differences_json TEXT NOT NULL,
  exact_match INTEGER NOT NULL CHECK(exact_match IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(namespace, run_id)
);
CREATE TABLE IF NOT EXISTS ledger_outbox_v2 (
  sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace TEXT NOT NULL,
  mutation_id TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('upsert','delete','void')),
  entity_revision INTEGER NOT NULL,
  payload_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  acknowledged_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS ledger_inbox_v2 (
  mutation_id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  server_sequence INTEGER NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_sync_state_v7 (
  namespace TEXT PRIMARY KEY,
  last_server_sequence INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT,
  last_device_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_v7_tx_date
  ON ledger_financial_transactions_v7(namespace, deleted_at, archived_at, date_iso DESC, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_v7_posting_account
  ON ledger_postings_v7(namespace, account_id, bucket, transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_v7_links
  ON ledger_transaction_links_v7(namespace, link_type, link_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_v7_entities
  ON ledger_entities_v7(namespace, entity_type, deleted_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_v7_outbox_pending
  ON ledger_outbox_v2(namespace, acknowledged_at, next_attempt_at, sequence_id);
  
`;

export const FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL = `
CREATE TABLE IF NOT EXISTS ledger_sync_identity_v8 (
  namespace TEXT PRIMARY KEY,
  ledger_id TEXT NOT NULL UNIQUE,
  restore_epoch INTEGER NOT NULL DEFAULT 1 CHECK(restore_epoch > 0),
  protocol_version INTEGER NOT NULL DEFAULT 2 CHECK(protocol_version = 2),
  minimum_supported_version INTEGER NOT NULL DEFAULT 2 CHECK(minimum_supported_version BETWEEN 1 AND 2),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(namespace, ledger_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_sync_identity_v8_ledger_id
  ON ledger_sync_identity_v8(ledger_id);

CREATE TABLE IF NOT EXISTS ledger_outbox_v3 (
  sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
  namespace TEXT NOT NULL,
  ledger_id TEXT NOT NULL,
  restore_epoch INTEGER NOT NULL CHECK(restore_epoch > 0),
  mutation_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('upsert','delete','void')),
  revision INTEGER NOT NULL CHECK(revision > 0),
  base_revision INTEGER NOT NULL CHECK(base_revision >= 0),
  protocol_version INTEGER NOT NULL DEFAULT 2 CHECK(protocol_version = 2),
  minimum_supported_version INTEGER NOT NULL DEFAULT 2 CHECK(minimum_supported_version BETWEEN 1 AND 2),
  payload_schema_version INTEGER NOT NULL CHECK(payload_schema_version > 0),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  acknowledged_at TEXT,
  last_error TEXT,
  superseded_by_bootstrap_id TEXT,
  superseded_at TEXT,
  CHECK(revision = base_revision + 1),
  UNIQUE(ledger_id, restore_epoch, mutation_id),
  FOREIGN KEY(namespace, ledger_id)
    REFERENCES ledger_sync_identity_v8(namespace, ledger_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_ledger_outbox_v3_pending
  ON ledger_outbox_v3(ledger_id, restore_epoch, acknowledged_at, next_attempt_at, sequence_id);
CREATE INDEX IF NOT EXISTS idx_ledger_outbox_v3_command
  ON ledger_outbox_v3(ledger_id, restore_epoch, command_id, sequence_id);

CREATE TABLE IF NOT EXISTS ledger_inbox_v3 (
  ledger_id TEXT NOT NULL,
  restore_epoch INTEGER NOT NULL CHECK(restore_epoch > 0),
  mutation_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  command_sequence INTEGER NOT NULL CHECK(command_sequence > 0),
  server_sequence INTEGER NOT NULL CHECK(server_sequence > 0),
  received_at TEXT NOT NULL,
  apply_status TEXT NOT NULL DEFAULT 'observed' CHECK(apply_status IN ('observed','applied','conflict')),
  applied_at TEXT,
  PRIMARY KEY(ledger_id, restore_epoch, mutation_id),
  FOREIGN KEY(ledger_id) REFERENCES ledger_sync_identity_v8(ledger_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_ledger_inbox_v3_sequence
  ON ledger_inbox_v3(ledger_id, restore_epoch, server_sequence);
CREATE INDEX IF NOT EXISTS idx_ledger_inbox_v3_command
  ON ledger_inbox_v3(ledger_id, restore_epoch, command_sequence, command_id, server_sequence);

CREATE TABLE IF NOT EXISTS ledger_bootstrap_state_v8 (
  namespace TEXT NOT NULL,
  ledger_id TEXT NOT NULL,
  restore_epoch INTEGER NOT NULL CHECK(restore_epoch > 0),
  bootstrap_id TEXT NOT NULL,
  stage_namespace TEXT NOT NULL,
  checkpoint_outbox_sequence INTEGER NOT NULL DEFAULT 0 CHECK(checkpoint_outbox_sequence >= 0),
  status TEXT NOT NULL CHECK(status IN ('staged','uploading','finalized','failed','aborted')),
  expected_row_count INTEGER CHECK(expected_row_count IS NULL OR expected_row_count >= 0),
  manifest_hash TEXT,
  created_at TEXT NOT NULL,
  finalized_at TEXT,
  last_error TEXT,
  PRIMARY KEY(ledger_id, restore_epoch, bootstrap_id),
  FOREIGN KEY(namespace, ledger_id)
    REFERENCES ledger_sync_identity_v8(namespace, ledger_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_ledger_bootstrap_state_v8_status
  ON ledger_bootstrap_state_v8(ledger_id, restore_epoch, status, created_at);

CREATE TABLE IF NOT EXISTS ledger_bootstrap_import_state_v8 (
  namespace TEXT NOT NULL,
  ledger_id TEXT NOT NULL,
  restore_epoch INTEGER NOT NULL CHECK(restore_epoch > 0),
  bootstrap_id TEXT NOT NULL,
  stage_namespace TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('downloading','verifying','finalized','failed','aborted')),
  expected_row_count INTEGER NOT NULL CHECK(expected_row_count >= 0),
  expected_manifest_hash TEXT NOT NULL,
  last_cloud_row_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_cloud_row_sequence >= 0),
  created_at TEXT NOT NULL,
  verified_at TEXT,
  finalized_at TEXT,
  last_error TEXT,
  PRIMARY KEY(ledger_id, restore_epoch, bootstrap_id),
  FOREIGN KEY(namespace, ledger_id)
    REFERENCES ledger_sync_identity_v8(namespace, ledger_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_ledger_bootstrap_import_state_v8_status
  ON ledger_bootstrap_import_state_v8(ledger_id, restore_epoch, status, created_at);

CREATE TABLE IF NOT EXISTS ledger_sync_state_v8 (
  ledger_id TEXT NOT NULL,
  restore_epoch INTEGER NOT NULL CHECK(restore_epoch > 0),
  shadow_last_server_sequence INTEGER NOT NULL DEFAULT 0 CHECK(shadow_last_server_sequence >= 0),
  last_server_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_server_sequence >= 0),
  last_shadow_success_at TEXT,
  last_success_at TEXT,
  activated_at TEXT,
  last_device_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(ledger_id, restore_epoch),
  FOREIGN KEY(ledger_id) REFERENCES ledger_sync_identity_v8(ledger_id) ON DELETE RESTRICT
);
`;

const FINANCIAL_LEDGER_V7_MIGRATION = {
  migrationId: '0007_financial_ledger_v7_baseline',
  fromVersion: 0,
  toVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
  signature: [
    FINANCIAL_LEDGER_V7_SCHEMA_SQL,
    "ALTER ledger_financial_transactions_v7 payload_json if missing",
    "ledger_v7_meta schema_version=7",
  ].join('\n'),
  apply: async (db) => {
    await db.execAsync(FINANCIAL_LEDGER_V7_SCHEMA_SQL);
    const columns = await db.getAllAsync(`PRAGMA table_info(ledger_financial_transactions_v7)`);
    if (!columns.some(column => column.name === 'payload_json')) {
      await db.execAsync(`ALTER TABLE ledger_financial_transactions_v7 ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}';`);
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES ('schema_version',?,?)`,
      String(FINANCIAL_LEDGER_SCHEMA_VERSION), new Date().toISOString(),
    );
  },
};

const FINANCIAL_LEDGER_V8_SYNC_IDENTITY_MIGRATION = {
  migrationId: '0008_sync_identity_v2',
  fromVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
  toVersion: FINANCIAL_SQLITE_SCHEMA_VERSION,
  signature: [
    FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL,
    'backfill immutable ledger ids for existing namespaces',
    'create shadow protocol-v2 outbox inbox and cursor state',
    'ledger_v7_meta sqlite_schema_version=8 sync_protocol_version=2',
  ].join('\n'),
  apply: async (db) => {
    await db.execAsync(FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL);
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR IGNORE INTO ledger_sync_identity_v8
       (namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
       SELECT namespace,
              'ledger-' || lower(hex(randomblob(16))),
              1,2,2,?,?
         FROM (
           SELECT namespace FROM ledger_workspace_state_v7
           UNION SELECT namespace FROM ledger_financial_transactions_v7
           UNION SELECT namespace FROM ledger_entities_v7
           UNION SELECT namespace FROM ledger_accounts_v7
           UNION SELECT namespace FROM ledger_outbox_v2
           UNION SELECT namespace FROM ledger_sync_state_v7
         )
        WHERE namespace IS NOT NULL AND trim(namespace) <> ''`,
      now, now,
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at)
       VALUES ('sqlite_schema_version',?,?)`,
      String(FINANCIAL_SQLITE_SCHEMA_VERSION), now,
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at)
       VALUES ('sync_protocol_version','2',?)`,
      now,
    );
  },
};

const financialLedgerHealthCheck = async (db) => {
  const row = await db.getFirstAsync('PRAGMA quick_check');
  const result = row ? Object.values(row)[0] : null;
  if (String(result || '').toLowerCase() !== 'ok') {
    throw new Error('financial_schema_health_check_failed');
  }
  return { ok: true, quickCheck: 'ok' };
};

export const ensureFinancialLedgerV7 = async (db) => {
  if (!db) return false;
  if (readyDatabases.has(db)) return true;

  const inFlight = readyDatabasePromises.get(db);
  if (inFlight) return inFlight;

  const readiness = (async () => {
    await runLedgerSchemaMigrations({
      database: db,
      migrations: [FINANCIAL_LEDGER_V7_MIGRATION, FINANCIAL_LEDGER_V8_SYNC_IDENTITY_MIGRATION],
      appVersion: '1.0.0',
      healthCheck: financialLedgerHealthCheck,
    });
    readyDatabases.add(db);
    return true;
  })();
  readyDatabasePromises.set(db, readiness);
  try {
    return await readiness;
  } finally {
    readyDatabasePromises.delete(db);
  }
};

export const ensureLedgerSyncIdentityV8 = async ({
  namespace = 'guest', database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  const value = String(namespace || '').trim();
  if (!value) throw new Error('ledger_sync_identity_namespace_required');

  return enqueueWrite(async () => {
    let row = await db.getFirstAsync(
      `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at
         FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
      value,
    );
    if (!row) {
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT OR IGNORE INTO ledger_sync_identity_v8
         (namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
         VALUES (?,'ledger-' || lower(hex(randomblob(16))),1,2,2,?,?)`,
        value, now, now,
      );
      row = await db.getFirstAsync(
        `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at
           FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
        value,
      );
    }
    if (!row?.ledger_id) throw new Error('ledger_sync_identity_creation_failed');
    return {
      namespace: String(row.namespace),
      ledgerId: String(row.ledger_id),
      restoreEpoch: Math.max(1, Number(row.restore_epoch || 1)),
      protocolVersion: Math.max(2, Number(row.protocol_version || 2)),
      minimumSupportedVersion: Math.max(1, Number(row.minimum_supported_version || 2)),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    };
  });
};

export const readLedgerSyncIdentityV8 = async ({ namespace = 'guest', database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  const row = await db.getFirstAsync(
    `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at
       FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
    String(namespace || 'guest'),
  );
  return row ? {
    namespace: String(row.namespace),
    ledgerId: String(row.ledger_id),
    restoreEpoch: Math.max(1, Number(row.restore_epoch || 1)),
    protocolVersion: Math.max(2, Number(row.protocol_version || 2)),
    minimumSupportedVersion: Math.max(1, Number(row.minimum_supported_version || 2)),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  } : null;
};

const cleanV2AdoptionMetaKey = namespace => `clean_v2_adoption:${String(namespace || 'guest')}`;

export const adoptUnbootstrappedCloudLedgerIdentityV8 = async ({
  namespace = 'guest',
  cloudLedgerId,
  cloudRestoreEpoch = 1,
  database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);

  const targetNamespace = String(namespace || '').trim();
  const targetLedgerId = String(cloudLedgerId || '').trim();
  const targetEpoch = Number(cloudRestoreEpoch);
  if (!targetNamespace) {
    return { supported: true, ok: false, reason: 'financial_v2_adoption_namespace_required' };
  }
  if (!targetLedgerId || !Number.isSafeInteger(targetEpoch) || targetEpoch <= 0) {
    return { supported: true, ok: false, reason: 'financial_v2_adoption_target_invalid' };
  }

  return enqueueWrite(async () => runLedgerExclusiveTransaction(db, async (txn) => {
    const identity = await txn.getFirstAsync(
      `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at
         FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
      targetNamespace,
    );
    if (!identity?.ledger_id) {
      return { supported: true, ok: false, reason: 'financial_v2_adoption_local_identity_missing' };
    }

    const currentLedgerId = String(identity.ledger_id);
    const currentEpoch = Math.max(1, Number(identity.restore_epoch || 1));
    if (currentLedgerId === targetLedgerId) {
      if (currentEpoch !== targetEpoch) {
        return {
          supported: true,
          ok: false,
          reason: 'financial_v2_adoption_restore_epoch_mismatch',
          localRestoreEpoch: currentEpoch,
          cloudRestoreEpoch: targetEpoch,
        };
      }
      return {
        supported: true,
        ok: true,
        idempotent: true,
        namespace: targetNamespace,
        fromLedgerId: currentLedgerId,
        ledgerId: targetLedgerId,
        restoreEpoch: targetEpoch,
        droppedShadowRows: 0,
        droppedLegacyRows: 0,
      };
    }

    if (currentEpoch !== targetEpoch) {
      return {
        supported: true,
        ok: false,
        reason: 'financial_v2_adoption_restore_epoch_mismatch',
        localRestoreEpoch: currentEpoch,
        cloudRestoreEpoch: targetEpoch,
      };
    }

    const reservedLocal = await txn.getFirstAsync(
      `SELECT namespace,ledger_id,restore_epoch
         FROM ledger_sync_identity_v8 WHERE ledger_id=? LIMIT 1`,
      targetLedgerId,
    );
    if (reservedLocal?.ledger_id) {
      return {
        supported: true,
        ok: false,
        reason: 'financial_v2_adoption_target_already_local',
        targetNamespace: String(reservedLocal.namespace || ''),
      };
    }

    const count = async (sql, ...params) => {
      const row = await txn.getFirstAsync(sql, ...params);
      return Math.max(0, Number(row?.n || 0));
    };

    // P19 FINAL R5: onboarding creates inert setup rows before the first login:
    // one zero-balance wallet/account, categories and workspace metadata. Those
    // rows are safe to bootstrap under the reserved cloud V2 identity. Any
    // actual financial history or tracker entity still blocks identity adoption.
    const accountRows = await txn.getAllAsync(
      `SELECT id,archived_at FROM ledger_accounts_v7 WHERE namespace=? ORDER BY id`,
      targetNamespace,
    );
    const walletRows = await txn.getAllAsync(
      `SELECT id,payload_json,deleted_at
         FROM ledger_entities_v7
        WHERE namespace=? AND entity_type='wallet'
        ORDER BY id`,
      targetNamespace,
    );
    const walletIds = new Set(walletRows.map(row => String(row.id || '')));
    const walletStateSafe = walletRows.length <= 1 && walletRows.every(row => {
      const payload = parseJson(row.payload_json, {}) || {};
      return !row.deleted_at
        && Number(payload.openingBalance || 0) === 0
        && Number(payload.openingBaseBalance || 0) === 0;
    });
    const accountStateSafe = accountRows.length <= 1
      && accountRows.length <= walletRows.length
      && accountRows.every(row => walletIds.has(String(row.id || '')) && !row.archived_at);

    const financialCounts = {
      exchangeRates: await count(`SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=?`, targetNamespace),
      transactions: await count(`SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?`, targetNamespace),
      postings: await count(`SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=?`, targetNamespace),
      links: await count(`SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 WHERE namespace=?`, targetNamespace),
      unsafeEntities: await count(
        `SELECT COUNT(*) AS n FROM ledger_entities_v7
          WHERE namespace=?
            AND NOT (
              (entity_type='workspace' AND id='workspace')
              OR entity_type='wallet'
              OR entity_type='category'
            )`,
        targetNamespace,
      ),
    };
    if (Object.values(financialCounts).some(value => value > 0)) {
      return {
        supported: true,
        ok: false,
        reason: 'financial_v2_adoption_local_financial_state_present',
        financialCounts,
      };
    }
    if (!walletStateSafe || !accountStateSafe) {
      return {
        supported: true,
        ok: false,
        reason: 'financial_v2_adoption_setup_shell_not_safe',
        setupShell: {
          accounts: accountRows.length,
          wallets: walletRows.length,
          walletStateSafe,
          accountStateSafe,
        },
      };
    }

    const totalShadow = await count(
      `SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?`,
      currentLedgerId,
    );
    const allowedShadow = await count(
      `SELECT COUNT(*) AS n
         FROM ledger_outbox_v3
        WHERE namespace=? AND ledger_id=? AND restore_epoch=?
          AND acknowledged_at IS NULL
          AND superseded_by_bootstrap_id IS NULL
          AND operation='upsert'
          AND (
            (entity_type='workspace' AND entity_id='workspace')
            OR entity_type IN ('wallet','category')
          )`,
      targetNamespace, currentLedgerId, currentEpoch,
    );
    const totalLegacy = await count(
      `SELECT COUNT(*) AS n FROM ledger_outbox_v2 WHERE namespace=?`,
      targetNamespace,
    );
    const allowedLegacy = await count(
      `SELECT COUNT(*) AS n FROM ledger_outbox_v2
        WHERE namespace=?
          AND acknowledged_at IS NULL
          AND operation='upsert'
          AND (
            (entity_type='workspace' AND entity_id='workspace')
            OR entity_type IN ('wallet','category')
          )`,
      targetNamespace,
    );
    const legacySync = await txn.getFirstAsync(
      `SELECT last_server_sequence FROM ledger_sync_state_v7 WHERE namespace=? LIMIT 1`,
      targetNamespace,
    );

    const blockedTransport = {
      shadowUnexpected: totalShadow - allowedShadow,
      legacyUnexpected: totalLegacy - allowedLegacy,
      legacyInbox: await count(`SELECT COUNT(*) AS n FROM ledger_inbox_v2 WHERE namespace=?`, targetNamespace),
      legacySyncCursor: Math.max(0, Number(legacySync?.last_server_sequence || 0)),
      inbox: await count(`SELECT COUNT(*) AS n FROM ledger_inbox_v3 WHERE ledger_id=?`, currentLedgerId),
      bootstrap: await count(`SELECT COUNT(*) AS n FROM ledger_bootstrap_state_v8 WHERE ledger_id=?`, currentLedgerId),
      bootstrapImport: await count(`SELECT COUNT(*) AS n FROM ledger_bootstrap_import_state_v8 WHERE ledger_id=?`, currentLedgerId),
      syncState: await count(`SELECT COUNT(*) AS n FROM ledger_sync_state_v8 WHERE ledger_id=?`, currentLedgerId),
    };
    if (Object.values(blockedTransport).some(value => value > 0)) {
      return {
        supported: true,
        ok: false,
        reason: 'financial_v2_adoption_transport_state_not_clean',
        blockedTransport,
      };
    }

    const now = new Date().toISOString();
    const markerKey = cleanV2AdoptionMetaKey(targetNamespace);
    const intent = {
      version: 2,
      namespace: targetNamespace,
      fromLedgerId: currentLedgerId,
      toLedgerId: targetLedgerId,
      restoreEpoch: targetEpoch,
      status: 'adopting',
      setupShell: {
        accounts: accountRows.length,
        wallets: walletRows.length,
      },
      createdAt: now,
      updatedAt: now,
    };
    await txn.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
      markerKey, safeJson(intent), now,
    );

    // Setup-shell transport rows are disposable because the verified V2
    // bootstrap immediately captures the canonical current SQLite projection.
    const removedShadow = await txn.runAsync(
      `DELETE FROM ledger_outbox_v3 WHERE ledger_id=?`,
      currentLedgerId,
    );
    const removedLegacy = await txn.runAsync(
      `DELETE FROM ledger_outbox_v2
        WHERE namespace=? AND acknowledged_at IS NULL`,
      targetNamespace,
    );

    const updated = await txn.runAsync(
      `UPDATE ledger_sync_identity_v8
          SET ledger_id=?,restore_epoch=?,protocol_version=2,minimum_supported_version=2,updated_at=?
        WHERE namespace=? AND ledger_id=? AND restore_epoch=?`,
      targetLedgerId, targetEpoch, now, targetNamespace, currentLedgerId, currentEpoch,
    );
    if (Number(updated?.changes || 0) !== 1) {
      throw new Error('financial_v2_adoption_identity_compare_and_swap_failed');
    }

    const fkRows = await txn.getAllAsync('PRAGMA foreign_key_check');
    if (Array.isArray(fkRows) && fkRows.length > 0) {
      throw new Error('financial_v2_adoption_foreign_key_check_failed');
    }

    const completedAt = new Date().toISOString();
    const completed = {
      ...intent,
      status: 'adopted_pending_bootstrap',
      updatedAt: completedAt,
      adoptedAt: completedAt,
      droppedShadowRows: Number(removedShadow?.changes || 0),
      droppedLegacyRows: Number(removedLegacy?.changes || 0),
    };
    await txn.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
      markerKey, safeJson(completed), completedAt,
    );

    return {
      supported: true,
      ok: true,
      idempotent: false,
      namespace: targetNamespace,
      fromLedgerId: currentLedgerId,
      ledgerId: targetLedgerId,
      restoreEpoch: targetEpoch,
      droppedShadowRows: Number(removedShadow?.changes || 0),
      droppedLegacyRows: Number(removedLegacy?.changes || 0),
      setupShell: completed.setupShell,
      foreignKeyCheck: 'ok',
    };
  }));
};

const restoreIntentMetaKey = namespace => `restore_intent:${String(namespace || 'guest')}`;

// P20-G01-D2 — activation evidence is bound to (namespace, ledger_id, restore_epoch)
// per MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM "Activation evidence". The legacy
// namespace-only key is still read so ledgers activated before this change stay
// active without a migration, but only when its payload matches the current
// ledger identity and epoch.
const legacyActivationEvidenceKey = namespace => `sync_v2_activation_evidence:${String(namespace || 'guest')}`;
const activationEvidenceKey = (namespace, ledgerId, restoreEpoch) => (
  `sync_v2_activation_evidence:${String(namespace || 'guest')}:${String(ledgerId || '')}:${Number(restoreEpoch || 0)}`
);
// Written when a restore epoch supersedes an epoch that held durable activation.
// The addendum forbids automatic fallback to V1 after durable activated_at, so the
// superseding epoch must stay distinguishable from a ledger that simply never
// activated: it is fail-closed and requires bootstrap+activation for the new epoch.
const epochActivationPendingKey = namespace => `sync_v2_epoch_activation_pending:${String(namespace || 'guest')}`;

export const readLedgerRestoreIntentV8 = async ({ namespace = 'guest', database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  const row = await db.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
    restoreIntentMetaKey(namespace),
  );
  return parseJson(row?.value, null);
};

export const beginLedgerRestoreEpochV8 = async ({
  namespace = 'guest', operation = 'controlled_recovery', database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  const target = String(namespace || '').trim();
  if (!target) throw new Error('restore_epoch_namespace_required');
  if (!['backup_restore','delete_local_data','controlled_recovery'].includes(operation)) {
    throw new Error('restore_epoch_operation_invalid');
  }

  return enqueueWrite(async () => runLedgerExclusiveTransaction(db, async (txn) => {
    const identity = await ensureShadowLedgerSyncIdentityV8(txn, target);
    const key = restoreIntentMetaKey(target);
    const existingRow = await txn.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
      key,
    );
    const existing = parseJson(existingRow?.value, null);
    if (existing) {
      const valid = String(existing.ledgerId || '') === identity.ledgerId
        && Number(existing.fromEpoch || 0) === identity.restoreEpoch
        && Number(existing.toEpoch || 0) === identity.restoreEpoch + 1
        && String(existing.operation || '') === operation;
      if (!valid) throw new Error('restore_epoch_intent_conflict');
      return existing;
    }

    const now = new Date().toISOString();
    const intent = {
      version: 1,
      namespace: target,
      ledgerId: identity.ledgerId,
      fromEpoch: identity.restoreEpoch,
      toEpoch: identity.restoreEpoch + 1,
      operation,
      status: 'pending_server_advance',
      createdAt: now,
      updatedAt: now,
    };
    await txn.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
      key, safeJson(intent), now,
    );
    return intent;
  }));
};

export const commitLedgerRestoreEpochV8 = async ({
  namespace = 'guest', expectedFromEpoch, toEpoch, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  const target = String(namespace || '').trim();
  const key = restoreIntentMetaKey(target);

  return enqueueWrite(async () => runLedgerExclusiveTransaction(db, async (txn) => {
    const intentRow = await txn.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
      key,
    );
    const intent = parseJson(intentRow?.value, null);
    if (!intent) throw new Error('restore_epoch_commit_without_intent');

    const identity = await txn.getFirstAsync(
      `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version
         FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
      target,
    );
    if (!identity?.ledger_id) throw new Error('restore_epoch_identity_missing');

    // Read the outgoing epoch's activation marker before the CAS so the new epoch
    // can record whether it supersedes a durably activated V2 epoch.
    const supersededState = await txn.getFirstAsync(
      `SELECT activated_at FROM ledger_sync_state_v8
        WHERE ledger_id=? AND restore_epoch=? LIMIT 1`,
      String(identity.ledger_id), Number(identity.restore_epoch),
    );

    const from = Number(expectedFromEpoch ?? intent.fromEpoch);
    const next = Number(toEpoch ?? intent.toEpoch);
    if (String(intent.ledgerId) !== String(identity.ledger_id)
        || Number(identity.restore_epoch) !== from
        || Number(intent.fromEpoch) !== from
        || Number(intent.toEpoch) !== next
        || next !== from + 1) {
      throw new Error('restore_epoch_commit_conflict');
    }

    const now = new Date().toISOString();
    const updated = await txn.runAsync(
      `UPDATE ledger_sync_identity_v8
          SET restore_epoch=?,updated_at=?
        WHERE namespace=? AND ledger_id=? AND restore_epoch=?`,
      next, now, target, String(identity.ledger_id), from,
    );
    if (Number(updated?.changes || 0) !== 1) {
      throw new Error('restore_epoch_local_compare_and_swap_failed');
    }

    // Start the new epoch with an empty cursor. Old outbox/inbox rows stay as
    // immutable evidence under the superseded epoch and are never selected as
    // current-epoch transport.
    await txn.runAsync(
      `INSERT OR IGNORE INTO ledger_sync_state_v8
       (ledger_id,restore_epoch,last_server_sequence,last_success_at,last_device_id,updated_at)
       VALUES (?,?,0,NULL,NULL,?)`,
      String(identity.ledger_id), next, now,
    );
    await txn.runAsync(`DELETE FROM ledger_v7_meta WHERE key=?`, key);

    // The new epoch starts unactivated by contract: it must complete its own
    // bootstrap + activation. Superseded evidence stays in place as immutable
    // history and is never carried forward.
    await txn.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
      epochActivationPendingKey(target),
      safeJson({
        version: 1,
        namespace: target,
        ledgerId: String(identity.ledger_id),
        fromEpoch: from,
        toEpoch: next,
        supersededActivatedAt: supersededState?.activated_at ? String(supersededState.activated_at) : null,
        previouslyActivated: !!supersededState?.activated_at,
        recordedAt: now,
      }),
      now,
    );
    return {
      namespace: target,
      ledgerId: String(identity.ledger_id),
      fromEpoch: from,
      restoreEpoch: next,
      protocolVersion: Math.max(2, Number(identity.protocol_version || 2)),
    };
  }));
};

export const abortLedgerRestoreEpochV8 = async ({ namespace = 'guest', database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return false;
  await ensureFinancialLedgerV7(db);
  await enqueueWrite(() => db.runAsync(
    `DELETE FROM ledger_v7_meta WHERE key=?`,
    restoreIntentMetaKey(namespace),
  ));
  return true;
};


export const readFinancialBootstrapStateV8 = async ({
  namespace = 'guest', ledgerId = null, restoreEpoch = null, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database: db });
  const targetLedgerId = String(ledgerId || identity.ledgerId);
  const targetEpoch = Math.max(1, Number(restoreEpoch || identity.restoreEpoch));
  return db.getFirstAsync(
    `SELECT * FROM ledger_bootstrap_state_v8
      WHERE namespace=? AND ledger_id=? AND restore_epoch=?
      ORDER BY created_at DESC LIMIT 1`,
    identity.namespace, targetLedgerId, targetEpoch,
  );
};

export const createFinancialBootstrapStageV8 = async ({
  namespace = 'guest', database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) throw new Error('sqlite_unavailable');
  await ensureFinancialLedgerV7(db);
  const target = String(namespace || '').trim();
  if (!target) throw new Error('financial_v2_bootstrap_namespace_required');

  return enqueueWrite(async () => runLedgerExclusiveTransaction(db, async (txn) => {
    const identity = await ensureShadowLedgerSyncIdentityV8(txn, target);
    const restoreIntent = await txn.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
      restoreIntentMetaKey(target),
    );
    if (restoreIntent?.value) throw new Error('financial_v2_bootstrap_restore_intent_active');

    const existing = await txn.getFirstAsync(
      `SELECT * FROM ledger_bootstrap_state_v8
        WHERE namespace=? AND ledger_id=? AND restore_epoch=?
        ORDER BY created_at DESC LIMIT 1`,
      identity.namespace, identity.ledgerId, identity.restoreEpoch,
    );
    if (existing?.bootstrap_id) return existing;

    const idRow = await txn.getFirstAsync(
      `SELECT 'bootstrap-' || lower(hex(randomblob(16))) AS bootstrap_id`,
    );
    const bootstrapId = String(idRow?.bootstrap_id || '').trim();
    if (!bootstrapId) throw new Error('financial_v2_bootstrap_id_generation_failed');
    const stageNamespace = `bootstrap-stage:${identity.ledgerId}:${identity.restoreEpoch}:${bootstrapId}`;

    const checkpointRow = await txn.getFirstAsync(
      `SELECT COALESCE(MAX(sequence_id),0) AS n
         FROM ledger_outbox_v3
        WHERE ledger_id=? AND restore_epoch=? AND superseded_by_bootstrap_id IS NULL`,
      identity.ledgerId, identity.restoreEpoch,
    );
    const checkpoint = Math.max(0, Number(checkpointRow?.n || 0));

    await txn.runAsync(
      `INSERT INTO ledger_accounts_v7
       (namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
       SELECT ?,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at
         FROM ledger_accounts_v7 WHERE namespace=?`,
      stageNamespace, identity.namespace,
    );
    await txn.runAsync(
      `INSERT INTO ledger_exchange_rates_v7
       (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
       SELECT ?,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at
         FROM ledger_exchange_rates_v7 WHERE namespace=?`,
      stageNamespace, identity.namespace,
    );
    await txn.runAsync(
      `INSERT INTO ledger_financial_transactions_v7
       (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
        idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
       SELECT ?,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
              idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at
         FROM ledger_financial_transactions_v7 WHERE namespace=?`,
      stageNamespace, identity.namespace,
    );
    await txn.runAsync(
      `INSERT INTO ledger_postings_v7
       (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
       SELECT ?,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at
         FROM ledger_postings_v7 WHERE namespace=?`,
      stageNamespace, identity.namespace,
    );
    await txn.runAsync(
      `INSERT INTO ledger_transaction_links_v7
       (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
       SELECT ?,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at
         FROM ledger_transaction_links_v7 WHERE namespace=?`,
      stageNamespace, identity.namespace,
    );
    await txn.runAsync(
      `INSERT INTO ledger_entities_v7
       (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
       SELECT ?,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at
         FROM ledger_entities_v7 WHERE namespace=?`,
      stageNamespace, identity.namespace,
    );
    await txn.runAsync(
      `INSERT INTO ledger_workspace_state_v7
       (namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,
        last_reconciled_at,payload_json,updated_at)
       SELECT ?,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,
              last_reconciled_at,payload_json,updated_at
         FROM ledger_workspace_state_v7 WHERE namespace=?`,
      stageNamespace, identity.namespace,
    );

    const now = new Date().toISOString();
    await txn.runAsync(
      `INSERT INTO ledger_bootstrap_state_v8
       (namespace,ledger_id,restore_epoch,bootstrap_id,stage_namespace,checkpoint_outbox_sequence,
        status,expected_row_count,manifest_hash,created_at,finalized_at,last_error)
       VALUES (?,?,?,?,?,?,'staged',NULL,NULL,?,NULL,NULL)`,
      identity.namespace, identity.ledgerId, identity.restoreEpoch,
      bootstrapId, stageNamespace, checkpoint, now,
    );

    return txn.getFirstAsync(
      `SELECT * FROM ledger_bootstrap_state_v8
        WHERE ledger_id=? AND restore_epoch=? AND bootstrap_id=? LIMIT 1`,
      identity.ledgerId, identity.restoreEpoch, bootstrapId,
    );
  }));
};

export const readFinancialBootstrapStageRowsV8 = async ({
  stageNamespace, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) throw new Error('sqlite_unavailable');
  await ensureFinancialLedgerV7(db);
  const stage = String(stageNamespace || '').trim();
  if (!stage.startsWith('bootstrap-stage:')) throw new Error('financial_v2_bootstrap_stage_namespace_invalid');

  const currencies = await db.getAllAsync(
    `SELECT code,minor_exponent,enabled FROM ledger_currencies ORDER BY code`,
  );
  const accounts = await db.getAllAsync(
    `SELECT * FROM ledger_accounts_v7 WHERE namespace=? ORDER BY id`, stage,
  );
  const exchangeRates = await db.getAllAsync(
    `SELECT * FROM ledger_exchange_rates_v7 WHERE namespace=? ORDER BY id`, stage,
  );
  const transactions = await db.getAllAsync(
    `SELECT * FROM ledger_financial_transactions_v7 WHERE namespace=? ORDER BY id`, stage,
  );
  const postings = await db.getAllAsync(
    `SELECT * FROM ledger_postings_v7 WHERE namespace=? ORDER BY id`, stage,
  );
  const links = await db.getAllAsync(
    `SELECT * FROM ledger_transaction_links_v7 WHERE namespace=? ORDER BY id`, stage,
  );
  const entities = await db.getAllAsync(
    `SELECT * FROM ledger_entities_v7 WHERE namespace=? ORDER BY entity_type,id`, stage,
  );
  const workspaceState = await db.getFirstAsync(
    `SELECT * FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1`, stage,
  );
  return { currencies, accounts, exchangeRates, transactions, postings, links, entities, workspaceState };
};

export const setFinancialBootstrapStageManifestV8 = async ({
  ledgerId, restoreEpoch, bootstrapId, manifestHash, expectedRowCount, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) throw new Error('sqlite_unavailable');
  await ensureFinancialLedgerV7(db);
  const hash = String(manifestHash || '').toLowerCase();
  const count = Number(expectedRowCount);
  if (!/^[0-9a-f]{64}$/.test(hash) || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('financial_v2_bootstrap_manifest_invalid');
  }
  await enqueueWrite(() => db.runAsync(
    `UPDATE ledger_bootstrap_state_v8
        SET expected_row_count=?,manifest_hash=?,status='staged',last_error=NULL
      WHERE ledger_id=? AND restore_epoch=? AND bootstrap_id=?
        AND status IN ('staged','uploading','failed')`,
    count, hash, String(ledgerId), Number(restoreEpoch), String(bootstrapId),
  ));
  const row = await db.getFirstAsync(
    `SELECT * FROM ledger_bootstrap_state_v8
      WHERE ledger_id=? AND restore_epoch=? AND bootstrap_id=? LIMIT 1`,
    String(ledgerId), Number(restoreEpoch), String(bootstrapId),
  );
  if (!row?.bootstrap_id) throw new Error('financial_v2_bootstrap_state_missing');
  return row;
};

export const markFinancialBootstrapUploadingV8 = async ({
  ledgerId, restoreEpoch, bootstrapId, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return false;
  await ensureFinancialLedgerV7(db);
  await enqueueWrite(() => db.runAsync(
    `UPDATE ledger_bootstrap_state_v8 SET status='uploading',last_error=NULL
      WHERE ledger_id=? AND restore_epoch=? AND bootstrap_id=?
        AND status IN ('staged','uploading','failed')`,
    String(ledgerId), Number(restoreEpoch), String(bootstrapId),
  ));
  return true;
};

export const failFinancialBootstrapStageV8 = async ({
  ledgerId, restoreEpoch, bootstrapId, error, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return false;
  await ensureFinancialLedgerV7(db);
  await enqueueWrite(() => db.runAsync(
    `UPDATE ledger_bootstrap_state_v8 SET status='failed',last_error=?
      WHERE ledger_id=? AND restore_epoch=? AND bootstrap_id=? AND status<>'finalized'`,
    String(error || 'financial_v2_bootstrap_failed').slice(0,500),
    String(ledgerId), Number(restoreEpoch), String(bootstrapId),
  ));
  return true;
};

export const finalizeFinancialBootstrapStageV8 = async ({
  ledgerId, restoreEpoch, bootstrapId, manifestHash, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) throw new Error('sqlite_unavailable');
  await ensureFinancialLedgerV7(db);
  const hash = String(manifestHash || '').toLowerCase();

  return enqueueWrite(async () => runLedgerExclusiveTransaction(db, async (txn) => {
    const state = await txn.getFirstAsync(
      `SELECT * FROM ledger_bootstrap_state_v8
        WHERE ledger_id=? AND restore_epoch=? AND bootstrap_id=? LIMIT 1`,
      String(ledgerId), Number(restoreEpoch), String(bootstrapId),
    );
    if (!state?.bootstrap_id) throw new Error('financial_v2_bootstrap_state_missing');
    if (String(state.manifest_hash || '').toLowerCase() !== hash) {
      throw new Error('financial_v2_bootstrap_finalize_manifest_mismatch');
    }
    if (state.status === 'finalized') return state;

    const now = new Date().toISOString();
    await txn.runAsync(
      `UPDATE ledger_outbox_v3
          SET superseded_by_bootstrap_id=?,superseded_at=?,last_error=NULL
        WHERE ledger_id=? AND restore_epoch=?
          AND sequence_id<=? AND superseded_by_bootstrap_id IS NULL`,
      String(bootstrapId), now, String(ledgerId), Number(restoreEpoch),
      Math.max(0, Number(state.checkpoint_outbox_sequence || 0)),
    );
    await clearFinancialNamespaceRows(txn, String(state.stage_namespace));
    await txn.runAsync(
      `UPDATE ledger_bootstrap_state_v8
          SET status='finalized',finalized_at=?,last_error=NULL
        WHERE ledger_id=? AND restore_epoch=? AND bootstrap_id=?`,
      now, String(ledgerId), Number(restoreEpoch), String(bootstrapId),
    );
    return txn.getFirstAsync(
      `SELECT * FROM ledger_bootstrap_state_v8
        WHERE ledger_id=? AND restore_epoch=? AND bootstrap_id=? LIMIT 1`,
      String(ledgerId), Number(restoreEpoch), String(bootstrapId),
    );
  }));
};



export const inspectFinancialEmptyShellV8 = async ({
  namespace = 'guest',
  database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) {
    return { supported: false, empty: false, reason: 'sqlite_unavailable' };
  }
  await ensureFinancialLedgerV7(db);
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database: db });
  const target = identity.namespace;
  const count = async (sql, ...params) => {
    const row = await db.getFirstAsync(sql, ...params);
    return Math.max(0, Number(row?.n || 0));
  };

  const [
    accountRows,
    walletRows,
    transactions,
    exchangeRates,
    postings,
    links,
    unsafeEntities,
    totalLegacyOutbox,
    allowedLegacyOutbox,
    totalShadowOutbox,
    allowedShadowOutbox,
    legacyInbox,
    legacySync,
    bootstrapStates,
    importStates,
    activation,
    restoreIntent,
  ] = await Promise.all([
    db.getAllAsync(
      `SELECT id,archived_at FROM ledger_accounts_v7 WHERE namespace=? ORDER BY id`,
      target,
    ),
    db.getAllAsync(
      `SELECT id,payload_json,deleted_at
         FROM ledger_entities_v7
        WHERE namespace=? AND entity_type='wallet'
        ORDER BY id`,
      target,
    ),
    count(`SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=?`, target),
    count(`SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=?`, target),
    count(`SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=?`, target),
    count(`SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 WHERE namespace=?`, target),
    count(
      `SELECT COUNT(*) AS n FROM ledger_entities_v7
        WHERE namespace=?
          AND NOT (
            (entity_type='workspace' AND id='workspace')
            OR entity_type='wallet'
            OR entity_type='category'
          )`,
      target,
    ),
    count(`SELECT COUNT(*) AS n FROM ledger_outbox_v2 WHERE namespace=?`, target),
    count(
      `SELECT COUNT(*) AS n FROM ledger_outbox_v2
        WHERE namespace=?
          AND acknowledged_at IS NULL
          AND operation='upsert'
          AND (
            (entity_type='workspace' AND entity_id='workspace')
            OR entity_type IN ('wallet','category')
          )`,
      target,
    ),
    count(`SELECT COUNT(*) AS n FROM ledger_outbox_v3 WHERE ledger_id=?`, identity.ledgerId),
    count(
      `SELECT COUNT(*) AS n FROM ledger_outbox_v3
        WHERE namespace=? AND ledger_id=? AND restore_epoch=?
          AND acknowledged_at IS NULL
          AND superseded_by_bootstrap_id IS NULL
          AND operation='upsert'
          AND (
            (entity_type='workspace' AND entity_id='workspace')
            OR entity_type IN ('wallet','category')
          )`,
      target, identity.ledgerId, identity.restoreEpoch,
    ),
    count(`SELECT COUNT(*) AS n FROM ledger_inbox_v2 WHERE namespace=?`, target),
    db.getFirstAsync(
      `SELECT last_server_sequence FROM ledger_sync_state_v7 WHERE namespace=? LIMIT 1`,
      target,
    ),
    count(
      `SELECT COUNT(*) AS n FROM ledger_bootstrap_state_v8
        WHERE ledger_id=? AND restore_epoch=?`,
      identity.ledgerId, identity.restoreEpoch,
    ),
    count(
      `SELECT COUNT(*) AS n FROM ledger_bootstrap_import_state_v8
        WHERE ledger_id=? AND restore_epoch=?`,
      identity.ledgerId, identity.restoreEpoch,
    ),
    db.getFirstAsync(
      `SELECT activated_at FROM ledger_sync_state_v8
        WHERE ledger_id=? AND restore_epoch=? LIMIT 1`,
      identity.ledgerId, identity.restoreEpoch,
    ),
    db.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
      restoreIntentMetaKey(target),
    ),
  ]);

  const walletIds = new Set(walletRows.map(row => String(row.id || '')));
  const walletStateSafe = walletRows.length <= 1 && walletRows.every(row => {
    const payload = parseJson(row.payload_json, {}) || {};
    return !row.deleted_at
      && Number(payload.openingBalance || 0) === 0
      && Number(payload.openingBaseBalance || 0) === 0;
  });
  const accountStateSafe = accountRows.length <= 1
    && accountRows.length <= walletRows.length
    && accountRows.every(row => walletIds.has(String(row.id || '')) && !row.archived_at);

  const nonWorkspaceV1Outbox = Math.max(0, totalLegacyOutbox - allowedLegacyOutbox);
  const nonWorkspaceV2Outbox = Math.max(0, totalShadowOutbox - allowedShadowOutbox);
  const counts = {
    accounts: accountRows.length,
    wallets: walletRows.length,
    transactions,
    exchangeRates,
    postings,
    links,
    unsafeEntities,
    nonWorkspaceV1Outbox,
    legacyUnexpectedOutbox: nonWorkspaceV1Outbox,
    nonWorkspaceV2Outbox,
    shadowUnexpectedOutbox: nonWorkspaceV2Outbox,
    legacyInbox,
    legacySyncCursor: Math.max(0, Number(legacySync?.last_server_sequence || 0)),
    bootstrapStates,
    importStates,
  };
  const empty = transactions === 0
    && exchangeRates === 0
    && postings === 0
    && links === 0
    && unsafeEntities === 0
    && walletStateSafe
    && accountStateSafe
    && counts.legacyUnexpectedOutbox === 0
    && counts.shadowUnexpectedOutbox === 0
    && legacyInbox === 0
    && counts.legacySyncCursor === 0
    && bootstrapStates === 0
    && importStates === 0
    && !activation?.activated_at
    && !restoreIntent?.value;

  return {
    supported: true,
    empty,
    setupOnly: empty && (
      accountRows.length > 0
      || walletRows.length > 0
      || totalLegacyOutbox > 0
      || totalShadowOutbox > 0
    ),
    namespace: target,
    ledgerId: identity.ledgerId,
    restoreEpoch: identity.restoreEpoch,
    activatedAt: activation?.activated_at || null,
    restoreIntentActive: !!restoreIntent?.value,
    walletStateSafe,
    accountStateSafe,
    counts,
  };
};

export const recordFinancialCloudRecoveryV8 = async ({
  namespace = 'guest',
  mode,
  sourceHash = null,
  cloudRevision = 0,
  cloudUpdatedAt = null,
  verifiedAt = null,
  database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return false;
  await ensureFinancialLedgerV7(db);
  const target = String(namespace || '').trim();
  if (!target) throw new Error('financial_cloud_recovery_namespace_required');
  const payload = {
    version: 1,
    namespace: target,
    mode: String(mode || ''),
    sourceHash: sourceHash ? String(sourceHash).toLowerCase() : null,
    cloudRevision: Math.max(0, Number(cloudRevision || 0)),
    cloudUpdatedAt: cloudUpdatedAt || null,
    verifiedAt: verifiedAt || null,
    restoredAt: new Date().toISOString(),
  };
  if (payload.sourceHash && !/^[0-9a-f]{64}$/.test(payload.sourceHash)) {
    throw new Error('financial_cloud_recovery_hash_invalid');
  }
  await enqueueWrite(() => db.runAsync(
    `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
    `cloud_recovery_v2:${target}`,
    safeJson(payload),
    payload.restoredAt,
  ));
  return payload;
};

export const readFinancialSyncProtocolV8 = async ({
  namespace = 'guest', database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return {
    supported: false, activeProtocolVersion: 1, activatedAt: null,
  };
  await ensureFinancialLedgerV7(db);
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database: db });
  const row = await db.getFirstAsync(
    `SELECT activated_at,last_success_at,last_shadow_success_at,
            shadow_last_server_sequence,last_server_sequence
       FROM ledger_sync_state_v8
      WHERE ledger_id=? AND restore_epoch=? LIMIT 1`,
    identity.ledgerId, identity.restoreEpoch,
  );
  const epochEvidenceRow = await db.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
    activationEvidenceKey(identity.namespace, identity.ledgerId, identity.restoreEpoch),
  );
  let activationEvidence = parseJson(epochEvidenceRow?.value, null);
  if (!activationEvidence) {
    // Legacy namespace-only evidence is accepted only when it belongs to this
    // exact ledger and epoch, so it can never survive an epoch advance.
    const legacyRow = await db.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
      legacyActivationEvidenceKey(identity.namespace),
    );
    const legacyEvidence = parseJson(legacyRow?.value, null);
    if (legacyEvidence
        && String(legacyEvidence.ledgerId || '') === identity.ledgerId
        && Number(legacyEvidence.restoreEpoch || 0) === identity.restoreEpoch) {
      activationEvidence = legacyEvidence;
    }
  }
  const pendingRow = await db.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
    epochActivationPendingKey(identity.namespace),
  );
  const pendingRaw = parseJson(pendingRow?.value, null);
  const epochActivationPending = (
    pendingRaw
    && String(pendingRaw.ledgerId || '') === identity.ledgerId
    && Number(pendingRaw.toEpoch || 0) === identity.restoreEpoch
    && pendingRaw.previouslyActivated === true
  ) ? pendingRaw : null;
  const evidenceMatchesIdentity = !!(
    activationEvidence
    && String(activationEvidence.ledgerId || '') === identity.ledgerId
    && Number(activationEvidence.restoreEpoch || 0) === identity.restoreEpoch
    && String(activationEvidence.bootstrapId || '')
    && /^[0-9a-f]{64}$/.test(String(activationEvidence.manifestHash || '').toLowerCase())
    && Number.isFinite(Date.parse(String(activationEvidence.readbackVerifiedAt || '')))
    && Number.isFinite(Date.parse(String(activationEvidence.shadowValidatedAt || '')))
  );
  return {
    supported: true,
    namespace: identity.namespace,
    ledgerId: identity.ledgerId,
    restoreEpoch: identity.restoreEpoch,
    activeProtocolVersion: row?.activated_at ? 2 : 1,
    activatedAt: row?.activated_at || null,
    lastSuccessAt: row?.last_success_at || null,
    lastShadowSuccessAt: row?.last_shadow_success_at || null,
    shadowLastServerSequence: Math.max(0, Number(row?.shadow_last_server_sequence || 0)),
    lastServerSequence: Math.max(0, Number(row?.last_server_sequence || 0)),
    // A superseding epoch is a protocol recovery event, not an ordinary V1 ledger.
    requiresV2Recovery: !row?.activated_at && (
      !!epochActivationPending || Math.max(0, Number(row?.last_server_sequence || 0)) > 0
    ),
    epochActivationPending,
    // Explicit state so callers never have to infer intent from a bare
    // activeProtocolVersion of 1.
    activationState: (
      row?.activated_at
        ? (evidenceMatchesIdentity ? 'ACTIVE' : 'ACTIVATION_EVIDENCE_MISSING')
        : (epochActivationPending ? 'EPOCH_ACTIVATION_REQUIRED' : 'NOT_YET_ACTIVATED')
    ),
    activationEvidence,
    activationEvidenceValid: !!(
      !row?.activated_at
      || (
        activationEvidence
        && String(activationEvidence.ledgerId || '') === identity.ledgerId
        && Number(activationEvidence.restoreEpoch || 0) === identity.restoreEpoch
        && String(activationEvidence.bootstrapId || '')
        && /^[0-9a-f]{64}$/.test(String(activationEvidence.manifestHash || '').toLowerCase())
        && Number.isFinite(Date.parse(String(activationEvidence.readbackVerifiedAt || '')))
        && Number.isFinite(Date.parse(String(activationEvidence.shadowValidatedAt || '')))
      )
    ),
  };
};

export const activateFinancialSyncProtocolV2V8 = async ({
  namespace = 'guest',
  bootstrapId,
  manifestHash,
  readbackVerifiedAt,
  shadowValidatedAt,
  validationCursor = 0,
  database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) throw new Error('sqlite_unavailable');
  await ensureFinancialLedgerV7(db);
  const target = String(namespace || '').trim();
  if (!target) throw new Error('financial_v2_activation_namespace_required');

  const expectedBootstrapId = String(bootstrapId || '').trim();
  const expectedManifest = String(manifestHash || '').trim().toLowerCase();
  const readbackAt = String(readbackVerifiedAt || '').trim();
  const shadowAt = String(shadowValidatedAt || '').trim();
  const cursor = Number(validationCursor);

  if (!expectedBootstrapId
      || !/^[0-9a-f]{64}$/.test(expectedManifest)
      || !Number.isFinite(Date.parse(readbackAt))
      || !Number.isFinite(Date.parse(shadowAt))
      || !Number.isSafeInteger(cursor)
      || cursor < 0) {
    throw new Error('financial_v2_activation_evidence_invalid');
  }

  return enqueueWrite(async () => runLedgerExclusiveTransaction(db, async (txn) => {
    const identity = await ensureShadowLedgerSyncIdentityV8(txn, target);
    const restoreIntent = await txn.getFirstAsync(
      `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`,
      restoreIntentMetaKey(identity.namespace),
    );
    if (restoreIntent?.value) throw new Error('financial_v2_activation_restore_intent_active');

    const bootstrap = await txn.getFirstAsync(
      `SELECT bootstrap_id,manifest_hash,status,finalized_at
         FROM ledger_bootstrap_state_v8
        WHERE namespace=? AND ledger_id=? AND restore_epoch=?
        ORDER BY created_at DESC LIMIT 1`,
      identity.namespace, identity.ledgerId, identity.restoreEpoch,
    );
    if (!bootstrap?.bootstrap_id
        || bootstrap.status !== 'finalized'
        || String(bootstrap.bootstrap_id) !== expectedBootstrapId
        || String(bootstrap.manifest_hash || '').toLowerCase() !== expectedManifest
        || !bootstrap.finalized_at) {
      throw new Error('financial_v2_activation_bootstrap_not_finalized');
    }

    const pending = await txn.getFirstAsync(
      `SELECT COUNT(*) AS n
         FROM ledger_outbox_v3
        WHERE ledger_id=? AND restore_epoch=?
          AND acknowledged_at IS NULL
          AND superseded_by_bootstrap_id IS NULL`,
      identity.ledgerId, identity.restoreEpoch,
    );
    if (Number(pending?.n || 0) !== 0) {
      throw new Error('financial_v2_activation_pending_outbox');
    }

    const existing = await txn.getFirstAsync(
      `SELECT activated_at,shadow_last_server_sequence,last_server_sequence,last_success_at
         FROM ledger_sync_state_v8
        WHERE ledger_id=? AND restore_epoch=? LIMIT 1`,
      identity.ledgerId, identity.restoreEpoch,
    );
    if (existing?.activated_at) {
      return {
        supported: true,
        ok: true,
        idempotent: true,
        namespace: identity.namespace,
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
        activeProtocolVersion: 2,
        activatedAt: String(existing.activated_at),
      };
    }
    if (Math.max(0, Number(existing?.last_server_sequence || 0)) > 0) {
      throw new Error('financial_v2_preactivation_production_cursor_recovery_required');
    }

    const now = new Date().toISOString();
    const activationEvidence = {
      version: 1,
      namespace: identity.namespace,
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      bootstrapId: expectedBootstrapId,
      manifestHash: expectedManifest,
      readbackVerifiedAt: readbackAt,
      shadowValidatedAt: shadowAt,
      validationCursor: cursor,
      activatedAt: now,
    };

    // Evidence and activation marker are committed atomically. There is no
    // intermediate durable state where V2 is active without verification proof.
    await txn.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
      activationEvidenceKey(identity.namespace, identity.ledgerId, identity.restoreEpoch),
      safeJson(activationEvidence),
      now,
    );
    // Legacy key kept in step so older readers observe the same current evidence.
    await txn.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
      legacyActivationEvidenceKey(identity.namespace),
      safeJson(activationEvidence),
      now,
    );
    // This epoch has now completed its own activation.
    await txn.runAsync(
      `DELETE FROM ledger_v7_meta WHERE key=?`,
      epochActivationPendingKey(identity.namespace),
    );
    await txn.runAsync(
      `INSERT INTO ledger_sync_state_v8
       (ledger_id,restore_epoch,shadow_last_server_sequence,last_shadow_success_at,
        last_server_sequence,last_success_at,last_device_id,activated_at,updated_at)
       VALUES (?,?,?,?,0,NULL,NULL,?,?)
       ON CONFLICT(ledger_id,restore_epoch) DO UPDATE SET
         shadow_last_server_sequence=MAX(ledger_sync_state_v8.shadow_last_server_sequence,excluded.shadow_last_server_sequence),
         last_shadow_success_at=excluded.last_shadow_success_at,
         activated_at=COALESCE(ledger_sync_state_v8.activated_at,excluded.activated_at),
         updated_at=excluded.updated_at`,
      identity.ledgerId, identity.restoreEpoch, cursor, shadowAt, now, now,
    );
    await txn.runAsync(
      `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
      `active_sync_protocol:${identity.namespace}`, '2', now,
    );

    const activated = await txn.getFirstAsync(
      `SELECT activated_at,shadow_last_server_sequence,last_server_sequence FROM ledger_sync_state_v8
        WHERE ledger_id=? AND restore_epoch=? LIMIT 1`,
      identity.ledgerId, identity.restoreEpoch,
    );
    if (!activated?.activated_at) throw new Error('financial_v2_activation_compare_and_set_failed');
    if (Number(activated.shadow_last_server_sequence || 0) < cursor) {
      throw new Error('financial_v2_activation_shadow_cursor_regressed');
    }
    if (Number(activated.last_server_sequence || 0) !== 0) {
      throw new Error('financial_v2_activation_production_cursor_not_zero');
    }

    return {
      supported: true,
      ok: true,
      idempotent: false,
      namespace: identity.namespace,
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      activeProtocolVersion: 2,
      activatedAt: String(activated.activated_at),
      activationEvidence,
    };
  }));
};

export const readPendingLedgerMutationsV8 = async ({
  namespace = 'guest', ledgerId, restoreEpoch, limit = 100, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return [];
  await ensureFinancialLedgerV7(db);
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database: db });
  const targetLedgerId = String(ledgerId || identity.ledgerId);
  const targetEpoch = Math.max(1, Number(restoreEpoch || identity.restoreEpoch));
  if (targetLedgerId !== identity.ledgerId || targetEpoch !== identity.restoreEpoch) {
    throw new Error('financial_v2_pending_identity_mismatch');
  }
  const rows = await db.getAllAsync(
    `SELECT * FROM ledger_outbox_v3
      WHERE namespace=? AND ledger_id=? AND restore_epoch=? AND acknowledged_at IS NULL
        AND superseded_by_bootstrap_id IS NULL
        AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY sequence_id LIMIT ?`,
    identity.namespace, targetLedgerId, targetEpoch, new Date().toISOString(),
    Math.max(1, Math.min(500, Number(limit) || 100)),
  );
  return rows.map(row => ({ ...row, payload: parseJson(row.payload_json, null) }));
};

export const acknowledgeLedgerMutationsV8 = async ({
  ledgerId, restoreEpoch, mutationIds = [], database = null,
} = {}) => {
  const ids = [...new Set((Array.isArray(mutationIds) ? mutationIds : []).filter(Boolean).map(String))];
  if (!ids.length) return 0;
  const db = database || await getLedgerDb();
  if (!db) return 0;
  await ensureFinancialLedgerV7(db);
  const now = new Date().toISOString();
  let changed = 0;
  await enqueueWrite(() => runLedgerExclusiveTransaction(db, async (txn) => {
    for (const id of ids) {
      const result = await txn.runAsync(
        `UPDATE ledger_outbox_v3
            SET acknowledged_at=?,last_error=NULL
          WHERE ledger_id=? AND restore_epoch=? AND mutation_id=? AND acknowledged_at IS NULL`,
        now, String(ledgerId), Number(restoreEpoch), id,
      );
      changed += Number(result?.changes || 0);
    }
  }));
  return changed;
};

export const failLedgerMutationV8 = async ({
  ledgerId, restoreEpoch, mutationId, error, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db || !mutationId) return false;
  await ensureFinancialLedgerV7(db);
  const retryAt = new Date(Date.now() + 60_000).toISOString();
  await enqueueWrite(() => db.runAsync(
    `UPDATE ledger_outbox_v3
        SET attempts=attempts+1,next_attempt_at=?,last_error=?
      WHERE ledger_id=? AND restore_epoch=? AND mutation_id=?`,
    retryAt, String(error || 'sync_failed').slice(0,500),
    String(ledgerId), Number(restoreEpoch), String(mutationId),
  ));
  return true;
};

export const getLedgerSyncCursorV8 = async ({
  ledgerId, restoreEpoch, shadow = false, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return 0;
  await ensureFinancialLedgerV7(db);
  const row = await db.getFirstAsync(
    `SELECT shadow_last_server_sequence,last_server_sequence FROM ledger_sync_state_v8
      WHERE ledger_id=? AND restore_epoch=? LIMIT 1`,
    String(ledgerId), Number(restoreEpoch),
  );
  return Math.max(0, Number(
    shadow ? row?.shadow_last_server_sequence : row?.last_server_sequence
  ) || 0);
};

const v2RemoteConflict = (code, item, extra = {}) => ({
  code: String(code || 'financial_v2_remote_cas_conflict'),
  mutationId: String(item?.mutationId || ''),
  commandId: String(item?.commandId || ''),
  commandSequence: Number(item?.commandSequence || 0),
  entityType: String(item?.entityType || ''),
  entityId: String(item?.entityId || ''),
  revision: Number(item?.revision || 0),
  baseRevision: Number(item?.baseRevision || 0),
  ...extra,
});

const v2Require = (condition, code) => {
  if (!condition) throw new Error(String(code || 'financial_v2_remote_payload_invalid'));
};

const v2ExactLocalEcho = async (db, identity, item) => {
  const local = await db.getFirstAsync(
    `SELECT command_id,entity_type,entity_id,operation,revision,base_revision,
            protocol_version,minimum_supported_version,payload_schema_version,payload_json
       FROM ledger_outbox_v3
      WHERE ledger_id=? AND restore_epoch=? AND mutation_id=? LIMIT 1`,
    identity.ledgerId, identity.restoreEpoch, item.mutationId,
  );
  if (!local) return false;
  return String(local.command_id || '') === item.commandId
    && String(local.entity_type || '') === item.entityType
    && String(local.entity_id || '') === item.entityId
    && String(local.operation || '') === item.operation
    && Number(local.revision || 0) === item.revision
    && Number(local.base_revision || 0) === item.baseRevision
    && Number(local.protocol_version || 0) === item.protocolVersion
    && Number(local.minimum_supported_version || 0) === item.minimumSupportedVersion
    && Number(local.payload_schema_version || 0) === item.payloadSchemaVersion
    && canonicalSyncValue(parseJson(local.payload_json, null)) === canonicalSyncValue(item.payload ?? null);
};

const v2CurrentRevision = async (db, namespace, item) => {
  if (item.entityType === 'financial_transaction') {
    const row = await db.getFirstAsync(
      `SELECT revision FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
      namespace, item.entityId,
    );
    return Math.max(0, Number(row?.revision || 0));
  }
  const row = await db.getFirstAsync(
    `SELECT revision FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=? LIMIT 1`,
    namespace, item.entityType, item.entityId,
  );
  return Math.max(0, Number(row?.revision || 0));
};

const v2AssertUniqueIds = (items, code) => {
  const seen = new Set();
  for (const item of items || []) {
    const id = String(item?.id || '').trim();
    v2Require(!!id && !seen.has(id), code);
    seen.add(id);
  }
};

const v2ValidateFinancialTransactionPayload = async (db, namespace, item) => {
  const payload = item.payload || {};
  if (item.operation === 'void' || item.operation === 'delete') {
    if (payload.transactionId != null) {
      v2Require(String(payload.transactionId) === item.entityId, 'financial_v2_remote_transaction_identity_invalid');
    }
    v2Require(item.baseRevision > 0, 'financial_v2_remote_target_missing');
    return { kind: 'transaction_terminal', payload };
  }

  const archiveMode = payload.transactionId != null
    && payload.archiveYear != null
    && !payload.transaction
    && !payload.originalTransaction;
  if (archiveMode) {
    v2Require(String(payload.transactionId) === item.entityId, 'financial_v2_remote_transaction_identity_invalid');
    v2Require(Number.isSafeInteger(Number(payload.archiveYear)), 'financial_v2_remote_archive_invalid');
    v2Require(item.baseRevision > 0, 'financial_v2_remote_target_missing');
    return { kind: 'transaction_archive', payload };
  }

  const header = payload.transaction;
  const original = payload.originalTransaction;
  v2Require(header && original, 'financial_v2_remote_transaction_payload_invalid');
  v2Require(String(header.id || '') === item.entityId, 'financial_v2_remote_transaction_identity_invalid');
  if (original.id != null) {
    v2Require(String(original.id) === item.entityId, 'financial_v2_remote_transaction_identity_invalid');
  }
  if (header.revision != null) {
    v2Require(Number(header.revision) === item.revision, 'financial_v2_remote_transaction_revision_invalid');
  }
  v2Require(!!String(header.idempotencyKey || '').trim(), 'financial_v2_remote_idempotency_key_missing');

  const currencies = Array.isArray(payload.currencies) ? payload.currencies : [];
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const rates = Array.isArray(payload.exchangeRates) ? payload.exchangeRates : [];
  const postings = Array.isArray(payload.postings) ? payload.postings : [];
  const links = Array.isArray(payload.links) ? payload.links : [];
  v2AssertUniqueIds(accounts, 'financial_v2_remote_account_duplicate');
  v2AssertUniqueIds(rates, 'financial_v2_remote_fx_duplicate');
  v2AssertUniqueIds(postings, 'financial_v2_remote_posting_duplicate');
  v2AssertUniqueIds(links, 'financial_v2_remote_link_duplicate');

  const currencyByCode = new Map();
  for (const currency of currencies) {
    const code = String(currency?.code || '').trim();
    const minorExponent = Number(currency?.minorExponent);
    v2Require(!!code && Number.isSafeInteger(minorExponent) && minorExponent >= 0 && minorExponent <= 6,
      'financial_v2_remote_currency_payload_invalid');
    const key = code.toUpperCase();
    v2Require(!currencyByCode.has(key), 'financial_v2_remote_currency_duplicate');
    currencyByCode.set(key, { code, minorExponent });
    const existing = await db.getFirstAsync(
      `SELECT code,minor_exponent FROM ledger_currencies WHERE upper(code)=upper(?) LIMIT 1`, code,
    );
    if (existing && Number(existing.minor_exponent) !== minorExponent) {
      throw new Error('financial_v2_remote_currency_identity_conflict');
    }
  }

  const accountById = new Map();
  for (const account of accounts) {
    const id = String(account?.id || '').trim();
    const accountType = String(account?.accountType || '').trim();
    const scope = String(account?.scope || '').trim();
    const currencyCode = String(account?.currencyCode || '').trim();
    v2Require(id && accountType && scope && currencyCode, 'financial_v2_remote_account_payload_invalid');
    accountById.set(id, { ...account, id, accountType, scope, currencyCode });
    const existing = await db.getFirstAsync(
      `SELECT account_type,scope,currency_code FROM ledger_accounts_v7 WHERE namespace=? AND id=? LIMIT 1`,
      namespace, id,
    );
    if (existing && (
      String(existing.account_type) !== accountType
      || String(existing.scope) !== scope
      || String(existing.currency_code).toUpperCase() !== currencyCode.toUpperCase()
    )) {
      throw new Error('financial_v2_remote_account_identity_conflict');
    }
    if (!existing) {
      const currency = await db.getFirstAsync(
        `SELECT code FROM ledger_currencies WHERE upper(code)=upper(?) LIMIT 1`, currencyCode,
      );
      v2Require(!!currency || currencyByCode.has(currencyCode.toUpperCase()),
        'financial_v2_remote_account_currency_missing');
    }
  }

  const rateById = new Map();
  for (const rate of rates) {
    const id = String(rate?.id || '').trim();
    const base = String(rate?.baseCurrencyCode || '').trim();
    const quote = String(rate?.quoteCurrencyCode || '').trim();
    const numerator = Number(rate?.numerator);
    const denominator = Number(rate?.denominator);
    const rateDate = String(rate?.rateDate || '').trim();
    const source = String(rate?.source || '').trim();
    v2Require(id && base && quote && numerator > 0 && denominator > 0 && rateDate && source,
      'financial_v2_remote_fx_payload_invalid');
    rateById.set(id, { ...rate, id, baseCurrencyCode: base, quoteCurrencyCode: quote, numerator, denominator, rateDate, source });
    const existing = await db.getFirstAsync(
      `SELECT base_currency_code,quote_currency_code,numerator,denominator,rate_date,source
         FROM ledger_exchange_rates_v7 WHERE namespace=? AND id=? LIMIT 1`,
      namespace, id,
    );
    if (existing && (
      String(existing.base_currency_code).toUpperCase() !== base.toUpperCase()
      || String(existing.quote_currency_code).toUpperCase() !== quote.toUpperCase()
      || Number(existing.numerator) !== numerator
      || Number(existing.denominator) !== denominator
      || String(existing.rate_date) !== rateDate
      || String(existing.source) !== source
    )) {
      throw new Error('financial_v2_remote_fx_identity_conflict');
    }
  }

  for (const posting of postings) {
    const postingId = String(posting?.id || '').trim();
    const transactionId = String(posting?.transactionId || '').trim();
    const accountId = String(posting?.accountId || '').trim();
    const currencyCode = String(posting?.currencyCode || '').trim();
    v2Require(postingId && transactionId === item.entityId && accountId && currencyCode
      && Number(posting?.amountMinor) !== 0, 'financial_v2_remote_posting_payload_invalid');
    const conflictingPosting = await db.getFirstAsync(
      `SELECT transaction_id FROM ledger_postings_v7 WHERE namespace=? AND id=? LIMIT 1`,
      namespace, postingId,
    );
    if (conflictingPosting && String(conflictingPosting.transaction_id) !== item.entityId) {
      throw new Error('financial_v2_remote_posting_identity_conflict');
    }
    let account = accountById.get(accountId);
    if (!account) {
      const existingAccount = await db.getFirstAsync(
        `SELECT account_type AS accountType,scope,currency_code AS currencyCode
           FROM ledger_accounts_v7 WHERE namespace=? AND id=? LIMIT 1`,
        namespace, accountId,
      );
      v2Require(!!existingAccount, 'financial_v2_remote_posting_account_missing');
      account = existingAccount;
    }
    if (String(account.currencyCode || '').toUpperCase() !== currencyCode.toUpperCase()) {
      throw new Error('financial_v2_remote_posting_account_currency_mismatch');
    }
    const rateId = String(posting?.exchangeRateId || '').trim();
    if (rateId) {
      const existingRate = await db.getFirstAsync(
        `SELECT id FROM ledger_exchange_rates_v7 WHERE namespace=? AND id=? LIMIT 1`,
        namespace, rateId,
      );
      v2Require(!!existingRate || rateById.has(rateId), 'financial_v2_remote_posting_fx_missing');
    }
  }

  for (const link of links) {
    v2Require(String(link?.transactionId || '') === item.entityId,
      'financial_v2_remote_link_transaction_mismatch');
    const conflictingLink = await db.getFirstAsync(
      `SELECT transaction_id FROM ledger_transaction_links_v7 WHERE namespace=? AND id=? LIMIT 1`,
      namespace, String(link.id),
    );
    if (conflictingLink && String(conflictingLink.transaction_id) !== item.entityId) {
      throw new Error('financial_v2_remote_link_identity_conflict');
    }
  }

  const idempotencyCollision = await db.getFirstAsync(
    `SELECT id FROM ledger_financial_transactions_v7
      WHERE namespace=? AND idempotency_key=? AND id<>? LIMIT 1`,
    namespace, String(header.idempotencyKey), item.entityId,
  );
  if (idempotencyCollision?.id) throw new Error('financial_v2_remote_idempotency_conflict');

  return {
    kind: 'transaction_upsert', payload, header, original,
    currencies, accounts, rates, postings, links,
  };
};

const v2ValidateDomainEntityPayload = (item) => {
  const source = item.payload || {};
  v2Require(String(source.entityType || '') === item.entityType, 'financial_v2_remote_entity_type_mismatch');
  v2Require(String(source.id || '') === item.entityId, 'financial_v2_remote_entity_id_mismatch');
  if (source.revision != null) {
    v2Require(Number(source.revision) === item.revision, 'financial_v2_remote_entity_revision_mismatch');
  }
  if (source.baseRevision != null) {
    v2Require(Number(source.baseRevision) === item.baseRevision, 'financial_v2_remote_entity_base_revision_mismatch');
  }
  if (item.operation === 'delete') {
    v2Require(!!source.deletedAt, 'financial_v2_remote_entity_delete_tombstone_missing');
  }
  return { kind: 'domain_entity', source };
};

const v2PreflightMutation = async (db, identity, item) => {
  if (await v2ExactLocalEcho(db, identity, item)) {
    const currentRevision = await v2CurrentRevision(db, identity.namespace, item);
    if (currentRevision < item.revision) {
      throw Object.assign(new Error('financial_v2_exact_echo_local_state_missing'), {
        conflict: v2RemoteConflict('financial_v2_exact_echo_local_state_missing', item, { currentRevision }),
      });
    }
    return { item, kind: 'exact_local_echo', echo: true, currentRevision };
  }
  const currentRevision = await v2CurrentRevision(db, identity.namespace, item);
  if (currentRevision !== item.baseRevision) {
    throw Object.assign(new Error('financial_v2_remote_cas_conflict'), {
      conflict: v2RemoteConflict('financial_v2_remote_cas_conflict', item, { currentRevision }),
    });
  }
  if (item.entityType === 'financial_transaction') {
    return { item, echo: false, currentRevision, ...(await v2ValidateFinancialTransactionPayload(db, identity.namespace, item)) };
  }
  return { item, echo: false, currentRevision, ...v2ValidateDomainEntityPayload(item) };
};

const v2ApplyFinancialTransactionPlan = async (db, namespace, plan, deviceId) => {
  const { item, payload } = plan;
  const now = new Date().toISOString();
  if (plan.kind === 'transaction_terminal') {
    const deletedAt = payload.deletedAt || payload.voidedAt || now;
    const existing = await db.getFirstAsync(
      `SELECT payload_json FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
      namespace, item.entityId,
    );
    if (!existing) throw new Error('financial_v2_remote_target_missing');
    const result = await db.runAsync(
      `UPDATE ledger_financial_transactions_v7
          SET status='voided',deleted_at=?,revision=?,payload_json=?,updated_at=?
        WHERE namespace=? AND id=? AND revision=?`,
      deletedAt, item.revision,
      safeJson({ ...(parseJson(existing.payload_json, {}) || {}), status: 'voided', deletedAt, revision: item.revision }),
      deletedAt, namespace, item.entityId, item.baseRevision,
    );
    if (Number(result?.changes || 0) !== 1) throw new Error('financial_v2_remote_cas_commit_failed');
    return 1;
  }

  if (plan.kind === 'transaction_archive') {
    const archivedAt = payload.archivedAt || now;
    const existing = await db.getFirstAsync(
      `SELECT payload_json FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
      namespace, item.entityId,
    );
    if (!existing) throw new Error('financial_v2_remote_target_missing');
    const result = await db.runAsync(
      `UPDATE ledger_financial_transactions_v7
          SET archive_year=?,archived_at=?,revision=?,payload_json=?,updated_at=?
        WHERE namespace=? AND id=? AND revision=?`,
      Number(payload.archiveYear), archivedAt, item.revision,
      safeJson({ ...(parseJson(existing.payload_json, {}) || {}), archiveYear: Number(payload.archiveYear), archivedAt, revision: item.revision }),
      archivedAt, namespace, item.entityId, item.baseRevision,
    );
    if (Number(result?.changes || 0) !== 1) throw new Error('financial_v2_remote_cas_commit_failed');
    return 1;
  }

  for (const currency of plan.currencies) {
    await db.runAsync(
      `INSERT OR IGNORE INTO ledger_currencies(code,minor_exponent,enabled) VALUES (?,?,1)`,
      currency.code, currency.minorExponent,
    );
  }
  for (const account of plan.accounts) await upsertAccount(db, { ...account, namespace });
  for (const rate of plan.rates) {
    await db.runAsync(
      `INSERT OR IGNORE INTO ledger_exchange_rates_v7
       (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      namespace, rate.id, rate.baseCurrencyCode, rate.quoteCurrencyCode,
      rate.numerator, rate.denominator, rate.rateDate, rate.source, rate.capturedAt || now,
    );
  }

  await db.runAsync(`DELETE FROM ledger_transaction_links_v7 WHERE namespace=? AND transaction_id=?`, namespace, item.entityId);
  await db.runAsync(`DELETE FROM ledger_postings_v7 WHERE namespace=? AND transaction_id=?`, namespace, item.entityId);

  const header = { ...plan.header, namespace, revision: item.revision };
  const persistedPayload = safeJson({ ...plan.original, revision: item.revision });
  if (item.baseRevision === 0) {
    await db.runAsync(
      `INSERT INTO ledger_financial_transactions_v7
       (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
        idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      namespace, header.id, header.kind, header.status || 'posted', header.scope || 'personal', header.dateISO,
      header.occurredAt, header.categoryId, header.title, header.note, header.sourceType, header.sourceId,
      header.idempotencyKey, header.deviceId || deviceId || 'remote-device', item.revision,
      header.archiveYear, header.archivedAt, header.deletedAt, persistedPayload,
      header.createdAt || now, header.updatedAt || now,
    );
  } else {
    const result = await db.runAsync(
      `UPDATE ledger_financial_transactions_v7 SET
         kind=?,status=?,scope=?,date_iso=?,occurred_at=?,category_id=?,title=?,note=?,source_type=?,source_id=?,
         idempotency_key=?,device_id=?,revision=?,archive_year=?,archived_at=?,deleted_at=?,payload_json=?,updated_at=?
       WHERE namespace=? AND id=? AND revision=?`,
      header.kind, header.status || 'posted', header.scope || 'personal', header.dateISO,
      header.occurredAt, header.categoryId, header.title, header.note, header.sourceType, header.sourceId,
      header.idempotencyKey, header.deviceId || deviceId || 'remote-device', item.revision,
      header.archiveYear, header.archivedAt, header.deletedAt, persistedPayload, header.updatedAt || now,
      namespace, item.entityId, item.baseRevision,
    );
    if (Number(result?.changes || 0) !== 1) throw new Error('financial_v2_remote_cas_commit_failed');
  }

  for (const posting of plan.postings) {
    await db.runAsync(
      `INSERT INTO ledger_postings_v7
       (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      namespace, posting.id, posting.transactionId, posting.accountId, posting.bucket,
      posting.role, posting.amountMinor, posting.currencyCode, posting.exchangeRateId, posting.createdAt || now,
    );
  }
  for (const link of plan.links) {
    await db.runAsync(
      `INSERT INTO ledger_transaction_links_v7
       (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      namespace, link.id, link.transactionId, link.linkType, link.linkId,
      link.relation, link.appliedAmountMinor, link.currencyCode, link.createdAt || now,
    );
  }
  return 1;
};

const v2ApplyDomainEntityPlan = async (db, namespace, plan) => {
  const { item, source } = plan;
  const now = new Date().toISOString();
  const createdAt = source.createdAt || now;
  const updatedAt = source.updatedAt || now;
  const payloadJson = safeJson(source.payload ?? null);
  if (item.baseRevision === 0) {
    await db.runAsync(
      `INSERT INTO ledger_entities_v7
       (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      namespace, item.entityType, item.entityId, item.revision,
      source.deletedAt || null, payloadJson, createdAt, updatedAt,
    );
    return 1;
  }
  const result = await db.runAsync(
    `UPDATE ledger_entities_v7 SET revision=?,deleted_at=?,payload_json=?,updated_at=?
      WHERE namespace=? AND entity_type=? AND id=? AND revision=?`,
    item.revision, source.deletedAt || null, payloadJson, updatedAt,
    namespace, item.entityType, item.entityId, item.baseRevision,
  );
  if (Number(result?.changes || 0) !== 1) throw new Error('financial_v2_remote_cas_commit_failed');
  return 1;
};

const v2WriteInboxCommand = async (db, identity, group, status, now) => {
  for (const item of group) {
    await db.runAsync(
      `INSERT INTO ledger_inbox_v3
       (ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence,received_at,apply_status,applied_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(ledger_id,restore_epoch,mutation_id) DO UPDATE SET
         command_id=excluded.command_id,
         command_sequence=excluded.command_sequence,
         server_sequence=excluded.server_sequence,
         received_at=excluded.received_at,
         apply_status=CASE
           WHEN ledger_inbox_v3.apply_status='applied' THEN 'applied'
           WHEN ledger_inbox_v3.apply_status='conflict' THEN 'conflict'
           ELSE excluded.apply_status
         END,
         applied_at=CASE WHEN excluded.apply_status='applied' THEN excluded.applied_at ELSE ledger_inbox_v3.applied_at END`,
      identity.ledgerId, identity.restoreEpoch, item.mutationId, item.commandId,
      item.commandSequence, item.serverSequence, now, status, status === 'applied' ? now : null,
    );
  }
};

const v2WriteConflictInbox = async (db, identity, group) => {
  const now = new Date().toISOString();
  await runLedgerExclusiveTransaction(db, async (txn) => {
    for (const item of group) {
      await txn.runAsync(
        `INSERT INTO ledger_inbox_v3
         (ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence,received_at,apply_status,applied_at)
         VALUES (?,?,?,?,?,?,?,'conflict',NULL)
         ON CONFLICT(ledger_id,restore_epoch,mutation_id) DO UPDATE SET
           command_id=excluded.command_id,command_sequence=excluded.command_sequence,
           server_sequence=excluded.server_sequence,received_at=excluded.received_at,
           apply_status=CASE WHEN ledger_inbox_v3.apply_status='applied' THEN 'applied' ELSE 'conflict' END`,
        identity.ledgerId, identity.restoreEpoch, item.mutationId, item.commandId,
        item.commandSequence, item.serverSequence, now,
      );
    }
  });
};

export const applyRemoteLedgerMutationsV8 = async ({
  namespace = 'guest', ledgerId, restoreEpoch, mutations = [], deviceId = '',
  allowProductionApply = false, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return { supported:false,ok:false,reason:'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database: db });
  const targetLedgerId = String(ledgerId || identity.ledgerId);
  const targetEpoch = Math.max(1, Number(restoreEpoch || identity.restoreEpoch));
  if (targetLedgerId !== identity.ledgerId || targetEpoch !== identity.restoreEpoch) {
    return { supported:true,ok:false,reason:'financial_v2_remote_identity_mismatch' };
  }

  const shadowMode = allowProductionApply !== true;
  if (!shadowMode) {
    const activation = await db.getFirstAsync(
      `SELECT activated_at FROM ledger_sync_state_v8
        WHERE ledger_id=? AND restore_epoch=? LIMIT 1`,
      identity.ledgerId, identity.restoreEpoch,
    );
    if (!activation?.activated_at) {
      return { supported:true,ok:false,reason:'financial_v2_production_apply_before_activation' };
    }
  }

  const normalized = (Array.isArray(mutations) ? mutations : []).map(item => ({
    ...item,
    ledgerId: String(item.ledgerId || item.ledger_id || ''),
    restoreEpoch: Number(item.restoreEpoch || item.restore_epoch || 0),
    mutationId: String(item.mutationId || item.mutation_id || ''),
    serverSequence: Number(item.serverSequence || item.server_sequence || 0),
    commandId: String(item.commandId || item.command_id || ''),
    commandSequence: Number(item.commandSequence || item.command_sequence || 0),
    commandMutationCount: Number(item.commandMutationCount || item.command_mutation_count || 0),
    entityType: String(item.entityType || item.entity_type || ''),
    entityId: String(item.entityId || item.entity_id || ''),
    operation: String(item.operation || 'upsert'),
    revision: Number(item.revision || 0),
    baseRevision: Number(item.baseRevision ?? item.base_revision ?? -1),
    protocolVersion: Number(item.protocolVersion || item.protocol_version || 0),
    minimumSupportedVersion: Number(item.minimumSupportedVersion || item.minimum_supported_version || 0),
    payloadSchemaVersion: Number(item.payloadSchemaVersion || item.payload_schema_version || 0),
    payload: item.payload ?? parseJson(item.payload_json, null),
  })).filter(item => item.mutationId && item.serverSequence > 0);

  for (const item of normalized) {
    if (item.ledgerId !== identity.ledgerId
        || item.restoreEpoch !== identity.restoreEpoch
        || !item.commandId
        || item.commandSequence <= 0 || item.commandMutationCount <= 0
        || !item.entityType || !item.entityId
        || !['upsert','delete','void'].includes(item.operation)
        || item.revision <= 0 || item.baseRevision < 0
        || item.revision !== item.baseRevision + 1
        || item.protocolVersion !== 2
        || item.minimumSupportedVersion < 1 || item.minimumSupportedVersion > 2
        || item.payloadSchemaVersion <= 0) {
      return { supported:true,ok:false,reason:'financial_v2_remote_mutation_invalid' };
    }
  }

  const commandGroups = new Map();
  const sequenceOwners = new Map();
  for (const item of normalized) {
    const priorOwner = sequenceOwners.get(item.commandSequence);
    if (priorOwner && priorOwner !== item.commandId) {
      return { supported:true,ok:false,reason:'financial_v2_remote_command_sequence_collision' };
    }
    sequenceOwners.set(item.commandSequence, item.commandId);
    const key = String(item.commandSequence) + ':' + item.commandId;
    const group = commandGroups.get(key) || [];
    group.push(item);
    commandGroups.set(key, group);
  }
  for (const group of commandGroups.values()) {
    const expectedCount = Number(group[0]?.commandMutationCount || 0);
    if (!expectedCount || group.length !== expectedCount
        || group.some(item => item.commandMutationCount !== expectedCount
          || item.commandSequence !== group[0].commandSequence
          || item.commandId !== group[0].commandId)) {
      return { supported:true,ok:false,reason:'financial_v2_remote_command_incomplete' };
    }
    const entityKeys = new Set();
    for (const item of group) {
      const entityKey = item.entityType + ':' + item.entityId;
      if (entityKeys.has(entityKey)) {
        return { supported:true,ok:false,reason:'financial_v2_remote_command_duplicate_entity' };
      }
      entityKeys.add(entityKey);
    }
  }

  const sorted = normalized.sort((a,b)=>(
    a.commandSequence-b.commandSequence || a.serverSequence-b.serverSequence
  ));
  let cursor = await getLedgerSyncCursorV8({
    ledgerId: identity.ledgerId, restoreEpoch: identity.restoreEpoch,
    shadow: shadowMode, database: db,
  });
  if (!sorted.length) {
    return { supported:true,ok:true,applied:0,processed:0,cursor,shadow:shadowMode };
  }

  return enqueueWrite(async () => {
    let applied = 0;
    let processed = 0;
    const orderedGroups = [...commandGroups.values()].sort((a,b) => (
      a[0].commandSequence - b[0].commandSequence
    ));

    for (const group of orderedGroups) {
      const commandSequence = Number(group[0].commandSequence);
      if (commandSequence <= cursor) {
        processed += group.length;
        continue;
      }

      const statuses = [];
      for (const item of group) {
        const inbox = await db.getFirstAsync(
          `SELECT apply_status FROM ledger_inbox_v3
            WHERE ledger_id=? AND restore_epoch=? AND mutation_id=? LIMIT 1`,
          identity.ledgerId, identity.restoreEpoch, item.mutationId,
        );
        statuses.push(String(inbox?.apply_status || ''));
      }
      if (statuses.some(status => status === 'conflict')) {
        return {
          supported:true,ok:false,reason:'financial_v2_remote_command_conflict_pending',
          conflicts: group.map(item => v2RemoteConflict('financial_v2_remote_command_conflict_pending', item)),
          applied,processed,cursor,shadow:shadowMode,
        };
      }
      if (!shadowMode && statuses.every(status => status === 'applied')) {
        cursor = Math.max(cursor, commandSequence);
        processed += group.length;
        continue;
      }
      const populated = statuses.filter(Boolean);
      if (populated.length && populated.length !== group.length) {
        return { supported:true,ok:false,reason:'financial_v2_remote_inbox_partial_command',applied,processed,cursor,shadow:shadowMode };
      }

      const plans = [];
      try {
        for (const item of group) plans.push(await v2PreflightMutation(db, identity, item));
      } catch (error) {
        await v2WriteConflictInbox(db, identity, group);
        const conflict = error?.conflict || v2RemoteConflict(error?.message || 'financial_v2_remote_cas_conflict', group[0]);
        return {
          supported:true,ok:false,reason:String(error?.message || 'financial_v2_remote_cas_conflict'),
          conflicts:[conflict],applied,processed,cursor,shadow:shadowMode,
        };
      }

      if (shadowMode) {
        const now = new Date().toISOString();
        await runLedgerExclusiveTransaction(db, async (txn) => {
          await v2WriteInboxCommand(txn, identity, group, 'observed', now);
          await txn.runAsync(
            `INSERT INTO ledger_sync_state_v8
             (ledger_id,restore_epoch,shadow_last_server_sequence,last_shadow_success_at,last_device_id,updated_at)
             VALUES (?,?,?,?,?,?)
             ON CONFLICT(ledger_id,restore_epoch) DO UPDATE SET
               shadow_last_server_sequence=MAX(ledger_sync_state_v8.shadow_last_server_sequence,excluded.shadow_last_server_sequence),
               last_shadow_success_at=excluded.last_shadow_success_at,last_device_id=excluded.last_device_id,updated_at=excluded.updated_at`,
            identity.ledgerId, identity.restoreEpoch, commandSequence, now, String(deviceId || ''), now,
          );
        });
        processed += group.length;
        cursor = Math.max(cursor, commandSequence);
        continue;
      }

      const now = new Date().toISOString();
      let commandApplied = 0;
      try {
        await runLedgerExclusiveTransaction(db, async (txn) => {
          for (const plan of plans) {
            if (plan.echo) continue;
            if (plan.item.entityType === 'financial_transaction') {
              commandApplied += await v2ApplyFinancialTransactionPlan(txn, identity.namespace, plan, deviceId);
            } else {
              commandApplied += await v2ApplyDomainEntityPlan(txn, identity.namespace, plan);
            }
          }
          await v2WriteInboxCommand(txn, identity, group, 'applied', now);
          await txn.runAsync(
            `INSERT INTO ledger_sync_state_v8
             (ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,
              last_shadow_success_at,last_success_at,last_device_id,updated_at)
             VALUES (?,?,?,?,?,?,?,?)
             ON CONFLICT(ledger_id,restore_epoch) DO UPDATE SET
               shadow_last_server_sequence=MAX(ledger_sync_state_v8.shadow_last_server_sequence,excluded.shadow_last_server_sequence),
               last_server_sequence=MAX(ledger_sync_state_v8.last_server_sequence,excluded.last_server_sequence),
               last_shadow_success_at=excluded.last_shadow_success_at,last_success_at=excluded.last_success_at,
               last_device_id=excluded.last_device_id,updated_at=excluded.updated_at`,
            identity.ledgerId, identity.restoreEpoch, commandSequence, commandSequence,
            now, now, String(deviceId || ''), now,
          );
        });
        applied += commandApplied;
      } catch (error) {
        return {
          supported:true,ok:false,reason:String(error?.message || 'financial_v2_remote_atomic_apply_failed'),
          conflicts:[v2RemoteConflict(error?.message || 'financial_v2_remote_atomic_apply_failed', group[0])],
          applied,processed,cursor,shadow:false,
        };
      }
      processed += group.length;
      cursor = Math.max(cursor, commandSequence);
    }

    const observedCursor = sorted.reduce((value,item)=>Math.max(value,item.commandSequence),cursor);
    cursor = Math.max(cursor, observedCursor);
    return { supported:true,ok:true,applied,processed,cursor,shadow:shadowMode };
  });
};

const insertCurrency =
 (db, item) => db.runAsync(
  `INSERT INTO ledger_currencies(code,minor_exponent,enabled) VALUES (?,?,1)
   ON CONFLICT(code) DO UPDATE SET minor_exponent=excluded.minor_exponent,enabled=1`,
  item.code, item.minorExponent,
);

const upsertAccount = (db, account) => db.runAsync(
  `INSERT INTO ledger_accounts_v7
   (namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
   VALUES (?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(namespace,id) DO UPDATE SET
     name=excluded.name,account_type=excluded.account_type,scope=excluded.scope,
     currency_code=excluded.currency_code,status=excluded.status,
     updated_at=excluded.updated_at,archived_at=excluded.archived_at`,
  account.namespace, account.id, account.name, account.accountType, account.scope,
  account.currencyCode, account.status, account.createdAt, account.updatedAt, account.archivedAt,
);

const canonicalFinancialEntityPayload = (entityType, payload) => {
  if (String(entityType || '') !== 'workspace'
      || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const cfg = payload.cfg;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return payload;
  return {
    ...payload,
    cfg: Object.fromEntries(
      Object.entries(cfg).filter(([key]) => key !== 'avatarUri'),
    ),
  };
};

const upsertEntity = (db, entity) => db.runAsync(
  `INSERT INTO ledger_entities_v7
   (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?)
   ON CONFLICT(namespace,entity_type,id) DO UPDATE SET
     revision=excluded.revision,deleted_at=excluded.deleted_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at
   WHERE excluded.revision >= ledger_entities_v7.revision`,
  entity.namespace, entity.entityType, entity.id, entity.revision, entity.deletedAt,
  safeJson(canonicalFinancialEntityPayload(entity.entityType, entity.payload)), entity.createdAt, entity.updatedAt,
);

const prepareLocalEntity = async (db, entity) => {
  const current = await db.getFirstAsync(
    `SELECT revision FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=? LIMIT 1`,
    entity.namespace, entity.entityType, entity.id,
  );
  const currentRevision = Math.max(0, Number(current?.revision || 0));
  return {
    ...entity,
    payload: canonicalFinancialEntityPayload(entity.entityType, entity.payload),
    revision: currentRevision + 1,
    baseRevision: currentRevision,
  };
};

const ensureShadowLedgerSyncIdentityV8 = async (db, namespace) => {
  const value = String(namespace || '').trim();
  if (!value) throw new Error('ledger_sync_identity_namespace_required');
  let row = await db.getFirstAsync(
    `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version
       FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
    value,
  );
  if (!row) {
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT OR IGNORE INTO ledger_sync_identity_v8
       (namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
       VALUES (?,'ledger-' || lower(hex(randomblob(16))),1,2,2,?,?)`,
      value, now, now,
    );
    row = await db.getFirstAsync(
      `SELECT namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version
         FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
      value,
    );
  }
  if (!row?.ledger_id) throw new Error('ledger_sync_identity_creation_failed');
  return {
    namespace: String(row.namespace),
    ledgerId: String(row.ledger_id),
    restoreEpoch: Math.max(1, Number(row.restore_epoch || 1)),
    protocolVersion: Math.max(2, Number(row.protocol_version || 2)),
    minimumSupportedVersion: Math.max(1, Number(row.minimum_supported_version || 2)),
  };
};

const createShadowCommandIdV2 = async db => {
  const row = await db.getFirstAsync(`SELECT 'cmd2-' || lower(hex(randomblob(16))) AS id`);
  const value = String(row?.id || '').trim();
  if (!value) throw new Error('financial_v2_command_id_generation_failed');
  return value;
};

const createShadowMutationIdV2 = async db => {
  const row = await db.getFirstAsync(`SELECT 'mut2-' || lower(hex(randomblob(16))) AS id`);
  const value = String(row?.id || '').trim();
  if (!value) throw new Error('financial_v2_mutation_id_generation_failed');
  return value;
};

const insertShadowMutationV2 = async (db, {
  namespace, commandId, entityType, entityId, operation = 'upsert',
  revision, baseRevision, payload, createdAt,
} = {}) => {
  const identity = await ensureShadowLedgerSyncIdentityV8(db, namespace);
  const mutationId = await createShadowMutationIdV2(db);
  const nextRevision = Number(revision);
  const priorRevision = Number(baseRevision);
  if (!Number.isSafeInteger(nextRevision) || !Number.isSafeInteger(priorRevision)
      || nextRevision <= 0 || priorRevision < 0 || nextRevision !== priorRevision + 1) {
    throw new Error('financial_v2_local_revision_invalid');
  }
  await db.runAsync(
    `INSERT INTO ledger_outbox_v3
     (namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,
      revision,base_revision,protocol_version,minimum_supported_version,payload_schema_version,
      payload_json,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    identity.namespace, identity.ledgerId, identity.restoreEpoch, mutationId, String(commandId),
    String(entityType), String(entityId), String(operation), nextRevision, priorRevision,
    identity.protocolVersion, identity.minimumSupportedVersion, FINANCIAL_LEDGER_SCHEMA_VERSION,
    safeJson(payload), String(createdAt || new Date().toISOString()),
  );
  return mutationId;
};

const financialTransactionV1Payload = command => ({
  schemaVersion: command.schemaVersion,
  transaction: command.header,
  originalTransaction: command.originalTransaction,
  currencies: command.currencies || [],
  accounts: command.accounts || [command.account].filter(Boolean),
  postings: command.postings || [command.posting].filter(Boolean),
  exchangeRates: command.exchangeRates || [command.exchangeRate].filter(Boolean),
  links: command.links || [],
  entities: command.entities || [],
});

const financialTransactionShadowPayload = command => ({
  schemaVersion: command.schemaVersion,
  transaction: command.header,
  originalTransaction: command.originalTransaction,
  currencies: command.currencies || [],
  accounts: command.accounts || [command.account].filter(Boolean),
  postings: command.postings || [command.posting].filter(Boolean),
  exchangeRates: command.exchangeRates || [command.exchangeRate].filter(Boolean),
  links: command.links || [],
});

const insertEntityOutbox = async (db, entity, { commandId = null } = {}) => {
  const shadowCommandId = commandId || await createShadowCommandIdV2(db);
  await db.runAsync(
    `INSERT OR IGNORE INTO ledger_outbox_v2
     (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    entity.namespace, `${entity.namespace}:${entity.entityType}:${entity.id}:revision:${entity.revision}`,
    entity.entityType, entity.id, entity.deletedAt ? 'delete' : 'upsert', entity.revision,
    FINANCIAL_LEDGER_SCHEMA_VERSION, safeJson(entity), entity.updatedAt,
  );
  await insertShadowMutationV2(db, {
    namespace: entity.namespace,
    commandId: shadowCommandId,
    entityType: entity.entityType,
    entityId: entity.id,
    operation: entity.deletedAt ? 'delete' : 'upsert',
    revision: entity.revision,
    baseRevision: entity.baseRevision,
    payload: entity,
    createdAt: entity.updatedAt,
  });
};

const insertFinancialTransactionOutbox = async (db, command, { commandId = null } = {}) => {
  const mutation = command.mutation;
  const shadowCommandId = commandId || await createShadowCommandIdV2(db);
  await db.runAsync(
    `INSERT INTO ledger_outbox_v2
     (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    mutation.namespace, mutation.mutationId, mutation.entityType, mutation.entityId,
    mutation.operation, mutation.entityRevision, mutation.payloadVersion,
    safeJson(financialTransactionV1Payload(command)),
    mutation.createdAt,
  );
  await insertShadowMutationV2(db, {
    namespace: mutation.namespace,
    commandId: shadowCommandId,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    operation: mutation.operation,
    revision: mutation.entityRevision,
    baseRevision: mutation.entityRevision - 1,
    payload: financialTransactionShadowPayload(command),
    createdAt: mutation.createdAt,
  });
  for (const entity of command.entities || []) {
    await insertShadowMutationV2(db, {
      namespace: entity.namespace || mutation.namespace,
      commandId: shadowCommandId,
      entityType: entity.entityType,
      entityId: entity.id,
      operation: entity.deletedAt ? 'delete' : 'upsert',
      revision: entity.revision,
      baseRevision: entity.baseRevision,
      payload: entity,
      createdAt: entity.updatedAt || mutation.createdAt,
    });
  }
};

const readFinancialTransaction = async (db, namespace, transactionId) => {
  const persisted = await db.getFirstAsync(
    `SELECT tx.id,tx.kind,tx.status,tx.date_iso,tx.category_id,tx.title,tx.note,tx.payload_json,
            p.account_id,p.bucket,p.role,p.amount_minor,p.currency_code,p.exchange_rate_id
       FROM ledger_financial_transactions_v7 tx
       JOIN ledger_postings_v7 p
         ON p.namespace=tx.namespace AND p.transaction_id=tx.id
      WHERE tx.namespace=? AND tx.id=?
      ORDER BY CASE WHEN p.role='principal' THEN 0 ELSE 1 END,p.id
      LIMIT 1`,
    namespace, transactionId,
  );
  if (!persisted?.id) throw new Error('financial_v7_expense_readback_failed');
  let postingRows = [];
  if (typeof db.getAllAsync === 'function') {
    postingRows = await db.getAllAsync(
      `SELECT id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id
         FROM ledger_postings_v7 WHERE namespace=? AND transaction_id=? ORDER BY id`,
      namespace, transactionId,
    );
  }
  const postings = postingRows.length ? postingRows.map(row => ({
    id: String(row.id), accountId: String(row.account_id), bucket: String(row.bucket), role: String(row.role),
    amountMinor: Number(row.amount_minor), currencyCode: String(row.currency_code), exchangeRateId: row.exchange_rate_id || null,
  })) : [{
    accountId: String(persisted.account_id), bucket: String(persisted.bucket), role: String(persisted.role),
    amountMinor: Number(persisted.amount_minor), currencyCode: String(persisted.currency_code),
    exchangeRateId: persisted.exchange_rate_id || null,
  }];
  return {
    id: String(persisted.id),
    kind: String(persisted.kind),
    status: String(persisted.status),
    dateISO: String(persisted.date_iso),
    categoryId: persisted.category_id || null,
    title: persisted.title || '',
    note: persisted.note || '',
    accountId: postings[0].accountId,
    bucket: postings[0].bucket,
    role: postings[0].role,
    amountMinor: postings[0].amountMinor,
    currencyCode: postings[0].currencyCode,
    exchangeRateId: postings[0].exchangeRateId,
    postings,
    originalTransaction: parseJson(persisted.payload_json, null),
  };
};

export const commitFinancialLedgerV7Command = async (command, { database = null, writeOutbox = true } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);

  return enqueueWrite(async () => {
    let result = null;
    await runLedgerExclusiveTransaction(db, async (txn) => {
      const existing = await txn.getFirstAsync(
        `SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? AND idempotency_key=? LIMIT 1`,
        command.header.namespace, command.header.idempotencyKey,
      );
      if (existing?.id) {
        const persisted = await readFinancialTransaction(txn, command.header.namespace, String(existing.id));
        result = { supported: true, ok: true, idempotent: true, transactionId: String(existing.id), persisted };
        return;
      }
      if (Number(command.header.revision || 0) !== 1) {
        result = {
          supported: true, ok: false, reason: 'nonsequential_transaction_revision',
          currentRevision: 0, requestedRevision: Number(command.header.revision || 0),
        };
        return;
      }

      for (const currency of command.currencies || []) await insertCurrency(txn, currency);
      for (const account of command.accounts || [command.account].filter(Boolean)) await upsertAccount(txn, account);
      for (const rate of command.exchangeRates || [command.exchangeRate].filter(Boolean)) {
        await txn.runAsync(
          `INSERT OR IGNORE INTO ledger_exchange_rates_v7
           (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          rate.namespace, rate.id, rate.baseCurrencyCode, rate.quoteCurrencyCode,
          rate.numerator, rate.denominator, rate.rateDate, rate.source, rate.capturedAt,
        );
      }

      const header = command.header;
      await txn.runAsync(
        `INSERT INTO ledger_financial_transactions_v7
         (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
          idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        header.namespace, header.id, header.kind, header.status, header.scope, header.dateISO,
        header.occurredAt, header.categoryId, header.title, header.note, header.sourceType,
        header.sourceId, header.idempotencyKey, header.deviceId, header.revision,
        header.archiveYear, header.archivedAt, header.deletedAt, safeJson(command.originalTransaction),
        header.createdAt, header.updatedAt,
      );

      for (const item of command.postings || [command.posting].filter(Boolean)) {
        await txn.runAsync(
          `INSERT INTO ledger_postings_v7
           (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          item.namespace, item.id, item.transactionId, item.accountId, item.bucket,
          item.role, item.amountMinor, item.currencyCode, item.exchangeRateId, item.createdAt,
        );
      }
      for (const link of command.links || []) {
        await txn.runAsync(
          `INSERT INTO ledger_transaction_links_v7
           (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          link.namespace, link.id, link.transactionId, link.linkType, link.linkId,
          link.relation, link.appliedAmountMinor, link.currencyCode, link.createdAt,
        );
      }
      for (const entity of command.entities || []) {
        const prepared = await prepareLocalEntity(txn, entity);
        Object.assign(entity, prepared);
        await upsertEntity(txn, prepared);
      }

      if (writeOutbox) {
        await insertFinancialTransactionOutbox(txn, command);
      }
      const persisted = await readFinancialTransaction(txn, header.namespace, header.id);
      result = {
        supported: true, ok: true, idempotent: false, transactionId: String(persisted.id),
        committedAt: header.updatedAt, persisted,
      };
    });
    return result || { supported: true, ok: false, reason: 'sqlite_transaction_no_result' };
  });
};

export const commitExpenseLedgerV7Command = (command, options = {}) => commitFinancialLedgerV7Command(command, options);

export const commitFinancialTransactionV7 = async ({
  namespace = 'guest', transaction, wallets = [], baseCurrency = 'IQD', entityChanges = [], database = null,
} = {}) => {
  if (!database && !financialLedgerV7Supported()) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const command = buildFinancialLedgerCommand({ namespace, transaction, wallets, baseCurrency, entityChanges });
  return commitFinancialLedgerV7Command(command, { database });
};

export const replaceFinancialTransactionV7 = async ({
  namespace = 'guest', transaction, wallets = [], baseCurrency = 'IQD', entityChanges = [], database = null,
} = {}) => {
  if (!database && !financialLedgerV7Supported()) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const command = buildFinancialLedgerCommand({ namespace, transaction, wallets, baseCurrency, entityChanges });
  await ensureFinancialLedgerV7(db);
  return enqueueWrite(async () => {
    let result = null;
    await runLedgerExclusiveTransaction(db, async (txn) => {
      const duplicateMutation = await txn.getFirstAsync(
        `SELECT mutation_id FROM ledger_outbox_v2 WHERE mutation_id=? LIMIT 1`, command.mutation.mutationId,
      );
      if (duplicateMutation?.mutation_id) {
        const persisted = await readFinancialTransaction(txn, namespace, transaction.id);
        result = { supported: true, ok: true, idempotent: true, transactionId: persisted.id, persisted };
        return;
      }
      const currentTransaction = await txn.getFirstAsync(
        `SELECT revision FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
        namespace, transaction.id,
      );
      const currentRevision = Math.max(0, Number(currentTransaction?.revision || 0));
      if (currentTransaction && command.header.revision <= currentRevision) {
        result = {
          supported: true,
          ok: false,
          reason: 'stale_transaction_revision',
          currentRevision,
          requestedRevision: command.header.revision,
        };
        return;
      }
      if (command.header.revision !== currentRevision + 1) {
        result = {
          supported: true,
          ok: false,
          reason: 'nonsequential_transaction_revision',
          currentRevision,
          requestedRevision: command.header.revision,
        };
        return;
      }
      for (const currency of command.currencies) await insertCurrency(txn, currency);
      for (const account of command.accounts) await upsertAccount(txn, account);
      await txn.runAsync(`DELETE FROM ledger_transaction_links_v7 WHERE namespace=? AND transaction_id=?`, namespace, transaction.id);
      await txn.runAsync(`DELETE FROM ledger_postings_v7 WHERE namespace=? AND transaction_id=?`, namespace, transaction.id);
      for (const rate of command.exchangeRates) {
        await txn.runAsync(
          `INSERT INTO ledger_exchange_rates_v7
           (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(namespace,id) DO UPDATE SET
             base_currency_code=excluded.base_currency_code,quote_currency_code=excluded.quote_currency_code,
             numerator=excluded.numerator,denominator=excluded.denominator,rate_date=excluded.rate_date,
             source=excluded.source,captured_at=excluded.captured_at`,
          rate.namespace, rate.id, rate.baseCurrencyCode, rate.quoteCurrencyCode,
          rate.numerator, rate.denominator, rate.rateDate, rate.source, rate.capturedAt,
        );
      }
      const header = command.header;
      await txn.runAsync(
        `INSERT INTO ledger_financial_transactions_v7
         (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
          idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(namespace,id) DO UPDATE SET
           kind=excluded.kind,status=excluded.status,scope=excluded.scope,date_iso=excluded.date_iso,
           occurred_at=excluded.occurred_at,category_id=excluded.category_id,title=excluded.title,note=excluded.note,
           source_type=excluded.source_type,source_id=excluded.source_id,idempotency_key=excluded.idempotency_key,
           device_id=excluded.device_id,revision=excluded.revision,archive_year=excluded.archive_year,
           archived_at=excluded.archived_at,deleted_at=excluded.deleted_at,payload_json=excluded.payload_json,
           updated_at=excluded.updated_at
         WHERE excluded.revision >= ledger_financial_transactions_v7.revision`,
        header.namespace, header.id, header.kind, header.status, header.scope, header.dateISO,
        header.occurredAt, header.categoryId, header.title, header.note, header.sourceType,
        header.sourceId, header.idempotencyKey, header.deviceId, header.revision,
        header.archiveYear, header.archivedAt, header.deletedAt, safeJson(command.originalTransaction),
        header.createdAt, header.updatedAt,
      );
      for (const item of command.postings) {
        await txn.runAsync(
          `INSERT INTO ledger_postings_v7
           (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          item.namespace, item.id, item.transactionId, item.accountId, item.bucket,
          item.role, item.amountMinor, item.currencyCode, item.exchangeRateId, item.createdAt,
        );
      }
      for (const link of command.links) {
        await txn.runAsync(
          `INSERT INTO ledger_transaction_links_v7
           (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          link.namespace, link.id, link.transactionId, link.linkType, link.linkId,
          link.relation, link.appliedAmountMinor, link.currencyCode, link.createdAt,
        );
      }
      for (const entity of command.entities) {
        const prepared = await prepareLocalEntity(txn, entity);
        Object.assign(entity, prepared);
        await upsertEntity(txn, prepared);
      }
      await insertFinancialTransactionOutbox(txn, command);
      const persisted = await readFinancialTransaction(txn, namespace, transaction.id);
      result = { supported: true, ok: true, idempotent: false, transactionId: persisted.id, committedAt: header.updatedAt, persisted };
    });
    return result;
  });
};

export const voidFinancialTransactionsV7 = async ({
  namespace = 'guest', transactionIds = [], entityChanges = [], database = null,
} = {}) => {
  if (!database && !financialLedgerV7Supported()) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  const ids = [...new Set((Array.isArray(transactionIds) ? transactionIds : []).filter(Boolean).map(String))];
  if (!ids.length) return { supported: true, ok: true, changed: 0 };
  const now = new Date().toISOString();
  return enqueueWrite(async () => {
    let changed = 0;
    await runLedgerExclusiveTransaction(db, async (txn) => {
      const shadowCommandId = await createShadowCommandIdV2(txn);
      for (const id of ids) {
        const row = await txn.getFirstAsync(
          `SELECT revision,payload_json,deleted_at FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
          namespace, id,
        );
        if (!row || row.deleted_at) continue;
        const revision = Math.max(1, Number(row.revision || 1) + 1);
        const payload = { ...(parseJson(row.payload_json, {}) || {}), status: 'voided', deletedAt: now, revision, updatedAt: now };
        await txn.runAsync(
          `UPDATE ledger_financial_transactions_v7
              SET status='voided',deleted_at=?,revision=?,payload_json=?,updated_at=?
            WHERE namespace=? AND id=? AND deleted_at IS NULL`,
          now, revision, safeJson(payload), now, namespace, id,
        );
        await txn.runAsync(
          `INSERT OR IGNORE INTO ledger_outbox_v2
           (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          namespace, `${namespace}:${id}:void:${revision}`, 'financial_transaction', id, 'void', revision,
          FINANCIAL_LEDGER_SCHEMA_VERSION, safeJson({ transactionId: id, revision, deletedAt: now }), now,
        );
        await insertShadowMutationV2(txn, {
          namespace, commandId: shadowCommandId, entityType: 'financial_transaction', entityId: id,
          operation: 'void', revision, baseRevision: revision - 1,
          payload: { transactionId: id, revision, deletedAt: now }, createdAt: now,
        });
        changed += 1;
      }
      for (const item of Array.isArray(entityChanges) ? entityChanges : []) {
        if (!item?.id || !item?.entityType) continue;
        const entity = await prepareLocalEntity(txn, {
          namespace, entityType: String(item.entityType), id: String(item.id),
          revision: Math.max(1, Number(item.revision || 1)), deletedAt: item.deletedAt || null,
          payload: item.payload ?? null, createdAt: String(item.createdAt || now), updatedAt: String(item.updatedAt || now),
        });
        await upsertEntity(txn, entity);
        await insertEntityOutbox(txn, entity, { commandId: shadowCommandId });
      }
    });
    return { supported: true, ok: true, changed };
  });
};

export const archiveFinancialTransactionsV7 = async ({
  namespace = 'guest', transactionIds = [], year, archivedAt = new Date().toISOString(),
  entityChanges = [], database = null,
} = {}) => {
  if (!database && !financialLedgerV7Supported()) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  const targetYear = Number(year);
  const ids = [...new Set((Array.isArray(transactionIds) ? transactionIds : []).filter(Boolean).map(String))];
  if (!Number.isInteger(targetYear) || !ids.length) return { supported: true, ok: false, reason: 'archive_input_invalid' };
  return enqueueWrite(async () => {
    let changed = 0;
    let releasedAllocations = 0;
    await runLedgerExclusiveTransaction(db, async (txn) => {
      const shadowCommandId = await createShadowCommandIdV2(txn);
      for (const id of ids) {
        const row = await txn.getFirstAsync(
          `SELECT kind,scope,date_iso,occurred_at,revision,payload_json,archived_at
             FROM ledger_financial_transactions_v7
            WHERE namespace=? AND id=? AND deleted_at IS NULL LIMIT 1`,
          namespace, id,
        );
        if (!row) throw new Error(`financial_v7_archive_transaction_missing:${id}`);
        if (row.archived_at) continue;
        const revision = Math.max(1, Number(row.revision || 1) + 1);
        const payload = {
          ...(parseJson(row.payload_json, {}) || {}), archiveYear: targetYear,
          archivedAt, revision, updatedAt: archivedAt,
        };
        await txn.runAsync(
          `UPDATE ledger_financial_transactions_v7
              SET archive_year=?,archived_at=?,revision=?,payload_json=?,updated_at=?
            WHERE namespace=? AND id=? AND deleted_at IS NULL`,
          targetYear, archivedAt, revision, safeJson(payload), archivedAt, namespace, id,
        );
        await txn.runAsync(
          `INSERT OR IGNORE INTO ledger_outbox_v2
           (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          namespace, `${namespace}:${id}:archive:${revision}`, 'financial_transaction', id,
          'upsert', revision, FINANCIAL_LEDGER_SCHEMA_VERSION,
          safeJson({ transactionId: id, archiveYear: targetYear, archivedAt, revision }), archivedAt,
        );
        await insertShadowMutationV2(txn, {
          namespace, commandId: shadowCommandId, entityType: 'financial_transaction', entityId: id,
          operation: 'upsert', revision, baseRevision: revision - 1,
          payload: { transactionId: id, archiveYear: targetYear, archivedAt, revision },
          createdAt: archivedAt,
        });
        const original = parseJson(row.payload_json, {}) || {};
        if ((row.kind === 'goal_allocation' || original.isGoalSaving) && !original.allocationReleased) {
          const releaseId = `v7-archive-release:${id}`;
          const existingRelease = await txn.getFirstAsync(
            `SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
            namespace, releaseId,
          );
          if (!existingRelease?.id) {
            const reservedRows = await txn.getAllAsync(
              `SELECT p.account_id,p.amount_minor,p.currency_code,
                      a.name,a.account_type,a.scope,a.status,a.created_at,a.updated_at,a.archived_at,
                      r.numerator,r.denominator
                 FROM ledger_postings_v7 p
                 JOIN ledger_accounts_v7 a ON a.namespace=p.namespace AND a.id=p.account_id
            LEFT JOIN ledger_exchange_rates_v7 r ON r.namespace=p.namespace AND r.id=p.exchange_rate_id
                WHERE p.namespace=? AND p.transaction_id=? AND p.bucket='reserved' AND p.amount_minor>0
                ORDER BY p.id`,
              namespace, id,
            );
            if (reservedRows.length) {
              const baseCurrency = String(original.baseCurrencyCode || 'IQD').toUpperCase();
              const releaseCommand = buildFinancialLedgerCommand({
                namespace,
                wallets: reservedRows.map(item => ({
                  id: String(item.account_id), name: item.name || '', type: item.account_type || 'other',
                  scope: item.scope || row.scope || 'personal', currency: item.currency_code,
                  status: item.status || 'active', createdAt: item.created_at, updatedAt: item.updated_at,
                  archivedAt: item.archived_at || null,
                })),
                baseCurrency,
                now: archivedAt,
                transaction: {
                  id: releaseId,
                  title: 'Archived goal allocation release',
                  amt: 0,
                  walletAmount: 0,
                  baseAmount: 0,
                  baseAmountMinor: 0,
                  allocationAmount: Math.abs(Number(original.allocationAmount || 0)),
                  allocationBaseAmountMinor: Math.abs(Number(original.allocationBaseAmountMinor || 0)),
                  releaseAllocations: reservedRows.map(item => ({
                    walletId: String(item.account_id),
                    amountMinor: Math.abs(Number(item.amount_minor || 0)),
                    currencyCode: String(item.currency_code),
                    exchangeRate: item.currency_code === baseCurrency
                      ? 1
                      : Number(item.numerator || 0) / Number(item.denominator || 1) || Number(original.exchangeRate || 1),
                  })),
                  baseCurrencyCode: baseCurrency,
                  dateISO: String(original.dateISO || row.date_iso),
                  occurredAt: String(original.occurredAt || row.occurred_at || archivedAt),
                  scope: String(original.scope || row.scope || 'personal'),
                  flowType: 'goal_release',
                  isGoalRelease: true,
                  goalId: original.goalId || null,
                  hiddenFromHistory: true,
                  archiveYear: targetYear,
                  archivedAt,
                  rateDate: original.rateDate || original.dateISO || row.date_iso,
                  rateSource: original.rateSource || 'archive_reserved_release',
                  idempotencyKey: `archive-release:${id}`,
                  createdAt: archivedAt,
                  updatedAt: archivedAt,
                },
              });
              await insertCommandWithoutOutbox(txn, releaseCommand);
              await insertFinancialTransactionOutbox(txn, releaseCommand, { commandId: shadowCommandId });
              releasedAllocations += 1;
            }
          }
        }
        changed += 1;
      }
      for (const item of Array.isArray(entityChanges) ? entityChanges : []) {
        if (!item?.id || !item?.entityType) continue;
        const entity = await prepareLocalEntity(txn, {
          namespace, entityType: String(item.entityType), id: String(item.id),
          revision: Math.max(1, Number(item.revision || 1)), deletedAt: item.deletedAt || null,
          payload: item.payload ?? null, createdAt: String(item.createdAt || archivedAt),
          updatedAt: String(item.updatedAt || archivedAt),
        });
        await upsertEntity(txn, entity);
        await insertEntityOutbox(txn, entity, { commandId: shadowCommandId });
      }
    });
    const row = await db.getFirstAsync(
      `SELECT COUNT(*) AS count FROM ledger_financial_transactions_v7
        WHERE namespace=? AND archive_year=? AND archived_at IS NOT NULL AND deleted_at IS NULL`,
      namespace, targetYear,
    );
    return {
      supported: true, ok: true, changed, releasedAllocations,
      archivedYearCount: Number(row?.count || 0),
    };
  });
};

export const commitExpenseToFinancialLedgerV7 = async ({
  namespace = 'guest', transaction, wallet, baseCurrency = 'IQD', database = null,
} = {}) => {
  if (!database && !financialLedgerV7Supported()) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const command = buildExpenseLedgerCommand({ namespace, transaction, wallet, baseCurrency });
  return commitFinancialLedgerV7Command(command, { database });
};

export const commitEntityChangesV7 = async ({ namespace = 'guest', changes = [], database = null, now = new Date().toISOString() } = {}) => {
  if (!database && !financialLedgerV7Supported()) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  const entities = (Array.isArray(changes) ? changes : []).filter(item => item?.id && item?.entityType).map(item => ({
    namespace: String(namespace), entityType: String(item.entityType), id: String(item.id),
    revision: Math.max(1, Number(item.revision || 1)), deletedAt: item.deletedAt || null,
    payload: canonicalFinancialEntityPayload(String(item.entityType), item.payload ?? null),
    createdAt: String(item.createdAt || now), updatedAt: String(item.updatedAt || now),
  }));
  if (!entities.length) return { supported: true, ok: true, changed: 0 };
  return enqueueWrite(async () => {
    let changed = 0;
    await runLedgerExclusiveTransaction(db, async (txn) => {
      const shadowCommandId = await createShadowCommandIdV2(txn);
      for (const entity of entities) {
        const current = await txn.getFirstAsync(
          `SELECT revision,deleted_at,payload_json FROM ledger_entities_v7
            WHERE namespace=? AND entity_type=? AND id=? LIMIT 1`,
          entity.namespace, entity.entityType, entity.id,
        );
        const currentPayload = parseJson(current?.payload_json, null);
        const sameDeletedState = String(current?.deleted_at || '') === String(entity.deletedAt || '');
        if (current && sameDeletedState && canonicalJson(currentPayload) === canonicalJson(entity.payload)) continue;
        const prepared = await prepareLocalEntity(txn, entity);
        await upsertEntity(txn, prepared);
        await insertEntityOutbox(txn, prepared, { commandId: shadowCommandId });
        changed += 1;
      }
    });
    return { supported: true, ok: true, changed };
  });
};

export const readFinancialWorkspaceV7 = async ({ namespace = 'guest', database = null, includeArchived = true, transactionLimit = null } = {}) => {
  if (!database && !financialLedgerV7Supported()) return null;
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  const safeLimit = Number.isInteger(Number(transactionLimit)) && Number(transactionLimit) > 0
    ? Math.min(10000, Number(transactionLimit))
    : null;
  const txRows = safeLimit
    ? await db.getAllAsync(
        `SELECT id,payload_json,revision FROM ledger_financial_transactions_v7
          WHERE namespace=? AND deleted_at IS NULL ${includeArchived ? '' : 'AND archived_at IS NULL'}
          ORDER BY date_iso DESC,occurred_at DESC,id DESC LIMIT ?`,
        namespace, safeLimit,
      )
    : await db.getAllAsync(
        `SELECT id,payload_json,revision FROM ledger_financial_transactions_v7
          WHERE namespace=? AND deleted_at IS NULL ${includeArchived ? '' : 'AND archived_at IS NULL'}
          ORDER BY date_iso DESC,occurred_at DESC,id DESC`,
        namespace,
      );
  const entityRows = await db.getAllAsync(
    `SELECT entity_type,id,payload_json,deleted_at FROM ledger_entities_v7 WHERE namespace=? ORDER BY entity_type,id`,
    namespace,
  );
  const state = await getFinancialWorkspaceStateV7({ namespace, database: db });
  const entities = { debt: [], goal: [], commitment: [], budget: [], recurring_rule: [], category: [], wallet: [], workspace: [] };
  for (const row of entityRows) {
    if (row.deleted_at) continue;
    const payload = parseJson(row.payload_json, null);
    if (payload) (entities[row.entity_type] || (entities[row.entity_type] = [])).push(payload);
  }
  let transactions = txRows.map(row => {
    const payload = parseJson(row.payload_json, null);
    return payload ? { ...payload, revision: Math.max(1, Number(row.revision || payload.revision || 1)) } : null;
  }).filter(Boolean);
  if (safeLimit && (entities.recurring_rule || []).length) {
    const existingIds = new Set(transactions.map(item => String(item.id)));
    const seedIds = [...new Set((entities.recurring_rule || []).map(item => String(item?.sourceTransactionId || '')).filter(Boolean))]
      .filter(id => !existingIds.has(id));
    for (const id of seedIds) {
      const row = await db.getFirstAsync(
        `SELECT payload_json,revision FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? AND deleted_at IS NULL LIMIT 1`,
        namespace, id,
      );
      if (!row) continue;
      const payload = parseJson(row.payload_json, null);
      if (payload) transactions.push({ ...payload, revision: Math.max(1, Number(row.revision || payload.revision || 1)) });
    }
  }
  return {
    trans: transactions,
    debts: entities.debt || [], goals: entities.goal || [], commitments: entities.commitment || [],
    budgets: entities.budget || [], recurringRules: entities.recurring_rule || [], cats: entities.category || [], wallets: entities.wallet || [],
    workspace: entities.workspace?.[0] || parseJson(state?.payload_json, {}),
    sourceMode: state?.source_mode || 'shadow',
    transactionCacheBounded: !!safeLimit,
    transactionCacheLimit: safeLimit,
  };
};

export const readFinancialProjectionV7 = async ({ namespace = 'guest', database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  const [transactionRows, entityRows, postingRows, linkRows, accountRows, rateRows] = await Promise.all([
    db.getAllAsync(
      `SELECT id,revision,payload_json,archive_year,archived_at,deleted_at FROM ledger_financial_transactions_v7 WHERE namespace=? ORDER BY id`,
      namespace,
    ),
    db.getAllAsync(
      `SELECT entity_type,id,revision,deleted_at,payload_json FROM ledger_entities_v7 WHERE namespace=? ORDER BY entity_type,id`,
      namespace,
    ),
    db.getAllAsync(
      `SELECT id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id FROM ledger_postings_v7 WHERE namespace=? ORDER BY transaction_id,id`,
      namespace,
    ),
    db.getAllAsync(
      `SELECT id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code
         FROM ledger_transaction_links_v7 WHERE namespace=? ORDER BY transaction_id,id`,
      namespace,
    ),
    db.getAllAsync(
      `SELECT id,account_type,scope,currency_code,status FROM ledger_accounts_v7 WHERE namespace=? ORDER BY id`,
      namespace,
    ),
    db.getAllAsync(
      `SELECT id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source
         FROM ledger_exchange_rates_v7 WHERE namespace=? ORDER BY id`,
      namespace,
    ),
  ]);
  return {
    transactions: transactionRows.map(row => ({
      id: String(row.id), revision: Math.max(1, Number(row.revision || 1)),
      payload: parseJson(row.payload_json, null), archiveYear: row.archive_year,
      archivedAt: row.archived_at, deletedAt: row.deleted_at,
    })),
    entities: entityRows.map(row => ({
      entityType: String(row.entity_type), id: String(row.id), revision: Number(row.revision),
      deletedAt: row.deleted_at, payload: parseJson(row.payload_json, null),
    })),
    postings: postingRows.map(row => ({
      id: String(row.id), transactionId: String(row.transaction_id), accountId: String(row.account_id), bucket: String(row.bucket),
      role: String(row.role), amountMinor: Number(row.amount_minor), currencyCode: String(row.currency_code),
      exchangeRateId: row.exchange_rate_id || null,
    })),
    links: linkRows.map(row => ({
      id: String(row.id), transactionId: String(row.transaction_id), linkType: String(row.link_type), linkId: String(row.link_id),
      relation: String(row.relation), appliedAmountMinor: Number(row.applied_amount_minor || 0),
      currencyCode: row.currency_code || null,
    })),
    accounts: accountRows.map(row => ({
      id: String(row.id), accountType: String(row.account_type), scope: String(row.scope),
      currencyCode: String(row.currency_code), status: String(row.status),
    })),
    exchangeRates: rateRows.map(row => ({
      id: String(row.id), baseCurrencyCode: String(row.base_currency_code),
      quoteCurrencyCode: String(row.quote_currency_code), numerator: Number(row.numerator),
      denominator: Number(row.denominator), rateDate: String(row.rate_date), source: String(row.source),
    })),
  };
};


export const proveFinancialLedgerInvariantsV7 = async ({ namespace = 'guest', database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, level: 'BLOCKING', issues: [{ code: 'sqlite_unavailable' }], walletBalances: [] };
  await ensureFinancialLedgerV7(db);
  const namespaceValue = String(namespace || 'guest');
  const issues = [];

  const quickRow = await db.getFirstAsync('PRAGMA quick_check');
  const quickCheck = quickRow ? String(Object.values(quickRow)[0] || '').toLowerCase() : '';
  if (quickCheck !== 'ok') issues.push({ code: 'sqlite_quick_check_failed' });

  const foreignKeyRows = await db.getAllAsync('PRAGMA foreign_key_check');
  if ((foreignKeyRows || []).length) issues.push({ code: 'foreign_key_violation', count: foreignKeyRows.length });

  const missingPostings = await db.getFirstAsync(
    `SELECT COUNT(*) AS n
       FROM ledger_financial_transactions_v7 tx
      WHERE tx.namespace=? AND tx.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ledger_postings_v7 p
           WHERE p.namespace=tx.namespace AND p.transaction_id=tx.id
        )`,
    namespaceValue,
  );
  if (Number(missingPostings?.n || 0)) issues.push({ code: 'transactions_without_postings', count: Number(missingPostings.n) });

  const invalidRevisions = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7
      WHERE namespace=? AND revision<1`,
    namespaceValue,
  );
  if (Number(invalidRevisions?.n || 0)) issues.push({ code: 'invalid_transaction_revision', count: Number(invalidRevisions.n) });

  const invalidTransfers = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM (
       SELECT tx.id,
              SUM(CASE WHEN p.role='transfer_source' AND p.amount_minor<0 THEN 1 ELSE 0 END) AS sources,
              SUM(CASE WHEN p.role='transfer_destination' AND p.amount_minor>0 THEN 1 ELSE 0 END) AS destinations
         FROM ledger_financial_transactions_v7 tx
         LEFT JOIN ledger_postings_v7 p
           ON p.namespace=tx.namespace AND p.transaction_id=tx.id
        WHERE tx.namespace=? AND tx.deleted_at IS NULL AND tx.kind='transfer'
        GROUP BY tx.id
       HAVING sources<>1 OR destinations<>1
     )`,
    namespaceValue,
  );
  if (Number(invalidTransfers?.n || 0)) issues.push({ code: 'invalid_transfer_legs', count: Number(invalidTransfers.n) });

  const unresolvedFx = await db.getFirstAsync(
    `SELECT COUNT(*) AS n
       FROM ledger_postings_v7 p
       JOIN ledger_financial_transactions_v7 tx
         ON tx.namespace=p.namespace AND tx.id=p.transaction_id
      WHERE p.namespace=? AND tx.deleted_at IS NULL
        AND UPPER(p.currency_code)<>UPPER(COALESCE(json_extract(tx.payload_json,'$.baseCurrencyCode'),p.currency_code))
        AND p.exchange_rate_id IS NULL`,
    namespaceValue,
  );
  if (Number(unresolvedFx?.n || 0)) issues.push({ code: 'UNRESOLVED_FX', count: Number(unresolvedFx.n) });

  const duplicateOpeningRows = await db.getAllAsync(
    `SELECT p.account_id,COUNT(*) AS n
       FROM ledger_postings_v7 p
       JOIN ledger_financial_transactions_v7 tx
         ON tx.namespace=p.namespace AND tx.id=p.transaction_id
      WHERE p.namespace=? AND tx.deleted_at IS NULL AND tx.kind='opening_balance'
      GROUP BY p.account_id
     HAVING COUNT(*)>1`,
    namespaceValue,
  );
  if ((duplicateOpeningRows || []).length) {
    issues.push({
      code: 'duplicate_opening_balance',
      accounts: duplicateOpeningRows.map(row => ({ accountId: String(row.account_id), count: Number(row.n || 0) })),
    });
  }

  const walletBalances = await db.getAllAsync(
    `SELECT a.id AS account_id,a.currency_code,COALESCE(SUM(
              CASE WHEN tx.deleted_at IS NULL THEN p.amount_minor ELSE 0 END
            ),0) AS balance_minor
       FROM ledger_accounts_v7 a
       LEFT JOIN ledger_postings_v7 p
         ON p.namespace=a.namespace AND p.account_id=a.id
       LEFT JOIN ledger_financial_transactions_v7 tx
         ON tx.namespace=p.namespace AND tx.id=p.transaction_id
      WHERE a.namespace=?
      GROUP BY a.id,a.currency_code
      ORDER BY a.id`,
    namespaceValue,
  );

  return {
    supported: true,
    ok: issues.length === 0,
    level: issues.length ? 'BLOCKING' : 'HEALTHY',
    quickCheck,
    issues,
    walletBalances: (walletBalances || []).map(row => ({
      accountId: String(row.account_id),
      currencyCode: String(row.currency_code),
      balanceMinor: Number(row.balance_minor || 0),
    })),
  };
};

export const getFinancialWorkspaceStateV7 = async ({ namespace = 'guest', database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return null;
  await ensureFinancialLedgerV7(db);
  return db.getFirstAsync(`SELECT * FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1`, namespace);
};

export const setFinancialWorkspaceStateV7 = async ({ namespace = 'guest', sourceMode = 'shadow', checksum = null, verifiedAt = null, cutoverAt = null, reconciledAt = null, payload = {}, database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return false;
  await ensureFinancialLedgerV7(db);
  const now = new Date().toISOString();
  await enqueueWrite(() => db.runAsync(
    `INSERT INTO ledger_workspace_state_v7
     (namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(namespace) DO UPDATE SET
       source_mode=excluded.source_mode,schema_version=excluded.schema_version,shadow_checksum=excluded.shadow_checksum,
       shadow_verified_at=excluded.shadow_verified_at,cutover_at=COALESCE(excluded.cutover_at,ledger_workspace_state_v7.cutover_at),
       last_reconciled_at=excluded.last_reconciled_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,
    namespace, sourceMode, FINANCIAL_LEDGER_SCHEMA_VERSION, checksum, verifiedAt, cutoverAt,
    reconciledAt, safeJson(payload), now,
  ));
  return true;
};

export const readPendingLedgerMutationsV7 = async ({ namespace = 'guest', limit = 100, database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return [];
  await ensureFinancialLedgerV7(db);
  const rows = await db.getAllAsync(
    `SELECT * FROM ledger_outbox_v2
      WHERE namespace=? AND acknowledged_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY sequence_id LIMIT ?`,
    namespace, new Date().toISOString(), Math.max(1, Math.min(500, Number(limit) || 100)),
  );
  return rows.map(row => ({ ...row, payload: parseJson(row.payload_json, null) }));
};

export const acknowledgeLedgerMutationsV7 = async ({ mutationIds = [], database = null } = {}) => {
  const ids = [...new Set((Array.isArray(mutationIds) ? mutationIds : []).filter(Boolean).map(String))];
  if (!ids.length) return 0;
  const db = database || await getLedgerDb();
  if (!db) return 0;
  await ensureFinancialLedgerV7(db);
  const now = new Date().toISOString();
  let changed = 0;
  await enqueueWrite(() => runLedgerExclusiveTransaction(db, async (txn) => {
    for (const id of ids) {
      const result = await txn.runAsync(
        `UPDATE ledger_outbox_v2 SET acknowledged_at=?,last_error=NULL WHERE mutation_id=? AND acknowledged_at IS NULL`,
        now, id,
      );
      changed += Number(result?.changes || 0);
    }
  }));
  return changed;
};

export const failLedgerMutationV7 = async ({ mutationId, error, database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db || !mutationId) return false;
  await ensureFinancialLedgerV7(db);
  const retryAt = new Date(Date.now() + 60_000).toISOString();
  await enqueueWrite(() => db.runAsync(
    `UPDATE ledger_outbox_v2 SET attempts=attempts+1,next_attempt_at=?,last_error=? WHERE mutation_id=?`,
    retryAt, String(error || 'sync_failed').slice(0, 500), String(mutationId),
  ));
  return true;
};

export const getLedgerSyncCursorV7 = async ({ namespace = 'guest', database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return 0;
  await ensureFinancialLedgerV7(db);
  const row = await db.getFirstAsync(
    `SELECT last_server_sequence FROM ledger_sync_state_v7 WHERE namespace=? LIMIT 1`, namespace,
  );
  return Math.max(0, Number(row?.last_server_sequence || 0));
};

const canonicalSyncValue = value => {
  const visit = item => {
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== 'object') return item;
    return Object.keys(item).sort().reduce((result, key) => {
      if (item[key] !== undefined) result[key] = visit(item[key]);
      return result;
    }, {});
  };
  return JSON.stringify(visit(value));
};

const canonicalSyncTransactionValue = value => {
  const {
    updatedAt, revision, idempotencyKey, sqliteCommittedAt, storageEngineVersion,
    ...financialValue
  } = value || {};
  return canonicalSyncValue(financialValue);
};

const remoteRevisionConflict = (entityType, entityId, revision) => (
  new Error('financial_mutation_revision_conflict:' + String(entityType) + ':' + String(entityId) + ':' + Number(revision))
);

const remoteTargetMissing = (entityType, entityId) => (
  new Error('financial_mutation_target_missing:' + String(entityType) + ':' + String(entityId))
);

export const applyRemoteLedgerMutationsV7 = async ({
  namespace = 'guest', mutations = [], deviceId = '', database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  const rows = (Array.isArray(mutations) ? mutations : []).map(item => ({
    mutationId: String(item.mutation_id || item.mutationId || ''),
    serverSequence: Number(item.server_sequence || item.serverSequence || 0),
    entityType: String(item.entity_type || item.entityType || ''),
    entityId: String(item.entity_id || item.entityId || ''),
    operation: String(item.operation || 'upsert'),
    entityRevision: Math.max(1, Number(item.entity_revision || item.entityRevision || 1)),
    payload: item.payload || parseJson(item.payload_json, null),
  })).filter(item => item.mutationId && item.serverSequence > 0).sort((a, b) => a.serverSequence - b.serverSequence);
  if (!rows.length) return { supported: true, ok: true, applied: 0, cursor: await getLedgerSyncCursorV7({ namespace, database: db }) };
  return enqueueWrite(async () => {
    let applied = 0;
    let cursor = await getLedgerSyncCursorV7({ namespace, database: db });
    await runLedgerExclusiveTransaction(db, async (txn) => {
      for (const row of rows) {
        const received = await txn.getFirstAsync(`SELECT mutation_id FROM ledger_inbox_v2 WHERE mutation_id=? LIMIT 1`, row.mutationId);
        if (received?.mutation_id) {
          cursor = Math.max(cursor, row.serverSequence);
          continue;
        }
        if (row.entityType === 'financial_transaction') {
          const commandPayload = row.payload || {};
          if (row.operation === 'void' || row.operation === 'delete') {
            const existing = await txn.getFirstAsync(
              `SELECT revision,payload_json,status,deleted_at
                 FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
              namespace, row.entityId,
            );
            if (!existing) throw remoteTargetMissing('financial_transaction', row.entityId);
            const currentRevision = Number(existing.revision || 0);
            if (row.entityRevision < currentRevision) {
              // Stale remote history is observed and cursor-acknowledged, never applied.
            } else if (row.entityRevision === currentRevision) {
              const alreadyVoided = String(existing.status || '') === 'voided' || !!existing.deleted_at;
              if (!alreadyVoided) throw remoteRevisionConflict('financial_transaction', row.entityId, row.entityRevision);
            } else {
              const deletedAt = commandPayload.deletedAt || new Date().toISOString();
              await txn.runAsync(
                `UPDATE ledger_financial_transactions_v7
                    SET status='voided',deleted_at=?,revision=?,payload_json=?,updated_at=?
                  WHERE namespace=? AND id=?`,
                deletedAt, row.entityRevision,
                safeJson({ ...(parseJson(existing.payload_json, {}) || {}), status: 'voided', deletedAt, revision: row.entityRevision }),
                deletedAt, namespace, row.entityId,
              );
              applied += 1;
            }
          } else if (commandPayload.archiveYear && commandPayload.transactionId) {
            const existing = await txn.getFirstAsync(
              `SELECT revision,payload_json,archive_year,archived_at
                 FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
              namespace, row.entityId,
            );
            if (!existing) throw remoteTargetMissing('financial_transaction', row.entityId);
            const currentRevision = Number(existing.revision || 0);
            if (row.entityRevision < currentRevision) {
              // Stale archive mutation: no-op.
            } else if (row.entityRevision === currentRevision) {
              const sameArchive = Number(existing.archive_year || 0) === Number(commandPayload.archiveYear || 0)
                && !!existing.archived_at;
              if (!sameArchive) throw remoteRevisionConflict('financial_transaction', row.entityId, row.entityRevision);
            } else {
              const archivedAt = commandPayload.archivedAt || new Date().toISOString();
              await txn.runAsync(
                `UPDATE ledger_financial_transactions_v7
                    SET archive_year=?,archived_at=?,revision=?,payload_json=?,updated_at=?
                  WHERE namespace=? AND id=?`,
                Number(commandPayload.archiveYear), archivedAt, row.entityRevision,
                safeJson({
                  ...(parseJson(existing.payload_json, {}) || {}),
                  archiveYear: Number(commandPayload.archiveYear), archivedAt, revision: row.entityRevision,
                }),
                archivedAt, namespace, row.entityId,
              );
              applied += 1;
            }
          } else if (commandPayload.transaction && commandPayload.originalTransaction) {
            const header = { ...commandPayload.transaction, namespace, revision: row.entityRevision };
            const current = await txn.getFirstAsync(
              `SELECT revision,payload_json,status,archive_year,archived_at,deleted_at
                 FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
              namespace, row.entityId,
            );
            const currentRevision = Number(current?.revision || 0);
            let applyTransaction = !current || row.entityRevision > currentRevision;
            if (current && row.entityRevision === currentRevision) {
              const sameFinancialValue = canonicalSyncTransactionValue(parseJson(current.payload_json, null))
                === canonicalSyncTransactionValue(commandPayload.originalTransaction);
              const sameStatus = String(current.status || 'posted') === String(header.status || 'posted');
              const sameArchiveYear = Number(current.archive_year || 0) === Number(header.archiveYear || 0);
              const sameDeletedState = String(current.deleted_at || '') === String(header.deletedAt || '');
              if (!(sameFinancialValue && sameStatus && sameArchiveYear && sameDeletedState)) {
                throw remoteRevisionConflict('financial_transaction', row.entityId, row.entityRevision);
              }
              for (const sourceEntity of commandPayload.entities || []) {
                const localEntity = await txn.getFirstAsync(
                  `SELECT revision,deleted_at,payload_json FROM ledger_entities_v7
                    WHERE namespace=? AND entity_type=? AND id=? LIMIT 1`,
                  namespace, String(sourceEntity.entityType || ''), String(sourceEntity.id || ''),
                );
                const incomingEntityRevision = Math.max(1, Number(sourceEntity.revision || 1));
                const sameEntity = localEntity
                  && Number(localEntity.revision || 0) === incomingEntityRevision
                  && String(localEntity.deleted_at || '') === String(sourceEntity.deletedAt || '')
                  && canonicalSyncValue(parseJson(localEntity.payload_json, null)) === canonicalSyncValue(sourceEntity.payload ?? null);
                if (!sameEntity) {
                  throw remoteRevisionConflict(
                    String(sourceEntity.entityType || 'entity'),
                    String(sourceEntity.id || ''),
                    incomingEntityRevision,
                  );
                }
              }
              applyTransaction = false;
            }
            if (current && row.entityRevision < currentRevision) applyTransaction = false;
            if (applyTransaction) {
              for (const currency of commandPayload.currencies || []) await insertCurrency(txn, currency);
              for (const sourceAccount of commandPayload.accounts || []) {
                await upsertAccount(txn, { ...sourceAccount, namespace });
              }
              await txn.runAsync(`DELETE FROM ledger_transaction_links_v7 WHERE namespace=? AND transaction_id=?`, namespace, row.entityId);
              await txn.runAsync(`DELETE FROM ledger_postings_v7 WHERE namespace=? AND transaction_id=?`, namespace, row.entityId);
              for (const sourceRate of commandPayload.exchangeRates || []) {
                const rate = { ...sourceRate, namespace };
                await txn.runAsync(
                  `INSERT INTO ledger_exchange_rates_v7
                   (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
                   VALUES (?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(namespace,id) DO UPDATE SET
                     numerator=excluded.numerator,denominator=excluded.denominator,rate_date=excluded.rate_date,
                     source=excluded.source,captured_at=excluded.captured_at`,
                  namespace, rate.id, rate.baseCurrencyCode, rate.quoteCurrencyCode,
                  rate.numerator, rate.denominator, rate.rateDate, rate.source, rate.capturedAt,
                );
              }
              await txn.runAsync(
                `INSERT INTO ledger_financial_transactions_v7
                 (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
                  idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(namespace,id) DO UPDATE SET
                   kind=excluded.kind,status=excluded.status,scope=excluded.scope,date_iso=excluded.date_iso,
                   occurred_at=excluded.occurred_at,category_id=excluded.category_id,title=excluded.title,note=excluded.note,
                   source_type=excluded.source_type,source_id=excluded.source_id,idempotency_key=excluded.idempotency_key,
                   device_id=excluded.device_id,revision=excluded.revision,archive_year=excluded.archive_year,
                   archived_at=excluded.archived_at,deleted_at=excluded.deleted_at,payload_json=excluded.payload_json,
                   updated_at=excluded.updated_at`,
                namespace, header.id, header.kind, header.status || 'posted', header.scope || 'personal', header.dateISO,
                header.occurredAt, header.categoryId, header.title, header.note, header.sourceType,
                header.sourceId, header.idempotencyKey || row.mutationId, header.deviceId || deviceId || 'remote-device',
                row.entityRevision, header.archiveYear, header.archivedAt, header.deletedAt,
                safeJson({ ...commandPayload.originalTransaction, revision: row.entityRevision }),
                header.createdAt || new Date().toISOString(), header.updatedAt || new Date().toISOString(),
              );
              for (const sourcePosting of commandPayload.postings || []) {
                const item = { ...sourcePosting, namespace };
                await txn.runAsync(
                  `INSERT INTO ledger_postings_v7
                   (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)`,
                  namespace, item.id, item.transactionId, item.accountId, item.bucket,
                  item.role, item.amountMinor, item.currencyCode, item.exchangeRateId, item.createdAt,
                );
              }
              for (const sourceLink of commandPayload.links || []) {
                const link = { ...sourceLink, namespace };
                await txn.runAsync(
                  `INSERT INTO ledger_transaction_links_v7
                   (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)`,
                  namespace, link.id, link.transactionId, link.linkType, link.linkId,
                  link.relation, link.appliedAmountMinor, link.currencyCode, link.createdAt,
                );
              }
              for (const sourceEntity of commandPayload.entities || []) {
                await upsertEntity(txn, { ...sourceEntity, namespace });
              }
              applied += 1;
            }
          }
        } else {
          const sourceEntity = row.payload?.entityType ? row.payload : {
            entityType: row.entityType, id: row.entityId, revision: row.entityRevision,
            deletedAt: row.operation === 'delete' ? new Date().toISOString() : null,
            payload: row.payload?.payload ?? row.payload,
            createdAt: row.payload?.createdAt || new Date().toISOString(),
            updatedAt: row.payload?.updatedAt || new Date().toISOString(),
          };
          const currentEntity = await txn.getFirstAsync(
            `SELECT revision,deleted_at,payload_json FROM ledger_entities_v7
              WHERE namespace=? AND entity_type=? AND id=? LIMIT 1`,
            namespace, row.entityType, row.entityId,
          );
          const currentRevision = Number(currentEntity?.revision || 0);
          if (currentEntity && row.entityRevision === currentRevision) {
            const sameEntity = String(currentEntity.deleted_at || '') === String(sourceEntity.deletedAt || '')
              && canonicalSyncValue(parseJson(currentEntity.payload_json, null))
                === canonicalSyncValue(sourceEntity.payload ?? null);
            if (!sameEntity) throw remoteRevisionConflict(row.entityType, row.entityId, row.entityRevision);
          } else if (!currentEntity || row.entityRevision > currentRevision) {
            await upsertEntity(txn, {
              ...sourceEntity, namespace, entityType: row.entityType, id: row.entityId,
              revision: row.entityRevision,
            });
            applied += 1;
          }
        }
        await txn.runAsync(
          `INSERT OR IGNORE INTO ledger_inbox_v2(mutation_id,namespace,server_sequence,received_at) VALUES (?,?,?,?)`,
          row.mutationId, namespace, row.serverSequence, new Date().toISOString(),
        );
        cursor = Math.max(cursor, row.serverSequence);
      }
      const now = new Date().toISOString();
      await txn.runAsync(
        `INSERT INTO ledger_sync_state_v7(namespace,last_server_sequence,last_success_at,last_device_id,updated_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(namespace) DO UPDATE SET
           last_server_sequence=MAX(ledger_sync_state_v7.last_server_sequence,excluded.last_server_sequence),
           last_success_at=excluded.last_success_at,last_device_id=excluded.last_device_id,updated_at=excluded.updated_at`,
        namespace, cursor, now, String(deviceId || ''), now,
      );
    });
    return { supported: true, ok: true, applied, cursor };
  });
};

const clearFinancialNamespaceRows = async (db, namespace) => {
  await db.runAsync(`DELETE FROM ledger_transaction_links_v7 WHERE namespace=?`, namespace);
  await db.runAsync(`DELETE FROM ledger_postings_v7 WHERE namespace=?`, namespace);
  await db.runAsync(`DELETE FROM ledger_financial_transactions_v7 WHERE namespace=?`, namespace);
  await db.runAsync(`DELETE FROM ledger_exchange_rates_v7 WHERE namespace=?`, namespace);
  await db.runAsync(`DELETE FROM ledger_accounts_v7 WHERE namespace=?`, namespace);
  await db.runAsync(`DELETE FROM ledger_entities_v7 WHERE namespace=?`, namespace);
  await db.runAsync(`DELETE FROM ledger_workspace_state_v7 WHERE namespace=?`, namespace);
};

export const clearFinancialWorkspaceV7 = async ({ namespace = 'guest', database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return true;
  await ensureFinancialLedgerV7(db);
  const target = String(namespace || '').trim();
  if (!target) return false;
  await enqueueWrite(() => runLedgerExclusiveTransaction(db, async (txn) => {
    await clearFinancialNamespaceRows(txn, target);
    await txn.runAsync(`DELETE FROM ledger_outbox_v2 WHERE namespace=?`, target);
    await txn.runAsync(`DELETE FROM ledger_inbox_v2 WHERE namespace=?`, target);
    await txn.runAsync(`DELETE FROM ledger_sync_state_v7 WHERE namespace=?`, target);
    await txn.runAsync(`DELETE FROM ledger_migration_audits_v7 WHERE namespace=?`, target);
  }));
  return true;
};

async function insertCommandWithoutOutbox(db, command) {
  for (const currency of command.currencies || []) await insertCurrency(db, currency);
  for (const account of command.accounts || []) await upsertAccount(db, account);
  for (const rate of command.exchangeRates || []) {
    await db.runAsync(
      `INSERT INTO ledger_exchange_rates_v7
       (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      rate.namespace, rate.id, rate.baseCurrencyCode, rate.quoteCurrencyCode,
      rate.numerator, rate.denominator, rate.rateDate, rate.source, rate.capturedAt,
    );
  }
  const header = command.header;
  await db.runAsync(
    `INSERT INTO ledger_financial_transactions_v7
     (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
      idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    header.namespace, header.id, header.kind, header.status, header.scope, header.dateISO,
    header.occurredAt, header.categoryId, header.title, header.note, header.sourceType,
    header.sourceId, header.idempotencyKey, header.deviceId, header.revision,
    header.archiveYear, header.archivedAt, header.deletedAt, safeJson(command.originalTransaction),
    header.createdAt, header.updatedAt,
  );
  for (const item of command.postings || []) {
    await db.runAsync(
      `INSERT INTO ledger_postings_v7
       (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      item.namespace, item.id, item.transactionId, item.accountId, item.bucket,
      item.role, item.amountMinor, item.currencyCode, item.exchangeRateId, item.createdAt,
    );
  }
  for (const link of command.links || []) {
    await db.runAsync(
      `INSERT INTO ledger_transaction_links_v7
       (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      link.namespace, link.id, link.transactionId, link.linkType, link.linkId,
      link.relation, link.appliedAmountMinor, link.currencyCode, link.createdAt,
    );
  }
}

export const stageFinancialWorkspaceV7 = async ({ stageNamespace, commands = [], entities = [], workspacePayload = {}, database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  const namespace = String(stageNamespace || '').trim();
  if (!namespace.includes('::shadow-stage::')) throw new Error('financial_v7_shadow_stage_namespace_invalid');
  return enqueueWrite(async () => {
    await runLedgerExclusiveTransaction(db, async (txn) => {
      await clearFinancialNamespaceRows(txn, namespace);
      for (const command of commands) await insertCommandWithoutOutbox(txn, command);
      for (const entity of entities) await upsertEntity(txn, entity);
      const now = new Date().toISOString();
      await txn.runAsync(
        `INSERT INTO ledger_workspace_state_v7
         (namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`,
        namespace, 'shadow', FINANCIAL_LEDGER_SCHEMA_VERSION, safeJson(workspacePayload), now,
      );
    });
    return { supported: true, ok: true, namespace, transactions: commands.length, entities: entities.length };
  });
};

export const discardFinancialWorkspaceStageV7 = async ({ stageNamespace, database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return false;
  const namespace = String(stageNamespace || '').trim();
  if (!namespace.includes('::shadow-stage::')) return false;
  await ensureFinancialLedgerV7(db);
  await enqueueWrite(() => runLedgerExclusiveTransaction(db, (txn) => clearFinancialNamespaceRows(txn, namespace)));
  return true;
};

export const promoteFinancialWorkspaceStageV7 = async ({
  namespace, stageNamespace, checksum, sourceCounts = {}, targetCounts = {}, differences = [],
  workspacePayload = {}, resetPendingOutbox = false, database = null,
} = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  const target = String(namespace || '').trim();
  const stage = String(stageNamespace || '').trim();
  if (!target || !stage.includes('::shadow-stage::') || !stage.startsWith(`${target}::shadow-stage::`)) {
    throw new Error('financial_v7_shadow_promotion_namespace_invalid');
  }
  if (differences.length) return { supported: true, ok: false, reason: 'shadow_parity_failed' };
  return enqueueWrite(async () => {
    const now = new Date().toISOString();
    const runId = `${target}:${Date.now()}`;
    await runLedgerExclusiveTransaction(db, async (txn) => {
      if (resetPendingOutbox) {
        await txn.runAsync(`DELETE FROM ledger_outbox_v2 WHERE namespace=? AND acknowledged_at IS NULL`, target);
      }
      await clearFinancialNamespaceRows(txn, target);
      await txn.runAsync(
        `INSERT INTO ledger_accounts_v7
         (namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
         SELECT ?,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at
           FROM ledger_accounts_v7 WHERE namespace=?`, target, stage,
      );
      await txn.runAsync(
        `INSERT INTO ledger_exchange_rates_v7
         (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
         SELECT ?,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at
           FROM ledger_exchange_rates_v7 WHERE namespace=?`, target, stage,
      );
      await txn.runAsync(
        `INSERT INTO ledger_financial_transactions_v7
         (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
          idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
         SELECT ?,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
                idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at
           FROM ledger_financial_transactions_v7 WHERE namespace=?`, target, stage,
      );
      await txn.runAsync(
        `INSERT INTO ledger_postings_v7
         (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
         SELECT ?,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at
           FROM ledger_postings_v7 WHERE namespace=?`, target, stage,
      );
      await txn.runAsync(
        `INSERT INTO ledger_transaction_links_v7
         (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
         SELECT ?,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at
           FROM ledger_transaction_links_v7 WHERE namespace=?`, target, stage,
      );
      await txn.runAsync(
        `INSERT INTO ledger_entities_v7
         (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
         SELECT ?,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at
           FROM ledger_entities_v7 WHERE namespace=?`, target, stage,
      );
      await txn.runAsync(
        `INSERT INTO ledger_workspace_state_v7
         (namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        target, 'sqlite', FINANCIAL_LEDGER_SCHEMA_VERSION, checksum, now, now, now, safeJson(workspacePayload), now,
      );
      await txn.runAsync(
        `INSERT INTO ledger_migration_audits_v7
         (namespace,run_id,source_checksum,target_checksum,source_counts_json,target_counts_json,differences_json,exact_match,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        target, runId, checksum, checksum, safeJson(sourceCounts), safeJson(targetCounts), '[]', 1, now,
      );
      await clearFinancialNamespaceRows(txn, stage);
    });
    return { supported: true, ok: true, cutoverAt: now, checksum, sourceMode: 'sqlite' };
  });
};

export const cloneFinancialWorkspaceV7 = async ({ sourceNamespace, targetNamespace, database = null } = {}) => {
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  const source = String(sourceNamespace || '').trim();
  const target = String(targetNamespace || '').trim();
  if (!source || !target || source === target) return { supported: true, ok: false, reason: 'clone_namespace_invalid' };
  const sourceState = await db.getFirstAsync(`SELECT * FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1`, source);
  if (!sourceState) return { supported: true, ok: false, reason: 'clone_source_missing' };
  return enqueueWrite(async () => {
    await runLedgerExclusiveTransaction(db, async (txn) => {
      await clearFinancialNamespaceRows(txn, target);
      await txn.runAsync(
        `INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
         SELECT ?,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at FROM ledger_accounts_v7 WHERE namespace=?`,
        target, source,
      );
      await txn.runAsync(
        `INSERT INTO ledger_exchange_rates_v7(namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
         SELECT ?,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at FROM ledger_exchange_rates_v7 WHERE namespace=?`,
        target, source,
      );
      await txn.runAsync(
        `INSERT INTO ledger_financial_transactions_v7
         (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,
          revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
         SELECT ?,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,
                revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at
           FROM ledger_financial_transactions_v7 WHERE namespace=?`, target, source,
      );
      await txn.runAsync(
        `INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
         SELECT ?,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at FROM ledger_postings_v7 WHERE namespace=?`,
        target, source,
      );
      await txn.runAsync(
        `INSERT INTO ledger_transaction_links_v7(namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
         SELECT ?,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at FROM ledger_transaction_links_v7 WHERE namespace=?`,
        target, source,
      );
      await txn.runAsync(
        `INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
         SELECT ?,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at FROM ledger_entities_v7 WHERE namespace=?`,
        target, source,
      );
      const now = new Date().toISOString();
      await txn.runAsync(
        `INSERT INTO ledger_workspace_state_v7
         (namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        target, 'sqlite', Number(sourceState.schema_version || FINANCIAL_LEDGER_SCHEMA_VERSION),
        sourceState.shadow_checksum, sourceState.shadow_verified_at, now, now, sourceState.payload_json || '{}', now,
      );
    });
    return { supported: true, ok: true, sourceNamespace: source, targetNamespace: target };
  });
};

const canonicalJson = value => {
  const visit = item => {
    if (Array.isArray(item)) return item.map(visit);
    if (!item || typeof item !== 'object') return item;
    return Object.keys(item).sort().reduce((result, key) => {
      if (item[key] !== undefined) result[key] = visit(item[key]);
      return result;
    }, {});
  };
  return JSON.stringify(visit(value));
};

const canonicalTransactionJson = value => {
  const {
    updatedAt, revision, idempotencyKey, sqliteCommittedAt, storageEngineVersion,
    ...financialValue
  } = value || {};
  return canonicalJson(financialValue);
};

export const reconcileFinancialWorkspaceV7 = async ({
  namespace = 'guest', workspace = {}, database = null,
} = {}) => {
  if (!database && !financialLedgerV7Supported()) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  const state = await getFinancialWorkspaceStateV7({ namespace, database });
  if (state?.source_mode !== 'sqlite') return { supported: true, ok: true, skipped: true, reason: 'cutover_not_active' };
  const projection = await readFinancialProjectionV7({ namespace, database });
  const persistedTransactions = new Map((projection?.transactions || []).map(item => [item.id, item]));
  const desiredTransactions = new Map(
    (Array.isArray(workspace?.trans) ? workspace.trans : []).filter(item => item?.id).map(item => [String(item.id), item]),
  );
  const missingIds = (projection?.transactions || [])
    .filter(item => !item.archivedAt && !item.deletedAt && !item.payload?.hiddenFromHistory && !desiredTransactions.has(item.id))
    .map(item => item.id);
  if (missingIds.length) {
    const removed = await voidFinancialTransactionsV7({ namespace, transactionIds: missingIds, database });
    if (!removed.ok) return removed;
  }
  let updatedTransactions = 0;
  for (const [id, transaction] of desiredTransactions) {
    const persisted = persistedTransactions.get(id);
    if (persisted && !persisted.deletedAt && canonicalTransactionJson(persisted.payload) === canonicalTransactionJson(transaction)) continue;
    const revision = Math.max(Number(transaction.revision || 1), Number(persisted?.revision || 0) + 1);
    const next = {
      ...transaction,
      revision,
      updatedAt: new Date().toISOString(),
      idempotencyKey: `workspace-reconcile:${id}:revision:${revision}`,
    };
    const committed = await replaceFinancialTransactionV7({
      namespace, transaction: next, wallets: workspace?.wallets || [],
      baseCurrency: workspace?.cfg?.currency || 'IQD', database,
    });
    if (!committed.ok) return committed;
    updatedTransactions += 1;
  }

  const now = new Date().toISOString();
  const desiredEntities = [];
  const add = (entityType, items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (item?.id) desiredEntities.push({ entityType, id: String(item.id), payload: item });
    }
  };
  add('wallet', workspace?.wallets);
  add('debt', workspace?.debts);
  add('goal', workspace?.goals);
  add('commitment', workspace?.commitments);
  const recurringRules = new Map();
  for (const transaction of Array.isArray(workspace?.trans) ? workspace.trans : []) {
    if (!transaction?.recurring || !transaction?.id) continue;
    const ruleId = String(transaction.recurringGroupId || transaction.id);
    recurringRules.set(ruleId, {
      id: ruleId,
      type: transaction.flowType || (Number(transaction.amt || 0) >= 0 ? 'income' : 'expense'),
      amount: Math.abs(Number(transaction.walletAmount ?? transaction.amt ?? 0)),
      currencyCode: transaction.walletCurrency || transaction.currencyCode || workspace?.cfg?.currency || 'IQD',
      walletId: transaction.walletId || null, categoryId: transaction.cat || 'other',
      scope: transaction.scope || 'personal', schedule: { frequency: 'monthly', interval: 1 },
      timezonePolicy: 'local_date', startDate: transaction.dateISO || null, endDate: null,
      status: 'active', sourceTransactionId: transaction.id, revision: Math.max(1, Number(transaction.revision || 1)),
    });
  }
  add('recurring_rule', [...recurringRules.values()]);
  add('category', workspace?.cats);
  add('budget', Object.entries(workspace?.cfg?.categoryBudgets || {}).map(([categoryId, amount]) => ({ id: `current:${categoryId}`, month: 'current', categoryId, amount })));
  add('budget', Object.entries(workspace?.cfg?.categoryBudgetsByMonth || {}).flatMap(([month, map]) => (
    Object.entries(map || {}).map(([categoryId, amount]) => ({ id: `${month}:${categoryId}`, month, categoryId, amount }))
  )));
  desiredEntities.push({
    entityType: 'workspace', id: 'workspace',
    payload: { cfg: workspace?.cfg || {}, notif: workspace?.notif || {}, cloudRevision: Number(workspace?.cloudRevision || 0) },
  });
  const existingEntities = new Map((projection?.entities || []).map(item => [`${item.entityType}:${item.id}`, item]));
  const desiredKeys = new Set(desiredEntities.map(item => `${item.entityType}:${item.id}`));
  const changes = [];
  for (const item of desiredEntities) {
    const existing = existingEntities.get(`${item.entityType}:${item.id}`);
    if (existing && !existing.deletedAt && canonicalJson(existing.payload) === canonicalJson(item.payload)) continue;
    changes.push({
      ...item,
      revision: Math.max(1, Number(existing?.revision || 0) + 1),
      createdAt: existing?.payload?.createdAt || item.payload?.createdAt || now,
      updatedAt: now,
    });
  }
  for (const existing of existingEntities.values()) {
    const key = `${existing.entityType}:${existing.id}`;
    if (existing.deletedAt || desiredKeys.has(key) || existing.entityType === 'archive') continue;
    changes.push({
      entityType: existing.entityType, id: existing.id, payload: existing.payload,
      revision: Math.max(1, Number(existing.revision || 0) + 1), deletedAt: now, updatedAt: now,
    });
  }
  const entitiesResult = await commitEntityChangesV7({ namespace, changes, database, now });
  if (!entitiesResult.ok) return entitiesResult;
  return {
    supported: true, ok: true, sourceMode: 'sqlite',
    voidedTransactions: missingIds.length, updatedTransactions, updatedEntities: entitiesResult.changed || 0,
  };
};
