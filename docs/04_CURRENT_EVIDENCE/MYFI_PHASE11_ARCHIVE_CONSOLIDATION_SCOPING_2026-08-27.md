# MYFI — Phase 11 Archive Consolidation — A0 Reality Scan & Scoping

## Verification provenance (per Evidence Freshness Rule 2026-08-19)

```text
Branch:        impl2/phase11-archive-consolidation-2026-08-27
HEAD:          f47bebdef9609d8fd7293d54bd4ffff2e287a864
Verified at:   2026-08-27T04:54Z
Working tree:  clean (0 modified, 0 untracked)
Expo SDK:      ~54.0.36        React Native: 0.81.5
SQLite schema: V8 (collector), financial ledger V7
Remote check:  git fetch --all executed. Newer remote branches exist but are
               unrelated to Phase 11:
                 origin/main                                            +1 (README only)
                 origin/planning/screen-migration-sequencing-2026-08-26 +2 (design-track docs)
               origin/planning/master-plan-restructure-2026-08-26 IS an
               ancestor of HEAD, so the approved post-Phase-10 phase map is
               included. Base accepted as current for Phase 11.
Authority:     A1 MYFI_MASTER_PLAN_FROZEN.md §71-77 (+ §3.5), unchanged by
               MYFI_MASTER_PLAN_RESTRUCTURE_PROPOSAL_2026-08-26 ("Phases 11,
               12, 13, 15: unchanged from the frozen plan").
Status:        SCOPING ONLY — no code changed. Awaiting Planning & Audit
               ruling on the decisions in section 4.
```

## 1. What §71-77 requires

| § | Requirement |
|---|---|
| 71 | Archive is ledger lifecycle/visibility, **not** Financial Mutation |
| 72 | `archived_at` / `archive_year` (or V7 equivalent); **no duplicate canonical transaction** |
| 73 | Archive must not change: wallet balance, opening balance, transaction amount, FX, debt history, goal totals |
| 74 | Every query declares scope `ACTIVE` / `ARCHIVED` / `ALL`; wallet balance always uses `ALL` |
| 75 | Reports declare scope explicitly; historical totals never change silently |
| 76 | Cold Archive migrates to canonical V7 representation; verify IDs/money/FX/balances; no delete before validation |
| 77 | `Export Archive File` is a separate user artifact, never Source of Truth |
| 3.5 | If current Archive rewrites opening balances or changes financial meaning, it is **frozen until Archive Consolidation** |

## 2. Findings against the live repository

### F1 — Archive is currently a Financial Mutation (violates §71, §73; triggers §3.5)

`src/store/slices/dataSlice.js` -> `commitYearArchive` (lines 545-663):

- **Opening balance rewritten.** Lines 588-591 set
  `wallet.openingBalance = openingBalance + archivedWalletMovement(...)`.
  This is the exact pattern §3.5 names as Dangerous Archive.
- **Debt history rewritten.** Lines 592-600 remove the archived year's
  `debt.payments` and fold them into `debt.archivedPaid`.
- **Goal history rewritten.** Lines 601-609 remove `goal.savings` for the year
  into `goal.archivedSaved` and recompute `goal.cur`.
- **The mutated payloads are then written into V7** as `entityChanges`
  (lines 641-648), so the rewrite propagates into the canonical store's entity
  rows and into the sync outbox.

Consequence: the balance *appears* unchanged only because the movement removed
from the hot transaction array is added back into `openingBalance`. Two of the
six §73 invariants (opening balance, debt history) and arguably a third (goal
totals) are broken by design, not by accident.

### F2 — Four parallel archive representations exist (violates §72)

| # | Representation | Location | Status |
|---|---|---|---|
| 1 | `cold_archive_years` + `cold_archive_transactions` — full transaction copies as JSON, plus `income/expense/net` as SQLite **REAL** (floats) | `src/lib/localArchiveRepository.js` | **LIVE** — written by `commitYearArchive`, read by `ArchiveScreen`, exported into backups |
| 2 | `cfg.archiveSummaries` — per-year float totals | store `cfg`, read by `ReportsScreen.js:171-376` | **LIVE** — feeds reported totals |
| 3 | `ledger_transactions.archive_year/archived_at` (V6 active ledger) | `src/lib/activeLedgerRepository.js:88-108, 427, 441` | **DEAD** — `markLedgerYearArchived` and `listLedgerArchivedYears` have no callers in `src/` or `tests/` (only a comment reference in `financialRestoreValidator.js:127`) |
| 4 | `ledger_financial_transactions_v7.archive_year/archived_at` | `src/lib/financialLedgerV7Repository.js:91-92`, `financialLedgerV7Model.js` header | **LIVE and canonical-shaped** |

