// MYFI_ACTIVE_SQLITE_LEDGER_V6
// SQLite is the durable local transaction engine. Zustand remains a UI/cache
// compatibility layer while screens migrate to SQL queries.
import { Platform } from 'react-native';
import { enqueueLedgerWrite, flushLedgerWrites, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';
import {
  hydrateLegacyCurrencyFields,
  moneyFromMinor,
  moneyToMinor,
  normalizeCurrencyCode,
  transactionBaseAmount,
  transactionWalletAmount,
} from './financialCoreV2';
import { inferFlowType } from './modules';

const SCHEMA_VERSION = 6;
let schemaReady = false;

const safeJson = value => {
  try { return JSON.stringify(value ?? null); } catch { return 'null'; }
};
const parseJson = (value, fallback = null) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const ns = value => String(value || 'guest').trim() || 'guest';
export const getLedgerNamespace = (workspaceNamespace = 'guest', cfg = {}) => (
  cfg?.performanceTestMode ? `${ns(workspaceNamespace)}::performance-test` : ns(workspaceNamespace)
);
const searchText = tx => [
  tx?.title, tx?.note, tx?.dateISO, tx?.cat, tx?.walletId, tx?.fromWalletId,
  tx?.toWalletId, tx?.transactionTag, tx?.walletCurrency, tx?.baseCurrencyCode,
].filter(Boolean).join(' ').toLowerCase();

const openDb = async () => {
  const db = await getLedgerDb();
  if (!db) return null;
  if (!schemaReady) {
    await enqueueLedgerWrite(async () => {
      if (schemaReady) return;
      await db.execAsync(`
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS ledger_meta (
        namespace TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(namespace, key)
      );
      CREATE TABLE IF NOT EXISTS ledger_wallets (
        namespace TEXT NOT NULL,
        id TEXT NOT NULL,
        name TEXT,
        wallet_type TEXT,
        scope TEXT,
        currency_code TEXT NOT NULL,
        opening_minor INTEGER NOT NULL DEFAULT 0,
        opening_base_minor INTEGER NOT NULL DEFAULT 0,
        base_currency TEXT NOT NULL,
        valuation_rate REAL NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(namespace, id)
      );
      CREATE TABLE IF NOT EXISTS ledger_transactions (
        namespace TEXT NOT NULL,
        id TEXT NOT NULL,
        scope TEXT,
        date_iso TEXT NOT NULL,
        ts INTEGER NOT NULL DEFAULT 0,
        kind TEXT,
        flow_type TEXT,
        wallet_id TEXT,
        from_wallet_id TEXT,
        to_wallet_id TEXT,
        category_id TEXT,
        wallet_currency TEXT,
        base_currency TEXT,
        wallet_amount_minor INTEGER NOT NULL DEFAULT 0,
        base_amount_minor INTEGER NOT NULL DEFAULT 0,
        transfer_from_minor INTEGER NOT NULL DEFAULT 0,
        transfer_to_minor INTEGER NOT NULL DEFAULT 0,
        transfer_from_currency TEXT,
        transfer_to_currency TEXT,
        exchange_rate REAL NOT NULL DEFAULT 1,
        fee_minor INTEGER NOT NULL DEFAULT 0,
        fee_base_minor INTEGER NOT NULL DEFAULT 0,
        search_text TEXT,
        archive_year INTEGER,
        archived_at TEXT,
        deleted_at TEXT,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(namespace, id)
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_tx_date
        ON ledger_transactions(namespace, deleted_at, archived_at, date_iso DESC, ts DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_tx_wallet
        ON ledger_transactions(namespace, wallet_id, deleted_at, date_iso DESC, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_tx_from_wallet
        ON ledger_transactions(namespace, from_wallet_id, deleted_at, date_iso DESC, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_tx_to_wallet
        ON ledger_transactions(namespace, to_wallet_id, deleted_at, date_iso DESC, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_tx_category
        ON ledger_transactions(namespace, category_id, deleted_at, date_iso DESC, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_tx_flow
        ON ledger_transactions(namespace, flow_type, deleted_at, date_iso DESC, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_ledger_tx_archive
        ON ledger_transactions(namespace, archive_year, archived_at, deleted_at, date_iso DESC, ts DESC);
      CREATE TABLE IF NOT EXISTS ledger_monthly_budgets (
        namespace TEXT NOT NULL,
        scope TEXT NOT NULL,
        month_key TEXT NOT NULL,
        category_id TEXT NOT NULL,
        currency_code TEXT NOT NULL,
        amount_minor INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        accepted_suggestion INTEGER NOT NULL DEFAULT 0,
        dismissed_suggestion INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(namespace, scope, month_key, category_id)
      );
      CREATE TABLE IF NOT EXISTS ledger_outbox (
        namespace TEXT NOT NULL,
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        operation TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_outbox_ns
        ON ledger_outbox(namespace, id);
    `);
    // Forward-compatible column migration. This also makes reinstall/retry safe
    // if a previous package created an older ledger_transactions table.
      const txColumns = await db.getAllAsync('PRAGMA table_info(ledger_transactions)');
      if (!txColumns.some(column => column?.name === 'fee_base_minor')) {
        await db.execAsync('ALTER TABLE ledger_transactions ADD COLUMN fee_base_minor INTEGER NOT NULL DEFAULT 0;');
      }
      await db.runAsync(
        `INSERT OR REPLACE INTO ledger_meta(namespace, key, value, updated_at)
         VALUES (?, 'schema_version', ?, ?)`,
        '__global__', String(SCHEMA_VERSION), new Date().toISOString(),
      );
      schemaReady = true;
    });
  }
  return db;
};

const enqueueWrite = enqueueLedgerWrite;

const walletRow = (wallet, baseCurrency) => {
  const currency = normalizeCurrencyCode(wallet?.currency, baseCurrency);
  const base = normalizeCurrencyCode(baseCurrency);
  const valuationRate = Number(wallet?.valuationRate || wallet?.exchangeRate || 1);
  const safeRate = Number.isFinite(valuationRate) && valuationRate > 0 ? valuationRate : 1;
  const opening = Number(wallet?.openingBalance || 0);
  const openingBase = currency === base ? opening : Number(wallet?.openingBaseBalance ?? opening * safeRate);
  return {
    currency,
    base,
    safeRate,
    openingMinor: moneyToMinor(opening, currency),
    openingBaseMinor: moneyToMinor(openingBase, base),
  };
};

const upsertWalletsInternal = async (db, namespace, wallets = [], baseCurrency = 'IQD') => {
  const now = new Date().toISOString();
  const statement = await db.prepareAsync(`
    INSERT OR REPLACE INTO ledger_wallets
    (namespace,id,name,wallet_type,scope,currency_code,opening_minor,opening_base_minor,base_currency,valuation_rate,payload_json,updated_at)
    VALUES ($ns,$id,$name,$type,$scope,$currency,$opening,$openingBase,$base,$rate,$payload,$updated)
  `);
  try {
    for (const wallet of Array.isArray(wallets) ? wallets : []) {
      if (!wallet?.id) continue;
      const row = walletRow(wallet, baseCurrency);
      await statement.executeAsync({
        $ns: namespace,
        $id: String(wallet.id),
        $name: String(wallet.name || wallet.nameEn || ''),
        $type: String(wallet.type || 'other'),
        $scope: String(wallet.scope || 'personal'),
        $currency: row.currency,
        $opening: row.openingMinor,
        $openingBase: row.openingBaseMinor,
        $base: row.base,
        $rate: row.safeRate,
        $payload: safeJson(wallet),
        $updated: now,
      });
    }
  } finally {
    await statement.finalizeAsync();
  }
};

const txBind = (namespace, tx, wallets, baseCurrency) => {
  const normalized = hydrateLegacyCurrencyFields(tx, wallets, baseCurrency);
  const base = normalizeCurrencyCode(normalized.baseCurrencyCode, baseCurrency);
  const walletCurrency = normalizeCurrencyCode(normalized.walletCurrency || normalized.currencyCode, base);
  const payload = { ...normalized };
  const archiveYear = Number(normalized.archiveYear);
  return {
    $ns: namespace,
    $id: String(normalized.id),
    $scope: String(normalized.scope || 'personal'),
    $date: String(normalized.dateISO || '1970-01-01'),
    $ts: Number(normalized.ts || 0),
    $kind: String(normalized.kind || 'transaction'),
    $flow: String(normalized.flowType || inferFlowType(normalized) || ''),
    $wallet: normalized.walletId ? String(normalized.walletId) : null,
    $fromWallet: normalized.fromWalletId ? String(normalized.fromWalletId) : null,
    $toWallet: normalized.toWalletId ? String(normalized.toWalletId) : null,
    $category: normalized.cat ? String(normalized.cat) : null,
    $walletCurrency: walletCurrency,
    $baseCurrency: base,
    $walletMinor: moneyToMinor(transactionWalletAmount(normalized, normalized.walletId), walletCurrency),
    $baseMinor: moneyToMinor(transactionBaseAmount(normalized), base),
    $fromMinor: moneyToMinor(Math.abs(Number(normalized.transferFromAmount ?? normalized.transferAmount ?? 0)), normalized.fromCurrency || walletCurrency),
    $toMinor: moneyToMinor(Math.abs(Number(normalized.transferToAmount ?? normalized.transferAmount ?? 0)), normalized.toCurrency || walletCurrency),
    $fromCurrency: normalizeCurrencyCode(normalized.fromCurrency, walletCurrency),
    $toCurrency: normalizeCurrencyCode(normalized.toCurrency, walletCurrency),
    $rate: Number(normalized.transferRate ?? normalized.exchangeRate ?? 1) || 1,
    $feeMinor: moneyToMinor(Math.abs(Number(normalized.feeAmount || 0)), normalized.fromCurrency || walletCurrency),
    $feeBaseMinor: moneyToMinor(Math.abs(Number(normalized.feeBaseAmount || 0)), base),
    $search: searchText(normalized),
    $archiveYear: Number.isInteger(archiveYear) ? archiveYear : null,
    $archivedAt: normalized.archivedAt || null,
    $deletedAt: normalized.deletedAt || null,
    $payload: safeJson(payload),
    $updated: new Date().toISOString(),
  };
};

const TX_UPSERT = `
  INSERT INTO ledger_transactions
  (namespace,id,scope,date_iso,ts,kind,flow_type,wallet_id,from_wallet_id,to_wallet_id,category_id,
   wallet_currency,base_currency,wallet_amount_minor,base_amount_minor,transfer_from_minor,transfer_to_minor,
   transfer_from_currency,transfer_to_currency,exchange_rate,fee_minor,fee_base_minor,search_text,archive_year,archived_at,deleted_at,payload_json,updated_at)
  VALUES
  ($ns,$id,$scope,$date,$ts,$kind,$flow,$wallet,$fromWallet,$toWallet,$category,
   $walletCurrency,$baseCurrency,$walletMinor,$baseMinor,$fromMinor,$toMinor,
   $fromCurrency,$toCurrency,$rate,$feeMinor,$feeBaseMinor,$search,$archiveYear,$archivedAt,$deletedAt,$payload,$updated)
  ON CONFLICT(namespace,id) DO UPDATE SET
    scope=excluded.scope,date_iso=excluded.date_iso,ts=excluded.ts,kind=excluded.kind,flow_type=excluded.flow_type,
    wallet_id=excluded.wallet_id,from_wallet_id=excluded.from_wallet_id,to_wallet_id=excluded.to_wallet_id,
    category_id=excluded.category_id,wallet_currency=excluded.wallet_currency,base_currency=excluded.base_currency,
    wallet_amount_minor=excluded.wallet_amount_minor,base_amount_minor=excluded.base_amount_minor,
    transfer_from_minor=excluded.transfer_from_minor,transfer_to_minor=excluded.transfer_to_minor,
    transfer_from_currency=excluded.transfer_from_currency,transfer_to_currency=excluded.transfer_to_currency,
    exchange_rate=excluded.exchange_rate,fee_minor=excluded.fee_minor,fee_base_minor=excluded.fee_base_minor,search_text=excluded.search_text,
    archive_year=COALESCE(excluded.archive_year,ledger_transactions.archive_year),
    archived_at=COALESCE(excluded.archived_at,ledger_transactions.archived_at),
    deleted_at=excluded.deleted_at,payload_json=excluded.payload_json,updated_at=excluded.updated_at
`;

export const activeLedgerSupported = () => Platform.OS !== 'web';

export const upsertLedgerTransaction = async ({ namespace = 'guest', transaction, wallets = [], baseCurrency = 'IQD', outbox = true } = {}) => {
  if (!transaction?.id) return false;
  const db = await openDb();
  if (!db) return false;
  const namespaceValue = ns(namespace);
  return enqueueWrite(async () => {
    await upsertWalletsInternal(db, namespaceValue, wallets, baseCurrency);
    await db.runAsync(TX_UPSERT, txBind(namespaceValue, transaction, wallets, baseCurrency));
    if (outbox) {
      await db.runAsync(
        `INSERT INTO ledger_outbox(namespace,entity_type,entity_id,operation,payload_json,created_at)
         VALUES (?,?,?,?,?,?)`,
        namespaceValue, 'transaction', String(transaction.id), 'upsert', safeJson(transaction), new Date().toISOString(),
      );
    }
    return true;
  });
};

export const upsertLedgerTransactions = async ({ namespace = 'guest', transactions = [], wallets = [], baseCurrency = 'IQD', outbox = false } = {}) => {
  const db = await openDb();
  if (!db) return false;
  const namespaceValue = ns(namespace);
  const rows = Array.isArray(transactions) ? transactions.filter(item => item?.id) : [];
  return enqueueWrite(async () => {
    await upsertWalletsInternal(db, namespaceValue, wallets, baseCurrency);
    const statement = await db.prepareAsync(TX_UPSERT);
    try {
      for (let i = 0; i < rows.length; i += 1) {
        await statement.executeAsync(txBind(namespaceValue, rows[i], wallets, baseCurrency));
        if (outbox) {
          await db.runAsync(
            `INSERT INTO ledger_outbox(namespace,entity_type,entity_id,operation,payload_json,created_at)
             VALUES (?,?,?,?,?,?)`,
            namespaceValue, 'transaction', String(rows[i].id), 'upsert', safeJson(rows[i]), new Date().toISOString(),
          );
        }
        if (i > 0 && i % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      await statement.finalizeAsync();
    }
    await db.runAsync(
      `INSERT OR REPLACE INTO ledger_meta(namespace,key,value,updated_at) VALUES (?,?,?,?)`,
      namespaceValue, 'last_reconcile', String(rows.length), new Date().toISOString(),
    );
    return true;
  });
};

export const replaceLedgerSnapshot = async ({ namespace = 'guest', transactions = [], wallets = [], baseCurrency = 'IQD' } = {}) => {
  const db = await openDb();
  if (!db) return false;
  const namespaceValue = ns(namespace);
  return enqueueWrite(async () => {
    await runLedgerExclusiveTransaction(db, async (txn) => {
      await txn.runAsync('DELETE FROM ledger_transactions WHERE namespace = ?', namespaceValue);
      await txn.runAsync('DELETE FROM ledger_wallets WHERE namespace = ?', namespaceValue);
      await txn.runAsync('DELETE FROM ledger_outbox WHERE namespace = ?', namespaceValue);
      await upsertWalletsInternal(txn, namespaceValue, wallets, baseCurrency);
      const statement = await txn.prepareAsync(TX_UPSERT);
      try {
        for (const tx of Array.isArray(transactions) ? transactions : []) {
          if (!tx?.id) continue;
          await statement.executeAsync(txBind(namespaceValue, tx, wallets, baseCurrency));
        }
      } finally {
        await statement.finalizeAsync();
      }
    });
    return true;
  });
};

export const softDeleteLedgerTransaction = async (namespace = 'guest', id, reason = 'user_delete') => {
  if (!id) return false;
  const db = await openDb();
  if (!db) return false;
  const namespaceValue = ns(namespace);
  return enqueueWrite(async () => {
    const deletedAt = new Date().toISOString();
    const result = await db.runAsync(
      `UPDATE ledger_transactions SET deleted_at = ?, updated_at = ?
        WHERE namespace = ? AND id = ? AND archived_at IS NULL`,
      deletedAt, deletedAt, namespaceValue, String(id),
    );
    if (Number(result?.changes || 0) > 0) {
      await db.runAsync(
        `INSERT INTO ledger_outbox(namespace,entity_type,entity_id,operation,payload_json,created_at)
         VALUES (?,?,?,?,?,?)`,
        namespaceValue, 'transaction', String(id), 'delete', safeJson({ reason, deletedAt }), deletedAt,
      );
    }
    return true;
  });
};

export const softDeleteLedgerTransactions = async (namespace = 'guest', ids = [], reason = 'user_delete_many') => {
  const cleanIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean).map(String))];
  if (!cleanIds.length) return false;
  const db = await openDb();
  if (!db) return false;
  const namespaceValue = ns(namespace);
  return enqueueWrite(async () => {
    const deletedAt = new Date().toISOString();
    const statement = await db.prepareAsync(
      `UPDATE ledger_transactions SET deleted_at = $deleted, updated_at = $deleted
        WHERE namespace = $ns AND id = $id AND archived_at IS NULL`,
    );
    try {
      for (const id of cleanIds) {
        const result = await statement.executeAsync({ $deleted: deletedAt, $ns: namespaceValue, $id: id });
        if (Number(result?.changes || 0) > 0) {
          await db.runAsync(
            `INSERT INTO ledger_outbox(namespace,entity_type,entity_id,operation,payload_json,created_at)
             VALUES (?,?,?,?,?,?)`,
            namespaceValue, 'transaction', id, 'delete', safeJson({ reason, deletedAt }), deletedAt,
          );
        }
      }
    } finally {
      await statement.finalizeAsync();
    }
    return true;
  });
};

