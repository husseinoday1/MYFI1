import * as Crypto from 'expo-crypto';
import { buildFinancialBootstrapRowsV2, verifyFinancialBootstrapReadbackV2 } from './financialBootstrapV2';
import {
  beginFinancialBootstrapRecoveryImportV9,
  failFinancialBootstrapRecoveryImportV10,
  inspectFinancialBootstrapRecoveryStageV10,
  markFinancialBootstrapRecoveryImportReadyV9,
  writeFinancialBootstrapRecoveryStageRowV10,
} from './financialLedgerV7Repository';

const sha256Hex = value => Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  String(value ?? ''),
);

const exactRecoverySource = source => {
  const ledgerId = String(source?.ledgerId || '').trim();
  const restoreEpoch = Number(source?.restoreEpoch);
  const bootstrapId = String(source?.bootstrapId || '').trim();
  const manifestHash = String(source?.manifestHash || '').trim().toLowerCase();
  const expectedRowCount = Number(source?.expectedRowCount);
  if (!ledgerId || !Number.isSafeInteger(restoreEpoch) || restoreEpoch <= 0 || !bootstrapId
      || !/^[0-9a-f]{64}$/.test(manifestHash)
      || !Number.isSafeInteger(expectedRowCount) || expectedRowCount < 0) {
    throw new Error('financial_v2_bootstrap_recovery_source_invalid');
  }
  return { ledgerId, restoreEpoch, bootstrapId, manifestHash, expectedRowCount };
};

// This performs download + private-stage proof only. It cannot bind the V2
// identity, clear a live namespace, create outbox rows, or activate sync. Those
// operations remain a separate, reviewed atomic promotion step.
export const stageFinancialBootstrapRecoveryImportV2 = async ({
  supabase, namespace = 'guest', accountId, source, database = null,
} = {}) => {
  if (!supabase?.rpc) return { supported: false, ok: false, reason: 'supabase_unavailable' };
  const targetAccountId = String(accountId || '').trim();
  if (!targetAccountId) return { supported: true, ok: false, reason: 'financial_v2_bootstrap_recovery_account_missing' };

  let normalized;
  let session;
  try {
    normalized = exactRecoverySource(source);
    session = await beginFinancialBootstrapRecoveryImportV9({
      namespace,
      accountId: targetAccountId,
      sourceLedgerId: normalized.ledgerId,
      sourceRestoreEpoch: normalized.restoreEpoch,
      sourceBootstrapId: normalized.bootstrapId,
      sourceManifestHash: normalized.manifestHash,
      expectedRowCount: normalized.expectedRowCount,
      database,
    });
    if (!session?.session_id) {
      return { supported: true, ok: false, reason: 'financial_v2_bootstrap_recovery_session_invalid' };
    }
    if (session.status === 'ready') {
      return {
        supported: true,
        ok: true,
        session,
        source: normalized,
        readback: null,
        proofDigest: String(session.proof_digest || ''),
      };
    }
    const readback = await verifyFinancialBootstrapReadbackV2({
      supabase,
      ledgerId: normalized.ledgerId,
      restoreEpoch: normalized.restoreEpoch,
      bootstrapId: normalized.bootstrapId,
      manifestHash: normalized.manifestHash,
      expectedRowCount: normalized.expectedRowCount,
      onVerifiedRow: row => writeFinancialBootstrapRecoveryStageRowV10({
        namespace, sessionId: session.session_id, row, database,
      }),
    });
    if (!readback?.ok) {
      await failFinancialBootstrapRecoveryImportV10({
        namespace, sessionId: session.session_id, error: readback?.reason || 'financial_v2_bootstrap_readback_failed', database,
      });
      return { supported: true, ok: false, reason: readback?.reason || 'financial_v2_bootstrap_readback_failed', session, readback };
    }

    const inspection = await inspectFinancialBootstrapRecoveryStageV10({
      namespace, sessionId: session.session_id, database,
    });
    if (!inspection?.ok) return { supported: true, ok: false, reason: inspection?.reason || 'financial_v2_bootstrap_recovery_stage_invalid', session, readback, inspection };

    const rebuilt = await buildFinancialBootstrapRowsV2(inspection.stage.snapshot);
    const receiptRows = inspection.stage.receipts;
    const exact = rebuilt.manifestHash === normalized.manifestHash
      && rebuilt.expectedRowCount === normalized.expectedRowCount
      && rebuilt.rows.length === receiptRows.length
      && rebuilt.rows.every((row, index) => (
        Number(row.ordinal) === Number(receiptRows[index]?.ordinal)
        && row.rowType === String(receiptRows[index]?.row_type)
        && row.rowKey === String(receiptRows[index]?.row_key)
        && row.rowHash === String(receiptRows[index]?.row_hash).toLowerCase()
        && row.payloadText === String(receiptRows[index]?.payload_text)
      ));
    if (!exact) {
      return { supported: true, ok: false, reason: 'financial_v2_bootstrap_recovery_stage_manifest_mismatch', session, readback, inspection };
    }
    const proofDigest = String(await sha256Hex([
      'financial-bootstrap-recovery-stage-v1',
      session.session_id,
      normalized.manifestHash,
      rebuilt.rows.map(row => row.rowHash).join('\n'),
    ].join('\n'))).toLowerCase();
    const ready = await markFinancialBootstrapRecoveryImportReadyV9({
      namespace, sessionId: session.session_id, proofDigest, database,
    });
    return {
      supported: true,
      ok: true,
      session: ready,
      source: normalized,
      readback,
      proofDigest,
    };
  } catch (error) {
    if (session?.session_id) {
      try {
        await failFinancialBootstrapRecoveryImportV10({
          namespace, sessionId: session.session_id,
          error: String(error?.message || 'financial_v2_bootstrap_recovery_stage_failed'), database,
        });
      } catch {}
    }
    return {
      supported: true,
      ok: false,
      reason: String(error?.message || 'financial_v2_bootstrap_recovery_stage_failed'),
      session: session || null,
      source: normalized || null,
    };
  }
};
