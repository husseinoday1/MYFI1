# MYFI — sync-honesty gap #2: restoreSafety-blocked states (2026-09-05)

**Author:** Planning & Audit, acting directly (cross-session messaging tool
still unavailable as of this change).

## Gap found

Owner tested `5f398d1` (yesterday's sync-honesty fix) on 3 real accounts.
Two showed the fix working correctly. A third
(`myfitest67890@gmail.com`) still showed "Synced" while genuinely blocked —
but blocked via a **different failure surface** than yesterday's fix
covered:

- Yesterday's `v2Stuck` reads `financialSyncV2Activation?.status ===
  'failed_before_activation'` — the V2 mutation-sync activation path.
- This account's block is `restoreSafety?.status ===
  'financial_v2_conflict_recovery_blocked'` — a separate subsystem
  (`src/lib/financialV2ConflictRecoveryV1.js`, the P12 conflict-recovery
  machinery), triggered here by
  `financial_v2_conflict_recovery_resume_intent_invalid` — a leftover
  recovery-intent record that no longer matches the current context.

These are genuinely two different code paths that can each independently
leave the account "not really synced" while `dirty`/`lastSyncError`/
`syncing` all look clean — the same class of dishonesty yesterday's fix
addressed, just via a different door.

## Fix

Added `conflictRecoveryStuck` alongside `v2Stuck` in `SettingsScreen.js`'s
`syncState` computation: true when `restoreSafety?.status ===
'financial_v2_conflict_recovery_blocked'` for a signed-in, non-demo user.
`syncState`'s top branch is now `v2Stuck || conflictRecoveryStuck`. No new
DB read — `restoreSafety` is already store state, already destructured in
this component.

**Deliberately did NOT touch the `'financial_v2_conflict_recovery_ready'`
state** — that already has its own dedicated recovery UI (`MenuRow` in
`DataPage`, "Repair sync conflict" / "Replace the conflicting local
copy"), and duplicating it in the top-level indicator would be redundant,
not more honest.

## Investigation beyond the immediate fix (important, not yet acted on)

Traced the actual repair mechanism that already exists for
`financial_v2_conflict_recovery_blocked`/`ready`
(`prepareV2ConflictRecovery`/`confirmV2ConflictRecovery` in
`useSyncSlice.js`) to check whether it's safe to point users at it
generally. Findings:

1. **It is narrowly and safely scoped, not a blind "replace everything"
   button.** `assertOnlyPreparedWorkspaceMutations`
   (`financialBootstrapRecoveryPromotionV2.js:231`) verifies every
   unacknowledged outbox row is a `workspace`-entity `upsert` matching an
   exact pre-recorded snapshot before allowing the cloud-replace to
   proceed — if any real financial mutation (a transaction, wallet, goal,
   etc.) is present, it throws
   `financial_v2_conflict_recovery_promotion_pending_state_changed` and
   refuses. **This existing mechanism cannot silently discard real
   financial data even if misapplied** — confirmed by reading the
   assertion directly, not assumed.
2. **But it does not apply to the accounts with real stuck financial
   data.** `prepareV2ConflictRecovery`'s general path is gated on
   `lastSyncError === 'financial_v2_revision_conflict'`
   (`useSyncSlice.js:1663`) — a different error than
   `financial_v2_ledger_id_conflict`, which is what the owner's other two
   affected accounts (`aa8b80d0`, `0c9600f3`) actually have. So the
   existing "Repair sync conflict" button is not offered, and would not
   help, for those two accounts' actual problem — confirming
   [[myfi_sync_honesty_shipped_recovery_rescoped_2026-09-04]]'s earlier
   finding that this needs new mechanism (§2), not reuse of the existing
   one.
3. **The third account's specific error
   (`resume_intent_invalid`) is murkier than a simple "stale, safe to
   discard" case.** Reading `financialV2ConflictRecoveryV1.js:285-292`
   directly: this reason fires when a leftover intent record exists
   whose `status`, `namespace`, OR `accountId` don't match current
   context — three different conditions collapsed into one reason
   string. A mismatched namespace/accountId is very plausibly safe
   leftover garbage from account-switching during testing; a matching
   namespace/accountId but wrong `status` could mean something more
   specific about an interrupted prior attempt on the SAME account. **Did
   not build an auto-clear for this** — the reason string alone doesn't
   tell you which of the three cases you're in, and guessing wrong here
   is exactly the class of mistake this whole subsystem exists to
   prevent. Needs the intent's actual field values inspected per-case
   before any clearing logic is written, not assumed safe from the reason
   string alone.

## Financial-impact check

NONE/NONE/NO/PRESERVED — same class of change as `5f398d1`: read-only UI
derivation, no write path touched, no schema change.

## Verification

- `tests/phase15-sync-honesty-v2stuck.test.cjs` extended with 4 new cases
  covering `conflictRecoveryStuck` in isolation (blocked → syncPartial;
  ready → unaffected/synced; null → synced; `!user` still wins).
- Mutation-tested: removed `conflictRecoveryStuck` from the ternary
  condition, confirmed the test fails (`synced` where `syncPartial`
  expected); restored, confirmed passing again.
- Full quality gate: 174 passed, 0 failed, 11 skipped (same count as
  before — new assertions added to an already-registered test file, not a
  new file).

## What's still NOT fixed (real, tracked, not this commit)

- No actual recovery mechanism exists yet for `financial_v2_ledger_id_conflict`
  (the two accounts with real stuck financial mutations) — this is the
  bigger §2 build, in progress separately.
- The stale-intent case (`resume_intent_invalid`) needs its own
  investigation into the intent record's actual field values before any
  safe-clear logic can be written — not done in this change.
- Both real accounts (`aa8b80d0`, `0c9600f3`) remain unsynced. This change
  only makes that state honestly visible; it does not resolve it.
