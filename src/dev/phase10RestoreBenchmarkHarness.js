// Phase 10 restore staging/promotion benchmark harness.
// Dev-only. Runs only on native devices, only when explicitly enabled, and only
// when the current MYFI account passes the same disposable/financially-empty
// preconditions used by the existing P19 restore-epoch acceptance gate.

import { Platform } from 'react-native';
import { useStore } from '../store/useStore';
import { getLedgerNamespace } from '../lib/activeLedgerRepository';
import { getLedgerDb } from '../lib/ledgerDatabase';
import {
  clearFinancialWorkspaceV7,
  discardFinancialWorkspaceStageV7,
  promoteFinancialWorkspaceStageV7,
  readFinancialProjectionV7,
  readFinancialWorkspaceV7,
  stageFinancialWorkspaceV7,
} from '../lib/financialLedgerV7Repository';
import { buildFinancialShadowProjectionV7 } from '../lib/financialLedgerV7Migration';
import { exportColdArchives, getColdArchiveNamespace } from '../lib/localArchiveRepository';
// The disposable-ledger guard lives in the acceptance gate that owns it. The
// harness arrived with its own copy of the function body; a duplicated safety
// decision drifts, and today the gate copy already carried SQLite wallet checks
// the duplicate would have to be kept in step with by hand forever.
import { disposableBlockers } from './p19RestoreEpochDeviceGate';
import { getPerformanceTestTier } from './performanceTestConfig';
import { buildPerformanceTestWorkspaceAsync } from './performanceTestData';

export const PHASE10_RESTORE_BENCHMARK_ENABLED = (
  process.env.EXPO_PUBLIC_PHASE10_RESTORE_BENCHMARK === '1'
);

const assertHarness = (condition, code, details = null) => {
  if (condition) return;
  const error = new Error(`phase10_restore_benchmark_${code}`);
  if (details) error.details = details;
  throw error;
};

const rows = value => (Array.isArray(value) ? value : []);

const objectSize = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0
);

