# MYFI — design: actually resolving the conflicts, and the goals decision

Date: 2026-09-05
Base: `fc21746`
Status: **design only, nothing implemented.** Owner asked for complete
solutions, no more partial fixes; PA asked for design before code.

---

## A. A correction I need to make first

On 2026-09-04 I told PA that adopting a cloud ledger under a different identity
would need **genuinely new mechanism**, "days, 16 components", because
`bootstrapFinancialLedgerV2` resolves `ensureLedgerSyncIdentityV8` (the local
identity) and then calls `resolveCloudLedgerV2` with it — so it would hit the
very same `financial_v2_ledger_id_conflict` it was meant to resolve.

That trace was right about `bootstrapFinancialLedgerV2`. The conclusion drawn
from it was **wrong**, because I only looked at the local→cloud direction and
never checked whether a cloud→local path already existed. It does:
`src/lib/financialV2ConflictRecoveryV1.js`, built in Phase 12.

Concretely, `prepareVerifiedCloudConflictRecoveryV1` already:

1. calls `stageVerifiedBootstrapWithArchiveV2`, which resolves the cloud source
   through `fetchVerifiedFinancialCloudRecoverySourceV2({ supabase })` — reading
   the **cloud's** `ledgerId`/`restoreEpoch` for the signed-in account. It never
   calls `ensureLedgerSyncIdentityV8` and never calls `resolveCloudLedgerV2`, so
   **it does not trip the ledger-id guard at all**;
2. downloads and independently re-verifies both channels (bootstrap + archive)
   into a private stage namespace, without touching live data;
3. takes a local checkpoint (`createFinancialConflictRecoveryCheckpointV1`)
   before anything destructive;
4. writes a durable intent (`ready_for_explicit_cloud_replacement`) carrying the
   adopted cloud identity **and** a record of the local pending state;
5. leaves the actual replacement to a separate explicit confirm step.

That is, almost exactly, the "adopt the cloud ledger, prove it first, never
auto-merge" flow §2 of the 2026-09-04 design described as needing to be built.
It exists and it is Phase-12-hardened. My estimate sent PA and the owner in the
direction of a much bigger project than the evidence supports.

## B. Why the three accounts still can't reach it

`useSyncSlice.js:1663`:

```js
if (!current.online || current.syncing
    || String(current.lastSyncError || '') !== 'financial_v2_revision_conflict') {
  return { ok: false, reason: 'financial_v2_conflict_recovery_not_eligible' };
}
```

Eligibility is gated on `lastSyncError` being exactly
`financial_v2_revision_conflict`. Our stuck accounts fail on
`financial_v2_ledger_id_conflict` — a different string — and worse, that failure
is swallowed by the V1 fallback documented on 2026-09-04, so `lastSyncError` is
typically **null**. The gate can therefore never be satisfied by these accounts,
no matter how many times sync runs.

So the honest description is not "no recovery mechanism exists". It is: **the
mechanism exists, is proven, and is unreachable for this failure mode because
of one eligibility condition.**

## B2. Second correction — §A overstated how reusable the flow is

Added 2026-09-05, after tracing `inspectCandidate` (which §A did not open).
This is the second time my sizing of this item has moved, so stating it plainly
rather than quietly adjusting: **§A's claim that the existing flow "does not
trip the ledger-id guard at all" is wrong.**

It is true of the *download*: `stageVerifiedBootstrapWithArchiveV2` resolves the
cloud source independently and never consults the local identity. It is not
true of the flow that calls it. `prepareVerifiedCloudConflictRecoveryV1` runs
`inspectCandidate` immediately after staging, and that function carries two
hard refusals our accounts hit:

```js
if (text(identity.ledger_id) !== text(cloudSource.ledgerId)
    || Number(identity.restore_epoch) !== Number(cloudSource.restoreEpoch)) {
  throw new Error('financial_v2_conflict_recovery_cloud_identity_mismatch');
}
...
if (!pending.length || pending.length > 16
    || !pending.every(row => staleWorkspaceCommand(row, cloudWorkspaceRevision))) {
  throw new Error('financial_v2_conflict_recovery_pending_mutations_not_safe');
}
```

