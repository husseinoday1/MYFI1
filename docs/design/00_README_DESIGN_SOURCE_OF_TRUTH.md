# MYFI — Design Documentation: Source of Truth

**Status:** CANONICAL INDEX · **Created:** 2026-08-26
**Purpose:** a future human or AI agent should be able to open this one file
and know exactly where to look next. Read this before opening any other file
under `docs/design/`.

## The one Master authority

**`01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md`** — the highest-authority
product/design document. Product philosophy, locked information
architecture (navigation, Home, My Money, Follow-ups, More, Settings,
Onboarding, Add Method), and how every other document below relates to it.
Read this first for any product/design question.

## Where each topic lives

| Topic | Document |
|---|---|
| Visual identity, brand, color governance | `02_MYFI_VISUAL_IDENTITY_CANONICAL.md` |
| Components, interaction rules (not navigation) | `03_MYFI_DESIGN_SYSTEM_CANONICAL.md` |
| Exact token values (colors, type, spacing, radius) | `04_MYFI_DESIGN_TOKEN_CATALOG.md` |
| Component inventory, migration, legacy-screen policy | `05_MYFI_COMPONENT_ARCHITECTURE.md` |
| Navigation, IA, destination map, Add Method, Settings root | `06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md` |
| Per-screen specifications | `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md` |
| Process/governance — reuse rules, checklists, decision template | `08_MYFI_DESIGN_GOVERNANCE.md` |
| Accessibility, RTL, responsive (confirmed vs. validation-pending) | `09_MYFI_ACCESSIBILITY_RTL_AND_RESPONSIVE.md` |
| Reports/chart taxonomy and rules | `10_MYFI_CHART_AND_FINANCIAL_VISUALIZATION_SYSTEM.md` |
| Loading/empty/error/success/sync-status presentation | `11_MYFI_SYSTEM_STATES_AND_FEEDBACK.md` |
| Implementation sequencing (not authorization) | `12_MYFI_DESIGN_MIGRATION_ROADMAP.md` |
| Chronological record of every design decision | `13_MYFI_DESIGN_DECISION_LOG.md` |
| Approved mockups — what they approve, what's an artifact | `14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md` |
| Superseded working documents, why, and what replaced them | `archive/00_ARCHIVE_INDEX.md` |

## What "archive" means here

A file in `docs/design/archive/` is not deleted and not wrong — it did its
job (usually: reconciling evidence into a decision) and that job is finished.
Its conclusions live on in the numbered documents above. See
`archive/00_ARCHIVE_INDEX.md` for exactly what moved and why.

## What is outside this design authority

- **The Frozen Master Plan and engineering phase order**
  (`docs/01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md`) — this design set
  does not renumber or replace engineering phases.
- **Financial contracts, schema, migration, backup/restore, sync, security**
  (`docs/MYFI_FINANCIAL_CONTRACT.md`, `docs/MYFI_SECURITY_THREAT_MODEL.md`,
  etc.) — never touched or reinterpreted by design work.
- **The original 2026-08-25 Product Owner blueprint text**
  (`docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`)
  — superseded for day-to-day reference by `01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md`
  but left in place as the historical instruction record; see
  `archive/00_ARCHIVE_INDEX.md`.
- **The 2026-08-24 Product/Security addendum**
  (`docs/01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md`)
  — still active alongside this design set; not superseded, not touched.

## Authority order (mirrors `docs/00_MYFI_CANONICAL_AUTHORITY.md`)

1. Actual current repository/runtime evidence.
2. Latest explicit Product Owner decision (text overrides an image
   artifact — see `08_MYFI_DESIGN_GOVERNANCE.md` §2).
3. This `docs/design/` canonical set.
4. The original 2026-08-25 Blueprint and its reconciliation evidence
   (historical inputs now absorbed above).
5. Older design/product documentation (`docs/MYFI_UI_REDESIGN_SPEC_AR.md`).
6. Legacy UI behavior.
7. Competitor references.
8. AI recommendations.

## Implementation-validation reminder

The design is sufficiently mature to implement. Spacing, density, minor
icon placement, animation, and similar polish are refined through the Expo/
device feedback loop (`01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md` §18), not
through further documentation cycles. Do not reopen the locked architecture
in the Master Blueprint without a proven, serious usability problem.
