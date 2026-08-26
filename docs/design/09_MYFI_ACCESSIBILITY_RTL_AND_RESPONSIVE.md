# MYFI — Accessibility, RTL, and Responsive

**Status:** CANONICAL · **Created:** 2026-08-26 (new document, consolidating
RTL/accessibility content previously scattered across the visual identity
and design system documents, per the Master Blueprint rebuild)
**Basis:** direct code evidence (`src/lib/layout.js`,
`src/components/AppPrimitives.js`) at HEAD
`d2ed3ae03c137d818040dfe77c665c516b8440b7`, and the approved visual
references (all Arabic, all RTL).

This document explicitly separates **CONFIRMED RULES** (verified against
code or an approved reference) from **IMPLEMENTATION VALIDATION ITEMS**
(require a real Expo/device pass before they can be called proven). Nothing
here claims responsiveness or accessibility is already proven where device
evidence does not exist.

## CONFIRMED RULES

### RTL

- Arabic is the primary language in every approved visual reference; RTL is
  first-class, not an afterthought.
- Existing infrastructure is sound and canonical:
  `src/lib/layout.js` — `isRTL`, `textAlignFor`, `rowDirFor`,
  `writingDirectionFor`. Confirmed in use, e.g. `HistoryScreen.js:15`.
  Extend to My Money/More (new screens), do not reimplement locally.
- Do not mechanically mirror everything — some elements remain logically
  unchanged regardless of direction (e.g. numeral formatting conventions,
  which are a separate concern from layout direction).

### Financial direction convention

- **Income is UP, Expense is DOWN** (corrected 2026-08-26 — a prior
  reference/documentation draft had this reversed; see
  `14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`, REF-01).
- Financial meaning is never conveyed by color alone: the confirmed pattern
  is signed amount + color + accessible label, via
  `FinancialDirectionMark` (`src/components/AppPrimitives.js:11-21`),
  already used correctly at `HistoryScreen.js:725-730`. Extend this pattern
  everywhere amounts are shown; do not invent a second pattern.

### Light/Dark

- `TH.light`/`TH.dark` (`src/lib/theme.js`) are structurally identical key
  sets — confirmed no theme-specific layout divergence exists in the
  audited code. Every approved reference supplied in both themes (REF-01,
  REF-06, REF-07) confirms the same structural parity visually.

## IMPLEMENTATION VALIDATION ITEMS (require Expo/device evidence)

- **Contrast:** white-on-brand-green text (Home hero card) reads adequately
  in the static references; a formal contrast check against WCAG thresholds
  in both themes has not been performed.
- **Touch target sizing:** Quick Add circles, bottom-nav items, and icon
  buttons have not been measured against minimum touch-target guidelines on
  a real device.
- **Screen-reader labels:** icon-only controls need explicit accessibility
  labels; none were verified end-to-end in this pass beyond the
  `FinancialDirectionMark` example above.
- **Dynamic type / font scaling:** not evaluated — no evidence either way.
- **Responsive behavior across device sizes:** no multi-device evidence was
  available in the approved references or the code audit. Small/normal/
  large phone behavior, and whether tablets are in scope at all, are open
  implementation questions, not decided here.
- **RTL edge cases:** mixed Arabic/English runs, chart label direction, and
  date/numeral formatting in context have not been exhaustively verified
  per screen — only the general infrastructure's existence is confirmed.
- **Reduced motion:** no motion system exists yet to evaluate (see
  `03_MYFI_DESIGN_SYSTEM_CANONICAL.md` §15); reduced-motion support is a
  requirement on whatever motion system implementation eventually builds,
  not yet applicable.

## Governing rule

Per the Master Blueprint's implementation-validation philosophy: none of the
items above block design completion, and none may be used to reopen the
locked product architecture. They are exactly the kind of finding the
Expo/device feedback loop (`01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md` §18)
exists to close out.
