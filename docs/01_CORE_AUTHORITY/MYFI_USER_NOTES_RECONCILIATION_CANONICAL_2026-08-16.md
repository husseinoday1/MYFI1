# MYFI — User Notes Reconciliation Status
## Review date: 2026-08-16

Baseline reviewed:
- Repository: `husseinoday1/MYFI1`
- Branch: `r04-p18-001-blocking-ux`
- HEAD: `ef2f2c6bbe07c71f1e94dd8356338285d0b7abd8`

This file is a quick review companion. The authoritative updated plan is:
`01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md`

## Confirmed structurally implemented
- Three-page onboarding shell.
- Four direct Tracker actions: debt owed, receivable, saving, commitment.
- Settings root/back/reset mechanics.
- Home available-balance focus, month summary, direct actions.
- History top-header removal, fixed controls outside the list, newest-first ordering.
- Repeat Transaction draft paths for income, expense, transfer, debt payment, saving, commitment payment.
- Commitment payment initializes current default wallet.
- Save archive to phone is distinct from share.
- Product identity central module exists.
- Local/connected account presentation and legacy placeholder handling exist structurally.

## Partial / not closed
- Onboarding Quick Setup: usage type + country + currency is missing; completion hardcodes Personal.
- Settings still embeds LegacySettingsScreen for financial configuration.
- Reports final simplified one-selection UX still needs device verification.
- Budget V2 visual layer is not fully accepted.
- Adaptive Smart Budget lacks complete accepted/edited/rejected learning state.
- User Guide V2 covers only a subset of the requested topics.
- About page exists but full Iraqi/Arabic mission/identity is not complete.
- Backup/Restore final atomic/cross-version/semantic gate is not complete.
- Profile restoration on a second device is not proven.
- Full notification acceptance is not proven.

## Confirmed pending user notes
- Home profile → “إدارة الحساب والأمان” still routes to generic Settings rather than directly to Account/Security.
- Login keyboard avoidance remains unclosed.
- Date/year picker design remains functionally acceptable but visually pending for Phase 18.
- Glossary / “مصطلحات البرنامج” is not implemented.
- Real two-device sync convergence test remains pending.
- Notification privacy and account/ledger isolation remain pending.
- Archive encryption performance remains pending.

## Newly elevated blockers before Phase 6 contract freeze
- Personal/Business scope separation.
- Debt principal/interest/fee semantics.
- Tracker deletion must not delete financial truth.
- Historical as-of reporting.
- Budget/base-currency meaning.
- Three-layer purchase currency model / explicit unsupported policy.
- Third-currency fee policy.
- Wallet valuation freshness.
- Refund/reversal semantics.
- Category lifecycle must preserve historical truth.
- Feature toggles must not hide financial truth.
- No silent wallet-reference repair during restore.

No code change was made as part of this review.

---

# Device Screenshot Reconciliation — 2026-08-15

Current GitHub evidence branch:

```text
phase-04-multicurrency-r03
HEAD 28c7e29e7c1623f83ccb4359bba613f8f2f5cd25
```

## Confirmed / merged

| ID | Finding | Status |
|---|---|---|
| D-09 | Profile → Account/Security direct route | OPEN from previous device test |
| D-10 | Login/Connect keyboard occlusion | FAIL_DEVICE_CONFIRMED |
| D-16 | Merge action icon semantics | FAIL_DEVICE_CONFIRMED |
| D-17 | Persistent financial input labels | FAIL_DEVICE_CONFIRMED |
| D-18 | Picker keyboard/focus handoff | FAIL_DEVICE_CONFIRMED |
| D-19 | Arabic BiDi FX/money expression | FAIL_DEVICE_CONFIRMED |
| D-20 | Commitment duplicate status/date | FAIL_DEVICE_CONFIRMED |
| D-21 | Type/sign/color financial semantic parity | DOMAIN_TEST_REQUIRED / merged UPA-24 |

## Positive evidence / do not reopen without new evidence

| Area | Status |
|---|---|
| Entity currency independent from payment wallet | PASS_DEVICE_EVIDENCE |
| Foreign wallet does not mutate Base Currency | PASS_DEVICE_EVIDENCE |
| One-screen cross-currency transfer structure | PARTIAL_PASS |
| Mixed IQD/IRR history presentation preserved | PARTIAL_PASS / positive evidence |
| Disabled transfer confirmation before target FX/amount | PASS expected safety behavior |

## Dropped as unproven

| Candidate | Result |
|---|---|
| Home total is wrong merely because multiple wallet currencies exist | NOT_PROVEN_DROP |
| Month label August vs 08 is a bug | NOT_PROVEN_DROP; user preference may explain it |
| Multiple currencies in History are inconsistent | DROP; expected multi-currency behavior |

