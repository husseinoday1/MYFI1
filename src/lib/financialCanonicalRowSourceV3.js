// Phase 10 / P10-013A — bounded canonical SQLite row source.
//
// This is deliberately an isolated read adapter. It owns neither the shared database
// connection nor a transaction, and is not called by backup, restore, Undo or UI code
// yet. A future coordinator must pass its already-owned transaction-scoped executor.

export const CANONICAL_ROW_SOURCE_V3_SECTIONS = Object.freeze([
  'financialConfig', 'accounts', 'exchangeRates', 'transactions', 'postings',
  'links', 'entities', 'archiveHeaders', 'archiveRecords',
]);

export const CANONICAL_ROW_SOURCE_V3_BATCH_POLICY = Object.freeze({
  version: 1,
  defaultMaxRows: 128,
  defaultMaxBytes: 128 * 1024,
  absoluteMaxRows: 512,
  absoluteMaxBytes: 1024 * 1024,
  absoluteMaxRowBytes: 256 * 1024,
});

const text = value => String(value ?? '');
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const failed = reason => ({ supported: true, ok: false, reason });
const parseJson = value => {
  try { return value === null || value === undefined ? null : JSON.parse(String(value)); } catch { return null; }
};
const utf8Bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const validPositiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

const readBudget = ({ maxRows, maxBytes }) => {
  const policy = CANONICAL_ROW_SOURCE_V3_BATCH_POLICY;
  const rows = maxRows === undefined ? policy.defaultMaxRows : Number(maxRows);
  const bytes = maxBytes === undefined ? policy.defaultMaxBytes : Number(maxBytes);
  if (!validPositiveInteger(rows) || rows > policy.absoluteMaxRows) return null;
  if (!validPositiveInteger(bytes) || bytes > policy.absoluteMaxBytes) return null;
  return { maxRows: rows, maxBytes: bytes };
};

const cursorId = cursor => {
  if (cursor === null || cursor === undefined) return { ok: true, id: null };
  if (!isObject(cursor) || !Object.prototype.hasOwnProperty.call(cursor, 'id')) return { ok: false };
  return { ok: true, id: text(cursor.id) };
};

const cursorEntity = cursor => {
  if (cursor === null || cursor === undefined) return { ok: true, entityType: null, id: null };
  if (!isObject(cursor) || !Object.prototype.hasOwnProperty.call(cursor, 'entityType')
      || !Object.prototype.hasOwnProperty.call(cursor, 'id')) return { ok: false };
  return { ok: true, entityType: text(cursor.entityType), id: text(cursor.id) };
};

const cursorArchiveHeader = cursor => {
  if (cursor === null || cursor === undefined) return { ok: true, year: null, scope: null };
  if (!isObject(cursor) || !Number.isInteger(Number(cursor.year))
      || !Object.prototype.hasOwnProperty.call(cursor, 'scope')) return { ok: false };
  return { ok: true, year: Number(cursor.year), scope: text(cursor.scope) };
};

const cursorArchiveRecord = cursor => {
  if (cursor === null || cursor === undefined) return { ok: true, scope: null, year: null, id: null };
  if (!isObject(cursor) || !Number.isInteger(Number(cursor.year))
      || !Object.prototype.hasOwnProperty.call(cursor, 'scope')
      || !Object.prototype.hasOwnProperty.call(cursor, 'id')) return { ok: false };
  return { ok: true, scope: text(cursor.scope), year: Number(cursor.year), id: text(cursor.id) };
};

const rowId = row => ({ id: text(row.id) });
const rowEntity = row => ({ entityType: text(row.entity_type), id: text(row.id) });
const rowArchiveHeader = row => ({ year: Number(row.year), scope: text(row.scope) });
const rowArchiveRecord = row => ({ scope: text(row.scope), year: Number(row.year), id: text(row.id) });

