# Step 8 (Onboarding) resolution + Payment History (2026-08-27)

**Branch:** `impl/nav-shell-step3-2026-08-26`.
**Authorized by:** Planning & Audit, relaying explicit user direction to
resolve the two Step 6/8 gaps now rather than defer them, with an explicit
Verification Floor requirement for anything touching real financial
data/logic (write it directly, no `ask_deepseek`, add a repeat-action test
for any new state/counter logic).

## Pre-implementation verification (required before starting)

Confirmed a working, already-live alternative path exists for changing
`profileType` after onboarding: `src/screens/SettingsLegacyScreen.js:665`
(`setProfileType`), rendered as a selectable option at line 1827. This means
removing the onboarding selector does **not** leave users without a way to
set their account type — the existing Settings path remains, untouched.

## Step 8 — Onboarding account-type selector removed

Per `docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` §7
(LOCKED), which explicitly prohibits a Personal/Business/Dual selector
during onboarding.

- `src/screens/OnboardingScreen.js`: `profileType` state (`useState('personal')`
  + `setProfileType`) replaced with a plain constant `const profileType =
  'personal'`. `QuickSetupSlide`'s type-selector UI (`typeOptions`,
  `typeGrid`/`typeOption` rendering) removed entirely. `SettingsLegacyScreen.js`
  is **unmodified** — it remains the sole profile-type change path, exactly
  as directed ("لا تحذف آلية profileType... تبقى بالكود متل ما هي").
- `defaultScopeForProfile`/`profileModuleDefaults`/`filterByActiveScope` and
  all `cfg.profileType`/`cfg.activeScope` consumers across the app are
  **unmodified** — only the onboarding UI's selector was removed, not the
  underlying scoping mechanism.
- Updated the one static contract test that encoded the old requirement:
  `tests/r04-phase6-9-contract.test.cjs` previously asserted
  `onboarding.includes("profileType={profileType}")` ("first-run usage type
  selection missing"). Replaced with assertions for the new, intentional
  contract: onboarding contains no `typeOptions`/`setProfileType` reference,
  defaults to `'personal'` via the exact literal, and
  `SettingsLegacyScreen.js` still contains `setProfileType` (the remaining
  change path). This is a deliberate, authorized behavior reversal — the old
  assertion was testing exactly the behavior the locked spec says must not
  exist.

## Step 6 (partial) — Payment History (read-only)

Per the peer instruction: display-only aggregation, zero new writes, zero
new financial calculation.

- New `src/screens/PaymentHistoryScreen.js`: merges `debt.payments[]`
  (already written by the existing debt-payment action in
  `trackersSlice.js`) with transactions already carrying a `commitmentId`
  (already written by the existing add-transaction flow) into one
  reverse-chronological read-only list. Every amount/date/label shown is
  copied verbatim from an existing record — no new financial write, no new
  calculation, `filterByActiveScope` reused for scope consistency with the
  rest of the app.
- Wired as a new secondary destination (`App.js`'s `SECONDARY_SCREEN_KEYS`/
  `screens` map, same pattern as Step 3's Wallets/Budget screens — reuses
  the existing back-to-hub mechanism, no new navigation infrastructure).
- Entry point added to `TrackersLabScreen.js` (a single new row above the
  existing quick-entry section, wired to `onOpenPaymentHistory`) — no
  existing `TrackersLabScreen.js` logic touched.

**Not done (separate, larger, deferred item — flagged, not attempted):**
Installments/Subscriptions as distinct commitment sub-types (the
`subType` field on `commitments.js` the peer scoped as full Verification
Floor work). Payment History's read-only aggregation was judged genuinely
low-risk and completed; the commitment-schema change is a larger,
separate piece of work not completed in this pass — see follow-up.

## Verification performed

- `npm run test:gate:static`: 70 passed / 1 failed / 11 skipped — the 1
  failure is the same pre-existing `ui-contract.test.cjs` issue confirmed
  unrelated at session start (`git stash` check). One genuinely **new**
  failure appeared mid-way (`r04-phase6-9-contract.test.cjs`, the stale
  assertion above) — caught, root-caused, and fixed with an intentional
  contract update rather than a workaround; gate is back to the baseline
  70/1/11 after the fix.
- `npm run verify:android`: clean.
- Live Expo-web walkthrough: full onboarding flow from scratch — confirmed
  the Personal/Business/Dual screen no longer renders (goes straight from
  the title/subtitle to Country/Base currency), onboarding completes
  normally into Home. Follow-ups → "Payment History" row opens the new
  screen with a working "Back" bar; empty state renders correctly (no
  console errors) for a fresh account with no payments yet.
- `/code-review` (medium effort): clean, no findings.

## Financial-data impact

Onboarding change: NONE (UI-only removal; the scoping mechanism it used to
configure is unchanged, and every existing consumer of `profileType`/
`activeScope` across the app is untouched).

Payment History: NONE (read-only; no new writes, no new calculation, reuses
existing records verbatim).

## Status

Not yet pushed — held for explicit user push approval. The commitment
`subType` (installment/subscription) schema addition remains outstanding —
full Verification Floor work, not started in this pass.
