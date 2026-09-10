# MAALFLOW — saveLocal and large-ledger root-cause research

**Date:** 2026-09-10  
**Scope:** research only; no product behaviour was changed by this document.  
**Question:** why can Home, Basira, Reports, and an add/follow-up action feel slow with a 50K V7 ledger, and what is the safest durable design?

## Evidence already obtained on the 50K V7 device run

The performance lab was genuinely on V7 (`cutover: true`, tier `50000`, reuse health `ok: true`). The first-page history query is healthy: five samples, p50 **57 ms**, p95 **71 ms**. This proves neither Home nor the mutation wait is an unavoidable SQLite-at-50K problem.

The same run recorded:

| Operation | Result | Meaning |
| --- | --- | --- |
| cold start | p50 2534 ms, p95 2789 ms | p50 misses the 2 s target; not a 50K full-cache load anymore |
| Home open | p50 130 ms, p95 2478 ms | normal navigations are quick, but the first/outlier path remains expensive |
| add transaction end-to-end | median 6187 ms | user-visible wait is real |
| add commitment end-to-end | median 4365 ms | user-visible wait is real |
| V7 transaction commit only | p50 131 ms, p95 186 ms | the durable financial commit is not the multi-second component |

The add-operation recorder shows the large remainder as `save_local`; the latest build separates this into snapshot construction, deferred-scheduling, and store-set timing. Those three device marks are still needed to attribute the delay exactly.

## Direct code findings

### 1. `saveLocal` does not await the deferred performance snapshot write

For a performance workspace, `saveLocal` calls `snapshotFromPerformanceState`, schedules `schedulePerformanceSnapshotWrite`, performs a tiny Zustand `set({ localUpdatedAt, dirty })`, then returns. The scheduler starts its write after 350 ms in a timer and returns immediately.

Relevant implementation:

- `src/store/slices/useSyncSlice.js` — `saveLocal` at lines 2643–2670.
- `src/store/domain.js` — `snapshotFromPerformanceState` at lines 494–497 preserves the test-data references instead of normalizing all rows.
- `src/dev/performanceTestStorage.js` — deferred scheduling at lines 165–182.

Therefore a 4–6 second awaited `save_local` cannot be explained simply as waiting for AsyncStorage I/O in this current lab branch. Plausible remaining synchronous work is snapshot construction, notification/render work following the Zustand update, or JavaScript scheduling. The new three marks distinguish the first two; a React render profiler is required if `performance_store_set` is small.

### 2. The UI action deliberately waits for that path

`AddTransModal` awaits `addTrans` before closing. `addTrans` commits to V7, updates `trans`, then awaits `saveLocal`. Commitment creation does the same.

- `src/components/AddTransModal.js` — await at line 921.
- `src/store/slices/transactionsSlice.js` — V7 commit then awaited `saveLocal` at lines 181–184.
- `src/store/slices/managementSlice.js` — awaited `saveLocal` at lines 108–111.

The V7 commit is the durable financial boundary. Any later optimization must not report success before that commit succeeds, but it can avoid coupling the modal's completion to non-critical compatibility/checkpoint work once that work's recovery contract is explicitly proven.

### 3. Large visible screens subscribe to the complete Zustand store

`useStore` is a plain Zustand `create` store. `HomeScreen`, `BasiraScreen`, `ReportsScreen`, `TrackersLabScreen`, and `AddTransModal` call `useStore()` without a selector. A change to `dirty` or `localUpdatedAt` can therefore schedule all mounted consumers of that store to render even when their financial row references did not change.

- Store: `src/store/useStore.js` line 19.
- Whole-store consumers: `src/screens/HomeScreen.js:151`, `BasiraScreen.js:42`, `ReportsScreen.js:162`, `TrackersLabScreen.js:204`, `src/components/AddTransModal.js:170`.

This is the strongest static explanation for a delay immediately after the small `set` in `saveLocal`. It is a candidate, not yet a measured causal conclusion.

### 4. Some high-level screens compute financial analysis from the bounded cache

V7 startup and cutover deliberately retain a **2,000-row UI cache**; the full source of truth remains SQLite. This is correct for boot memory and for paged History, whose 50K test passed. It becomes unsafe when a screen treats that cache as all historical financial truth.

- Bound: `src/store/slices/useSyncSlice.js:2415–2422`; `src/lib/financialLedgerV7Repository.js:4873–4931`.
- Home runs `buildFinancialSnapshot`, recurring/commitment calculations and transaction indices from `trans`, although it also has SQL summary/recent/position queries: `src/screens/HomeScreen.js:195–287`.
- Basira repeatedly filters/scans `trans` for monthly series, insight and forecast calculations: `src/screens/BasiraScreen.js:42–74`; `src/lib/localIntelligence.js:303+`.
- Reports already uses SQL summary/category queries, but still builds an index and insights/report work from cached transaction arrays: `src/screens/ReportsScreen.js:181`, `286–344`.
- Follow-ups filters `trans` once for each commitment to construct payment histories: `src/screens/TrackersLabScreen.js` around lines 270–330.

At 50K, raising the cache limit to 50K would merely recreate the old CPU/memory problem. Keeping it at 2K without moving these analyses to V7 risks incomplete results for an action at row 8,000 or for archived history. Neither choice is acceptable as the final architecture.

