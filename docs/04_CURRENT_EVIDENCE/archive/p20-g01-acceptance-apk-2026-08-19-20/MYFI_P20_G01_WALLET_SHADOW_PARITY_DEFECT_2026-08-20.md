# MYFI P20-G01 — shadow_parity_failed root cause: checksum mismatch, not count mismatch

Date: 2026-08-20
Produced by: MYFI Testing & Release session
APK: CI build, commit `1ffa382` ("P20-G01 report what shadow parity actually
compared, and stop money leaking into it"), SHA-256
`7480fee2e841ec0af758080fe735347977fb2180d096bcba40ded00f14a1ecab` —
verified via `gh run view 32313773182` (completed/success) before use, and
verified installed-on-device via `adb pull` + hash match after install.

## RETRACTION of the previous write-up in this file

The earlier finding in this file ("wallet never reaches SQLite,
storeCounts.wallets:1 vs sqliteCounts.wallets:0 is the defect") was
incorrect per Implementation: the shadow-migration staging area is a
separate namespace (`::shadow-stage::v7`) that gets cleared on every exit
path, so the real workspace being 0/empty pre-cutover is the **healthy**
state, not a defect. The old diagnostic build printed `storeCounts` next to
`sqliteCounts` with no indication they weren't meant to match, which invited
the wrong conclusion. This build adds `sqliteCountsComparableToStore: false`
to make that explicit. Retracted, not deleted, so the false lead and its
correction are both on record.

## The real finding: single clean gate press, fresh account, full diagnostics

Account: newly created `pannen337@gmail.com` (workspace
`user:0f5384a8-d22f-4996-a474-816ca81260e9`), financially empty, single gate
press (per Implementation's explicit request — one press only, this round is
about reading `diagnostics.migration.differences`, not re-establishing
reproducibility).

```json
"reason": "disposable_financially_empty_account_required",
"blockers": ["financial_v7_cutover_required"],
"diagnostics": {
  "ledgerError": "shadow_parity_failed",
  "migration": {
    "ok": false,
    "reason": "shadow_parity_failed",
    "differences": [
      { "field": "checksum", "source": "fnv1a32:cffb5d15:3834", "target": "fnv1a32:0ca69208:3819" }
    ],
    "sourceCounts": {
      "activeTransactions": 0, "archivedTransactions": 0, "syntheticTransactions": 0,
      "totalLedgerTransactions": 0, "postings": 0, "links": 0, "entities": 10, "wallets": 1,
      "walletBalances": {"type":"object","keys":1},
      "currencyBalances": {"type":"object","keys":1},
      "monthlyTotals": {"type":"object","keys":0}
    },
    "targetCounts": { "<identical to sourceCounts in every field>": true },
    "sourceChecksum": "fnv1a32:cffb5d15:3834",
    "targetChecksum": "fnv1a32:0ca69208:3819"
  },
  "storeCounts": {"trans":0,"debts":0,"goals":0,"commitments":0,"wallets":1},
  "sqliteCountsComparableToStore": false,
  "sqliteCounts": {"trans":0,"debts":0,"goals":0,"commitments":0,"wallets":0}
}
```

(`walletBalances`/`currencyBalances`/`monthlyTotals` correctly redacted to
`{type, keys}` shape per the new no-money-in-evidence-files rule — confirms
that fix landed too.)

## What this actually shows

**`sourceCounts` and `targetCounts` are identical in every single field** —
same entity count (10), same wallet count (1), zero transactions on both
sides. The migration/cutover check is not failing on a count mismatch at
all. It's failing purely on **checksum**: `fnv1a32:cffb5d15:3834` vs
`fnv1a32:0ca69208:3819` — different hash *and* a different trailing length
figure (3834 vs 3819), meaning the two sides' serialized representations
differ by content, not by what's counted.

This means some field's *value* (not presence/count) differs between the
shadow-staged copy and the real workspace — e.g. a timestamp, an ID, a
balance representation, or key ordering feeding into the checksum
differently. Which specific field is not exposed by this diagnostic (it
reports counts and a whole-payload checksum, not a per-field diff) —
identifying it needs Implementation to look at what
`sourceChecksum`/`targetChecksum` are computed over.

## Incident during this round (no data-safety issue, but worth recording)

Before capturing the clean read above, one gate press was mistakenly fired
while the device was still logged into the old **consumed** test account
(`user:0c9600f3-...`, previously flagged by Implementation as "should be
treated as consumed and not reused"). That press produced
`[P20_G01_RESTORE_EPOCH_GATE_FAIL]` with `serverAdvanced: true,
localEpochCommitted: true, splitStateRequiresRecovery: true`, advancing that
account's epoch from 2 to 3 and deepening its already-split state.
`financialDataChangedByGate` stayed `false` throughout. Since that account
was already marked not-for-reuse, no new consequence follows — noted here
only so nobody mistakes epoch 3 on `0c9600f3` for a fresh signal later. That
account remains fully abandoned.

## Next

Implementation: identify which field feeds the checksum difference between
shadow-stage and real workspace for a fresh, empty account — the counts
prove it isn't a missing/extra record, so the diff is almost certainly in a
value (timestamp, generated ID, or serialization order) rather than data
loss. Testing & Release is standing by for the next diagnostic build or fix.
