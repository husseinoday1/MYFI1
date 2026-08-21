# MYFI — P10-011: post-commit reload and crash recovery

**Recorded:** 2026-08-21T13:57:27+03:00
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`
**Verified remote/HEAD:** `37868db1136088971cc8b52f6c1ccf0f6e67b3a3`
**Freshness check:** `git fetch --all` completed before this record; the branch remote resolves to the SHA above.
**Implementation commit:** `6e3533a` (`feat(phase10): add post-commit restore recovery`), created locally atop that SHA.
**Working state:** the implementation is committed locally. It is not pushed, CI-accepted or Phase-closed yet.
**Runtime / schema:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite V8 / ledger model V7.
**Data/schema/cloud impact:** no device database or user data was opened, no migration/table meaning changed, and no Supabase request/schema/data operation occurred.

## P10-010 review conditions resolved first

1. P10-010 now returns the underlying classified failure message instead of replacing
   every non-P10 message with `canonical_restore_promotion_failed`. This preserves a
   local epoch CAS race, SQLite constraint rejection or storage failure for the safe
   recovery owner. The module neither logs nor appends financial payload to that
   message.
2. Manifest counts now require the complete, exact V11 count-key set. An empty `{}`
   is rejected before a transaction starts; a true empty ledger carries all required
   keys with zero values. The key set lives with the V11 writer, avoiding a second
   drifting count contract.

The P10-010 operational test proves both changes: empty counts cannot mutate SQLite,
and an injected `restore_epoch_local_compare_and_swap_failed` remains observable while
the complete database rolls back unchanged.

## P10-011 isolated implementation

`financialRestoreRecoveryV11.js` adds two isolated APIs:

- `readCanonicalRestoreRecoveryStateV11()` exposes only the durable recovery signal
  (identity, epoch and reconciliation-required state), never a financial payload.
- `recoverCanonicalRestoreAfterCommitV11()` reads canonical SQLite afresh, verifies
  identity, epoch, V11 semantic hash and complete counts against the promotion state,
  invokes an injected bounded-cache reload adapter only after that proof, then changes
  the durable state from `local_promoted_pending_reload` to
  `local_reloaded_reconciliation_required`.

If the process stops before the final metadata write, the pending state remains and a
later launch safely re-runs canonical verification/reload. If it stops after the
write, re-running is idempotent. No sync begins here; the durable result explicitly
requires reconciliation before P10-012 can coordinate cloud recovery.

There is deliberately no import from Settings, `useSyncSlice`, Zustand or the
maintenance barrier. This code is not reachable from any live restore/import/startup
path yet.

## Runtime restart evidence

`tests/run-p10-011-post-commit-recovery.cjs` runs a real file-backed SQLite fixture:

1. it executes the actual P10-010 transaction against old hot data, a new stage and
   a Cold Archive;
2. it closes and reopens the database immediately after that commit, before any cache
   reload or durable P10-011 state update;
3. it executes the real canonical SQLite source reader and recovery coordinator;
4. it injects a stop after the cache adapter received the new canonical transaction
   but before recovery metadata is written, then closes/reopens and retries; and
5. it proves the retry reaches `local_reloaded_reconciliation_required`, with a second
   invocation remaining idempotent.

The test exercises production promotion SQL, Cold Archive SQL, canonical source
reader and recovery orchestration. Only platform imports and semantic hashing adapters
are replaced for Node SQLite execution; source data never enters test output.

## Verification

- `node tests/run-p10-006-canonical-backup-writer.cjs`: PASS.
- `node tests/run-p10-007-canonical-backup-decoder.cjs`: PASS.
- `node tests/run-p10-008-canonical-restore-stage.cjs`: PASS.
- `node tests/run-p10-010-atomic-local-promotion.cjs`: PASS.
- `node tests/run-p10-011-post-commit-recovery.cjs`: PASS.
- `npm.cmd run test:gate`: **101 passed, 0 failed, 11 environment-dependent skips**.
- `git diff --check`: PASS.

## Remaining gates

P10-011 is not closed: it still needs independent review, pre-push review, push and
confirmed CI. A later, separately reviewed integration must own the maintenance fence,
call the existing bounded-cache loader, present recovery state and keep sync paused.
No APK/device acceptance or live cloud operation is claimed here.
