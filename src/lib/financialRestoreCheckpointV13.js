// Phase 10 / P10-013 Strategy B — bounded SQL-native Undo checkpoint capture.
// Financial payloads stay inside SQLite: JavaScript sees only bounded keys, byte
// estimates, counters and the small financial workspace config.

import { CANONICAL_ROW_SOURCE_V3_BATCH_POLICY } from './financialCanonicalRowSourceV3';
import { pickFinancialBackupConfig } from './backupData';
import { readRestoreStartSnapshotInTransactionV13 } from './financialRestoreStartSnapshotV13';

export const RESTORE_CHECKPOINT_V13_VERSION = 1;
export const RESTORE_CHECKPOINT_V13_STATE_COPYING = 'COPYING';
export const RESTORE_CHECKPOINT_V13_STATE_PROVING = 'PROVING_CHECKPOINT';

const SECTIONS = Object.freeze([
  'accounts','exchangeRates','transactions','postings','links','entities','archiveHeaders','archiveRecords',
]);
const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const parse = value => { try { const v = JSON.parse(String(value ?? '')); return object(v) ? v : null; } catch { return null; } };
const safeJson = value => JSON.stringify(value);
const privateNamespace = value => /::(?:shadow-stage|restore-stage|restore-checkpoint)::/.test(text(value));
const checkpointKey = (namespace, checkpointId) => `canonical_restore_checkpoint_v13:${namespace}:${checkpointId}`;
const exactCheckpointNamespace = (namespace, checkpointId) => `${namespace}::restore-checkpoint::${checkpointId}`;
const countMap = Object.freeze({
  accounts: 'accounts', exchangeRates: 'exchangeRates', transactions: 'transactions', postings: 'postings',
  links: 'links', entities: 'entities',
});
const emptyCounts = () => ({ transactions: 0, postings: 0, links: 0, accounts: 0, exchangeRates: 0, entities: 0, coldArchiveBundles: 0, coldArchiveRecords: 0 });

const requireTxn = database => {
  if (!database || typeof database.getFirstAsync !== 'function'
      || typeof database.getEachAsync !== 'function' || typeof database.runAsync !== 'function') {
    throw new Error('restore_checkpoint_transaction_required');
  }
  return database;
};
const budget = ({ maxRows, maxBytes } = {}) => {
  const policy = CANONICAL_ROW_SOURCE_V3_BATCH_POLICY;
  const rows = maxRows === undefined ? policy.defaultMaxRows : maxRows;
  const bytes = maxBytes === undefined ? policy.defaultMaxBytes : maxBytes;
  if (typeof rows !== 'number' || !Number.isSafeInteger(rows) || rows < 1 || rows > policy.absoluteMaxRows
      || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > policy.absoluteMaxBytes) {
    throw new Error('restore_checkpoint_batch_budget_invalid');
  }
  return { maxRows: rows, maxBytes: bytes };
};
const parseWorkspaceFinancialConfig = payloadJson => {
  const payload = parse(payloadJson) || {};
  const cfg = object(payload?.localPreferences?.cfg) ? payload.localPreferences.cfg : (object(payload?.cfg) ? payload.cfg : {});
  return pickFinancialBackupConfig(cfg);
};

