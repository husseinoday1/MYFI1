# MYFI — Implementation 2 (Phase 11) handoff → Implementation 2b

**Date:** 2026-08-27
**Branch:** `impl2/phase11-archive-consolidation-2026-08-27`
**HEAD:** `17bc80f feat(archive): Phase 11-C / D5 - derive archived-year totals and gate the switch`
**Upstream:** in sync, `0/0`. Nothing of mine is unpushed. Working tree clean.
**Worktree:** `C:\Users\husse\MYFI-Implementation2-Phase11` — isolated. Do **not**
touch `C:\Users\husse\OneDrive\Документы\MYFI`; a separate design session works there.
**Gate at handoff:** `npm run test:gate` = **129 passed, 0 failed, 11 skipped**.

## 1. Read this first — two of my own earlier statements were wrong

Both are corrected in the evidence file, but a successor skimming the commit log
would otherwise re-derive them as dead ends.

**(a) F5 as first written was wrong.** I first recorded "there is no
posting-derived balance query anywhere in V7". False.
`queryLedgerWalletPositions` sums `ledger_postings_v7` with no archive predicate
— posting-derived and ALL-scoped. The real defect was that `HomeScreen.js` called
it (and three siblings) **without importing them**, so it threw `ReferenceError`
on every run and the screen silently fell back to the hot in-memory array.
Corrected in §5 of the scoping file; the import defect is fixed in `12d532c`.

**(b) The approved F1 plan did not solve F1.** Planning approved "complete the
`openingBalanceMode: 'ledger'` migration, then F1 removal follows". On
re-examination *before writing code*, that is wrong. F1 is not about how the
opening balance is represented; it is about `commitYearArchive` **deleting the
archived year's transactions from the hot array**. Any representation still has
to compensate for the deletion — today via a rewritten `openingBalance` (breaks
§73 "opening balance"), under ledger mode via the opening transaction's own
amount (breaks §73 "transaction amount", *worse*). Completing that migration
relocates the compensation; it does not remove it.

Removing it requires archiving to stop deleting, which requires balances to stop
being read from the hot array. Recorded in §8 of the scoping file. Planning
accepted this and split the remaining work into **Phase 11-C**.

## 2. What shipped

Phase 11 is **CLOSED**. Every commit below is pushed with a named green CI run.

| Increment | Commit | CI run |
|---|---|---|
| 11-A — §74 scope contract, §3.5 freeze, §72 dead-code removal, §75 declaration | `5916f67` (+ merge `1781d71`) | `33057163679` |
| 11-B — parity harness, HomeScreen balance source, F6 removal on both paths | `12d532c` | `33059784018` |
| 11-C step 1 — V6 posting-derived balance query | `d64b1a6` | `33079096555` |
| 11-C / D3 — F1 repair plan | `6944d64` | `33154074528` |
| 11-C / D5 — archived-total derivation + parity gate | `17bc80f` | `33154458563` |

Full detail: `docs/04_CURRENT_EVIDENCE/MYFI_PHASE11_ARCHIVE_CONSOLIDATION_SCOPING_2026-08-27.md`,
sections 6–11. Read §8 (Phase 11 closure and the 11-C split) before planning anything.

New modules, all with **no repair path by design** (D3 / A0 §5 / `src/lib/CLAUDE.md`
"never auto-correct balances") and all with an amount-free
`summarize*ForDiagnostics` for Standing Rule 6:

- `src/lib/archiveScope.js` — ACTIVE / ARCHIVED / ALL, no default; omitting throws.
- `src/lib/archiveCommitFreeze.js` — the §3.5 interlock. **Flipping
  `ARCHIVE_COMMIT_FROZEN` to false is how 11-C step 3 unfreezes archiving.** Do not
  flip it before F1 is actually gone.
- `src/lib/archiveBalanceParity.js` — legacy vs canonical balance, per wallet.
- `src/lib/archiveF1RepairPlan.js` — what to repair for already-archived users.
- `src/lib/archiveSummaryDerivation.js` — archived-year totals from the ledger + the
  stored-vs-derived gate.

## 3. Three hazards that will bite a successor who does not know them

**(a) The D3 opening-balance repair is NOT idempotent.** Debt and goal repairs are
— a restored payment is already in the list on a second pass. But `openingBalance`
carries no marker recording whether the archived movement was already subtracted,
so a repaired wallet is **indistinguishable** from a damaged one, and applying the
plan twice subtracts twice. Asserted explicitly in
`tests/p11c-d3-repair-plan.test.mjs`. Any real application of the plan must record
a per-workspace applied-state and refuse to run again. This is the concrete reason
D3's "recorded applied-state" is a requirement, not ceremony.