export const restoreLedgerTransaction = async (namespace = 'guest', id) => {
  const db = await openDb();
  if (!db || !id) return false;
  const namespaceValue = ns(namespace);
  return enqueueWrite(async () => {
    const now = new Date().toISOString();
    const row = await db.getFirstAsync(
      `SELECT payload_json FROM ledger_transactions WHERE namespace = ? AND id = ?`,
      namespaceValue, String(id),
    );
    const result = await db.runAsync(
      `UPDATE ledger_transactions SET deleted_at = NULL, updated_at = ? WHERE namespace = ? AND id = ?`,
      now, namespaceValue, String(id),
    );
    if (Number(result?.changes || 0) > 0) {
      const payload = parseJson(row?.payload_json, {}) || {};
      await db.runAsync(
        `INSERT INTO ledger_outbox(namespace,entity_type,entity_id,operation,payload_json,created_at)
         VALUES (?,?,?,?,?,?)`,
        namespaceValue, 'transaction', String(id), 'upsert', safeJson({ ...payload, deletedAt: null }), now,
      );
    }
    return Number(result?.changes || 0) > 0;
  });
};

export const markLedgerYearArchived = async ({ namespace = 'guest', year, scope = null, archived = true } = {}) => {
  const db = await openDb();
  const targetYear = Number(year);
  if (!db || !Number.isInteger(targetYear)) return false;
  const namespaceValue = ns(namespace);
  const archivedAt = archived ? new Date().toISOString() : null;
  const archiveYear = archived ? targetYear : null;
  const updatedAt = new Date().toISOString();
  const params = [archiveYear, archivedAt, updatedAt, namespaceValue, `${targetYear}-%`];
  let sql = `UPDATE ledger_transactions
                SET archive_year = ?, archived_at = ?, updated_at = ?
              WHERE namespace = ? AND date_iso LIKE ? AND deleted_at IS NULL`;
  if (scope && scope !== 'all') {
    sql += ' AND scope = ?';
    params.push(String(scope));
  }
  await enqueueWrite(() => db.runAsync(sql, ...params));
  return true;
};

