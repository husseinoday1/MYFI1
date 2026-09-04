# MYFI — Phase 15 (Performance + Reliability Gate, §95–103) — Gap Analysis

Date: 2026-09-04
Session: Implementation 5
Baseline: branch `fix/pui-001-r2-onboarding-reader-recent-transactions`, HEAD `e16b512`,
upstream in sync (0 ahead / 0 behind), quality gate **169 passed / 0 failed / 11 skipped**.
Method: read + grep + one full gate run + a Node-side generation benchmark of tiers
1K / 25K / 100K (see "What was actually run"). **No production code was changed.**
Audit-first, same pattern as the Phase 14 gap analysis.

This document supersedes the preliminary read-only scoping recorded before it
on one material point — see the Correction section below.

---

## Correction to the preliminary scoping

The preliminary pass concluded that the dataset-tier infrastructure "matches §96
almost exactly" and that the remaining question was mostly "has it been RUN and
MEASURED." That framing is wrong in an important way, and the correction changes
what Phase 15 should do first.

`src/dev/performanceTestStorage.js` persists the generated workspace to
**AsyncStorage** (`STORAGE.DEMO_DATA` chunks + overlay), and
`src/store/slices/dataSlice.js` loads it into the Zustand store; only the
*archived* years go to SQLite, via `storeColdArchiveYears` into a
`::performance-test` cold-archive namespace (`src/lib/activeLedgerRepository.js:27`).
`src/screens/HistoryScreen.js` reads its rows from `useStore` plus the in-memory
`getTransactionsNewestFirst` index — there is no SQL pagination on the read path,
and `grep -rn "readCutover|CANONICAL_READ" src` returns nothing, i.e. **the
finance read cutover to SQLite has not happened.**

§95 is explicit: "لا نقيس architecture سنزيلها ونعتبرها Production result."
Measuring p50/p95 for cold start, Home, History pages, search, filter and reports
today would measure exactly the hybrid in-memory architecture that the cutover is
meant to remove. §98's own rule — opening Home or the first History page must not
pull the whole ledger — is not a threshold that is currently missed by some margin;
it is **structurally violated by the present read path**, because the whole ledger
is already in memory before Home renders.

**Consequence:** the honest sequencing is that the §97/§98 measurement half of
Phase 15 is *blocked on the read cutover*, not merely unstarted. Running the tiers
now would produce numbers that §95 forbids treating as a production result. What
*can* proceed independently is the reliability half (§101–§103) and the §102
configuration audit, which are read-path-agnostic.

---

## What was actually run

The tiers *were* executed, not just read. `tests/performance-generator-runtime-v51.test.cjs`
already loads `src/dev/performanceTestData.js` into a `vm` sandbox with stubbed
imports and builds every tier under Node, so the same harness was reused to time
generation and inspect the output. Node v24.18.0, Windows, this machine:

| Tier | generation | hot (in-store) tx | archive years | archived tx | total | Node heapUsed after |
|---|---|---|---|---|---|---|
| 1000 | 27 ms | 224 | 3 | 776 | 1,000 | 5 MB |
| 25000 | 214 ms | 2,780 | 6 | 22,220 | 25,000 | 16 MB |
| 100000 | 1,263 ms | 6,671 | 10 | 93,329 | 100,000 | 101 MB |

Two things this does and does not prove:

- **Does prove:** generation itself is not a bottleneck at any tier, scales roughly
  linearly, and the archive split keeps the hot in-store set small (6.7K rows even
  at the 100K tier). The 100K tier builds without crashing in pure JS.
- **Does not prove anything about §97.** This is generator throughput in Node, not
  app behaviour. It touches no SQLite, no React render, no device. It is a useful
  floor ("the data can be made") and nothing more.

