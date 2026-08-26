# MYFI — Master Product Design Blueprint

**Status:** CANONICAL — the single highest-authority product/design document.
**Consolidated:** 2026-08-26, from the 2026-08-25 design audit, the
2026-08-25 approved-visual-reference reconciliation, and the 2026-08-26
Product Owner rulings (both the design-decisions ruling and the final
corrections in this consolidation pass).
**Supersedes, for day-to-day product/design reference:**
`docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`.
That file is not deleted or moved — it remains the historical record of the
original Product Owner instruction and stays registered in
`docs/00_MYFI_CANONICAL_AUTHORITY.md`; this document is what should now be
read first for product/design questions. See `00_README_DESIGN_SOURCE_OF_TRUTH.md`
for the full navigation map.

**Authority scope:** product philosophy, information architecture, locked
product decisions, and how the rest of `docs/design/` relates to this
document. It does not restate token values, component specs, or screen-level
detail — those live in their own documents, referenced below.

---

## 1. Product philosophy

MYFI is a **local-first personal finance app**. On-device SQLite is the
source of financial truth; Supabase is a gated sync/backup layer, never the
authority. The product exists to answer, at a glance and in Arabic-native
RTL, a small number of honest questions: *where do I stand, what needs my
attention, and what did I just do with my money.*

## 2. Design philosophy

Calm, restrained, legible. The interface's job is trust and clarity, not
delight-through-decoration. Full detail: `02_MYFI_VISUAL_IDENTITY_CANONICAL.md`.

## 3. Product positioning (corrected 2026-08-26)

MYFI is **not** defined as a product for Arab users only. Arabic-first and
RTL-native design are approved, first-class **implementation** requirements —
but product positioning must remain internationally extensible. Describe the
product as clear, fast, safe, human, and financially trustworthy; do not use
language implying market exclusivity (e.g. "an Arabic experience"). This
corrects a description that appeared in earlier working documents — see
`14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`, REF-02.

## 4. Information architecture — LOCKED

### 4.1 Primary navigation

Exactly four primary destinations:

**Home · My Money · Follow-ups · More**

History, Reports, and Settings are **not** primary tabs. More is **not**
Settings. Full navigation rules and rationale: `06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md`.

### 4.2 Home — locked product contract

Answers: *"Where do I stand now?"* Centered MYFI identity/header; total
balance hero; periods (Today/This Week/This Month/This Year); wallets
summary + View All Wallets; Monthly Summary (Income/Expense/Net); Needs
Attention only when meaningful; global Add Method behavior; Recent
Transactions + View All. No permanent global search control on Home.
**Financial direction convention (corrected 2026-08-26): Income is UP,
Expense is DOWN** — any prior documentation or reference image showing the
reverse is wrong and must not be implemented. Visual/spacing/density detail
may be refined during Expo/device testing without reopening this contract.
Full spec: `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`.

### 4.3 My Money — locked product contract

Four first-class gateways: **Wallets & Accounts · Transactions & History ·
Plan & Budget · Reports & Analytics.** Transfers are actions/workflows, not a
fifth gateway. **External bank/card-aggregation linkage is FUTURE/CONDITIONAL**
— the current target must work fully without it; no live banking
integration is implied by any approved mockup. Full spec:
`07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`.

### 4.4 Follow-ups — locked product contract

The action-and-tracking workspace for ongoing financial matters: Debts,
Receivables, Commitments, Bills, Installments, Subscriptions, Goals,
Savings, upcoming due items, and **Payment History (سجل الدفعات) as an
explicit, first-class capability**. Reuse `TrackersLabScreen.js`'s business
logic where correct; its current UI is not automatically canonical. Full
spec: `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`.

### 4.5 More — locked structure

Utility/discovery/service hub, not Settings: **My Shortcuts** (exactly
three, user-selected) · **My Tools** · **Data & Files** · **Benefits /
Rewards** · **MYFI & Help** · **Settings**. Adaptive-More governance
(PERMANENT / TEMPORARY-MATURITY-DEPENDENT / CONDITIONAL) applies — do not
permanently crowd More with launch-stage education or promotions.
**Archive: More → My Tools → Archive.** **Add Method: More → My Tools →
Customize MYFI → Add Method.**

### 4.6 Settings — locked structure

Exactly five root sections: **Account & Sync card · Appearance & Language ·
Financial Preferences · Notifications & Reminders · Privacy & Security.** No
duplicate Account & Sync row beneath the top card. **Country and Base
Currency live under Financial Preferences**, not Appearance & Language.
**Explicitly excluded** unless a future Product Owner requirement approves
them: user-selectable brand accent color, payment-method management,
card/bank management, VAT settings, rounding settings. The Account & Sync
card may show identity, sync status, verification, and account actions — it
must never reintroduce an account-type model (Personal/Business/Dual was
removed from onboarding and must not reappear here either).

### 4.7 Onboarding — locked

Exact six-step flow: **1) Welcome → 2) What matters to you first? → 3)
Customize your experience → 4) Create first wallet → 5) Privacy first → 6)
Everything is ready.** No Personal/Business/Dual account-type selection; no
opening-balance requirement. Permissions are requested contextually, at the
moment a related feature is used — never bundled into onboarding. Existing
users get a short **"What Changed"** experience, not the full sequence.

### 4.8 Global Add Method

One global setting at **More → My Tools → Customize MYFI → Add Method**,
modes **Quick Add** or **side `+` button**, mutually exclusive, applying to
both Home and Follow-ups while actions stay contextual (Home: Expense/
Income/Transfer/Smart; Follow-ups: Debt/Receivable/Commitment/Goal). Already
implemented in code as `cfg.entryMode` — this is a relocation of existing
logic, not a new build. **The side `+` button is not canonically purple** —
it belongs to the MYFI olive/green brand system; a generated reference
image showing purple is not a design decision.

