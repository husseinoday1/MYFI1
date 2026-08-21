# MYFI — Phase 10 pre-wiring checklist

**Purpose:** everything that must be true before any Phase 10 restore code is connected
to the running app, in one place.

The conditions were accumulating across six evidence files, one per step, each written
by whoever happened to find the issue. That is how a deferred fix becomes a forgotten
one: nobody reads six documents before wiring something up, and "we agreed to fix it
later" is only true when later has somewhere to look. This is that place.

**Current state (2026-08-21):** none of the Phase 10 restore modules has a single caller
in `src/`. `financialRestorePromotionV11`, `financialRestoreRecoveryV11`,
`financialRestoreCloudRecoveryV11` and `financialRestoreEpochV3Client` are all reachable
only from their tests. Nothing below is urgent; all of it is blocking the moment that
stops being true.

---

## A. Open code defects — fix before wiring

### A1. Recovery's idempotent branch cannot execute

`src/lib/financialRestoreRecoveryV11.js:218`

Inside the recovery transaction the guard above throws unless the status is exactly
`local_promoted_pending_reload`, so the next check — for
`local_reloaded_reconciliation_required` — is unreachable and its idempotent return is
dead code.

The case it was written for is real and is the reason this module exists: two recovery
attempts overlapping across an app restart. The second reads
`local_promoted_pending_reload` outside the transaction, the first commits and advances
the status, and the second then throws `canonical_restore_reload_state_changed` instead
of returning the idempotent success intended for it. Nothing is corrupted — the
transaction rolls back and the state is already correct — but the caller sees an error
where success was meant, and the exported `idempotent` flag is therefore always `false`
on this path.

**Not covered by tests.** `tests/run-p10-011-post-commit-recovery.cjs:351` asserts
`idempotent === true`, but it reaches that through the outer early return at line 170,
not through this branch. A fix needs a test that forces the interleaving.

---

## B. Production gate — approval required, not a code change

### B1. The P10-012 migration is not applied and must stay that way for now

`supabase/migrations/20260821115320_p10_012_proof_bound_restore_epoch_v3.sql` creates
`advance_financial_restore_epoch_v3`. It is **not** applied to project
`qihahfufuupgivnjzmfe` — verified 2026-08-21 by listing applied migrations, newest is
`20260820162710_finance_data_id_fkey_on_delete_cascade`. Meanwhile
`financialRestoreEpochV3Client.js` calls that RPC.

The repository promises a function the database has never had. It is inert today because
nothing is wired and the client fails closed rather than returning success on an RPC
error — which is exactly what makes it easy to walk into later, as a restore that cannot
advance its epoch rather than as a missing migration.

**Decision (Planning & Audit, 2026-08-21):** it stays unapplied. Not as a side effect of
wiring, of a test, or of anything else. Applying it needs the coordinator's direct
approval and its own round: preflight against the live schema, reviewed migration, apply,
postcheck. Full detail in `MYFI_P10_012_PROOF_BOUND_CLOUD_RECOVERY_IMPLEMENTATION_2026-08-21.md`.

---

## C. Integration work the steps deliberately did not do

Each step recorded these as out of its own scope. They are listed together because they
are what "wiring" actually means, and none of them exists yet.

- **The maintenance fence.** A restore must run under the barrier, and the integration —
  not the promotion module — owns taking it. See `MYFI_P10_011_POST_COMMIT_RECOVERY_2026-08-21.md`.
- **The bounded-cache loader.** Recovery takes a `reload` callback and never populates a
  cache itself. The integration supplies the existing loader.
- **Presenting recovery state and keeping sync paused** while
  `reconciliationRequired` is true. The durable state exists; nothing surfaces or
  honours it yet.
- **Entry points.** `App.js`, `dataSlice.js` and the settings restore flow are untouched
  by Phase 10 so far.
- **Undo through the same engine** (report Step 11) and device acceptance are not
  started.

---

## D. Closed, with evidence — do not re-open these

Recorded so the list does not carry stale entries and nobody re-raises them.

| Condition | Raised | Status |
|---|---|---|
| Promotion flattened every failure reason into `canonical_restore_promotion_failed` | P10-010 review | **Fixed.** `financialRestorePromotionV11.js` now returns `text(error?.message).trim()` and falls back to the generic code only when there is no message. Verified at `ec0b11d`. |
| `validCounts` passed vacuously on `{}` | P10-010 review | **Fixed.** It now requires exactly the `CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS`, each present and a safe non-negative integer. `{}` is rejected. Verified at `ec0b11d`. |

---

## What was checked and found sound

Stated so a later reviewer knows which properties were actually verified rather than
assumed, and does not spend the effort twice.

- **Local promotion cannot run ahead of the server.** It executes only when the durable
  state is `server_epoch_proven`. An ambiguous server outcome is recorded as
  `server_outcome_unknown` with exponential backoff capped at 60s plus jitter, and
  returns pending — it neither proceeds nor guesses. This is the property whose failure
  would let a restore promote locally while the server never agreed.
- **Promotion is atomic across all four stores.** `tests/run-p10-010-atomic-local-promotion.cjs`
  drives eight injected faults through real SQLite using the real schema, and compares a
  full sixteen-table snapshot against the pre-promotion state after each one.
- **Old sync evidence survives a restore.** V2 and V3 outbox/inbox rows are not deleted.
- **The extraction in P10-009 was faithful.** SQL moved character-identical; every new
  guard is stricter than what it replaced; no import cycle; schema warm-up precedes the
  write queue.
