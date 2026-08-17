import * as Crypto from 'expo-crypto';
import {
  createFinancialBootstrapStageV8,
  failFinancialBootstrapStageV8,
  finalizeFinancialBootstrapStageV8,
  markFinancialBootstrapUploadingV8,
  readFinancialBootstrapStageRowsV8,
  readFinancialBootstrapStateV8,
  setFinancialBootstrapStageManifestV8,
} from './financialLedgerV7Repository';
import { ensureLedgerSyncIdentityV8 } from './financialLedgerV7Repository';
import { resolveCloudLedgerV2 } from './financialMutationSyncV2';

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

const stripNamespace = row => {
  if (!row || typeof row !== 'object') return row;
  const { namespace, ...rest } = row;
  return rest;
};

const rowKeyFor = (rowType, row) => {
  if (rowType === 'currency') return String(row.code);
  if (rowType === 'entity') return stableJson([String(row.entity_type), String(row.id)]);
  if (rowType === 'workspace_state') return 'workspace';
  return String(row.id);
};

export const buildFinancialBootstrapRowsV2 = async snapshot => {
  const ordered = [
    ['currency', snapshot?.currencies || []],
    ['account', snapshot?.accounts || []],
    ['exchange_rate', snapshot?.exchangeRates || []],
    ['financial_transaction', snapshot?.transactions || []],
    ['posting', snapshot?.postings || []],
    ['transaction_link', snapshot?.links || []],
    ['entity', snapshot?.entities || []],
    ['workspace_state', snapshot?.workspaceState ? [snapshot.workspaceState] : []],
  ];

  const rows = [];
  for (const [rowType, values] of ordered) {
    for (const source of values) {
      const payload = stripNamespace(source);
      const rowKey = rowKeyFor(rowType, payload);
      const payloadText = stableJson(payload);
      const rowHash = await sha256Hex(`${rowType}\n${rowKey}\n${payloadText}`);
      rows.push({
        ordinal: rows.length + 1,
        rowType,
        rowKey,
        rowHash: String(rowHash).toLowerCase(),
        payloadText,
      });
    }
  }
  const manifestHash = await sha256Hex(rows.map(row => row.rowHash).join('\n'));
  return {
    rows,
    manifestHash: String(manifestHash).toLowerCase(),
    expectedRowCount: rows.length,
  };
};

const normalizeBootstrapResponse = data => {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') throw new Error('financial_v2_bootstrap_response_invalid');
  return {
    ledgerId: String(value.ledgerId ?? value.ledger_id ?? ''),
    restoreEpoch: Number(value.restoreEpoch ?? value.restore_epoch ?? 0),
    bootstrapId: String(value.bootstrapId ?? value.bootstrap_id ?? ''),
    manifestHash: String(value.manifestHash ?? value.manifest_hash ?? '').toLowerCase(),
    expectedRowCount: Number(value.expectedRowCount ?? value.expected_row_count ?? 0),
    status: String(value.status || ''),
    idempotent: value.idempotent === true,
  };
};


const normalizeBootstrapRowsPage = data => {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') {
    throw new Error('financial_v2_bootstrap_readback_response_invalid');
  }
  return {
    ledgerId: String(value.ledgerId ?? value.ledger_id ?? ''),
    restoreEpoch: Number(value.restoreEpoch ?? value.restore_epoch ?? 0),
    bootstrapId: String(value.bootstrapId ?? value.bootstrap_id ?? ''),
    manifestHash: String(value.manifestHash ?? value.manifest_hash ?? '').toLowerCase(),
    expectedRowCount: Number(value.expectedRowCount ?? value.expected_row_count ?? 0),
    rows: Array.isArray(value.rows) ? value.rows : [],
    nextOrdinal: Number(value.nextOrdinal ?? value.next_ordinal ?? 0),
    hasMore: value.hasMore === true || value.has_more === true,
  };
};

