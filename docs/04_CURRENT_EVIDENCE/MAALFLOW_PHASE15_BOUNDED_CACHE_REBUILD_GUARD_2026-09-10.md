# Phase 15 — bounded-cache rebuild guard

**Date:** 2026-09-10
**Status:** code verification complete; CI and release-device remeasurement pending. Phase 15 remains open.

## Device evidence that invalidated the previous 50K run

The release APK at commit `6557e61` was installed and a 50K lab run was attempted. Diagnostics generated at `2026-09-10T00:26:13.661Z` reported:

- `performanceLabAttempt.phase`: `post_cutover_health`
- `reason`: `financial_v7_cutover_health_failed`
- `issueCodes`: `active_count_mismatch`

The app failed closed. The V7 cutover was not accepted, so the five transaction and five commitment samples from that run are **not Phase 15 performance evidence**. They must not be compared to the earlier 50K results or used to close §96/§98/§100.

The recorded values explain why this matters: the add-operation trace still spent a median 16,303 ms of a 16,405 ms transaction in `save_local`, and a median 9,662 ms of a 9,686 ms commitment in `save_local`. That was the old full-cache behavior, not an accepted bounded-V7 lab state.

## Root cause

The preceding bounded-cache change intentionally persisted only the newest 2,000 transactions for the lab UI. Startup first runs a non-mutating V7 reuse proof. When that proof failed, the fallback attempted a destructive lab rebuild using the bounded persisted snapshot plus cold archives.

That snapshot is not a complete rebuild source: active transactions outside the 2,000-row UI cache are neither present in it nor necessarily in cold archives. The active-count health guard caught the inconsistency rather than permitting a silent data loss/rebuild. This is the desired failure mode.

## Fix

The startup fallback now:

1. regenerates the selected deterministic, complete isolated performance fixture;
2. passes its full active rows and regenerated archive rows to the isolated V7 operational cutover;
3. forces the authorized replacement only with that complete source; and
4. on either a successful reuse **or** successful rebuild, rehydrates Zustand from V7 with the same 2,000-row query cache.

No real workspace can take this branch: it occurs only after the existing performance-snapshot and `demoMode`/`performanceTestMode` guards. No Supabase, sync, archive-source, backup, restore, migration schema, or cloud-identity behavior changed.

## Verification

- Real SQLite 50K lab run: `MAALFLOW_TEST_TIERS=50000 node tests/run-performance-v7-sqlite.cjs .` passed.
- Full gate: `npm.cmd run test:gate` passed — **195 passed, 0 failed, 11 skipped**.
- Mutation checks were applied and reverted exactly:
  - Replaced `workspace: regeneratedDemo` with the bounded `workspace: loadedDemo`; the cutover contract failed immediately.
  - Restored the old `alreadyCutover`-only cache hydration condition; the cutover contract failed immediately.

## Required next evidence

Build only through CI, install the resulting release APK, activate 50K, reset all performance samples, then repeat five transactions and five commitments. The resulting Diagnostics evidence must show an accepted V7 cutover before any performance number is accepted.