const rowSpec = (section, namespace, cursor) => {
  const c = object(cursor) ? cursor : null;
  if (section === 'accounts') return {
    query: `SELECT id, (length(CAST(id AS BLOB))+length(CAST(COALESCE(name,'') AS BLOB))+length(CAST(account_type AS BLOB))+length(CAST(scope AS BLOB))+length(CAST(currency_code AS BLOB))+length(CAST(status AS BLOB))+length(CAST(created_at AS BLOB))+length(CAST(updated_at AS BLOB))+length(CAST(COALESCE(archived_at,'') AS BLOB))+64) AS row_bytes FROM ledger_accounts_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} ORDER BY id COLLATE BINARY LIMIT ?`,
    params: c ? [namespace, text(c.id)] : [namespace], key: row => ({ id: text(row.id) }),
    copy: (target, last) => ({ sql: `INSERT INTO ledger_accounts_v7(namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at) SELECT ?,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at FROM ledger_accounts_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} AND id COLLATE BINARY <= ? ORDER BY id COLLATE BINARY`, params: c ? [target, namespace, text(c.id), text(last.id)] : [target, namespace, text(last.id)] }),
  };
  if (section === 'exchangeRates') return {
    query: `SELECT id, (length(CAST(id AS BLOB))+length(CAST(base_currency_code AS BLOB))+length(CAST(quote_currency_code AS BLOB))+length(CAST(rate_date AS BLOB))+length(CAST(source AS BLOB))+length(CAST(captured_at AS BLOB))+96) AS row_bytes FROM ledger_exchange_rates_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} ORDER BY id COLLATE BINARY LIMIT ?`,
    params: c ? [namespace, text(c.id)] : [namespace], key: row => ({ id: text(row.id) }),
    copy: (target, last) => ({ sql: `INSERT INTO ledger_exchange_rates_v7(namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at) SELECT ?,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at FROM ledger_exchange_rates_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} AND id COLLATE BINARY <= ? ORDER BY id COLLATE BINARY`, params: c ? [target, namespace, text(c.id), text(last.id)] : [target, namespace, text(last.id)] }),
  };
  if (section === 'transactions') return {
    query: `SELECT id, (length(CAST(id AS BLOB))+length(CAST(kind AS BLOB))+length(CAST(status AS BLOB))+length(CAST(scope AS BLOB))+length(CAST(date_iso AS BLOB))+length(CAST(occurred_at AS BLOB))+length(CAST(COALESCE(category_id,'') AS BLOB))+length(CAST(COALESCE(title,'') AS BLOB))+length(CAST(COALESCE(note,'') AS BLOB))+length(CAST(COALESCE(source_type,'') AS BLOB))+length(CAST(COALESCE(source_id,'') AS BLOB))+length(CAST(idempotency_key AS BLOB))+length(CAST(device_id AS BLOB))+length(CAST(COALESCE(archived_at,'') AS BLOB))+length(CAST(COALESCE(deleted_at,'') AS BLOB))+length(CAST(payload_json AS BLOB))+length(CAST(created_at AS BLOB))+length(CAST(updated_at AS BLOB))+128) AS row_bytes FROM ledger_financial_transactions_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} ORDER BY id COLLATE BINARY LIMIT ?`,
    params: c ? [namespace, text(c.id)] : [namespace], key: row => ({ id: text(row.id) }),
    copy: (target, last) => ({ sql: `INSERT INTO ledger_financial_transactions_v7(namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at) SELECT ?,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at FROM ledger_financial_transactions_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} AND id COLLATE BINARY <= ? ORDER BY id COLLATE BINARY`, params: c ? [target, namespace, text(c.id), text(last.id)] : [target, namespace, text(last.id)] }),
  };
  if (section === 'postings') return {
    query: `SELECT id, (length(CAST(id AS BLOB))+length(CAST(transaction_id AS BLOB))+length(CAST(account_id AS BLOB))+length(CAST(bucket AS BLOB))+length(CAST(role AS BLOB))+length(CAST(currency_code AS BLOB))+length(CAST(COALESCE(exchange_rate_id,'') AS BLOB))+length(CAST(created_at AS BLOB))+96) AS row_bytes FROM ledger_postings_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} ORDER BY id COLLATE BINARY LIMIT ?`,
    params: c ? [namespace, text(c.id)] : [namespace], key: row => ({ id: text(row.id) }),
    copy: (target, last) => ({ sql: `INSERT INTO ledger_postings_v7(namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at) SELECT ?,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at FROM ledger_postings_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} AND id COLLATE BINARY <= ? ORDER BY id COLLATE BINARY`, params: c ? [target, namespace, text(c.id), text(last.id)] : [target, namespace, text(last.id)] }),
  };
  if (section === 'links') return {
    query: `SELECT id, (length(CAST(id AS BLOB))+length(CAST(transaction_id AS BLOB))+length(CAST(link_type AS BLOB))+length(CAST(link_id AS BLOB))+length(CAST(relation AS BLOB))+length(CAST(COALESCE(currency_code,'') AS BLOB))+length(CAST(created_at AS BLOB))+80) AS row_bytes FROM ledger_transaction_links_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} ORDER BY id COLLATE BINARY LIMIT ?`,
    params: c ? [namespace, text(c.id)] : [namespace], key: row => ({ id: text(row.id) }),
    copy: (target, last) => ({ sql: `INSERT INTO ledger_transaction_links_v7(namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at) SELECT ?,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at FROM ledger_transaction_links_v7 WHERE namespace=?${c ? ' AND id COLLATE BINARY > ?' : ''} AND id COLLATE BINARY <= ? ORDER BY id COLLATE BINARY`, params: c ? [target, namespace, text(c.id), text(last.id)] : [target, namespace, text(last.id)] }),
  };
  if (section === 'entities') return {
    query: `SELECT entity_type,id, (length(CAST(entity_type AS BLOB))+length(CAST(id AS BLOB))+length(CAST(COALESCE(deleted_at,'') AS BLOB))+length(CAST(payload_json AS BLOB))+length(CAST(created_at AS BLOB))+length(CAST(updated_at AS BLOB))+80) AS row_bytes FROM ledger_entities_v7 WHERE namespace=?${c ? ' AND (entity_type COLLATE BINARY > ? OR (entity_type COLLATE BINARY = ? AND id COLLATE BINARY > ?))' : ''} ORDER BY entity_type COLLATE BINARY,id COLLATE BINARY LIMIT ?`,
    params: c ? [namespace, text(c.entityType), text(c.entityType), text(c.id)] : [namespace], key: row => ({ entityType: text(row.entity_type), id: text(row.id) }),
    copy: (target, last) => ({ sql: `INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) SELECT ?,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at FROM ledger_entities_v7 WHERE namespace=?${c ? ' AND (entity_type COLLATE BINARY > ? OR (entity_type COLLATE BINARY = ? AND id COLLATE BINARY > ?))' : ''} AND (entity_type COLLATE BINARY < ? OR (entity_type COLLATE BINARY = ? AND id COLLATE BINARY <= ?)) ORDER BY entity_type COLLATE BINARY,id COLLATE BINARY`, params: c ? [target, namespace, text(c.entityType), text(c.entityType), text(c.id), text(last.entityType), text(last.entityType), text(last.id)] : [target, namespace, text(last.entityType), text(last.entityType), text(last.id)] }),
  };
  if (section === 'archiveHeaders') return {
    query: `SELECT scope,year, CASE WHEN json_valid(metadata_json) THEN (COALESCE(json_array_length(json_extract(metadata_json,'$.debts')),0)+COALESCE(json_array_length(json_extract(metadata_json,'$.goals')),0)+COALESCE(json_array_length(json_extract(metadata_json,'$.wallets')),0)+COALESCE(json_array_length(json_extract(metadata_json,'$.commitments')),0)+COALESCE(json_array_length(json_extract(metadata_json,'$.cats')),0)) ELSE -1 END AS logical_records, (length(CAST(scope AS BLOB))+length(CAST(COALESCE(checksum,'') AS BLOB))+length(CAST(metadata_json AS BLOB))+length(CAST(archived_at AS BLOB))+96) AS row_bytes FROM cold_archive_years WHERE namespace=?${c ? ' AND (scope COLLATE BINARY,year) > (?,?)' : ''} ORDER BY scope COLLATE BINARY,year ASC LIMIT ?`,
    params: c ? [namespace, text(c.scope), Number(c.year)] : [namespace], key: row => ({ scope: text(row.scope), year: Number(row.year) }),
    logical: row => Number(row.logical_records),
    copy: (target, last) => ({ sql: `INSERT INTO cold_archive_years(namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json) SELECT ?,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json FROM cold_archive_years WHERE namespace=?${c ? ' AND (scope COLLATE BINARY,year) > (?,?)' : ''} AND (scope COLLATE BINARY,year) <= (?,?) ORDER BY scope COLLATE BINARY,year ASC`, params: c ? [target, namespace, text(c.scope), Number(c.year), text(last.scope), Number(last.year)] : [target, namespace, text(last.scope), Number(last.year)] }),
  };
  if (section === 'archiveRecords') return {
    query: `SELECT scope,year,id, 1 AS logical_records, (length(CAST(scope AS BLOB))+length(CAST(id AS BLOB))+length(CAST(COALESCE(date_iso,'') AS BLOB))+length(CAST(COALESCE(wallet_id,'') AS BLOB))+length(CAST(COALESCE(category_id,'') AS BLOB))+length(CAST(COALESCE(flow_type,'') AS BLOB))+length(CAST(COALESCE(search_text,'') AS BLOB))+length(CAST(payload_json AS BLOB))+112) AS row_bytes FROM cold_archive_transactions WHERE namespace=?${c ? ' AND (scope COLLATE BINARY,year,id COLLATE BINARY) > (?,?,?)' : ''} ORDER BY scope COLLATE BINARY,year ASC,id COLLATE BINARY LIMIT ?`,
    params: c ? [namespace, text(c.scope), Number(c.year), text(c.id)] : [namespace], key: row => ({ scope: text(row.scope), year: Number(row.year), id: text(row.id) }),
    logical: () => 1,
    copy: (target, last) => ({ sql: `INSERT INTO cold_archive_transactions(namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json) SELECT ?,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json FROM cold_archive_transactions WHERE namespace=?${c ? ' AND (scope COLLATE BINARY,year,id COLLATE BINARY) > (?,?,?)' : ''} AND (scope COLLATE BINARY,year,id COLLATE BINARY) <= (?,?,?) ORDER BY scope COLLATE BINARY,year ASC,id COLLATE BINARY`, params: c ? [target, namespace, text(c.scope), Number(c.year), text(c.id), text(last.scope), Number(last.year), text(last.id)] : [target, namespace, text(last.scope), Number(last.year), text(last.id)] }),
  };
  throw new Error('restore_checkpoint_section_invalid');
};