export const listLedgerArchivedYears = async (namespace = 'guest') => {
  const db = await openDb();
  if (!db) return [];
  const rows = await db.getAllAsync(
    `SELECT archive_year AS year,
            scope,
            COUNT(*) AS count,
            SUM(CASE WHEN flow_type = 'income' THEN ABS(base_amount_minor) ELSE 0 END) AS income_minor,
            SUM(CASE WHEN flow_type IN ('expense','commitment_payment') THEN ABS(base_amount_minor) ELSE 0 END)
                + SUM(CASE WHEN kind = 'transfer' THEN ABS(fee_base_minor) ELSE 0 END) AS expense_minor,
            MAX(base_currency) AS base_currency,
            MAX(archived_at) AS archived_at
       FROM ledger_transactions
      WHERE namespace = ? AND archived_at IS NOT NULL AND deleted_at IS NULL
      GROUP BY archive_year, scope
      ORDER BY archive_year DESC, scope ASC`,
    ns(namespace),
  );
  return rows.map(row => {
    const currency = normalizeCurrencyCode(row.base_currency, 'IQD');
    const income = moneyFromMinor(row.income_minor || 0, currency);
    const expense = moneyFromMinor(row.expense_minor || 0, currency);
    return {
      year: Number(row.year), scope: row.scope || 'personal', count: Number(row.count || 0),
      income, expense, net: income - expense, archivedAt: row.archived_at || null, local: true,
    };
  });
};

const decodeTxRow = row => {
  const payload = parseJson(row?.payload_json, {}) || {};
  return {
    ...payload,
    id: payload.id || row.id,
    dateISO: payload.dateISO || row.date_iso,
    ts: Number(payload.ts ?? row.ts ?? 0),
    archivedAt: row.archived_at || payload.archivedAt || null,
    archiveYear: row.archive_year == null ? payload.archiveYear : Number(row.archive_year),
    deletedAt: row.deleted_at || payload.deletedAt || null,
  };
};

const v7IsSourceOfTruth = async (db, namespace) => {
  try {
    const row = await db.getFirstAsync(
      `SELECT source_mode FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1`,
      ns(namespace),
    );
    return row?.source_mode === 'sqlite';
  } catch {
    return false;
  }
};

const v7BaseAmount = (tx, fallbackCurrency = 'IQD') => (
  Object.prototype.hasOwnProperty.call(tx || {}, 'baseAmountMinor')
    ? moneyFromMinor(Number(tx.baseAmountMinor || 0), normalizeCurrencyCode(tx.baseCurrencyCode, fallbackCurrency))
    : Number(tx?.baseAmount ?? tx?.amt ?? 0)
);

const v7FeeBaseAmount = (tx, fallbackCurrency = 'IQD') => (
  Object.prototype.hasOwnProperty.call(tx || {}, 'feeBaseAmountMinor')
    ? moneyFromMinor(Number(tx.feeBaseAmountMinor || 0), normalizeCurrencyCode(tx.baseCurrencyCode, fallbackCurrency))
    : Number(tx?.feeBaseAmount || 0)
);

const v7TransactionMatches = (tx, {
  search = '', flowType = null, categoryId = null, walletId = null, transactionClass = null,
} = {}) => {
  if (flowType && String(inferFlowType(tx)) !== String(flowType)) return false;
  if (categoryId && String(tx?.cat || 'other') !== String(categoryId)) return false;
  if (walletId && ![tx?.walletId, tx?.fromWalletId, tx?.toWalletId].includes(walletId)) return false;
  const semanticFlow = inferFlowType(tx);
  if (transactionClass === 'income' && semanticFlow !== 'income') return false;
  if (transactionClass === 'expense' && !['expense', 'commitment_payment'].includes(semanticFlow)) return false;
  if (transactionClass === 'transfer' && tx?.kind !== 'transfer') return false;
  if (transactionClass === 'goal' && tx?.flowType !== 'goal_allocation') return false;
  if (transactionClass === 'debt' && !['debt_payment', 'receivable_collection'].includes(tx?.flowType)) return false;
  if (transactionClass === 'commitment' && !tx?.isCommitmentPayment) return false;
  const query = String(search || '').trim().toLowerCase();
  if (query && !searchText(tx).includes(query)) return false;
  return true;
};

const queryV7PayloadRows = async (db, {
  namespace = 'guest', scope = null, fromDate = null, toDate = null,
  archived = null, year = null,
} = {}) => {
  const clauses = ['namespace=?', 'deleted_at IS NULL'];
  const params = [ns(namespace)];
  if (archived === true) clauses.push('archived_at IS NOT NULL');
  if (archived === false) clauses.push('archived_at IS NULL');
  if (Number.isInteger(Number(year))) { clauses.push('date_iso LIKE ?'); params.push(`${Number(year)}-%`); }
  if (scope && scope !== 'all') { clauses.push('scope=?'); params.push(String(scope)); }
  if (fromDate) { clauses.push('date_iso>=?'); params.push(String(fromDate)); }
  if (toDate) { clauses.push('date_iso<=?'); params.push(String(toDate)); }
  const rows = await db.getAllAsync(
    `SELECT id,date_iso,occurred_at,payload_json,archive_year,archived_at
       FROM ledger_financial_transactions_v7
      WHERE ${clauses.join(' AND ')}
      ORDER BY date_iso DESC,occurred_at DESC,id DESC`,
    ...params,
  );
  return rows.map(row => ({
    ...(parseJson(row.payload_json, {}) || {}),
    id: String(row.id), dateISO: String(row.date_iso),
    archivedAt: row.archived_at || null,
    archiveYear: row.archive_year == null ? null : Number(row.archive_year),
  })).filter(item => !item.hiddenFromHistory);
};