**(b) `queryLedgerWalletPositions` needs `defaultWalletId` on the V6 branch.** A V6
transaction can carry `wallet_id IS NULL`, and the legacy calculation attributes it
to the workspace default (`tx?.walletId || safeDefault`). Omitting the parameter
falls back to the first wallet by id, which is the same wallet only when the user
never chose a different default. **Every consumer migrated in step 2 must pass
`cfg.defaultWalletId`.** Noted at the call site.

**(c) Scope filters wallets, never movements.** Both the V6 and V7 branches filter
which *accounts* are returned but sum *every* movement on them. A movement labelled
with another scope still moved real money in that wallet. This is a deliberate
difference from the in-memory path (where callers pre-filter the transaction array
and a cross-scope transfer can go uncounted), documented in code and pinned by a
test. Do not "fix" it to match the legacy path without re-opening the decision.

## 4. What is blocked, and on what

Nothing below is blocked on missing work — it is blocked on things outside this
session's control.

| Item | Blocked on |
|---|---|
| 11-C step 2 — migrate balance consumers | the design track settling **and** the device gate |
| F1 removal + §3.5 unfreeze | step 2 |
| Applying the D3 repair | a recorded applied-state (§3a) + device acceptance |
| Switching report totals to derived | a clean parity run on real data + device acceptance |

**The recorded consumer list is already stale.** The design branch
`fix/p00-tc-001-contract-baseline-reconciliation` is 56 files / +4320 lines: it
rewrites `HomeScreen.js` (+498), rebuilds `OnboardingScreen.js` (+700) and adds six
screens, one of which (`MyMoneyScreen.js`) reads the legacy in-memory balance in
**four more places**. Step 2 must **re-survey**, not trust §8.2 of the scoping file.

**Watch the merge.** That design branch still carries the missing-import defect
fixed in `12d532c` (their `HomeScreen.js` lines 220/226/228 use
`getLedgerNamespace` / `queryLedgerSummary` / `queryLedgerWalletPositions` without
importing them). If the eventual `HomeScreen.js` conflict resolves in their favour,
the defect returns and the Home balance silently reverts to the hot array — with no
test failure, because the fallback is a legitimate code path. Planning & Audit has
warned the design session; verify it after the merge regardless.

## 5. Device acceptance is already due — on what is pushed

This is the part most likely to be missed. `12d532c` **already changed which source
produces the Home wallet balance** for V7-cutover users: before it, the SQL block
always threw and fell back; now it runs. That risk is in flight today, independent
of step 2.

An APK build was dispatched (`gh workflow run p10-014a-normal-apk.yml --ref <branch>`
— that workflow has no source-scope guard and builds a normal signed release) and
then cancelled by the user, who chose to wait for the design work to land. When it
resumes:

```
gh run download <run-id> --name MYFI-P10-014A-normal-release --dir ./apk
adb install -r ./apk/app-release.apk
```

The question to answer on device is narrow: **do the wallet balances on Home read
the same as before?** They should — that is what the parity harness and the V6
query test both assert — but "should" is not "verified on real data", which is the
whole point of the gate.

## 6. Working agreements in force

- **Planning & Audit 2** is the routing partner. Session names change on every
  restart; use `ListAgents` and confirm the role before sending anything. I
  misrouted once and corrected it by asking first — do the same.
- Planning **cannot** relay push approval. Commit and push need the user's explicit
  approval in their own chat, every time.
- Every fix in this phase was verified with a real **negative control**: break the
  code deliberately, confirm the test fails, restore the file. Local green plus a
  clean review is necessary but not sufficient — Standing Rule 5 needs a named green
  CI run id, and `ci-test-gate.yml` (added this phase, on `impl/**`, `impl2/**`,
  `docs/**`, `planning/**`, `chore/**`) provides it.
- The user asked for **token economy**: short reports, no restating known context.
  That does not reduce the verification floor for financial code.

## 7. Known non-blocking debt

- `tests/financial-core.test.mjs:1166` now passes **vacuously**: the §3.5 freeze
  returns false before the SQLite-availability path the assertion claims to test.
  Coverage returns when the freeze lifts — whoever lifts it must re-verify that
  assertion rather than trust a green result.
- GitHub warns `actions/checkout@v4` / `setup-node@v4` target the deprecated Node 20
  and are being forced onto Node 24. Green today; a `@v5` bump is small maintenance.
  Planning has it logged as low priority.
