import {
  acknowledgeLedgerMutationsV8,
  applyRemoteLedgerMutationsV8,
  ensureLedgerSyncIdentityV8,
  failLedgerMutationV8,
  getLedgerSyncCursorV8,
  readFinancialSyncProtocolV8,
  readLedgerRestoreIntentV8,
  readPendingLedgerMutationsV8,
} from './financialLedgerV7Repository';

const normalizedRow = row => ({
  mutationId: String(row.mutation_id || row.mutationId || ''),
  commandId: String(row.command_id || row.commandId || ''),
  ledgerId: String(row.ledger_id || row.ledgerId || ''),
  restoreEpoch: Number(row.restore_epoch || row.restoreEpoch || 0),
  entityType: String(row.entity_type || row.entityType || ''),
  entityId: String(row.entity_id || row.entityId || ''),
  operation: String(row.operation || 'upsert'),
  revision: Number(row.revision || 0),
  baseRevision: Number(row.base_revision ?? row.baseRevision ?? -1),
  protocolVersion: Number(row.protocol_version || row.protocolVersion || 0),
  minimumSupportedVersion: Number(row.minimum_supported_version || row.minimumSupportedVersion || 0),
  payloadSchemaVersion: Number(row.payload_schema_version || row.payloadSchemaVersion || 0),
  payload: row.payload ?? row.payload_json ?? null,
  createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
});

export const serializeLedgerMutationBatchV2 = rows => (Array.isArray(rows) ? rows : []).map(row => {
  const item = normalizedRow(row);
  if (!item.mutationId || !item.commandId || !item.ledgerId
      || item.restoreEpoch <= 0 || !item.entityType || !item.entityId
      || !['upsert','delete','void'].includes(item.operation)
      || item.revision <= 0 || item.baseRevision < 0
      || item.revision !== item.baseRevision + 1
      || item.protocolVersion !== 2
      || item.minimumSupportedVersion < 1 || item.minimumSupportedVersion > 2
      || item.payloadSchemaVersion <= 0) {
    throw new Error('financial_mutation_v2_local_row_invalid');
  }
  return item;
});

export const normalizeFinancialMutationSyncV2Response = data => {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') throw new Error('financial_mutation_v2_response_invalid');
  const acceptedMutationIds = Array.isArray(value.acceptedMutationIds)
    ? value.acceptedMutationIds.map(String)
    : Array.isArray(value.accepted_mutation_ids)
      ? value.accepted_mutation_ids.map(String)
      : [];
  const conflicts = Array.isArray(value.conflicts) ? value.conflicts : [];
  const remoteMutations = Array.isArray(value.remoteMutations)
    ? value.remoteMutations
    : Array.isArray(value.remote_mutations)
      ? value.remote_mutations
      : [];
  const latestSequence = Number(value.latestSequence ?? value.latest_sequence ?? 0);
  const restoreEpoch = Number(value.restoreEpoch ?? value.restore_epoch ?? 0);
  const protocolVersion = Number(value.protocolVersion ?? value.protocol_version ?? 0);
  const ledgerId = String(value.ledgerId ?? value.ledger_id ?? '');
  if (!Number.isFinite(latestSequence) || latestSequence < 0) {
    throw new Error('financial_mutation_v2_cursor_invalid');
  }
  return {
    acceptedMutationIds,
    conflicts,
    remoteMutations,
    latestSequence,
    hasMore: value.hasMore === true || value.has_more === true,
    ledgerId,
    restoreEpoch,
    protocolVersion,
  };
};

const normalizeLedgerRegistration = data => {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') return null;
  return {
    ledgerId: String(value.ledgerId ?? value.ledger_id ?? ''),
    restoreEpoch: Number(value.restoreEpoch ?? value.restore_epoch ?? 0),
    protocolVersion: Number(value.protocolVersion ?? value.protocol_version ?? 0),
    minimumSupportedVersion: Number(value.minimumSupportedVersion ?? value.minimum_supported_version ?? 0),
    status: String(value.status || ''),
    bootstrapId: String(value.bootstrapId ?? value.bootstrap_id ?? ''),
    bootstrapManifestHash: String(value.bootstrapManifestHash ?? value.bootstrap_manifest_hash ?? '').toLowerCase(),
    bootstrappedAt: value.bootstrappedAt ?? value.bootstrapped_at ?? null,
  };
};

export const resolveCloudLedgerV2 = async ({ supabase, identity }) => {
  if (!supabase?.rpc || !identity?.ledgerId) throw new Error('financial_v2_cloud_resolution_unavailable');
  let result = await supabase.rpc('get_financial_ledger_v2');
  if (result.error) throw result.error;
  let cloud = normalizeLedgerRegistration(result.data);
  if (!cloud?.ledgerId) {
    result = await supabase.rpc('register_financial_ledger_v2', { p_ledger_id: identity.ledgerId });
    if (result.error) throw result.error;
    cloud = normalizeLedgerRegistration(result.data);
  }
  if (!cloud?.ledgerId) throw new Error('financial_v2_cloud_ledger_missing');
  if (cloud.ledgerId !== identity.ledgerId) throw new Error('financial_v2_ledger_id_conflict');
  if (cloud.protocolVersion !== 2 || cloud.minimumSupportedVersion > 2) {
    throw new Error('financial_v2_protocol_incompatible');
  }
  return cloud;
};

