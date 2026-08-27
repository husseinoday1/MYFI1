# Implementation 4 → Implementation 5 handoff (2026-08-27)

**Reason:** session token budget reached ~80% without an earlier handoff at
the ~60% checkpoint (should have happened sooner — noted for next time).

## Branch / commit state

**Branch:** `impl/nav-shell-step3-2026-08-26`
**Base:** off `impl/design-tokens-foundation-2026-08-26` tip `6cd1886` (pushed to origin).
**This branch: NOT pushed yet.** Held for explicit user push approval per
standing git safety rules — nothing about that has changed, this is not a
new blocker, just still pending.

Commits on this branch, in order:
1. `899fec7` — Step 3: 4-tab nav shell (Home/My Money/Follow-ups/More),
   GatewayCard/SectionListRow, MyMoneyScreen/MoreScreen/WalletsAccountsScreen/
   PlanBudgetScreen.
2. `4674cfa` — Home hero/quick-entry cards: RADIUS/SHADOW token adoption only.
3. `302c020` — Step 5 (Archive relocation Settings→More), Step 7 (Reports
   CHART_COLORS→CAT_COLORS), color-guidance fix (My Money gateway tones
   reverted from new catalog hex to existing CAT_COLORS).
4. `5de6006` — Step 8 (onboarding account-type selector removed), Payment
   History screen (read-only, Follow-ups).
5. `7f87611` — Commitment `subType` classification (installment/subscription).

Every commit has a matching evidence file in `docs/04_CURRENT_EVIDENCE/`:
- `MYFI_STEP3_NAV_SHELL_MYMONEY_MORE_2026-08-26.md`
- `MYFI_STEPS_5_6_7_8_HOME_BATCH_2026-08-26.md`
- `MYFI_STEP8_ONBOARDING_PAYMENT_HISTORY_2026-08-27.md` (covers commits 4 and 5)

Each evidence file lists exactly what was verified (test:gate:static,
verify:android, live Expo-web browser walkthroughs, `/code-review` — all
clean except the one pre-existing `ui-contract.test.cjs` failure confirmed
present on the base commit before any of this work, via `git stash`).

## What's fully done and verified

- Step 3, Step 5, Step 7 (color-swap slice), Step 8, Payment History,
  commitment `subType` — all committed, all `/code-review`-clean, all
  live-verified in the browser except the one item below.

## What's incomplete / needs attention

1. **Commitment `subType` picker — interactive click never confirmed live.**
   The field renders correctly (confirmed: default "General" shows, tapping
   opens a sheet with the 3 correct options "General/Installment/Subscription").
   Selecting "Installment" specifically could not be driven to completion in
   this session's browser pane — screenshots have failed all session
   ("Browser pane is not displayed"/"is currently hidden"), and this specific
   bottom-sheet's rows returned an empty `getBoundingClientRect()` to every
   click strategy tried (`computer` tool ref-click, JS `.click()`, full
   pointer-event dispatch). This reads as a pane-compositing limitation, not
   a code bug — the same `renderSelectField` mechanism is already used
   successfully in production for the adjacent category/repeat-mode fields
   in the same form, unmodified. **Next session: retry this one live check**
   (resize the browser viewport tall before opening the sheet — 500x1400
   partially helped locate the elements even though clicking still failed —
   or try a real device/emulator) to fully close this out. If it still can't
   be driven, that's still fine to ship (code trace was thorough), just
   worth one more attempt with fresh context.

2. **Not built at all (deliberately, flagged in evidence, not forgotten):**
   - Auto-decrementing "remaining installments" counter — real state-machine
     logic, needs a design decision (manual field vs. auto-decrement, zero
     behavior) and a repeat-action test per the standing rule. Not started.
   - Dedicated Installments/Subscriptions filter tabs in Follow-ups (an IA
     change to `TrackersLabScreen.js`'s existing `filters`/`currentTrackers`
     mechanism) — currently just a display badge, not a filter.
   - Step 6's original ask (Payment History) is done; the subType half is
     done; the counter/filter extensions above are the only remaining pieces
     of that original gap.

