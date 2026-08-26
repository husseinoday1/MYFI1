# MYFI — Canonical Design System

**Registered:** 2026-08-25 · **Updated:** 2026-08-26 (Product Owner rulings
applied) · **Status:** CANONICAL
**Basis:** `02_MYFI_VISUAL_IDENTITY_CANONICAL.md`, `04_MYFI_DESIGN_TOKEN_CATALOG.md`,
`14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`, and direct code evidence at HEAD
`d2ed3ae03c137d818040dfe77c665c516b8440b7`.

**2026-08-26 ruling status:** Add Method location, Archive location, Settings
root (incl. Financial Preferences placement of Country/Base Currency), and
the rejection of accent-color/payment-methods/VAT rows are all reflected
below — see §2. Category-color and brand/income token governance are defined
in `04_MYFI_DESIGN_TOKEN_CATALOG.md` and referenced, not duplicated, here.

This document defines the component and interaction layer that delivers the
visual identity. It extends the existing architecture — `theme.js` +
`tokens.js` as the token layer, `src/components/` as the primitive/domain
layer — rather than replacing it.

## 1. Architecture (target)

```
Design Tokens (theme.js, tokens.js — extended per token catalog)
  → Theme access (NEW: one shared hook, replacing 19-file manual TH[cfg.theme])
  → Primitives (existing: AppPrimitives, PressableScale, ActionMenu, ChoiceSheet,
     DecisionModal, MultiSelect, DateField, AppAlertHost)
  → Reusable composite components (formalize: Button, FinancialAmount,
     SectionHeader, PageHeader — currently inline/ad hoc per screen)
  → Financial domain components (existing: WalletBalanceCard, AddTransModal,
     TransactionDetailsModal, AccountDeleteModal, NewItemModal, HomeCenterModal,
     EntryContextRow)
  → Screens (Home, My Money [new], Follow-ups, More [new], Settings, ...)
```

**Confirmed gap, not a redesign:** no `ThemeProvider`/context exists; every
screen independently does `TH[cfg.theme] || TH.dark` (19 files). Introduce one
shared hook (e.g. `useTheme()`) as the first primitive-layer change — this is
a maintainability fix, not a visual change.

## 2. Navigation

**Moved to its own document, 2026-08-26, to avoid duplicating authority:**
see `06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` for primary
navigation, the View/Add/Complex-flow rule set, the destination map, Add
Method location, Settings root, header pattern, and onboarding flow. This
document (03) covers only the component/interaction layer that *implements*
those rules — cards, buttons, inputs, feedback, charts (color-sourcing),
RTL/accessibility/theme consumption.

## 3. Cards

- **Hero card** (Home balance): solid brand-green, large white amount, one
  action icon-button (REF-01). Screen-specific — do not generalize this
  treatment to other cards.
