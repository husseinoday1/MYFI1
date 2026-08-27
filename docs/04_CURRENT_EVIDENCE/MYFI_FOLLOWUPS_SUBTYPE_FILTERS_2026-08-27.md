# Follow-ups: Installments / Subscriptions filter chips (2026-08-27)

Priority 3 of the Planning & Audit batch. Completes the last outstanding piece
of the original Step 6 gap: the commitment `subType` classification was a
display badge only; it is now something you can filter the Follow-ups list by.

Session: Implementation 5. Branch `impl/nav-shell-step3-2026-08-26`.

## What changed

One file, `src/screens/TrackersLabScreen.js`.

Installment and subscription are **not tracker kinds** — they are a
classification *inside* the `monthly` kind — so the two new chips cannot use
the existing `item.kind === filter` path. They filter on
`item.commitment.subType` instead:

```js
const commitmentsOfSubType = (subType) =>
  currentTrackers.filter(item => item.kind === 'monthly' && item.commitment?.subType === subType);
```

- Each chip appears **only when it has something in it**, the same rule the
  existing `ended` and `archived` chips already follow, so the bar stays short
  for anyone who does not use the classification.
- Both chips are additionally gated on `modules.commitments`, like the
  `monthly` chip, so turning the commitments module off cannot leave an
  orphaned chip behind.
- `installmentCount` / `subscriptionCount` were added to the existing
  "filter no longer exists → fall back to All" effect's dependency list.
  Without that, archiving the last installment while the Installments chip was
  selected would have left the user staring at an empty list under a chip that
  had already disappeared.
- Counts and the visible list both derive from `currentTrackers`, so ended and
  archived commitments are excluded — consistent with every other kind chip.

No change to the tracker rows themselves, to any total, or to any financial
calculation. `filter` is used in exactly two places (the chip highlight and the
visible list) and is never treated as a tracker kind for creation, which was
checked before adding non-kind values to it.

## Financial impact

```
Financial Data:     NONE — a list filter; no value read, written, or derived differently
SQLite Schema:      NONE
Migration Required: NO
Existing User Data: PRESERVED — commitments with no subType normalize to 'general'
                    and simply do not appear under either new chip
```

## Live verification (Expo web, fresh account through onboarding)

- **Empty state:** with no commitments, the bar shows only
  `All · Debt I owe · Saving · Commitments` — **neither new chip appears.**
- Created three commitments: `Rent` (general), `Car loan` (installment, 12),
  `Streaming` (subscription).
- Bar became `All 3 · Debt I owe 0 · Saving 0 · Commitments 3 · Installments 1
  · Subscriptions 1` — counts correct, and the general commitment is counted in
  Commitments but in neither new chip.
- Tapping **Installments** showed only `Car loan`, badged
  "Installment · 12 of 12 left".
- Tapping **Subscriptions** showed only `Streaming`, badged "Subscription".
- Browser console: **no errors.**

### Two earlier fixes re-confirmed live in the same pass

- **Input clamp:** typing `1200` into "Number of installments" leaves `600` in
  the field — what the user sees is exactly what gets stored, instead of the
  value being silently discarded at save time.
- **Form reset:** reopening the commitment form after saving an installment
  shows "General" again, and the installments field is gone (input count back
  to 2) — the `commitmentSubType` leak from commit `7f87611` is closed.
- **Subscription form:** no installments field is offered, as intended.

## Gates

- `npm run test:gate:static`: **70 passed / 1 failed / 11 skipped** — the
  documented baseline. The one failure is `ui-contract`'s
  "Light and dark themes must preserve green income and red expense colors",
  re-confirmed pre-existing this session by stashing all `src/` and `tests/`
  changes and watching the identical assertion fail without them.
- `npm run verify:android`: clean.

No new automated test: this change adds no branch that a repeat action could
break and touches no financial state — the derived-counter and completion-guard
behaviour it surfaces is already covered by the repeat-action test in
`tests/financial-core.test.mjs`.

## Status

Not pushed — held for explicit user push approval per the standing git safety
rule. Note that `.github/workflows/ci-test-gate.yml` (commit `84427f0`, added
to this branch by Planning & Audit) will only start producing the named green
run ID the standing rules require **once this branch is actually pushed**; no
CI acceptance is claimed here, only local gates.