const queryV7TransactionPage = async (db, {
  namespace = 'guest', limit = 250, cursor = null, search = '', flowType = null,
  categoryId = null, walletId = null, scope = null, fromDate = null, toDate = null,
  archived = false, year = null, transactionClass = null,
} = {}) => {
  const clauses = ['t.namespace=?', 't.deleted_at IS NULL', "COALESCE(json_extract(t.payload_json,'$.hiddenFromHistory'),0)<>1"];
  const params = [ns(namespace)];
  if (archived === true) clauses.push('t.archived_at IS NOT NULL');
  if (archived === false) clauses.push('t.archived_at IS NULL');
  if (Number.isInteger(Number(year))) { clauses.push('t.date_iso LIKE ?'); params.push(`${Number(year)}-%`); }
  if (scope && scope !== 'all') { clauses.push('t.scope=?'); params.push(String(scope)); }
  if (fromDate) { clauses.push('t.date_iso>=?'); params.push(String(fromDate)); }
  if (toDate) { clauses.push('t.date_iso<=?'); params.push(String(toDate)); }
  if (flowType) { clauses.push("json_extract(t.payload_json,'$.flowType')=?"); params.push(String(flowType)); }
  if (categoryId) { clauses.push("COALESCE(t.category_id,json_extract(t.payload_json,'$.cat'),'other')=?"); params.push(String(categoryId)); }
  if (walletId) {
    clauses.push(`EXISTS (SELECT 1 FROM ledger_postings_v7 p
      WHERE p.namespace=t.namespace AND p.transaction_id=t.id AND p.account_id=?)`);
    params.push(String(walletId));
  }
  const amountExpression = "CAST(COALESCE(json_extract(t.payload_json,'$.baseAmountMinor'),json_extract(t.payload_json,'$.baseAmount'),json_extract(t.payload_json,'$.amt'),0) AS REAL)";
  if (transactionClass === 'income') clauses.push("COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind)='income'");
  if (transactionClass === 'expense') clauses.push("COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind) IN ('expense','commitment_payment')");
  if (transactionClass === 'transfer') clauses.push("t.kind='transfer'");
  if (transactionClass === 'goal') clauses.push("json_extract(t.payload_json,'$.flowType')='goal_allocation'");
  if (transactionClass === 'debt') clauses.push("json_extract(t.payload_json,'$.flowType') IN ('debt_payment','receivable_collection')");
  if (transactionClass === 'commitment') clauses.push("COALESCE(json_extract(t.payload_json,'$.isCommitmentPayment'),0)=1");
  const query = String(search || '').trim().toLowerCase();
  if (query) {
    clauses.push("LOWER(COALESCE(t.title,'')||' '||COALESCE(t.note,'')||' '||t.date_iso||' '||COALESCE(t.category_id,'')||' '||COALESCE(t.kind,'')) LIKE ?");
    params.push(`%${query}%`);
  }
  if (cursor?.dateISO) {
    clauses.push('(t.date_iso<? OR (t.date_iso=? AND t.occurred_at<?) OR (t.date_iso=? AND t.occurred_at=? AND t.id<?))');
    const occurredAt = String(cursor.occurredAt || `${cursor.dateISO}T00:00:00.000Z`);
    params.push(cursor.dateISO, cursor.dateISO, occurredAt, cursor.dateISO, occurredAt, String(cursor.id || ''));
  }
  const pageSize = Math.max(1, Math.min(Number(limit) || 250, 1000));
  params.push(pageSize + 1);
  const rows = await db.getAllAsync(
    `SELECT t.id,t.date_iso,t.occurred_at,t.payload_json,t.archive_year,t.archived_at
       FROM ledger_financial_transactions_v7 t
      WHERE ${clauses.join(' AND ')}
      ORDER BY t.date_iso DESC,t.occurred_at DESC,t.id DESC LIMIT ?`,
    ...params,
  );
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize).map(row => ({
    ...(parseJson(row.payload_json, {}) || {}),
    id: String(row.id), dateISO: String(row.date_iso), occurredAt: String(row.occurred_at || ''),
    archivedAt: row.archived_at || null,
    archiveYear: row.archive_year == null ? null : Number(row.archive_year),
  }));
  const last = pageRows[pageRows.length - 1];
  return {
    rows: pageRows,
    nextCursor: hasMore && last ? { dateISO: last.dateISO, occurredAt: last.occurredAt, id: last.id } : null,
    supported: true,
    source: 'sqlite_v7',
  };
};

const v7SummaryFromRows = (rows, walletId = null, fallbackCurrency = 'IQD') => {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const tx of rows) {
    if (walletId && walletId !== 'all' && ![tx.walletId, tx.fromWalletId, tx.toWalletId].includes(walletId)) continue;
    count += 1;
    if (tx.kind === 'transfer') {
      if (!walletId || walletId === 'all' || tx.fromWalletId === walletId) expense += Math.abs(v7FeeBaseAmount(tx, fallbackCurrency));
      continue;
    }
    const amount = v7BaseAmount(tx, fallbackCurrency);
    const flowType = inferFlowType(tx);
    if (flowType === 'income') income += Math.abs(amount);
    if (['expense', 'commitment_payment'].includes(flowType)) expense += Math.abs(amount);
  }
  return { count, income, expense, net: income - expense, currency: normalizeCurrencyCode(rows[0]?.baseCurrencyCode, fallbackCurrency) };
};

export const queryLedgerTransactions = async ({
  namespace = 'guest', limit = 250, cursor = null, search = '', flowType = null,
  categoryId = null, walletId = null, scope = null, fromDate = null, toDate = null,
  archived = false, year = null, transactionClass = null,
} = {}) => {
  const directDb = await getLedgerDb();
  if (directDb && await v7IsSourceOfTruth(directDb, namespace)) {
    return queryV7TransactionPage(directDb, {
      namespace, limit, cursor, search, flowType, categoryId, walletId, scope,
      fromDate, toDate, archived, year, transactionClass,
    });
  }
  const db = await openDb();
  if (!db) return { rows: [], nextCursor: null, supported: false };
  const clauses = ['namespace = ?', 'deleted_at IS NULL'];
  const params = [ns(namespace)];
  if (archived) clauses.push('archived_at IS NOT NULL'); else clauses.push('archived_at IS NULL');
  if (Number.isInteger(Number(year))) { clauses.push('date_iso LIKE ?'); params.push(`${Number(year)}-%`); }
  if (scope && scope !== 'all') { clauses.push('scope = ?'); params.push(String(scope)); }
  if (flowType) { clauses.push('flow_type = ?'); params.push(String(flowType)); }
  if (transactionClass === 'income') clauses.push("flow_type = 'income'");
  if (transactionClass === 'expense') clauses.push("flow_type IN ('expense','commitment_payment')");
  if (transactionClass === 'transfer') clauses.push("kind = 'transfer'");
  if (transactionClass === 'goal') clauses.push("flow_type = 'goal_allocation'");
  if (transactionClass === 'debt') clauses.push("flow_type IN ('debt_payment','receivable_collection')");
  if (transactionClass === 'commitment') clauses.push("json_extract(payload_json, '$.isCommitmentPayment') = 1");
  if (categoryId) { clauses.push('category_id = ?'); params.push(String(categoryId)); }
  if (walletId) {
    clauses.push('(wallet_id = ? OR from_wallet_id = ? OR to_wallet_id = ?)');
    params.push(String(walletId), String(walletId), String(walletId));
  }
  if (fromDate) { clauses.push('date_iso >= ?'); params.push(String(fromDate)); }
  if (toDate) { clauses.push('date_iso <= ?'); params.push(String(toDate)); }
  const q = String(search || '').trim().toLowerCase();
  if (q) { clauses.push('search_text LIKE ?'); params.push(`%${q}%`); }
  if (cursor?.dateISO) {
    clauses.push('(date_iso < ? OR (date_iso = ? AND ts < ?) OR (date_iso = ? AND ts = ? AND id < ?))');
    params.push(cursor.dateISO, cursor.dateISO, Number(cursor.ts || 0), cursor.dateISO, Number(cursor.ts || 0), String(cursor.id || ''));
  }
  const pageSize = Math.max(1, Math.min(Number(limit) || 250, 1000));
  params.push(pageSize + 1);
  const rows = await db.getAllAsync(
    `SELECT * FROM ledger_transactions WHERE ${clauses.join(' AND ')}
      ORDER BY date_iso DESC, ts DESC, id DESC LIMIT ?`,
    ...params,
  );
  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize).map(decodeTxRow);
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: hasMore && last ? { dateISO: last.dateISO, ts: Number(last.ts || 0), id: last.id } : null,
    supported: true,
  };
};

