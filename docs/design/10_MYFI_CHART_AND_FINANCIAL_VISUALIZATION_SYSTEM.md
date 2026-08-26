# MYFI — Chart and Financial Visualization System

**Status:** CANONICAL · **Created:** 2026-08-26
**Correction this document exists to satisfy (per Product Owner ruling
§3.6):** Reports migration must **not** be reduced to "replace local chart
colors with canonical tokens." That is one technical cleanup item inside a
much larger Reports/Product-UX workstream, defined here.
**Basis:** `ReportsScreen.js` (2,211 lines, confirmed live, primary tab
today), the My Money approved reference's Reports & Analytics gateway
preview (`14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`, REF-04), and the
Plan & Budget gateway preview (donut chart + category breakdown, same
reference).

Reports remains a **dedicated full destination**, reached through My Money
— not reduced to a bare summary card. The current `ReportsScreen.js` UI is
not automatically canonical merely because its business logic is reusable
(per Product Owner ruling); this document defines the target it should be
evaluated against.

## 1. Report taxonomy

Confirmed-supported today (evidenced in code and/or approved references) —
these are the reports the target design must cover, not a wishlist:

| Report | Evidence it's supported | Notes |
|---|---|---|
| Income vs. Expense | `ReportsScreen.js` month summary; My Money Reports preview ("دخل/مصروف/التوفير") | Core, always available |
| Spending analysis (by category) | `ReportsScreen.js` category breakdown; "top 5 categories" in My Money preview | Core |
| Spending trends | `ReportsScreen.js:23` `CHART_COLORS`-driven trend chart (`TrendChart`) | Core |
| Period comparison | `ReportsScreen.js` month/period selector | Core |
| Budget performance | Plan & Budget gateway preview (donut chart, monthly budget vs. actual vs. remaining, category % breakdown) | Core, feeds from Plan & Budget, surfaced in Reports too |
| Commitments / due items | Follow-ups summary counters (upcoming commitments/installments) | Cross-referenced from Follow-ups, not duplicated logic |
| Goals / savings | Follow-ups goal progress bars | Cross-referenced from Follow-ups |
| Debts / receivables | Follow-ups debt/receivable totals | Cross-referenced from Follow-ups |
| Wallets / currencies | My Money Wallets & Accounts gateway (per-wallet, per-currency balances) | Core |
| Cash flow | Not separately evidenced as an existing distinct view — implied by Income/Expense + period data already present | Build from existing data, not new financial logic |

**Not currently supported — FUTURE / CONDITIONAL, do not build now:**

- **Net worth** — no assets/liabilities model exists in the codebase; this
  report must not be built until such a model is separately supported and
  approved.
- **Financial forecast** — no forecasting logic was found in the audit; a
  forecast view is only justified once real predictive logic exists, and
  must present uncertainty explicitly (a range, not a false-precise number)
  when it does.

## 2. Per-report structure (applies to every report above)

```
Summary → Chart/visualization → Interpretation → Drill-down →
Related transactions → Action / Next step
```

- **Summary:** the headline number(s) first (matches the confirmed pattern
  in the My Money Reports/Budget previews).
- **Chart:** the smallest chart that answers the question — a donut for
  category share, a trend line for change over time, bars for period
  comparison. Do not add a chart that doesn't answer a financial question
  (Blueprint's own "avoid decorative charts" rule, carried forward).
- **Interpretation:** a plain-language line, not just a number (e.g. "أعلى
  إنفاق هذا الشهر: المواصلات" — confirmed pattern in the My Money preview).
- **Drill-down:** tapping a category/period/segment goes somewhere specific,
  not nowhere.
- **Related transactions:** the drill-down's natural end state is a
  filtered transaction list (reuses History's existing filter/search
  infrastructure — do not duplicate it).
- **Action/Next step:** where applicable (e.g. a budget report might link to
  adjusting the budget; a debt report links to Follow-ups' payment action).

## 3. Chart-selection principles

- One chart type per question; do not stack multiple chart types on one
  card to look "richer."
- Donut/pie: category share of a whole (budget breakdown, spend by
  category).
- Line/trend: change over time (spending trend, income trend).
- Bar: period-to-period comparison.
- No chart type is introduced without a corresponding entry in this table.

## 4. Color usage

Charts source color from the same governed system as the rest of the
product — **not** a fourth, independent palette. Confirmed current defect:
`ReportsScreen.js:23` declares its own `CHART_COLORS`, disconnected from
`src/lib/theme.js`/`tokens.js`. Target:

- Category-share charts use `category.palette` (see
  `04_MYFI_DESIGN_TOKEN_CATALOG.md`, the audited/muted 12-hue set).
- Income/Expense/Net charts use `financial.income`/`financial.expense`/a
  neutral tone for Net — never a decorative color for these three.
- Semantic colors (warning, danger) are reserved for genuinely
  warning/danger data points (e.g. over-budget), not decoration.
- This is a **color-sourcing rule**, not a chart-logic rebuild — the
  reconnection itself is the one legitimate "technical cleanup" item the
  Product Owner's correction says not to treat as the *whole* scope.

## 5. Axes, labels, legends, tooltips

- Axis labels and legends must be legible in Arabic and mirror correctly in
  RTL layouts (numerals and dates follow the project's existing date/number
  conventions, not reinvented per chart).
- Tooltips/selected-point detail shows the exact figure the summary
  rounds — never a number the user cannot reconcile with the summary above
  it.
- Legends use the same category names and colors as everywhere else in the
  app — a category must look identical in a chart legend and in a
  transaction row.

## 6. RTL

Chart labels, legends, and axis direction must respect RTL — dates read
right-to-left in context, category lists in legends follow the same
row-direction helpers as the rest of the app (`src/lib/layout.js`). Not yet
exhaustively verified per chart type — see
`09_MYFI_ACCESSIBILITY_RTL_AND_RESPONSIVE.md`.

## 7. Light/Dark

Chart colors must hold contrast and remain visually correct in both themes
— sourced from the same token system as everything else, so this follows
automatically once `CHART_COLORS` is reconnected (§4). Not yet independently
verified per chart on a real device.

## 8. Comparison and drill-down

Period comparison (this month vs. last month, or vs. a chosen period) is a
first-class capability, not a stretch goal — it's already present in
`ReportsScreen.js`'s period selector. Drill-down always terminates in either
a related-transactions list or another report, never a dead end.

## 9. Empty / loading / error states

Follow the app-wide states defined in `11_MYFI_SYSTEM_STATES_AND_FEEDBACK.md`
— a report with no data explains what's missing and why (e.g. "no
transactions in this category yet"), not a bare blank chart.

## 10. Accessibility

Charts are not the only carrier of their information — the Summary step
(§2) must state the headline finding in text, so a screen-reader user gets
the same information a sighted user gets from the chart. Full accessibility
rules: `09_MYFI_ACCESSIBILITY_RTL_AND_RESPONSIVE.md`.

## 11. Forecast and uncertainty (future/conditional only)

If a forecast capability is ever approved: it must visually distinguish
projected data from actual data (e.g. a dashed line, a shaded range) and
must never present a single false-precise number as if it were fact. Not
applicable until the underlying forecasting logic exists and is separately
approved.
