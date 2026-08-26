# MYFI — Blueprint Revision Map

**Registered:** 2026-08-25 · **Status:** CANONICAL (proposal only — the
Master Blueprint itself is NOT modified by this document, per this phase's
explicit instruction §14/§17)

This maps proposed future changes to
`docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`,
incorporating both the initial code-audit findings and the 2026-08-25
approved-visual-reference reconciliation. It supersedes the smaller revision
map embedded in the first audit response (same date) by covering the full
set of sections the Blueprint itself asks to reconcile (§14 of this phase's
instruction).

| Blueprint section | Topic | Disposition | Rationale/evidence |
|---|---|---|---|
| §2 | Primary navigation (4 tabs) | **KEEP** | Confirmed by REF-04, REF-05, REF-06, REF-07 (4-of-4 consistent); REF-01's differing bottom-nav is judged an artifact, not evidence against this |
| §3 | Home direction | **KEEP**, with visual detail now attached | REF-01 supplies the concrete hero-card/period-pill/quick-add layout the text only described abstractly |
| §4 | My Money (4 gateways) | **KEEP**, now with a full visual reference | REF-04 confirms exact gateway count, labels, and the View/Add/Complex-flow navigation legend |
| §5 | Follow-ups direction | **AMEND** — add explicit acknowledgment that `TrackersLabScreen.js` already implements most of this in substance; add Payment History as an explicitly confirmed first-class section (REF-05) | Code + REF-05 both confirm |
| §6 | More direction | **AMEND** — add the "exactly three customizable shortcuts" detail (REF-06), not previously specified at that precision | REF-06 |
| §7 | My Tools / Add Method location | **AMEND** — note `cfg.entryMode` already implements the Quick Add/Side-plus toggle in code (`App.js:837`, `HomeScreen.js:1161`, `TrackersLabScreen.js:726`), and already applies to both Home and Follow-ups already — this is a relocation/relabeling task, not new logic | Code audit, Task 3 |
| §8 | Settings direction | **AMEND** — root structure now visually confirmed exact (REF-07, 5 rows, no duplicate Account/Sync row); **Country/Currency ruling RESOLVED 2026-08-26 — approved under Financial Preferences**, not Appearance & Language. Current code (`SettingsScreen.js:1402-1403`) groups them with Language/Theme — confirmed code-vs-target gap for implementation, no longer an open design question | REF-07 + Settings code audit + 2026-08-26 ruling |
| §8 (accent color rule) | "Do not introduce user-selectable accent colors" | **KEEP, reinforced** | REF-07's accent-color picker is **formally REJECTED FOR CURRENT TARGET (2026-08-26)**, not merely flagged; the Blueprint's existing prohibition stands |
| §8 (payment methods / VAT / rounding) | "Do not invent unsupported payment-method settings" | **KEEP, reinforced** | REF-07's "payment methods" and VAT/rounding rows are **formally REJECTED FOR CURRENT TARGET / REMOVE FROM TARGET (2026-08-26)** — not to be inferred into any implementation absent a fresh, explicit product requirement |
| §9 | Privacy/legal information | **KEEP** | Not contradicted by any reference; More → Help/MYFI confirmed structurally by REF-06 |
| §11 | Financial/database safety boundary | **KEEP, unconditionally** | No finding in either audit pass touches financial/schema/sync/backup code |
| §13 | Visual identity audit scope | **KEEP** | Fully executed across both audit passes |
| §14 | Color governance | **AMEND, RESOLVED 2026-08-26** — replace "brand and income must never share a literal value" with the corrected rule: "independent semantic roles, not necessarily different literal values" | Product Owner correction 3.2, reaffirmed 2026-08-26 |
| (new, under §14) | Category color governance | **ADD NEW, APPROVED 2026-08-26** — categories may use a wider palette than the brand identity under the six governance conditions in `MYFI_VISUAL_IDENTITY_CANONICAL.md` §5; concrete audited value recommendations now in `MYFI_DESIGN_TOKEN_CATALOG.md` | 2026-08-26 ruling |
| §20 | Component system | **AMEND** — the component list in the original Blueprint (Button, Card, TransactionRow, etc.) should be reconciled against the *actual* inventory in `MYFI_COMPONENT_INVENTORY_AND_MIGRATION.md`, since several named components already exist under different names (`WalletBalanceCard` ≈ AccountCard, `EntryContextRow` ≈ TransactionRow) | Component inventory |
| §29 | Screen-by-screen review | **KEEP**, now executed with visual references | `MYFI_SCREEN_VISUAL_CONSISTENCY_MATRIX.md` |
| (new) | Archive placement | **AMEND, APPROVED** — corrected to **More → My Tools → Archive**; not Home, not a primary My Money gateway | This phase's §3.1, reaffirmed 2026-08-26 |
| (new) | Onboarding flow | **ADD NEW, APPROVED 2026-08-26** — exact 6-step order (Welcome → Priorities → Customize → Create first wallet → Privacy first → Everything ready); no Personal/Business/Dual selection; no opening-balance requirement; contextual per-feature permissions; existing users get a short "What Changed" flow, not full onboarding | 2026-08-26 ruling |
| (new) | Legacy screen retirement policy | **ADD NEW, APPROVED** — 6-step retirement policy (dependency → replacement → parity → runtime verification → PO authorization → rollback-safe change package); `AuthScreen.js` specifically held until its live replacement's dependencies are fully verified | This phase's §3.7, reaffirmed 2026-08-26 |
| (new) | Diagnostic UI gating | **ADD NEW, APPROVED DIRECTION 2026-08-26** — single consistent gating mechanism required; exact technical spec owed to Security track (`SECURITY-S6`), not decided here | This phase's §3.8, reaffirmed 2026-08-26 |
| (new) | SettingsLegacyScreen entanglement | **ADD NEW** — not anticipated by the original Blueprint; `SettingsScreen.js` and `SettingsLegacyScreen.js` must be migrated as one unit, confirmed live (not dead) via 3 embed points plus duplicated auth logic | Code audit, both passes |
| (new) | Live auth-flow location | **ADD NEW** — the Blueprint assumed `AuthScreen.js`-style dedicated auth screens; actual auth lives inside Settings' `AuthModal` (`SettingsScreen.js:1978`) and is duplicated in `SettingsLegacyScreen.js:794-795` | This phase's §3.6, code audit Task 2 |
| Everything else (§0,1,10,12,15-19,21-28,30-38 of the original Blueprint) | — | **KEEP, unaffected** | No conflicting evidence found in either audit pass |

## Resolved 2026-08-26 (previously listed as open here)

All items previously listed in this section were resolved by the 2026-08-26
Product Owner rulings: onboarding step count/order (approved, exact 6-step
flow specified); REF-03D's step-numbering (corrected — canonical position is
step 4); Country/Currency placement (approved — Financial Preferences);
payment-methods/VAT/rounding rows (rejected for current target).

## Not yet resolved (carried forward, not decided here)

- Exact final hex values for the muted category palette (direction and
  per-color recommendation given in `MYFI_DESIGN_TOKEN_CATALOG.md`; a
  contrast/accessibility pass is still an implementation-phase task).
- Exact technical gating mechanism for diagnostic/developer UI (direction
  approved; specification owed to the Security track, `SECURITY-S6`).
- Whether current `OnboardingScreen.js` already complies with the new rules
  (no account-type selection, no opening balance, contextual permissions,
  existing-user "What Changed" flow) — an implementation-phase verification
  item, not a pending decision.
- Orphaned-screen removal authorization — not a decision so much as a gate:
  requires the 6-step retirement policy to be satisfied first.
