import {
  acknowledgeLedgerMutationsV7,
  applyRemoteLedgerMutationsV7,
  failLedgerMutationV7,
  getLedgerSyncCursorV7,
  readPendingLedgerMutationsV7,
} from './financialLedgerV7Repository';

export const serializeLedgerMutationBatch = rows => (Array.isArray(rows) ? rows : []).map(row => ({
  mutationId: String(row.mutation_id || row.mutationId),
  entityType: String(row.entity_type || row.entityType),
  entityId: String(row.entity_id || row.entityId),
  operation: String(row.operation || 'upsert'),
  entityRevision: Math.max(1, Number(row.entity_revision || row.entityRevision || 1)),
  payloadVersion: Math.max(1, Number(row.payload_version || row.payloadVersion || 7)),
  payload: row.payload ?? null,
  createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
}));

export const normalizeFinancialMutationSyncResponse = data => {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') throw new Error('financial_mutation_sync_response_invalid');
  const acceptedMutationIds = Array.isArray(value.acceptedMutationIds)
    ? value.acceptedMutationIds.map(String)
    : Array.isArray(value.accepted_mutation_ids)
      ? value.accepted_mutation_ids.map(String)
      : [];
  const remoteMutations = Array.isArray(value.remoteMutations)
    ? value.remoteMutations
    : Array.isArray(value.remote_mutations)
      ? value.remote_mutations
      : [];
  const latestSequence = Number(value.latestSequence ?? value.latest_sequence ?? 0);
  if (!Number.isFinite(latestSequence) || latestSequence < 0) throw new Error('financial_mutation_sync_cursor_invalid');
  return {
    acceptedMutationIds,
    remoteMutations,
    latestSequence,
    hasMore: value.hasMore === true || value.has_more === true,
  };
};

export const syncFinancialMutationsV7 = async ({
  supabase, namespace = 'guest', deviceId = '', database = null, maxPages = 200,
} = {}) => {
  if (!supabase?.rpc) return { supported: false, ok: false, reason: 'supabase_unavailable' };
  const pending = await readPendingLedgerMutationsV7({ namespace, limit: 500, database });
  let cursor = await getLedgerSyncCursorV7({ namespace, database });
  let outgoing = serializeLedgerMutationBatch(pending);
  let uploaded = 0;
  let downloaded = 0;
  let pages = 0;
  let remoteHasMore = false;
  const pageBudget = Math.max(1, Math.min(200, Number(maxPages) || 200));
  try {
    while (pages < pageBudget) {
      const cursorBeforePage = cursor;
      const { data, error } = await supabase.rpc('sync_financial_mutations_v1', {
        p_mutations: outgoing,
        p_after_sequence: cursor,
        p_device_id: String(deviceId || ''),
        p_limit: 500,
      });
      if (error) throw error;
      const response = normalizeFinancialMutationSyncResponse(data);
      remoteHasMore = !!response.hasMore;
      const accepted = response.acceptedMutationIds.filter(id => outgoing.some(item => item.mutationId === id));
      if (accepted.length) {
        await acknowledgeLedgerMutationsV7({ mutationIds: accepted, database });
        uploaded += accepted.length;
      }
      const applied = await applyRemoteLedgerMutationsV7({
        namespace, mutations: response.remoteMutations, deviceId, database,
      });
      if (!applied.ok) throw new Error(applied.reason || 'financial_mutation_apply_failed');
      downloaded += Number(applied.applied || 0);
      cursor = Math.max(cursor, Number(applied.cursor || response.latestSequence || 0));
      pages += 1;
      outgoing = [];
      if (!remoteHasMore) break;
      if (cursor <= cursorBeforePage) {
        return {
          supported: true, ok: false, reason: 'financial_mutation_sync_cursor_stalled',
          uploaded, downloaded, cursor, pages, hasMore: true,
          pendingAfterSync: (await readPendingLedgerMutationsV7({ namespace, limit: 1, database })).length,
        };
      }
    }
    if (remoteHasMore) {
      return {
        supported: true, ok: false, reason: 'financial_mutation_sync_page_budget_exhausted',
        uploaded, downloaded, cursor, pages, hasMore: true,
        pendingAfterSync: (await readPendingLedgerMutationsV7({ namespace, limit: 1, database })).length,
      };
    }
    return {
      supported: true, ok: true, uploaded, downloaded, cursor, pages, hasMore: false,
      pendingAfterSync: (await readPendingLedgerMutationsV7({ namespace, limit: 1, database })).length,
    };
  } catch (error) {
    for (const row of pending) {
      await failLedgerMutationV7({ mutationId: row.mutation_id, error: error?.message || error, database }).catch(() => {});
    }
    return {
      supported: true, ok: false, reason: String(error?.message || 'financial_mutation_sync_failed'),
      uploaded, downloaded, cursor, pages, hasMore: remoteHasMore,
    };
  }
};
