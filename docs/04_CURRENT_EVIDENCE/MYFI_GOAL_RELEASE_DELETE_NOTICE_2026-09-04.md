# MYFI — released-goal delete-time notice (2026-09-04)

**Author:** Planning & Audit session, acting directly due to a cross-session
messaging tool outage (SendMessage unavailable mid-session) — normally hands
this off to Implementation, doing it directly here with the same discipline
(financial-impact check, tests, self-review, no schema change).

## Bug this closes

Reported by the owner and investigated same day:
[[myfi_goal_transaction_integrity_resolved_2026-09-04]] (memory). Root cause:
`goalLifecycle` (`src/lib/trackerLifecycle.js:48`) unconditionally
short-circuits once a goal's `status === 'released'`, returning before
consulting the live `saved` argument. `releaseGoalSavings` (the "transfer to
wallet" completion action) sets this status. Once released, deleting a
goal's linked saving transactions is silently a no-op on the goal's own
reported state — but every delete-confirmation dialog in the app claimed
"this updates linked totals/tracker," which is false for a released goal.

Independently confirmed during investigation: no financial/wallet-balance
corruption exists. `getWalletAvailableBalances` (`src/lib/wallets.js:170-204`)
computes reserved balance live from actual `isGoalSaving`/`goal_allocation`
transactions on every call — never from a cached total — so deleting a
saving transaction can only ever decrease that sum correctly. The damage is
representational only: a released goal keeps asserting a frozen
`settledAmount` with no supporting transactions after deletion.

Also confirmed NOT systemic: debts (`debtLifecycle`) and commitments
(`syncCommitmentPaidMonth`) both recompute their state live on every
relevant delete, with no equivalent frozen/terminal short-circuit.

## Fix

**Pure, read-only truth-in-labeling. No lifecycle logic changed.** Per PA's
own ruling: reopening a released goal (letting deletion "undo" completion)
is explicitly NOT implemented — that's a product/risk decision (would need
to re-reserve wallet balance the release already freed, with no guarantee of
room), left alone deliberately.

- `src/lib/trackerLifecycle.js`: new pure helper
  `releasedGoalDeleteNotice(trans, goal)` — returns `null` unless the
  transaction is a goal-saving transaction whose goal is `status: 'released'`,
  in which case it returns `{ goalId, goalName, releasedAt }`.
- Wired into every delete-confirmation dialog that can touch a goal-saving
  transaction, replacing the false "updates linked totals" claim with an
  accurate one when the notice fires:
  - `src/screens/HistoryScreen.js` — single-row delete (`confirmDeleteRow`)
    and bulk delete (`confirmDeleteSelected`).
  - `src/screens/HomeScreen.js` — single-row (`confirmDeleteRow`) and bulk
    recent-transactions delete (`confirmDeleteRecent`).
  - `src/screens/ArchiveScreen.js` — single-row (`confirmDeleteTransaction`)
    and bulk (`confirmDeleteSelected`).
  - `src/components/AddTransModal.js` — the edit-modal's own delete
    (`handleDelete`).
  - `src/screens/TrackersLabScreen.js` — single-payment delete
    (`confirmDeletePayment`) and bulk payment-selection delete
    (`confirmDeleteSelectedPayments`) — this is the screen ("Trackers") the
    owner was actually using when he found the bug.

## Verification

- `tests/goal-release-delete-notice.test.cjs` (new, registered in
  `run-quality-gate.cjs`): unit-tests the pure helper (not-goal-saving,
  missing goal, active goal, settled-but-not-released goal all return
  `null`; a released goal returns the correct id/name/date; missing name
  falls back to `null` rather than throwing; `releasedAt` falls back from
  `settledAt` to `completedAt`), then asserts every one of the 6 call sites
  above imports and calls `releasedGoalDeleteNotice` at least once
  (TrackersLabScreen, HistoryScreen, ArchiveScreen, HomeScreen each pinned
  at 2+ call sites for their single-row + bulk paths).
- **Mutation-tested**: removed the import from `HistoryScreen.js`, confirmed
  the test fails; restored it, confirmed the test passes again.
- Full quality gate: 174 passed, 0 failed, 11 skipped (was 173 before this
  change — the new test is the +1, nothing else moved).
- All 6 edited screen/component files independently parse-checked via
  `@babel/core` (`parseSync` with the React/JSX preset) — no syntax errors.

## Financial-impact check

- Financial data written: **NONE** — no write path touched (`deleteTrans`,
  `goalLifecycle`, `deleteGoalSaving`, `deleteTransMany` are all unchanged).
- Schema/migration: **NONE**.
- Existing-user upgrade impact: **NONE** — pure UI copy + one new read-only
  helper function.
- Backward compatibility: **PRESERVED** — the notice only changes displayed
  text when a goal is already `released`; every other delete path (active
  goals, debts, commitments, non-linked transactions) is byte-for-byte
  unchanged.

## Not done, correctly deferred

Letting a released goal reopen if deletion drops its total below target —
explicitly a product/risk decision, not scoped here. See
[[myfi_goal_transaction_integrity_resolved_2026-09-04]] for the reasoning.
