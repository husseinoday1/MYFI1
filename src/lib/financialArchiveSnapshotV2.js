import * as Crypto from 'expo-crypto';

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = stableValue(value[key]);
    return result;
  }, {});
};

const stableJson = value => JSON.stringify(stableValue(value));

const sha256Hex = value => Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  String(value ?? ''),
);

const archiveKey = (scope, year) => stableJson([String(scope), Number(year)]);
const archiveTransactionKey = (scope, year, id) => stableJson([String(scope), Number(year), String(id)]);

const validArchive = archive => {
  const year = Number(archive?.year);
  const scope = String(archive?.scope || '').trim();
  if (!Number.isInteger(year) || year < 1 || !scope) {
    throw new Error('financial_archive_snapshot_archive_invalid');
  }
  const data = archive?.data && typeof archive.data === 'object' ? archive.data : {};
  const transactions = Array.isArray(data.trans) ? data.trans : [];
  const { trans, ...metadata } = data;
  return {
    year,
    scope,
    checksum: String(archive?.checksum || ''),
    summary: archive?.summary && typeof archive.summary === 'object' ? archive.summary : {},
    metadata,
    transactions,
  };
};

const makeRow = async ({ ordinal, rowType, rowKey, payload }) => {
  const payloadText = stableJson(payload);
  const rowHash = await sha256Hex(`${rowType}\n${rowKey}\n${payloadText}`);
  return {
    ordinal,
    rowType,
    rowKey,
    rowHash: String(rowHash).toLowerCase(),
    payloadText,
  };
};

export const buildFinancialArchiveSnapshotRowsV2 = async (archives = []) => {
  const normalized = (Array.isArray(archives) ? archives : []).map(validArchive)
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.year - b.year);
  const seenArchives = new Set();
  const seenTransactions = new Set();
  const rows = [];

  for (const archive of normalized) {
    const key = archiveKey(archive.scope, archive.year);
    if (seenArchives.has(key)) throw new Error('financial_archive_snapshot_archive_duplicate');
    seenArchives.add(key);
    rows.push(await makeRow({
      ordinal: rows.length + 1,
      rowType: 'archive_year',
      rowKey: key,
      payload: {
        year: archive.year,
        scope: archive.scope,
        checksum: archive.checksum,
        summary: archive.summary,
        metadata: archive.metadata,
      },
    }));

    const transactions = archive.transactions.slice().sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
    for (const transaction of transactions) {
      const id = String(transaction?.id || '').trim();
      if (!id) throw new Error('financial_archive_snapshot_transaction_id_missing');
      const transactionKey = archiveTransactionKey(archive.scope, archive.year, id);
      if (seenTransactions.has(transactionKey)) {
        throw new Error('financial_archive_snapshot_transaction_duplicate');
      }
      seenTransactions.add(transactionKey);
      rows.push(await makeRow({
        ordinal: rows.length + 1,
        rowType: 'archive_transaction',
        rowKey: transactionKey,
        payload: { scope: archive.scope, year: archive.year, transaction },
      }));
    }
  }

  const manifestHash = await sha256Hex(rows.map(row => row.rowHash).join('\n'));
  return {
    rows,
    manifestHash: String(manifestHash).toLowerCase(),
    expectedRowCount: rows.length,
  };
};

const normalizeHead = data => {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') throw new Error('financial_archive_head_response_invalid');
  const archivePresent = value.archivePresent === true || value.archive_present === true;
  return {
    ledgerId: String(value.ledgerId ?? value.ledger_id ?? ''),
    restoreEpoch: Number(value.restoreEpoch ?? value.restore_epoch ?? 0),
    archivePresent,
    archiveGeneration: archivePresent ? Number(value.archiveGeneration ?? value.archive_generation ?? 0) : 0,
    snapshotId: archivePresent ? String(value.snapshotId ?? value.snapshot_id ?? '') : '',
    manifestHash: archivePresent ? String(value.manifestHash ?? value.manifest_hash ?? '').toLowerCase() : '',
    expectedRowCount: archivePresent ? Number(value.expectedRowCount ?? value.expected_row_count ?? 0) : 0,
  };
};

