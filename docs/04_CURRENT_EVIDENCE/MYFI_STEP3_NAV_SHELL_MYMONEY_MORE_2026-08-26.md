# Step 3 — Navigation shell, My Money, More (2026-08-26)

**Branch:** `impl/nav-shell-step3-2026-08-26`, off `impl/design-tokens-foundation-2026-08-26`
tip `6cd1886` (pushed).
**Authorized by:** Planning & Audit, `docs/04_CURRENT_EVIDENCE/MYFI_SCREEN_MIGRATION_SEQUENCING_DECISION_2026-08-26.md`
(on the `docs/canonical-hygiene-2026-08-26` branch), per
`docs/design/12_MYFI_DESIGN_MIGRATION_ROADMAP.md` step 3.

## What changed

- `App.js`: `BASE_TABS` restructured from 5 tabs (home/history/trackers/reports/settings)
  to 4 (home/mymoney/trackers-labeled-"Follow-ups"/more), per
  `docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` §1 (LOCKED).
  History, Reports, Settings, and two new destinations (Wallets & Accounts,
  Plan & Budget) remain valid `screens` keys, reached only via My Money/More
  gateways — a "back to hub" bar (`HUB_TABS`/`SECONDARY_SCREEN_KEYS`) renders
  above them and returns to whichever hub tab (`lastHubTab`) the user came from.
- `src/components/GatewayCard.js` (new), `src/components/SectionListRow.js`
  (new) — the two composite primitives the component-architecture audit
  flagged as missing/deferred, now built for this step per Planning & Audit's
  authorization.
- `src/screens/MyMoneyScreen.js` (new) — 4-gateway hub (Wallets & Accounts,
  Transactions & History, Plan & Budget, Reports & Analytics) + quick
  shortcuts row. All values are computed via already-existing lib functions
  (`getWalletAvailableBalances`, `getWalletBaseAvailableTotal`, `getBudgetRows`,
  `getBudgetSummary` from `src/lib/wallets.js`/`src/lib/budgets.js`) — no new
  financial calculation.
