# MYFI P20-G01 — new-account wallet shadow-parity defect blocks V7 cutover for any fresh account

Date: 2026-08-20
Produced by: MYFI Testing & Release session
APK: CI build, commit `2d42b63`, SHA-256
`58eb01e0c896acc7921f5a97a2bec22e85d31dd3d538ff74fcc0afcc5fde571e`
(verified via `gh run view 32310400149` — status completed, conclusion
success — before use, per the new "verify the CI run, don't assume" rule).

## Finding

This build finally surfaces the `diagnostics` object Implementation asked
for (`storeCounts`/`sqliteCounts`/`cutoverKeyPresent`) — the D1 fix landed.
It answers the original question directly: **not a benign edge case, a real
reproducible defect.**

Brand-new, genuinely disposable/empty account (`husenaudi73@gmail.com` was
tried first — turned out to already exist and be the P20-G01-D2 diagnostic
session's consumed/split-state account from 2026-08-19, unrelated new
signup — abandoned in favor of a fresh email, `pannen337@gmail.com`, never
used before). Gate pressed twice, ~5 minutes apart, with an add-then-delete
transaction round-trip in between (to rule out "just needs a sync tick"):

**Press 1** (immediately after account creation, sync status not yet run):
```json
"ledgerError": null,
"financialLedgerV7Ready": true,
"migration": {"ok": false, "reason": "shadow_parity_failed"},
"storeCounts":  {"wallets": 1, "trans": 0, "debts": 0, "goals": 0, "commitments": 0},
"sqliteCounts": {"wallets": 0, "trans": 0, "debts": 0, "goals": 0, "commitments": 0}
```

**Press 2** (after creating and deleting one transaction, confirmed synced —
Settings row showed a real "last sync" timestamp, not "not yet synced"):
```json
"ledgerError": "shadow_parity_failed",
"financialLedgerV7Ready": false,
"migration": {"ok": false, "reason": "shadow_parity_failed"},
"storeCounts":  {"wallets": 1, "trans": 0, "debts": 0, "goals": 0, "commitments": 0},
"sqliteCounts": {"wallets": 0, "trans": 0, "debts": 0, "goals": 0, "commitments": 0}
```

Identical wallet mismatch both times: the client-side store has 1 wallet
(the default wallet every new account gets), SQLite has 0. Transaction sync
completing between presses had no effect on this — the wallet record
specifically never lands in local SQLite for this account, regardless of
what else syncs successfully.

## Source pointer

`src/dev/p19RestoreEpochDeviceGate.js`:
- line 54: builds the store-side wallet snapshot from `state?.wallets`
- line 135/140/145/150: builds `storeCounts`/`sqliteCounts` by comparing
  `state?.wallets` against `localWorkspace?.wallets`
- the `shadow_parity_failed` reason is the migration/cutover check's verdict
  when these disagree

Not investigated further — finding where the default wallet is created
client-side and why it never gets persisted to the SQLite workspace for a
fresh account is Implementation-level work.

## Why this matters beyond P20-G01

If this reproduces for any brand-new account (not just this one — two
different fresh accounts today, `husenaudi73@gmail.com`'s creation and
`pannen337@gmail.com`, both landed in a similar state, though the first was
abandoned before a clean second reading), **no fresh account can ever pass
V7 cutover**, which would block P20-G01 items 6–10 indefinitely regardless
of how many new test accounts are created — this is not a test-account
hygiene problem, it looks like a genuine onboarding defect.

## Per the new consecutive-run rule

Planning & Audit's new standing rule requires counter/epoch-related fixes to
be verified across two consecutive runs before acceptance. This defect
itself was observed consistently across two consecutive presses on the same
account (documented above) — the reproducibility is already established.
What's not yet known is whether this affects every fresh account or just
these two.

## Next

Not something Testing & Release can work around from the UI — recommend
Implementation trace why a fresh account's default wallet exists in
client-side store state but is never written to the local SQLite workspace.
Testing & Release is standing by to re-run once a fix is confirmed by CI.

No commit/push yet — pending confirmation this file should go out as-is.