- **Gateway card** (My Money's 4 cards, REF-04): icon + title + live stat +
  named link, opens a full page. Reusable as a `GatewayCard` composite.
- **Summary card** (Follow-ups summary strip, REF-05; Settings top card,
  REF-07): compact stat row(s) inside one card. Reusable as `SummaryCard`.
- **List-section card** (More's 5 rows, Settings' 5 rows, Follow-ups' 6
  rows): icon + title + one-line description + chevron. Reusable as one
  `SectionListRow` composite across More/Settings/Follow-ups rather than
  three separate implementations.

General rule (Blueprint §18, confirmed by every approved reference): avoid
excessive card nesting; hierarchy comes from spacing/typography/grouping, not
shadow stacking.

## 4. Buttons

No standalone `Button` primitive was found in `src/components/`; button
styling currently appears to be inlined per screen (not exhaustively
verified). **Formalize a `Button` primitive** with at minimum: primary
(brand-green fill), secondary (outline/soft), destructive (danger token),
and icon-button variants (used extensively for the Quick Add circles in
REF-01/REF-05 and the wallet icon-button in REF-01).

## 5. Inputs

`DateField.js` exists as a dedicated date-input primitive. Onboarding
references (REF-03B) show selector-style rows (chevron + current value,
opening a picker) rather than raw text inputs for Country/Language/
Currency/Appearance — this "selector row" pattern should be formalized as a
`SelectorRow` composite, reusable across onboarding and Settings.

## 6. Lists

Transaction-row pattern (REF-01 recent transactions, REF-04 History detail):
category icon (tinted circle) + label + timestamp + signed, colored amount.
Already close to existing `EntryContextRow.js` — consolidate rather than
build new. Follow-ups list rows (REF-05) add a leading colored accent bar
per item type — a variant of the same row pattern, not a new component.

## 7. Tabs / segmented controls

Confirmed pattern across History (filter tabs), Follow-ups sub-screens
(نشطة/قادمة/منتهية etc.), and Reports (نظرة عامة/الدخل/الإنفاق/الاتجاهات):
a horizontal segmented-tab control with one active state. Formalize as one
`SegmentedTabs` primitive; multiple screens currently likely implement this
ad hoc (not exhaustively verified per-file in this pass).

## 8. Chips / badges

Type pills in Follow-ups' "Needs attention" list (Commitment/Debt/
Subscription, REF-05) and status badges (verified-account checkmark,
REF-07) are both small labeled/colored indicators — formalize one `Badge`/
`Chip` primitive covering both, differentiated by fill vs. outline.

## 9. Modals / bottom sheets / dialogs

Existing primitives already cover this well: `ActionMenu.js`, `ChoiceSheet.js`,
`DecisionModal.js` (generic dialog), `AccountDeleteModal.js`/
`TransactionDetailsModal.js`/`NewItemModal.js` (domain-specific). Apply the
§2 navigation rule going forward: new "simple add" flows use a bottom sheet
(`ChoiceSheet`-style), new destructive confirmations use `DecisionModal`.

## 10. Feedback (toasts, alerts, empty/loading/error states)

`AppAlertHost.js` exists as the global toast/alert host — canonical, reuse
it. `Skeleton` exists in `AppPrimitives.js` — canonical for loading states.
No dedicated `EmptyState`/`ErrorState` composite was confirmed to exist;
formalize both, following the Blueprint's rule that empty states must
explain what's missing, why it matters, and give a next action (not just a
blank illustration).

## 11. Financial amount presentation

Canonical pattern, confirmed consistently across every approved reference
and the existing `FinancialDirectionMark` component: signed amount (+/−),
paired color (never color alone), currency code adjacent to the figure
(e.g. "IQD 16,778,000", REF-01), thousands separators. Formalize as one
`FinancialAmount` composite consuming `financial.income`/`expense`/
`transfer`/`danger` tokens, replacing ad hoc per-screen amount formatting.

## 12. Charts

`ReportsScreen.js` currently declares its own `CHART_COLORS` (`ReportsScreen.js:23`),
independent of the token system. REF-04's Reports/Budget previews (donut
chart, top-5-categories list) and the standalone Reports screen (bar/trend
charts, per prior audit) should converge on one chart palette drawn from
`category.palette` plus the semantic financial tokens — not a fourth,
separate palette. Full chart-system detail (axes, tooltips, legends,
drill-down) is deferred to the Reports-specific migration phase; this
document fixes the *color-sourcing* rule only.

## 13. RTL / accessibility / Light-Dark

Governed by `02_MYFI_VISUAL_IDENTITY_CANONICAL.md` §10-11-6 — this document
does not restate those rules, only requires every composite/primitive listed
above to consume them (via the shared theme hook and `src/lib/layout.js`)
rather than reimplementing RTL/theme logic locally.

## 14. Responsive rules

Not evaluated — no multi-device evidence available this pass (see Visual
Identity Canonical §13). Deferred.

## 15. Motion

No motion system exists today beyond `PressableScale`'s scale animation.
Proposal (not yet approved): card-press feedback via `PressableScale`
(already the pattern), bottom-sheet slide-up/down, modal fade, and a subtle
success-state animation for confirmations (matching REF-03E's onboarding
completion state, which uses static sparkle decoration rather than animation
in the reference — animate this in implementation if desired, not mandated).
