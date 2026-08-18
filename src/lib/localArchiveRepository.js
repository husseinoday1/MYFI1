// MYFI_LOCAL_COLD_ARCHIVE_V5_3
// Completed years live here as a relational, indexed cold archive instead of
// remaining in the hot Zustand transaction array. This database is a local
// performance/archive layer; the encrypted vault remains the active workspace
// safety boundary and external MYFI archive packages remain portable backups.
import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';
// Shared connection initializes: PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON.
import { defaultScopeForProfile, normalizeScope } from './modules';

const readyDatabases = new WeakSet();

const safeJson = value => {
  try { return JSON.stringify(value ?? null); } catch { return 'null'; }
};

const parseJson = (value, fallback = null) => {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};

const normalizeNamespace = value => String(value || 'guest').trim() || 'guest';
const normalizeArchiveScope = (value, cfg = {}) => {
  const raw = String(value || '').trim();
  if (raw === 'all' || raw === 'personal' || raw === 'business') return raw;
  return defaultScopeForProfile(cfg?.profileType);
};

export const getColdArchiveNamespace = (workspaceNamespace = 'guest', cfg = {}) => (
  cfg?.performanceTestMode
    ? `${normalizeNamespace(workspaceNamespace)}::performance-test`
    : normalizeNamespace(workspaceNamespace)
);

