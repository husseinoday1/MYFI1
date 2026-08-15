import { Platform } from 'react-native';
import { enqueueLedgerWrite, getLedgerDb } from './ledgerDatabase';
import { runLedgerSchemaMigrations } from './financialLedgerSchemaMigrations';
import {
  buildExpenseLedgerCommand,
  buildFinancialLedgerCommand,
  FINANCIAL_LEDGER_SCHEMA_VERSION,
} from './financialLedgerV7Model';

const readyDatabases = new WeakSet();

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
  await runLedgerSchemaMigrations({
    database: db,
    migrations: [FINANCIAL_LEDGER_V7_MIGRATION],
    appVersion: '1.0.0',
    healthCheck: financialLedgerHealthCheck,
  });
  readyDatabases.add(db);
  return true;
};

const insertCurrency = (db, item) => db.runAsync(
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

const upsertEntity = (db, entity) => db.runAsync(
  `INSERT INTO ledger_entities_v7
   (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?)
   ON CONFLICT(namespace,entity_type,id) DO UPDATE SET
     revision=excluded.revision,deleted_at=excluded.deleted_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at
   WHERE excluded.revision >= ledger_entities_v7.revision`,
  entity.namespace, entity.entityType, entity.id, entity.revision, entity.deletedAt,
  safeJson(entity.payload), entity.createdAt, entity.updatedAt,
);

const prepareLocalEntity = async (db, entity) => {
  const current = await db.getFirstAsync(
    `SELECT revision FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=? LIMIT 1`,
    entity.namespace, entity.entityType, entity.id,
  );
  return {
    ...entity,
    revision: Math.max(1, Number(entity.revision || 0), Number(current?.revision || 0) + 1),
  };
};

const insertEntityOutbox = (db, entity) => db.runAsync(
  `INSERT OR IGNORE INTO ledger_outbox_v2
   (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
   VALUES (?,?,?,?,?,?,?,?,?)`,
  entity.namespace, `${entity.namespace}:${entity.entityType}:${entity.id}:revision:${entity.revision}`,
  entity.entityType, entity.id, entity.deletedAt ? 'delete' : 'upsert', entity.revision,
  FINANCIAL_LEDGER_SCHEMA_VERSION, safeJson(entity), entity.updatedAt,
);

const insertFinancialTransactionOutbox = (db, command) => {
  const mutation = command.mutation;
  return db.runAsync(
    `INSERT INTO ledger_outbox_v2
     (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    mutation.namespace, mutation.mutationId, mutation.entityType, mutation.entityId,
    mutation.operation, mutation.entityRevision, mutation.payloadVersion,
    safeJson({
      schemaVersion: command.schemaVersion,
      transaction: command.header,
      originalTransaction: command.originalTransaction,
      currencies: command.currencies || [],
      accounts: command.accounts || [command.account].filter(Boolean),
      postings: command.postings || [command.posting].filter(Boolean),
      exchangeRates: command.exchangeRates || [command.exchangeRate].filter(Boolean),
      links: command.links || [],
      entities: command.entities || [],
    }),
    mutation.createdAt,
  );
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
    await db.withTransactionAsync(async () => {
      const existing = await db.getFirstAsync(
        `SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? AND idempotency_key=? LIMIT 1`,
        command.header.namespace, command.header.idempotencyKey,
      );
      if (existing?.id) {
        const persisted = await readFinancialTransaction(db, command.header.namespace, String(existing.id));
        result = { supported: true, ok: true, idempotent: true, transactionId: String(existing.id), persisted };
        return;
      }

      for (const currency of command.currencies || []) await insertCurrency(db, currency);
      for (const account of command.accounts || [command.account].filter(Boolean)) await upsertAccount(db, account);
      for (const rate of command.exchangeRates || [command.exchangeRate].filter(Boolean)) {
        await db.runAsync(
          `INSERT OR IGNORE INTO ledger_exchange_rates_v7
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

      for (const item of command.postings || [command.posting].filter(Boolean)) {
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
      for (const entity of command.entities || []) {
        const prepared = await prepareLocalEntity(db, entity);
        Object.assign(entity, prepared);
        await upsertEntity(db, prepared);
      }

      if (writeOutbox) {
        await insertFinancialTransactionOutbox(db, command);
      }
      const persisted = await readFinancialTransaction(db, header.namespace, header.id);
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
    await db.withTransactionAsync(async () => {
      const duplicateMutation = await db.getFirstAsync(
        `SELECT mutation_id FROM ledger_outbox_v2 WHERE mutation_id=? LIMIT 1`, command.mutation.mutationId,
      );
      if (duplicateMutation?.mutation_id) {
        const persisted = await readFinancialTransaction(db, namespace, transaction.id);
        result = { supported: true, ok: true, idempotent: true, transactionId: persisted.id, persisted };
        return;
      }
      const currentTransaction = await db.getFirstAsync(
        `SELECT revision FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
        namespace, transaction.id,
      );
      if (currentTransaction && command.header.revision <= Number(currentTransaction.revision || 0)) {
        result = {
          supported: true,
          ok: false,
          reason: 'stale_transaction_revision',
          currentRevision: Number(currentTransaction.revision || 0),
          requestedRevision: command.header.revision,
        };
        return;
      }
      for (const currency of command.currencies) await insertCurrency(db, currency);
      for (const account of command.accounts) await upsertAccount(db, account);
      await db.runAsync(`DELETE FROM ledger_transaction_links_v7 WHERE namespace=? AND transaction_id=?`, namespace, transaction.id);
      await db.runAsync(`DELETE FROM ledger_postings_v7 WHERE namespace=? AND transaction_id=?`, namespace, transaction.id);
      for (const rate of command.exchangeRates) {
        await db.runAsync(
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
      await db.runAsync(
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
        await db.runAsync(
          `INSERT INTO ledger_postings_v7
           (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          item.namespace, item.id, item.transactionId, item.accountId, item.bucket,
          item.role, item.amountMinor, item.currencyCode, item.exchangeRateId, item.createdAt,
        );
      }
      for (const link of command.links) {
        await db.runAsync(
          `INSERT INTO ledger_transaction_links_v7
           (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          link.namespace, link.id, link.transactionId, link.linkType, link.linkId,
          link.relation, link.appliedAmountMinor, link.currencyCode, link.createdAt,
        );
      }
      for (const entity of command.entities) {
        const prepared = await prepareLocalEntity(db, entity);
        Object.assign(entity, prepared);
        await upsertEntity(db, prepared);
      }
      await insertFinancialTransactionOutbox(db, command);
      const persisted = await readFinancialTransaction(db, namespace, transaction.id);
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
    await db.withTransactionAsync(async () => {
      for (const id of ids) {
        const row = await db.getFirstAsync(
          `SELECT revision,payload_json,deleted_at FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
          namespace, id,
        );
        if (!row || row.deleted_at) continue;
        const revision = Math.max(1, Number(row.revision || 1) + 1);
        const payload = { ...(parseJson(row.payload_json, {}) || {}), status: 'voided', deletedAt: now, revision, updatedAt: now };
        await db.runAsync(
          `UPDATE ledger_financial_transactions_v7
              SET status='voided',deleted_at=?,revision=?,payload_json=?,updated_at=?
            WHERE namespace=? AND id=? AND deleted_at IS NULL`,
          now, revision, safeJson(payload), now, namespace, id,
        );
        await db.runAsync(
          `INSERT OR IGNORE INTO ledger_outbox_v2
           (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          namespace, `${namespace}:${id}:void:${revision}`, 'financial_transaction', id, 'void', revision,
          FINANCIAL_LEDGER_SCHEMA_VERSION, safeJson({ transactionId: id, revision, deletedAt: now }), now,
        );
        changed += 1;
      }
      for (const item of Array.isArray(entityChanges) ? entityChanges : []) {
        if (!item?.id || !item?.entityType) continue;
        const entity = await prepareLocalEntity(db, {
          namespace, entityType: String(item.entityType), id: String(item.id),
          revision: Math.max(1, Number(item.revision || 1)), deletedAt: item.deletedAt || null,
          payload: item.payload ?? null, createdAt: String(item.createdAt || now), updatedAt: String(item.updatedAt || now),
        });
        await upsertEntity(db, entity);
        await insertEntityOutbox(db, entity);
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
    await db.withTransactionAsync(async () => {
      for (const id of ids) {
        const row = await db.getFirstAsync(
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
        await db.runAsync(
          `UPDATE ledger_financial_transactions_v7
              SET archive_year=?,archived_at=?,revision=?,payload_json=?,updated_at=?
            WHERE namespace=? AND id=? AND deleted_at IS NULL`,
          targetYear, archivedAt, revision, safeJson(payload), archivedAt, namespace, id,
        );
        await db.runAsync(
          `INSERT OR IGNORE INTO ledger_outbox_v2
           (namespace,mutation_id,entity_type,entity_id,operation,entity_revision,payload_version,payload_json,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          namespace, `${namespace}:${id}:archive:${revision}`, 'financial_transaction', id,
          'upsert', revision, FINANCIAL_LEDGER_SCHEMA_VERSION,
          safeJson({ transactionId: id, archiveYear: targetYear, archivedAt, revision }), archivedAt,
        );
        const original = parseJson(row.payload_json, {}) || {};
        if ((row.kind === 'goal_allocation' || original.isGoalSaving) && !original.allocationReleased) {
          const releaseId = `v7-archive-release:${id}`;
          const existingRelease = await db.getFirstAsync(
            `SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
            namespace, releaseId,
          );
          if (!existingRelease?.id) {
            const reservedRows = await db.getAllAsync(
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
              await insertCommandWithoutOutbox(db, releaseCommand);
              await insertFinancialTransactionOutbox(db, releaseCommand);
              releasedAllocations += 1;
            }
          }
        }
        changed += 1;
      }
      for (const item of Array.isArray(entityChanges) ? entityChanges : []) {
        if (!item?.id || !item?.entityType) continue;
        const entity = await prepareLocalEntity(db, {
          namespace, entityType: String(item.entityType), id: String(item.id),
          revision: Math.max(1, Number(item.revision || 1)), deletedAt: item.deletedAt || null,
          payload: item.payload ?? null, createdAt: String(item.createdAt || archivedAt),
          updatedAt: String(item.updatedAt || archivedAt),
        });
        await upsertEntity(db, entity);
        await insertEntityOutbox(db, entity);
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
    payload: item.payload ?? null, createdAt: String(item.createdAt || now), updatedAt: String(item.updatedAt || now),
  }));
  if (!entities.length) return { supported: true, ok: true, changed: 0 };
  return enqueueWrite(async () => {
    let changed = 0;
    await db.withTransactionAsync(async () => {
      for (const entity of entities) {
        const current = await db.getFirstAsync(
          `SELECT revision,deleted_at,payload_json FROM ledger_entities_v7
            WHERE namespace=? AND entity_type=? AND id=? LIMIT 1`,
          entity.namespace, entity.entityType, entity.id,
        );
        const currentPayload = parseJson(current?.payload_json, null);
        const sameDeletedState = String(current?.deleted_at || '') === String(entity.deletedAt || '');
        if (current && sameDeletedState && canonicalJson(currentPayload) === canonicalJson(entity.payload)) continue;
        const prepared = await prepareLocalEntity(db, entity);
        await upsertEntity(db, prepared);
        await insertEntityOutbox(db, prepared);
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
  await enqueueWrite(() => db.withTransactionAsync(async () => {
    for (const id of ids) {
      const result = await db.runAsync(
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
    await db.withTransactionAsync(async () => {
      for (const row of rows) {
        const received = await db.getFirstAsync(`SELECT mutation_id FROM ledger_inbox_v2 WHERE mutation_id=? LIMIT 1`, row.mutationId);
        if (received?.mutation_id) {
          cursor = Math.max(cursor, row.serverSequence);
          continue;
        }
        if (row.entityType === 'financial_transaction') {
          const commandPayload = row.payload || {};
          if (row.operation === 'void' || row.operation === 'delete') {
            const existing = await db.getFirstAsync(
              `SELECT revision,payload_json FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
              namespace, row.entityId,
            );
            if (existing && row.entityRevision >= Number(existing.revision || 0)) {
              const deletedAt = commandPayload.deletedAt || new Date().toISOString();
              await db.runAsync(
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
            const existing = await db.getFirstAsync(
              `SELECT revision,payload_json FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
              namespace, row.entityId,
            );
            if (existing && row.entityRevision >= Number(existing.revision || 0)) {
              const archivedAt = commandPayload.archivedAt || new Date().toISOString();
              await db.runAsync(
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
            const current = await db.getFirstAsync(
              `SELECT revision FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=? LIMIT 1`,
              namespace, row.entityId,
            );
            if (!current || row.entityRevision >= Number(current.revision || 0)) {
              for (const currency of commandPayload.currencies || []) await insertCurrency(db, currency);
              for (const sourceAccount of commandPayload.accounts || []) {
                await upsertAccount(db, { ...sourceAccount, namespace });
              }
              await db.runAsync(`DELETE FROM ledger_transaction_links_v7 WHERE namespace=? AND transaction_id=?`, namespace, row.entityId);
              await db.runAsync(`DELETE FROM ledger_postings_v7 WHERE namespace=? AND transaction_id=?`, namespace, row.entityId);
              for (const sourceRate of commandPayload.exchangeRates || []) {
                const rate = { ...sourceRate, namespace };
                await db.runAsync(
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
              const header = { ...commandPayload.transaction, namespace, revision: row.entityRevision };
              await db.runAsync(
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
                await db.runAsync(
                  `INSERT INTO ledger_postings_v7
                   (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)`,
                  namespace, item.id, item.transactionId, item.accountId, item.bucket,
                  item.role, item.amountMinor, item.currencyCode, item.exchangeRateId, item.createdAt,
                );
              }
              for (const sourceLink of commandPayload.links || []) {
                const link = { ...sourceLink, namespace };
                await db.runAsync(
                  `INSERT INTO ledger_transaction_links_v7
                   (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?)`,
                  namespace, link.id, link.transactionId, link.linkType, link.linkId,
                  link.relation, link.appliedAmountMinor, link.currencyCode, link.createdAt,
                );
              }
              for (const sourceEntity of commandPayload.entities || []) {
                await upsertEntity(db, { ...sourceEntity, namespace });
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
          await upsertEntity(db, {
            ...sourceEntity, namespace, entityType: row.entityType, id: row.entityId,
            revision: row.entityRevision,
          });
          applied += 1;
        }
        await db.runAsync(
          `INSERT OR IGNORE INTO ledger_inbox_v2(mutation_id,namespace,server_sequence,received_at) VALUES (?,?,?,?)`,
          row.mutationId, namespace, row.serverSequence, new Date().toISOString(),
        );
        cursor = Math.max(cursor, row.serverSequence);
      }
      const now = new Date().toISOString();
      await db.runAsync(
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
  await enqueueWrite(() => db.withTransactionAsync(async () => {
    await clearFinancialNamespaceRows(db, target);
    await db.runAsync(`DELETE FROM ledger_outbox_v2 WHERE namespace=?`, target);
    await db.runAsync(`DELETE FROM ledger_inbox_v2 WHERE namespace=?`, target);
    await db.runAsync(`DELETE FROM ledger_sync_state_v7 WHERE namespace=?`, target);
    await db.runAsync(`DELETE FROM ledger_migration_audits_v7 WHERE namespace=?`, target);
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
    await db.withTransactionAsync(async () => {
      await clearFinancialNamespaceRows(db, namespace);
      for (const command of commands) await insertCommandWithoutOutbox(db, command);
      for (const entity of entities) await upsertEntity(db, entity);
      const now = new Date().toISOString();
      await db.runAsync(
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
  await enqueueWrite(() => db.withTransactionAsync(() => clearFinancialNamespaceRows(db, namespace)));
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
    await db.withTransactionAsync(async () => {
      if (resetPendingOutbox) {
        await db.runAsync(`DELETE FROM ledger_outbox_v2 WHERE namespace=? AND acknowledged_at IS NULL`, target);
      }
      await clearFinancialNamespaceRows(db, target);
      await db.runAsync(
        `INSERT INTO ledger_accounts_v7
         (namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
         SELECT ?,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at
           FROM ledger_accounts_v7 WHERE namespace=?`, target, stage,
      );
      await db.runAsync(
        `INSERT INTO ledger_exchange_rates_v7
         (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
         SELECT ?,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at
           FROM ledger_exchange_rates_v7 WHERE namespace=?`, target, stage,
      );
      await db.runAsync(
        `INSERT INTO ledger_financial_transactions_v7
         (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
          idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
         SELECT ?,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
                idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at
           FROM ledger_financial_transactions_v7 WHERE namespace=?`, target, stage,
      );
      await db.runAsync(
        `INSERT INTO ledger_postings_v7
         (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
         SELECT ?,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at
           FROM ledger_postings_v7 WHERE namespace=?`, target, stage,
      );
      await db.runAsync(
        `INSERT INTO ledger_transaction_links_v7
         (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
         SELECT ?,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at
           FROM ledger_transaction_links_v7 WHERE namespace=?`, target, stage,
      );
      await db.runAsync(
        `INSERT INTO ledger_entities_v7
         (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
         SELECT ?,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at
           FROM ledger_entities_v7 WHERE namespace=?`, target, stage,
      );
      await db.runAsync(
        `INSERT INTO ledger_workspace_state_v7
         (namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        target, 'sqlite', FINANCIAL_LEDGER_SCHEMA_VERSION, checksum, now, now, now, safeJson(workspacePayload), now,
      );
      await db.runAsync(
        `INSERT INTO ledger_migration_audits_v7
         (namespace,run_id,source_checksum,target_checksum,source_counts_json,target_counts_json,differences_json,exact_match,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        target, runId, checksum, checksum, safeJson(sourceCounts), safeJson(targetCounts), '[]', 1, now,
      );
      await clearFinancialNamespaceRows(db, stage);
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
    await db.withTransactionAsync(async () => {
      await clearFinancialNamespaceRows(db, target);
      await db.runAsync(
        `INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
         SELECT ?,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at FROM ledger_accounts_v7 WHERE namespace=?`,
        target, source,
      );
      await db.runAsync(
        `INSERT INTO ledger_exchange_rates_v7(namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
         SELECT ?,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at FROM ledger_exchange_rates_v7 WHERE namespace=?`,
        target, source,
      );
      await db.runAsync(
        `INSERT INTO ledger_financial_transactions_v7
         (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,
          revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
         SELECT ?,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,
                revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at
           FROM ledger_financial_transactions_v7 WHERE namespace=?`, target, source,
      );
      await db.runAsync(
        `INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
         SELECT ?,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at FROM ledger_postings_v7 WHERE namespace=?`,
        target, source,
      );
      await db.runAsync(
        `INSERT INTO ledger_transaction_links_v7(namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
         SELECT ?,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at FROM ledger_transaction_links_v7 WHERE namespace=?`,
        target, source,
      );
      await db.runAsync(
        `INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
         SELECT ?,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at FROM ledger_entities_v7 WHERE namespace=?`,
        target, source,
      );
      const now = new Date().toISOString();
      await db.runAsync(
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
