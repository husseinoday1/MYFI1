# MYFI — Canonical Visual Identity

**Registered:** 2026-08-25
**Status:** CANONICAL
**Inputs:** `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`
(target authority), `docs/04_CURRENT_EVIDENCE/MYFI_PRODUCT_DESIGN_BLUEPRINT_RECONCILIATION_2026-08-25.md`
(current-vs-target evidence), `docs/design/14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`
(approved mockups, REF-01 through REF-07), and direct repository evidence
(`src/lib/theme.js`, `src/lib/tokens.js`, `src/lib/constants.js`) verified at
HEAD `d2ed3ae03c137d818040dfe77c665c516b8440b7`.

This document defines what MYFI should *feel like*. `03_MYFI_DESIGN_SYSTEM_CANONICAL.md`
defines the components that deliver it, and `04_MYFI_DESIGN_TOKEN_CATALOG.md`
defines the exact values.

## 1. Design philosophy

MYFI is a **local-first, financially trustworthy** tool, not a lifestyle app.
Every visual decision should read as calm confidence, not excitement. A user
should be able to scan a screen once and know what happened to their money —
the design's job is legibility and trust, not delight-through-decoration.

## 2. Brand personality

Calm · stable · human · financially trustworthy · modern · premium without
luxury excess · professional · easy to scan · Arabic/RTL-native · strong but
restrained · consistent across Light and Dark.

**MYFI must not feel:** futuristic, neon, gaming-like, crypto-like, visually
noisy, excessively colorful, overloaded with gradients, overloaded with cards,
dependent on heavy shadows, or like unrelated screens stitched together.

## 3. Olive/green brand identity

The existing brand color is confirmed and kept: `BRAND_GREEN = #138A57`
(`src/lib/theme.js:1`). REF-01, REF-04–REF-07 all confirm this exact green as
the wordmark, primary-action, and hero-card color across every approved
reference. This is the one accent color of the product.

**No user-selectable accent color exists.** REF-07 shows a 5-swatch "accent
color" picker in its Settings → Appearance detail; per the Blueprint's
explicit rule (§8/§13) and this phase's own instruction (§2, listing
"user-selectable accent color" as a discrepancy example), **that picker is
not canonical** — it is documented in the Visual Reference Register as a
conflict, not adopted here. If accent personalization becomes a real future
feature, it requires an explicit new Product Owner decision, not a silent
carry-over from a mockup.

## 4. Color governance

**Confirmed current defect (must be corrected during implementation):**
`inc` (income) and `primary` (brand) currently resolve to the identical
literal token, `BRAND_GREEN` (`theme.js:11,16`). Per the latest Product Owner
correction (§3.2 of the 2026-08-25 instruction), the rule is:

> Brand and income must be independent **semantic roles** and must not be
> coupled through the same source token. They may still *resolve* to the same
> visible color today, as long as changing one does not silently change the
> other.

This is a governance/architecture requirement (see `04_MYFI_DESIGN_TOKEN_CATALOG.md`
for the concrete token split), not a demand for a new visible color.

**Semantic financial colors are independent of decorative brand colors.**
Income, expense, transfer, positive, warning, danger must each be their own
token. Two gaps are confirmed absent from the codebase today: no `danger`
token, no `transfer` token (transfers currently borrow `primary`,
`HistoryScreen.js:465`) — both are closed in the token catalog.

**Color is never the only signal.** The existing `FinancialDirectionMark`
pattern (`src/components/AppPrimitives.js:11-21` — literal +/− glyph plus an
accessibility label, used in `HistoryScreen.js:725-730`) is the confirmed,
correct pattern and must be the one used everywhere amounts are colored.

## 5. Category color governance

**Status: APPROVED (2026-08-26) — no longer an open decision.** Categories
**may** use a broader palette than the core brand identity — this is a
deliberate, controlled exception, not a violation of "restrained." Rules:

- Category colors must be muted/restrained enough to visually coexist with
  the olive/green identity — not neon, not oversaturated.
- Category colors must never replace or be confused with the core brand
  color, nor redefine income/expense/warning/danger semantics.
- Category colors must work in both Light and Dark, with accessible
  text/icon contrast.
- Color must not be the sole category identifier — pair with the category's
  icon and label, matching the "no color alone" rule.
- The palette must be centrally governed (one file, one definition) — not
  declared per-screen.
- Random, screen-local category colors are prohibited.

The current `CAT_COLORS` 12-hue palette (`src/lib/constants.js:344-348`) and
default category colors (`constants.js:153-160`) already exist as one central
definition (good — already centrally governed structurally) but include hues
more saturated than a "muted" reading of this rule, and two internal
near-duplicate hue pairs. The concrete audited value-by-value recommendation
is now in `04_MYFI_DESIGN_TOKEN_CATALOG.md` §Category tokens (approved
direction; exact final hex values still get a contrast/accessibility pass at
implementation time, but the *governance rule and the adjustment direction*
are settled, not open).

