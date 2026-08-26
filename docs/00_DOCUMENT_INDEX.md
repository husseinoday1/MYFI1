# MYFI — Document Index

**Purpose:** classify MYFI documentation so a session opens the right file instead
of reading the tree. Consult this **before** reading anything under `docs/`.

**This index does not create authority.** `00_MYFI_CANONICAL_AUTHORITY.md` (A0–A7)
decides conflicts; §3 there is the binding list of superseded documents. If this
index and the authority doc disagree, the authority doc wins and this file is
wrong — fix it.

Classes: **CANONICAL** (authoritative now) · **SUPPORTING** (useful detail, not
primary truth) · **HISTORICAL** (kept for project history) · **SUPERSEDED**
(explicitly replaced, no execution authority) · **GENERATED** (derivable, may be
regenerated) · **TASK-SPECIFIC** (read only while that task is active).

## CANONICAL

| Document | Covers |
|---|---|
| `00_MYFI_CANONICAL_AUTHORITY.md` | Authority order, conflict rules, standing engineering rules, superseded list |
| `01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md` | Phase 0–21 roadmap, architecture, execution policy (A1) |
| `01_CORE_AUTHORITY/MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md` | Active Sync V2 overlay (A2) |
| `01_CORE_AUTHORITY/MYFI_R04_1_ACCEPTANCE_RECOVERY_ADDENDUM.md` | Active acceptance/recovery overlay (A2) |
| `01_CORE_AUTHORITY/MYFI_MULTI_CURRENCY_FINANCIAL_POLICY_ADDENDUM.md` | Multi-currency policy (A2) |
| `01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md` | Product security / data-protection overlay (A2) |
| `01_CORE_AUTHORITY/MYFI_RELEASE_GATE_STATUS_AR.md` | Release gate status |
| `MYFI_FINANCIAL_CONTRACT.md` | Financial invariants (A3) — binding on all money code |
| `MYFI_DATA_OWNERSHIP.md` · `MYFI_SYNC_PROTOCOL.md` · `MYFI_BACKUP_FORMAT.md` · `MYFI_DATE_TIME_CONTRACT.md` · `MYFI_MIGRATION_POLICY.md` · `MYFI_PERFORMANCE_SLO.md` · `MYFI_RELEASE_SCOPE.md` · `MYFI_SECURITY_THREAT_MODEL.md` | Permanent domain contracts (A3) |
| `00_CONTEXT_MAP.md` | Navigation (this repo's map) |

## SUPPORTING

`FINANCIAL_MODEL_2_0_AR.md`, `SQLITE_FINANCIAL_CORE_V7_DESIGN_AR.md`,
`DATABASE_ARCHITECTURE.md` (A5 technical design) ·
`MYFI_UI_REDESIGN_SPEC_AR.md`, `USER_GUIDE_AND_SUPPORT_PLAN_AR.md`,
`SMART_CAPTURE.md` (A6 product/UX) ·
`ANDROID_RELEASE_READINESS_AR.md`, `PLAY_CONSOLE_SUBMISSION_AR.md`,
`MYFI_MARKETING_PLAN_AR.md` (A7 release/store — re-verify store policy live at
submission time) · `CODE_QUALITY_STANDARDS_AR.md`, `BACKFILL_RUNBOOK.md`,
`CLOUD_INTEGRATION_STATUS_AR.md`.

## EVIDENCE — `04_CURRENT_EVIDENCE/` (72 files)

Dated, append-mostly acceptance record (A4). **Never read the whole directory.**
Selection rule: newest dated file for the topic wins, and newer real-device
evidence beats older automated or static evidence. Filenames encode topic and
date (`MYFI_<TOPIC>_<YYYY-MM-DD>.md`); grep the topic, open the newest hit.
Files named for an open task (e.g. `P10_014A_*`) are TASK-SPECIFIC — read only
while that task is active.

## HISTORICAL / SUPERSEDED

- `90_HISTORICAL_SUPERSEDED_INDEX.md` — the historical register.
- `00_MYFI_CANONICAL_AUTHORITY.md` §3 — the binding superseded list.
- `START_HERE.md` — **SUPERSEDED as a reading order.** Its prescribed sequence
  pins 2026-08-16 status files. Use root `CLAUDE.md` § "Session start" instead.
  Kept because its authority-and-verify-git advice is still right.
- Repo root `MYFI_PRODUCT_BLUEPRINT.md` — HISTORICAL. AsyncStorage-era concept
  doc with a different roadmap. Never cite as current architecture.
- Repo root `MYFI_ENGINEERING_HANDOFF.md` — SUPPORTING but drift-prone (~34 KB).
  It restates rules owned by the authority doc. Verify against A0 before trusting;
  prefer the canonical owner of each rule over this file.

## GENERATED

`.myfi-ai/PROJECT_STATE.md`, `.myfi-ai/CURRENT_TASK.md` — regenerate via
`node tools/myfi-context.mjs`; trust only with fresh provenance.

## Maintenance

When a document is added, superseded, or moved: register it in
`00_MYFI_CANONICAL_AUTHORITY.md` first, then update one row here. If this index
grows into a summary of the documents themselves, it has failed — keep it a
classification, not an encyclopedia.