1. It **requires the local identity to equal the cloud identity** — the exact
   condition that is false for every account we are trying to recover. The
   download would succeed and the candidate inspection would then refuse.
2. It **requires every pending row to be a stale workspace command, at most 16
   of them.** The owner's 37 rows are real transactions, debts and commitments.

So this flow is not a general "adopt a different cloud ledger" mechanism. It is
narrowly built for one scenario: same identity, a handful of stale workspace
metadata commands. Widening the eligibility gate would therefore not open a
working path — it would replace a silent dead end with a failure one step
later, after a real cloud download and a durable checkpoint had already been
created. That is worse than the current state, not better.

### What this means for scope

Reusable, unchanged: the cloud download + independent re-verification, the
checkpoint machinery, the intent/confirm split, the promotion transaction.

Genuinely new, and the actual work:

- an adoption path that **deliberately permits an identity change** (today's
  refusal is correct for its own scenario, so this must be a separate, clearly
  named path — not a loosened condition inside the existing one, which would
  weaken a guard that is right for the case it was written for);
- per-row review for pending rows that are **not** stale-workspace-only, since
  refusing outright is exactly what blocks these accounts.

This lands closer to my original estimate than to §A's. I would rather say so
now than have a third revision arrive mid-implementation.

## B3. The promotion transaction is not reusable either

Traced 2026-09-05 while building. PA's approved scope listed the promotion
transaction among the pieces to reuse unchanged. It cannot be, for the same
reason as the other two, which makes this the **third** place the same
identity-equality assumption is built in:

`promotePreparedCloudConflictRecoveryV1` (`financialBootstrapRecoveryPromotionV2.js:373`)

```js
if (!identity?.ledger_id || String(identity.ledger_id) !== hot.ledgerId
    || Number(identity.restore_epoch) !== hot.restoreEpoch) { throw ... }
```

and, more consequentially, it clears the outbox by the **cloud** ledger id:

```js
await db.runAsync(`DELETE FROM ledger_outbox_v3 WHERE ledger_id=? AND restore_epoch=?`,
  hot.ledgerId, hot.restoreEpoch);
```

In an adoption the pending rows live under the **old local** ledger id, so that
delete would not touch them. They would be left orphaned under an identity
nothing reads any more — the 37 rows would survive on disk and be invisible
forever, which is a worse outcome than today's honest block.

So the adoption path needs its own promotion. It must, in one transaction:
apply the staged cloud data, rewrite `ledger_sync_identity_v8` from the old
local id to the cloud id/epoch, and settle the old ledger's outbox rows
explicitly by the owner's per-row decisions — kept rows re-committed as fresh
mutations under the adopted identity (their old revision chains were computed
against a ledger that is being replaced and cannot be carried over), discarded
rows removed.

Still reused unchanged: the cloud download and independent re-verification, the
checkpoint, and the intent/confirm split.

## C. What genuinely remains (the part that is real work)

Widening the gate alone is *not* sufficient, and must not be done alone.

`clearLocalFinancialDataForCloudRecoveryV8` (repository line ~5469) refuses to
run when unacknowledged V3 outbox rows exist:

```js
if (Number(pending?.n || 0) > 0) throw new Error('local_reset_cloud_sync_pending');
```

This is correct and protective — it is why the owner's 37 mutations cannot be
silently destroyed. But it also means adoption **cannot complete** while those
rows are pending. The per-row review PA requires is therefore not a UX nicety
layered on top; it is structurally required before adoption can finish.

Remaining work, in order:

1. **Make the failure reachable.** Widen eligibility to include
   `financial_v2_ledger_id_conflict`, sourced from
   `financialSyncV2Activation.reason` rather than `lastSyncError` (which the V1
   fallback nulls out). Keep `online`/`!syncing`. Skip the narrow
   stale-workspace repair for this reason — it addresses revision conflicts and
   does not apply.
