# MaalFlow redesign — R2 planning: financial impact review (2026-09-11)

Required by `planning.html` before any code: three decisions touch money
semantics — the period starts on payday, carry-over at period end, and one
storage for the plan. This review follows the `maalflow-financial-impact-check`
procedure against the code at `bbafd9c`. It was done before implementation; its
conclusions are the rules the R2 code must satisfy.

## 1. What exists today (read from code, not docs)

| Concept | Where it lives | Synced to cloud? | In backup? |
|---|---|---|---|
| Category budgets | `cfg.categoryBudgetsByMonth` (key `YYYY-MM`, calendar month) **and** V7 `budget` entities (`${scope}:${month}:${categoryId}`) | V7 entities yes; cfg no (`CLOUD_WORKSPACE_CFG_KEYS = ['currency']`) | yes, via `pickFinancialBackupConfig` |
| Income plan (50/30/20 lens, income amount) | `cfg.incomeAllocationPlan` | **no** | **no** (not in `pickFinancialBackupConfig`) |
| Period / payday start | does not exist; every month boundary is the calendar month (`budgetMonthId`, `isCurrentMonthTransaction`, reports) | — | — |
| Carry-over | does not exist | — | — |
| Goal contribution | goal allocation is a system flow (`FLOW_TYPES.GOAL_ALLOCATION`, `addGoalSaving`), not income/expense | yes (transactions) | yes |

Contract clauses in play (`docs/MAALFLOW_FINANCIAL_CONTRACT.md`): 1 (history is
never reinterpreted), 3 (integer minor units), 4 (balances derive from postings),
5 (no silent repair), 9 (transfers are not income/expense); R04: budgets are
currency-sensitive and follow the base-currency lock; feature visibility cannot
change totals.

## 2. Decision A — the period starts on payday

**Risk.** A start day changes the window every "this month" number is computed
over: budgets, pace, forecast, reports, notifications. Budgets are stored under
`YYYY-MM`. If changing the start day silently changed which dates an existing
`2026-09` budget covers, stored plan state would be reinterpreted (clause 1).

**Rules for the implementation.**

1. A period keeps a `YYYY-MM` key, so budget storage, the V7 `budget` entity id
   format and the `^\d{4}-\d{2}$` guard in `activeLedgerRepository` are
   unchanged. **No schema change, no migration.**
2. Period label: a period starting on day `d` of month M is named M when
   `d <= 15`, otherwise M+1 (the month holding most of its days). This matches
   the board ("فترة أيلول · 25 آب – 24 أيلول"). With `d = 1` every period equals
   its calendar month, so an upgrading user sees identical numbers.
3. Start day is clamped to the month's length (`31` in February ends on the 28th/29th);
   periods tile the timeline with no gap and no overlap.
4. **Changes are never retroactive.** The plan stores
   `startDayHistory: [{ effectivePeriod: 'YYYY-MM', startDay }]`. A change applies
   from the next period that has not started yet; every past or current period
   keeps the boundaries it had when its numbers were produced. Changing the
   start day twice in a row must leave earlier periods untouched (repetition test).
5. Transactions are never re-dated or re-keyed. Periods are a read-side window
   over authoritative `dateISO` values only.
6. Commitment due dates stay date-based (`commitments.js monthKey`); a commitment
   counts as "committed" in the period whose range contains its due date.

## 3. Decision B — end-of-period carry-over

The board offers three explicit choices for the flexible remainder: move to a
goal, carry to the next period, or leave it in the wallet.

**Rules.**

1. Nothing happens without an explicit user decision. No automatic roll-over.
2. **Move to a goal** must create a real goal allocation through the existing
   `addGoalSaving` path (a system flow, never income or expense, clause 9
   spirit). The decision record stores the resulting transaction id; the
   allocation itself is the financial truth.
3. **Carry to next period** creates **no posting**. It adds a plan-only amount to
   the next period's flexible figure. Wallet balances do not change (clause 4).
4. **Leave it** records the decision only.
5. One decision per `(scope, period)`. Recording it again is idempotent: it
   updates the record and never adds a second carry or a second allocation
   (the goal path must check the stored transaction id first).
