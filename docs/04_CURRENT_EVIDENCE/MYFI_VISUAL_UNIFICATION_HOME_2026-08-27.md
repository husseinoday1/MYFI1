# Visual-identity unification — Home (2026-08-27)

Phase A, item 1 of the REF-01..07 visual-identity pass (plan:
`modular-churning-hamster.md`). Scope: colors/contrast only, matching
`docs/design/assets/REF-01-home.jpeg`. No structure, no navigation, no
financial computation touched.

## What changed

`src/screens/HomeScreen.js` — the hero card used `th.primaryContainer` /
`th.onPrimaryContainer`, a pale "soft container" tint
(`#DCEFE5` light / `#15382A` dark). REF-01 shows a **solid brand green**
hero card (same saturated green in both themes), with white text. Confirmed
by reading `src/lib/theme.js`: `th.primary` = `#138A57` (BRAND_GREEN),
`th.onPrimary` = `#FFFFFF` — the actual pair the image shows.

Swapped every hero-card color reference from the `*Container` pair to the
plain `primary`/`onPrimary` pair: card background, balance amount, hero
label (now a semi-transparent white instead of `th.sub`, which was a muted
gray meant for a light card, not a solid green one), the hide-balance eye
icon, both texts in each period pill, and the wallet-summary row icon/text.

**Bonus fix caught by this pass:** the period-pill overlays added this
session (`rgba(255,255,255,0.10/0.22)`) were tuned assuming a saturated
background — against the old pale `#DCEFE5` light-theme tint they would have
been nearly invisible (a real contrast bug, not by design). Fixing the
background color fixes this too, verified live below.

## Financial impact

NONE — pure color swap, no value, label wording, or calculation changed.
`heroBalance` (`getWalletBaseAvailableTotal`) and the "Available balance"
label are both unchanged from the last commit.

## Live verification (Expo web)

- Light theme: hero card background confirmed `rgb(19, 138, 87)` via
  `getComputedStyle` — exact BRAND_GREEN hex `#138A57`.
- Dark theme (`resize_window` colorScheme: dark + reload): same
  `rgb(19, 138, 87)` — solid brand green in both themes, matching REF-01's
  side-by-side light/dark reference exactly.
- Period pills and wallet-summary row render with visible white text/icons
  against the green background in both themes.
- Browser console: no errors after the fix (a syntax error from an
  intermediate edit — JSX-comment syntax used in a non-JSX-children
  position — was caught by the live reload immediately and corrected before
  this commit; not present in the committed diff).

## Explicitly not changed (flagged, not silently done)

- Hero label stays "Available balance" / "الرصيد المتاح", not REF-01's
  "الرصيد الكلي" — `heroBalance` is net of reserved savings, so "Total"
  would misdescribe the figure. User confirmed this ruling earlier in the
  session.
- The hide-balance eye-icon button (a real privacy feature) was kept as-is
  rather than replaced with REF-01's wallet-shortcut icon in the same slot —
  that would be a functional change, not a color one, and Home's scope this
  session is visual-only (unlike Follow-ups/My Money).
- Month-summary tile count (4 tiles vs REF-01's 3-column layout): the tile
  set is user-configurable (`cfg.homeCards`, a real settings feature), so
  forcing a fixed 3-column layout risked breaking that customization. Left
  as-is — visual-only tone/spacing changes to the existing tiles were judged
  in scope, a structural change to a configurable feature was not, and no
  such change was made.

## Gates

- `npm run test:gate:static`: **70 passed / 1 failed / 11 skipped** —
  documented baseline (`ui-contract` theme-color assertion).
- `npm run verify:android`: clean.

## Status

Not pushed — held for explicit user push approval per the standing git
safety rule.