Next consolidated release target:

```text
R04 — Pre-Phase-6 Correctness + Device UX Cohesion
```

One installer, one automated gate, one final device acceptance session.

## Newly confirmed during Plan Architecture Audit
- **Logout / local ledger lifecycle:** `BLOCKING` contract before Phase 6; runtime/device acceptance belongs to Phase 9. Current code signs out cloud locally then switches workspace namespace from `user:<id>` to `guest`; reviewed path does not explicitly delete the account namespace, but the ledger disappears from the active UI and can create a later Guest→Account merge situation.
- **Global icon/action semantics:** `PENDING`, target Phase 18; confirmed merge dialog mismatch (Back shown with trash icon, Keep Changes shown with X).
- **Latest screenshot financial presentation:** multi-currency meaning belongs to Phase 4/7; visual-only polish belongs to Phase 18. Do not create a parallel UX implementation stream.
## Plan architecture correction
- Corrected addendum phase mapping: Sync findings belong to **Phase 14**, not Phase 11; Security/Privacy belongs to **Phase 16**, not Phase 15.
- Added a strict one-primary-owner rule so financial contract, read presentation, UX polish, sync, security, and RC acceptance do not create duplicate implementation streams.
- Added `UPA-45 Logout / Session ≠ Ledger Lifecycle` to the Pre-Phase-6 contract blockers.
- R03 code is retained; only contradicted acceptance gates are reopened. If a U-2 contract changes storage/model semantics, Phase 5 shadow migration is revalidated before Phase 6.

---

# R04 Reconciliation Update — 2026-08-15

The following previously open/high-risk notes are now included in the R04 implementation contract (device acceptance still pending where UI/runtime dependent):

- First-run Quick Setup restores explicit Usage Type + Country + Base Currency; country is a suggestion only and base currency is user-confirmed.
- Mixed Personal/Business mode honors the selected active scope instead of always exposing ALL.
- Normal Logout preserves the currently active local ledger; session identity is decoupled from local ledger visibility.
- Debt/Goal tracker deletion preserves posted financial transaction history.
- Tracker rename no longer rewrites historical payment/saving transaction titles.
- Category removal archives metadata and preserves historical category identity; no mass rewrite to `other`.
- Broken commitment→tracker links require review and are not silently repaired by name/single-candidate matching.
- Foreign wallet reconciliation requires explicit historical FX.
- Foreign wallet valuation records a freshness timestamp.
- Reports financial totals are independent from module visibility.
- Backup unknown-wallet references are blocking validation errors rather than silent repairs.
- Home/Reports post-cutover financial aggregates move to V7 SQL queries; History already uses the V7 query adapter.
- Post-cutover Zustand transaction cache is bounded; SQLite remains the financial source of truth.

Still owned by later phases rather than duplicated into R04 UI polish:
- global icon/action semantic audit;
- login keyboard layout polish;
- direct Account/Security route;
- date/year visual redesign;
- full accessibility and 200% font/TalkBack;
- product-level advanced loans/refunds/split/merchant flows;
- full Backup/Restore Phase 10 acceptance and two-device Phase 14 sync acceptance.

## R04 Read-Truth Reconciliation Addendum

The screenshot/user audit about currency meaning is applied beyond individual transactions: Home/Reports may not sum IRR + IQD + USD tracker values as if they were one currency. R04 therefore groups current Debt/Receivable/Goal/Commitment values by immutable entity currency, uses historical base snapshots only where they exist, and refuses a single Net Position when current foreign debt/receivable valuation is not provable. Historical report periods do not pretend that current tracker state is an as-of historical snapshot.

Status: `PASS_STATIC`, device acceptance pending with the single R04 acceptance session.

---

# User clarification reconciliation — 2026-08-16

- “User-controlled” means the user can enable/show or disable/hide optional
  features, not only approve automation actions.
- Hiding a feature must be reversible and must not delete or suppress financial
  truth from History, Reports, export, backup, or restore.
- Notifications & Reminders belongs as a direct Settings destination. Lock-screen
  content privacy remains under Security.
- Device feedback confirmed that asking for the received amount after the wallet
  valuation rate was already supplied is avoidable duplication. MYFI should
  calculate it as an editable suggestion and freeze the reviewed result only when
  the user confirms the transaction.
- A cross-currency transaction flow should not force the user to re-enter the
  same converted amount after the rate is already known. If the FX/valuation is
  supplied, the app should derive the amount as an editable suggestion instead
  of treating the amount prompt as a separate mandatory step.
- Optional feature visibility is a product control surface, not a hidden
  automation switch. The Settings Root placement is intentional because the
  user is deciding what surfaces to show or hide.