6. Amounts are integer minor units in the base currency (clause 3), and the
   record carries `currencyCode`; a base-currency mismatch blocks rather than
   converts (R04 currency lock).
7. A carry never exceeds the period's actual remainder, which is computed from
   postings at decision time and stored with the decision for traceability.

## 4. Decision C — one storage for the plan

Today plan state is split: budgets in two places, the income plan device-only
and missing from backups. A user who restores a backup, or opens a second
device, loses the plan and sees a different "available to spend".

**Options weighed.**

- **New V7 entity types (`monthly_plan`, `period_review`).** No SQL schema
  change (`ledger_entities_v7` is generic, cloud `entity_type` is free text).
  Rejected for now: `reconcileFinancialWorkspaceV7` tombstones every existing
  entity not re-derived from workspace state (`financialLedgerV7Repository.js`
  ~6483), and the V7 read-back (`~4899`) does not return unknown types into
  state. A new type would need projection, read-back, reconcile, restore-engine
  and semantic-hash support at once. That is the highest-risk path.
- **Plan as reviewed cloud workspace config (chosen).** One normalized object
  `cfg.monthlyPlan` = `{ version, currencyCode, startDayHistory, incomeMode
  ('fixed' | 'lowestReliable' | 'lastPeriod'), fixedIncomeMinor, reviews:
  { [scope:period]: decision } }`. It travels on the existing, already-synced
  `workspace` entity once `monthlyPlan` is added to `CLOUD_WORKSPACE_CFG_KEYS`
  (the allowlist exists precisely for a reviewed financial reason plus a test),
  and is added to `pickFinancialBackupConfig` / `mergeFinancialBackupConfig`.
  Category budgets stay on their existing path, unchanged.
- **Leave the legacy `incomeAllocationPlan` as is.** It is kept and read only as
  an upgrade seed: its `income` fills `fixedIncomeMinor` once when no
  `monthlyPlan` exists, and its percentages become the "compare with a rule"
  lens. It is never written again, so there is no second source of truth.

**Rules.**

1. Old backups (no `monthlyPlan`) must restore exactly as before, and the plan
   then derives from defaults. New backups carry the plan, and restore replaces
   the plan wholesale. The backup format doc and checksums are updated in the
   same commit.
2. The cloud merge (`mergeCloudWorkspaceCfg`) must never let a remote plan in a
   different base currency overlay the local one; that case blocks with the
   existing currency-mismatch handling.
3. Plan edits bump the workspace entity revision through the normal outbox. No
   side channel.

## 5. "Money flow" and the monthly plan arithmetic

- Flexible = income − committed − goal contributions, with committed and goals
  pulled from Follow-ups, never typed twice.
- Money flow (frame ١١) must satisfy **Σ destinations = total income** exactly:
  categories + goal allocations + remaining in wallets. Transfers, opening
  balances, adjustments and debt settlements are excluded from both sides.
  "Committed" is shown through its categories, never as an extra line on top
  of them, so nothing is counted twice. Enforced by an invariant test over
  generated ledgers.

## 6. Pre-existing issue found during this review (not caused by R2)

**Suspected:** category budgets may not survive a cloud-only restore or second
device. They are read in-app only from `cfg.categoryBudgetsByMonth`, which is not
in the cloud allowlist, and the V7 `budget` entities returned by the read-back
are not mapped back into `cfg`. `reconcileFinancialWorkspaceV7` then derives
the desired budget set from that empty `cfg` and would tombstone the synced
entities. **Unverified.** It needs a two-client test (write budgets on A, restore
on B, reconcile, assert entities and cfg survive) before anyone claims it. It is
recorded here, not fixed inside R2.

## Verdict