const readBoundary = async ({ database, spec, maxRows, maxBytes }) => {
  let rows = 0;
  let bytes = 0;
  let logicalRecords = 0;
  let lastKey = null;
  let hasMore = false;
  const iterator = database.getEachAsync(spec.query, [...spec.params, maxRows + 1]);
  for await (const row of iterator) {
    if (rows >= maxRows) { hasMore = true; break; }
    const rowBytes = Number(row.row_bytes);
    if (!Number.isSafeInteger(rowBytes) || rowBytes < 0 || rowBytes > CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.absoluteMaxRowBytes) {
      throw new Error('restore_checkpoint_row_too_large');
    }
    if (rows > 0 && bytes + rowBytes > maxBytes) { hasMore = true; break; }
    const logical = spec.logical ? spec.logical(row) : 0;
    if (!Number.isSafeInteger(logical) || logical < 0) throw new Error('restore_checkpoint_archive_metadata_invalid');
    rows += 1;
    bytes += rowBytes;
    logicalRecords += logical;
    lastKey = spec.key(row);
  }
  return { rows, bytes, logicalRecords, lastKey, hasMore };
};


// Shared bounded private-namespace copier used by Undo staging. It reuses the exact
// keyset/budget policy as checkpoint capture while allowing a reviewed private source
// and target. The caller owns the transaction and persists its own cursor/state.
export const copyBoundedFinancialNamespaceBatchInTransactionV13 = async ({
  database, sourceNamespace, targetNamespace, section, cursor = null, maxRows, maxBytes, faultInjector,
} = {}) => {
  const txn = requireTxn(database);
  const source = text(sourceNamespace);
  const target = text(targetNamespace);
  if (!source || !target || source === target || !privateNamespace(source) || !privateNamespace(target)
      || !SECTIONS.includes(section)) {
    throw new Error('restore_private_copy_input_invalid');
  }
  const limits = budget({ maxRows, maxBytes });
  const spec = rowSpec(section, source, cursor);
  const boundary = await readBoundary({ database: txn, spec, ...limits });
  if (boundary.rows > 0) {
    const copy = spec.copy(target, boundary.lastKey);
    const inserted = await txn.runAsync(copy.sql, ...copy.params);
    if (Number(inserted?.changes || 0) !== boundary.rows) throw new Error('restore_private_copy_count_mismatch');
    if (typeof faultInjector === 'function') {
      await faultInjector('after_private_copy_before_state', { section, rows: boundary.rows });
    }
  }
  return Object.freeze({
    rows: boundary.rows,
    bytes: boundary.bytes,
    logicalRecords: boundary.logicalRecords,
    nextCursor: boundary.hasMore ? boundary.lastKey : null,
    lastKey: boundary.lastKey,
    hasMore: boundary.hasMore,
  });
};