2. **Per-row review of the pending V3 rows.** Phase 12's existing review is
   built for the *legacy* outbox (`reviewableLegacyRows`, keyed on
   `outboxV2PendingRows`). The 37 rows are in `ledger_outbox_v3`. This needs the
   same treatment — summarised per row (type, amount, date), each explicitly
   kept or discarded by the owner — reusing the acknowledged/discard pattern
   rather than inventing a second one.
3. **Only then** allow confirm to proceed.

Estimate, stated with the caution the last one deserved: (1) is small and
mostly gate logic; (2) is the real cost — a review surface plus the
acknowledge/discard plumbing for V3, in the shape Phase 12 already established.
This is not "days across 16 components", but it is also not one afternoon, and
I would rather be corrected on this one than repeat the last mistake.

## D. Account 3 (`myfitest67890`): stop guessing at the reason

`financialV2ConflictRecoveryV1.js:289-292` collapses **five** distinct
conditions into one `financial_v2_conflict_recovery_resume_intent_invalid`:
unparseable intent, `version !== 1`, `status !== ready_for_explicit_cloud_replacement`,
`namespace` mismatch, `accountId` mismatch.

PA is right that this must not be assumed to be safe garbage. Rather than only
asking the owner for another screenshot, the code should say which one it is:
split the reason into distinct codes (`..._intent_unparseable`,
`..._intent_version`, `..._intent_status`, `..._intent_namespace`,
`..._intent_account`). Behaviour is unchanged — every case still fails closed —
but the next occurrence is diagnosable without a device round-trip. Small,
isolated, testable; proposed as the first thing to land.

## E. Goals: replacing the warning-only fix

The owner tested `e66fb7a` and rejected it. He is right to: it was a text
warning that deliberately changed no state, because reopening a released goal
was judged a product decision we should not take unilaterally. That judgement
was sound, but the outcome — the app explains the inconsistency instead of
preventing or fixing it — is not a solution.

PA offered two directions. Recommending **both, combined**, because either
alone is another half-answer:

- **(a) alone** (block the delete) leaves the owner with no way to correct a
  genuine mistake — a dead end with a polite explanation.
- **(b) alone** (an undo path) leaves the inconsistent delete still reachable.

### Proposed: block the delete, and point it at a real undo

1. **Deleting a released goal's linked transaction is refused**, not warned
   about. The refusal names the reason and names the supported action.
2. **A new explicit "undo the transfer" action on the released goal**, which:
   - rebuilds `goal.savings` from the surviving `isGoalSaving` transactions
     (they still carry `savingId`, `allocationWalletAmount`; the release only
     zeroed the goal's copy, it did not delete them), restores `cur`, and sets
     `status` back to `settled`;
   - **verifies first** that each affected wallet's *available* balance can
     absorb re-reserving the released amount, since release freed a reservation
     rather than moving cash (`amt: 0` on both the saving and release
     transactions — the reservation lives in `getWalletAvailableBalances`'s
     `reservedBalance`). If the owner has since spent that money, re-reserving
     would drive available balance negative;
   - **fails clearly and changes nothing** when it cannot — never a partial
     undo, never a silent negative balance;
   - is explicit and reviewed, never automatic.
3. After a successful undo, the goal is `settled` again and its transactions
   become deletable through the normal path, which already recomputes `cur` and
   re-derives lifecycle correctly (`deleteTrans`'s goal branch).

Open question for the owner, not for us: if the saving transactions were
already voided before the undo, should the undo reconstruct from the voided
rows (they are soft-deleted, so recoverable) or refuse? Recommend refusing in
v1 — reconstructing from voided rows is a second, riskier feature.

## Not doing yet

Nothing in this document is implemented. Requesting PA's read on C's ordering
and E's combined direction before writing code, per the same discipline as
2026-09-04.
