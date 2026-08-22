// Phase 10 / P10-013 — bounded streaming semantic hash V3.
// Uses the existing V3 canonical row/config policies; only framing/iteration is new.

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import {
  SEMANTIC_HASH_V3_VERSION,
  stableSemanticJsonV3,
  compareCanonicalTextV3,
  canonicalizeFinancialConfigItemV3,
  canonicalizeFinancialAccountItemV3,
  canonicalizeFinancialExchangeRateItemV3,
  canonicalizeFinancialTransactionItemV3,
  canonicalizeFinancialPostingItemV3,
  canonicalizeFinancialLinkItemV3,
  canonicalizeFinancialEntityItemV3,
  canonicalizeFinancialArchiveMetadataV3,
} from './financialSemanticProjection';
import {
  CANONICAL_ROW_SOURCE_V3_BATCH_POLICY,
  readCanonicalRowBatchV3,
} from './financialCanonicalRowSourceV3';

const encoder = new TextEncoder();
const text = value => String(value ?? '');
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const parseObject = value => { try { const v = JSON.parse(String(value ?? '')); return object(v) ? v : null; } catch { return null; } };
const write = (hash, value) => hash.update(encoder.encode(value));
const sortedKeys = value => Object.keys(value).sort(compareCanonicalTextV3);
const quoteKey = key => JSON.stringify(key);

const ITEM_CANONICALIZER = Object.freeze({
  accounts: canonicalizeFinancialAccountItemV3,
  exchangeRates: canonicalizeFinancialExchangeRateItemV3,
  transactions: canonicalizeFinancialTransactionItemV3,
  postings: canonicalizeFinancialPostingItemV3,
  links: canonicalizeFinancialLinkItemV3,
  entities: canonicalizeFinancialEntityItemV3,
});

const readBatchBudget = ({ maxRows, maxBytes } = {}) => {
  const policy = CANONICAL_ROW_SOURCE_V3_BATCH_POLICY;
  const rows = maxRows === undefined ? policy.defaultMaxRows : maxRows;
  const bytes = maxBytes === undefined ? policy.defaultMaxBytes : maxBytes;
  if (typeof rows !== 'number' || !Number.isSafeInteger(rows) || rows < 1 || rows > policy.absoluteMaxRows
      || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > policy.absoluteMaxBytes) {
    throw new Error('semantic_stream_batch_budget_invalid');
  }
  return { maxRows: rows, maxBytes: bytes };
};

const streamArraySection = async ({ hash, database, namespace, section, budget }) => {
  write(hash, '[');
  let cursor = null;
  let first = true;
  while (true) {
    const batch = await readCanonicalRowBatchV3({
      database, namespace, section, cursor, maxRows: budget.maxRows, maxBytes: budget.maxBytes,
    });
    if (!batch?.ok) throw new Error(batch?.reason || 'semantic_stream_row_source_failed');
    const canonicalize = ITEM_CANONICALIZER[section];
    for (const row of batch.rows) {
      if (!first) write(hash, ',');
      write(hash, stableSemanticJsonV3(canonicalize(row)));
      first = false;
    }
    if (!batch.hasMore) break;
    if (!batch.nextCursor) throw new Error('semantic_stream_cursor_missing');
    cursor = batch.nextCursor;
  }
  write(hash, ']');
};

// R1: archive transaction rows are keyset-paged by both row count and byte budget.
// The SQL query itself is bounded with LIMIT maxRows+1; only rows accepted into the
// current page advance the cursor. A single row may exceed maxBytes only up to the
// hard absoluteMaxRowBytes limit, matching the canonical row-source policy.
const streamArchiveTransactions = async ({ hash, database, namespace, scope, year, budget }) => {
  write(hash, '[');
  let cursor = null;
  let first = true;
  while (true) {
    const params = [namespace, scope, year];
    const where = cursor === null ? '' : ' AND id COLLATE BINARY > ?';
    if (cursor !== null) params.push(cursor);
    params.push(budget.maxRows + 1);
    const iterator = database.getEachAsync(
      `SELECT id,payload_json,
              (length(CAST(id AS BLOB))+length(CAST(payload_json AS BLOB))+32) AS row_bytes
         FROM cold_archive_transactions
        WHERE namespace=? AND scope=? AND year=?${where}
        ORDER BY id COLLATE BINARY
        LIMIT ?`,
      params,
    );
    let rows = 0;
    let bytes = 0;
    let lastId = null;
    let hasMore = false;
    for await (const row of iterator) {
      if (rows >= budget.maxRows) { hasMore = true; break; }
      const rowBytes = Number(row.row_bytes);
      if (!Number.isSafeInteger(rowBytes) || rowBytes < 0
          || rowBytes > CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.absoluteMaxRowBytes) {
        throw new Error('semantic_stream_archive_row_too_large');
      }
      if (rows > 0 && bytes + rowBytes > budget.maxBytes) { hasMore = true; break; }
      const payload = parseObject(row.payload_json);
      const id = text(row.id);
      if (!payload || text(payload.id) !== id) throw new Error('semantic_stream_archive_payload_invalid');
      if (!first) write(hash, ',');
      write(hash, stableSemanticJsonV3(payload));
      first = false;
      rows += 1;
      bytes += rowBytes;
      lastId = id;
    }
    if (!hasMore) break;
    if (!lastId) throw new Error('semantic_stream_archive_cursor_missing');
    cursor = lastId;
  }
  write(hash, ']');
};

