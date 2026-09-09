# Phase 15 — bounded V7 performance-lab cache

**Date:** 2026-09-10
**Status:** code and SQLite verification complete; release-APK/device measurement remains required before performance acceptance.

## Finding

The 50K performance lab correctly cut over to Financial Ledger V7, but it intentionally hydrated every active lab transaction into Zustand (`transactionLimit: null`). The subsequent `saveLocal` serialized and persisted that entire fixture after each lab edit. On the physical-device evidence collected on 2026-09-09, this was the dominant cost:

| Operation | Samples | Device p50 | Device p95 / max |
| --- | ---: | ---: | ---: |
| Add transaction | 5 | 10,219 ms total; 9,980 ms `save_local` | 10,193 ms `save_local` max |
| Add commitment | 5 | 6,646 ms total; 6,625 ms `save_local` | 7,802 ms `save_local` max |

The V7 SQL timing steps were small (the slowest recorded step was 133 ms); this was not a SQL insertion bottleneck.

## Change

Only the private `::performance-test` V7 lab namespace now follows the same bounded active-transaction cache policy as production:

- The full fixture remains the verified V7 SQLite source used for cutover.
- After cutover and on lab startup, the UI receives only the newest 2,000 active transactions.
- The full V7 ledger remains intact. History must obtain older pages from SQLite rather than requiring all rows in React state.
- The lab's active-transaction count is refreshed atomically in the V7 workspace state and workspace entity whenever a V7 transaction is committed, replaced, voided, or archived.
- Reuse health validates that atomic full-ledger receipt. It cannot mistake the bounded UI cache for the full fixture and cannot trigger a rebuild merely because cached rows are limited.

## Scope and non-effects

- Real workspaces are excluded by the private performance-test namespace guard; their existing V7 behavior is unchanged.
- No database schema, migration, Supabase project, network/sync setting, cloud-identity adoption path, archive source, backup, or restore behavior changed.
- The lab continues to block backup/restore actions by design. Production backup/restore continue to use their canonical SQLite/projection paths, not the lab UI cache.

## Verification

1. `node tests/run-performance-v7-sqlite.cjs .` passed against real SQLite. It proves a bounded cache can reuse the full V7 fixture, then proves a V7 add updates the atomic active-count receipt and still permits safe reuse with a stale bounded cache.
2. `npm.cmd run test:gate:static` passed: **104 passed, 0 failed, 11 skipped**.
3. `npm.cmd run test:gate` passed: **194 passed, 0 failed, 11 skipped**.
4. Manual mutation checks were applied and reverted precisely:
   - Disabled the in-transaction active-count refresh. The real-SQLite test failed (`80 !== 81`) at the active-count receipt assertion.
   - Disabled use of the V7 active-count receipt in reuse health. The real-SQLite test failed with `active_count_mismatch` for a bounded post-add cache.

## Required next evidence

Build a release APK only through CI, install it, and repeat the five transaction saves and five commitment saves on a 50K V7 lab fixture. Accept or reject the performance result from those device measurements only; Node and CI timings are not device-performance evidence.

Phase 15 is not closed by this document.
