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

const countFromRow = row => Math.max(0, Number(row?.row_count || 0));

// The benchmark needs structural counts, not row payloads. Pulling 100k
// transactions plus their postings over the native bridge solely to call
// `.length` exhausts an ordinary Android heap before a measurement exists.
// Keep this verification inside SQLite and return six scalar values only.
const readProjectionCounts = async ({ db, namespace }) => {
  const [transactions, postings, links, accounts, exchangeRates, entities] = await Promise.all([
    db.getFirstAsync('SELECT COUNT(*) AS row_count FROM ledger_financial_transactions_v7 WHERE namespace=?', namespace),
    db.getFirstAsync('SELECT COUNT(*) AS row_count FROM ledger_postings_v7 WHERE namespace=?', namespace),
    db.getFirstAsync('SELECT COUNT(*) AS row_count FROM ledger_transaction_links_v7 WHERE namespace=?', namespace),
    db.getFirstAsync('SELECT COUNT(*) AS row_count FROM ledger_accounts_v7 WHERE namespace=?', namespace),
    db.getFirstAsync('SELECT COUNT(*) AS row_count FROM ledger_exchange_rates_v7 WHERE namespace=?', namespace),
    db.getFirstAsync('SELECT COUNT(*) AS row_count FROM ledger_entities_v7 WHERE namespace=?', namespace),
  ]);
  return {
    transactions: countFromRow(transactions),
    postings: countFromRow(postings),
    links: countFromRow(links),
    accounts: countFromRow(accounts),
    exchangeRates: countFromRow(exchangeRates),
    entities: countFromRow(entities),
  };
};

