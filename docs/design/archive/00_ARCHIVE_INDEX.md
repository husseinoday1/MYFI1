# MYFI — Design Documentation Archive Index

**Created:** 2026-08-26. This index explains every document moved into
`docs/design/archive/`, why, and what replaced it. Nothing here is deleted —
archived files retain full historical value as the working record of how
the canonical design set was produced.

| Original document | Reason archived | Superseded by | Historical value |
|---|---|---|---|
| `MYFI_BLUEPRINT_REVISION_MAP.md` | Its job — reconciling the original 2026-08-25 Blueprint text against emerging evidence/rulings, section by section — is complete; every resolution it tracked is now a settled entry in the Decision Log, and its structural conclusions are folded into the Master Blueprint. | `13_MYFI_DESIGN_DECISION_LOG.md`, `01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md` | High — shows the exact KEEP/AMEND/SUPERSEDED/ADD-NEW reasoning behind each locked decision, useful if a decision is ever questioned later. |
| `MYFI_DESIGN_SYSTEM_AUDIT_AND_MIGRATION_PROPOSAL.md` | Was the executive summary of the first two audit passes; its migration-sequence content is now `12_MYFI_DESIGN_MIGRATION_ROADMAP.md`, its resolved-decisions content is now in the Decision Log, and its narrative summary is superseded by the Master Blueprint. | `12_MYFI_DESIGN_MIGRATION_ROADMAP.md`, `13_MYFI_DESIGN_DECISION_LOG.md`, `01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md` | High — the original evidence-gathering narrative (magic-value counts, component audit findings, per-file citations) is the primary source for several claims restated more tersely in the new canonical set. |

## Documents outside `docs/design/` — reviewed, not moved

These were reviewed for classification but are **outside this task's
authority to relocate** (they live under `docs/01_CORE_AUTHORITY/` and
`docs/04_CURRENT_EVIDENCE/`, governed by `docs/00_MYFI_CANONICAL_AUTHORITY.md`'s
own registration process, not by a design-documentation consolidation task):

| Document | Classification | Note |
|---|---|---|
| `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md` | SUPERSEDED for day-to-day reference by `01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md`, but left in place as the historical record of the original Product Owner instruction. | Recommend Planning & Audit add a one-line authority-registration note pointing to the new Master Blueprint, as a follow-up — not done in this task. |
| `docs/04_CURRENT_EVIDENCE/MYFI_PRODUCT_DESIGN_BLUEPRINT_RECONCILIATION_2026-08-25.md` | HISTORICAL — its findings are fully absorbed into the Decision Log and Screen Design Specifications. Left in place as evidence. | No action needed. |
| `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md` | **TECHNICAL/SECURITY — DO NOT TOUCH.** Adjacent to design but not a design document; not archived merely because it's nearby. | Its product-workstream content (PRODUCT-P0-A etc.) still applies alongside this design consolidation, per its own authority registration. |
| `docs/MYFI_UI_REDESIGN_SPEC_AR.md` | SUPPORTING — an earlier, narrower UI-polish note (icon/typography/chart cleanup framed as "don't change the current identity"). Not superseded outright since it predates and is narrower in scope than this consolidation, but the current canonical set (`02`–`04`, `10`) is now authoritative wherever the two differ. | Left in place; not merged, to avoid overstating its scope. |
