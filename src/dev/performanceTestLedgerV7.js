// MYFI Phase 15 — the performance lab must exercise the same V7 projection
// and operational cutover that a real local workspace uses.

import { activeLedgerSupported, getLedgerDataHealth, getLedgerNamespace } from '../lib/activeLedgerRepository';
import {
  clearFinancialWorkspaceV7,
  getFinancialWorkspaceStateV7,
} from '../lib/financialLedgerV7Repository';
import { runFinancialOperationalCutoverV7 } from '../lib/financialLedgerV7Migration';

let lastAttempt = null;
// Retain codes only: health results also contain wallet balances and account IDs.
// Failed entry leaves the store in the previous workspace, so Diagnostics must
// not infer which namespace/tier failed from the current store configuration.
export const readPerformanceLedgerAttemptV7 = () => lastAttempt;
const safeCode = value => (
  typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value) ? value : null
);
const recordAttempt = (result, tier, phase) => {
  lastAttempt = {
    tier, phase, at: new Date().toISOString(),
    ok: result?.ok === true, cutover: result?.cutover === true,
    // These are structural state codes only. Do not retain health counts,
    // wallet IDs, or any fixture rows in a Diagnostics-safe attempt record.
    reason: safeCode(result?.reason),
    reuseFailureReason: safeCode(result?.reuseFailureReason),
    issueCodes: [...new Set([
      ...(result?.health?.issues || []).map(issue => issue?.code),
      ...(result?.healthIssueCodes || []),
    ].filter(safeCode))],
    // Duration-only rebuild-path trace (see `mark` below). Structural step
    // names and elapsed milliseconds only, never rows or financial values.
    steps: Array.isArray(result?.steps)
      ? result.steps
        .filter(step => safeCode(step?.name) && Number.isFinite(Number(step?.atMs)))
        .map(step => ({ name: safeCode(step.name), atMs: Math.max(0, Math.round(Number(step.atMs))) }))
      : [],
  };
  return { ...result, issueCodes: lastAttempt.issueCodes };
};

const parseJson = (value, fallback = null) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};

const stateTier = state => {
  const payload = parseJson(state?.payload_json, {}) || {};
  return String(payload?.cfg?.performanceTestTier || '');
};

const failure = (result, fallbackReason) => ({
  ...(result || {}),
  supported: result?.supported !== false,
  ok: false,
  cutover: false,
  reason: result?.reason || fallbackReason,
});

// This probe is deliberately non-mutating. Startup calls it before reading
// cold archives: a healthy V7 lab is already the source of truth, so loading
// every archived year merely to prove the same fact adds a large, avoidable
// JS allocation. A false result means "rebuild with the archive source", not
// "clear anything".
const reusablePerformanceTestLedgerV7 = async ({
  workspaceNamespace = 'guest',
  workspace = {},
  onDiagnosticStep = null,
} = {}) => {
  const namespace = getLedgerNamespace(workspaceNamespace, workspace?.cfg || {});
  const requestedTier = String(workspace?.cfg?.performanceTestTier || '');
  const currentState = await getFinancialWorkspaceStateV7({ namespace });
  try { onDiagnosticStep?.('state'); } catch {}
  if (!currentState) return { ok: false, reuseFailureReason: 'performance_v7_reuse_state_missing' };
  if (currentState.source_mode !== 'sqlite') return { ok: false, reuseFailureReason: 'performance_v7_reuse_source_not_sqlite' };
  if (stateTier(currentState) !== requestedTier) return { ok: false, reuseFailureReason: 'performance_v7_reuse_tier_mismatch' };

  const health = await getLedgerDataHealth({
    namespace,
    walletIds: Array.isArray(workspace?.wallets) ? workspace.wallets.map(item => item.id) : [],
    expectedActiveCount: Array.isArray(workspace?.trans) ? workspace.trans.length : null,
    onDiagnosticStep,
  });
  if (!health?.ok) {
    return {
      ok: false,
      reuseFailureReason: 'performance_v7_reuse_health_failed',
      healthIssueCodes: (health?.issues || []).map(issue => issue?.code).filter(safeCode),
    };
  }

  return {
    supported: true,
    ok: true,
    alreadyCutover: true,
    cutover: true,
    sourceMode: 'sqlite',
    checksum: currentState.shadow_checksum || null,
    health,
  };
};

/**
 * Prepare one isolated performance namespace as an operational V7 ledger.
 *
 * `forceReplace` is intentionally only used by an explicit tier switch/entry;
 * the normal startup path reuses a verified namespace when its tier marker
 * matches. The two migration calls remain separate so the evidence includes
 * both the shadow parity proof and the final atomic operational promotion.
 */