export const queryLedgerSummary = async ({ namespace = 'guest', fromDate = null, toDate = null, scope = null, walletId = null, includeArchived = false } = {}) => {
  const directDb = await getLedgerDb();
  if (directDb && await v7IsSourceOfTruth(directDb, namespace)) {
    const clauses = ['t.namespace=?', 't.deleted_at IS NULL', "t.status='posted'", "COALESCE(json_extract(t.payload_json,'$.hiddenFromHistory'),0)<>1"];
    const params = [ns(namespace)];
    if (!includeArchived) clauses.push('t.archived_at IS NULL');
    if (fromDate) { clauses.push('t.date_iso>=?'); params.push(String(fromDate)); }
    if (toDate) { clauses.push('t.date_iso<=?'); params.push(String(toDate)); }
    if (scope && scope !== 'all') { clauses.push('t.scope=?'); params.push(String(scope)); }
    if (walletId && walletId !== 'all') {
      clauses.push(`EXISTS (SELECT 1 FROM ledger_postings_v7 wp
        WHERE wp.namespace=t.namespace AND wp.transaction_id=t.id AND wp.account_id=?)`);
      params.push(String(walletId));
    }
    const missing = await directDb.getFirstAsync(
      `SELECT COUNT(*) AS count FROM ledger_financial_transactions_v7 t
        WHERE ${clauses.join(' AND ')}
          AND COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind) IN ('income','expense','commitment_payment')
          AND json_extract(t.payload_json,'$.baseAmountMinor') IS NULL`,
      ...params,
    );
    if (Number(missing?.count || 0) > 0) {
      return { supported: false, source: 'sqlite_v7', reason: 'missing_base_minor' };
    }
    const row = await directDb.getFirstAsync(
      `SELECT COUNT(*) AS count,
              SUM(CASE WHEN COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind)='income' THEN ABS(CAST(COALESCE(json_extract(t.payload_json,'$.baseAmountMinor'),0) AS INTEGER)) ELSE 0 END) AS income_minor,
              SUM(CASE WHEN COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind) IN ('expense','commitment_payment') THEN ABS(CAST(COALESCE(json_extract(t.payload_json,'$.baseAmountMinor'),0) AS INTEGER)) ELSE 0 END)
                + SUM(CASE WHEN t.kind='transfer' THEN ABS(CAST(COALESCE(json_extract(t.payload_json,'$.feeBaseAmountMinor'),0) AS INTEGER)) ELSE 0 END) AS expense_minor,
              MAX(COALESCE(json_extract(t.payload_json,'$.baseCurrencyCode'),'IQD')) AS base_currency
         FROM ledger_financial_transactions_v7 t
        WHERE ${clauses.join(' AND ')}`,
      ...params,
    );
    const currency = normalizeCurrencyCode(row?.base_currency, 'IQD');
    const income = moneyFromMinor(Number(row?.income_minor || 0), currency);
    const expense = moneyFromMinor(Number(row?.expense_minor || 0), currency);
    return {
      supported: true, source: 'sqlite_v7', count: Number(row?.count || 0),
      income, expense, net: income - expense, currency,
    };
  }
  const db = await openDb();
  if (!db) return null;
  const clauses = ['namespace = ?', 'deleted_at IS NULL'];
  const params = [ns(namespace)];
  if (!includeArchived) clauses.push('archived_at IS NULL');
  if (fromDate) { clauses.push('date_iso >= ?'); params.push(String(fromDate)); }
  if (toDate) { clauses.push('date_iso <= ?'); params.push(String(toDate)); }
  if (scope && scope !== 'all') { clauses.push('scope = ?'); params.push(String(scope)); }
  if (walletId && walletId !== 'all') {
    clauses.push('(wallet_id = ? OR from_wallet_id = ? OR to_wallet_id = ?)');
    params.push(String(walletId), String(walletId), String(walletId));
  }
  const selectedWallet = walletId && walletId !== 'all' ? String(walletId) : null;
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS count,
            SUM(CASE WHEN flow_type = 'income' THEN ABS(base_amount_minor) ELSE 0 END) AS income_minor,
            SUM(CASE WHEN flow_type IN ('expense','commitment_payment') THEN ABS(base_amount_minor) ELSE 0 END)
                + SUM(CASE WHEN kind = 'transfer' AND (? IS NULL OR from_wallet_id = ?) THEN ABS(fee_base_minor) ELSE 0 END) AS expense_minor,
            MAX(base_currency) AS base_currency
       FROM ledger_transactions WHERE ${clauses.join(' AND ')}`,
    selectedWallet, selectedWallet, ...params,
  );
  const currency = normalizeCurrencyCode(row?.base_currency, 'IQD');
  const income = moneyFromMinor(row?.income_minor || 0, currency);
  const expense = moneyFromMinor(row?.expense_minor || 0, currency);
  return { count: Number(row?.count || 0), income, expense, net: income - expense, currency };
};

export const queryLedgerCategorySpend = async ({
  namespace = 'guest', fromDate = null, toDate = null, scope = null, walletId = null, includeArchived = false,
} = {}) => {
  const directDb = await getLedgerDb();
  if (directDb && await v7IsSourceOfTruth(directDb, namespace)) {
    const clauses = ['t.namespace=?', 't.deleted_at IS NULL', "t.status='posted'", "COALESCE(json_extract(t.payload_json,'$.hiddenFromHistory'),0)<>1"];
    const params = [ns(namespace)];
    if (!includeArchived) clauses.push('t.archived_at IS NULL');
    if (fromDate) { clauses.push('t.date_iso>=?'); params.push(String(fromDate)); }
    if (toDate) { clauses.push('t.date_iso<=?'); params.push(String(toDate)); }
    if (scope && scope !== 'all') { clauses.push('t.scope=?'); params.push(String(scope)); }
    if (walletId && walletId !== 'all') {
      clauses.push(`EXISTS (SELECT 1 FROM ledger_postings_v7 wp
        WHERE wp.namespace=t.namespace AND wp.transaction_id=t.id AND wp.account_id=?)`);
      params.push(String(walletId));
    }
    const missing = await directDb.getFirstAsync(
      `SELECT COUNT(*) AS count FROM ledger_financial_transactions_v7 t
        WHERE ${clauses.join(' AND ')} AND COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind) IN ('expense','commitment_payment')
          AND json_extract(t.payload_json,'$.baseAmountMinor') IS NULL`,
      ...params,
    );
    if (Number(missing?.count || 0) > 0) {
      return { supported: false, source: 'sqlite_v7', reason: 'missing_base_minor', rows: [] };
    }
    const rows = await directDb.getAllAsync(
      `SELECT COALESCE(t.category_id,'other') AS category_id,
              SUM(CASE WHEN COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind) IN ('expense','commitment_payment')
                       THEN ABS(CAST(COALESCE(json_extract(t.payload_json,'$.baseAmountMinor'),0) AS INTEGER)) ELSE 0 END)
                + SUM(CASE WHEN t.kind='transfer'
                           THEN ABS(CAST(COALESCE(json_extract(t.payload_json,'$.feeBaseAmountMinor'),0) AS INTEGER)) ELSE 0 END) AS spent_minor,
              MAX(COALESCE(json_extract(t.payload_json,'$.baseCurrencyCode'),'IQD')) AS base_currency
         FROM ledger_financial_transactions_v7 t
        WHERE ${clauses.join(' AND ')}
          AND (COALESCE(json_extract(t.payload_json,'$.flowType'),t.kind) IN ('expense','commitment_payment') OR (t.kind='transfer' AND COALESCE(json_extract(t.payload_json,'$.feeBaseAmountMinor'),0)<>0))
        GROUP BY COALESCE(t.category_id,'other')
        ORDER BY spent_minor DESC`,
      ...params,
    );
    return {
      supported: true, source: 'sqlite_v7',
      rows: rows.map(row => {
        const currency = normalizeCurrencyCode(row?.base_currency, 'IQD');
        return { categoryId: row?.category_id || 'other', spent: moneyFromMinor(Number(row?.spent_minor || 0), currency), currency };
      }),
    };
  }
  const db = await openDb();
  if (!db) return { rows: [], supported: false };
  const clauses = ['namespace = ?', 'deleted_at IS NULL'];
  const params = [ns(namespace)];
  if (!includeArchived) clauses.push('archived_at IS NULL');
  if (fromDate) { clauses.push('date_iso >= ?'); params.push(String(fromDate)); }
  if (toDate) { clauses.push('date_iso <= ?'); params.push(String(toDate)); }
  if (scope && scope !== 'all') { clauses.push('scope = ?'); params.push(String(scope)); }
  if (walletId && walletId !== 'all') {
    clauses.push('(wallet_id = ? OR from_wallet_id = ? OR to_wallet_id = ?)');
    params.push(String(walletId), String(walletId), String(walletId));
  }
  const selectedWallet = walletId && walletId !== 'all' ? String(walletId) : null;
  const rows = await db.getAllAsync(
    `SELECT COALESCE(category_id, 'other') AS category_id,
            SUM(CASE WHEN flow_type IN ('expense','commitment_payment') THEN ABS(base_amount_minor) ELSE 0 END)
              + SUM(CASE WHEN kind = 'transfer' AND (? IS NULL OR from_wallet_id = ?) THEN ABS(fee_base_minor) ELSE 0 END) AS spent_minor,
            MAX(base_currency) AS base_currency
       FROM ledger_transactions
      WHERE ${clauses.join(' AND ')}
        AND (flow_type IN ('expense','commitment_payment') OR (kind = 'transfer' AND fee_base_minor > 0))
      GROUP BY COALESCE(category_id, 'other')
      ORDER BY spent_minor DESC`,
    selectedWallet, selectedWallet, ...params,
  );
  return {
    supported: true,
    rows: rows.map(row => {
      const currency = normalizeCurrencyCode(row?.base_currency, 'IQD');
      return { categoryId: row?.category_id || 'other', spent: moneyFromMinor(row?.spent_minor || 0, currency), currency };
    }),
  };
};

export const queryLedgerWalletPositions = async ({ namespace = 'guest', scope = null } = {}) => {
  const directDb = await getLedgerDb();
  if (directDb && await v7IsSourceOfTruth(directDb, namespace)) {
    const params = [ns(namespace)];
    let scopeClause = '';
    if (scope && scope !== 'all') { scopeClause = ' AND a.scope=?'; params.push(String(scope)); }
    const rows = await directDb.getAllAsync(
      `SELECT a.id,a.name,a.account_type,a.scope,a.currency_code,a.status,
              COALESCE(SUM(CASE WHEN p.bucket='physical' AND t.status='posted' AND t.deleted_at IS NULL THEN p.amount_minor ELSE 0 END),0) AS physical_minor,
              COALESCE(SUM(CASE WHEN p.bucket='reserved' AND t.status='posted' AND t.deleted_at IS NULL THEN p.amount_minor ELSE 0 END),0) AS reserved_minor
         FROM ledger_accounts_v7 a
    LEFT JOIN ledger_postings_v7 p ON p.namespace=a.namespace AND p.account_id=a.id
    LEFT JOIN ledger_financial_transactions_v7 t ON t.namespace=p.namespace AND t.id=p.transaction_id
        WHERE a.namespace=? AND a.status<>'deleted'${scopeClause}
        GROUP BY a.id,a.name,a.account_type,a.scope,a.currency_code,a.status
        ORDER BY a.id`,
      ...params,
    );
    return {
      supported: true, source: 'sqlite_v7',
      rows: rows.map(row => {
        const currency = normalizeCurrencyCode(row.currency_code, 'IQD');
        const physical = moneyFromMinor(Number(row.physical_minor || 0), currency);
        const reserved = moneyFromMinor(Number(row.reserved_minor || 0), currency);
        return {
          id: String(row.id), name: row.name || '', type: row.account_type || 'other', scope: row.scope || 'personal',
          currency, status: row.status || 'active', physicalBalance: physical, reservedBalance: reserved,
          availableBalance: physical - reserved,
        };
      }),
    };
  }
  return { supported: false, source: 'legacy', rows: [] };
};

export const exportLedgerTransactions = async (namespace = 'guest') => {
  const directDb = await getLedgerDb();
  if (directDb && await v7IsSourceOfTruth(directDb, namespace)) {
    return queryV7PayloadRows(directDb, { namespace, archived: null });
  }
  const db = await openDb();
  if (!db) return [];
  const rows = await db.getAllAsync(
    `SELECT * FROM ledger_transactions WHERE namespace = ? AND deleted_at IS NULL ORDER BY date_iso DESC, ts DESC, id DESC`,
    ns(namespace),
  );
  return rows.map(decodeTxRow);
};


export const exportArchivedLedgerTransactions = async (namespace = 'guest') => {
  const directDb = await getLedgerDb();
  if (directDb && await v7IsSourceOfTruth(directDb, namespace)) {
    return queryV7PayloadRows(directDb, { namespace, archived: true });
  }
  const db = await openDb();
  if (!db) return [];
  const rows = await db.getAllAsync(
    `SELECT * FROM ledger_transactions
      WHERE namespace = ? AND archived_at IS NOT NULL AND deleted_at IS NULL
      ORDER BY date_iso DESC, ts DESC, id DESC`,
    ns(namespace),
  );
  return rows.map(decodeTxRow);
};

export const exportArchivedLedgerYear = async ({ namespace = 'guest', year, scope = null } = {}) => {
  const directDb = await getLedgerDb();
  if (directDb && await v7IsSourceOfTruth(directDb, namespace)) {
    return queryV7PayloadRows(directDb, { namespace, archived: true, year, scope });
  }
  const db = await openDb();
  const targetYear = Number(year);
  if (!db || !Number.isInteger(targetYear)) return [];
  const params = [ns(namespace), targetYear];
  let sql = `SELECT * FROM ledger_transactions
      WHERE namespace = ? AND archived_at IS NOT NULL AND deleted_at IS NULL AND archive_year = ?`;
  if (scope && scope !== 'all') { sql += ' AND scope = ?'; params.push(String(scope)); }
  sql += ' ORDER BY date_iso DESC, ts DESC, id DESC';
  const rows = await db.getAllAsync(sql, ...params);
  return rows.map(decodeTxRow);
};

export const upsertMonthlyBudgetMap = async ({
  namespace = 'guest',
  scope = 'personal',
  monthKey = '',
  budgets = {},
  currency = 'IQD',
  source = 'manual',
} = {}) => {
  const db = await openDb();
  if (!db || !/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return false;
  const namespaceValue = ns(namespace);
  const rows = Object.entries(budgets || {}).filter(([, value]) => Number(value) > 0);
  return enqueueWrite(async () => {
    await runLedgerExclusiveTransaction(db, async (txn) => {
      await txn.runAsync(
        'DELETE FROM ledger_monthly_budgets WHERE namespace = ? AND scope = ? AND month_key = ?',
        namespaceValue, String(scope || 'personal'), String(monthKey),
      );
      const updatedAt = new Date().toISOString();
      for (const [categoryId, amount] of rows) {
        await txn.runAsync(
          `INSERT OR REPLACE INTO ledger_monthly_budgets
            (namespace,scope,month_key,category_id,currency_code,amount_minor,source,accepted_suggestion,dismissed_suggestion,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          namespaceValue, String(scope || 'personal'), String(monthKey), String(categoryId),
          normalizeCurrencyCode(currency), moneyToMinor(amount, currency), String(source || 'manual'),
          source === 'suggested' ? 1 : 0, 0, updatedAt,
        );
      }
    });
    return true;
  });
};

