// MYFI — adopting a DIFFERENT cloud ledger identity.
//
// Deliberately a separate path from prepareVerifiedCloudConflictRecoveryV1.
// That one is correct for its own case and must not be loosened: it requires
// the local identity to EQUAL the cloud identity, and every pending row to be a
// stale workspace command (at most 16). Both refusals are right there.
//
// This path exists for the opposite situation, the one three real accounts hit
// on 2026-09-05: the account already has a cloud ledger from another device or
// install, this device generated its own local identity, and the two will never
// match. resolveCloudLedgerV2 throws financial_v2_ledger_id_conflict, sync
// falls back to V1, and the owner's real mutations sit in ledger_outbox_v3
// forever with no way forward.
//
// What makes this safe is not that it merges cleverly -- it refuses to merge at
// all. The cloud ledger is adopted as authoritative, and every local pending
// mutation is caught, described, and put in front of the owner to keep or
// discard one at a time. Nothing here decides the fate of a financial row.
//
// Pure functions only: no database, no network, no store. The caller supplies
// what it read; this decides.

const text = value => String(value ?? '').trim();
const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);

const parseJson = (raw, fallback = null) => {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
};

export const ADOPTION_INTENT_STATUS = 'ready_for_cloud_identity_adoption';

/**
 * Is this the situation this path is for? Anything else must be refused, so a
 * future caller cannot quietly reuse it for a conflict it does not fit.
 */
export const adoptionAppliesV1 = ({ localIdentity = null, cloudSource = null } = {}) => {
  const localLedger = text(localIdentity?.ledgerId ?? localIdentity?.ledger_id);
  const cloudLedger = text(cloudSource?.ledgerId);
  if (!localLedger) return { applies: false, reason: 'adoption_local_identity_missing' };
  if (!cloudLedger) return { applies: false, reason: 'adoption_cloud_identity_missing' };
  if (localLedger === cloudLedger) {
    // Same ledger: this is not an adoption. The existing recovery path owns
    // this case and is built for it.
    return { applies: false, reason: 'adoption_not_applicable_same_ledger' };
  }
  return { applies: true };
};

/**
 * One pending mutation, described well enough for its owner to recognise it and
 * decide. This is shown on the device to the person whose data it is -- it is
 * not a diagnostics payload and must never be routed into one.
 */
export const describePendingMutationV1 = (row = {}) => {
  const payload = typeof row.payload_json === 'string'
    ? parseJson(row.payload_json, {}) || {}
    : (row.payload || {});
  const original = payload.originalTransaction || payload.payload || payload.transaction || payload;
  const entityType = text(row.entity_type ?? row.entityType);

  // Amount lives in a different field per entity type; a wrong guess here would
  // show the owner the wrong number while they decide, so each is named.
  const amount = entityType === 'financial_transaction'
    ? num(original.baseAmount ?? original.amt ?? original.walletAmount)
    : entityType === 'debt'
      ? num(original.total)
      : entityType === 'commitment'
        ? num(original.amt)
        : entityType === 'goal'
          ? num(original.target)
          : null;

  return {
    sequenceId: num(row.sequence_id ?? row.sequenceId),
    mutationId: text(row.mutation_id ?? row.mutationId),
    entityType,
    entityId: text(row.entity_id ?? row.entityId),
    operation: text(row.operation) || 'upsert',
    title: text(original.title) || text(original.name) || null,
    amount,
    dateISO: text(original.dateISO) || text(row.created_at ?? row.createdAt).slice(0, 10) || null,
    createdAt: text(row.created_at ?? row.createdAt) || null,
  };
};

export const describePendingMutationsV1 = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map(describePendingMutationV1)
    .sort((a, b) => a.sequenceId - b.sequenceId);

/**
 * May the adoption be confirmed yet?
 *
 * Only when every pending mutation carries an explicit decision from the owner.
 * A row nobody ruled on blocks the whole thing -- silently keeping or silently
 * dropping someone's real financial entry is exactly what this path exists to
 * prevent. Unknown decisions count as undecided rather than as a default.
 */
export const adoptionReadinessV1 = ({
  pending = [], decisions = new Map(),
} = {}) => {
  const rows = describePendingMutationsV1(pending);
  const read = key => (decisions instanceof Map ? decisions.get(key) : decisions?.[key]);

  const undecided = [];
  const keep = [];
  const discard = [];
  for (const row of rows) {
    const decision = text(read(row.mutationId) ?? read(row.sequenceId));
    if (decision === 'keep') { keep.push(row); continue; }
    if (decision === 'discard') { discard.push(row); continue; }
    undecided.push(row);
  }

  if (undecided.length) {
    return {
      ok: false,
      reason: 'adoption_pending_mutations_undecided',
      undecided,
      decidedCount: keep.length + discard.length,
      totalCount: rows.length,
    };
  }
  return {
    ok: true,
    keep,
    discard,
    totalCount: rows.length,
  };
};