export const ensurePerformanceTestLedgerV7 = async ({
  workspaceNamespace = 'guest',
  workspace = {},
  coldArchives = [],
  forceReplace = false,
  batchSize,
  onDiagnosticStep = null,
  // `reuseOnly` is startup's non-mutating preflight. It must never fall
  // through into the disposable rebuild without the caller first loading the
  // archived source that parity needs.
  reuseOnly = false,
} = {}) => {
  // The destructive rebuild below is only authorized for the isolated lab.
  if (workspace?.cfg?.demoMode !== true || workspace?.cfg?.performanceTestMode !== true) {
    return { supported: true, ok: false, cutover: false, reason: 'performance_v7_isolation_required' };
  }
  if (!activeLedgerSupported()) {
    return { supported: false, ok: false, cutover: false, reason: 'sqlite_unavailable' };
  }

  const namespace = getLedgerNamespace(workspaceNamespace, workspace?.cfg || {});
  const requestedTier = String(workspace?.cfg?.performanceTestTier || '');
  let reuseFailureReason = null;
  let healthIssueCodes = [];
  // Rebuild-path trace: this is separate from the caller's own
  // `onDiagnosticStep` (reserved for the reuse-path hook wired to app-startup
  // timing, which only records while a startup is actually in progress). The
  // rebuild can run long after startup, from a manual tier press, so its
  // trace is recorded here unconditionally and carried in `lastAttempt`.
  const rebuildClockStart = Date.now();
  const rebuildSteps = [];
  const markRebuildStep = name => {
    const safe = safeCode(name);
    if (safe) rebuildSteps.push({ name: safe, atMs: Date.now() - rebuildClockStart });
  };
  const report = (result, phase) => recordAttempt({
    ...result,
    ...(reuseFailureReason ? { reuseFailureReason } : {}),
    ...(healthIssueCodes.length ? { healthIssueCodes } : {}),
    ...(rebuildSteps.length ? { steps: rebuildSteps } : {}),
  }, requestedTier, phase);
  if (!forceReplace) {
    const reused = await reusablePerformanceTestLedgerV7({ workspaceNamespace, workspace, onDiagnosticStep });
    if (reused?.ok) return report(reused, 'reuse');
    reuseFailureReason = reused?.reuseFailureReason || null;
    healthIssueCodes = Array.isArray(reused?.healthIssueCodes) ? reused.healthIssueCodes : [];
  }

  if (reuseOnly) {
    return report({
      supported: true,
      ok: false,
      cutover: false,
      rebuildRequired: true,
      reason: 'performance_v7_rebuild_required',
    }, 'reuse_required');
  }

  // This namespace is already isolated by getLedgerNamespace(..., cfg). Clear
  // only that performance namespace before rebuilding the selected tier.
  await clearFinancialWorkspaceV7({ namespace });
  markRebuildStep('namespace_cleared');

  // Operational cutover now owns one transaction-local stage from build through
  // parity, health proof, and promotion. Calling the standalone shadow proof
  // here would rebuild the same source and restore the startup bottleneck.
  const cutover = await runFinancialOperationalCutoverV7({
    namespace,
    workspace,
    coldArchives,
    forceReplace: true,
    resetPendingOutbox: true,
    batchSize,
    onDiagnosticStep: markRebuildStep,
    // The lab namespace is disposable and never synchronizes. Keep database-
    // wide FK proof for real cutovers, but do not let an unrelated historical
    // row outside this stage prevent measurement of the isolated V7 path.
    foreignKeyScope: 'namespace',
  });
  markRebuildStep('cutover_returned');
  if (cutover?.supported === false) return report(failure(cutover, 'financial_v7_cutover_unavailable'), 'operational_cutover');
  if (!cutover?.ok || !cutover?.cutover) return report(failure(cutover, 'financial_v7_cutover_failed'), 'operational_cutover');

  const health = await getLedgerDataHealth({
    namespace,
    walletIds: Array.isArray(workspace?.wallets) ? workspace.wallets.map(item => item.id) : [],
    expectedActiveCount: Array.isArray(workspace?.trans) ? workspace.trans.length : null,
  });
  markRebuildStep('post_cutover_health');
  if (!health?.ok) return report(failure({ ...cutover, health }, 'financial_v7_cutover_health_failed'), 'post_cutover_health');

  return report({
    ...cutover,
    supported: true,
    ok: true,
    cutover: true,
    sourceMode: 'sqlite',
    checksum: cutover.checksum || cutover.sourceChecksum || null,
    shadowSummary: {
      ok: cutover.ok === true,
      sourceMode: 'shadow',
      checksum: cutover.sourceChecksum || cutover.checksum || null,
      targetChecksum: cutover.targetChecksum || null,
      sourceCounts: cutover.sourceCounts || null,
      targetCounts: cutover.targetCounts || null,
      differences: Array.isArray(cutover.differences) ? cutover.differences.length : 0,
    },
    health,
    performanceTestTier: requestedTier,
  }, 'complete');
};
