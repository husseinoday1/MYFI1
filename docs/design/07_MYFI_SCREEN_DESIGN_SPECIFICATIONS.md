# MYFI — Screen Design Specifications

**Status:** CANONICAL · **Consolidated:** 2026-08-26, expanded from the
original Screen Visual Consistency Matrix into full per-screen specifications
per the Master Blueprint rebuild's requirements.
**Basis:** direct code evidence at HEAD `d2ed3ae03c137d818040dfe77c665c516b8440b7`,
`14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`, `06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md`.

Unknown details are marked **UNKNOWN** rather than invented, per the
governing rule: do not invent unsupported detailed behavior.

**Financial-data impact for every screen below: NONE.** This document is
presentation/navigation/UX-contract only.

---

## Onboarding

- **Purpose / user question answered:** first-run setup; "what is this app
  and can I trust it with my money."
- **Approved structure (revised 2026-08-28):** exact 5 steps — Welcome with
  a small AR/EN reader control at the top side → three personalization
  questions (the goals question is multi-select) → Essentials and start.
  AR/EN changes onboarding copy and RTL/LTR only for the current onboarding
  session and does not change the app-wide language preference. The privacy
  note appears within Essentials and does not create a separate step.
- **Required sections:** per-step content defined in
  `14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md` (REF-02/03/03B/03D/03C/03E).
- **Navigation entry/exit:** entry = first app launch (new install); exit =
  Home. Existing users on a future update get a short "What Changed" flow
  instead, not re-entry into full onboarding.
- **Primary actions:** step-by-step "Continue" (متابعة) / final "Start using
  MYFI."
- **Secondary actions:** "Back" (رجوع) throughout. No Skip action.
- **Quick Add behavior:** N/A (not applicable during onboarding).
- **Empty/loading/error states:** N/A — a linear setup flow, not a data
  screen. Errors would be step-local validation only (e.g. a required
  wallet name) — **UNKNOWN** whether current `OnboardingScreen.js`
  implements this.
- **Light/Dark:** only Light shown in every approved reference; Dark
  onboarding is **UNKNOWN/unverified**.
- **RTL:** Arabic-only in every reference; no English reference exists to
  compare mirroring against.
- **Accessibility:** not evaluated.
- **Reusable components:** two-column personalization option cards,
  `SelectorRow`/`ChoiceSheet` for Essentials.
- **Reusable business logic:** wallet creation, currency/country selection
  already exist in some form in `OnboardingScreen.js` (390 lines, active).
- **Known implementation state:** `OnboardingScreen.js` implements the
  revised five-step flow, stores the three answers, and uses them to tune
  supported module visibility. It does not request an opening balance or
  expose an account-type/Skip choice.
- **Expo/device validation items:** step transition feel, keyboard behavior
  on the wallet-name field, Dark-theme appearance.
- **Future/conditional items:** none identified.

---

## Home

- **Purpose / user question answered:** "Where do I stand now?"
- **Approved structure:** centered MYFI header (profile left, bell right);
  balance hero card (brand-green, white amount, wallet icon-button); 4
  period pills (Today/Week/Month/Year) each with a delta; wallet strip (3+
  cards, "View all"); Monthly Summary (Income/Expense/Net) with a two-tone
  progress bar; Needs Attention (only when meaningful); Quick Add row
  (Expense/Income/Transfer/Smart — mode depends on the global Add Method
  setting); Recent Transactions + "View all."
- **Required sections:** all of the above; no permanent global search
  control on Home.
- **Navigation entry/exit:** primary tab, always the default landing
  destination.
- **Primary actions:** Quick Add (Expense/Income/Transfer/Smart) or the
  side `+` button, depending on the global Add Method setting.
- **Secondary actions:** "View all wallets," "View all transactions,"
  period-pill switching.
- **Quick Add behavior:** exactly as defined in
  `06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` §4 — global setting,
  contextual actions (Expense/Income/Transfer/Smart here).
- **Empty state:** a fresh install's Home (no transactions yet) —
  **UNKNOWN** exact current copy/behavior, but must follow the "explain what
  + why + next action" rule in `11_MYFI_SYSTEM_STATES_AND_FEEDBACK.md`.
- **Loading state:** skeleton, per `11_MYFI_SYSTEM_STATES_AND_FEEDBACK.md`.
- **Error state:** per the same document's inline/recoverable-error rules.
- **Light/Dark:** confirmed sound structurally (`HomeScreen.js` uses
  `TH[cfg.theme]`); approved reference supplied in both themes.
- **RTL:** confirmed (`rowDirFor`/`textAlignFor` in use).
- **Accessibility:** amount display must pair color with the
  `FinancialDirectionMark` sign+label pattern — confirmed existing pattern
  to extend, not invent.
- **Reusable components:** `WalletBalanceCard`, `AddTransModal`,
  `EntryContextRow`.
- **Reusable business logic:** balance/period calculations already live in
  `HomeScreen.js` (1,348 lines, active, primary tab today).