const walletOpeningValue = wallet => {
  const candidates = [
    wallet?.openingBalance,
    wallet?.openingBaseBalance,
    wallet?.openingBalanceMinor,
    wallet?.openingBaseBalanceMinor,
  ];
  return candidates.reduce((max, value) => {
    const number = Math.abs(Number(value || 0));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);
};


const nowMs = () => (
  typeof globalThis !== 'undefined'
  && globalThis.performance
  && typeof globalThis.performance.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
);

const roundMs = value => Math.round(Number(value || 0) * 1000) / 1000;

const projectionCounts = projection => ({
  transactions: rows(projection?.transactions).length,
  postings: rows(projection?.postings).length,
  links: rows(projection?.links).length,
  accounts: rows(projection?.accounts).length,
  exchangeRates: rows(projection?.exchangeRates).length,
  entities: rows(projection?.entities).length,
});

const sourceProjectionCounts = projection => ({
  transactions: rows(projection?.document?.transactions).length,
  postings: rows(projection?.document?.postings).length,
  links: rows(projection?.document?.links).length,
  accounts: rows(projection?.document?.accounts).length,
  exchangeRates: rows(projection?.document?.exchangeRates).length,
  entities: rows(projection?.document?.entities).length,
});

const sameCounts = (left, right) => (
  left.transactions === right.transactions
  && left.postings === right.postings
  && left.links === right.links
  && left.accounts === right.accounts
  && left.exchangeRates === right.exchangeRates
  && left.entities === right.entities
);

const hasProjectionRows = projection => (
  Object.values(projectionCounts(projection)).some(value => Number(value || 0) !== 0)
);

const assertDisposableCurrentAccount = async db => {
  const state = useStore.getState();
  const workspaceNamespace = String(state?.workspaceNamespace || '').trim();
  assertHarness(workspaceNamespace, 'workspace_namespace_missing');

  const ledgerNamespace = getLedgerNamespace(workspaceNamespace, state.cfg);
  const archiveNamespace = getColdArchiveNamespace(workspaceNamespace, state.cfg);

  // Keep the same read order as the P19 gate.
  const coldArchives = await exportColdArchives(archiveNamespace);
  const localWorkspace = await readFinancialWorkspaceV7({
    namespace: ledgerNamespace,
    database: db,
  });

  const blockers = disposableBlockers({ state, coldArchives, localWorkspace });
  if (blockers.length) {
    const evidence = {
      ok: false,
      blocked: true,
      reason: 'disposable_financially_empty_account_required',
      blockers,
    };
    console.warn('[PHASE10_RESTORE_BENCHMARK_BLOCKED]', JSON.stringify(evidence));
    assertHarness(false, 'disposable_financially_empty_account_required', evidence);
  }
};

const cleanupTierNamespaces = async ({ db, namespace, stageNamespace }) => {
  const cleanupErrors = [];

  try {
    await discardFinancialWorkspaceStageV7({ stageNamespace, database: db });
  } catch (error) {
    cleanupErrors.push(`stage_discard:${String(error?.message || error)}`);
  }

  try {
    await clearFinancialWorkspaceV7({ namespace, database: db });
  } catch (error) {
    cleanupErrors.push(`target_clear:${String(error?.message || error)}`);
  }

  // Verify that the namespace-scoped financial projection is empty after cleanup.
  try {
    const [stageAfter, targetAfter] = await Promise.all([
      readFinancialProjectionV7({ namespace: stageNamespace, database: db }),
      readFinancialProjectionV7({ namespace, database: db }),
    ]);
    if (hasProjectionRows(stageAfter)) cleanupErrors.push('stage_projection_not_empty_after_cleanup');
    if (hasProjectionRows(targetAfter)) cleanupErrors.push('target_projection_not_empty_after_cleanup');
  } catch (error) {
    cleanupErrors.push(`cleanup_readback:${String(error?.message || error)}`);
  }

  if (cleanupErrors.length) {
    assertHarness(false, 'cleanup_failed', { namespace, stageNamespace, cleanupErrors });
  }
};

// Measures the existing V7 staging/readback/promotion path only.
// ZIP/package I/O, decrypt/inflate/parse, JS heap estimation, and SQLite file-size
// probes are intentionally outside this harness and remain explicit nulls below.
export async function runPhase10RestoreBenchmarkHarness({
  tierIds = ['1000', '10000', '50000', '100000'],
} = {}) {
  assertHarness(
    Platform.OS === 'android' || Platform.OS === 'ios',
    'native_platform_required',
  );
  assertHarness(
    PHASE10_RESTORE_BENCHMARK_ENABLED,
    'acceptance_build_flag_required',
  );
  assertHarness(Array.isArray(tierIds) && tierIds.length > 0, 'tier_ids_required');

  const db = await getLedgerDb();
  assertHarness(db, 'database_unavailable');

  // Safety check is against the currently-open MYFI account/workspace, not against
  // the benchmark namespace. The benchmark itself never reads, rewrites, or syncs
  // that account's financial rows.
  await assertDisposableCurrentAccount(db);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const baseNamespace = `__myfi_phase10_benchmark__:${runId}`;
  const results = [];

  for (const requestedTierId of tierIds) {
    const tier = getPerformanceTestTier(requestedTierId);
    assertHarness(
      tier && String(tier.id) === String(requestedTierId),
      `unknown_tier:${String(requestedTierId)}`,
    );

    const namespace = `${baseNamespace}:${tier.id}`;
    const stageNamespace = `${namespace}::shadow-stage::phase10-benchmark`;

    let operationError = null;

    try {
      // Defensive pre-clean in case a prior dev build reused an equivalent namespace.
      await discardFinancialWorkspaceStageV7({ stageNamespace, database: db }).catch(() => {});
      await clearFinancialWorkspaceV7({ namespace, database: db });

      // Synthetic fixture generation is benchmark setup, not part of restore time.
      // It is deliberately excluded from totalRestoreMs.
      const workspace = await buildPerformanceTestWorkspaceAsync({}, tier.id);
      const coldArchives = rows(workspace?.__performanceArchives);

      const canonicalStarted = nowMs();
      const projection = buildFinancialShadowProjectionV7({
        namespace: stageNamespace,
        workspace,
        coldArchives,
      });
      const canonicalBuildRawMs = nowMs() - canonicalStarted;

      const stageStarted = nowMs();
      const stagedWrite = await stageFinancialWorkspaceV7({
        stageNamespace,
        commands: projection.commands,
        entities: projection.entities,
        workspacePayload: projection.workspacePayload,
        database: db,
      });
      const stageWriteRawMs = nowMs() - stageStarted;
      assertHarness(stagedWrite?.ok === true, `stage_failed:${tier.id}`, stagedWrite);

      const stageReadbackStarted = nowMs();
      const stagedReadback = await readFinancialProjectionV7({
        namespace: stageNamespace,
        database: db,
      });
      const stageReadbackRawMs = nowMs() - stageReadbackStarted;

      // This harness does not reimplement the migration module's private semantic
      // checksum/metrics helpers. It performs only a structural count guard before
      // promotion so a visibly incomplete disposable stage is never promoted.
      const sourceCounts = sourceProjectionCounts(projection);
      const targetCounts = projectionCounts(stagedReadback);
      assertHarness(
        sameCounts(sourceCounts, targetCounts),
        `stage_structural_count_mismatch:${tier.id}`,
        { sourceCounts, targetCounts },
      );

      const promotionStarted = nowMs();
      const promoted = await promoteFinancialWorkspaceStageV7({
        namespace,
        stageNamespace,
        checksum: projection.checksum,
        sourceCounts,
        targetCounts,
        differences: [],
        workspacePayload: projection.workspacePayload,
        resetPendingOutbox: false,
        database: db,
      });
      const promotionRawMs = nowMs() - promotionStarted;
      assertHarness(promoted?.ok === true, `promotion_failed:${tier.id}`, promoted);

      const postCommitStarted = nowMs();
      const postCommitReadback = await readFinancialProjectionV7({
        namespace,
        database: db,
      });
      const postCommitReadbackRawMs = nowMs() - postCommitStarted;

      const promotedCounts = projectionCounts(postCommitReadback);
      assertHarness(
        sameCounts(targetCounts, promotedCounts),
        `post_commit_structural_count_mismatch:${tier.id}`,
        { stagedCounts: targetCounts, promotedCounts },
      );

      // Required Phase-10 decision metric:
      // Strategy A baseline = stage write + stage readback + SQL-native promotion.
      const maintenanceBlockedRawMs = (
        stageWriteRawMs
        + stageReadbackRawMs
        + promotionRawMs
      );

      // Fixture generation and cleanup are intentionally excluded.
      const totalRestoreRawMs = (
        canonicalBuildRawMs
        + stageWriteRawMs
        + stageReadbackRawMs
        + promotionRawMs
        + postCommitReadbackRawMs
      );

      results.push({
        tierId: String(tier.id),
        transactions: Number(tier.transactions),

        canonicalBuildMs: roundMs(canonicalBuildRawMs),
        stageWriteMs: roundMs(stageWriteRawMs),
        stageReadbackMs: roundMs(stageReadbackRawMs),
        promotionTransactionMs: roundMs(promotionRawMs),
        promotionOnlyMs: roundMs(promotionRawMs),
        postCommitReadbackMs: roundMs(postCommitReadbackRawMs),
        maintenanceBlockedMs: roundMs(maintenanceBlockedRawMs),
        totalRestoreMs: roundMs(totalRestoreRawMs),

        // Outside this staging/promotion harness. These require a separate
        // package/ZIP/crypto/heap/SQLite-size benchmark layer.
        packageReadMs: null,
        decryptMs: null,
        inflateMs: null,
        parseMs: null,
        peakJsHeapApprox: null,
        sqliteSizeBefore: null,
        sqliteSizeStaged: null,
        sqliteSizeAfter: null,
      });
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      try {
        await cleanupTierNamespaces({ db, namespace, stageNamespace });
      } catch (cleanupError) {
        if (operationError) {
          console.error(
            '[PHASE10_RESTORE_BENCHMARK_CLEANUP_AFTER_FAILURE]',
            JSON.stringify({
              tierId: String(tier.id),
              operationError: String(operationError?.message || operationError),
              cleanupError: String(cleanupError?.message || cleanupError),
              cleanupDetails: cleanupError?.details || null,
            }),
          );
        }
        throw cleanupError;
      }

      // Give React Native one turn between very large tiers; this is outside all
      // measured restore intervals.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  const text = JSON.stringify(results, null, 2);
  console.log('[PHASE10_RESTORE_BENCHMARK_RESULTS]', text);
  return results;
}
