# Follow-ups hub rebuild (2026-08-27)

Phase B of the REF-01..07 visual-identity pass (plan: `modular-churning-hamster.md`).
The one real IA gap found comparing the app to the real reference images: Follow-ups
was a flat filtered list; REF-05 shows a hub (summary counts, needs-attention list,
quick-add, 6 numbered gateway cards to detail screens). User explicitly authorized
this restructure (not visual-only) after seeing the gap.

Session: Implementation 5. Branch `impl/nav-shell-step3-2026-08-26`.

## Execution note

Per the user's mid-session direction, the new screen's code was drafted by
DeepSeek (`deepseek-v4-pro`, given the multi-step reasoning involved), with
this session reviewing every line before applying — same discipline as
reviewing any other generated code, and the same standard the Step-3
handoff already documented was necessary given DeepSeek's prior wrong-output
incidents on this branch. The `App.js` navigation wiring was done directly
by this session, not delegated — it touches the app's locked 4-tab
architecture and existing deep-link behavior, where a wrong prop name fails
silently rather than throwing.

## What changed

### `src/screens/TrackersLabScreen.js`
One-line addition: `initialFilter = 'all'` prop, seeding the existing
`useState('all')` for `filter` instead of the previous hardcoded value.
Every other line of this 1496-line screen is untouched.

### `src/screens/FollowUpsHubScreen.js` (new)
Thin hub screen, same shape as `MyMoneyScreen.js`: page intro, a 5-tile
summary-counts row, the existing 4-button quick-add pattern (reused
verbatim from `TrackersLabScreen.js`'s `onNewTracker({ trackerType })`
calls), a "needs attention" list (shown only when non-empty), then 6
`GatewayCard`s. No new financial calculation: every count/value is read
from `debtSummary`, `goalSummary`, `getUpcomingCommitments`, or
`getUpcomingRecurring` — all pre-existing helpers already used by Home or
TrackersLabScreen. `getUpcomingCommitments` is called exactly once (via
`useMemo`) and its result filtered three ways by `.subType`, not called
three times.

### `App.js`
- `trackers` (the primary, locked Follow-ups nav tab — `BASE_TABS`/`HUB_TABS`,
  per `docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` §1)
  now renders `FollowUpsHubScreen` instead of `TrackersLabScreen` directly —
  the exact same pattern `mymoney` already uses for `MyMoneyScreen`.
- **Caught before it shipped:** the full/unfiltered `TrackersLabScreen`
  (with `focusRequest`) is still needed — 4 call sites use
  `setTrackerFocus(...)` + `setTab('trackers')` for notification deep-links
  and quick-pay/save/commitment shortcuts, which need the *specific item*
  the notification points at, not a hub. Swapping `trackers`'s content to
  the hub without addressing this would have silently broken every one of
  those deep-links (they'd land on the hub, focus lost). Fixed by adding a
  new secondary key, `followupsAll`, that renders exactly what `trackers`
  used to render, and repointing all 4 `setTab('trackers')` call sites to
  `setTab('followupsAll')`.
- 5 new secondary keys added, each `<TrackersLabScreen initialFilter="...">`:
  `followupsDebts` ('owed'), `followupsCommitments` ('monthly'),
  `followupsInstallments` ('installment'), `followupsSubscriptions`
  ('subscription'), `followupsGoals` ('saving'). All 6 new keys
  (`followupsAll` + the 5) added to `SECONDARY_SCREEN_KEYS` — the exact
  guard the Step-3 handoff already documented: a secondary destination
  missing from that array gets silently bounced back to Home by the
  existing `App.js` guard effect. The generic "back to hub" bar
  (`isSecondaryScreen = !HUB_TABS.includes(tab)`) needed no per-screen
  wiring — it already applies to any tab outside `HUB_TABS`.

## DeepSeek output review (before applying)

Two real issues found and fixed:
1. `formatCommitmentDate(item.dueISO)` — the function's real signature is
   `formatCommitmentDate(dateISO, lang = 'ar')`; omitting the second
   argument would have rendered every due-date in Arabic regardless of the
   app's actual language setting. Fixed to
   `formatCommitmentDate(item.dueISO, lang)`.
2. `onQuickPay`/`onQuickSave`/`onQuickCommitment` were accepted as props but
   never called anywhere in the file — dead code. Removed from the
   signature; the hub only needs `onNewTracker` for its quick-add row.

Confirmed correct on review: `getUpcomingCommitments` called once and
filtered by `.subType` three ways (not three separate calls); every
`money()`/summary value traced to an existing helper with no new arithmetic;
the two-color-tone reuse (`CAT_COLORS[6]`/`CAT_COLORS[2]` for
installments/subscriptions, matching `MyMoneyScreen.js`'s own budget/reports
tones) follows the same "reuse existing colors, don't invent catalog hex"
rule already documented there.

## Financial impact

```
Financial Data:     NONE — every figure is read from an existing summary/
                    upcoming helper; no new posting, write, or calculation
SQLite Schema:      NONE
Migration Required: NO
Existing User Data: PRESERVED — commitments/debts/goals unchanged; this is
                    a navigation and display-aggregation change only
```

## Live verification (Expo web, real data: 1 debt-free scope, 1 commitment,
1 installment "Car loan", 1 subscription "Streaming")

- Follow-ups tab now opens the hub: summary row correctly reads
  `Commitments 1 / Installments 1 / Subscriptions 1 / Goals 0 / Debts 0`.
- "Needs attention" lists all three due items with correct dates/amounts.
- Tapping "View installments" → lands on the `installment`-filtered list,
  showing only "Car loan" (`Installment · 12 of 12 left`).
- Tapping "View subscriptions" → shows only "Streaming".
- Tapping "View debts" with zero debts → graceful "No trackers yet" empty
  state, no crash.
- "Back" bar present and functional on every drill-through screen, returns
  to the hub.
- Quick-add "Goal" button from the hub opens the Saving-creation modal
  (`onNewTracker({ trackerType: 'goal' })`) — confirms the hub's quick-add
  row is correctly wired, not just visually present.
- Browser console: no errors (an accumulated stale error from an earlier,
  already-fixed syntax mistake this session persisted in the console log
  buffer across reloads but does not reflect current app state — confirmed
  by the app rendering and navigating correctly throughout).

## Gates

- `npm run test:gate:static`: **70 passed / 1 failed / 11 skipped** —
  documented baseline (`ui-contract`'s theme-color assertion). Specifically
  checked `ui-contract.test.cjs` has no assertion assuming `App.js`'s
  `trackers` key renders `TrackersLabScreen` directly — confirmed none does.
- `npm run verify:android`: clean.

## Status

Not pushed — held for explicit user push approval per the standing git
safety rule.
