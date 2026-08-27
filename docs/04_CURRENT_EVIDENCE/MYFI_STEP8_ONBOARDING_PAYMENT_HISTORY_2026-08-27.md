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

## Step 6 (completion) — commitment `subType` classification

Full Verification Floor work: written directly, reviewed line-by-line, no
`ask_deepseek` delegation, per the explicit instruction for this piece.

**Financial-impact check performed first** (`myfi-financial-impact-check`
skill): commitments are committed as `entityType: 'commitment'` payloads
through `commitEntityChangesV7` into `ledger_entities_v7.payload_json` (a
JSON blob column, confirmed by reading `financialLedgerV7Repository.js`'s
schema directly — not assumed). Adding an optional key to that JSON payload
is not a SQL column/schema change: `FINANCIAL_SQLITE_SCHEMA_VERSION` is
unaffected, no migration is required, and existing rows with no `subType`
key simply read as `undefined` and normalize to `'general'` — verified via
`normalizeCommitments`'s `...item` spread already passing unknown keys
through, then explicit `normalizeSubType()` validation added on top so a
garbage/missing value can never reach the UI unnormalized.

**Verdict block:**
```
Financial Data: NONE — classification tag only, no amount/balance/date/
  posting field changes, no calculation touched.
SQLite Schema:  NONE — new JSON payload key, not a new column; confirmed
  by reading the CREATE TABLE statement directly.
Migration Required: NO
Existing User Data: PRESERVED — commitments with no subType stored
  normalize to 'general' (same as today's implicit behavior), read and
  write paths both idempotent under the same normalization function.
Proof: npm run test:database (schema/backfill/financial-core, all pass),
  full test:gate:static back to the 70/1/11 baseline, manual trace of
  every addCommitment/editCommitment call site.
```

**Scope actually implemented (deliberately narrower than the full request):**
- `src/lib/commitments.js`: `COMMITMENT_SUB_TYPES` constant + `normalizeSubType`,
  wired into `normalizeCommitments` (the single normalization chokepoint
  every commitment read/write already passes through).
- `src/store/slices/managementSlice.js`: `addCommitment` passes `item.subType`
  through (normalized downstream); `editCommitment` needed **no change** —
  it already spreads `...current` (which includes the normalized `subType`)
  before re-normalizing, so edits preserve it automatically.
- `src/components/NewItemModal.js`: a `commitmentSubType` picker
  (General/Installment/Subscription) added to the direct commitment-creation
  form, reusing the exact same `renderSelectField` mechanism already used
  for the adjacent category/repeat-mode fields — no new interaction pattern
  introduced. Only wired into the direct-creation `addCommitment` call; the
  two linked-plan `addCommitment` calls (debt/goal payment plans) correctly
  keep the `'general'` default, since a debt-repayment plan isn't itself an
  installment/subscription commitment.
- `src/screens/TrackersLabScreen.js`: a small badge (`item.commitment.subType`)
  renders next to a commitment's status chip when subType is not `'general'`.
  Traced `item.commitment: item` back to the `monthlyRows` construction to
  confirm the normalized object (with `subType`) is what's actually attached
  — not assumed.

**Explicitly not built in this pass (flagged, not silently dropped):**
- No "remaining installments" counter. Building an auto-decrementing counter
  tied to the payment-marking flow is real state-machine logic requiring a
  repeat-action test per the standing rule, and needs its own design
  decision (manual field vs. auto-decrement, what happens at zero, etc.) —
  judged out of scope for this pass; a purely manual, non-decrementing
  number field could be added cheaply later if wanted.
- No dedicated "Installments"/"Subscriptions" filter tabs in Follow-ups'
  tracker-type segmented control — that's an information-architecture change
  to an already-working filter mechanism (`filters`/`currentTrackers` in
  `TrackersLabScreen.js`), a bigger, separate decision than a display badge.
  The badge makes installments/subscriptions visually distinguishable today
  without touching that mechanism.

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