export const initializeRestoreCheckpointInTransactionV13 = async ({ database, namespace, operationId } = {}) => {
  const txn = requireTxn(database);
  const source = await readRestoreStartSnapshotInTransactionV13({ database: txn, namespace, operationId });
  const targetNamespace = text(source.namespace);
  const operation = text(source.operationId).toLowerCase();
  const checkpointId = text(source.checkpointId).toLowerCase();
  const target = text(source.checkpointNamespace);
  if (!targetNamespace || privateNamespace(targetNamespace) || !operation || !checkpointId
      || target !== exactCheckpointNamespace(targetNamespace, checkpointId)
      || source.status !== 'PREPARING'
      || typeof source.sourceRestoreEpoch !== 'number' || !Number.isSafeInteger(source.sourceRestoreEpoch) || source.sourceRestoreEpoch < 1
      || typeof source.sourceLiveGeneration !== 'number' || !Number.isSafeInteger(source.sourceLiveGeneration) || source.sourceLiveGeneration < 0) {
    throw new Error('restore_checkpoint_start_snapshot_invalid');
  }
  const metaKey = checkpointKey(targetNamespace, checkpointId);
  const existingRow = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', metaKey);
  if (existingRow) {
    const existing = parse(existingRow.value);
    if (!existing || existing.namespace !== targetNamespace || existing.operationId !== operation || existing.checkpointNamespace !== target) {
      throw new Error('restore_checkpoint_state_conflict');
    }
    return Object.freeze({ ...existing });
  }
  for (const table of ['ledger_accounts_v7','ledger_exchange_rates_v7','ledger_financial_transactions_v7','ledger_postings_v7','ledger_transaction_links_v7','ledger_entities_v7','ledger_workspace_state_v7','cold_archive_years','cold_archive_transactions']) {
    const row = await txn.getFirstAsync(`SELECT 1 AS present FROM ${table} WHERE namespace=? LIMIT 1`, target);
    if (row) throw new Error('restore_checkpoint_namespace_not_empty');
  }
  const workspace = await txn.getFirstAsync('SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1', targetNamespace);
  if (!workspace) throw new Error('restore_checkpoint_workspace_missing');
  const financialConfig = parseWorkspaceFinancialConfig(workspace.payload_json);
  const now = new Date().toISOString();
  await txn.runAsync(
    `INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`,
    target, 'shadow', 7, safeJson({ cfg: financialConfig }), now,
  );
  const state = Object.freeze({
    version: RESTORE_CHECKPOINT_V13_VERSION,
    stateVersion: 1,
    status: RESTORE_CHECKPOINT_V13_STATE_COPYING,
    namespace: targetNamespace,
    ledgerId: text(source.ledgerId),
    sourceRestoreEpoch: source.sourceRestoreEpoch,
    sourceLiveGeneration: source.sourceLiveGeneration,
    operationId: operation,
    checkpointId,
    checkpointNamespace: target,
    semanticHashVersion: source.semanticHashVersion,
    validatorVersion: source.validatorVersion,
    batchPolicyVersion: source.batchPolicyVersion,
    sectionIndex: 0,
    section: SECTIONS[0],
    cursor: null,
    counts: emptyCounts(),
    createdAt: now,
    updatedAt: now,
  });
  await txn.runAsync('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', metaKey, safeJson(state), now);
  return state;
};

