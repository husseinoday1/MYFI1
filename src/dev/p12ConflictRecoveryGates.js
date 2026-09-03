// Phase 12 — the decisions behind what the diagnostics screen offers.
//
// These live outside the component because they are not presentation: each one
// decides whether to put a destructive recovery action in front of the owner,
// or to tell them their data is gone. Both of those got this wrong twice in one
// day, and only human review caught it. Pure input, pure output, tested.
//
// The screen never enforces safety — every action is guarded again inside its
// own SQLite transaction. What these decide is whether an action is offered at
// all, so the owner is never shown a button that must fail, or a warning that
// is not true of their device.

const text = value => String(value ?? '').trim();

// The same allow-list the V2 adoption and empty-shell classifications use:
// setup metadata only. Mirrored here to decide what to show; the authoritative
// copy stays inside discardLegacyOutboxAfterCheckpointRestoreV1.
export const setupOnlyLegacyRowV1 = row => text(row?.operation) === 'upsert' && (
  (text(row?.entity_type) === 'workspace' && text(row?.entity_id) === 'workspace')
  || ['wallet', 'category'].includes(text(row?.entity_type))
);

export const conflictRecoveryGatesV1 = (ledger = null) => {
  const ok = ledger?.ok === true;
  const status = text(ledger?.intent?.status);
  const namespace = text(ledger?.activeNamespace);
  const rolledBack = status === 'rolled_back_after_activation_failure';

  const legacyRows = Array.isArray(ledger?.outboxV2PendingRows) ? ledger.outboxV2PendingRows : [];
  const legacyPendingCount = Math.max(0, Number(ledger?.outboxV2PendingCount || 0));
  // The collector caps the row list. Classifying a truncated view would let the
  // screen say "these are all settings" about rows it never read, so everything
  // built on the classification waits until the list is known complete.
  const legacyRowsComplete = legacyRows.length === legacyPendingCount;
  const unsyncedFinancialRows = legacyRows.filter(row => !setupOnlyLegacyRowV1(row));

  // Once V2 is live the sync path never reads the legacy outbox and nothing adds
  // to it, so whatever is left can never reach the cloud. That is the only state
  // in which offering to remove those rows is honest — before it they may still
  // be queued work.
  const activated = !!text(ledger?.activatedAt);
  const acknowledged = Array.isArray(ledger?.legacyOutboxAcknowledged)
    ? ledger.legacyOutboxAcknowledged.map(Number)
    : [];
  const reviewableLegacyRows = ok && activated && legacyRowsComplete && !!namespace ? legacyRows : [];
  const acknowledgedLegacyRows = reviewableLegacyRows
    .filter(row => acknowledged.includes(Number(row?.sequence_id)));

  return {
    legacyRows,
    legacyRowsComplete,
    unsyncedFinancialRows,

    // Each row is reviewed and confirmed on its own: these are independent
    // financial entries, and one confirmation covering all of them would let a
    // single tap discard work the owner never compared.
    reviewableLegacyRows,
    acknowledgedLegacyRows,
    canDiscardAcknowledgedLegacy: acknowledgedLegacyRows.length > 0 && !!namespace,

    // A promotion that completed locally but never activated, with its
    // checkpoint still on disk.
    canRestore: ok
      && status === 'local_promoted_pending_activation'
      && ledger?.checkpointPresent === true
      && !!text(ledger?.intent?.checkpointId)
      && !!namespace,

    // Only when every pending legacy row really is setup-only. A financial row
    // among them means the queue holds the last copy of real entries, and the
    // library would refuse the delete anyway.
    canDiscard: ok
      && rolledBack
      && legacyPendingCount > 0
      && legacyRowsComplete
      && legacyRows.length > 0
      && unsyncedFinancialRows.length === 0
      && !!namespace,

    // Activation gates on the V2 queue alone: activateFinancialSyncProtocolV2V8
    // counts ledger_outbox_v3 and never reads the legacy outbox. Requiring the
    // legacy queue to be empty here once hid the last step behind rows that must
    // not be deleted.
    canActivate: ok
      && rolledBack
      && Math.max(0, Number(ledger?.outboxV3PendingCount || 0)) === 0
      && !!namespace,

    // "These are gone from your data" is only true once a rollback has rewound
    // the ledger past them. Before that they are ordinary pending uploads, and
    // telling their owner to re-enter them by hand would duplicate real money.
    showUnsyncedFinancialWarning: ok
      && rolledBack
      && legacyRowsComplete
      && unsyncedFinancialRows.length > 0,
  };
};