export const syncFinancialMutationsV2 = async ({
  supabase,
  namespace = 'guest',
  deviceId = '',
  database = null,
  maxPages = 200,
  allowProductionApply = false,
} = {}) => {
  if (!supabase?.rpc) return { supported: false, ok: false, reason: 'supabase_unavailable' };
  const identity = await ensureLedgerSyncIdentityV8({ namespace, database });
  if (!identity?.ledgerId) return { supported: true, ok: false, reason: 'financial_v2_local_identity_missing' };

  if (allowProductionApply === true) {
    const protocol = await readFinancialSyncProtocolV8({ namespace, database });
    if (protocol?.activeProtocolVersion !== 2 || !protocol?.activatedAt) {
      return {
        supported: true,
        ok: false,
        reason: 'financial_v2_production_apply_before_activation',
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
      };
    }
  }

  let cloud;
  try {
    cloud = await resolveCloudLedgerV2({ supabase, identity });
  } catch (error) {
    return { supported: true, ok: false, reason: String(error?.message || error) };
  }

  if (cloud.restoreEpoch !== identity.restoreEpoch) {
    const intent = await readLedgerRestoreIntentV8({ namespace, database });
    return {
      supported: true,
      ok: false,
      reason: intent ? 'financial_v2_restore_recovery_required' : 'financial_v2_restore_epoch_mismatch',
      localRestoreEpoch: identity.restoreEpoch,
      cloudRestoreEpoch: cloud.restoreEpoch,
      restoreIntent: intent || null,
    };
  }

  const pending = await readPendingLedgerMutationsV8({
    namespace,
    ledgerId: identity.ledgerId,
    restoreEpoch: identity.restoreEpoch,
    limit: 500,
    database,
  });
  let outgoing;
  try {
    outgoing = serializeLedgerMutationBatchV2(pending);
  } catch (error) {
    return { supported: true, ok: false, reason: String(error?.message || error) };
  }

  let cursor = await getLedgerSyncCursorV8({
    ledgerId: identity.ledgerId,
    restoreEpoch: identity.restoreEpoch,
    shadow: allowProductionApply !== true,
    database,
  });
  let uploaded = 0;
  let downloaded = 0;
  let pages = 0;
  let hasMore = false;
  const pageBudget = Math.max(1, Math.min(200, Number(maxPages) || 200));

  try {
    while (pages < pageBudget) {
      const before = cursor;
      const { data, error } = await supabase.rpc('sync_financial_mutations_v2', {
        p_ledger_id: identity.ledgerId,
        p_restore_epoch: identity.restoreEpoch,
        p_mutations: outgoing,
        p_after_sequence: cursor,
        p_device_id: String(deviceId || ''),
        p_limit: 500,
      });
      if (error) throw error;

      const response = normalizeFinancialMutationSyncV2Response(data);
      if (response.ledgerId !== identity.ledgerId
          || response.restoreEpoch !== identity.restoreEpoch
          || response.protocolVersion !== 2) {
        throw new Error('financial_v2_response_identity_mismatch');
      }

      const outgoingIds = new Set(outgoing.map(item => item.mutationId));
      const accepted = response.acceptedMutationIds.filter(id => outgoingIds.has(id));
      if (accepted.length) {
        await acknowledgeLedgerMutationsV8({
          ledgerId: identity.ledgerId,
          restoreEpoch: identity.restoreEpoch,
          mutationIds: accepted,
          database,
        });
        uploaded += accepted.length;
      }

      if (response.conflicts.length) {
        return {
          supported: true,
          ok: false,
          reason: 'financial_v2_revision_conflict',
          conflicts: response.conflicts,
          uploaded,
          downloaded,
          cursor,
          pages,
        };
      }

      const applied = await applyRemoteLedgerMutationsV8({
        namespace,
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
        mutations: response.remoteMutations,
        deviceId,
        allowProductionApply,
        database,
      });
      if (!applied.ok) {
        return {
          supported: true,
          ok: false,
          reason: applied.reason || 'financial_v2_remote_apply_failed',
          conflicts: applied.conflicts || [],
          uploaded,
          downloaded,
          cursor,
          pages,
          applyMode: allowProductionApply ? 'production' : 'shadow',
        };
      }

      downloaded += Number(applied.processed ?? applied.applied ?? 0);
      cursor = Math.max(cursor, Number(applied.cursor || response.latestSequence || 0));
      hasMore = response.hasMore;
      pages += 1;
      outgoing = [];

      if (!hasMore) break;
      if (cursor <= before) throw new Error('financial_v2_sync_cursor_stalled');
    }

    if (hasMore) throw new Error('financial_v2_sync_page_budget_exhausted');

    return {
      supported: true,
      ok: true,
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      protocolVersion: 2,
      uploaded,
      downloaded,
      cursor,
      pages,
      hasMore: false,
      applyMode: allowProductionApply ? 'production' : 'shadow',
      pendingAfterSync: (await readPendingLedgerMutationsV8({
        namespace,
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
        limit: 1,
        database,
      })).length,
    };
  } catch (error) {
    for (const row of pending) {
      await failLedgerMutationV8({
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
        mutationId: row.mutation_id,
        error: error?.message || error,
        database,
      }).catch(() => {});
    }
    return {
      supported: true,
      ok: false,
      reason: String(error?.message || 'financial_v2_sync_failed'),
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      uploaded,
      downloaded,
      cursor,
      pages,
      hasMore,
    };
  }
};