- `src/screens/MoreScreen.js` (new) — My Shortcuts row, My Tools/Data & Files/
  Benefits/Help/About/Settings rows, trust-badges strip. Data & Files/Help/
  About/Settings route into the existing, **unmodified** `SettingsScreen.js`
  via its pre-existing `openRequest` deep-link (`App.js`'s `openSettingsPage`)
  — no code was extracted or duplicated out of `SettingsScreen.js`/
  `SettingsLegacyScreen.js` (Settings/Legacy consolidation is roadmap Step 4,
  explicitly out of scope for this change).
- `src/screens/WalletsAccountsScreen.js` (new) — thin wrapper around the
  existing `WalletBalanceCard`, same component Home already uses for its
  wallet picker. No new wallet-balance logic.
- `src/screens/PlanBudgetScreen.js` (new) — mirrors the budget UI already
  live inside `SettingsLegacyScreen.js`, but as its own screen, calling the
  **same** store actions (`setCategoryBudget`, `applySuggestedBudgets`,
  `copyPreviousMonthBudgets`, `clearBudgets`) and `src/lib/budgets.js`
  functions that screen already uses — no new financial mutation logic.
  One small duplicated helper (`BudgetAmountField`, a number-formatting
  `TextInput` wrapper) mirrors `SettingsLegacyScreen.js`'s private
  `FormattedNumberField` since that one isn't exported and Settings/Legacy
  is out of scope to touch; flagged for Step 4 consolidation.

## Bug found and fixed during verification

A pre-existing guard effect in `App.js` (`if (!visibleTabs.some(t => t.key
=== tab)) setTab('home')`) was written for the old 5-primary-tab model, where
every `screens` key was also a primary tab. It broke the moment Settings/
History/Reports/Wallets/Budget became secondary-only destinations: opening
any of them from My Money/More immediately bounced back to Home. Fixed by
exempting the new secondary destinations (`SECONDARY_SCREEN_KEYS`) from that
guard — the guard still correctly resets `tab` to Home if a *primary* tab
(e.g. Follow-ups) becomes hidden via `shouldShowTrackersTab`. Verified live
in the browser (Expo web) for Settings, Wallets & Accounts, and the "Back"
return path — see Verification below.

## Verification performed

- `npm run test:gate:static`: 70 passed / 1 failed / 11 skipped, unchanged
  from the pre-existing baseline failure on this same base commit
  (`ui-contract.test.cjs`, "Light and dark themes must preserve green income
  and red expense colors" — confirmed via `git stash` to already fail on
  `6cd1886` before any of this change; not caused by, or fixed by, this work).
- `npm run verify:android` (Expo export/bundle check): clean, twice (before
  and after the visual-fidelity correction pass below).
- Live browser verification (Expo web dev server, `--web`): onboarding
  flow, 4-tab bottom bar renders with correct labels, My Money's 4 gateway
  cards render with distinct icon tones and numbered badges (confirmed via
  computed styles, not just DOM text), More's sections and trust-badge strip
  render, Settings/Wallets & Accounts open correctly from their gateways with
  the "Back" bar, and "Back" correctly returns to the originating hub tab.
  Console checked for errors at each step.
- `/code-review` (medium effort): clean, no findings.

## Visual fidelity — correction pass

The first implementation pass used generic/plain composite styling instead of
matching the approved reference mockups the user had shared earlier in the
session (My Money and More screens). Corrected after the user pointed this
out and re-shared the two reference images:
- `GatewayCard`: rebuilt to the mockup's actual composition — icon + title
  header row, then a large hero `value` line, a small `meta` line, then a
  visually separated bottom "‹ View X" link row (previously: single row with
  a trailing chevron only).
- Numbered badges: small solid green filled circle at the icon's bottom
  corner (previously: a bordered `cardHigh` chip at the top corner).
- Per-gateway icon tones now vary (blue/green/purple/orange) instead of
  reusing `th.primary` for all four, matching the mockup. Blue and green come
  from existing semantic tokens (`th.transfer`, `th.primary`). Purple/orange
  have no semantic token (income/expense/transfer/warning/danger don't fit) —
  reused the **already-approved** muted category-palette target hex values
  from `docs/design/04_MYFI_DESIGN_TOKEN_CATALOG.md` (`#8D7CB8`, `#C99860`)
  rather than inventing new colors. No confirmed dark-theme variant exists yet
  for these two (the catalog's contrast pass is explicitly deferred) —
  flagged as a known gap, not silently assumed.
- `MoreScreen`: My Shortcuts section given an "Edit" affordance + "long-press
  to reorder" hint text (matching the mockup) — customization itself remains
  unimplemented, this is a visual affordance only, wired to a no-op with an
  inline comment saying so. Section row icons/tones/descriptions corrected to
  match the mockup's actual content (e.g. Benefits uses a trophy icon and
  amber tone with "Premium, rewards, and invite a friend", not a generic
  placeholder). Trust-badge strip rebuilt with the mockup's actual titles +
  description subtext (Privacy first / Safe backups / Get more with MYFI /
  We're here to help), not invented copy.

## Known, explicitly flagged gaps (not silently glossed over)

- "My Shortcuts" in the approved reference is a swipeable, paginated,
  user-customizable carousel (pagination dots visible for multiple pages).
  This build ships one static row of 3 defaults — no carousel, no
  customization/reordering persistence.
- "My Tools" and "Benefits" route to a plain "coming soon" placeholder. The
  approved reference documents their exact sub-items (categories, currencies,
  templates, archive relocation; Premium, rewards, invite-a-friend, device
  list) but building that content is outside this navigation-shell step —
  Archive relocation specifically is roadmap Step 5, explicitly not done here.
- Reports & Analytics gateway card has no `value` line (no "top spending
  category" stat) — the only lib code found for that (`decisionEngine.js`'s
  `intelligence.topSpend`) belongs to the notification/decision-alert system,
  not a simple display helper; pulling it in was judged out of scope for a
  cosmetic stat rather than reused without review.
- Purple/orange gateway tones (see above) have no dark-theme-confirmed value.

## Financial-data impact

NONE. Every screen in this change is presentation-only over already-existing,
already-tested data/mutation functions (wallet balances, budget rows/summary,
the exact same budget store actions `SettingsLegacyScreen.js` already calls).
No SQLite schema, migration, backup/restore, sync, or financial calculation
code was touched.

## Status

Not yet pushed — held for explicit user push approval, per standing git
safety rules. Ready for `/code-review` (done, clean) and Planning & Audit
review of the roadmap-Step-3 scope/gaps above.
