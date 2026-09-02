// Phase 12-D archive companion: download and privately prove the archive head
// that belongs to a proved Bootstrap. It never promotes rows, binds identity or
// activates V2. That remains the next, atomic local-only step.
import * as Crypto from 'expo-crypto';
import { readFinancialArchiveHeadV2, verifyFinancialArchiveSnapshotReadbackV2 } from './financialArchiveSnapshotV2';
import {
  beginFinancialArchiveRecoveryImportV11,
  failFinancialArchiveRecoveryImportV12,
  inspectFinancialArchiveRecoveryStageV12,
  markFinancialArchiveRecoveryImportReadyV11,
  writeFinancialArchiveRecoveryStageRowV12,
} from './financialLedgerV7Repository';

const sha256Hex = value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(value ?? ''));

const bootstrap = source => {
  const ledgerId = String(source?.ledgerId || '').trim();
  const restoreEpoch = Number(source?.restoreEpoch);
  if (!ledgerId || !Number.isSafeInteger(restoreEpoch) || restoreEpoch <= 0) {
    throw new Error('financial_archive_recovery_bootstrap_source_invalid');
  }
  return { ledgerId, restoreEpoch };
};

export const stageFinancialArchiveRecoveryImportV2 = async ({
  supabase, namespace = 'guest', accountId, bootstrapSource, database = null,
} = {}) => {
  if (!supabase?.rpc) return { supported: false, ok: false, reason: 'supabase_unavailable' };
  const owner = String(accountId || '').trim();
  if (!owner) return { supported: true, ok: false, reason: 'financial_archive_recovery_account_missing' };
  let source; let head; let session;
  try {
    source = bootstrap(bootstrapSource);
    head = await readFinancialArchiveHeadV2({ supabase, ledgerId: source.ledgerId, restoreEpoch: source.restoreEpoch });
    if (!head?.ok) return { supported: true, ok: false, reason: head?.reason || 'financial_archive_recovery_head_failed', source };
    session = await beginFinancialArchiveRecoveryImportV11({
      namespace, accountId: owner, sourceLedgerId: source.ledgerId, sourceRestoreEpoch: source.restoreEpoch,
      archivePresent: head.archivePresent, sourceArchiveGeneration: head.archiveGeneration,
      sourceSnapshotId: head.snapshotId, sourceManifestHash: head.manifestHash,
      expectedRowCount: head.expectedRowCount, database,
    });
    if (!session?.session_id) {
      return { supported: true, ok: false, reason: 'financial_archive_recovery_session_invalid', source, head };
    }
    if (!head.archivePresent) {
      return { supported: true, ok: true, source, head, session, proofDigest: String(session.proof_digest) };
    }
    if (session.status === 'ready') {
      return {
        supported: true,
        ok: true,
        source,
        head,
        session,
        readback: null,
        proofDigest: String(session.proof_digest || ''),
      };
    }
    const readback = await verifyFinancialArchiveSnapshotReadbackV2({
      supabase, ledgerId: source.ledgerId, restoreEpoch: source.restoreEpoch,
      archiveGeneration: head.archiveGeneration, snapshotId: head.snapshotId,
      manifestHash: head.manifestHash, expectedRowCount: head.expectedRowCount,
      onVerifiedRow: row => writeFinancialArchiveRecoveryStageRowV12({ namespace, sessionId: session.session_id, row, database }),
    });
    if (!readback?.ok) {
      await failFinancialArchiveRecoveryImportV12({
        namespace, sessionId: session.session_id, error: readback?.reason || 'financial_archive_recovery_readback_failed', database,
      });
      return { supported: true, ok: false, reason: readback?.reason || 'financial_archive_recovery_readback_failed', source, head, session, readback };
    }
    const inspection = await inspectFinancialArchiveRecoveryStageV12({ namespace, sessionId: session.session_id, database });
    if (!inspection?.ok) return { supported: true, ok: false, reason: inspection?.reason || 'financial_archive_recovery_stage_invalid', source, head, session, readback, inspection };
    const proofDigest = String(await sha256Hex([
      'financial-archive-recovery-stage-v1', session.session_id, head.manifestHash,
      inspection.receipts.map(row => row.row_hash).join('\n'),
    ].join('\n'))).toLowerCase();
    const ready = await markFinancialArchiveRecoveryImportReadyV11({ namespace, sessionId: session.session_id, proofDigest, database });
    return { supported: true, ok: true, source, head, session: ready, readback, proofDigest };
  } catch (error) {
    if (session?.session_id && head?.archivePresent) {
      try {
        await failFinancialArchiveRecoveryImportV12({
          namespace, sessionId: session.session_id,
          error: String(error?.message || 'financial_archive_recovery_stage_failed'), database,
        });
      } catch {}
    }
    return { supported: true, ok: false, reason: String(error?.message || 'financial_archive_recovery_stage_failed'), source: source || null, head: head || null, session: session || null };
  }
};