## 6. Light / Dark relationship

**Confirmed sound today:** `TH.light`/`TH.dark` in `theme.js` are two
structurally identical key sets — no theme-specific layout divergence was
found anywhere in the audited screens. REF-01, REF-06, REF-07 (all supplied
in both Light and Dark) confirm the same rule visually: identical layout,
hierarchy, and component geometry between themes, only color values differ.
This must remain the rule for every future screen: **Light and Dark are two
color expressions of one structure, never two designs.**

## 7. Typography

A type scale already exists (`TYPE` in `src/lib/tokens.js:6-13`: hero/title/
section/body/meta/tiny/caption) with a dedicated Arabic font
(`MYFI-Cairo`, applied globally via `src/lib/fonts.js`). This is the
canonical scale — see `04_MYFI_DESIGN_TOKEN_CATALOG.md` for exact values. The
defect is adoption, not design: 532 raw `fontSize` literals exist directly in
screen files against only 15 uses of `TYPE`. Closing that gap is a migration
task (`05_MYFI_COMPONENT_ARCHITECTURE.md`), not a new typography
decision.

## 8. Spacing, radius, elevation

`SPACE`, `RADIUS`, and `SHADOW` scales already exist in `src/lib/tokens.js`.
`SHADOW` is well-adopted; `SPACE`/`RADIUS` are lightly adopted (23/614 and
158/286 token-vs-literal ratios respectively, confirmed by direct code audit).
Visual hierarchy should come primarily from spacing, contrast, typography,
and grouping — **not** from stacking shadows or nesting cards, matching both
the Blueprint's explicit rule and the calm/restrained character of every
approved reference image (none of REF-01–REF-07 show heavy shadow stacking).

## 9. Iconography

`Ionicons` (`@expo/vector-icons`) is already the sole icon family across the
entire codebase (31 files, zero exceptions) — this is a genuine existing
strength and is confirmed as canonical. No new icon library should be
introduced. Icon containers in the approved references (REF-01 Quick Add
circles, REF-05 Follow-ups Quick Add circles, REF-04 gateway-card icons) use a
consistent rounded-square/circle container with a tinted background matching
the action's semantic color — this container pattern is canonical.

## 10. RTL

Arabic is first-class and is the primary language shown in every approved
reference. Existing RTL infrastructure (`src/lib/layout.js`:
`isRTL`/`textAlignFor`/`rowDirFor`/`writingDirectionFor`) is confirmed present
and used in the audited screens (e.g. `HistoryScreen.js:15`). This
infrastructure is canonical and should be extended to any new My Money/
Follow-ups/More screens, not reinvented.

## 11. Accessibility

Minimum requirements, consistent with the "no color alone" rule already
established: financial direction/sign must always pair a glyph or label with
color; touch targets on the Quick Add circles and bottom-nav items must meet
standard minimum sizes; contrast must hold in both themes for text on the
brand-green hero card (currently white-on-green, confirmed adequate in both
REF-01 variants).

## 12. Motion

No motion system currently exists in the audited code beyond
`PressableScale.js` (a generic pressable scale-animation primitive). No
motion principles were demonstrated in the static image references (motion
cannot be shown in a still mockup). Motion rules are deferred to
`03_MYFI_DESIGN_SYSTEM_CANONICAL.md` as a proposal, not a confirmed target.

## 13. Responsiveness

Not evaluated in this pass — no multi-device-size evidence was available in
the approved references or in this audit's code inspection. Deferred.

## 14. Prohibited visual drift — examples

- Introducing a second brand accent color, or a user-selectable one (REF-07's
  picker is explicitly rejected, see §3).
- Declaring a new one-off color inline in a screen file instead of a token
  (confirmed existing violations: `TrackersLabScreen.js:144`,
  `ReportsScreen.js:23` `CHART_COLORS`, raw hex mixed with tokens at
  `ReportsScreen.js:840,966,984`).
- Letting Dark mode diverge structurally from Light (not currently happening
  — keep it that way).
- Adding a payment-method/card/bank, VAT, or rounding-method settings surface.
  **Status: REJECTED FOR CURRENT TARGET (2026-08-26).** REF-07's "طرق الدفع"
  and VAT/rounding rows are not approved MYFI capabilities and must not be
  inferred from mockup artifacts into any implementation — see the Visual
  Reference Register and Blueprint Revision Map. Reintroducing either requires
  a fresh, explicit product requirement, not a carry-over from this mockup.
