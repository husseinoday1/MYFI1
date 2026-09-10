# Phase 15 — 50K valid-device baseline (2026-09-10)

## Scope and decision

This evidence supersedes the invalid 50K add run that failed closed with
`financial_v7_cutover_health_failed`.  The current device run used the approved
`9f8fd30` APK and an isolated `guest::performance-test` workspace only.  It did
not enable cloud identity adoption, connect a real financial workspace, or alter
real user data.

The 50K V7 cutover is now valid, but Phase 15 remains open.  Two measured
operations miss their targets, so no claim of closure is justified.

## Device evidence

The Diagnostics export at `2026-09-10T12:05:07.126Z` reported:

| Operation | Samples | p50 | p95 | Target | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| V7 history first page | 5 | 57 ms | 71 ms | 120 / 250 ms | pass |
| cold start | 5 | 2534 ms | 2789 ms | 2000 / 4000 ms | p50 breach |
| home open | 6 | 130 ms | 2478 ms | 300 / 800 ms | p95 breach |

The same valid 50K session collected five adds of each kind before the
instrument reset used for the startup run:

| Add kind | Runs | median total | median `save_local` |
| --- | ---: | ---: | ---: |
| transaction | 5 | 6187 ms | 6053 ms |
| commitment | 5 | 4365 ms | 4340 ms |

The V7 transaction operation itself was 131 ms p50 / 186 ms p95.  Therefore
SQLite transaction writes and the V7 history query are not the present cause of
the user-visible wait.  The remaining ambiguous area is the lab-only
`saveLocal` boundary and its synchronous store work.

## Narrow diagnostic change

Before changing behaviour, the isolated performance save path now records three
fixed, value-free timing marks:

1. `performance_snapshot`
2. `performance_schedule`
3. `performance_store_set`

The marks are forwarded only from the existing transaction and commitment
recorders.  They do not modify persistence order, V7 writes, demo isolation,
production saves, backups, archives, or cloud sync.

The contract test was mutation-tested by removing the final
`performance_store_set` mark.  It failed immediately, then the exact mark was
restored.  Static and runtime quality gates passed after restoration.

## Next evidence required

Install the CI-built APK containing this instrumentation, keep the already
valid 50K V7 lab, reset performance instruments once, then collect five
transactions and five commitments.  The three new marks will identify the
actual slow substep.  No performance fix is authorized from the blended
`save_local` number alone.