const hasProjectionRows = counts => (
  Object.values(counts || {}).some(value => Number(value || 0) !== 0)
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

const BENCHMARK_NAMESPACE_PREFIX = '__myfi_phase10_benchmark__:';

// Tables the benchmark writes rows into under its own namespaces.
const BENCHMARK_NAMESPACED_TABLES = Object.freeze([
  'ledger_financial_transactions_v7',
  'ledger_postings_v7',
  'ledger_transaction_links_v7',
  'ledger_entities_v7',
  'ledger_accounts_v7',
  'ledger_exchange_rates_v7',
  'ledger_workspace_state_v7',
]);

// Every run gets a fresh runId, so namespaces from a previous run are invisible to
// this one and its `finally` cleanup can never reach them. A process death runs no
// `finally` at all — which is exactly what happened on 2026-08-21, when the harness
// was killed by an OutOfMemoryError mid-tier and left its staging rows behind.
//
// So cleanup cannot only run at the end. It also has to run at the start, against
// whatever the last run failed to remove.
//
// The LIKE pattern is escaped: `_` is a single-character wildcard in SQL LIKE, and
// this prefix is mostly underscores. Unescaped, it would match namespaces that merely
// resemble the benchmark's and delete a workspace that is not ours.
const sweepOrphanedBenchmarkNamespaces = async (db) => {
  const pattern = `${BENCHMARK_NAMESPACE_PREFIX.replace(/_/g, '\\_')}%`;
  const orphans = new Set();

  for (const table of BENCHMARK_NAMESPACED_TABLES) {
    const found = await db.getAllAsync(
      `SELECT DISTINCT namespace FROM ${table} WHERE namespace LIKE ? ESCAPE '\\'`,
      pattern,
    );
    for (const row of rows(found)) {
      const value = String(row?.namespace || '').trim();
      // Belt and braces: never act on a namespace that does not literally start with
      // the prefix, whatever the LIKE returned.
      if (value.startsWith(BENCHMARK_NAMESPACE_PREFIX)) orphans.add(value);
    }
  }

  if (!orphans.size) return { swept: 0, namespaces: [] };

  // Stages first: clearing a target while its stage still references it is pointless
  // work, and the stage is the larger of the two.
  const ordered = [...orphans].sort((left, right) => (
    Number(right.includes('::shadow-stage::')) - Number(left.includes('::shadow-stage::'))
  ));

  const failures = [];
  for (const orphan of ordered) {
    try {
      if (orphan.includes('::shadow-stage::')) {
        await discardFinancialWorkspaceStageV7({ stageNamespace: orphan, database: db });
      } else {
        await clearFinancialWorkspaceV7({ namespace: orphan, database: db });
      }
    } catch (error) {
      failures.push(`${orphan}:${String(error?.message || error)}`);
    }
  }

  const evidence = { swept: ordered.length, namespaces: ordered, failures };
  console.log('[PHASE10_RESTORE_BENCHMARK_SWEPT_ORPHANS]', JSON.stringify(evidence));
  // A sweep that cannot finish means the database still holds rows this run would
  // measure alongside its own. Refuse rather than report a number built on someone
  // else's leftovers.
  assertHarness(!failures.length, 'orphan_sweep_failed', evidence);
  return evidence;
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
      readProjectionCounts({ db, namespace: stageNamespace }),
      readProjectionCounts({ db, namespace }),
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

  // Before measuring anything, remove what a previously killed run left behind.
  //
  // Deliberately after the disposable-account check, not before it: the ledger tables
  // are created by ensureFinancialLedgerV7, which the check above reaches through
  // readFinancialWorkspaceV7. Sweeping first would query tables that may not exist yet
  // on a fresh install. Safe in this order because benchmark namespaces are prefixed
  // and separate, so orphans never count against the disposable check — if that ever
  // stops being true, this has to move up and ensure the schema itself, or a blocked
  // account could never sweep the leftovers that were blocking it.
  await sweepOrphanedBenchmarkNamespaces(db);

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
      let workspace = await buildPerformanceTestWorkspaceAsync({}, tier.id);
      let coldArchives = rows(workspace?.__performanceArchives);

      const canonicalStarted = nowMs();
      const projection = buildFinancialShadowProjectionV7({
        namespace: stageNamespace,
        workspace,
        coldArchives,
      });
      const canonicalBuildRawMs = nowMs() - canonicalStarted;
      // The projection is now the sole source for staging. Releasing the fixture
      // lets Hermes collect the duplicate synthetic document before native SQLite
      // work begins on the largest tier.
      workspace = null;
      coldArchives = null;

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
      const stagedReadback = await readProjectionCounts({ db, namespace: stageNamespace });
      const stageReadbackRawMs = nowMs() - stageReadbackStarted;

      // This harness does not reimplement the migration module's private semantic
      // checksum/metrics helpers. It performs only a structural count guard before
      // promotion so a visibly incomplete disposable stage is never promoted.
      const sourceCounts = sourceProjectionCounts(projection);
      const targetCounts = stagedReadback;
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
      const postCommitReadback = await readProjectionCounts({ db, namespace });
      const postCommitReadbackRawMs = nowMs() - postCommitStarted;

      const promotedCounts = postCommitReadback;
      assertHarness(
        sameCounts(targetCounts, promotedCounts),
        `post_commit_structural_count_mismatch:${tier.id}`,
        { stagedCounts: targetCounts, promotedCounts },
      );

      // Required Phase-10 decision metric, but a LOWER BOUND on the real thing:
      // Strategy A baseline = stage write + stage readback + SQL-native promotion.
      // The production restore also holds the ledger exclusively across
      // beginLedgerRestoreEpochV8 and commitLedgerRestoreEpochV8, which this harness
      // does not perform. The true blocked window is this number plus both.
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

      const tierResult = {
        tierId: String(tier.id),
        transactions: Number(tier.transactions),

        canonicalBuildMs: roundMs(canonicalBuildRawMs),
        stageWriteMs: roundMs(stageWriteRawMs),
        stageReadbackMs: roundMs(stageReadbackRawMs),
        promotionTransactionMs: roundMs(promotionRawMs),
        promotionOnlyMs: roundMs(promotionRawMs),
        postCommitReadbackMs: roundMs(postCommitReadbackRawMs),
        maintenanceBlockedMs: roundMs(maintenanceBlockedRawMs),
        // Carried in the payload, not only in a comment, so the number cannot be read
        // as the full production lock window by anyone holding just this evidence JSON.
        maintenanceBlockedIsLowerBound: true,
        maintenanceBlockedScope: 'stage_write+stage_readback+promotion',
        maintenanceBlockedExcludes: ['beginLedgerRestoreEpochV8', 'commitLedgerRestoreEpochV8'],
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
      };

      // Emitted per tier, not only in the summary at the end.
      //
      // On 2026-08-21 this harness ran for six and a half minutes on a real phone and
      // was then killed by an OutOfMemoryError partway through. The 1k, 10k and 50k
      // measurements had almost certainly completed, and every one of them died with
      // the process, because results were logged once after the whole loop. A tool
      // whose entire job is to survive long enough to report has to report as it goes.
      console.log('[PHASE10_RESTORE_BENCHMARK_TIER]', JSON.stringify(tierResult));
      results.push(tierResult);
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
