# Home: REF-01 period pills + health-pill relocation (2026-08-27)

Priority 4 of the Planning & Audit batch. User-approved design (REF-01,
`docs/design/14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`), not an open
option. Health-pill not deleted — relocated to Needs Attention.

Session: Implementation 5. Branch `impl/nav-shell-step3-2026-08-26`.

## What changed

- `src/utils/calc.js`: `homePeriodPills(trans, date)` — Today/Week/Month/Year
  net figures. **No new financial math**: every period calls the existing
  `calcStats()` (the same function `buildFinancialSnapshot`'s `month` already
  uses) on a date-sliced array; only the slicing is new. Week start reuses the
  app's one existing calendar convention (`DateField.js`'s month grid,
  Saturday: `(getDay() + 1) % 7 === 0`) rather than inventing a new one.
- `src/screens/HomeScreen.js`:
  - Hero card: health pill/text removed; four period-pill buttons added below
    the balance, each always showing its own net delta. Tapping one only
    changes which is highlighted (`activePeriod`) — it does **not** change
    `heroBalance`, which stays the point-in-time available balance regardless
    of period (a "balance for today" is not a distinct figure from the total).
  - Needs Attention: a health-status banner now renders inside this section,
    **only when `snapshot.health` is `danger`/`warning`/`watch`** — not for
    `safe` or `neutral` (the empty-account state), per the "only when
    meaningful" spec wording.

## Financial impact

```
Financial Data:     NONE — calcStats() is existing code; only the date-range
                    slicing feeding it is new, and slicing does not change
                    what income/expense/transfer means
SQLite Schema:      NONE
Migration Required: NO
Existing User Data: PRESERVED
```

## Self-review finding (caught before the code-review pass, fixed)

The Needs Attention section was already gated by
`item.key !== 'attention' || modules.recurring || modules.commitments` —
pre-existing, guarding the due-commitment/recurring rows. Co-locating the
health banner in the same section made it inherit that gate: a user with both
those modules turned off would never see a genuinely meaningful health status,
which contradicts "only when meaningful" (module state is not the same as
meaningfulness). Fixed by adding `|| healthNeedsAttention` to the gate.

## Live verification (Expo web)

- Fresh account: hero shows `Available balance / 0 $` and four pills all at
  `0`, no health text anywhere in the hero.
- Added a 100,000 income entry dated today: all four pills correctly show
  `+100,000` (day/week/month/year all include today).
- With three due commitments present (health = danger), Needs Attention shows
  **"The month-end forecast may go negative."** as a banner above the
  itemized commitment rows — confirming the relocation and the section's
  content, not just its visibility.
- Confirmed no lingering `healthPill`/`healthText` style or health chip
  anywhere in the hero markup.
- Browser console: no errors, both before and after the self-review fix.

## Gates

- `npm run test:gate:static`: **70 passed / 1 failed / 11 skipped** — the
  documented baseline (`ui-contract`'s theme-color assertion).
- `npm run verify:android`: clean.
- `/code-review` (medium): see findings section below.

## Status

Not pushed — held for explicit user push approval per the standing git safety
rule.