Representation 1 is a duplicate canonical transaction store holding money as
floats — precisely what §72 and the Financial Contract's integer-minor-units
rule forbid.

### F3 — The correct §72/§76 target model already exists inside V7 (good news)

`src/lib/financialLedgerV7Migration.js:346-386`:

- Cold-archive rows are read and rebuilt as canonical V7 transactions carrying
  `archiveYear` / `archivedAt` (`archiveRows()`, lines 59-67).
- The archive's opening-balance rewrite is **reversed**:
  `residual = wallet.openingBalance − coldMovement(wallet)` (line 369), and the
  true opening is emitted as a synthetic `opening_balance` transaction.
- ID collisions between active and archived sets are detected and rejected
  (lines 349-356); unresolved FX aborts the migration (lines 358-361).

So V7 already models archive the way §72 wants, and already knows how to undo
the legacy damage. Phase 11's job is to make that the *only* representation,
stop the ongoing legacy mutation, and add the missing query contract.

### F4 — Query scope is two-state and implicit (violates §74)

- `queryLedgerTransactions({ archived = false })`
  (`activeLedgerRepository.js:629-683`) is a **boolean**: `archived_at IS NULL`
  or `archived_at IS NOT NULL`. There is no `ALL`.
- `queryLedgerSummary({ includeArchived = false })` (line 685) is a *different*
  two-state axis (`ALL` vs `ACTIVE`) under a different name.
- Both **default** to ACTIVE, so a caller that omits the parameter silently
  gets a narrowed scope instead of an error. §74 requires each query to declare
  its scope.

### F5 — Wallet balance is neither `ALL`-scoped nor posting-derived (violates §74 + A3)

`getWalletBalances()` (`src/lib/wallets.js:120-153`) computes
`openingBalance + movement over the hot in-memory transaction array`. The hot
array excludes archived years, so the computation is ACTIVE-scoped; it only
produces the right number because F1 rewrote `openingBalance`. There is **no
posting-derived balance query anywhere in V7** — no balance export exists in
`financialLedgerV7Repository.js` or `activeLedgerRepository.js`.

**Correction (2026-08-27, during 11-A implementation).** The first pass of this
document said there was *no* posting-derived balance query anywhere in V7. That
was wrong, and the corrected picture matters because it changes the fix:

- `queryLedgerWalletPositions()` (`activeLedgerRepository.js`) **does** sum
  `ledger_postings_v7` per account with **no archive predicate at all** — it is
  already posting-derived and already ALL-scoped. §74 is satisfied on that path.
- It is reached post-cutover by `commandWalletPosition` /
  `commandWalletBalance` (`financialCommandBalances.js`), which import it
  correctly.
- It is **not** reached by the Home screen. `HomeScreen.js` calls
  `getLedgerNamespace`, `queryLedgerSummary`, `queryLedgerTransactions` and
  `queryLedgerWalletPositions` **without importing any of them**. The first
  reference throws `ReferenceError` outside the try/catch, `run()` rejects
  unhandled, `sqlHome` stays null, and the screen falls back to
  `getWalletAvailableBalances` over the hot array for every cutover user.

So F5 is not "the balance is never posting-derived"; it is "the correct query
exists and is unreachable from the main screen, and the legacy fallback behind it
is ACTIVE-scoped and only numerically correct because F1 rewrote
`openingBalance`."

This is the single most sensitive surface in Phase 11: A3
(`MYFI_FINANCIAL_CONTRACT.md`) requires every balance to be derivable from
postings, and §74 requires wallet balance to use `ALL`.

### F6 — Archiving synthesizes goal-release transactions (needs a §73 ruling)

`financialLedgerV7Repository.js:3120-3186`: when a `goal_allocation` is
archived, the archive operation *creates a new `goal_release` transaction*
releasing the reserved bucket (`v7-archive-release:<id>`,
`rateSource: 'archive_reserved_release'`). Effects:

- reserved balance drops, available balance rises — a financial state change
  caused solely by pressing Archive;
