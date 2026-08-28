# MYFI — Design Decision Log

**Status:** CANONICAL · **Created:** 2026-08-26, consolidating decisions
previously recorded inline across the nine original canonical files and
`archive/MYFI_BLUEPRINT_REVISION_MAP.md`. Uses the template defined in
`08_MYFI_DESIGN_GOVERNANCE.md` §10. This is the single place to check
whether something is a settled decision before re-litigating it.

---

**Date:** 2026-08-24
**Decision:** Post-Phase-10 planning registers Competitive Design
Translation and Security & Data Protection as parallel workstreams.
**Reason:** Phase 10 (engineering) closure freed capacity for product/design
work without reopening the Frozen Master Plan's engineering phase order.
**Evidence:** `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md`.
**Documents updated:** `docs/00_MYFI_CANONICAL_AUTHORITY.md`.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-25
**Decision:** Product Design Restructure Blueprint accepted as the approved
target product/design direction (4-tab navigation, Home/My Money/
Follow-ups/More, Settings/Add Method structure, visual identity direction).
**Reason:** Product Owner-authored blueprint, reconciled against live repo
evidence by Planning & Audit.
**Evidence:** `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`,
`docs/04_CURRENT_EVIDENCE/MYFI_PRODUCT_DESIGN_BLUEPRINT_RECONCILIATION_2026-08-25.md`.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-25
**Decision:** Full design/product/architecture audit executed — visual
identity, token/component inventory, screen consistency matrix, migration
proposal. Confirmed the 5-tab-vs-4-tab navigation gap directly against
`App.js:54-60`.
**Reason:** Required pre-implementation evidence base.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-25
**Decision:** 10 Product Owner-approved visual references (Home, Onboarding
×6, My Money, Follow-ups, More, Settings) incorporated; Home's bottom-nav
labeling judged a superseded artifact against the majority + text.
**Evidence:** `14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-28
**Decision:** Onboarding — REVISED by the Product Owner. Replace the rigid
account-type idea and broad priorities multi-select with four short,
single-answer personalization questions: usage context, first goal, money
organization, and preferred interface detail. Use the answers to tune only
supported module visibility. Combine country/language/currency/appearance
and first-wallet naming into Essentials, then end with Privacy and Start.
Remove Skip entirely; Back remains available.
**Supersedes:** the exact 6-step ordering approved on 2026-08-26 and the
separate final completion screen. The earlier reference images remain style
and content inputs, not the current step-count authority.
**Financial/data impact:** no transaction, balance, ledger, FX, SQLite,
migration, backup, restore, auth, sync, or SecureStore change. Existing-user
financial data remains preserved.

---

**Date:** 2026-08-26
**Decision:** Category color governance — APPROVED. Categories may use a
broader-than-brand palette under six governance conditions (muted,
Light/Dark-safe, accessible, never substitutes for brand/financial
semantics, never sole identifier, centrally governed). Concrete
value-by-value muting recommendation produced for the existing 12-hue
`CAT_COLORS` palette, including two near-duplicate-hue consolidations.
**Documents updated:** `02_MYFI_VISUAL_IDENTITY_CANONICAL.md` §5,
`04_MYFI_DESIGN_TOKEN_CATALOG.md`.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26
**Decision:** Country and Base Currency — APPROVED under Settings →
Financial Preferences, not Appearance & Language.
**Superseded prior guidance:** current code groups them with Language/Theme
(`SettingsScreen.js:1402-1403`) — now a confirmed implementation gap, not an
open design question.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26
**Decision:** Payment methods, VAT, and rounding settings — REJECTED FOR
CURRENT TARGET / REMOVE FROM TARGET. Not approved MYFI capabilities; not to
be inferred from mockup artifacts into any implementation.
**Financial/data impact:** NONE (these were never implemented).

---

**Date:** 2026-08-26
**Decision:** Onboarding — APPROVED exact 6-step flow (Welcome → What
matters to you first → Customize your experience → Create first wallet →
Privacy first → Everything is ready). No Personal/Business/Dual selection;
no opening-balance requirement; contextual permissions; existing users get
a short "What Changed" flow instead of full onboarding.
**Superseded prior guidance:** a register entry had flagged the step count
against the 2026-08-24 addendum's "short flow" intent as open — now settled
as intentionally short. A source mockup mislabeled the wallet-setup step
"1 of 6"; its approved canonical position is step 4.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26
**Decision:** Developer/diagnostic UI — APPROVED DIRECTION. Must sit behind
one consistent gate, not a mix of `__DEV__` checks and build-time env
variables. Exact technical mechanism owed to the Security track
(`SECURITY-S6`), not decided by design work.
**Evidence:** `SettingsScreen.js:1834-1848` (`__DEV__`-gated, correct) vs.
`SettingsScreen.js:1520-1531,1544-1557` (inconsistently gated).
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26
**Decision:** Legacy/orphaned screens — APPROVED classification (LEGACY /
RETIREMENT CANDIDATE) and six-step removal policy (dependency verification →
replacement-flow verification → feature parity → runtime/device
verification → Product Owner authorization → rollback-safe change package).
`AuthScreen.js` specifically held until its live replacement's dependencies
are fully verified.
**Evidence:** `CommitScreen.js`, `DebtsScreen.js`, `GoalsScreen.js`,
`AuthScreen.js`, `SpaceScreen.js` all confirmed unreferenced by `App.js`;
live auth flow located in `SettingsScreen.js`'s `AuthModal`
(`SettingsScreen.js:1978`, `619-620`) and duplicated in
`SettingsLegacyScreen.js:794-795`.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26
**Decision:** Archive location — APPROVED: More → My Tools → Archive. Not a
Home destination, not a primary My Money gateway.
**Superseded prior guidance:** an earlier audit pass had proposed "secondary
from Home/My Money" — corrected.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26
**Decision:** Brand vs. income tokens — APPROVED: independent semantic
roles, not coupled through the same source token; may still resolve to the
same visible value.
**Superseded prior guidance:** an earlier draft rule said they "must never
share a literal value" — corrected to the semantic-independence framing.
**Evidence:** `theme.js:11,16` confirmed `primary` and `inc` are currently
the same literal (`BRAND_GREEN`) — the fix is architectural independence,
not necessarily a new visible color.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26 (final consolidation pass)
**Decision:** Home financial direction — CORRECTED: Income is UP, Expense is
DOWN. A prior register description had the arrow directions reversed
(matching what an approved mockup showed); this is a documentation
correction only, not a re-audit of the image.
**Financial/data impact:** NONE (presentation only).

---

**Date:** 2026-08-26 (final consolidation pass)
**Decision:** Side `+` button color — the global Add-mode side button is
**not** canonically purple. It belongs to the MYFI olive/green brand system
unless later device testing proves a better accessible treatment. Purple
remains available only for a governed semantic/category role (e.g. the
Goals category), never the global Add control.
**Reason:** an approved reference image happened to render the floating `+`
in purple; per the standing rule that explicit text overrides image
artifacts, this is not promoted to canonical.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26 (final consolidation pass)
**Decision:** External bank/card-aggregation linkage — FUTURE / CONDITIONAL,
not a current My Money capability. The current target must work fully
without it; no live banking integration should be inferred from any mockup.
**Financial/data impact:** NONE (no such integration exists in the codebase
today).

---

**Date:** 2026-08-26 (final consolidation pass)
**Decision:** Account & Sync card must not encode an account-type model
(e.g. "Personal account" as a label implying Personal/Business/Dual). It may
show identity, sync status, verification, and account actions only.
**Reason:** consistent with onboarding's removal of Personal/Business/Dual
selection — the Settings card must not silently reintroduce it.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26 (final consolidation pass)
**Decision:** Product positioning must remain internationally extensible.
Arabic/RTL-native is an approved first-class **implementation** requirement,
not a market-exclusivity claim. Description language correcting an earlier
"Arabic experience" framing.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26 (final consolidation pass)
**Decision:** Reports/Product-UX workstream is explicitly NOT reducible to
"replace chart colors with tokens." A full report taxonomy, per-report
structure, and chart-selection/color/RTL/accessibility rule set is now
canonical (`10_MYFI_CHART_AND_FINANCIAL_VISUALIZATION_SYSTEM.md`). Net worth
and forecast reports are explicitly FUTURE/CONDITIONAL, not built now.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26 (final consolidation pass)
**Decision:** Settings search icon is an implementation/Expo-validation
detail, not a hard global requirement. If Settings stays small and clear,
search may be omitted without reopening the navigation document.
**Financial/data impact:** NONE.

---

**Date:** 2026-08-26 (final consolidation pass)
**Decision:** Documentation hierarchy consolidated from 9 files into the
15-document `docs/design/` structure (this log, the Master Blueprint, and
12 supporting documents), with 2 superseded working documents moved to
`docs/design/archive/`. No production code, navigation, or financial logic
touched by this consolidation.
**Documents updated:** all of `docs/design/`.
**Financial/data impact:** NONE.
