# MYFI — Phase 9 item 10: V2 sync recheck

**Verified at:** 2026-08-21T12:04:16+03:00
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`
**Verified branch/remote HEAD:** `907b98ee8af7d2627523b03ac1feb063d302f5a0`
**Supabase project:** MYFI project, status reported `ACTIVE_HEALTHY`
**Operation type:** read-only metadata queries only

## Scope and safety boundary

This was a partial Phase-9 item-10 recheck only. It did not repeat the
restore-epoch gate, invoke any destructive RPC, change a ledger, change a
restore epoch, write Supabase data/schema, read financial payloads, or read
amounts/balances. The existing Phase-9 closure decision remains unchanged.

## Target identity check

The target ledger was taken from the ledger identity recorded in the latest
P20-G01 item-8/10 evidence. Two independent read-only snapshots against
`public.financial_ledgers_v2` returned:

- target ledger exists: **false**;
- target restore-event count: **0**;
- target bootstrap-session count: **0**.

The target identity is therefore absent from the current Supabase project. This
means its current V2 sync state cannot be read or certified. The likely
explanations are cleanup/replacement of the disposable ledger or a stale
evidence-to-ledger mapping; this report does not choose between them.

## Current project metadata (not substituted for the target)

The project currently reports three V2 ledger rows that are each `active`, use
protocol version 2, have minimum supported version 2, and have both bootstrap
identity and bootstrap completion metadata. These rows were intentionally not
treated as the P20-G01 target because no reviewed identity mapping proves that
one of them is the same disposable ledger.

The current restore-event listing also does not contain the target identity.
No current target-specific evidence exists for active/quiescent behavior.

## Conclusion

**Result: inconclusive for the requested ledger; V2 sync is not certified by
this recheck.** This is an identity/evidence availability blocker, not a claim
that V2 is failing and not a data-integrity finding. The Phase-9 conditional
closure remains valid as recorded: financial-data safety was already confirmed,
while this follow-up cannot upgrade the sync-health wording without the same
ledger being available.

## Disposition — 2026-08-21

The user has decided to stop this recheck. The original disposable ledger is
gone, and validating any replacement would require a new disposable account
and full device test, which is outside the value and scope of this
documentation-only follow-up. No replacement ledger will be guessed or tested
under this task.

Phase 9 therefore remains formally **closed with conditional acceptance**.
This report does not reopen or alter that decision. Work returns to the Phase-10
track at P10-009 and later, at a clean stop boundary.

## Git/worktree note

The audit worktree remained detached at the previously pushed commit while the
named branch was advanced in its primary worktree to `907b98e...`. No source
file was edited by this recheck. Only this evidence document was created by
this recheck and it is the sole file intended for the documentation commit.
