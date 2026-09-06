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
} = {}) => {
  if (!activeLedgerSupported()) {
    return { supported: false, ok: false, cutover: false, reason: 'sqlite_unavailable' };
  }

  const namespace = getLedgerNamespace(workspaceNamespace, workspace?.cfg || {});
  const requestedTier = String(workspace?.cfg?.performanceTestTier || '');
  const currentState = await getFinancialWorkspaceStateV7({ namespace });
  const currentTier = stateTier(currentState);

  if (!forceReplace && currentState?.source_mode === 'sqlite' && currentTier === requestedTier) {
    const health = await getLedgerDataHealth({
      namespace,
      walletIds: Array.isArray(workspace?.wallets) ? workspace.wallets.map(item => item.id) : [],
      expectedActiveCount: Array.isArray(workspace?.trans) ? workspace.trans.length : null,
    });
    if (health?.ok) {
      return {
        supported: true,
        ok: true,
        alreadyCutover: true,
        cutover: true,
        sourceMode: 'sqlite',
        checksum: currentState.shadow_checksum || null,
        health,
      };
    }
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
  if (shadow?.supported === false) return failure(shadow, 'financial_v7_shadow_unavailable');
  if (!shadow?.ok) return failure(shadow, 'financial_v7_shadow_parity_failed');

  // The shadow pass above proves parity and records readiness. Force the
  // operational call to consume the same source in one final staged promotion;
  // it still repeats parity/health checks before making V7 authoritative.
  const cutover = await runFinancialOperationalCutoverV7({
    namespace,
    workspace,
    coldArchives,
    forceReplace: true,
    resetPendingOutbox: true,
  });
  if (cutover?.supported === false) return failure(cutover, 'financial_v7_cutover_unavailable');
  if (!cutover?.ok || !cutover?.cutover) return failure(cutover, 'financial_v7_cutover_failed');

  const health = await getLedgerDataHealth({
    namespace,
    walletIds: Array.isArray(workspace?.wallets) ? workspace.wallets.map(item => item.id) : [],
    expectedActiveCount: Array.isArray(workspace?.trans) ? workspace.trans.length : null,
  });
  if (!health?.ok) return failure({ ...cutover, health }, 'financial_v7_cutover_health_failed');

  return {
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
  };
};
