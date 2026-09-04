// MYFI Phase 15 — History read-path diagnostics collector.
//
// Answers the two questions the read-cutover sizing could not answer from source
// alone (docs/04_CURRENT_EVIDENCE/MYFI_PHASE15_READ_CUTOVER_SIZING_2026-09-04.md):
//
//   1. Is THIS device actually cut over — is ledger_workspace_state_v7.source_mode
//      'sqlite' for the live namespace, or is it still 'shadow'? Everything about
//      the fallback's risk profile depends on the answer, and it is device state,
//      not something the repository can tell us.
//   2. How often does a returned SQL page actually get rejected in normal use?
//
// Read-only. It opens no transaction, writes nothing, and returns no financial
// row contents — the Diagnostics screen lets the user copy this to the clipboard,
// so it carries state and counts only.

import { getFinancialWorkspaceStateV7 } from '../lib/financialLedgerV7Repository';
import { activeLedgerSupported, getLedgerNamespace } from '../lib/activeLedgerRepository';
import { readHistoryReadPathTelemetry } from '../lib/historyReadPathTelemetry';

export const collectHistoryReadPathDiagnostics = async ({
  workspaceNamespace = 'guest', cfg = {},
} = {}) => {
  const telemetry = readHistoryReadPathTelemetry();

  if (!activeLedgerSupported()) {
    return { supported: false, reason: 'sqlite_unavailable', telemetry };
  }

  const namespace = getLedgerNamespace(workspaceNamespace, cfg);
  try {
    const state = await getFinancialWorkspaceStateV7({ namespace });
    if (!state) {
      // No row at all means the V7 workspace has never been staged for this
      // namespace — distinct from being staged in shadow mode, and worth telling
      // apart when reading a report.
      return {
        supported: true,
        namespace,
        workspaceStateFound: false,
        sourceMode: null,
        cutover: false,
        telemetry,
      };
    }
    return {
      supported: true,
      namespace,
      workspaceStateFound: true,
      sourceMode: state.source_mode || null,
      cutover: state.source_mode === 'sqlite',
      cutoverAt: state.cutover_at || null,
      schemaVersion: Number(state.schema_version) || null,
      shadowVerifiedAt: state.shadow_verified_at || null,
      lastReconciledAt: state.last_reconciled_at || null,
      telemetry,
    };
  } catch (error) {
    return {
      supported: true,
      namespace,
      ok: false,
      reason: `workspace_state_read_failed:${String(error?.message || error)}`,
      telemetry,
    };
  }
};
