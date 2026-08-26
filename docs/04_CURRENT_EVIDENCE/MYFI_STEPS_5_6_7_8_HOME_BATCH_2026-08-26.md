# Roadmap Steps 5/6/7/8 + Home token pass + color-guidance correction (2026-08-26)

**Branch:** `impl/nav-shell-step3-2026-08-26`.
**Authorized by:** Planning & Audit, batch instruction relaying the user's
direction to complete these steps together rather than one-by-one, with
explicit exclusions (Step 4, Step 9, Step 10 — see below).

## Color-guidance correction (applies retroactively to Step 3's GatewayCard)

Per the user's direction (2026-08-26): prefer the app's existing/current
colors over importing new ones from the not-yet-applied design-token-catalog
palette. `MyMoneyScreen.js`'s `BUDGET_TONE`/`REPORTS_TONE` (used for the
Plan & Budget and Reports & Analytics gateway card icons) changed from the
catalog's new "target" muted hex values (`#8D7CB8`/`#C99860`, not used
anywhere else in the app) to `CAT_COLORS[6]`/`CAT_COLORS[2]` — the app's
actual, already-live 12-hue category palette (`src/lib/constants.js`), used
throughout Follow-ups/budgets today. Planning & Audit had already accepted
the original catalog-hex choice as a narrow documented exception (not a
CAT_COLORS lock-in), but the user's direct guidance takes precedence — fixed.

## Step 5 — Archive relocation

Moved Archive's entry point from Settings → Data & storage to More → My
Tools → Archive, per the roadmap text exactly ("Content/logic unaffected").
- `App.js`: `onOpenArchive` prop moved from the `settings` screens-map entry
  to the `more` entry (same `setArchiveOpen(true)` setter, same full-screen
  `ArchiveScreen` override — untouched).
- `SettingsScreen.js`: removed the Archive `MenuRow` from `DataPage`'s Backup
  section, and the now-unused `onOpenArchive`/`onArchive` prop plumbing
  (`SettingsScreen` signature, the prop passed into `DataPage`, `DataPage`'s
  own parameter list). No other Data page content touched.
- `MoreScreen.js`: added an "Archive" `SectionListRow` under My Tools, wired
  directly to the new `onOpenArchive` prop. `ArchiveScreen.js` itself: zero
  changes.
- Verified live: Archive opens correctly from More → My Tools → Archive,
  "Back" returns to More; Settings → Data & storage → Backup section now
  shows only Export/Restore backup, Archive row confirmed gone.

## Step 6 — Follow-ups rename + section-completeness audit

- Rename: done in Step 3 already (`BASE_TABS` English label "Trackers" →
  "Follow-ups"; the Arabic label "المتابعات" already matched).
- **Audit finding (not fixed, reported per the step's own framing —
  "confirm... exist or need adding"):** `TrackersLabScreen.js` implements
  exactly 4 tracker kinds — `owed` (debts I owe), `receivable`, `saving`
  (goals), `monthly` (commitments). The roadmap's target section list also
  names **Installments, Subscriptions, and Payment History** — none of these
  exist as distinct concepts: `src/lib/commitments.js` has no
  installment/subscription sub-typing on commitments, and there is no
  payment-history view. Building these would be new product/data-model work
  (possibly new commitment sub-types, or a new read-only report over
  existing commitment/debt payment links), not a token or label change — not
  attempted here. Needs its own scoped decision.

## Step 7 — Reports chart-color reconnection (the color-swap slice only)

`ReportsScreen.js`'s standalone `CHART_COLORS` (6 hardcoded hex values, only
used at one call site for category-indexed chart coloring) now aliases
`CAT_COLORS` from `src/lib/constants.js` — the same governed palette Reports
was supposed to reconnect to, and (per the color-guidance correction above)
the app's actual existing colors rather than new ones. 12 colors instead of
6 only improves category distinguishability at the same call site; no
computation/logic touched.

**Explicitly not done** (the roadmap itself frames this as separate,
larger work): "evaluate against the full report taxonomy and per-report
structure... this is a larger workstream than a color swap." That taxonomy
evaluation was not attempted.

## Step 8 — Onboarding conformance audit (finding only, not fixed)

Checked `OnboardingScreen.js` (390 lines, 3 slides: `HeroSlide` →
`InsightSlide` → `QuickSetupSlide`) against
`docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` §7 (LOCKED
6-step flow: Welcome → What matters to you first? → Customize your
experience → Create first wallet → Privacy first → Everything is ready).

**Significant, confirmed non-conformance, not fixed here:**
1. The live flow has 3 steps, not 6 — no distinct "create first wallet" step
   and no distinct "privacy first" step exist as separate screens.
2. `QuickSetupSlide` (step 3 of 3) includes a **Personal/Business/Dual
   account-type selector** (`profileType` state, `personal`/`business`/
   `mixed` values) — the locked spec explicitly prohibits this ("No
   Personal/Business/Dual account-type selection").
3. No opening-balance step exists (this one **does** conform — the spec
   also prohibits an opening-balance requirement).
4. No existing-user "What Changed" flow exists (spec calls for one instead
   of the full sequence on re-entry; not found).

`profileType`/`activeScope` are used pervasively across the app's data
filtering (`filterByActiveScope`, seen in `MyMoneyScreen.js`,
`PlanBudgetScreen.js`, `WalletBalanceCard.js`, etc.) — removing the
account-type selector is not a contained onboarding-screen edit, it is a
data-scoping/product decision with app-wide reach. Not attempted; reported
per Step 8's own framing ("not yet confirmed compliant or non-compliant...
this is the first implementation-phase check").

## Home — token pass status (honest accounting)

Two exact-value token substitutions landed in a separate commit just before
this batch (`hero`/`quickEntry` card `borderRadius: 18` → `RADIUS.sheet`,
plus adding the `SHADOW.card`/`SHADOW.subtle` elevation both cards were
missing) — none of the ambiguous health-pill/period-pills structural
question touched, per the standing Planning & Audit ruling.

No further Home edits landed in *this* batch. Reason: `tokens.js`'s
`RADIUS` scale only has 3 distinct values (`sm:6`, `md/lg/xl:8` — three
names, one value — `sheet:18`, `pill:999`), and most of Home's ~15 remaining
raw radius literals (10, 11, 12, 13, 14, 15, 16...) have no exact match.
Forcing them to the nearest token (usually 8) would be a visible,
non-trivial shrink that isn't clearly "matching the mockup" — that's a
judgment call closer to the structural-change line than the safe exact-swap
work done so far. Left as an open, low-risk, ongoing item rather than forced
through to inflate this batch's scope.

## Verification performed

- `npm run test:gate:static`: 70 passed / 1 failed / 11 skipped — unchanged,
  same pre-existing failure as every prior check this session.
- `npm run verify:android`: clean.
- Live browser walkthrough (Expo web): Archive open/back from More, Archive
  confirmed removed from Settings, Reports screen renders with no console
  errors after the CHART_COLORS swap, My Money gateway cards render with the
  corrected tones.
- `/code-review` (medium effort): clean, no findings.

## Financial-data impact

NONE. All changes are color/label/navigation-wiring only; `ArchiveScreen.js`,
`TrackersLabScreen.js`, `OnboardingScreen.js`, and all financial calculation/
mutation code are unmodified — Steps 6 and 8 produced audit findings only.

## Status

Not yet pushed — held for explicit user push approval. Steps 4 (Settings/
Legacy), 9 (Diagnostic-UI gating — no SECURITY-S6 spec found, confirmed not
started, not invented), and 10 (legacy screen retirement) were not touched,
per explicit exclusion.