const mapAccount = row => ({
  id: text(row.id), accountType: text(row.account_type), scope: text(row.scope),
  currencyCode: text(row.currency_code), status: text(row.status), name: row.name,
  createdAt: row.created_at, updatedAt: row.updated_at, archivedAt: row.archived_at,
});
const mapExchangeRate = row => ({
  id: text(row.id), baseCurrencyCode: text(row.base_currency_code), quoteCurrencyCode: text(row.quote_currency_code),
  numerator: Number(row.numerator), denominator: Number(row.denominator), rateDate: text(row.rate_date),
  source: text(row.source), capturedAt: row.captured_at,
});
const mapTransaction = row => ({
  id: text(row.id), revision: Number(row.revision), payload: parseJson(row.payload_json),
  archiveYear: row.archive_year, archivedAt: row.archived_at, deletedAt: row.deleted_at,
  storage: {
    kind: row.kind, status: row.status, scope: row.scope, dateISO: row.date_iso,
    occurredAt: row.occurred_at, categoryId: row.category_id, title: row.title, note: row.note,
    sourceType: row.source_type, sourceId: row.source_id, idempotencyKey: row.idempotency_key,
    deviceId: row.device_id, createdAt: row.created_at, updatedAt: row.updated_at,
  },
});
const mapPosting = row => ({
  id: text(row.id), transactionId: text(row.transaction_id), accountId: text(row.account_id),
  bucket: text(row.bucket), role: text(row.role), amountMinor: Number(row.amount_minor),
  currencyCode: text(row.currency_code), exchangeRateId: row.exchange_rate_id || null, createdAt: row.created_at,
});
const mapLink = row => ({
  id: text(row.id), transactionId: text(row.transaction_id), linkType: text(row.link_type),
  linkId: text(row.link_id), relation: text(row.relation), appliedAmountMinor: Number(row.applied_amount_minor || 0),
  currencyCode: row.currency_code || null, createdAt: row.created_at,
});
const mapEntity = row => ({
  entityType: text(row.entity_type), id: text(row.id), revision: Number(row.revision),
  deletedAt: row.deleted_at, payload: parseJson(row.payload_json), createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapArchiveHeader = row => ({
  year: Number(row.year), scope: text(row.scope), archivedAt: row.archived_at, checksum: row.checksum || '',
  summary: {
    year: Number(row.year), scope: text(row.scope), archivedAt: row.archived_at, checksum: row.checksum || '',
    count: Number(row.transaction_count || 0), income: Number(row.income || 0),
    expense: Number(row.expense || 0), net: Number(row.net || 0),
  },
  metadata: parseJson(row.metadata_json),
});
const mapArchiveRecord = row => ({
  year: Number(row.year), scope: text(row.scope), id: text(row.id), data: parseJson(row.payload_json),
});

const sectionQuery = ({ section, namespace, cursor, limit }) => {
  const base = [namespace];
  if (section === 'accounts') {
    const current = cursorId(cursor); if (!current.ok) return null;
    const where = current.id === null ? '' : ' AND id COLLATE BINARY > ?';
    return { sql: `SELECT id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at FROM ledger_accounts_v7 WHERE namespace=?${where} ORDER BY id COLLATE BINARY LIMIT ?`, params: current.id === null ? [...base, limit] : [...base, current.id, limit], map: mapAccount, next: rowId };
  }
  if (section === 'exchangeRates') {
    const current = cursorId(cursor); if (!current.ok) return null;
    const where = current.id === null ? '' : ' AND id COLLATE BINARY > ?';
    return { sql: `SELECT id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at FROM ledger_exchange_rates_v7 WHERE namespace=?${where} ORDER BY id COLLATE BINARY LIMIT ?`, params: current.id === null ? [...base, limit] : [...base, current.id, limit], map: mapExchangeRate, next: rowId };
  }
  if (section === 'transactions') {
    const current = cursorId(cursor); if (!current.ok) return null;
    const where = current.id === null ? '' : ' AND id COLLATE BINARY > ?';
    return { sql: `SELECT id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at FROM ledger_financial_transactions_v7 WHERE namespace=?${where} ORDER BY id COLLATE BINARY LIMIT ?`, params: current.id === null ? [...base, limit] : [...base, current.id, limit], map: mapTransaction, next: rowId };
  }
  if (section === 'postings') {
    const current = cursorId(cursor); if (!current.ok) return null;
    const where = current.id === null ? '' : ' AND id COLLATE BINARY > ?';
    return { sql: `SELECT id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at FROM ledger_postings_v7 WHERE namespace=?${where} ORDER BY id COLLATE BINARY LIMIT ?`, params: current.id === null ? [...base, limit] : [...base, current.id, limit], map: mapPosting, next: rowId };
  }
  if (section === 'links') {
    const current = cursorId(cursor); if (!current.ok) return null;
    const where = current.id === null ? '' : ' AND id COLLATE BINARY > ?';
    return { sql: `SELECT id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at FROM ledger_transaction_links_v7 WHERE namespace=?${where} ORDER BY id COLLATE BINARY LIMIT ?`, params: current.id === null ? [...base, limit] : [...base, current.id, limit], map: mapLink, next: rowId };
  }
  if (section === 'entities') {
    const current = cursorEntity(cursor); if (!current.ok) return null;
    const where = current.entityType === null ? '' : ' AND (entity_type COLLATE BINARY > ? OR (entity_type COLLATE BINARY = ? AND id COLLATE BINARY > ?))';
    return { sql: `SELECT entity_type,id,revision,deleted_at,payload_json,created_at,updated_at FROM ledger_entities_v7 WHERE namespace=?${where} ORDER BY entity_type COLLATE BINARY,id COLLATE BINARY LIMIT ?`, params: current.entityType === null ? [...base, limit] : [...base, current.entityType, current.entityType, current.id, limit], map: mapEntity, next: rowEntity };
  }
  if (section === 'archiveHeaders') {
    const current = cursorArchiveHeader(cursor); if (!current.ok) return null;
    const where = current.year === null ? '' : ' AND (year > ? OR (year = ? AND scope COLLATE BINARY > ?))';
    return { sql: `SELECT scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json FROM cold_archive_years WHERE namespace=?${where} ORDER BY year ASC,scope COLLATE BINARY LIMIT ?`, params: current.year === null ? [...base, limit] : [...base, current.year, current.year, current.scope, limit], map: mapArchiveHeader, next: rowArchiveHeader };
  }
  if (section === 'archiveRecords') {
    const current = cursorArchiveRecord(cursor); if (!current.ok) return null;
    const where = current.scope === null ? '' : ' AND (scope COLLATE BINARY > ? OR (scope COLLATE BINARY = ? AND (year > ? OR (year = ? AND id COLLATE BINARY > ?))))';
    return { sql: `SELECT scope,year,id,payload_json FROM cold_archive_transactions WHERE namespace=?${where} ORDER BY scope COLLATE BINARY,year ASC,id COLLATE BINARY LIMIT ?`, params: current.scope === null ? [...base, limit] : [...base, current.scope, current.scope, current.year, current.year, current.id, limit], map: mapArchiveRecord, next: rowArchiveRecord };
  }
  return null;
};

const collectRows = async ({ database, query, budget }) => {
  if (typeof database?.getEachAsync !== 'function') return failed('canonical_row_source_iterator_unavailable');
  const rows = [];
  let byteCount = 0;
  let hasMore = false;
  // One extra row distinguishes a short result from a full batch without retaining it.
  const iterator = database.getEachAsync(query.sql, query.params);
  for await (const raw of iterator) {
    if (rows.length >= budget.maxRows) { hasMore = true; break; }
    const row = query.map(raw);
    const rowBytes = utf8Bytes(row);
    if (!Number.isSafeInteger(rowBytes) || rowBytes > CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.absoluteMaxRowBytes) {
      return failed('canonical_row_source_row_too_large');
    }
    if (rows.length && byteCount + rowBytes > budget.maxBytes) { hasMore = true; break; }
    rows.push(row);
    byteCount += rowBytes;
  }
  return {
    supported: true,
    ok: true,
    rows,
    byteCount,
    hasMore,
    nextCursor: rows.length ? query.next(rows[rows.length - 1]) : null,
  };
};

/**
 * Read one bounded canonical section. It is read-only and has no ambient-database
 * fallback: callers must pass the executor whose lifetime they own.
 */
export const readCanonicalRowBatchV3 = async ({
  database, namespace, section, cursor = null, maxRows, maxBytes,
} = {}) => {
  const target = text(namespace).trim();
  if (!database) return failed('canonical_row_source_database_required');
  if (!target) return failed('canonical_row_source_namespace_required');
  if (!CANONICAL_ROW_SOURCE_V3_SECTIONS.includes(section)) return failed('canonical_row_source_section_invalid');
  if (section === 'financialConfig') {
    if (cursor !== null && cursor !== undefined) return failed('canonical_row_source_cursor_invalid');
    if (typeof database.getFirstAsync !== 'function') return failed('canonical_row_source_iterator_unavailable');
    const row = await database.getFirstAsync(
      'SELECT source_mode,schema_version,payload_json,updated_at FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1', target,
    );
    if (!row) return { supported: true, ok: true, rows: [], byteCount: 0, hasMore: false, nextCursor: null };
    const value = { sourceMode: row.source_mode, schemaVersion: Number(row.schema_version), payloadJson: row.payload_json, updatedAt: row.updated_at };
    const bytes = utf8Bytes(value);
    if (bytes > CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.absoluteMaxRowBytes) return failed('canonical_row_source_row_too_large');
    return { supported: true, ok: true, rows: [value], byteCount: bytes, hasMore: false, nextCursor: null };
  }
  const budget = readBudget({ maxRows, maxBytes });
  if (!budget) return failed('canonical_row_source_batch_budget_invalid');
  const query = sectionQuery({ section, namespace: target, cursor, limit: budget.maxRows + 1 });
  if (!query) return failed('canonical_row_source_cursor_invalid');
  return collectRows({ database, query, budget });
};