- it **diverges from the legacy layer**, which preserves the goal total via
  `archivedSaved`. The two representations disagree about the same event.

The equivalent synthetic release also exists in the migration path
(`financialLedgerV7Migration.js:387-408`, `syntheticMigrationRelease`).

### F7 — §77 (Export Archive) is structurally separate but not yet clean

`exportColdArchives()` feeds the backup and `loadColdArchiveYear()` powers
`ArchiveScreen`, so the export artifact and the internal archive are already
distinct code paths. The separation is nominal only because the cold archive is
still a live *financial* store rather than a derived artifact. It becomes real
once F2 is resolved.

**Open verification item (Phase 12 boundary):** `financialBackupV2.js:118`
includes `archives: await exportColdArchives(...)` in the backup payload. If
archived transactions also live in the canonical V7 section of the same backup,
the backup double-stores them. Not yet verified; flagged for §78/Phase 12.

## 3. Scope assessment

Phase 11 is **not** "add an archive representation" — the representation
already exists in V7 (F3). It is:

1. remove an existing §73 violation from the live archive operation (F1);
2. collapse four representations to one (F2);
3. make query scope explicit and three-state (F4);
4. make wallet balance `ALL`-scoped and posting-derived (F5);
5. rule on, then align, archive-time goal release (F6);
6. run and verify the §76 cold->V7 migration for users not already through the
   V7 cutover, without deleting old rows before validation.

Items 1, 4 and 5 touch the balance path. That is the highest-risk surface in
the product and drives the sequencing options below.

## 4. Decisions requested from Planning & Audit

Recorded here; not resolved by this session.

**D1 — Sequencing.** Three candidates:

- *Option 1 — single gate.* All six items in one Phase 11 gate. Most faithful
  to §71-77; largest blast radius on the balance path in one acceptance run.
- *Option 2 — freeze first.* Apply §3.5 literally: disable the archive action,
  then do model/scope/migration work only. Lowest risk, but leaves the already
  inflicted mutation unrepaired and archiving unavailable indefinitely.
