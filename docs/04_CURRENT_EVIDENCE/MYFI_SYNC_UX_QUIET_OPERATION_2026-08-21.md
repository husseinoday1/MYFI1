# MYFI — Sync UX quiet-operation patch (2026-08-21)

## Scope and authority

- Local branch at start: `impl/p20-g01-acceptance-apk-2026-08-19`
- Starting local HEAD: `62bbbeb84b796e765043aae74bc3d39efd937700`
- Working tree at start: clean
- Runtime/schema baseline: Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite schema V8 (V7 ledger model).
- This patch changes no Supabase schema, migration, RLS policy, cloud data, or user account. It does not touch Phase 10 backup/restore sources.
- It is intentionally confined to the maintenance presentation policy and sync client state. `App.js`, `dataSlice.js`, and `SettingsScreen.js` are not modified.

## User-visible contract implemented

1. Normal startup/local V8 reads and session resume begin as **silent** maintenance: the write/sync fence remains active, but the mounted UI is not covered by the “Securing financial data” screen.
2. The same fence is promoted to a visible exclusive operation only after the code has established that it is actually going to migrate/cut over SQLite, restore a verified legacy cloud snapshot, or adopt an immutable verified cloud ledger identity.
3. A successful manual no-op sync now records the time the check actually completed on that phone. It does not write a dummy update to Supabase merely to refresh the displayed time.
4. Automatic post-save sync waits for a 1.2 second quiet period; consecutive completed saves coalesce into one scheduled attempt. Existing forms persist only on their explicit save/confirm path, so editing a draft does not itself create a sync job.

## Supabase/resource effect

- A clean manual pull remains available: it may receive changes from another device, but does not perform an empty compatibility snapshot write just to refresh a timestamp.
- Existing bounded retry/backoff remains unchanged. This patch adds no polling loop, full-table read, unbounded retry, or background cloud write.
- The only visible change to sync time is local device state; `user_data.updated_at` retains its existing meaning as cloud-data modification time.

## Verification performed locally

- `node tests/run-p19-015a2-maintenance-startup-barrier.cjs .` — passed, including silent-to-visible promotion.
- `npm.cmd run test:gate` — **92 passed, 0 failed, 11 environment-required skips**.
- No APK built, installed, signed, published, committed, or pushed in this patch state.

## Deliberately still open

The quiet period prevents a save-triggered sync from running between closely spaced completed edits. A separate UI interaction-hold layer is still needed before claiming that automatic sync waits for **every** open editor/modal across all screens. It should be added only after a focused inventory of edit surfaces, so an incomplete flag cannot accidentally leave synchronization paused forever.

## Phase-boundary note for Claude

This is a UX/scheduler correction around the existing Phase 9 V2 protocol. It does not reopen Phase 9, alter its integrity evidence, or implement any Phase 10 restore engine step. Phase 10 remains: four early foundations delivered (canonical read, semantic hash, strict structural validation component, consistent read snapshot); canonical writer/decoder integration, atomic restore promotion/proofs, recovery coordination, undo, and real-device performance acceptance remain open.
