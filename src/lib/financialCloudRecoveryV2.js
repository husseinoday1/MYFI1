import * as Crypto from 'expo-crypto';

const sha256Hex = value => Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  String(value ?? ''),
);

const normalizeSource = data => {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') {
    throw new Error('financial_cloud_recovery_source_invalid');
  }
  return {
    mode: String(value.mode || 'none'),
    ledgerId: String(value.ledgerId ?? value.ledger_id ?? ''),
    restoreEpoch: Number(value.restoreEpoch ?? value.restore_epoch ?? 0),
    bootstrapId: String(value.bootstrapId ?? value.bootstrap_id ?? ''),
    manifestHash: String(value.manifestHash ?? value.manifest_hash ?? '').toLowerCase(),
    expectedRowCount: Number(value.expectedRowCount ?? value.expected_row_count ?? 0),
    bootstrappedAt: value.bootstrappedAt ?? value.bootstrapped_at ?? null,
    snapshotText: typeof (value.snapshotText ?? value.snapshot_text) === 'string'
      ? (value.snapshotText ?? value.snapshot_text)
      : '',
    snapshotHash: String(value.snapshotHash ?? value.snapshot_hash ?? '').toLowerCase(),
    cloudRevision: Number(value.cloudRevision ?? value.cloud_revision ?? 0),
    cloudUpdatedAt: value.cloudUpdatedAt ?? value.cloud_updated_at ?? null,
    legacyFinancialCount: Number(value.legacyFinancialCount ?? value.legacy_financial_count ?? 0),
    walletCount: Number(value.walletCount ?? value.wallet_count ?? 0),
    reservedLedgerId: String(value.reservedLedgerId ?? value.reserved_ledger_id ?? ''),
    reservedRestoreEpoch: Number(value.reservedRestoreEpoch ?? value.reserved_restore_epoch ?? 0),
  };
};

const validLegacySnapshotShape = snapshot => (
  snapshot
  && Number(snapshot.v) === 7
  && snapshot.data
  && Array.isArray(snapshot.data.trans)
  && Array.isArray(snapshot.data.debts)
  && Array.isArray(snapshot.data.goals)
  && Array.isArray(snapshot.data.wallets)
  && Array.isArray(snapshot.data.commitments)
  && Array.isArray(snapshot.cats)
  && snapshot.cfg
  && typeof snapshot.cfg === 'object'
  && !Array.isArray(snapshot.cfg)
);

export const fetchVerifiedFinancialCloudRecoverySourceV2 = async ({
  supabase,
} = {}) => {
  if (!supabase?.rpc) {
    return { supported: false, ok: false, reason: 'supabase_unavailable' };
  }

  try {
    const { data, error } = await supabase.rpc('get_financial_cloud_recovery_source_v2');
    if (error) throw error;

    const source = normalizeSource(data);
    if (source.mode === 'none') {
      return { supported: true, ok: true, mode: 'none' };
    }

    if (source.mode === 'v2_bootstrap') {
      if (!source.ledgerId
          || source.restoreEpoch <= 0
          || !source.bootstrapId
          || !/^[0-9a-f]{64}$/.test(source.manifestHash)
          || !Number.isSafeInteger(source.expectedRowCount)
          || source.expectedRowCount < 0
          || !source.bootstrappedAt) {
        throw new Error('financial_v2_cloud_bootstrap_recovery_metadata_invalid');
      }
      return {
        supported: true,
        ok: true,
        mode: 'v2_bootstrap',
        ledgerId: source.ledgerId,
        restoreEpoch: source.restoreEpoch,
        bootstrapId: source.bootstrapId,
        manifestHash: source.manifestHash,
        expectedRowCount: source.expectedRowCount,
        bootstrappedAt: source.bootstrappedAt,
        requiresBootstrapImport: true,
      };
    }

    if (source.mode === 'v2_unbootstrapped') {
      return {
        supported: true,
        ok: true,
        mode: 'v2_unbootstrapped',
        ledgerId: source.ledgerId,
        restoreEpoch: source.restoreEpoch,
      };
    }

    if (source.mode !== 'legacy_snapshot') {
      throw new Error('financial_cloud_recovery_mode_unknown');
    }
    if (!source.snapshotText
        || !/^[0-9a-f]{64}$/.test(source.snapshotHash)
        || !Number.isSafeInteger(source.cloudRevision)
        || source.cloudRevision < 0) {
      throw new Error('financial_cloud_recovery_snapshot_metadata_invalid');
    }

    const computed = String(await sha256Hex(source.snapshotText)).toLowerCase();
    if (computed !== source.snapshotHash) {
      throw new Error('financial_cloud_recovery_snapshot_hash_mismatch');
    }

    let snapshot;
    try {
      snapshot = JSON.parse(source.snapshotText);
    } catch {
      throw new Error('financial_cloud_recovery_snapshot_json_invalid');
    }
    if (!validLegacySnapshotShape(snapshot)) {
      throw new Error('financial_cloud_recovery_snapshot_shape_invalid');
    }
    if (Number(snapshot.cloudRevision || 0) !== source.cloudRevision) {
      throw new Error('financial_cloud_recovery_snapshot_revision_mismatch');
    }

    return {
      supported: true,
      ok: true,
      mode: 'legacy_snapshot',
      snapshot,
      snapshotText: source.snapshotText,
      snapshotHash: source.snapshotHash,
      cloudRevision: source.cloudRevision,
      cloudUpdatedAt: source.cloudUpdatedAt,
      legacyFinancialCount: source.legacyFinancialCount,
      walletCount: source.walletCount,
      reservedLedgerId: source.reservedLedgerId || null,
      reservedRestoreEpoch: source.reservedRestoreEpoch || null,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      supported: true,
      ok: false,
      reason: String(error?.message || 'financial_cloud_recovery_source_failed'),
    };
  }
};
