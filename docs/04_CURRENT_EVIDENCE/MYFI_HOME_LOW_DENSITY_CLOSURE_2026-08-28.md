# Home low-density closure — 2026-08-28

## Current state

Home already used the approved four-tab shell, the solid `#138A57` hero,
`getWalletBaseAvailableTotal`, four period controls, the wallet strip, the
configurable four-item month summary, quick entry, and recent transactions.
The financial and navigation foundations were retained.

## Visual problem

- The hero's only top-right action hid the balance, while the approved product
  direction requires the hero action to be wallet-related.
- Positive period values used income green on the brand-green hero and lost
  contrast.
- The positive available balance carried a `+` and the Arabic currency symbol
  could reorder around an English number, reducing mixed-direction clarity.
- Four separately bordered month cards, a bordered Quick Add container, and
  individually bordered recent rows created more card density than the content
  needed.
- Fixed-width wallet cards exposed only two complete wallets on a common phone
  width even though the approved reference establishes a three-wallet strip.

## Decision

- Make the hero's 44px top-right action open Wallets. Keep balance privacy as a
  quiet eye control beside the `Available balance` label.
- Render the hero amount as an isolated LTR currency-code run and omit a positive
  sign. Negative balances retain their minus sign.
- Keep period signs but render the figures in white on the hero; signs preserve
  meaning without relying on low-contrast semantic color.
- Fit three compact wallet cards at a 390px phone width. Tapping a card opens the
  existing default-wallet picker; `View all` opens the full Wallets screen.
- Reconcile the configurable four month metrics into one grouped surface with a
  single income/expense proportion bar. No configured metric was removed.
- Present Quick Add as four quiet touch targets with circular semantic icons,
  using transfer blue and brand green for Smart rather than inventing a new
  accent color.
- Reconcile recent transactions into one grouped list and add a clear `View all`
  route to History.

## Reason

The result follows clarity-before-decoration, reduces repeated borders and
cards, gives the wallet action clear priority, keeps financial figures dominant,
and stays faithful to the approved REF-01 structure without copying its rejected
navigation or inaccurate `Total balance` wording.

## User benefit

The most important figure and wallet action are recognizable immediately; three
wallets can be scanned without swiping on a typical phone; monthly cash flow and
recent activity require less visual parsing; mixed Arabic/English financial text
is more stable.

## Conflict with mockups

- REF-01 says `Total balance`; MYFI continues to say `Available balance` because
  the value comes from `getWalletBaseAvailableTotal`.
- REF-01 shows three month metrics. MYFI keeps the four user-configurable metrics
  (Income, Expense, Savings, Net) and groups them into one surface instead of
  deleting supported customization.
- The reference uses purple for Smart. The current governed theme has no purple
  Smart token, so the action uses brand green rather than introducing an arbitrary
  color.
- The approved Home / My Money / Follow-ups / More navigation remains unchanged.

## Impact

- Financial data changed: NO
- SQLite schema changed: NO
- Migration required: NO
- SecureStore changed: NO
- Existing-user financial data preserved: YES
- Financial calculation semantics changed: NO
- Legacy impact: NONE

## Verification

- JSX parse: PASS
- Home hidden-amount contract: PASS
- `git diff --check`: PASS
- Expo web, 390x844, dark English: PASS for hero hierarchy, three-wallet strip,
  grouped month summary, financial-number direction, and grouped recent-list
  source layout.
- Android export: PASS after Home and again after the Onboarding follow-up.
- Arabic RTL Light/Dark: pending checkpoint-wide visual review.
- Actual-device acceptance: PENDING USER REVIEW through
  `exp://192.168.203.191:8081`.

## Onboarding follow-up

During this checkpoint the Product Owner explicitly promoted Onboarding for a
fresh reassessment and requested four short personalization questions instead of
a rigid account-type choice. That newer instruction supersedes the earlier
`no account type selection / fixed six-step onboarding` constraint and will be
implemented as a separate checkpoint after Home acceptance.

## Product Owner refinement — 2026-08-28

The Product Owner removed the yearly period control from the available-balance
hero and removed the first-entry coaching card beneath the wallet strip. Home
now shows only Today, This week, and This month; each control includes a
direction mark so an up/down result is readable without guessing from color.

The Month summary is a single divided surface with a compact month badge, not a
set of separate cards. Quick Add is a single grouped surface with one calm
heading and semantic icon actions. Important states use an amber decision
surface, while Savings uses a green progress surface; both retain their existing
financial data and actions.

- Financial data changed: NO
- SQLite schema changed: NO
- Migration required: NO
- SecureStore changed: NO
- Existing-user financial data preserved: YES
- Expo web 390×844: PASS for three hero periods, no coaching card below
  Wallets, and the grouped Quick Add surface. Data-populated Important/Savings
  visual acceptance remains pending user-device review.

## Product Owner refinement — collapsible follow-up surfaces

Important states and Savings now start collapsed. Their first line remains
visible as a real touch target with its semantic icon, alert/goal count, and a
chevron; pressing it exposes the existing details and financial actions.
Collapsing changes no financial truth, alert timing, goal progress, or action
availability.

- Financial data changed: NO
- SQLite schema changed: NO
- Migration required: NO
- SecureStore changed: NO
- Existing-user financial data preserved: YES
