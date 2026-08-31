// Phase 12-D coordinator. It is deliberately not connected to startup/UI yet:
// it proves both sources, stages both datasets, re-reads both cloud heads, then
// asks the local atomic promotion to accept their exact current values.
import { fetchVerifiedFinancialCloudRecoverySourceV2 } from './financialCloudRecoveryV2';
import { readFinancialArchiveHeadV2 } from './financialArchiveSnapshotV2';
import { stageFinancialBootstrapRecoveryImportV2 } from './financialBootstrapRecoveryImportV2';
import { stageFinancialArchiveRecoveryImportV2 } from './financialArchiveRecoveryImportV2';
import { promoteVerifiedBootstrapRecoveryV2 } from './financialBootstrapRecoveryPromotionV2';

const exactBootstrap = (left, right) => (
  left?.mode === 'v2_bootstrap' && right?.mode === 'v2_bootstrap'
  && String(left.ledgerId) === String(right.ledgerId)
  && Number(left.restoreEpoch) === Number(right.restoreEpoch)
  && String(left.bootstrapId) === String(right.bootstrapId)
  && String(left.manifestHash).toLowerCase() === String(right.manifestHash).toLowerCase()
  && Number(left.expectedRowCount) === Number(right.expectedRowCount)
);

const exactArchiveHead = (left, right) => (
  !!left && !!right && String(left.ledgerId) === String(right.ledgerId)
  && Number(left.restoreEpoch) === Number(right.restoreEpoch)
  && Boolean(left.archivePresent) === Boolean(right.archivePresent)
  && Number(left.archiveGeneration || 0) === Number(right.archiveGeneration || 0)
  && String(left.snapshotId || '') === String(right.snapshotId || '')
  && String(left.manifestHash || '').toLowerCase() === String(right.manifestHash || '').toLowerCase()
  && Number(left.expectedRowCount || 0) === Number(right.expectedRowCount || 0)
);

const failure = (reason, extra = {}) => ({ supported: true, ok: false, reason: String(reason || 'financial_v2_bootstrap_recovery_failed'), ...extra });

export const recoverVerifiedBootstrapWithArchiveV2 = async ({
  supabase, namespace = 'guest', accountId, database = null,
} = {}) => {
  if (!supabase?.rpc) return { supported: false, ok: false, reason: 'supabase_unavailable' };
  const owner = String(accountId || '').trim();
  if (!owner) return failure('financial_v2_bootstrap_recovery_account_missing');

  const initial = await fetchVerifiedFinancialCloudRecoverySourceV2({ supabase });
  if (!initial?.ok || initial.mode !== 'v2_bootstrap') {
    return failure(initial?.reason || 'financial_v2_bootstrap_recovery_source_unavailable', { source: initial || null });
  }
  const bootstrap = await stageFinancialBootstrapRecoveryImportV2({
    supabase, namespace, accountId: owner, source: initial, database,
  });
  if (!bootstrap?.ok) return failure(bootstrap?.reason, { source: initial, bootstrap });
  const archive = await stageFinancialArchiveRecoveryImportV2({
    supabase, namespace, accountId: owner, bootstrapSource: initial, database,
  });
  if (!archive?.ok) return failure(archive?.reason, { source: initial, bootstrap, archive });

  // A source might change while rows download. Fresh, independently verified
  // reads must match both READY sessions before destructive local work begins.
  const [freshBootstrap, freshArchive] = await Promise.all([
    fetchVerifiedFinancialCloudRecoverySourceV2({ supabase }),
    readFinancialArchiveHeadV2({ supabase, ledgerId: initial.ledgerId, restoreEpoch: initial.restoreEpoch }),
  ]);
  if (!freshBootstrap?.ok || !exactBootstrap(initial, freshBootstrap)) {
    return failure('financial_v2_bootstrap_recovery_source_changed', { source: initial, freshBootstrap, bootstrap, archive });
  }
  if (!freshArchive?.ok || !exactArchiveHead(archive.head, freshArchive)) {
    return failure('financial_archive_recovery_source_changed', { source: initial, archive, freshArchive, bootstrap });
  }
  return promoteVerifiedBootstrapRecoveryV2({
    namespace, accountId: owner, bootstrapSessionId: bootstrap.session.session_id,
    archiveSessionId: archive.session.session_id, bootstrapSource: freshBootstrap,
    archiveHead: freshArchive, database,
  });
};
