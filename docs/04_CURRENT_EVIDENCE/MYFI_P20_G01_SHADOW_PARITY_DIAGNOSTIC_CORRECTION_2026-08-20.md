# MYFI — the "wallet never reaches SQLite" reading is a diagnostic artefact, not a defect

Date: 2026-08-20
Produced by: MYFI Implementation session
Responds to: `MYFI_P20_G01_WALLET_SHADOW_PARITY_DEFECT_2026-08-20.md`
Status: conclusion corrected; the real blocker is identified but **not yet root-caused**

## The correction

`storeCounts.wallets: 1` against `sqliteCounts.wallets: 0` is **what a healthy
pre-cutover account looks like**. It is not evidence that the default wallet fails to
persist.

`runFinancialShadowMigrationV7` (`src/lib/financialLedgerV7Migration.js:446`) stages the
projection into a *separate* namespace:

```js
const stageNamespace = `${namespace}::shadow-stage::v7`;
```

and calls `discardFinancialWorkspaceStageV7({ stageNamespace })` on **every** exit path —
parity failure (`:477`), parity success (`:487`), and the catch (`:522`). The comment at
`:483` states the intent outright: a successful shadow comparison must not make SQLite
operationally authoritative; that belongs to cutover.

So before cutover the real namespace's V7 workspace is *supposed* to be empty.
`readFinancialWorkspaceV7` — which is what the gate's `sqliteCounts` reads — returns 0
for every entity type, wallets included. Nothing is being lost.

This misreading is my fault, not the Testing session's. The D1 diagnostics printed
`storeCounts` and `sqliteCounts` side by side with no indication that they are not
supposed to agree at that stage. A reasonable reader compares them. The gate now emits
`sqliteCountsComparableToStore`, false until cutover, with the reason stated in the
code.

## What is actually blocking

The real signal was in the same payload and it is `migration.reason:
"shadow_parity_failed"`. That verdict is produced by comparing thirteen metrics between
the source projection and the staged read-back, and the failure return carries exactly
what diverged:

```js
return {
  supported: true, ok: false, reason: 'shadow_parity_failed',
  sourceChecksum, targetChecksum, differences,     // <- the answer
  sourceCounts: projection.metrics, targetCounts: targetMetrics,
};
```

The D1 diagnostics recorded only `reason` and dropped `differences`, `sourceCounts` and
`targetCounts` on the floor. That omission is what forced the guessing. Fixed: the
BLOCKED payload now carries all of them.

**Nothing here says the defect is not real.** A fresh account genuinely cannot cut over,
and that genuinely blocks items 6–7. What changed is that "the wallet never reaches
SQLite" is not the mechanism, and chasing the wallet-persistence code would have been
wasted work.

## Money is not logged

Three of the compared metrics — `walletBalances`, `currencyBalances`, `monthlyTotals` —
are maps of real amounts, and `blockedDiagnostics` runs on the deliberate refusal
against the user's **real** account too. Reporting differences verbatim would have
written the user's balance history into a device log that gets copied between sessions.

Non-scalar metric values are therefore summarised to a shape descriptor
(`{type: "object", keys: N}`); scalar counts are reported as-is. The diverging metric
stays identifiable, the amounts never leave the app. Found by `/code-review` on this
change, before the push.

## What the next device run answers

One press of the gate on the fresh account now returns, inside `diagnostics.migration`:

- `differences[]` — which of the thirteen metrics diverged
- `sourceCounts` / `targetCounts` — the count metrics on both sides
- `sourceChecksum` / `targetChecksum`

That names the mechanism directly. My own leading suspicion, **unverified and not to be
acted on**: with zero transactions the projection produces no commands, and a wallet
whose opening balance is zero produces no synthetic opening transaction either
(`financialLedgerV7Migration.js:363` skips on `if (!residualMinor) continue`), so the
staged read-back may legitimately contain nothing to compare a wallet against. Whether
that makes `entities` or `walletBalances` diverge is exactly what `differences` will
say. Do not pre-commit to it.

## Verification

```text
npm run test:gate ....... 81 passed, 0 failed, 11 skipped
p20-g01 contract ........ PASS
verify:android .......... OK
/code-review ............ 1 finding, fixed before push
```

Phase 9 remains OPEN. Items 6–10 remain unmet.
