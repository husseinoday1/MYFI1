# MYFI Design Recovery Audit — 2026-08-29

## Status

- Decision: **approved for local implementation**.
- Working branch: `codex/design-recovery-2026-08-28`.
- GitHub publishing: **blocked until the user explicitly asks for it**.
- Language conflict: integrate the already-reviewed Implementation 6 series; do
  not create a second competing fix.

## Product decisions that must not regress

1. Primary navigation has exactly four roots: Home, My Money, Follow-ups, More.
2. Removing visual clutter never authorizes removing a feature, hiding a real
   balance, or replacing a financial concept with a different one.
3. Home wallets remain a concise financial section. One wallet fills the row,
   two share it equally, and three or more scroll horizontally. A wallet tap
   selects the default wallet; it must not open the former wallet list popup.
4. Home order is greeting, available balance, monthly summary, quick add,
   wallets, then the collapsible attention/savings/recent sections.
5. More is the discoverability home for wallets and tools. Categories,
   subscriptions, benefits/rewards, data, help, and Settings must remain
   discoverable. Every visible destination must have a real effect or an honest
   current-state view; inert placeholder buttons are prohibited.
6. My Money is a financial gateway, not a second Home. Its repeated shortcut
   strip is removed and replaced with five or six distinct, real destinations.
7. Follow-ups must provide a useful cross-module summary. "Needs attention"
   contains actionable items linked to their owning debt, installment,
   commitment, subscription, or goal; it is not static explanatory copy.
8. The welcome language switch previews onboarding language and direction only.
   The Essentials language field persists the app language. Onboarding has no
   Skip action.

## Verified regressions in the audited branch

- Home hid a single wallet through `walletRows.length <= 1`.
- Home renamed the wallet section to "Entry source" and removed balance and
  currency from wallet choices.
- Contract tests explicitly protected the regressed single-wallet behavior and
  the wrong Home order.
- Settings navigation combined an app-level back affordance with an internal
  back affordance on subpages.
- `normalizeCfg` still accepted old root values (`history`, `reports`,
  `settings`) and did not migrate them to the four-root information
  architecture.
- More removed discoverability for wallets, categories, subscriptions, and
  benefits/rewards. Some older entries were inert placeholders and therefore
  must be rebuilt as real routes rather than copied.
- Reports category rows did not drill into their source transactions, while
  Basira's "Open activity" discarded the period/category context.
- Follow-up specializations exist, but the hub attention area and payment
  history do not yet meet the agreed actionable/visual standard.

## Implementation sequence

1. Integrate the approved onboarding-language series.
2. Restore real destinations in More and update navigation contracts.
3. Restore adaptive Home wallets and the approved Home order.
4. Repair start-tab migration and remove duplicate-back behavior.
5. Rebuild Follow-ups summary/attention/payment-history presentation.
6. Expand My Money to six non-duplicative gateways.
7. Update tests that encoded the superseded design and perform runtime/device
   verification before any final merge or push.

