# MYFI Phase 15 — V7 performance-lab implementation evidence

Date: 2026-09-06
Branch: `fix/pui-001-r2-onboarding-reader-recent-transactions`
Base before this change: `992c738`

## Status

**Implementation complete; Phase 15 is not formally closed yet.** The performance
dataset lab now uses the same financial V7 shadow-migration and operational-cutover
pair as a real local workspace, but the required five-tier Android measurements
cannot be certified from this environment until a usable device runner is available.
No §96/§98/§100 number is invented or carried forward from the invalid V6 run.

## V7 cutover audit and decisions

| Path controlled by `financialLedgerV7Cutover` | `demoMode:true` + `cutover:true` decision |
| --- | --- |
| V2 activation and cloud sync | Remains fail-closed when `demoMode` is true. The performance namespace never gets a cloud sync identity or transport outbox row. |
| V2 identity adoption (`prepare` / `confirm`) | Remains blocked in demo mode. Real Supabase identity adoption was not exercised and is explicitly out of scope. |
| Home | Remains SQL-first and fail-closed for the V7 summary/recent/position reads when the source marker is not SQLite. |
| Reports | Remains SQL-first for V7 summary/category reads; its existing in-memory fallback is the bounded V7 workspace cache, not the retired V6 performance table. |
| History | Existing read-path telemetry/fallback remains unchanged; the lab no longer creates a V6 snapshot for this path. |
| Transaction/tracker/management mutations | Correctly use V7 when cut over; the performance namespace may exercise these local paths, while the private-namespace guard suppresses generation and both V1/V2 transport writes. |
| Restore-epoch/cloud-handshake diagnostic entries | Their existing eligibility explicitly rejects demo mode or requires a signed-in account; no test-workspace route was opened. |
| Performance namespace transport | Added a namespace guard: no V3 identity/outbox write and performance cleanup removes any stale V3 outbox rows. |
| Cold-archive writes | The performance namespace is now private to the archive repository too, so archiving a generated tier cannot advance a live generation or create a sync identity. |
| Destructive reset / backup | Blocked while `performanceTestMode` is active; the operator must exit the isolated test workspace first. |
| Real financial data | Unchanged: demo storage remains separately namespaced, with separate cold archives and no cloud sync. |

## Implementation

- `src/dev/performanceTestLedgerV7.js` adds the isolated V7 lab bootstrap. A tier
  switch clears only the performance namespace, runs
  `runFinancialShadowMigrationV7`, then runs
  `runFinancialOperationalCutoverV7`, and verifies V7 health and expected counts.
- `enterDemoMode` and the demo `loadLocal` path use that helper instead of writing
  the V6 query ledger directly.
- Exiting the lab restores the real workspace's V7 readiness/cutover state and
  clears only performance storage.
- The performance namespace is treated as private by V7 generation/outbox code;
  it cannot create cloud transport identity or V3 outbox work.
- The same private-namespace rule now covers cold-archive writes, which run before
  the V7 migration for the larger tiers.
- Reset, backup export, backup import, and vault reset are explicitly guarded in
  the performance workspace.
- A device restart exposed a separate persistence defect: the durable
  `legacyRecoveryDisabled` marker suppressed every performance snapshot, even a
  lab explicitly started after the reset represented by that marker. Startup now
  compares `DEMO_ACTIVE.startedAt` with `resetAt`: a pre-reset snapshot remains
  blocked, while a newer isolated lab is restored. This preserves reset safety
  without silently returning the operator to real financial data.

## Verification completed

- Static quality gate: **96 passed, 0 failed, 11 skipped**.
- Runtime quality gate: **89 passed, 0 failed, 6 skipped**.
- A first sandboxed Android-inclusive gate reached **185 passed, 1 failed,
  10 skipped**; its only failure was the environment refusing to execute
  `hermesc.exe`. Re-running the Android export with the required host permission
  succeeded and produced the Hermes Android bundle in `dist-android-verify`.
- Deliberate mutation guard check: temporarily disabled the performance-namespace
  outbox guard; `tests/performance-v7-cutover-contract.test.cjs` failed as expected;
  the guard was restored and the contract passed.
- Pre-push review found a second isolation route in `storeColdArchiveYears`: it
  could advance the namespace live generation before the V7 bootstrap. The archive
  repository now treats `::performance-test` as private. Temporarily disabling
  that guard made the strengthened contract fail with
  `performance archive writes can create a live sync identity`; restoring it made
  the contract pass.
- Pre-push review found that leaving the lab could retain the lab's migration and
  data-health objects in Diagnostics. Exit now clears both while restoring the
  real workspace's own V7 cutover/checksum state, and the contract pins this.
- The same review found three startup/exit consistency gaps. A failed performance
  bootstrap is now handled inside the isolated demo branch rather than being
  mislabeled as real-vault corruption; an already-cut-over lab hydrates Zustand
  from authoritative V7 instead of trusting same-count snapshot equivalence; and
  exiting the lab preserves a real workspace's verified shadow readiness even if
  that workspace has not reached operational cutover yet.
- `git diff --check`: clean for the changed files.
- No live Supabase account or real cloud identity-adoption path was activated.
- Restart-persistence regression gates after the device finding: static
  **96 passed, 0 failed, 11 skipped**; runtime **89 passed, 0 failed, 6 skipped**.

## Device runs rejected during validation

- The first 200-row demo attempt reported `sourceMode` unset and
  `financialLedgerV7Cutover=false`; it was the retired V6 route and is invalid.
- A later screen showed the 200-row demo workspace with 80 active and 120 archived
  rows, but its diagnostic counters had not been reset, so those timings are not
  an isolated tier result.
- After a clean process restart, the app mounted the owner's real workspace
  instead of the active demo workspace. The subsequent month-switch timings and
  memory sample therefore measured real data and are rejected.
- No number from these three attempts is used for §96, §98, or §100. A rebuilt
  APK containing the timestamp-bounded restart fix must be installed before the
  five-tier sequence begins again.

## Measurement gate still open

The required measurements remain uncertified until run on the authorized Android
runner against the rebuilt commit:

| Tier | §96 correctness/read latency | §98 memory evidence | §100 100K policy |
| ---: | --- | --- | --- |
| 200 | pending device run | pending external ADB | n/a |
| 5,000 | pending device run | pending external ADB | n/a |
| 10,000 | pending device run | pending external ADB | n/a |
| 25,000 | pending device run | pending external ADB | n/a |
| 50,000 | pending device run | pending external ADB | n/a |
| 100,000 policy tier | n/a | pending external ADB | pending device policy run |

ADB access and the physical Android device are now available. Screenshots and
external memory samples can be collected directly after the restart fix is built
and installed. The rejected attempts remain retained under `.artifacts/phase15/`
as diagnostic evidence only; they are not acceptance measurements.

## Required closure evidence

Phase 15 can be marked closed only after all of the following are attached to the
post-change commit:

1. Five V7 device runs (200/5K/10K/25K/50K) with `sourceMode=sqlite`,
   `cutover=true`, counts, correctness, p50/p95, and external ADB memory evidence.
2. The separate 100K policy run and its memory/policy result.
3. A green GitHub Actions Test Gate and APK build, identified by the actual run ID
   and commit SHA.