## Best safe architecture

### Recommended: V7 query/read-model boundary, with a small UI cache

Keep `ledger_financial_transactions_v7`, postings, entities, and archive rows as the sole financial truth. Keep the 2K cache only for immediately visible/editable UI rows. Replace each screen's full-history JavaScript calculation with a named, parameterized V7 read model:

| Consumer | Read model | Required semantics |
| --- | --- | --- |
| Home | `readDashboardSnapshotV7` | current-period totals, positions, recent page, upcoming items; all from one consistent V7 read boundary |
| Basira | `readInsightSeriesV7` | month/category aggregates and the exact prior-month baseline the existing algorithm defines |
| Reports | `readReportV7` | selected period, scope, wallet and archive policy; drill-down remains paginated SQL |
| Follow-ups | `readTrackerStatusV7` / `readTrackerPaymentsPageV7` | relationship-keyed payments, totals and pages rather than `commitments × trans` scans |

The existing `queryLedgerSummary`, `queryLedgerCategorySpend`, `queryLedgerWalletPositions`, and paged `queryLedgerTransactions` are the correct foundation. They already use bound parameters, V7 source-of-truth gating, and explicit archive choices in `src/lib/activeLedgerRepository.js`.

This does **not** hide history. If the user opens transaction 8,000, its page is read from V7 using a cursor; the cache size is never a business-data limit. Archive and backup/recovery continue to work because neither is sourced from the UI cache. Full backup/recovery reads remain full canonical V7 operations at their explicit boundaries.

### Selectors are the first tactical improvement, not the final data model

Convert each mounted expensive screen from `useStore()` to narrowly selected primitive/state references, with `useShallow` only where a stable composite is necessary. Start with `localUpdatedAt`, `dirty`, and unrelated actions deliberately excluded from Home/Basira/Reports selectors. This reduces needless renders and is reversible, but does not solve incomplete historical analysis; it must ship only with render-count/profiler evidence and selector contract tests.

Zustand documents `useShallow` for preventing needless selector re-renders: <https://zustand.docs.pmnd.rs/reference/hooks/use-shallow>.

### Treat summaries as derived data, not a second ledger

Begin with live aggregate SQL and the existing indexes. Add an index only after recording `EXPLAIN QUERY PLAN` on representative 50K and archive queries; SQLite explicitly says the plan shows whether rows are scanned or searched through an index and whether a temporary sort is used: <https://sqlite.org/eqp.html>.

Only if measured aggregate queries still miss their target should MYFI add materialized projection tables. Such tables must be rebuilt from V7, updated in the **same exclusive transaction** as the V7 mutation, versioned by ledger generation, and rejected/rebuilt on mismatch. They are then a cache with a verifiable invalidation rule, never an independent financial authority.

### Do not use these apparent shortcuts

1. **Do not raise `transactionLimit` to 50K.** It makes rendering and JS scans scale with history and does not restore exact archive semantics.
2. **Do not make the current `saveLocal` await disappear globally.** First classify each non-ledger write as durable requirement, recoverable checkpoint, or lab-only telemetry, and add a lifecycle flush/recovery proof where a deferred checkpoint is allowed.
3. **Do not move user text or `payload_json` to SQL-string interpolation / `execAsync`.** Expo says `execAsync` does not escape parameters and can permit injection. Use bound parameters/prepared statements: <https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/>.
4. **Do not use `withTransactionAsync` for a multi-step read/write contract that must exclude interleaving.** Expo documents that other async queries can join it; use the existing exclusive transaction discipline where isolation is required: <https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/>.
5. **Do not store an ever-growing JSON copy of the ledger in AsyncStorage.** AsyncStorage is string-backed, so large snapshots incur stringify/parse and duplication; it is suitable only for small preferences/checkpoints, not financial truth: <https://react-native-async-storage.github.io/3.0/api/usage/>.

## Decision sequence before implementation

1. Install the already-built diagnostic release only after its CI APK run passes and its merged-manifest audit says `PASSED`.
2. On the device, collect the three `saveLocal` sub-step marks for five 50K transactions and five commitments. If `performance_store_set` dominates, capture React render commits for Home and the modal; if snapshot construction dominates, measure its object/JSON work separately.
3. Add query-plan and parity tests for one read model at a time. For every result, compare V7 SQL output with the current JavaScript algorithm on fixtures containing >2K rows, multiple scopes/wallets, transfers, deleted rows, archived rows and non-ASCII user text.
4. Migrate Home first because it combines visible impact with existing V7 query infrastructure; then Reports, Basira, and Follow-ups. Do not change their display meaning while changing their data source.
5. Only after parity and device measurements choose indexes or a materialized projection. Verify backup export/import, archive drill-down and page 8,000 before closing the work.

## Confidence and remaining unknowns

High confidence: the 2K bound should remain a UI-cache bound, not a hidden business limit; whole-store subscriptions are structurally broad; several analyses presently depend on that bounded cache; the lab snapshot write is deferred.

Not yet proven: which exact `saveLocal` substep explains the current multi-second wait, the precise first-Home p95 cause, and whether any additional V7 index is needed. Those need the new device marks and query plans; a Node benchmark is not evidence for Android user latency.
