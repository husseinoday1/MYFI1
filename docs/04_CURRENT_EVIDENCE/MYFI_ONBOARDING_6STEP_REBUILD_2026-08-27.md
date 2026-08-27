# Onboarding rebuilt as the locked 6-step flow (2026-08-27)

Triggered by the user asking directly why onboarding still looked unchanged.
It genuinely was — this was a real gap, not a misunderstanding: the running
`OnboardingScreen.js` was a 3-slide marketing-preview flow (value showcase →
insight showcase → quick country/currency setup), while
`docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` §7 **LOCKS**
onboarding to a different, specific 6-step sequence:

> 1. Welcome → 2. What matters to you first? → 3. Customize your experience →
> 4. Create first wallet → 5. Privacy first → 6. Everything is ready.

— matching REF-02/03/03B/03D/03C/03E exactly. This is not a style
preference difference; the running code violated a LOCKED architecture
document. Rebuilt from scratch to match.

## What changed

`src/screens/OnboardingScreen.js`, full rewrite. Same exported signature
(`OnboardingScreen({ cfg, onDone })`) — no `App.js` change needed.

- 6 step components (`WelcomeSlide`, `PrioritySlide`, `CustomizeSlide`,
  `WalletSlide`, `PrivacySlide`, `CompleteSlide`), copy taken directly from
  the approved REF images.
- **Priorities step is new** — a multi-select checklist ("what matters to
  you first"), explicitly a *different* concept from the LOCKED-prohibited
  Personal/Business/Dual account-type selector (the doc's own wording
  distinguishes them). Stored in `cfg.onboardingPriorities` — decorative/
  informational only, drives no gating logic, matching the reference's own
  "you can adjust this later" framing.
- **Customize step now also covers language and appearance** (REF-03B shows
  4 rows: country/language/currency/appearance), reusing the exact
  `langMode`/`lang` and `themeMode`/`theme` `setCfg` pattern already used in
  `SettingsScreen.js` — no new preference-storage mechanism invented.
- **Wallet step is new** — lets the user name their first wallet (REF-03D),
  defaulting to "Main wallet" / "المحفظة الرئيسية" if left blank.
- **Completion step is new** — a summary of every choice made, matching
  REF-03E.
- The core `finish()` write logic — `setCfg({country, currency, ...})` then
  `editWallet(DEFAULT_WALLET_ID, {currency, scope, ...})` — is the **same
  logic the prior 3-slide flow already used**, just reached via more steps
  and now also passing `name` (wallet display metadata) and the new
  language/theme/priorities preferences. `editWallet`'s own guards (blocks
  a currency change if the wallet already has transaction history, requires
  a valuation rate for a non-base currency) are untouched — verified by
  reading `managementSlice.js:646`, not assumed.

## Financial impact

```
Financial Data:     NONE — finish()'s write logic is unchanged; only
                    non-financial fields (wallet display name, language,
                    theme, priorities) were added to what it already wrote.
SQLite Schema:      NONE
Migration Required: NO
Existing User Data: PRESERVED — this screen is unreachable for any user who
                    has already completed onboarding (first-run only); no
                    upgrade path touches this code.
```

## Two static-gate regressions found and fixed (not silently patched over)

1. **`multicurrency-r03.test.cjs`** failed: the prior flow's copy explained
   base-currency immutability and historical FX
   ("العملة الأساسية هي مرجع التقارير" / "historical rate") — a real
   financial-contract disclosure required somewhere in onboarding. The
   REF-03D image doesn't show this exact sentence, but the financial
   contract requirement outranks visual fidelity. Restored the exact
   required text as an additional line on the wallet step, alongside (not
   replacing) the reference's own copy.
2. **`product-readiness-batch7.test.cjs`** failed: its assertion literally
   checked for the *old* 3-slide implementation's internal style-key names
   (`dashboardCard`, `insightCard`, `cloudVisual`, `quickSetupCard`) — a
   stale test encoding the very design the locked doc prohibits, the same
   category of trap already documented in this branch's history (commit
   `5de6006`'s onboarding account-type-selector test). Root-caused and
   **updated, not deleted or skipped**, to check for the new, correct
   6-step structure instead (`WelcomeSlide`/`PrioritySlide`/`CustomizeSlide`/
   `WalletSlide`/`PrivacySlide`/`CompleteSlide`).

## Live verification (Expo web, fresh account each time via `localStorage.clear()`)

Walked the complete flow step by step:

1. "1 of 6 · Welcome to MYFI" — 3 cards (Expenses/Planning/Goals), trust
   badge, "Start" button. Matches REF-02.
2. "2 of 6 · What matters to you first?" — 6-item checklist, 3 pre-checked
   by default (Expenses/Planning/Goals). Matches REF-03.
3. "3 of 6 · Customize your experience" — Country/Language/Currency/
   Appearance rows, all populated. Matches REF-03B.
4. "4 of 6 · Set up your first wallet" — name input (placeholder "Main
   wallet"), currency-confirmed row, **both** the reference's own copy and
   the restored financial-contract disclosure line render. Matches REF-03D.
5. "5 of 6 · Your privacy first" — 3 info rows + pre-checked agreement.
   Matches REF-03C.
6. "6 of 6 · Everything is ready" — summary correctly showing the 3 chosen
   priorities, country, currency, and wallet name. Matches REF-03E.
7. Tapped "Start using MYFI" → landed cleanly on Home, wallet named "Main
   wallet" as chosen, no console errors.
8. Separately verified "Skip" (tapped from step 1) jumps straight to the
   step-6 summary with the locale-detected defaults, not a broken state.

## Gates

- `npm run test:gate:static`: **70 passed / 1 failed / 11 skipped** —
  documented baseline, after fixing the two regressions above.
- `npm run verify:android`: clean.

## Status

Not pushed — held for explicit user push approval per the standing git
safety rule.