export const verifyFinancialBootstrapReadbackV2 = async ({
  supabase,
  ledgerId,
  restoreEpoch,
  bootstrapId,
  manifestHash,
  expectedRowCount,
  pageSize = 200,
  maxPages = 10000,
} = {}) => {
  if (!supabase?.rpc) {
    return { supported: false, ok: false, reason: 'supabase_unavailable' };
  }

  const expectedLedger = String(ledgerId || '').trim();
  const expectedEpoch = Number(restoreEpoch);
  const expectedBootstrap = String(bootstrapId || '').trim();
  const expectedManifest = String(manifestHash || '').trim().toLowerCase();
  const expectedCount = Number(expectedRowCount);

  if (!expectedLedger
      || expectedEpoch <= 0
      || !expectedBootstrap
      || !/^[0-9a-f]{64}$/.test(expectedManifest)
      || !Number.isSafeInteger(expectedCount)
      || expectedCount < 0) {
    return {
      supported: true,
      ok: false,
      reason: 'financial_v2_bootstrap_readback_request_invalid',
    };
  }

  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 200));
  const pageBudget = Math.max(1, Math.min(10000, Number(maxPages) || 10000));
  let afterOrdinal = 0;
  let pages = 0;
  let hasMore = true;
  const rowHashes = [];
  const seenRowKeys = new Set();

  try {
    while (hasMore && pages < pageBudget) {
      const beforeOrdinal = afterOrdinal;
      const { data, error } = await supabase.rpc('get_financial_bootstrap_rows_v2', {
        p_ledger_id: expectedLedger,
        p_restore_epoch: expectedEpoch,
        p_after_ordinal: afterOrdinal,
        p_limit: safePageSize,
      });
      if (error) throw error;

      const page = normalizeBootstrapRowsPage(data);
      if (page.ledgerId !== expectedLedger
          || page.restoreEpoch !== expectedEpoch
          || page.bootstrapId !== expectedBootstrap
          || page.manifestHash !== expectedManifest
          || page.expectedRowCount !== expectedCount) {
        throw new Error('financial_v2_bootstrap_readback_identity_mismatch');
      }

      for (const raw of page.rows) {
        const ordinal = Number(raw?.ordinal ?? raw?.row_ordinal ?? 0);
        const rowType = String(raw?.rowType ?? raw?.row_type ?? '');
        const rowKey = String(raw?.rowKey ?? raw?.row_key ?? '');
        const rowHash = String(raw?.rowHash ?? raw?.row_hash ?? '').toLowerCase();
        const payloadText = String(raw?.payloadText ?? raw?.payload_text ?? '');

        if (!Number.isSafeInteger(ordinal)
            || ordinal !== afterOrdinal + 1
            || !rowType
            || !rowKey
            || !/^[0-9a-f]{64}$/.test(rowHash)
            || !payloadText) {
          throw new Error('financial_v2_bootstrap_readback_row_invalid');
        }

        // JSON syntax must survive the server round-trip. The cryptographic hash
        // is computed from the exact text returned by the server.
        JSON.parse(payloadText);

        const uniqueKey = `${rowType}\n${rowKey}`;
        if (seenRowKeys.has(uniqueKey)) {
          throw new Error('financial_v2_bootstrap_readback_duplicate_row');
        }
        seenRowKeys.add(uniqueKey);

        const computedHash = String(
          await sha256Hex(`${rowType}\n${rowKey}\n${payloadText}`),
        ).toLowerCase();
        if (computedHash !== rowHash) {
          throw new Error('financial_v2_bootstrap_readback_row_hash_mismatch');
        }

        rowHashes.push(rowHash);
        afterOrdinal = ordinal;
      }

      if (page.nextOrdinal !== afterOrdinal) {
        throw new Error('financial_v2_bootstrap_readback_cursor_mismatch');
      }

      hasMore = page.hasMore;
      pages += 1;
      if (hasMore && afterOrdinal <= beforeOrdinal) {
        throw new Error('financial_v2_bootstrap_readback_cursor_stalled');
      }
    }

    if (hasMore) {
      throw new Error('financial_v2_bootstrap_readback_page_budget_exhausted');
    }
    if (rowHashes.length !== expectedCount
        || (expectedCount > 0 && afterOrdinal !== expectedCount)
        || (expectedCount === 0 && afterOrdinal !== 0)) {
      throw new Error('financial_v2_bootstrap_readback_row_count_mismatch');
    }

    const computedManifest = String(
      await sha256Hex(rowHashes.join('\n')),
    ).toLowerCase();
    if (computedManifest !== expectedManifest) {
      throw new Error('financial_v2_bootstrap_readback_manifest_mismatch');
    }

    return {
      supported: true,
      ok: true,
      ledgerId: expectedLedger,
      restoreEpoch: expectedEpoch,
      bootstrapId: expectedBootstrap,
      manifestHash: expectedManifest,
      expectedRowCount: expectedCount,
      readBackRowCount: rowHashes.length,
      pages,
      finalOrdinal: afterOrdinal,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      supported: true,
      ok: false,
      reason: String(error?.message || 'financial_v2_bootstrap_readback_failed'),
      ledgerId: expectedLedger,
      restoreEpoch: expectedEpoch,
      bootstrapId: expectedBootstrap,
      expectedRowCount: expectedCount,
      readBackRowCount: rowHashes.length,
      pages,
      finalOrdinal: afterOrdinal,
    };
  }
};