const normalizeRowsPage = data => {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') throw new Error('financial_archive_snapshot_readback_response_invalid');
  return {
    ledgerId: String(value.ledgerId ?? value.ledger_id ?? ''),
    restoreEpoch: Number(value.restoreEpoch ?? value.restore_epoch ?? 0),
    archiveGeneration: Number(value.archiveGeneration ?? value.archive_generation ?? 0),
    snapshotId: String(value.snapshotId ?? value.snapshot_id ?? ''),
    manifestHash: String(value.manifestHash ?? value.manifest_hash ?? '').toLowerCase(),
    expectedRowCount: Number(value.expectedRowCount ?? value.expected_row_count ?? 0),
    rows: Array.isArray(value.rows) ? value.rows : [],
    nextOrdinal: Number(value.nextOrdinal ?? value.next_ordinal ?? 0),
    hasMore: value.hasMore === true || value.has_more === true,
  };
};

export const readFinancialArchiveHeadV2 = async ({ supabase, ledgerId, restoreEpoch } = {}) => {
  if (!supabase?.rpc) return { supported: false, ok: false, reason: 'supabase_unavailable' };
  const expectedLedger = String(ledgerId || '').trim();
  const expectedEpoch = Number(restoreEpoch);
  if (!expectedLedger || !Number.isSafeInteger(expectedEpoch) || expectedEpoch <= 0) {
    return { supported: true, ok: false, reason: 'financial_archive_head_request_invalid' };
  }
  try {
    const { data, error } = await supabase.rpc('get_financial_archive_head_v2', {
      p_ledger_id: expectedLedger,
      p_restore_epoch: expectedEpoch,
    });
    if (error) throw error;
    const head = normalizeHead(data);
    if (head.ledgerId !== expectedLedger || head.restoreEpoch !== expectedEpoch) {
      throw new Error('financial_archive_head_identity_mismatch');
    }
    if (!head.archivePresent) return { supported: true, ok: true, ...head };
    if (!Number.isSafeInteger(head.archiveGeneration) || head.archiveGeneration <= 0
        || !head.snapshotId || !/^[0-9a-f]{64}$/.test(head.manifestHash)
        || !Number.isSafeInteger(head.expectedRowCount) || head.expectedRowCount < 0) {
      throw new Error('financial_archive_head_invalid');
    }
    return { supported: true, ok: true, ...head };
  } catch (error) {
    return { supported: true, ok: false, reason: String(error?.message || 'financial_archive_head_failed') };
  }
};