const openDb = async () => {
  const db = await getLedgerDb();
  if (!db) return null;
  if (readyDatabases.has(db)) return db;
  await enqueueLedgerWrite(async () => {
    if (readyDatabases.has(db)) return;
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS cold_archive_years (
      namespace TEXT NOT NULL,
      scope TEXT NOT NULL,
      year INTEGER NOT NULL,
      archived_at TEXT NOT NULL,
      checksum TEXT,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      income REAL NOT NULL DEFAULT 0,
      expense REAL NOT NULL DEFAULT 0,
      net REAL NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL,
      PRIMARY KEY (namespace, scope, year)
    );
    CREATE TABLE IF NOT EXISTS cold_archive_transactions (
      namespace TEXT NOT NULL,
      scope TEXT NOT NULL,
      year INTEGER NOT NULL,
      id TEXT NOT NULL,
      date_iso TEXT,
      ts INTEGER NOT NULL DEFAULT 0,
      wallet_id TEXT,
      category_id TEXT,
      flow_type TEXT,
      search_text TEXT,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (namespace, scope, year, id),
      FOREIGN KEY (namespace, scope, year)
        REFERENCES cold_archive_years(namespace, scope, year)
        ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cold_archive_date
      ON cold_archive_transactions(namespace, scope, year, date_iso DESC, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_cold_archive_wallet
      ON cold_archive_transactions(namespace, scope, year, wallet_id, date_iso DESC);
    CREATE INDEX IF NOT EXISTS idx_cold_archive_category
      ON cold_archive_transactions(namespace, scope, year, category_id, date_iso DESC);
    CREATE INDEX IF NOT EXISTS idx_cold_archive_flow
      ON cold_archive_transactions(namespace, scope, year, flow_type, date_iso DESC);
    `);
    readyDatabases.add(db);
  });
  return db;
};

const transactionSearchText = item => [
  item?.title,
  item?.note,
  item?.dateISO,
  item?.cat,
  item?.walletId,
  item?.fromWalletId,
  item?.toWalletId,
  item?.transactionTag,
].filter(Boolean).join(' ').toLowerCase();

const archiveMetadata = (data = {}, summary = {}) => ({
  debts: Array.isArray(data.debts) ? data.debts : [],
  goals: Array.isArray(data.goals) ? data.goals : [],
  wallets: Array.isArray(data.wallets) ? data.wallets : [],
  commitments: Array.isArray(data.commitments) ? data.commitments : [],
  cats: Array.isArray(data.cats) ? data.cats : [],
  cfg: data.cfg || {},
  archiveScope: data.archiveScope || summary.scope || 'personal',
});

export const storeColdArchiveYear = async ({
  namespace = 'guest', year, scope = 'personal', data = {}, summary = {}, checksum = '',
} = {}) => {
  const targetYear = Number(year);
  const rows = Array.isArray(data?.trans) ? data.trans : [];
  if (!Number.isInteger(targetYear) || !rows.length) return false;
  const db = await openDb();
  if (!db) return false;
  const ns = normalizeNamespace(namespace);
  const archiveScope = normalizeArchiveScope(scope, data?.cfg);
  const archivedAt = summary.archivedAt || new Date().toISOString();
  const metadataJson = safeJson(archiveMetadata(data, { ...summary, scope: archiveScope }));

  await enqueueLedgerWrite(() => runLedgerExclusiveTransaction(db, async (txn) => {
    await txn.runAsync(
      `INSERT INTO cold_archive_years
       (namespace, scope, year, archived_at, checksum, transaction_count, income, expense, net, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(namespace, scope, year) DO UPDATE SET
         archived_at=excluded.archived_at,checksum=excluded.checksum,
         transaction_count=excluded.transaction_count,income=excluded.income,
         expense=excluded.expense,net=excluded.net,metadata_json=excluded.metadata_json`,
      ns,
      archiveScope,
      targetYear,
      archivedAt,
      String(checksum || summary.checksum || ''),
      rows.length,
      Number(summary.income || 0),
      Number(summary.expense || 0),
      Number(summary.net || 0),
      metadataJson,
    );
    await txn.runAsync(
      'DELETE FROM cold_archive_transactions WHERE namespace = ? AND scope = ? AND year = ?',
      ns,
      archiveScope,
      targetYear,
    );

    const statement = await txn.prepareAsync(`
      INSERT INTO cold_archive_transactions
      (namespace, scope, year, id, date_iso, ts, wallet_id, category_id, flow_type, search_text, payload_json)
      VALUES ($namespace, $scope, $year, $id, $date, $ts, $wallet, $category, $flow, $search, $payload)
      ON CONFLICT(namespace, scope, year, id) DO UPDATE SET
        date_iso=excluded.date_iso,ts=excluded.ts,wallet_id=excluded.wallet_id,
        category_id=excluded.category_id,flow_type=excluded.flow_type,
        search_text=excluded.search_text,payload_json=excluded.payload_json
    `);
    try {
      for (let index = 0; index < rows.length; index += 1) {
        const item = rows[index] || {};
        await statement.executeAsync({
          $namespace: ns,
          $scope: archiveScope,
          $year: targetYear,
          $id: String(item.id || `archive-${targetYear}-${index}`),
          $date: String(item.dateISO || ''),
          $ts: Number(item.ts || 0),
          $wallet: String(item.walletId || item.fromWalletId || ''),
          $category: String(item.cat || ''),
          $flow: String(item.flowType || item.kind || ''),
          $search: transactionSearchText(item),
          $payload: safeJson(item),
        });
        if (index > 0 && index % 750 === 0) {
          // Give React Native a frame between large archive batches.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } finally {
      await statement.finalizeAsync();
    }
  }));
  return true;
};

export const storeColdArchiveYears = async ({ namespace = 'guest', archives = [] } = {}) => {
  for (const archive of Array.isArray(archives) ? archives : []) {
    const ok = await storeColdArchiveYear({ namespace, ...archive });
    if (!ok) return false;
  }
  return true;
};

export const listColdArchiveYears = async (namespace = 'guest') => {
  const db = await openDb();
  if (!db) return [];
  const ns = normalizeNamespace(namespace);
  const rows = await db.getAllAsync(
    `SELECT scope, year, archived_at, checksum, transaction_count, income, expense, net
       FROM cold_archive_years
      WHERE namespace = ?
      ORDER BY year DESC, scope ASC`,
    ns,
  );
  return rows.map(row => ({
    scope: row.scope,
    year: Number(row.year),
    archivedAt: row.archived_at,
    checksum: row.checksum || '',
    count: Number(row.transaction_count || 0),
    income: Number(row.income || 0),
    expense: Number(row.expense || 0),
    net: Number(row.net || 0),
    local: true,
  }));
};

export const loadColdArchiveYear = async ({ namespace = 'guest', year, scope = 'personal' } = {}) => {
  const db = await openDb();
  if (!db) return null;
  const ns = normalizeNamespace(namespace);
  const targetYear = Number(year);
  const archiveScope = normalizeArchiveScope(scope);
  const header = await db.getFirstAsync(
    `SELECT archived_at, checksum, transaction_count, income, expense, net, metadata_json
       FROM cold_archive_years
      WHERE namespace = ? AND scope = ? AND year = ?`,
    ns,
    archiveScope,
    targetYear,
  );
  if (!header) return null;
  const rows = await db.getAllAsync(
    `SELECT payload_json
       FROM cold_archive_transactions
      WHERE namespace = ? AND scope = ? AND year = ?
      ORDER BY date_iso DESC, ts DESC, id DESC`,
    ns,
    archiveScope,
    targetYear,
  );
  const metadata = parseJson(header.metadata_json, {}) || {};
  const trans = rows.map(row => parseJson(row.payload_json, null)).filter(Boolean);
  return {
    payload: {
      format: 'MYFI',
      schemaVersion: 1,
      kind: 'year_archive',
      createdAt: header.archived_at,
      range: { year: targetYear, from: `${targetYear}-01-01`, to: `${targetYear}-12-31` },
      counts: { transactions: trans.length },
      data: { ...metadata, trans },
    },
    checksum: header.checksum || '',
    encrypted: false,
    passwordRequired: false,
    kind: 'year_archive',
    localArchive: true,
    name: `MYFI Local Archive ${targetYear}`,
  };
};

export const clearColdArchives = async (namespace = 'guest') => {
  const db = await openDb();
  if (!db) return true;
  const ns = normalizeNamespace(namespace);
  await enqueueLedgerWrite(() => db.runAsync('DELETE FROM cold_archive_years WHERE namespace = ?', ns));
  return true;
};

// Exporting/restoring the cold archive is intentionally explicit and happens only
// for a backup/restore operation. Day-to-day screens never hydrate every archived
// year into JavaScript memory.
export const exportColdArchives = async (namespace = 'guest') => {
  const ns = normalizeNamespace(namespace);
  const headers = await listColdArchiveYears(ns);
  const result = [];
  for (const header of headers) {
    const loaded = await loadColdArchiveYear({ namespace: ns, year: header.year, scope: header.scope });
    if (!loaded?.payload?.data) continue;
    result.push({
      year: header.year,
      scope: header.scope,
      checksum: header.checksum || '',
      summary: {
        year: header.year,
        scope: header.scope,
        archivedAt: header.archivedAt,
        checksum: header.checksum || '',
        count: header.count,
        income: header.income,
        expense: header.expense,
        net: header.net,
      },
      data: loaded.payload.data,
    });
  }
  return result;
};

export const replaceColdArchives = async (namespace = 'guest', archives = []) => {
  const db = await openDb();
  if (!db) return Array.isArray(archives) && archives.length === 0;
  const ns = normalizeNamespace(namespace);
  const incoming = Array.isArray(archives) ? archives : [];
  const stageNamespace = `${ns}::restore-stage::${Date.now()}`;

  // Stage the complete incoming archive first. The active archive remains untouched
  // until the final SQLite transaction, so a failed import cannot erase old years.
  await clearColdArchives(stageNamespace);
  if (incoming.length) {
    const staged = await storeColdArchiveYears({ namespace: stageNamespace, archives: incoming });
    if (!staged) {
      await clearColdArchives(stageNamespace);
      return false;
    }
  }

  try {
    await enqueueLedgerWrite(() => runLedgerExclusiveTransaction(db, async (txn) => {
      await txn.runAsync('DELETE FROM cold_archive_years WHERE namespace = ?', ns);
      if (incoming.length) {
        await txn.runAsync(
          `INSERT INTO cold_archive_years
             (namespace, scope, year, archived_at, checksum, transaction_count, income, expense, net, metadata_json)
           SELECT ?, scope, year, archived_at, checksum, transaction_count, income, expense, net, metadata_json
             FROM cold_archive_years
            WHERE namespace = ?`,
          ns,
          stageNamespace,
        );
        await txn.runAsync(
          `INSERT INTO cold_archive_transactions
             (namespace, scope, year, id, date_iso, ts, wallet_id, category_id, flow_type, search_text, payload_json)
           SELECT ?, scope, year, id, date_iso, ts, wallet_id, category_id, flow_type, search_text, payload_json
             FROM cold_archive_transactions
            WHERE namespace = ?`,
          ns,
          stageNamespace,
        );
      }
      await txn.runAsync('DELETE FROM cold_archive_years WHERE namespace = ?', stageNamespace);
    }));
    return true;
  } catch (error) {
    await clearColdArchives(stageNamespace).catch(() => {});
    throw error;
  }
};