- **Known implementation gap:** magic-value density (raw `fontSize`/padding
  literals vs. tokens) — a token-adoption task, not a structural rebuild.
  **Financial direction correction:** Income must render UP, Expense DOWN —
  a prior reference had this reversed.
- **Expo/device validation items:** period-pill touch ergonomics, hero-card
  text contrast on real displays, spacing/density polish.
- **Future/conditional items:** none identified beyond the general Smart
  Quick-Add action's eventual scope (owned by the separate Smart-input
  product track, not this document).

---

## My Money

- **Purpose / user question answered:** "Give me a structured view into all
  of my money" — a hub, not a flat screen.
- **Approved structure:** four numbered gateway cards — 1) Wallets &
  Accounts, 2) Transactions & History, 3) Plan & Budget, 4) Reports &
  Analytics — each with a live summary stat and a named link opening a full
  destination; a "Quick shortcuts" row beneath (Transfer, Add transaction,
  New budget, Quick report).
- **Required sections:** the four gateway cards; nothing else at this
  level — detail lives in each gateway's own destination (below).
- **Navigation entry/exit:** primary tab; each card opens a full-screen
  secondary destination (per the View→Page navigation rule).
- **Primary actions:** open a gateway.
- **Secondary actions:** the quick-shortcuts row.
- **Quick Add behavior:** the quick-shortcuts row includes "Add
  transaction," using the same global Add Method setting as Home.
- **Empty/loading/error:** per `11_MYFI_SYSTEM_STATES_AND_FEEDBACK.md`;
  specifics **UNKNOWN** since this screen does not exist in code yet.
- **Light/Dark:** only Light shown in the approved reference — Dark for
  this new screen is **UNKNOWN**, must follow the structural-parity rule.
- **RTL:** must inherit `src/lib/layout.js`, not reinvent.
- **Accessibility:** not evaluated (new screen).
- **Reusable components:** new `GatewayCard` composite (no current
  equivalent — see `05_MYFI_COMPONENT_ARCHITECTURE.md`).
- **Reusable business logic:** wallet balances (currently on Home),
  History/Reports screens as destinations.
- **Known implementation gap:** this screen **does not exist** in code
  today — it is a net-new build, though it substantially assembles existing
  screens/data rather than inventing new logic.
- **Expo/device validation items:** entire layout is unvalidated on device.
- **Future/conditional items:** external bank/card-aggregation linkage is
  explicitly FUTURE/CONDITIONAL for the Wallets & Accounts gateway — the
  current target must work fully without it.

---

## Wallets & Accounts (My Money gateway 1)

- **Purpose:** "What do I have, and where?"
- **Approved structure:** total balance; per-wallet list (name, icon,
  balance); a separate section for linked bank accounts **only if/when that
  capability is approved** — currently FUTURE/CONDITIONAL, not built.
- **Navigation entry/exit:** from My Money card 1; full page.
- **Primary actions:** view a wallet's detail (**UNKNOWN** exact target
  screen — not confirmed to exist separately from this list view).
- **Reusable components:** `WalletBalanceCard`.
- **Reusable business logic:** wallet data already surfaced on Home today.
- **Known implementation gap:** whole screen is new; wallet-detail drill-down
  target is **UNKNOWN**.
- **Future/conditional items:** external bank/card linkage.
- **Financial-data impact:** NONE (display of existing wallet balances only).

---

## Transactions & History (My Money gateway 2)

- **Purpose:** "Show me everything that happened."
- **Approved structure:** filter tabs (All/Transfer/Income/Expense), search,
  date-grouped list (Today/Yesterday/...).
- **Navigation entry/exit:** from My Money card 2, and from Home's "View all
  transactions." Same destination both times — no duplicate logic.
- **Primary actions:** open a transaction's detail.
- **Secondary actions:** search, filter.
- **Reusable components:** confirmed existing — `HistoryScreen.js` (940
  lines, active), `TransactionDetailsModal`.
- **Known implementation gap:** none structural — becomes a secondary
  destination instead of a primary tab; content is already close to target.
- **Financial-data impact:** NONE.

---

## Plan & Budget (My Money gateway 3)

- **Purpose:** "Am I on track this month?"
- **Approved structure:** month selector; donut chart (budget vs. spent vs.
  remaining); category breakdown with percentages.
- **Navigation entry/exit:** from My Money card 3.
- **Primary actions:** view/edit a category's budget (**UNKNOWN** exact
  edit flow).
- **Reusable business logic:** **UNKNOWN** — no dedicated Budget screen was
  confirmed to exist in the current codebase; budget data may partially
  exist elsewhere (not verified in this pass).
- **Known implementation gap:** likely the largest net-new logic item in My
  Money if no existing budget screen exists — needs an implementation-phase
  confirmation before scoping.
