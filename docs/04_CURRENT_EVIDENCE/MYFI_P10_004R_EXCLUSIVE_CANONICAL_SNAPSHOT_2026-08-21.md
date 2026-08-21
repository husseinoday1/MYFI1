# MYFI — P10-004R: exclusive canonical SQLite snapshot

**Recorded:** 2026-08-21T10:06:46+03:00  
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**Starting SHA:** `83e32a703c3a169823bb19e4caebb363f35ba0d3`  
**Runtime:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`  
**Financial schema:** V8 / V7 ledger model  
**Cloud impact:** none — no Supabase request, schema change, or user-data change.

## Why P10-004 was reopened

The prior canonical reader used Expo SQLite `withTransactionAsync`. Expo documents
that this transaction is **not exclusive**: unrelated asynchronous queries can enter
it. Therefore it could not prove a point-in-time financial graph, even though MYFI's
own write queue serialised its known writers.

The repair uses `withExclusiveTransactionAsync` through the existing shared queue.
The callback receives Expo's transaction-scoped handle, and every ledger, identity,
workspace, and cold-archive query receives that exact handle. This avoids certifying
a torn graph assembled around an unrelated query.

## Scope of the repair

- `runLedgerReadTransaction` now fails closed unless the native exclusive API exists.
- Cold archive read helpers optionally take an already-warmed database/transaction
  handle; normal archive callers retain the existing default behaviour.
- Three read-only V7 repository readers accept `schemaReady: true` only after their
  schema was warmed before the transaction. This prevents a queued migration attempt
  from re-entering the queue while the snapshot owns it.
- `readCanonicalBackupSource` passes the transaction handle to all four canonical
  source families. It still refuses a caller-supplied database for the not-yet-defined
  restore-stage namespace contract.

No financial rows are written, no SQLite schema is changed, and the legacy backup
export/import path is not yet switched to the canonical reader.

## Verification

1. `node tests/run-p10-004-consistent-canonical-read.cjs .`
   - confirms exclusive transaction requirement;
   - proves the callback receives a distinct transaction handle;
   - proves ledger, identity, workspace, and archives all use that handle;
   - checks queue order, failure release, missed-warmup refusal, and two consecutive
     reads.
2. `npm.cmd run test:gate`
   - **94 passed, 0 failed, 11 environment-dependent skips.**
3. `git diff --check` passed.

## Boundary and next work

This completes **P10-004R only**, not Phase 10. The next required item is P10-005:
semantic projection V2, because semantic V1 does not yet cover every field promised
by the final restore package. No cloud-linked restore or device acceptance is enabled
by this change.

## Sources

- Expo SQLite transaction API: <https://docs.expo.dev/versions/v55.0.0/sdk/sqlite/>
- SQLite WAL snapshot isolation: <https://www.sqlite.org/isolation.html>
