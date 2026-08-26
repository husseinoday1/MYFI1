# P18-017 — Controlled Device Recovery

Date: 2026-08-17
Status: REAL-DEVICE RECOVERY PASS

## Scope

Recovered only the proven accidental deletion cluster in the active V7 ledger.
The inactive account deletion cluster was intentionally NOT touched.

## Guard / Preconditions

- SQLite quick_check before: ok
- SQLite user_version: 7
- V7 source mode: sqlite
- Target transaction tombstone timestamp: 2026-08-17T03:29:15.291Z
- Target entity tombstone timestamp: 2026-08-17T03:29:15.322Z

## Recovery

- Transactions restored: 22
- Entities restored: 10
- Entity distribution: {"commitment":5,"debt":2,"goal":2,"wallet":1}
- Recovery upsert mutations queued: 32

## Before / After

- Transactions active: 2 -> 24
- Transactions deleted: 44 -> 22
- Entity tombstones: 10 -> 0
- Postings: 49 -> 49

## Safety

- Transaction IDs preserved.
- Posting rows unchanged.
- Account rows unchanged.
- Exchange-rate rows unchanged.
- Link rows unchanged.
- Amounts, currencies, dates, titles, FX values and historical financial payloads were not recalculated.
- Other namespaces unchanged.
- No cloud/Supabase sync was invoked by recovery mode.
- SQLite schema unchanged; no migration.
- SecureStore untouched.

## Next

Do not run normal cloud sync yet. Perform a post-recovery read-only device verification first.