Composition (§96's multiple wallets / currencies / debts / goals / commitments) is
**not verifiable through this harness**: the sandbox stubs `buildDemoWorkspace` to
return empty `wallets`/`debts`/`goals`/`commitments`, so those come back as 0 by
construction of the stub, not as a generator defect. Generated transactions carry
`{id, title, amt, cat, dateISO, walletId, scope, flowType, ts}` — Arabic `title`
text is present on every row (search text ✔), but there is no per-transaction
currency field, so multi-currency depends entirely on the wallet set that the real
`buildDemoWorkspace` supplies. Verifying §96 composition needs an app/device run.

---

## Per-item findings

### §96 Dataset Tiers — PARTIAL
`src/dev/performanceTestConfig.js` defines 200 / 1000 / 5000 / 10000 / 25000 /
50000 / 100000 plus active-only 5K/10K/25K variants — a superset of §96's
1K/10K/25K/50K/100K. Generator (`performanceTestData.js`, 259 lines) and storage
(`performanceTestStorage.js`, 232 lines) are real code with registered runtime
tests, and a tier picker exists in `SettingsScreen.js`.
All tiers generate successfully under Node (numbers above); years of history,
archived rows and search text are confirmed present. Multiple wallets/currencies
and debts/goals/commitments could not be confirmed from the Node harness (stub
limitation, see above).
Gap: the tiers materialise into the **pre-cutover** store, not the canonical
SQLite read path (see Correction).

### §97 Metrics (p50/p95) — MISSING
`grep -rn "p95|percentile" src` returns **nothing**. No per-operation timing
instrumentation exists for any of the 16 listed metrics. The only duration
recorded anywhere is a single whole-run aggregate in
`src/dev/financialLedgerV7DeviceHarness.js:239` (`durationMs: Date.now() - startedAt`),
which is one number for an entire harness pass, not a per-metric distribution.
No evidence document for a performance run exists under `docs/04_CURRENT_EVIDENCE/`
(searched by name; `git ls-files --others --exclude-standard docs/04_CURRENT_EVIDENCE/`
returns empty, so nothing is hiding untracked either).

### §98 Memory Metrics — MISSING
No JS heap, PSS/RSS, DB-size or WAL-size capture in `src/`. The restore harness
records `memoryEvidence: 'EXTERNAL_ADB_REQUIRED'`, i.e. memory evidence is
explicitly delegated to an external ADB runner that does not exist yet.
The §98 rule itself is violated structurally today (see Correction).

### §99 Performance SLOs — EXPECTED-EMPTY, not a gap
`docs/MYFI_PERFORMANCE_SLO.md` exists and contains design rules only, no measured
values. §99 says the final values land there "قبل optimization النهائي", so a
pre-baseline document is the expected state at this point, not missing work.
One factual defect in that doc is worth fixing: it states the device harness
records the reliability probes "مع quick_check ومدة التنفيذ". quick_check is
genuinely recorded; the "duration" is the single whole-run aggregate above, not
per-probe timing. The sentence overstates what exists.

### §100 100K Policy — PARTIAL
The 100000 tier now demonstrably **generates** (1.26 s, 100,000 rows, 10 archive
years, 101 MB Node heap — see above), which is more than was known before. But §100
asks for correctness, no catastrophic crash, no data corruption and a stress metric
**on the product**, and none of that has been observed on a device. Generation in
Node is a precondition, not the policy.

### §101 SQLite Reliability Tests — PARTIAL, and narrower than it looks
Real probe code exists in `src/dev/phase10RestoreBenchmarkHarness.js` (1918 lines):
`runRealSqliteBusyScenario` (two connections, `BEGIN IMMEDIATE`, asserts busy/locked
observed, asserts no partial write visible, asserts retry succeeds) and
`runRealSqliteFullScenario` (`PRAGMA max_page_count` quota, asserts SQLITE_FULL
observed, rollback, retry, WAL restored). Fault-matrix and kill-window scenarios are
also present.

Three limits qualify this:
1. **Scope.** All of it is scoped to the Phase 10 *restore* path, gated behind the
   diagnostic build flags. It is not general coverage of the ordinary command path.
2. **Automation.** The registered CI test `tests/phase10-restore-benchmark-memory.test.cjs`
   asserts that these strings are **present in the source file**. It does not execute
   the probes. Actual execution is real-device only.
3. **Self-declared not-run.** The harness itself records
   `processKillAcceptance: 'PENDING_EXTERNAL_ADB_RUNNER'` and
   `physicalDeviceStorageExhaustion: 'NOT_RUN_GLOBAL_SIDE_EFFECT_FORBIDDEN'`.

Not covered anywhere found: interrupted WAL checkpoint, interrupted migration as a
fault probe, FK-violation probe, corrupted-DB simulation. (Greps for
`wal_checkpoint`, FK-violation and low-storage patterns across `tests/` return
nothing outside the restore harness.)

### §102 SQLite Operational Configuration — PARTIAL
Actual configuration found:
- `src/lib/ledgerDatabase.js:129-131` — `journal_mode = WAL`, `foreign_keys = ON`,
  `busy_timeout = 5000` on the main ledger connection. **`synchronous` is not set**
  on this connection (so it runs at the SQLite default, FULL), and no checkpoint
  policy is set.
- `src/lib/activeLedgerRepository.js:41` — `synchronous = NORMAL` on that connection.

So `synchronous` differs between two connections to the app's own data, and neither
choice carries the reason + benchmark + crash-safety evidence §102 requires. The
device harness (`financialLedgerV7DeviceHarness.js:136-152`) does assert
foreign_keys / journal_mode / busy_timeout at runtime, which is real evidence that
three of the five settings are what we think they are — but assertion is not the
benchmark/crash-safety justification §102 asks for.
**This is the clearest genuinely-actionable §102 finding and it does not depend on
the read cutover.**

### §103 DB Health — PROVEN
`PRAGMA quick_check` is used exactly as §103 prescribes: at restore validation and
promotion (`financialBootstrapRecoveryPromotionV2.js` ×4,
`financialLedgerV7Repository.js` ×4), in migration/recovery staging, and in
diagnostic entry points (`p10_014aCloneProbeEntry.js` ×3,
`financialLedgerV7DeviceHarness.js`). It is **not** run on every startup, which is
the constraint §103 states.

---

## Summary table

| Item | Status |
|---|---|
| §96 Dataset tiers | PARTIAL — all tiers generate; they target the pre-cutover store |
| §97 p50/p95 metrics | MISSING — no timing instrumentation at all |
| §98 Memory metrics | MISSING — and the §98 rule is structurally violated today |
| §99 SLO values | EXPECTED-EMPTY — one overstated sentence to correct |
| §100 100K policy | PARTIAL — generates in Node, unobserved on device |
| §101 Reliability probes | PARTIAL — real but restore-scoped, source-asserted in CI, 4 categories absent |
| §102 SQLite config audit | PARTIAL — `synchronous` inconsistent, no justification evidence |
| §103 DB health / quick_check | PROVEN |

## Recommended sequencing (not executed)

1. **§102 audit** — document reason/benchmark/crash-safety for each of the five
   settings and resolve the `synchronous` inconsistency deliberately (either
   justify the difference or unify it). Read-path independent, provable now.
2. **§101 widening** — the four absent probe categories, and moving what exists
   from source-string assertion toward something CI actually executes. Also
   read-path independent.
3. **§99 doc correction** — the "duration" overstatement.
4. **§97/§98 measurement** — hold until the read cutover, per §95. Building timing
   instrumentation against the current read path would encode the architecture we
   are removing.

Item 4 is a judgement call about plan sequencing, not an engineering refusal, and
belongs to Planning & Audit / the owner, not to this session.
