# Phase 15 — device measurements and large-tier startup blocker (2026-09-08)

## Delivery state

- Branch / pushed commit: `fix/pui-001-r2-onboarding-reader-recent-transactions` @ `27d5e43e56e1fc02c64914a6dbbdd20ec64ee611`.
- Actual GitHub CI passed on that exact SHA:
  - Test Gate run `34227233477`: success.
  - Normal APK run `34227231122`: success.
- The verified CI APK was installed on Android device `SM_S938B` via ADB. Artifact SHA-256:
  `39462e2e213782249864998725d00fd08284660247039a3626fed70e55841193`.
- Baseline remains the pushed `27d5e43` CI APK. The later local startup fix is
  committed as `02477bb` but has **not** been pushed or built by CI yet, per
  owner instruction.

## Device evidence: V7 tier route is now real

For each required tier, the owner selected the isolated lab fixture, opened
History, exercised the current/previous-month read path, and opened
Diagnostics. The app was restarted between tiers to reset telemetry.

All five final Diagnostics captures confirm:

- `sourceMode: sqlite`
- `cutover: true`
- last lab attempt `phase: complete`, `ok: true`, `issueCodes: []`
- no coverage rejections, unsupported reads, or errors

| tier | accepted queries | p50 ms | p95 ms | total PSS (kB) |
|---|---:|---:|---:|---:|
| 200 | 12 | 51 | 55 | 220,787 |
| 5,000 | 16 | 71 | 225 | 307,391 |
| 10,000 | 16 | 66 | 1,275 | 412,909 |
| 25,000 | 15 | 69 | 96 | 577,096 |
| 50,000 | 16 | 76 | 102 | 832,475 |

The 10K p95 spike is real observed evidence and must be retained; it should
not be normalized away because adjacent tiers were lower. The 25K first
attempt displayed `shadow_parity_failed`, but a subsequent 25K entry in the
same device process completed; final Diagnostics is the authority for its
recorded measurement. Preserve both screenshots as evidence of a transient
failure/retry rather than silently erasing the first event.

Capture files are local and untracked under:
`.artifacts/phase15-ci-27d5e43/device/`. Do not quote any visible financial
values from screenshots. They are not required for Phase 15 evidence.

## New blocker: unacceptable cold start at 25K / 50K

The owner observed slow restart after 25K. It was verified rather than
dismissed:

- `am start -W` reported Android activity launch in 133 ms. This is **not**
  usable-app time.
- A screenshot taken three seconds after a cold 25K restart was still the
  MYFI splash screen; the normal UI appeared by the later capture.
- After the 50K measurement, a cold restart remained on the MYFI splash
  screen for more than 40 seconds and recovered only during the next
  30-second observation window. The practical ready time is therefore
  bounded above 40 seconds and below roughly 70 seconds in this run.

This is a Phase 15 performance failure / blocker, not merely a test-tool
issue. Do not close Phase 15 or run the 100K policy fixture until it has a
root cause, a bounded fix, and device remeasurement.

## Source-traced high-confidence cause (requires timing instrumentation before a fix)

The startup performance-lab branch is in
`src/store/slices/useSyncSlice.js`, `loadLocal`, around lines 2364–2400.
It does all of the following before publishing a ready app state:

1. `readPerformanceSnapshot(...)` rebuilds the stored transaction chunks in
   JavaScript (`src/dev/performanceTestStorage.js:187+`) and then
   `stateFromSnapshot(...)` normalizes/deduplicates the resulting state.
2. It **unconditionally** invokes
   `exportColdArchives(getColdArchiveNamespace(...))` before knowing whether
   the V7 lab is already cut over. `exportColdArchives`
   (`src/lib/localArchiveRepository.js:365+`) loads every archived year and
   its transaction payload into JavaScript. Its own comment directly above it
   says that day-to-day screens must not hydrate every archived year.
3. With an already-cut-over lab it then calls
   `readFinancialWorkspaceV7(..., includeArchived:false, transactionLimit:null)`
   (`useSyncSlice.js:2384+`). That query/JSON parse has no row bound, followed
   by another complete `stateFromFinancialV7(...)` → `stateFromSnapshot(...)`
   normalization.

This is a high-confidence causal chain for the observed cold-start delay:
large fixture deserialization and repeated JS normalization occur on the
startup critical path. It is not yet a proof of the individual time share;
add duration-only milestones before changing behavior.

## Implemented local-only startup fix — ready for review

The approved first fix is implemented locally and deliberately limited to the
isolated performance workspace:

1. `ensurePerformanceTestLedgerV7` has a `reuseOnly:true` preflight. It checks
   the existing V7 state, requested tier, and health **without clearing or
   rebuilding anything**. A failed preflight returns `rebuildRequired:true`;
   only that result permits the existing archive export + destructive
   isolated-lab rebuild.
2. `loadLocal` runs this preflight before `exportColdArchives`. Therefore a
   healthy, already-cut-over 25K/50K lab does not deserialize every cold
   archive at startup. Rebuild/reverify behaviour still exports cold archives
   and retains the existing shadow + operational cutover path.
3. The complete `readFinancialWorkspaceV7(... transactionLimit:null)` and
   `stateFromFinancialV7` readback are intentionally unchanged on reuse. This
   preserves the same-count-edit guarantee: Zustand is hydrated from V7, never
   treated as current only because a snapshot count matches.
4. In-memory, duration-only startup marks now cover snapshot read,
   `stateFromSnapshot`, reuse proof, cold-archive export (if rebuilding),
   V7 ensure (if rebuilding), V7 workspace read, and
   `stateFromFinancialV7`. The existing Settings → App startup timing action
   exposes them. No transaction values, IDs, names, counts, namespace, or
   archive content is recorded.

Files changed locally:

- `App.js`
- `src/lib/startupTiming.js`
- `src/dev/performanceTestStorage.js`
- `src/dev/performanceTestLedgerV7.js`
- `src/store/slices/useSyncSlice.js`
- `tests/performance-v7-cutover-contract.test.cjs`
- `tests/run-performance-v7-sqlite.cjs`
- `tests/ui-contract.test.cjs`

Local verification completed after the change:

- `node tests/run-performance-v7-sqlite.cjs`: pass, including V7 reuse with
  no cold-archive argument, a missing-tier `reuseOnly` preflight with no
  archive argument, and the existing real-workspace FK scope guard. The
  missing-tier case asserts `ok:false`, `rebuildRequired:true`, and exact
  preservation of the current V7 workspace row.
- Manual mutation proof: replacing `if (reuseOnly)` with
  `if (false && reuseOnly)` made that test fail because it attempted an actual
  rebuild. The guard was restored before the final gate runs.
- `npm run test:gate:static`: **96 passed, 0 failed**.
- `npm run test:gate:runtime`: **90 passed, 0 failed**.
- `git diff --check`: clean.

This is not device evidence yet. It needs review, commit/push authorization,
actual CI Test Gate + normal APK, then the on-device measurement below.

## Required next execution after review and CI

1. Install the APK built by the actual CI run that contains this local fix.
2. Cold-start 25K and 50K separately. Measure from forced stop / launch until
   the normal screen is visibly usable; do not use `am start -W` as the timing.
3. In Settings, open **App startup timing** after each run and retain the
   duration-only JSON. The expected reuse path has no
   `performance:coldArchiveExport` or `performance:ledgerEnsure` mark.
4. Repeat 50K History, Diagnostics, and memory (PSS) evidence. Confirm V7
   `sqlite` source, cutover, complete lab phase, no issue codes, and full
   readback behaviour.
5. Do not run 100K until the owner accepts the measured large-tier cold start.

## Original safe next investigation / fix plan (completed where noted)

1. **Completed locally:** add privacy-safe duration-only startup telemetry around: snapshot read,
   `stateFromSnapshot`, cold-archive export, `ensurePerformanceTestLedgerV7`,
   V7 workspace read, and `stateFromFinancialV7`. Do not log transaction
   payloads, IDs, balances, or archive contents.
2. **Completed locally:** do not call `exportColdArchives` on the
   verified already-cut-over/reuse path. It is only required to rebuild or
   re-verify the lab fixture. Confirm the health/reuse contract first.
3. **Preserved:** a same-count V7 edit cannot silently leave
   Zustand stale. Do not simply replace `transactionLimit:null` with an
   arbitrary cap; use a generation/checkpoint/readback proof or a deliberately
   designed deferred hydration path.
4. Rebuild through real CI, retest 25K and 50K cold startup using a measured
   usable-UI milestone, then repeat 50K History/Diagnostics/memory evidence.
5. Only after large-tier startup is acceptable, consider the visible 100K
   lab fixture for §100. It has **not** been run in this session.

## Phase 15 status after this run

- §96 V7 five-tier read-path evidence: measured, but final closure is blocked
  by the cold-start regression at large tiers.
- §98 memory evidence: aggregate device PSS was recorded for all five tiers,
  but should not be declared closed while 50K restart is unacceptable.
- §100 100K policy: still open; do not run it before resolving the restart
  blocker.
- No real Supabase identity-adoption flow was run. No real financial data was
  migrated, repaired, deleted, rekeyed, or synchronized as part of the lab.