## 5. Financial presentation principles

Amounts are always signed, colored, and labeled together — never color
alone. Income is UP / green-adjacent; Expense is DOWN / warm-toned;
Transfer and Danger are independent semantic roles (see
`04_MYFI_DESIGN_TOKEN_CATALOG.md`). Full presentation rules:
`10_MYFI_CHART_AND_FINANCIAL_VISUALIZATION_SYSTEM.md`.

## 6. Automation principles

Smart/automated capabilities (categorization suggestions, recurring
detection, OCR/voice/SMS drafts) never write financial data directly — they
produce a draft that follows Draft → Validate → Deduplicate → Review →
Confirm → Post, per the 2026-08-24 Product/Security addendum, which this
Blueprint does not alter.

## 7. Local-first principles

SQLite is the operational financial truth; Supabase is a gated, optional
sync/backup layer, never a requirement for the app to function. Nothing in
this design workstream authorizes or implies a change to that boundary.

## 8. Relationship to the Design System

This document defines *what* MYFI is structurally; `03_MYFI_DESIGN_SYSTEM_CANONICAL.md`
defines the components and interaction rules that deliver it;
`04_MYFI_DESIGN_TOKEN_CATALOG.md` defines exact values. None of the three
duplicate each other's authority — see `00_README_DESIGN_SOURCE_OF_TRUTH.md`.

## 9. Light/Dark

Light and Dark are two color expressions of one structure, never two designs
— confirmed already sound in the current codebase (`src/lib/theme.js`) and
in every approved reference supplied in both themes. See
`02_MYFI_VISUAL_IDENTITY_CANONICAL.md` §6 and `09_MYFI_ACCESSIBILITY_RTL_AND_RESPONSIVE.md`.

## 10. RTL

Arabic/RTL is first-class and non-negotiable at the implementation level
(see §3 on positioning — this is not in tension with international
extensibility). Existing infrastructure (`src/lib/layout.js`) is sound and
canonical. Full detail: `09_MYFI_ACCESSIBILITY_RTL_AND_RESPONSIVE.md`.

## 11. Accessibility

Full detail: `09_MYFI_ACCESSIBILITY_RTL_AND_RESPONSIVE.md`. Confirmed rules
are separated from implementation-validation items — nothing is claimed
proven without device evidence.

## 12. System states

Loading, empty, error, success, warning, offline, and sync-status states
follow one consistent language across the app. Full detail:
`11_MYFI_SYSTEM_STATES_AND_FEEDBACK.md`. This document does not describe or
alter restore/sync *behavior* — only its UX-contract presentation.

## 13. Charts and Reports philosophy

Reports is a dedicated destination (reached via My Money), not reduced to a
token-migration exercise. Full taxonomy, per-report structure
(Summary → Chart → Interpretation → Drill-down → Related transactions →
Action), and chart-system rules: `10_MYFI_CHART_AND_FINANCIAL_VISUALIZATION_SYSTEM.md`.

## 14. Adaptive More

More's content is classified PERMANENT / TEMPORARY-MATURITY-DEPENDENT /
CONDITIONAL and is expected to change shape as the product matures — this is
intentional, not drift. Governance: `08_MYFI_DESIGN_GOVERNANCE.md`.

## 15. Future / conditional capabilities

External bank/card-aggregation linkage (My Money); user-selectable accent
color, payment-method/card/bank/VAT/rounding settings (Settings); net worth
presentation (only if a real assets/liabilities model is ever supported);
financial forecast display (only where justified by real data). None of
these are current target capabilities; none should be inferred from any
mockup or prior draft.

## 16. Legacy policy

`CommitScreen.js`, `DebtsScreen.js`, `GoalsScreen.js`, `AuthScreen.js`,
`SpaceScreen.js` are LEGACY / RETIREMENT CANDIDATES — not deleted, not
scheduled for immediate removal. `SettingsLegacyScreen.js` is **live**, not
dead code, and must migrate together with `SettingsScreen.js`. Full policy
and the six-step removal gate: `08_MYFI_DESIGN_GOVERNANCE.md` and
`05_MYFI_COMPONENT_ARCHITECTURE.md`.

## 17. Implementation-validation philosophy

The design is sufficiently mature to proceed. Spacing, card dimensions,
typography sizing, visual density, icon placement, secondary ordering,
animation, chart presentation, Settings search affordance, touch ergonomics,
long-screen balance, keyboard behavior, Bottom Sheet sizing, and Light/Dark
polish are all **implementation-validation refinements** — they must not
reopen the approved architecture above unless a serious usability problem is
proven on a real device.

## 18. Expo/device feedback loop

```
Canonical Design → Implementation → Expo Development Build → Real Device
Review → Light/Dark Review → RTL Review → Accessibility Review → UX
Friction Findings → Approved Adjustment → Design System update if needed
```

Device testing may refine presentation. It must never silently alter
financial semantics or the locked product architecture in §4.

## 19. Migration principles

Reuse before rebuild; token/primitive work precedes navigation-shell work;
navigation-shell work precedes screen-level cleanup; legacy retirement
follows its six-step gate, always last. Full sequence:
`12_MYFI_DESIGN_MIGRATION_ROADMAP.md`.

## 20. Financial-data safety boundary — absolute

Nothing in `docs/design/` authorizes a change to financial semantics,
ledger rules, balances, transaction/transfer meaning, historical FX,
reconciliation, SQLite schema, migrations, backup format, restore behavior,
rollback, synchronization semantics, or authentication behavior. Any design
proposal that appears to require one of these is
**ENGINEERING / PRODUCT APPROVAL REQUIRED** and is routed outside the design
workstream entirely.