export const verifyFinancialArchiveSnapshotReadbackV2 = async ({
  supabase,
  ledgerId,
  restoreEpoch,
  archiveGeneration,
  snapshotId,
  manifestHash,
  expectedRowCount,
  pageSize = 200,
  maxPages = 10000,
} = {}) => {
  if (!supabase?.rpc) return { supported: false, ok: false, reason: 'supabase_unavailable' };
  const expectedLedger = String(ledgerId || '').trim();
  const expectedEpoch = Number(restoreEpoch);
  const expectedGeneration = Number(archiveGeneration);
  const expectedSnapshot = String(snapshotId || '').trim();
  const expectedManifest = String(manifestHash || '').trim().toLowerCase();
  const expectedCount = Number(expectedRowCount);
  if (!expectedLedger || expectedEpoch <= 0 || expectedGeneration <= 0 || !expectedSnapshot
      || !/^[0-9a-f]{64}$/.test(expectedManifest)
      || !Number.isSafeInteger(expectedCount) || expectedCount < 0) {
    return { supported: true, ok: false, reason: 'financial_archive_snapshot_readback_request_invalid' };
  }

  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 200));
  const pageBudget = Math.max(1, Math.min(10000, Number(maxPages) || 10000));
  const hashes = [];
  const keys = new Set();
  let afterOrdinal = 0;
  let pages = 0;
  let hasMore = true;

  try {
    while (hasMore && pages < pageBudget) {
      const beforeOrdinal = afterOrdinal;
      const { data, error } = await supabase.rpc('get_financial_archive_snapshot_rows_v2', {
        p_ledger_id: expectedLedger,
        p_restore_epoch: expectedEpoch,
        p_snapshot_id: expectedSnapshot,
        p_after_ordinal: afterOrdinal,
        p_limit: safePageSize,
      });
      if (error) throw error;
      const page = normalizeRowsPage(data);
      if (page.ledgerId !== expectedLedger || page.restoreEpoch !== expectedEpoch
          || page.archiveGeneration !== expectedGeneration || page.snapshotId !== expectedSnapshot
          || page.manifestHash !== expectedManifest || page.expectedRowCount !== expectedCount) {
        throw new Error('financial_archive_snapshot_readback_identity_mismatch');
      }
      for (const raw of page.rows) {
        const ordinal = Number(raw?.ordinal ?? raw?.row_ordinal ?? 0);
        const rowType = String(raw?.rowType ?? raw?.row_type ?? '');
        const rowKey = String(raw?.rowKey ?? raw?.row_key ?? '');
        const rowHash = String(raw?.rowHash ?? raw?.row_hash ?? '').toLowerCase();
        const payloadText = String(raw?.payloadText ?? raw?.payload_text ?? '');
        if (!Number.isSafeInteger(ordinal) || ordinal !== afterOrdinal + 1
            || !['archive_year', 'archive_transaction'].includes(rowType)
            || !rowKey || !/^[0-9a-f]{64}$/.test(rowHash) || !payloadText) {
          throw new Error('financial_archive_snapshot_readback_row_invalid');
        }
        JSON.parse(payloadText);
        const key = `${rowType}\n${rowKey}`;
        if (keys.has(key)) throw new Error('financial_archive_snapshot_readback_duplicate_row');
        keys.add(key);
        const computedHash = String(await sha256Hex(`${rowType}\n${rowKey}\n${payloadText}`)).toLowerCase();
        if (computedHash !== rowHash) throw new Error('financial_archive_snapshot_readback_row_hash_mismatch');
        hashes.push(rowHash);
        afterOrdinal = ordinal;
      }
      if (page.nextOrdinal !== afterOrdinal) throw new Error('financial_archive_snapshot_readback_cursor_mismatch');
      hasMore = page.hasMore;
      pages += 1;
      if (hasMore && afterOrdinal <= beforeOrdinal) {
        throw new Error('financial_archive_snapshot_readback_cursor_stalled');
      }
    }
    if (hasMore) throw new Error('financial_archive_snapshot_readback_page_budget_exhausted');
    if (hashes.length !== expectedCount
        || (expectedCount > 0 && afterOrdinal !== expectedCount)
        || (expectedCount === 0 && afterOrdinal !== 0)) {
      throw new Error('financial_archive_snapshot_readback_row_count_mismatch');
    }
    const computedManifest = String(await sha256Hex(hashes.join('\n'))).toLowerCase();
    if (computedManifest !== expectedManifest) {
      throw new Error('financial_archive_snapshot_readback_manifest_mismatch');
    }
    return {
      supported: true,
      ok: true,
      ledgerId: expectedLedger,
      restoreEpoch: expectedEpoch,
      archiveGeneration: expectedGeneration,
      snapshotId: expectedSnapshot,
      manifestHash: expectedManifest,
      expectedRowCount: expectedCount,
      readBackRowCount: hashes.length,
      pages,
      finalOrdinal: afterOrdinal,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      supported: true,
      ok: false,
      reason: String(error?.message || 'financial_archive_snapshot_readback_failed'),
      ledgerId: expectedLedger,
      restoreEpoch: expectedEpoch,
      archiveGeneration: expectedGeneration,
      snapshotId: expectedSnapshot,
      expectedRowCount: expectedCount,
      readBackRowCount: hashes.length,
      pages,
      finalOrdinal: afterOrdinal,
    };
  }
};
