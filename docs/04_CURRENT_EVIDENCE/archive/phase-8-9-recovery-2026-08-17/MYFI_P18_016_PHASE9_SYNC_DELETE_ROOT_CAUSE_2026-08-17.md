# P18-016 — Phase 9 Sync Delete Root Cause

Date: 2026-08-17
Status: ROOT CAUSE CONFIRMED / GUARD IMPLEMENTED

## Real-device evidence

P18-015R2 read-only audit proved:
- SQLite quick_check = ok
- schema user_version = 7
- active account namespace retained the affected rows as V7 tombstones/voids
- a large group of transactions and financial entities received the same deletion timestamp during account lifecycle/sync activity
- another account namespace also showed a same-timestamp void batch with pending outbox void mutations

No P18-015 audit write, migration, SecureStore change, or cloud sync occurred.

## Root cause

After V7 operational cutover, syncCloud still ran the legacy user_data snapshot merge as a financial PULL path.

The legacy three-way merge interprets record absence as deletion.
reconcileFinancialWorkspaceV7 then interprets records missing from the desired snapshot as missingIds and calls voidFinancialTransactionsV7. Missing entities are emitted as deleted_at changes.

Therefore an incomplete/stale user_data snapshot could transform omission into real local V7 void/delete mutations.

## P18-016 policy

After V7 cutover:
1. Financial remote changes are accepted only through sync_financial_mutations_v1 explicit mutations/tombstones.
2. Mutation sync failure does not fall back to financial snapshot pull.
3. user_data snapshot becomes compatibility mirror output only.
4. A cloud snapshot is accepted as already-synced only when it equals the full V7 projection.
5. If snapshot differs, the full V7 projection is pushed to compatibility snapshot storage.
6. Any future attempt to call installCanonicalState as a V7 snapshot pull fails closed with financial_v7_snapshot_pull_forbidden.

## Recovery separation

P18-016 does NOT restore device rows.
Recovery must be a separate controlled operation after this guard passes, targeting only the proven accidental deletion cluster. Earlier deliberate user deletions must remain deleted.