export const copyNextRestoreCheckpointBatchInTransactionV13 = async ({
  database, namespace, checkpointId, maxRows, maxBytes, faultInjector,
} = {}) => {
  const txn = requireTxn(database);
  const targetNamespace = text(namespace);
  const checkpoint = text(checkpointId).toLowerCase();
  const limits = budget({ maxRows, maxBytes });
  const metaKey = checkpointKey(targetNamespace, checkpoint);
  const row = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', metaKey);
  const state = parse(row?.value);
  if (!state || state.version !== RESTORE_CHECKPOINT_V13_VERSION || state.namespace !== targetNamespace
      || state.checkpointId !== checkpoint || state.checkpointNamespace !== exactCheckpointNamespace(targetNamespace, checkpoint)) {
    throw new Error('restore_checkpoint_state_missing_or_invalid');
  }
  if (state.status === RESTORE_CHECKPOINT_V13_STATE_PROVING) return Object.freeze({ ...state });
  if (state.status !== RESTORE_CHECKPOINT_V13_STATE_COPYING
      || !Number.isSafeInteger(state.sectionIndex) || state.sectionIndex < 0 || state.sectionIndex >= SECTIONS.length
      || state.section !== SECTIONS[state.sectionIndex] || !object(state.counts)) {
    throw new Error('restore_checkpoint_state_invalid');
  }

  const section = state.section;
  const spec = rowSpec(section, targetNamespace, state.cursor);
  const boundary = await readBoundary({ database: txn, spec, ...limits });
  let nextCounts = { ...state.counts };
  if (boundary.rows > 0) {
    const copy = spec.copy(state.checkpointNamespace, boundary.lastKey);
    const inserted = await txn.runAsync(copy.sql, ...copy.params);
    if (Number(inserted?.changes || 0) !== boundary.rows) throw new Error('restore_checkpoint_copy_count_mismatch');
    if (section === 'archiveHeaders') {
      nextCounts.coldArchiveBundles = Number(nextCounts.coldArchiveBundles || 0) + boundary.rows;
      nextCounts.coldArchiveRecords = Number(nextCounts.coldArchiveRecords || 0) + boundary.logicalRecords;
    } else if (section === 'archiveRecords') {
      nextCounts.coldArchiveRecords = Number(nextCounts.coldArchiveRecords || 0) + boundary.rows;
    } else {
      const countKey = countMap[section];
      nextCounts[countKey] = Number(nextCounts[countKey] || 0) + boundary.rows;
    }
    if (typeof faultInjector === 'function') await faultInjector('after_copy_before_checkpoint_state', { section, rows: boundary.rows });
  }

  let nextSectionIndex = state.sectionIndex;
  let nextCursor = boundary.lastKey;
  let nextStatus = RESTORE_CHECKPOINT_V13_STATE_COPYING;
  // A short batch with no extra row completes the section. Empty sections also advance.
  if (!boundary.hasMore) {
    nextSectionIndex += 1;
    nextCursor = null;
    if (nextSectionIndex >= SECTIONS.length) nextStatus = RESTORE_CHECKPOINT_V13_STATE_PROVING;
  }
  const now = new Date().toISOString();
  const next = {
    ...state,
    stateVersion: Number(state.stateVersion) + 1,
    status: nextStatus,
    sectionIndex: nextStatus === RESTORE_CHECKPOINT_V13_STATE_PROVING ? SECTIONS.length : nextSectionIndex,
    section: nextStatus === RESTORE_CHECKPOINT_V13_STATE_PROVING ? null : SECTIONS[nextSectionIndex],
    cursor: nextCursor,
    counts: nextCounts,
    lastBatchRows: boundary.rows,
    lastBatchBytes: boundary.bytes,
    updatedAt: now,
  };
  const updated = await txn.runAsync(
    'UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?', safeJson(next), now, metaKey, String(row.value),
  );
  if (Number(updated?.changes || 0) !== 1) throw new Error('restore_checkpoint_state_compare_and_swap_failed');
  return Object.freeze(next);
};
