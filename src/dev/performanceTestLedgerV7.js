// MYFI Phase 15 — the performance lab must exercise the same V7 projection
// and operational cutover that a real local workspace uses.

import { activeLedgerSupported, getLedgerDataHealth, getLedgerNamespace } from '../lib/activeLedgerRepository';
import {
  clearFinancialWorkspaceV7,
  getFinancialWorkspaceStateV7,
} from '../lib/financialLedgerV7Repository';
import {
  runFinancialOperationalCutoverV7,
  runFinancialShadowMigrationV7,
} from '../lib/financialLedgerV7Migration';

let lastAttempt = null;
// Retain codes only: health results also contain wallet balances and account IDs.
// Failed entry leaves the store in the previous workspace, so Diagnostics must
// not infer which namespace/tier failed from the current store configuration.
export const readPerformanceLedgerAttemptV7 = () => lastAttempt;
const recordAttempt = (result, tier, phase) => {
  lastAttempt = {
    tier, phase, at: new Date().toISOString(),
    ok: result?.ok === true, cutover: result?.cutover === true,
    issueCodes: [...new Set((result?.health?.issues || []).map(issue => issue?.code)
      .filter(code => typeof code === 'string' && /^[A-Za-z0-9_]+$/.test(code)))],
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
} = {}) => {
  const namespace = getLedgerNamespace(workspaceNamespace, workspace?.cfg || {});
  const requestedTier = String(workspace?.cfg?.performanceTestTier || '');
  const currentState = await getFinancialWorkspaceStateV7({ namespace });
  if (currentState?.source_mode !== 'sqlite' || stateTier(currentState) !== requestedTier) {
    return null;
  }

  const health = await getLedgerDataHealth({
    namespace,
    walletIds: Array.isArray(workspace?.wallets) ? workspace.wallets.map(item => item.id) : [],
    expectedActiveCount: Array.isArray(workspace?.trans) ? workspace.trans.length : null,
  });
  if (!health?.ok) return null;

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
  const report = (result, phase) => recordAttempt(result, requestedTier, phase);
  if (!forceReplace) {
    const reused = await reusablePerformanceTestLedgerV7({ workspaceNamespace, workspace });
    if (reused) return report(reused, 'reuse');
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

  const shadow = await runFinancialShadowMigrationV7({
    namespace,
    workspace,
    coldArchives,
    forceReplace: true,
  });
  if (shadow?.supported === false) return report(failure(shadow, 'financial_v7_shadow_unavailable'), 'shadow');
  if (!shadow?.ok) return report(failure(shadow, 'financial_v7_shadow_parity_failed'), 'shadow');

  // The shadow pass above proves parity and records readiness. Force the
  // operational call to consume the same source in one final staged promotion;
  // it still repeats parity/health checks before making V7 authoritative.
  const cutover = await runFinancialOperationalCutoverV7({
    namespace,
    workspace,
    coldArchives,
    forceReplace: true,
    resetPendingOutbox: true,
    // The lab namespace is disposable and never synchronizes. Keep database-
    // wide FK proof for real cutovers, but do not let an unrelated historical
    // row outside this stage prevent measurement of the isolated V7 path.
    foreignKeyScope: 'namespace',
  });
  if (cutover?.supported === false) return report(failure(cutover, 'financial_v7_cutover_unavailable'), 'operational_cutover');
  if (!cutover?.ok || !cutover?.cutover) return report(failure(cutover, 'financial_v7_cutover_failed'), 'operational_cutover');

  const health = await getLedgerDataHealth({
    namespace,
    walletIds: Array.isArray(workspace?.wallets) ? workspace.wallets.map(item => item.id) : [],
    expectedActiveCount: Array.isArray(workspace?.trans) ? workspace.trans.length : null,
  });
  if (!health?.ok) return report(failure({ ...cutover, health }, 'financial_v7_cutover_health_failed'), 'post_cutover_health');

  return report({
    ...cutover,
    supported: true,
    ok: true,
    cutover: true,
    sourceMode: 'sqlite',
    checksum: cutover.checksum || shadow.checksum || null,
    shadowSummary: {
      ok: shadow.ok === true,
      sourceMode: shadow.sourceMode || 'shadow',
      checksum: shadow.checksum || shadow.sourceChecksum || null,
      targetChecksum: shadow.targetChecksum || null,
      sourceCounts: shadow.sourceCounts || null,
      targetCounts: shadow.targetCounts || null,
      differences: Array.isArray(shadow.differences) ? shadow.differences.length : 0,
    },
    health,
    performanceTestTier: requestedTier,
  }, 'complete');
};