export const loadMonthlyBudgetMap = async ({ namespace = 'guest', scope = 'personal', monthKey = '', currency = 'IQD' } = {}) => {
  const db = await openDb();
  if (!db || !/^\d{4}-\d{2}$/.test(String(monthKey || ''))) return {};
  const rows = await db.getAllAsync(
    `SELECT category_id, amount_minor, currency_code FROM ledger_monthly_budgets
      WHERE namespace = ? AND scope = ? AND month_key = ?`,
    ns(namespace), String(scope || 'personal'), String(monthKey),
  );
  return Object.fromEntries(rows.map(row => [
    row.category_id,
    moneyFromMinor(row.amount_minor, row.currency_code || currency),
  ]));
};

export const cloneLedgerNamespace = async (sourceNamespace, targetNamespace, { replace = false } = {}) => {
  const db = await openDb();
  if (!db) return false;
  const source = ns(sourceNamespace);
  const target = ns(targetNamespace);
  if (source === target) return true;
  return enqueueWrite(async () => {
    await runLedgerExclusiveTransaction(db, async (txn) => {
      if (replace) {
        await txn.runAsync('DELETE FROM ledger_transactions WHERE namespace = ?', target);
        await txn.runAsync('DELETE FROM ledger_wallets WHERE namespace = ?', target);
        await txn.runAsync('DELETE FROM ledger_monthly_budgets WHERE namespace = ?', target);
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO ledger_wallets
          (namespace,id,name,wallet_type,scope,currency_code,opening_minor,opening_base_minor,base_currency,valuation_rate,payload_json,updated_at)
         SELECT ?,id,name,wallet_type,scope,currency_code,opening_minor,opening_base_minor,base_currency,valuation_rate,payload_json,updated_at
           FROM ledger_wallets WHERE namespace = ?`,
        target, source,
      );
      await txn.runAsync(
        `INSERT OR REPLACE INTO ledger_monthly_budgets
          (namespace,scope,month_key,category_id,currency_code,amount_minor,source,accepted_suggestion,dismissed_suggestion,updated_at)
         SELECT ?,scope,month_key,category_id,currency_code,amount_minor,source,accepted_suggestion,dismissed_suggestion,updated_at
           FROM ledger_monthly_budgets WHERE namespace = ?`,
        target, source,
      );
      await txn.runAsync(
        `INSERT OR REPLACE INTO ledger_transactions
          (namespace,id,scope,date_iso,ts,kind,flow_type,wallet_id,from_wallet_id,to_wallet_id,category_id,
           wallet_currency,base_currency,wallet_amount_minor,base_amount_minor,transfer_from_minor,transfer_to_minor,
           transfer_from_currency,transfer_to_currency,exchange_rate,fee_minor,fee_base_minor,search_text,archive_year,archived_at,deleted_at,payload_json,updated_at)
         SELECT ?,id,scope,date_iso,ts,kind,flow_type,wallet_id,from_wallet_id,to_wallet_id,category_id,
           wallet_currency,base_currency,wallet_amount_minor,base_amount_minor,transfer_from_minor,transfer_to_minor,
           transfer_from_currency,transfer_to_currency,exchange_rate,fee_minor,fee_base_minor,search_text,archive_year,archived_at,deleted_at,payload_json,updated_at
           FROM ledger_transactions WHERE namespace = ?`,
        target, source,
      );
    });
    return true;
  });
};

export const clearLedgerNamespace = async (namespace = 'guest') => {
  const db = await openDb();
  if (!db) return true;
  const namespaceValue = ns(namespace);
  return enqueueWrite(async () => {
    await db.runAsync('DELETE FROM ledger_transactions WHERE namespace = ?', namespaceValue);
    await db.runAsync('DELETE FROM ledger_wallets WHERE namespace = ?', namespaceValue);
    await db.runAsync('DELETE FROM ledger_outbox WHERE namespace = ?', namespaceValue);
    await db.runAsync('DELETE FROM ledger_monthly_budgets WHERE namespace = ?', namespaceValue);
    return true;
  });
};

export const getLedgerDataHealth = async ({ namespace = 'guest', walletIds = [], expectedActiveCount = null } = {}) => {
  const directDb = await getLedgerDb();
  if (directDb && await v7IsSourceOfTruth(directDb, namespace)) {
    const namespaceValue = ns(namespace);
    const issues = [];
    const invalidDates = await directDb.getFirstAsync(
      `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7
        WHERE namespace=? AND deleted_at IS NULL AND date_iso NOT GLOB '????-??-??'`, namespaceValue,
    );
    if (Number(invalidDates?.n || 0)) issues.push({ code: 'invalid_dates', count: Number(invalidDates.n) });
    const missingPostings = await directDb.getFirstAsync(
      `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 tx
        WHERE tx.namespace=? AND tx.deleted_at IS NULL AND NOT EXISTS (
          SELECT 1 FROM ledger_postings_v7 p WHERE p.namespace=tx.namespace AND p.transaction_id=tx.id
        )`, namespaceValue,
    );
    if (Number(missingPostings?.n || 0)) issues.push({ code: 'transactions_without_postings', count: Number(missingPostings.n) });
    const invalidTransfers = await directDb.getFirstAsync(
      `SELECT COUNT(*) AS n FROM (
         SELECT tx.id,
                SUM(CASE WHEN p.role='transfer_source' AND p.amount_minor<0 THEN 1 ELSE 0 END) AS sources,
                SUM(CASE WHEN p.role='transfer_destination' AND p.amount_minor>0 THEN 1 ELSE 0 END) AS destinations
           FROM ledger_financial_transactions_v7 tx
           LEFT JOIN ledger_postings_v7 p ON p.namespace=tx.namespace AND p.transaction_id=tx.id
          WHERE tx.namespace=? AND tx.deleted_at IS NULL AND tx.kind='transfer'
          GROUP BY tx.id HAVING sources<>1 OR destinations<>1
       )`, namespaceValue,
    );
    if (Number(invalidTransfers?.n || 0)) issues.push({ code: 'invalid_transfer_legs', count: Number(invalidTransfers.n) });
    const invalidCurrencies = await directDb.getFirstAsync(
      `SELECT COUNT(*) AS n FROM ledger_postings_v7 p
        LEFT JOIN ledger_accounts_v7 a ON a.namespace=p.namespace AND a.id=p.account_id
       WHERE p.namespace=? AND (a.id IS NULL OR a.currency_code<>p.currency_code)`, namespaceValue,
    );
    if (Number(invalidCurrencies?.n || 0)) issues.push({ code: 'posting_currency_mismatch', count: Number(invalidCurrencies.n) });
    if (expectedActiveCount != null && Number.isFinite(Number(expectedActiveCount))) {
      const active = await directDb.getFirstAsync(
        `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7
          WHERE namespace=? AND deleted_at IS NULL AND archived_at IS NULL
            AND COALESCE(json_extract(payload_json,'$.hiddenFromHistory'),0)<>1`, namespaceValue,
      );
      const actual = Number(active?.n || 0);
      const expected = Number(expectedActiveCount || 0);
      if (actual !== expected) issues.push({ code: 'active_count_mismatch', expected, actual });
    }
    const outbox = await directDb.getFirstAsync(
      `SELECT COUNT(*) AS n FROM ledger_outbox_v2 WHERE namespace=? AND acknowledged_at IS NULL`, namespaceValue,
    );
    if (Number(outbox?.n || 0) > 5000) issues.push({ code: 'sync_outbox_backlog', count: Number(outbox.n) });
    const known = new Set((Array.isArray(walletIds) ? walletIds : []).filter(Boolean).map(String));
    if (known.size) {
      const accounts = await directDb.getAllAsync(
        `SELECT DISTINCT account_id FROM ledger_postings_v7 p
          JOIN ledger_financial_transactions_v7 tx ON tx.namespace=p.namespace AND tx.id=p.transaction_id
         WHERE p.namespace=? AND tx.deleted_at IS NULL AND tx.archived_at IS NULL`, namespaceValue,
      );
      const orphanCount = accounts.filter(row => !known.has(String(row.account_id))).length;
      if (orphanCount) issues.push({ code: 'orphan_wallet_refs', count: orphanCount });
    }
    return { ok: issues.length === 0, supported: true, engine: 'sqlite_v7', issues };
  }
  const db = await openDb();
  if (!db) return { ok: true, supported: false, issues: [] };
  const namespaceValue = ns(namespace);
  const issues = [];
  const invalidDates = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM ledger_transactions WHERE namespace = ? AND deleted_at IS NULL AND date_iso NOT GLOB '????-??-??'`,
    namespaceValue,
  );
  if (Number(invalidDates?.n || 0) > 0) issues.push({ code: 'invalid_dates', count: Number(invalidDates.n) });
  const sameWalletTransfers = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM ledger_transactions WHERE namespace = ? AND deleted_at IS NULL AND kind = 'transfer' AND from_wallet_id = to_wallet_id`,
    namespaceValue,
  );
  if (Number(sameWalletTransfers?.n || 0) > 0) issues.push({ code: 'same_wallet_transfers', count: Number(sameWalletTransfers.n) });
  const invalidTransfers = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM ledger_transactions
      WHERE namespace = ? AND deleted_at IS NULL AND kind = 'transfer'
        AND (transfer_from_minor <= 0 OR transfer_to_minor <= 0 OR exchange_rate <= 0)`,
    namespaceValue,
  );
  if (Number(invalidTransfers?.n || 0) > 0) issues.push({ code: 'invalid_transfer_amounts', count: Number(invalidTransfers.n) });
  const invalidCurrencyRows = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM ledger_transactions
      WHERE namespace = ? AND deleted_at IS NULL
        AND (base_currency IS NULL OR base_currency = '' OR exchange_rate <= 0)`,
    namespaceValue,
  );
  if (Number(invalidCurrencyRows?.n || 0) > 0) issues.push({ code: 'invalid_currency_metadata', count: Number(invalidCurrencyRows.n) });
  if (expectedActiveCount != null && Number.isFinite(Number(expectedActiveCount))) {
    const active = await db.getFirstAsync(
      `SELECT COUNT(*) AS n FROM ledger_transactions WHERE namespace = ? AND deleted_at IS NULL AND archived_at IS NULL`,
      namespaceValue,
    );
    const actual = Number(active?.n || 0);
    const expected = Number(expectedActiveCount || 0);
    if (actual !== expected) issues.push({ code: 'active_count_mismatch', expected, actual });
  }
  const outbox = await db.getFirstAsync('SELECT COUNT(*) AS n FROM ledger_outbox WHERE namespace = ?', namespaceValue);
  if (Number(outbox?.n || 0) > 5000) issues.push({ code: 'sync_outbox_backlog', count: Number(outbox.n) });
  const known = new Set((Array.isArray(walletIds) ? walletIds : []).filter(Boolean).map(String));
  if (known.size) {
    const refs = await db.getAllAsync(
      `SELECT id,wallet_id,from_wallet_id,to_wallet_id FROM ledger_transactions WHERE namespace = ? AND deleted_at IS NULL`,
      namespaceValue,
    );
    let orphanCount = 0;
    refs.forEach(row => {
      [row.wallet_id, row.from_wallet_id, row.to_wallet_id].filter(Boolean).forEach(id => {
        if (!known.has(String(id))) orphanCount += 1;
      });
    });
    if (orphanCount) issues.push({ code: 'orphan_wallet_refs', count: orphanCount });
  }
  return { ok: issues.length === 0, supported: true, issues };
};

export const drainLedgerOutbox = async (namespace = 'guest', limit = 200) => {
  const db = await openDb();
  if (!db) return [];
  return db.getAllAsync(
    `SELECT * FROM ledger_outbox WHERE namespace = ? ORDER BY id ASC LIMIT ?`,
    ns(namespace), Math.max(1, Math.min(Number(limit) || 200, 1000)),
  );
};

export const acknowledgeLedgerOutbox = async (namespace = 'guest', throughId = null) => {
  const db = await openDb();
  if (!db || throughId == null) return false;
  await enqueueWrite(() => db.runAsync('DELETE FROM ledger_outbox WHERE namespace = ? AND id <= ?', ns(namespace), Number(throughId)));
  return true;
};

// Non-blocking compatibility bridge: every Zustand transaction mutation is
// mirrored to SQLite after the UI state has committed. Multiple rapid set()
// calls are collapsed into one diff (important for linked debt/goal updates).
const mirrorPending = new Map();
const mirrorTimers = new Map();

const txFingerprint = tx => [
  tx?.id, tx?.dateISO, tx?.ts, tx?.amt, tx?.walletAmount, tx?.transferFromAmount,
  tx?.transferToAmount, tx?.walletId, tx?.fromWalletId, tx?.toWalletId, tx?.cat,
  tx?.note, tx?.title, tx?.archivedAt, tx?.allocationReleased, tx?.recurring,
  tx?.exchangeRate, tx?.walletCurrency,
].map(value => String(value ?? '')).join('|');

const diffTransactionArraysFast = (before = [], after = []) => {
  const left = Array.isArray(before) ? before : [];
  const right = Array.isArray(after) ? after : [];
  if (left === right) return { changed: [], removed: [] };

  // Most MYFI mutations preserve row order and object identity for untouched rows.
  // Detect those paths without building maps/fingerprints for thousands of records.
  if (left.length === right.length) {
    let sameOrder = true;
    const changed = [];
    for (let i = 0; i < right.length; i += 1) {
      const prior = left[i];
      const next = right[i];
      if (String(prior?.id || '') !== String(next?.id || '')) { sameOrder = false; break; }
      if (prior !== next && txFingerprint(prior) !== txFingerprint(next)) changed.push(next);
    }
    if (sameOrder) return { changed, removed: [] };
  }

  // Common prepend path (new transaction / linked payment).
  const addedCount = right.length - left.length;
  if (addedCount > 0 && addedCount <= 16) {
    // Zustand prepend mutations preserve object identity for the untouched
    // suffix. Sample the first/middle/last references so a 100k add remains
    // O(1) instead of walking the entire ledger just to prove the suffix.
    const suffixLooksPreserved = left.length === 0 || (
      left[0] === right[addedCount]
      && left[Math.floor(left.length / 2)] === right[addedCount + Math.floor(left.length / 2)]
      && left[left.length - 1] === right[right.length - 1]
    );
    if (suffixLooksPreserved) return { changed: right.slice(0, addedCount), removed: [] };
    let suffixMatches = true;
    for (let i = 0; i < left.length; i += 1) {
      if (String(left[i]?.id || '') !== String(right[i + addedCount]?.id || '')) { suffixMatches = false; break; }
    }
    if (suffixMatches) return { changed: right.slice(0, addedCount), removed: [] };
  }

  // Common filter/delete path. Order is preserved, so a two-pointer scan is enough.
  if (left.length > right.length && left.length - right.length <= 64) {
    const removed = [];
    let i = 0; let j = 0; let valid = true;
    while (i < left.length && j < right.length) {
      if (String(left[i]?.id || '') === String(right[j]?.id || '')) {
        i += 1; j += 1;
      } else {
        removed.push(String(left[i]?.id || ''));
        i += 1;
        if (removed.length > 64) { valid = false; break; }
      }
    }
    while (valid && i < left.length) { removed.push(String(left[i]?.id || '')); i += 1; }
    if (valid && j === right.length && removed.length === left.length - right.length) {
      return { changed: [], removed: removed.filter(Boolean) };
    }
  }

  // Structural reorder/bulk replacement fallback.
  const beforeMap = new Map(left.filter(item => item?.id).map(item => [String(item.id), item]));
  const afterMap = new Map(right.filter(item => item?.id).map(item => [String(item.id), item]));
  const changed = [];
  afterMap.forEach((item, id) => {
    const prior = beforeMap.get(id);
    if (!prior || (prior !== item && txFingerprint(prior) !== txFingerprint(item))) changed.push(item);
  });
  const removed = [];
  beforeMap.forEach((_item, id) => { if (!afterMap.has(id)) removed.push(id); });
  return { changed, removed };
};

const processMirrorJob = async (namespaceValue, { throwOnError = false } = {}) => {
  const timer = mirrorTimers.get(namespaceValue);
  if (timer) clearTimeout(timer);
  mirrorTimers.delete(namespaceValue);
  const job = mirrorPending.get(namespaceValue);
  mirrorPending.delete(namespaceValue);
  if (!job) return;
  try {
    const { changed, removed } = diffTransactionArraysFast(job.before, job.after);
    if (changed.length) {
      const committedV7 = changed.filter(item => Number(item?.storageEngineVersion || 0) >= 7 && item?.sqliteCommittedAt);
      const legacyFirst = changed.filter(item => !committedV7.includes(item));
      if (legacyFirst.length) {
        await upsertLedgerTransactions({
          namespace: namespaceValue,
          transactions: legacyFirst,
          wallets: job.wallets,
          baseCurrency: job.baseCurrency,
          outbox: true,
        });
      }
      if (committedV7.length) {
        // Keep the V6 compatibility read table warm, but the authoritative V7
        // commit already created its atomic outbox mutation.
        await upsertLedgerTransactions({
          namespace: namespaceValue,
          transactions: committedV7,
          wallets: job.wallets,
          baseCurrency: job.baseCurrency,
          outbox: false,
        });
      }
    } else {
      const db = await openDb();
      if (db) await enqueueWrite(() => upsertWalletsInternal(db, namespaceValue, job.wallets, job.baseCurrency));
    }
    if (removed.length) await softDeleteLedgerTransactions(namespaceValue, removed, 'zustand_mirror_remove');
  } catch (error) {
    console.warn('[LEDGER] compatibility mirror failed', error);
    if (throwOnError) throw error;
  }
};

export const queueLedgerStateDiff = ({
  namespace = 'guest', beforeTransactions = [], afterTransactions = [], wallets = [], baseCurrency = 'IQD',
} = {}) => {
  if (!activeLedgerSupported()) return;
  const namespaceValue = ns(namespace);
  const pending = mirrorPending.get(namespaceValue) || {
    before: Array.isArray(beforeTransactions) ? beforeTransactions : [],
    after: [], wallets: [], baseCurrency,
  };
  // Preserve the earliest before-state in a collapsed batch.
  if (!mirrorPending.has(namespaceValue)) pending.before = Array.isArray(beforeTransactions) ? beforeTransactions : [];
  pending.after = Array.isArray(afterTransactions) ? afterTransactions : [];
  pending.wallets = Array.isArray(wallets) ? wallets : [];
  pending.baseCurrency = baseCurrency || 'IQD';
  mirrorPending.set(namespaceValue, pending);
  if (mirrorTimers.has(namespaceValue)) clearTimeout(mirrorTimers.get(namespaceValue));
  mirrorTimers.set(namespaceValue, setTimeout(() => { processMirrorJob(namespaceValue); }, 80));
};

export const flushLedgerMirror = async () => {
  const namespaces = [...mirrorPending.keys()];
  for (const namespaceValue of namespaces) await processMirrorJob(namespaceValue, { throwOnError: true });
  await flushLedgerWrites();
};