const streamArchiveData = async ({ hash, database, namespace, header, budget }) => {
  if (!object(header.metadata)) throw new Error('semantic_stream_archive_metadata_invalid');
  const metadata = canonicalizeFinancialArchiveMetadataV3(header.metadata);
  const dataKeys = sortedKeys({ ...metadata, trans: null });
  write(hash, '{');
  for (let index = 0; index < dataKeys.length; index += 1) {
    const key = dataKeys[index];
    if (index) write(hash, ',');
    write(hash, `${quoteKey(key)}:`);
    if (key !== 'trans') {
      write(hash, stableSemanticJsonV3(metadata[key]));
      continue;
    }
    await streamArchiveTransactions({
      hash, database, namespace, scope: text(header.scope), year: Number(header.year), budget,
    });
  }
  write(hash, '}');
};

// R1: archive headers use the same bounded canonical row source as all other
// sections. This removes the final unbounded getEachAsync path from Batch B.
const streamArchives = async ({ hash, database, namespace, budget }) => {
  write(hash, '[');
  let cursor = null;
  let firstArchive = true;
  while (true) {
    const batch = await readCanonicalRowBatchV3({
      database,
      namespace,
      section: 'archiveHeaders',
      cursor,
      maxRows: budget.maxRows,
      maxBytes: budget.maxBytes,
    });
    if (!batch?.ok) throw new Error(batch?.reason || 'semantic_stream_archive_header_source_failed');
    for (const header of batch.rows) {
      if (!object(header.metadata)) throw new Error('semantic_stream_archive_metadata_invalid');
      if (!firstArchive) write(hash, ',');
      firstArchive = false;
      // stableSemanticJsonV3 sorts archive keys as checksum,data,scope,summary,year.
      write(hash, '{"checksum":');
      write(hash, stableSemanticJsonV3(text(header.checksum || '')));
      write(hash, ',"data":');
      await streamArchiveData({ hash, database, namespace, header, budget });
      write(hash, ',"scope":');
      write(hash, stableSemanticJsonV3(text(header.scope)));
      write(hash, ',"summary":');
      write(hash, stableSemanticJsonV3(header.summary));
      write(hash, ',"year":');
      write(hash, stableSemanticJsonV3(Number(header.year)));
      write(hash, '}');
    }
    if (!batch.hasMore) break;
    if (!batch.nextCursor) throw new Error('semantic_stream_archive_header_cursor_missing');
    cursor = batch.nextCursor;
  }
  write(hash, ']');
};

export const semanticHashNamespaceV3Bounded = async ({
  database, namespace, ledgerId, maxRows, maxBytes,
} = {}) => {
  if (!database?.getEachAsync || !text(namespace) || !text(ledgerId)) throw new Error('semantic_stream_input_invalid');
  const target = text(namespace);
  const budget = readBatchBudget({ maxRows, maxBytes });
  const hash = sha256.create();
  // Exact UTF-8 byte order of canonicalizeFinancialLedgerV3's top-level keys.
  write(hash, '{"accounts":');
  await streamArraySection({ hash, database, namespace: target, section: 'accounts', budget });
  write(hash, ',"archives":');
  await streamArchives({ hash, database, namespace: target, budget });
  write(hash, ',"entities":');
  await streamArraySection({ hash, database, namespace: target, section: 'entities', budget });
  write(hash, ',"exchangeRates":');
  await streamArraySection({ hash, database, namespace: target, section: 'exchangeRates', budget });
  write(hash, ',"financialConfig":');
  const cfgBatch = await readCanonicalRowBatchV3({
    database, namespace: target, section: 'financialConfig', maxRows: budget.maxRows, maxBytes: budget.maxBytes,
  });
  if (!cfgBatch?.ok || cfgBatch.rows.length !== 1) throw new Error(cfgBatch?.reason || 'semantic_stream_financial_config_missing');
  write(hash, stableSemanticJsonV3(canonicalizeFinancialConfigItemV3(cfgBatch.rows[0])));
  write(hash, ',"ledgerId":');
  write(hash, stableSemanticJsonV3(text(ledgerId)));
  write(hash, ',"links":');
  await streamArraySection({ hash, database, namespace: target, section: 'links', budget });
  write(hash, ',"postings":');
  await streamArraySection({ hash, database, namespace: target, section: 'postings', budget });
  write(hash, ',"semanticHashVersion":');
  write(hash, stableSemanticJsonV3(SEMANTIC_HASH_V3_VERSION));
  write(hash, ',"transactions":');
  await streamArraySection({ hash, database, namespace: target, section: 'transactions', budget });
  write(hash, '}');
  return bytesToHex(hash.digest());
};