export const bootstrapFinancialLedgerV2 = async ({
  supabase,
  namespace = 'guest',
  deviceId = '',
  database = null,
  chunkSize = 100,
} = {}) => {
  if (!supabase?.rpc) return { supported: false, ok: false, reason: 'supabase_unavailable' };

  const identity = await ensureLedgerSyncIdentityV8({ namespace, database });
  if (!identity?.ledgerId) {
    return { supported: true, ok: false, reason: 'financial_v2_local_identity_missing' };
  }

  let cloud;
  try {
    cloud = await resolveCloudLedgerV2({ supabase, identity });
  } catch (error) {
    return { supported: true, ok: false, reason: String(error?.message || error) };
  }

  if (cloud.restoreEpoch !== identity.restoreEpoch) {
    return {
      supported: true,
      ok: false,
      reason: 'financial_v2_bootstrap_restore_epoch_mismatch',
      localRestoreEpoch: identity.restoreEpoch,
      cloudRestoreEpoch: cloud.restoreEpoch,
    };
  }

  const previousState = await readFinancialBootstrapStateV8({
    namespace,
    ledgerId: identity.ledgerId,
    restoreEpoch: identity.restoreEpoch,
    database,
  });

  if (cloud.bootstrappedAt && previousState?.status === 'finalized') {
    const exact = previousState.bootstrap_id === cloud.bootstrapId
      && String(previousState.manifest_hash || '').toLowerCase()
        === String(cloud.bootstrapManifestHash || '').toLowerCase();
    if (!exact) {
      return { supported: true, ok: false, reason: 'financial_v2_bootstrap_finalized_identity_conflict' };
    }
    const expectedCount = Number(previousState.expected_row_count || 0);
    const readbackVerification = await verifyFinancialBootstrapReadbackV2({
      supabase,
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      bootstrapId: cloud.bootstrapId,
      manifestHash: cloud.bootstrapManifestHash,
      expectedRowCount: expectedCount,
    });
    if (!readbackVerification.ok) return readbackVerification;
    return {
      supported: true,
      ok: true,
      idempotent: true,
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      bootstrapId: cloud.bootstrapId,
      manifestHash: cloud.bootstrapManifestHash,
      expectedRowCount: expectedCount,
      readbackVerification,
    };
  }

  let state;
  try {
    state = await createFinancialBootstrapStageV8({ namespace, database });
    const snapshot = await readFinancialBootstrapStageRowsV8({
      stageNamespace: state.stage_namespace,
      database,
    });
    const built = await buildFinancialBootstrapRowsV2(snapshot);

    if (state.manifest_hash && String(state.manifest_hash).toLowerCase() !== built.manifestHash) {
      throw new Error('financial_v2_bootstrap_local_stage_manifest_changed');
    }
    if (state.expected_row_count != null && Number(state.expected_row_count) !== built.expectedRowCount) {
      throw new Error('financial_v2_bootstrap_local_stage_count_changed');
    }

    state = await setFinancialBootstrapStageManifestV8({
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      bootstrapId: state.bootstrap_id,
      manifestHash: built.manifestHash,
      expectedRowCount: built.expectedRowCount,
      database,
    });

    if (cloud.bootstrappedAt) {
      const exact = cloud.bootstrapId === state.bootstrap_id
        && String(cloud.bootstrapManifestHash || '').toLowerCase() === built.manifestHash;
      if (!exact) throw new Error('financial_v2_bootstrap_cloud_already_finalized_conflict');
      const readbackVerification = await verifyFinancialBootstrapReadbackV2({
        supabase,
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
        bootstrapId: state.bootstrap_id,
        manifestHash: built.manifestHash,
        expectedRowCount: built.expectedRowCount,
      });
      if (!readbackVerification.ok) {
        throw new Error(readbackVerification.reason || 'financial_v2_bootstrap_readback_failed');
      }
      await finalizeFinancialBootstrapStageV8({
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
        bootstrapId: state.bootstrap_id,
        manifestHash: built.manifestHash,
        database,
      });
      return {
        supported: true,
        ok: true,
        idempotent: true,
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
        bootstrapId: state.bootstrap_id,
        manifestHash: built.manifestHash,
        expectedRowCount: built.expectedRowCount,
        readbackVerification,
      };
    }

    let result = await supabase.rpc('begin_financial_bootstrap_v2', {
      p_ledger_id: identity.ledgerId,
      p_restore_epoch: identity.restoreEpoch,
      p_bootstrap_id: state.bootstrap_id,
      p_manifest_hash: built.manifestHash,
      p_expected_row_count: built.expectedRowCount,
      p_device_id: String(deviceId || ''),
    });
    if (result.error) throw result.error;

    const begun = normalizeBootstrapResponse(result.data);
    if (begun.ledgerId !== identity.ledgerId
        || begun.restoreEpoch !== identity.restoreEpoch
        || begun.bootstrapId !== state.bootstrap_id
        || begun.manifestHash !== built.manifestHash
        || begun.expectedRowCount !== built.expectedRowCount) {
      throw new Error('financial_v2_bootstrap_begin_response_mismatch');
    }

    await markFinancialBootstrapUploadingV8({
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      bootstrapId: state.bootstrap_id,
      database,
    });

    const safeChunk = Math.max(1, Math.min(200, Number(chunkSize) || 100));
    for (let start = 0; start < built.rows.length; start += safeChunk) {
      const chunk = built.rows.slice(start, start + safeChunk);
      result = await supabase.rpc('upload_financial_bootstrap_rows_v2', {
        p_ledger_id: identity.ledgerId,
        p_restore_epoch: identity.restoreEpoch,
        p_bootstrap_id: state.bootstrap_id,
        p_rows: chunk,
      });
      if (result.error) throw result.error;
    }

    result = await supabase.rpc('finalize_financial_bootstrap_v2', {
      p_ledger_id: identity.ledgerId,
      p_restore_epoch: identity.restoreEpoch,
      p_bootstrap_id: state.bootstrap_id,
      p_manifest_hash: built.manifestHash,
    });
    if (result.error) throw result.error;

    const finalized = normalizeBootstrapResponse(result.data);
    if (finalized.ledgerId !== identity.ledgerId
        || finalized.restoreEpoch !== identity.restoreEpoch
        || finalized.bootstrapId !== state.bootstrap_id
        || finalized.manifestHash !== built.manifestHash
        || finalized.expectedRowCount !== built.expectedRowCount
        || finalized.status !== 'finalized') {
      throw new Error('financial_v2_bootstrap_finalize_response_mismatch');
    }

    const readbackVerification = await verifyFinancialBootstrapReadbackV2({
      supabase,
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      bootstrapId: state.bootstrap_id,
      manifestHash: built.manifestHash,
      expectedRowCount: built.expectedRowCount,
    });
    if (!readbackVerification.ok) {
      throw new Error(readbackVerification.reason || 'financial_v2_bootstrap_readback_failed');
    }

    await finalizeFinancialBootstrapStageV8({
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      bootstrapId: state.bootstrap_id,
      manifestHash: built.manifestHash,
      database,
    });

    return {
      supported: true,
      ok: true,
      idempotent: finalized.idempotent,
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      bootstrapId: state.bootstrap_id,
      manifestHash: built.manifestHash,
      expectedRowCount: built.expectedRowCount,
      readbackVerification,
    };
  } catch (error) {
    if (state?.bootstrap_id) {
      await failFinancialBootstrapStageV8({
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
        bootstrapId: state.bootstrap_id,
        error: error?.message || error,
        database,
      }).catch(() => {});
    }
    return {
      supported: true,
      ok: false,
      reason: String(error?.message || 'financial_v2_bootstrap_failed'),
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
    };
  }
};