- **Chart rules:** per `10_MYFI_CHART_AND_FINANCIAL_VISUALIZATION_SYSTEM.md`.
- **Financial-data impact:** NONE (presentation of existing spend data;
  if budget-setting logic doesn't exist yet, building it is a product
  feature decision outside this design document's authority).

---

## Reports & Analytics (My Money gateway 4)

- **Purpose:** "Help me understand my money over time."
- **Approved structure:** full report taxonomy per
  `10_MYFI_CHART_AND_FINANCIAL_VISUALIZATION_SYSTEM.md` — not reduced to a
  summary card.
- **Navigation entry/exit:** from My Money card 4; remains a full dedicated
  destination once opened.
- **Reusable components/logic:** `ReportsScreen.js` (2,211 lines, active,
  primary tab today) — reusable, but its current local `CHART_COLORS` must
  reconnect to the governed token system.
- **Known implementation gap:** largest single migration-scope item of any
  existing screen (chart-color reconnection + taxonomy conformance check).
- **Financial-data impact:** NONE.

---

## Follow-ups

- **Purpose:** "What do I need to act on or keep track of?"
- **Approved structure:** summary strip (5 live counters); Quick Add row
  (Debt/Receivable/Commitment/Goal); "Needs attention" list; quick-summary
  4-stat grid; 6 main sections (Debts & Receivables, Commitments,
  Installments, Subscriptions, Goals & Savings, **Payment History**).
- **Navigation entry/exit:** primary tab.
- **Primary actions:** Quick Add (Debt/Receivable/Commitment/Goal per the
  global Add Method setting); open a section.
- **Quick Add behavior:** same global setting as Home; contextual actions
  differ (Debt/Receivable/Commitment/Goal here).
- **Reusable components:** `NewItemModal` (verify it covers all 4 entity
  types — **UNKNOWN**, needs implementation-phase confirmation),
  `EntryContextRow` variant with colored accent bar.
- **Reusable business logic:** `TrackersLabScreen.js` (1,448 lines, active)
  already unifies debts/goals/commitments — substantially close to target
  already.
- **Known implementation gap:** confirm Bills/Installments/Subscriptions
  coverage and explicit Payment History section exist or need adding.
- **Financial-data impact:** NONE.

---

## More

- **Purpose:** "Everything else I might need."
- **Approved structure:** My Shortcuts (exactly 3, user-customizable); My
  Tools; Data & Files; Benefits/Rewards; MYFI & Help; Settings.
- **Navigation entry/exit:** primary tab; each row opens a full-screen
  secondary destination.
- **Reusable business logic:** Data/Guide/Support/About content currently
  lives inside `SettingsScreen.js` (`DataPage`, `GuidePage`, `SupportPage`,
  `AboutPage`) and must relocate here, not be rebuilt.
- **Known implementation gap:** this screen **does not exist** in code
  today — net-new shell, reusing relocated content.
- **Adaptive-More governance:** PERMANENT / TEMPORARY-MATURITY-DEPENDENT /
  CONDITIONAL classification per `08_MYFI_DESIGN_GOVERNANCE.md`.
- **Financial-data impact:** NONE.

---

## Settings

- **Purpose:** "Configure how the app behaves and how my account works."
- **Approved structure:** exactly 5 root sections (Account & Sync,
  Appearance & Language, Financial Preferences, Notifications & Reminders,
  Privacy & Security) — full detail in
  `06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` §5.
- **Navigation entry/exit:** from More; header uses a search icon instead of
  a profile icon (search itself is an implementation/Expo-validation
  detail, may be omitted).
- **Reusable business logic:** `SettingsScreen.js` (2,391 lines) +
  `SettingsLegacyScreen.js` (3,235 lines, **live**, embedded at
  `SettingsScreen.js:1172,1176,1680`) — must migrate as one unit.
- **Known implementation gap:** highest-risk single item in the whole
  roadmap (live auth/`AuthModal` at `SettingsScreen.js:1978`, account
  deletion, sync status all route through it); Data/Guide/Support/About
  content must relocate to More; Country/Currency must move to Financial
  Preferences; accent-color/payment-methods/VAT rows must be removed.
- **Financial-data impact:** NONE (this screen does not itself hold
  financial data, but its account-deletion and restore-adjacent rows are
  sensitive — no behavior change is authorized here, presentation only).

---

## Archive

- **Purpose:** "Show me what's closed/archived."
- **Approved structure:** archived/closed trackers and closed years.
- **Navigation entry/exit:** **More → My Tools → Archive** (corrected
  2026-08-26 — not Home, not a My Money gateway).
- **Reusable business logic:** `ArchiveScreen.js` (898 lines, active) —
  content/logic unaffected, only its entry point moves (currently wired via
  Settings' `onOpenArchive`, `App.js:932`).
- **Known implementation gap:** relocation only, no content change.
- **Financial-data impact:** NONE.

---

## Screens intentionally not given a full spec here

`CommitScreen.js`, `DebtsScreen.js`, `GoalsScreen.js`, `AuthScreen.js`,
`SpaceScreen.js` — LEGACY / RETIREMENT CANDIDATES, orphaned/unreferenced by
`App.js`. No target spec is written for them; see
`05_MYFI_COMPONENT_ARCHITECTURE.md` for their retirement policy.
