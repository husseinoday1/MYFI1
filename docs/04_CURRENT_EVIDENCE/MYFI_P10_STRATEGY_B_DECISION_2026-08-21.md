# MYFI — Phase 10 restore staging: Strategy B, decided

**Decision:** restore staging runs **outside** the maintenance lock. The lock holds only
the final atomic promotion and the restore-epoch handshake.

**Decided by:** the user, 2026-08-21, on the device measurements below.
**Supersedes:** the Phase 10 research's Strategy A preference, which was recorded before
anyone knew what A cost.

## What decided it

Measured on a Samsung SM-S938B, real phone, disposable empty account, APK `74a3692`
verified by hash. Full data in `MYFI_P10_RESTORE_BENCHMARK_DEVICE_RESULTS_2026-08-21.md`.

| Transactions | Staging (under lock in A) | Promotion (under lock in both) |
|---:|---:|---:|
| 1,000 | 1.37 s | 0.05 s |
| 10,000 | 16.42 s | 0.37 s |
| 50,000 | 86.30 s | 2.07 s |
| 100,000 | 200.06 s | 8.45 s |

Strategy A freezes the app for **at least 3 minutes 28 seconds** at 100k — "at least"
literally, since `maintenanceBlockedMs` excludes the epoch handshake and production runs
it under the same lock. Strategy B holds the lock for promotion plus that handshake:
around 8.5 s, roughly twenty-five times shorter.

Staging is 96–97% of the locked window at every tier. Promotion is `INSERT … SELECT`
inside SQLite and scales, which is why moving staging out is the whole win.

## The condition that makes B safe — binding, not advisory

B is only correct if **promotion revalidates the live generation, ledger identity and
restore epoch that existed when staging began**, and refuses if any of them moved.

Staging outside the lock means the live ledger can be written while the stage is being
built. Without that revalidation, a transaction the user records during a long restore
is silently discarded when the stage is promoted over it — no error, no warning, and it
would surface only as money that vanished. That is the failure A avoids by construction
and B has to prevent deliberately.

This is Risk 6 in the Phase 10 research, and choosing B is choosing to own it.

Concretely, promotion must:

- capture the live identity, epoch and a generation marker at the moment staging starts;
- re-read all three inside the promotion transaction;
- fail closed on any difference — discard the stage and require a fresh restore, never
  repair or merge;
- prove that refusal with a test that mutates the live ledger mid-staging.

Until that test exists and passes, B is a decision, not an implementation.

## What this changes elsewhere

`MYFI_P10_013_BOUNDED_MEMORY_UNDO_DESIGN_2026-08-21.md` §7 step 3 keeps incoming-stage
building under the fence and states that only P10-014 evidence plus
generation/identity/epoch revalidation may approve moving it out. That evidence now
exists and the decision is made, so §7 needs re-reading against it before P10-013A
starts. The Undo checkpoint copy itself is `INSERT … SELECT` and cheap; the expensive
fenced items are staging and the streaming semantic proofs.

## What is still unmeasured, and still matters

`maintenanceBlockedMs` is a lower bound: the epoch handshake is excluded from every
number above, and under B it becomes a larger share of a much smaller window. It should
be measured before the lock budget is frozen.

`canonicalBuild` — 91 s of the 299 s total at 100k, superlinear — sits outside the lock
but inside the user's wait. B does not improve it.