- *Option 3 (recommended) — split into 11-A / 11-B.*
  - **11-A**: query-scope contract (F4), reports scope (§75), cold->V7
    migration + verification (§76, F2/F3), dead-code removal (F2 #3), tests,
    **and gate the archive action off** per §3.5 while it still mutates.
  - **11-B**: remove the F1 mutation, introduce posting-derived `ALL` wallet
    balance (F5), resolve F6, re-enable archiving on the non-mutating path,
    with its own device acceptance.

  Rationale: 11-A is behaviour-preserving for balances and shippable on its
  own; 11-B — the part that can move a real user's displayed balance — gets a
  dedicated gate and a dedicated device acceptance instead of sharing one.

**D2 — §73 vs archive-time goal release (F6).** Is releasing the reserved
bucket at archive time intended semantics, or a §73 violation to remove? The
legacy and V7 layers currently disagree, so one of them is wrong either way.

**D3 — Existing-user repair.** Users who already archived carry a rewritten
`openingBalance`, truncated `debt.payments` and truncated `goal.savings` in the
legacy layer. V7's migration reverses the opening-balance part (F3) but only
for workspaces that ran the shadow migration with cold archives present.
Confirming that this is an explicit, evidenced migration with before/after
verification — never a silent repair (banned by A0 §5) — and deciding whether
debt/goal history also needs reconstruction.

**D4 — Fate of the cold archive tables.** After §76 migration: delete them
(post-validation), or keep them as an explicitly derived, rebuildable read
cache for `ArchiveScreen` performance? §72 forbids a duplicate *canonical*
transaction; a declared cache is arguably compliant, but it is a standing
divergence risk.

**D5 — `cfg.archiveSummaries`.** Demote to display-only metadata, or delete and
derive year summaries from V7 postings? It currently feeds reported totals as
floats (`ReportsScreen.js:355-376`), which conflicts with §75's "historical
totals never change silently" and with integer minor units.

## 5. Planning & Audit rulings (2026-08-27)

- **D1** — Option 3 approved: split into 11-A / 11-B.
- **D2** — the archive-time reserved-bucket release (F6) is a §73 violation to
  remove, not intended semantics. Assigned to 11-B.
- **D3** — explicit, evidenced migration only; never a silent repair. The
  truncated debt/goal history needs reconstruction too, not just
  `openingBalance`. Registered as its own gate inside 11-B, with real-device
  acceptance before it touches real users.
- **D4** — keep the cold-archive tables for now as a derived, rebuildable cache.
  Actual deletion waits for its own gate (fits Phase 13 Stage E, not Phase 11).
- **D5** — derive year summaries at display time; do not treat stored floats as
  authority.

## 6. Phase 11-A — what was implemented

Branch `impl2/phase11-archive-consolidation-2026-08-27`, on top of
`f47bebdef9609d8fd7293d54bd4ffff2e287a864`. Not committed, not pushed.

### 6.1 §74 — explicit tri-state archive scope

New `src/lib/archiveScope.js`: `ARCHIVE_SCOPE = {ACTIVE, ARCHIVED, ALL}`,
`requireArchiveScope` (no default — omitting the scope throws
`archive_scope_required:<caller>`), `requireBalanceArchiveScope` (throws unless
ALL), plus the flag and clause helpers.

Converted, with every call site updated and behaviour preserved exactly:

| Query | Before | After |
|---|---|---|
| `queryLedgerTransactions` | `archived` boolean, default false | `archiveScope` required |
| `queryLedgerSummary` | `includeArchived` boolean, default false | `archiveScope` required |
| `queryLedgerCategorySpend` | `includeArchived` boolean, default false | `archiveScope` required |
| `queryLedgerWalletPositions` | no archive parameter | `archiveScope` required **and asserted to be ALL** |

**Divergence fixed along the way.** The legacy V6 fallback in
`queryLedgerTransactions` was `if (archived) ... else archived_at IS NULL` — it
could not express ALL. The V7 path could. The same call therefore answered
differently depending on cutover state. Both paths now share
`archiveScopeClause`.

### 6.2 §3.5 — the mutating archive commit is frozen

New `src/lib/archiveCommitFreeze.js`. `commitYearArchive` returns false at the
top, **before** the maintenance barrier and before every mutation. §77 is
respected: exporting a year's archive **file** stays available; only the internal
commit that would remove the year from active data is withheld, with a localised
explanation instead of a bare failure.

### 6.3 §72 — third representation removed

`markLedgerYearArchived` and `listLedgerArchivedYears` deleted (49 lines): dead,
with no caller anywhere in `src/` or `tests/`. Two comments that cited
`markLedgerYearArchived` as the reason a row can be archived without a year were
corrected — the actual mechanism is the independent `COALESCE` in
`upsertLedgerTransaction`. The `ledger_transactions.archive_year/archived_at`
columns stay; they are still read.

Per D4, the cold-archive tables were **not** removed.

### 6.4 §75 — the report declares its scope

`ReportsScreen` no longer decides its archive scope through a bare
`walletFilter === 'all'` test at each use site; it computes a named
`reportArchiveScope` once. Numbers are unchanged.

**Scope refinement, needs Planning's note.** D5's other half — moving the archived
contribution off `cfg.archiveSummaries` floats and onto derived postings — was
**not** done in 11-A. It changes user-visible historical totals, which is the same
risk class as F5 and collides with §75's own "historical totals must not change
silently". It belongs in 11-B beside F5, with a derived-equals-stored verification
before the source is switched. Flagged rather than decided unilaterally.

### 6.5 Tests

Three new gate-registered tests, each carrying the repeat-action coverage
Standing Rule 2 requires, and each verified to fail when its invariant is broken:

| Test | Proves |
|---|---|
| `run-p11a-archive-scope-contract.cjs` | tri-state semantics against real SQLite (ALL returns active + archived; the old binary could not express it); every query requires a scope; every call site declares one; the balance query carries no `archived_at` predicate |
| `run-p11a-archive-commit-freeze.cjs` | the freeze precedes every mutation; the **shipped guard source** is lifted out of `dataSlice.js` and executed three times, refusing each time; the §77 export path stays open |
| `run-p11a-archive-balance-invariance.cjs` | §73/§76: the same ledger projected with a year active vs archived yields an **identical canonical posting balance** (5,700,000 minor both ways), the true opening balance survives, IDs stay immutable, amounts and FX are untouched — and it still holds after a **second** year is archived on top of an already-rewritten opening balance |

Negative controls were run, not assumed: removing the migration's
`residual = openingBalance − coldMovement` reversal makes the invariance test
fail (5700000 → 6700000); flipping `ARCHIVE_COMMIT_FROZEN` to false fails the
freeze test. Both files were restored afterwards.

### 6.6 Verification

`npm run test:gate`: **122 passed, 1 failed, 11 skipped.**

The single failure is `ui-contract` ("Light and dark themes must preserve green
income and red expense colors") — a design-tokens-track contract, unrelated to
Phase 11, **confirmed failing at clean HEAD with these changes stashed**.

Recorded plainly: the first gate run showed 20 failures, all because this
worktree had no `node_modules` at all. `npm ci` was run from the committed
lockfile (no dependency change). The pre-change and post-change failure sets were
captured and diffed, and are identical apart from the three tests this work adds.

`/code-review` at level high produced three findings, none blocking:

1. **`HomeScreen.js`** — the missing-import defect described in the F5
   correction. Pre-existing; documented in place and deferred to 11-B, because
   adding the imports switches which source produces a real user's displayed
   balance.
2. **No CI workflow triggers this branch.** Every workflow in
   `.github/workflows` is `workflow_dispatch`-only or pinned via
   `on.push.branches` to a different, older branch, so `npm run test:gate` never
   runs in CI here and **Standing Rule 5 ("done" needs a named green CI run ID)
   cannot currently be satisfied for Phase 11-A.** This needs either a
   branch-agnostic quality-gate workflow or a recorded dispatch run.
3. **`financial-core.test.mjs:1166`** now passes vacuously — the freeze returns
   false before the SQLite-availability path that assertion claims to test.
   Coverage returns when 11-B lifts the freeze; 11-B must re-verify it rather
   than trust a green result.

## 7. Phase 11-B — increment 1 (2026-08-27)

Branch `impl2/phase11-archive-consolidation-2026-08-27`, on top of the 11-A
merge commit `1781d71`. Not committed, not pushed as of writing this section.

Planning & Audit rulings for 11-B carried forward from the handoff: option (ب)
approved for the eventual `openingBalanceMode: 'ledger'` completion (full F1
removal), with an **explicit real-device acceptance gate required before any
production activation** — this increment does not touch that gate; it does the
parts that are safely verifiable by CI alone.

### 7.1 P11B-001 — balance-parity harness

New `src/lib/archiveBalanceParity.js`. Compares the legacy hot-array balance
against the canonical posting-derived balance, wallet by wallet, in minor
units. **Has no repair path by design** — per the D3 ruling, disagreement is
reported, never silently corrected. `summarizeParityForDiagnostics` reduces a
result to counts and wallet ids only, with no amounts, satisfying Standing
Engineering Rule 6 before this ever reaches a log or an evidence file.

Test (`p11b-balance-parity.test.mjs`) proves: the two sources agree unarchived;
they still agree after archiving (the actual precondition for ever switching
the source); the harness genuinely detects a one-minor-unit drift and an
absent-wallet case rather than absorbing them; it does not mutate its inputs;
its diagnostic summary contains no amount; and agreement survives a second
archive.

### 7.2 HomeScreen balance source revived

The `HomeScreen.js` block flagged as inert in 11-A (four ledger functions used
but never imported, throwing `ReferenceError` on every run for every
V7-cutover user) now actually runs. This was judged safe to do inside 11-B
itself, ahead of the full F1/model migration, because `queryLedgerWalletPositions`
— the ALL-scoped, posting-derived query this revives — is not a new or unproven
source: `transactionsSlice.js` already uses the same query (via
`commandWalletPosition`) to gate whether a real expense can be posted for these
same cutover users. Wiring it into Home only fixes which screen reads it.

Scope is unchanged for non-cutover users: the effect still bails to
`sqlHome = null` before any query when `financialLedgerV7Cutover` is false.

Test (`run-p11b-homescreen-balance-source.cjs`) proves: all four functions are
imported and called; the `KNOWN INERT` marker is gone; the wallet-position call
still asks for ALL; the cutover guard still bails out first.

**Found by `/code-review` (high effort) and fixed in this increment:**
`hasLedgerEntries` (line 709, pre-existing code that only became reachable by
this fix) used `sqlHome?.summary` without the `supported !== false` guard
`effectiveMonthSummary` uses two lines earlier — and `queryLedgerSummary`'s V6
legacy-branch return has no `supported` field at all, unlike its sibling
`queryLedgerWalletPositions`. Because `financialLedgerV7Cutover` (Zustand,
persisted to AsyncStorage) and `ledger_workspace_state_v7.source_mode`
(SQLite) are two independently-persisted flags that must stay in lockstep
across crashes and partial cutovers, a divergence window is realistic, not
theoretical. Fixed by adding the same guard; regression-tested by asserting
both call sites share the identical guard expression, with a negative control
that fails when the guard is removed.

### 7.3 F6 resolved on both code paths (D2)

Archiving a `goal_allocation` used to synthesize a hidden `goal_release`
transaction, releasing its reserved posting to available balance — a real
balance change caused solely by pressing Archive (§73), disagreeing with the
legacy layer, which keeps the contribution counted via `archivedSaved`
instead of releasing it.

Two separate code paths carried this violation and both are now fixed:

- **`archiveFinancialTransactionsV7`** (`financialLedgerV7Repository.js`) — the
  runtime archive-time synthesis (83 lines removed). Archiving a goal
  allocation now only sets `archived_at`/`archive_year`, exactly like every
  other transaction kind. The `releasedAllocations` return field is gone; its
  only caller (`dataSlice.js`) never read it.
- **`buildFinancialShadowProjectionV7`** (`financialLedgerV7Migration.js`) — a
  symmetric, previously-unnoticed instance in the Cold-Archive-to-V7 migration
  path: every archived goal-allocation being migrated got a synthetic release
  regardless of `transaction.allocationReleased`. Fixed to gate on
  `allocationReleased` alone — a real, user-driven release still carries
  through migration; "archived" no longer implies "released".

Tests:
- `financial-ledger-v7-runtime.test.mjs` updated: asserts no release posting is
  inserted, the reserved-bucket query is never even issued, exactly one
  outbox mutation syncs (not a hidden second one), and a repeat archive of an
  already-archived row changes nothing.
- New `p11b-migration-goal-release.test.mjs`: an archived-but-unreleased
  allocation keeps its full reserved posting (matches the never-archived
  case exactly); a genuinely-released allocation still gets its release
  synthesized whether archived or not.
- `p19-006-local-v2-shadow-dualwrite.test.cjs`: one assertion referencing the
  removed call site literally was corrected with a note; the dual-write
  contract it existed to check remains covered by the entity-outbox assertion
  beside it.

Both fixes were verified with actual negative controls (reintroducing the old
condition and confirming the test fails), not just written and trusted.

### 7.4 Verification

`npm run test:gate`: **126 passed, 0 failed, 11 skipped** — up from 125 at the
end of 11-A (5 new tests registered; the 3.5 freeze test and the ui-contract
fix both still hold).

`/code-review` at level high: 1 finding, fixed in this increment (§7.2 above).

Not committed or pushed yet.

### 7.5 What remains open in 11-B

Unchanged from the 11-A handoff, still gated on real-device acceptance before
production activation:

1. **F1 removal** — `commitYearArchive` still rewrites `openingBalance` and
   truncates `debt.payments`/`goal.savings`. Removing this requires completing
   the `openingBalanceMode: 'ledger'` migration project-wide (the D1 option ب
   ruling) so the 14 remaining legacy-balance call sites
   (`getWalletBalances`/`getWalletAvailableBalances` consumers: `AddTransModal`,
   `NewItemModal`, `WalletBalanceCard`, `decisionEngine`, `financialCommandBalances`,
   `financialIntegrity`, `notifications`, `HistoryScreen`, `HomeScreen`'s own
   fallback, `SettingsLegacyScreen`, `calc.js`) keep working once
   `openingBalance` is always zero. This is the largest remaining piece and the
   one the device gate is specifically for.
2. **D3 repair migration** — existing users who already archived carry a
   rewritten `openingBalance` and truncated debt/goal history. Needs its own
   evidenced, verified, non-silent migration, separate from (1).
3. **D5 report derivation** — moving `cfg.archiveSummaries` floats onto derived
   postings in `ReportsScreen`.

Next exact action: report this increment to Planning & Audit; on approval,
commit and push (CI-only acceptance, per the standing rule); then scope (1)
above as its own dedicated sub-phase with an explicit device-gate plan, rather
than attempting it inside a single further increment.

## 8. Phase 11 closure and the 11-C split (2026-08-27)

### 8.1 Correction: the approved F1 plan did not actually solve F1

The D1 option (ب) ruling — "complete the `openingBalanceMode: 'ledger'`
migration project-wide, then F1 removal follows" — was recorded in §6/§7 as the
route to removing the F1 mutation. On re-examination before writing any code,
**that plan was wrong**, and this section corrects the record rather than
leaving the earlier reasoning to be discovered as a dead end later.

The mistake was locating the problem in the wrong place. F1 is not fundamentally
about *how the opening balance is represented*; it is about
`commitYearArchive` **removing the archived year's transactions from the hot
workspace array**. Any representation of the opening balance still has to
compensate for that removal:

- today the compensation is a rewritten `wallet.openingBalance` (violates §73
  "opening balance");
- under a completed ledger-mode migration the compensation would have to move
  into the opening `opening_balance` transaction's own amount instead — which
  violates §73 "transaction amount", a *worse* outcome, not a fix.

Completing the ledger-mode migration **relocates** the compensation. It does not
**remove** it. Removing it requires archiving to stop deleting anything at all.

### 8.2 What actually removes F1

Archive must become a pure visibility marker — exactly what V7 already does
(`archiveFinancialTransactionsV7` deletes no row; it sets
`archived_at`/`archive_year`). With nothing deleted, the balance is simply the
ALL-scoped posting sum and no compensation term exists anywhere.

The obstacle is that the Cold Archive exists for a real reason: keeping many
completed years out of the hot in-memory array is a genuine performance
requirement (`localArchiveRepository.js` header). So the answer is not "stop
draining the hot array" — it is **stop reading balances from the hot array**.
Once the remaining consumers read the posting-derived query instead, the hot
array is free to be drained without any balance depending on it, and F1 can be
deleted outright.

Consumers still reading `getWalletBalances`/`getWalletAvailableBalances`
(11-A survey, minus HomeScreen's SQL path fixed in §7.2): `AddTransModal`,
`NewItemModal`, `WalletBalanceCard`, `decisionEngine`, `financialCommandBalances`
(fallback branch), `financialIntegrity`, `notifications`, `HistoryScreen`,
`HomeScreen` (fallback branch), `SettingsLegacyScreen`, `calc.js`,
`financialLedgerV7Migration` (metrics only).

### 8.3 Second blocker found: the V6 balance query does not exist

`queryLedgerWalletPositions` is posting-derived and ALL-scoped **only on the V7
branch**. Its non-cutover branch is a stub: `return { supported: false, source:
'legacy', rows: [] }`. Every consumer above therefore has no posting-derived
balance to switch to for users who have not completed the V7 cutover. Building
that query is a hard prerequisite for §8.2 — switching consumers first would
collapse the balance to empty for those users.

### 8.4 Planning & Audit ruling — Phase 11 closes, 11-C opens

Ruling (2026-08-27): **close Phase 11 at its current state and open the
remaining work as its own phase.** The rationale: the remaining scope is no
longer "archive consolidation" but "unify the wallet-balance source across V6
and V7 onto derived postings". It warrants its own tracking and its own device
gate rather than being buried inside Phase 11.

**Phase 11 — CLOSED.** Delivered and pushed with named green CI runs:

| Increment | Commit | CI run |
|---|---|---|
| 11-A — scope contract, §3.5 freeze, §72 dead-code removal, §75 declaration | `5916f67` (+ merge `1781d71`) | `33057163679` success |
| 11-B — parity harness, HomeScreen balance source, F6 removal on both paths | `12d532c` | `33059784018` success |

Quality gate at closure: **126 passed, 0 failed, 11 skipped.**

§71-77 status at closure:

- §71/§72 — archive is a visibility marker in the canonical V7 representation;
  the dead third representation is gone; the cold archive is retained as a
  derived cache per D4.
- §73 — F6 (archive-time reserved release) removed on both the runtime and
  migration paths. **F1 remains open** and is the reason §73 is not fully
  satisfied; it is contained, not live, because §3.5's freeze blocks the
  mutating commit path entirely.
- §74 — explicit tri-state scope enforced repository-wide; wallet balance
  asserts ALL. Fully satisfied for the V7 path.
- §75 — report scope declared; derivation onto postings deferred to 11-C.
- §76 — cold-archive migration into canonical V7 verified, including the
  opening-balance reversal, with balance invariance proven across repeated
  archiving.
- §77 — export artifact separated from the internal archive and explicitly kept
  available while the commit path is frozen.

**Phase 11-C — Wallet balance source unification (V6 + V7, posting-derived).**
Approved scope and order:

1. Build the V6 posting-derived, ALL-scoped balance query (§8.3 prerequisite).
2. Migrate the remaining consumers in §8.2 onto it, incrementally.
3. Only then delete the F1 mutation from `commitYearArchive` and lift the §3.5
   freeze.
4. D3 repair migration for users who already archived under F1.
5. D5 report-total derivation onto postings.

Real-device acceptance remains a mandatory gate before any production
activation of 11-C, per the standing ruling — a green CI run is necessary but
not sufficient for this phase, because it changes the balance every user sees.

## 9. Phase 11-C step 1 — the V6 wallet-balance query (2026-08-27)

Closes the §8.3 blocker. `queryLedgerWalletPositions`' non-cutover branch was
`return { supported: false, source: 'legacy', rows: [] }` — a stub. It now
computes a real ALL-scoped balance from the V6 tables, so step 2 has something
to migrate consumers onto for users who have not completed the V7 cutover.

### 9.1 Semantics

V6 has no postings table; movement lives in columns on `ledger_transactions`.
The query mirrors `applyWalletMovement` (`wallets.js`) one-for-one:

| Case | Rule |
|---|---|
| transfer | debit `from_wallet_id` by `transfer_from_minor + fee_minor`; credit `to_wallet_id` by `transfer_to_minor` |
| anything else | add signed `wallet_amount_minor` to `wallet_id` |
| `wallet_id IS NULL` | falls back to the default wallet, exactly as `tx?.walletId \|\| safeDefault` does |
| unreleased goal allocation | reserves `allocationWalletAmount ?? allocationAmount ?? amt` |
| soft-deleted | excluded |
| archived | **included** — §74, no `archived_at` predicate anywhere |

**Reserved is computed in JS, not SQL, and that is deliberate.** The allocation
amount is stored in `payload_json` in *major* units, so summing it in SQL would
require each wallet's currency exponent inside the query. The first
implementation did exactly that (reading a minor-unit field that does not
exist) and **the parity test caught it** — reserved came back 0 instead of
120000. It is now a separate query reduced per row through `moneyToMinor` with
that wallet's currency.

**Scope filters wallets, never movements.** A movement labelled with another
scope still moved real money in the wallet, so excluding it would report a
balance the wallet does not have. This matches the V7 branch (which filters
`a.scope` but sums every posting on the account) and is a deliberate difference
from the in-memory path, where callers pre-filter the transaction array and a
cross-scope transfer can go uncounted. Documented in code and pinned by a test
that inserts a business-scoped transfer out of a personal wallet and requires
the debit to land.

**`defaultWalletId` is now a parameter and matters only on the V6 branch.**
Omitting it falls back to the first wallet by id, which is the same wallet only
when the user never chose a different default. Step 2 consumers MUST pass
`cfg.defaultWalletId`; noted at the call site so the migration cannot miss it.

### 9.2 Test

`run-p11c-v6-wallet-positions.cjs` builds one workspace expressed **both ways** —
as legacy objects and as V6 rows — and requires the shipped SQL to produce
exactly the legacy numbers, to the minor unit, for physical, reserved and
available balances on both wallets.

The fixture exercises every branch: income, expense, a transfer with a fee, a
reserved goal allocation, a released one, a row with `wallet_id IS NULL`, and an
archived row (to prove ALL scope). The SQL is extracted from the shipped source
rather than retyped, so a later edit to the query is genuinely covered.

Negative controls run, not assumed:
- adding `archived_at IS NULL` to the movement query → fails (`w1` balance
  diverges), confirming §74 is actually enforced by data, not just by comment;
- removing the `COALESCE(wallet_id, ?)` fallback → fails.

### 9.3 Verification

`npm run test:gate`: **127 passed, 0 failed, 11 skipped.**

`/code-review`: performed on the diff. It surfaced the scope-semantics question
above, which was resolved by documenting the rule and pinning it with the
cross-scope test rather than leaving it implicit.

### 9.4 Next

Step 2: migrate the §8.2 consumers onto `queryLedgerWalletPositions`,
incrementally, each passing `cfg.defaultWalletId`, with
`archiveBalanceParity.js` available to catch any divergence. Nothing in step 1
changes what any screen displays — the new branch has no consumers yet.