```
Financial Data: NONE changed in meaning — periods are a read window; carry-to-goal
                uses the existing allocation path; carry-forward is plan-only
SQLite Schema:  NONE
Migration Required: NO (no schema/Supabase change). Backup format and the cloud
                cfg allowlist gain `monthlyPlan` — reviewed, tested, same commit
Existing User Data: PRESERVED — start day defaults to 1 (identical boundaries);
                legacy income plan seeds once and is kept
Proof (must fail if wrong):
  - period label/range for start days 1, 15, 16, 25, 28, 29, 30, 31 across
    Feb (leap/non-leap), Dec→Jan; periods tile with no gaps/overlaps
  - startDayHistory changed twice in sequence: earlier periods unchanged
  - flexible arithmetic; committed/goal pulled once; hidden features change nothing
  - carry decision recorded twice: one carry, one allocation (idempotent)
  - carry amount ≤ actual remainder; currency mismatch blocks
  - money-flow Σ = income on generated ledgers incl. transfers/adjustments
  - backup round-trip with plan; old backup without plan restores unchanged
  - cloud allowlist includes monthlyPlan and nothing else new
```

## Pre-push /code-review fixes (same day, on `1574ca4`)

High-effort review of the pure-logic commit found three issues; all addressed
before push:

1. **Goal decision could be overwritten after its allocation existed**
   (`recordPeriodReview`). Once a decision has produced a real ledger
   allocation, the module cannot reverse it — so switching the decision away,
   to a different goal, or to a different amount would either double-count the
   remainder (carry the same money already moved into the goal) or orphan the
   allocation. **Fixed**: such a decision is now locked (`allocation_locked`)
   unless the new call is the exact same decision (idempotent re-confirm). A
   new `clearPeriodReview(plan, scope, periodKey, { voidedAllocationTransactionId })`
   lets a caller unlock it, but only by naming the exact allocation id it
   already voided in the ledger — a mismatch or omission fails closed
   (`allocation_not_voided`). Verified with a repeated-decision test and 2
   mutation tests (removing each guard).
2. **Period sums re-derived a transaction's period per row.**
   `periodIncomeMinor`/`periodFlexibleSpentMinor` called `periodKeyForDate`
   (which tries up to 3 candidate periods and rebuilds ranges each time) once
   per transaction; `resolvePlannedIncome('lowestReliable')` repeated that
   6×. Measured before the fix: ~900ms combined for the 8 full passes a
   Home/planning render would trigger, on 50K transactions on desktop —
   exactly the shape of per-row cost Phase 15 already traced to multi-second
   JS-thread blocks on device. **Fixed**: the period's `[startISO, endISO]` is
   resolved once, then each row is a plain ISO-string comparison. Reduced to
   ~230ms for the same work; a perf-budget assertion (400ms) is in the gate
   so a regression back to per-row derivation is caught, not just observed.
3. **A start-day change crossing the day-15/16 label split could extend the
   current period to ~60 days**, e.g. changing from day 16 to day 15 right
   after the current period started. Investigated in depth: this is not a
   fixable search bug. Any period scheme that (a) uses `YYYY-MM` keys (a hard
   requirement — budget storage compatibility), (b) never reinterprets a date
   already inside a started period, and (c) tiles with no gap, produces the
   same result for this specific crossing; shortening the current period
   instead only moves the identical excess days onto whichever period absorbs
   the transition. **Fixed the right thing instead of the impossible thing**:
   `scheduleStartDayChange` now returns `currentPeriodDays` and a
   `warning: 'extended_current_period'` (threshold `LONG_TRANSITION_WARNING_DAYS
   = 45` days) so a screen can tell the user before applying the change,
   rather than a silent surprise turning up later in pace/report numbers.
   Verified the exact reviewed scenario (day 16 → 15) reports the warning and
   the correct 60-day figure, that tiling and non-retroactivity still hold
   through it, and that the *other* direction of change (day 1 → 25, which
   shortens rather than extends) correctly reports no warning. 2 mutation
   tests confirm the warning is load-bearing, not decorative.

`npm run test:gate`: 197 passed / 1 failed (pre-existing,
`p20_v2_conflict_recovery_resume`, unrelated) / 11 skipped.

## Build order inside R2

1. Pure `src/lib/planningPeriods.js` + `src/lib/monthlyPlan.js` with the proofs
   above (no UI, no persistence).
2. Persistence: `cfg.monthlyPlan` normalize, allowlist, backup/restore,
   legacy seed, and the tests. Full-rigor review before push.
3. Planning root + monthly plan screens on the new primitives.
4. Budgets per category, end-of-period review, Basira, compare studio,
   what-if, period report, money flow, share center.
