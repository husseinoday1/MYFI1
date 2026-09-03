# Onboarding personalization — 2026-08-28

## Current state

The active first-run flow had six fixed screens: Welcome, a six-option
priorities multi-select, Customize, Wallet, Privacy, and Complete. It always
stored `profileType: personal`; the selected priorities were recorded but did
not materially tailor the initial visible modules.

## Visual/product problem

The broad priorities list required several decisions at once and still gave
most new users the same setup. A direct account-type screen would classify
people too rigidly and could imply unsupported family sharing or banking.
The separate completion page also added a step after privacy without another
decision.

## Decision

Use a five-step flow:

1. Welcome with a compact Arabic / English picker in the top side of the header.
2. Usage context: Student / Employee / Freelancer / Household management.
3. First goal: Control spending / Plan month / Manage obligations / Grow saving.
4. Money organization: One wallet / Several wallets / Personal and work / Not sure.
5. Essentials: country, currency, appearance, first-wallet name,
   and Start.

The usage and money-organisation questions are single-answer. The goal
question is deliberately multi-select, shown as the same low-density 2×2
option grid inspired by the supplied reference image: the user can select one
to all four goals. MYFI brand green replaces the reference's purple. Skip is
removed completely; Continue stays disabled until the current question has an
answer, and Back lets the user revise it.

The flow is five screens: Welcome (with the language picker in the top
header area), the three
questionnaire screens, then Essentials and Start. The language choice updates
onboarding copy and RTL/LTR immediately and is saved as the whole-app manual
preference when Start is pressed. It is intentionally not repeated inside
Essentials. The base-currency rule remains visible inside Essentials so the
user understands its effect before starting, without adding a separate screen.

## Behavior

Answers are stored in `cfg.onboardingPersonalization` and tune existing
`enabledModules` flags (wallets, debts, receivables, goals, commitments,
budgets, recurring). The Freelancer or Personal-and-work answers also derive
the existing `personal_business` profile and its real scope filter; all other
answers start in the existing personal scope. This is a derived setup result,
not a rigid profile-type picker. Household does not imply shared accounts,
and onboarding creates neither a bank connection nor fake data.

## User benefit

The app asks one understandable question at a time and starts calmer for users
who want simplicity, while making supported planning, follow-up, multi-wallet,
or freelancer tools visible when the answers justify them.

## Impact

- Financial data changed: NO
- SQLite schema changed: NO
- Migration required: NO
- SecureStore changed: NO
- Existing-user financial data preserved: YES
- Backup/restore format changed: NO
- Auth/sync semantics changed: NO
- New-user configuration only: YES
- Existing users re-onboarded: NO

## Verification status

- JSX parse: PASS
- Multi-currency onboarding disclosure contract: PASS
- Product-readiness onboarding contract: PASS for the revised flow and no-Skip rule
- Expo web 390×844: PASS for Welcome, first-question layout, disabled Continue,
  selected answer, and enabled Continue; no Skip rendered
- Expo web 390×844 (latest): PASS for the top-header AR/EN toggle on Welcome.
  It renders before the Welcome copy, keeps radio accessibility semantics, and
  Arabic selection immediately changes the step counter, action copy, and RTL
  direction.
- Static quality gate (`npm run test:gate:static`): 72 passed / 0 failed /
  11 skipped.
- Android Expo/Hermes export: not rerun for this UI-only adjustment.
- Actual-device acceptance: PENDING
