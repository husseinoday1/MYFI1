# MYFI — Phase 15 V7 device results and isolated lab save fix

Date: 2026-09-09
Branch: `fix/pui-001-r2-onboarding-reader-recent-transactions`
Measurement build: `42b8f77`
Status: device evidence complete for 200 / 25K / 50K; first isolated fix is
implemented locally and awaiting Planning & Audit review before commit.

## Acceptance build used for every number below

- Test Gate: `34346262049` — success.
- Normal release APK: `34346262045` — success.
- APK SHA-256:
  `4c6a7ea25f41305ee281b7fcbc6a8662af7c12c81b1ad9060341d874d7314847`.
- Physical device: Samsung SM-S938B.
- Every accepted tier reported `sourceMode: sqlite`, `cutover: true`, a
  `::performance-test` namespace, zero History errors/rejections, and matching
  `resolvedQueries` / `durationSampleCount`.
- An earlier 200 run from the defective instruments is not used. The accepted
  200 run came only after reset reachability, cold-start reset, History timing,
  and all 13 inner V7 write steps were proven on the device.

## Device results

### §97 operation timings

All values are milliseconds. The table reports p50 / p95.

| Tier | Cold start | Home open | History first page | Transaction renderable |
|---|---:|---:|---:|---:|
| 200 | 157 / 178 | 31 / 59 | 54 / 63 | 38 / 44 |
| 25K | 1,865 / 1,982 | 107 / 1,759 | 60 / 100 | 123 / 291 |
| 50K | 2,950 / 2,991 | 155 / 2,659 | 66 / 119 | 183 / 554 |

Sample counts were 5 cold starts, 7 Home opens, 11-12 accepted first-page
History queries, and 5 transaction saves per tier. History remains below its
evidence-based 120ms / 250ms target at 50K. The provisional cold-start p50 and
Home p95 thresholds are breached at 50K; thresholds were not moved to hide the
result.

### Add-operation step result

| Tier | Transaction total median / max | Transaction `save_local` median / max | Commitment total median / max | Commitment `save_local` median / max |
|---|---:|---:|---:|---:|
| 200 | 257 / 299 | 222 / 262 | 218 / 235 | 195 / 204 |
| 25K | 6,878 / 7,025 | 6,734 / 6,772 | 4,495 / 5,223 | 4,473 / 5,200 |
| 50K | 10,115 / 10,425 | 9,918 / 9,944 | 7,741 / 9,534 | 7,720 / 9,511 |

At 25K and 50K, `save_local` is respectively 97.9% and 98.1% of the median
transaction operation, and 99.5% and 99.7% of the median commitment operation.
The 13 V7 commit steps are present in all five runs and are not the scaling
source. At 50K their medians remain small: wallet-position 133ms, read-back
36ms, transaction commit 7ms, and all remaining inner steps 0-4ms.

### §98 partial device evidence

With the accepted 50K lab active, Android `dumpsys meminfo com.myfi.app`
reported:

- total PSS: 160,252KB;
- total RSS: 201,724KB;
- total swap PSS: 81,641KB.

The normal release APK is not debuggable, so Android correctly refused
`run-as com.myfi.app`; DB/WAL file sizes cannot be claimed from that mechanism.
JS heap, DB size, and WAL size remain explicitly unmeasured. §98 is not closed.

## Why 5K and 10K were not repeated

Planning & Audit accepted 200 / 25K / 50K as sufficient to establish the
scaling shape. The missing middle points cannot change which step dominates:
the two independently measured large tiers already place more than 97% of the
operation in the same named step. No 100K run is authorized until 50K is
acceptable.

## Root cause confirmed in code

The measured `save_local` step enters the `demoMode` branch in
`useSyncSlice.saveLocal`. Although persistence is deferred and coalesced, that
branch first called `snapshotFromState`, which synchronously calls
`dedupeWorkspaceData`. That maps, normalizes, and deduplicates the complete
25K-50K in-memory transaction array before the overlay is scheduled. The
device scaling follows that O(n) work.

This cost is isolated to the lab at these sizes. Five production paths read a
bounded V7 cache with `transactionLimit: 2000`; the lab alone reads with
`transactionLimit: null`. Therefore a real post-cutover account with a 50K
SQLite ledger never puts 50K rows through this snapshot call.

## Explicit full-cache dependency audit

Before changing anything, the lab's V7 consumers were checked:

- Home uses SQL summary, recent rows, and wallet positions after cutover.
- command-time wallet balance/position validation uses SQL after cutover.
- History uses paged SQL for first/next page, search, and filters; the bounded
  Zustand list is its compatibility first paint only.
- Reports use SQL period summaries/categories after cutover.
- Settings displays the selected tier's configured count, not `trans.length`.
- health is the one real full-count dependency. It still receives the full
  workspace before this first fix; bounded-startup work must supply an explicit
  expected count before `transactionLimit:null` can be removed.

Some secondary Home/Reports intelligence reads the bounded cache. That is not a
lab exception: it is exactly the same 2,000-row cache contract used by real
post-cutover accounts.

## First fix, deliberately isolated

The current uncommitted change adds `snapshotFromPerformanceState`:

- only `demoMode:true` plus `performanceTestMode:true` may bypass the full
  dedupe pass;
- any non-lab caller automatically falls back to ordinary
  `snapshotFromState` normalization;
- its only call site is inside the existing demo save branch;
- it preserves the transaction array by reference, allowing the existing
  small overlay writer to detect and persist an added row without first
  cloning/scanning the fixture;
- production save, V7 writes, sync, Supabase, schema, and migration code are
  unchanged.

This fixes the measured add bottleneck without yet changing startup hydration.
The bounded-startup change remains a separate, higher-risk step because its
health expected-count and rebuild-source contracts need explicit treatment.

## Verification before review

- `npm run test:logic`: all assertions passed.
- `npm run test:gate:static`: 99 passed, 0 failed, 11 skipped.
- `npm run test:gate:runtime`: 90 passed, 0 failed, 6 skipped.
- `tests/performance-data-runtime-v512.test.cjs`: passed.
- `git diff --check`: clean (line-ending notices only).

Mutation checks, all restored afterward:

1. Made the lab helper call `dedupeWorkspaceData` again: caught by the 50K
   reference-identity assertion.
2. Removed the helper's two lab-isolation flags: caught because a non-lab
   duplicate transaction no longer followed ordinary last-value dedupe.
3. Replaced the demo call with `snapshotFromState`: caught by the runtime
   reachability contract.
4. Used the fast helper in the real Vault write: caught because the structural
   test permits exactly one call, inside the isolated demo branch.

No mutation survived.

## Remaining work

1. Planning & Audit reviews this diff, tests, and mutations.
2. After approval: commit, push, confirm both CI run IDs, install that exact
   normal-release APK, and re-measure the five transaction/commitment saves at
   50K.
3. Independently design and review metadata-first, bounded V7 startup. It must
   preserve health/rebuild correctness and must never accept a same-count stale
   snapshot.
4. §96/§98/§100 and Phase 15 remain open until the post-fix 50K evidence and
   the still-missing memory/100K-policy evidence are resolved.