3. **Still explicitly out of scope / blocked (unchanged from earlier in the
   session, re-stated so nothing looks abandoned):**
   - Step 4 (Settings/Legacy consolidation) — blocked pending Phases 11-13 closure.
   - Step 9 (Diagnostic-UI gating) — blocked, no SECURITY-S6 spec exists yet.
   - Step 10 (legacy screen retirement) — always last, not started.
   - Home's health-pill vs. the design spec's period-pills — left as-is,
     flagged as an open gap requiring a Planning & Audit product decision,
     not a token-adoption task.
   - Further Home/History/Reports token-adoption passes beyond what's
     already committed — safe, low-priority, ongoing background work.

## Traps found this session (so Implementation 5 doesn't re-hit them)

- **`ask_deepseek` (deepseek-v4-pro) produced confidently-wrong output twice**
  when given real codebase context: wrong import paths for files it wasn't
  shown directly, and — more seriously — wrong function-call signatures for
  `getBudgetRows`/`setCategoryBudget`/wallet helpers when asked to redo
  screen styling "keeping the data logic exactly as-is." Both times it was
  caught by review before applying, per the standing rule, and the work was
  done by hand instead. **Do not trust deepseek's output on anything
  touching real function signatures without checking each call site against
  the actual file** — grounding it in literal pasted signatures still wasn't
  enough here.
- **A pre-existing `App.js` guard effect** (`if (!visibleTabs.some(t => t.key
  === tab)) setTab('home')`) silently broke every new secondary destination
  (Settings/History/Reports/Wallets/Budget) the moment they stopped being
  primary tabs — it reset `tab` back to Home instantly. Fixed via
  `SECONDARY_SCREEN_KEYS` exemption in commit `899fec7`. If any *new*
  secondary destination gets added later, it must be added to that same
  `SECONDARY_SCREEN_KEYS` array in `App.js` or it will silently bounce to
  Home exactly the same way.
- **A static contract test encoded the very behavior the design spec
  prohibits** (`tests/r04-phase6-9-contract.test.cjs` asserted the
  onboarding account-type selector must exist). Removing the selector broke
  that test — correctly. It was root-caused and the assertion updated to
  match the new, intentional contract (not deleted, not skipped). Worth
  re-reading that whole test file once before any further onboarding or
  Settings/Legacy work, since it encodes several other "must contain this
  exact string" checks that are easy to break unintentionally.
- **Commitments live in the V7 financial ledger** (`entityType: 'commitment'`
  via `commitEntityChangesV7`, stored in `ledger_entities_v7.payload_json` —
  a JSON blob column, confirmed by reading the actual `CREATE TABLE`
  statement, not assumed). Any future commitment field addition follows the
  same low-risk pattern subType did (JSON key, not a schema/column change) —
  but always verify the schema directly rather than assuming, the way this
  session did via `myfi-financial-impact-check`.
- **Color guidance reversal mid-session:** the user explicitly said to
  prefer the app's *existing* colors over the (not-yet-applied) design-token
  catalog's new muted-palette recommendations. `MyMoneyScreen.js`'s gateway
  tones were built once with catalog hex, then corrected to `CAT_COLORS`
  values already live elsewhere in the app. If touching colors anywhere
  else, check `CAT_COLORS` (`src/lib/constants.js`) and the existing
  `theme.js` semantic tokens (`primary`/`transfer`/`warn`/etc.) first —
  don't reach for `04_MYFI_DESIGN_TOKEN_CATALOG.md`'s new target values
  unless there's truly no existing alternative.

## Immediate next action for Implementation 5

1. Read this file, then the 3 evidence files above, in order.
2. Confirm current git state matches: `git log --oneline -6` on
   `impl/nav-shell-step3-2026-08-26` should show the 5 commits listed above
   on top of `6cd1886`.
3. Either retry the subType picker's live browser verification (item 1
   above), or move straight to whatever Planning & Audit assigns next —
   check in with them (peer session `claude-2b` as of this handoff, name may
   change again after a restart) before starting new work, same coordination
   pattern used all session.
4. Nothing here needs emergency handling — the branch is in a clean,
   fully-reviewed, fully-tested state at every commit. This handoff exists
   because of session budget, not because anything is broken or blocking.
