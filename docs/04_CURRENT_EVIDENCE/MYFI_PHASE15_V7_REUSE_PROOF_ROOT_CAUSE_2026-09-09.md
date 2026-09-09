# MYFI — Phase 15 V7 50K startup reuse-proof root cause

Date: 2026-09-09
Status: **root cause confirmed on the physical Android device. The first index
APK was fail-closed by an immutable-migration checksum guard; the corrected
append-only migration is locally verified and awaiting CI/device retest.**

---

## Device evidence

The isolated V7 performance namespace successfully held the 50,000-transaction
tier. A cold restart on the release APK built from `327c176` measured 89,438 ms
until React was told to render. The timing record contains duration only and no
financial values.

| Reuse-proof step | Device duration |
|---|---:|
| Read V7 workspace state / schema readiness | 194 ms |
| Invalid-date proof | 6 ms |
| **Missing-posting proof** | **76,435 ms** |
| **Transfer-leg proof** | **9,798 ms** |
| Posting-currency proof | 15 ms |
| Active-count proof | 12 ms |
| Outbox proof | 1 ms |
| Wallet-reference proof | 54 ms |
| Full V7 workspace read | 130 ms |
| React state hydration from V7 | 30 ms |

The first two bold rows account for 86,233 ms of the 89,438 ms startup. The
V7 read itself is not the bottleneck.

## Root cause, proved from the actual query plan

Both slow proofs join `ledger_postings_v7` to its owning transaction by:

```sql
p.namespace = tx.namespace AND p.transaction_id = tx.id
```

Before remediation, the only postings secondary index was
`(namespace, account_id, bucket, transaction_id)`. SQLite's real
`EXPLAIN QUERY PLAN` therefore reported a correlated subquery search using that
index only by `namespace`; it could not seek the requested `transaction_id`.
The missing-posting proof consequently rescanned postings for each transaction.

This is not an estimate: adding `(namespace, transaction_id)` changes the same
plan to a seek on both `namespace` and `transaction_id`.

## Remediation and migration-history correction

The first remediation commit, `16e8972`, added schema migration
`0013_posting_transaction_index`:

```sql
CREATE INDEX IF NOT EXISTS idx_ledger_v7_posting_transaction
  ON ledger_postings_v7(namespace, transaction_id);
```

The index itself is additive only. It changes no transaction, posting, payload,
cutover rule, health criterion, or cloud behavior. It serves both the
missing-posting anti-join and the transfer-leg join while preserving their full
proof scope.

That APK was intentionally rejected on the device before the lab loaded:
`financial_schema_migration_checksum_mismatch:0012_archive_recovery_stage_rows`.
The cause was a migration-authoring mistake: making the new global schema
constant 13 also changed migration 0012's `toVersion` from its historical 12.
The migration journal correctly detected that rewrite and failed closed; no
50K ledger data was altered and the 423 ms timing from that failed launch is
not performance evidence.

The correction pins migration 0012 permanently to version 12 and appends 0013
as the sole 12 -> 13 step. A real SQLite compatibility test seeds a completed
V12 journal row using the historical checksum, then proves that it accepts V12
unchanged and creates the V13 index. A mutation changing V12's version again
fails with the exact checksum-mismatch error observed on device.

`tests/run-performance-v7-sqlite.cjs` now runs the actual SQLite query plan and
fails unless it selects this index. A deliberate mutation that removed the
0013 migration made that test fail immediately. Local gates before push:

- static: 96 passed, 0 failed;
- runtime: 90 passed, 0 failed;
- real SQLite performance-lab fixture: passed.

## What remains open

The final device retest of the same 50K dataset is required after the corrected
CI release APK is available. §96 and §98 remain open until that result is
recorded. §100 (100K) must not be run until 50K cold startup is acceptable.

The earlier `active_count_mismatch` seen during a 25K attempt is separate from
this performance root cause and is not treated as resolved by this index. It
must be reproduced or explicitly ruled out before Phase 15 is closed.
