# MYFI — Historical / Superseded Index
## Excluded from canonical execution set

These files were reviewed but intentionally omitted from the clean canonical package:

| File | Classification | Reason |
|---|---|---|
| MYFI_MASTER_PLAN_FROZEN_WITH_USER_AUDIT_ADDENDUM_REV2_2026-08-15.md | SUPERSEDED | Replaced by newly supplied `MYFI_MASTER_PLAN_FROZEN.md` plus active R04.1/current delta overlays. |
| MYFI_USER_NOTES_RECONCILIATION_REV2_2026-08-15.md | SUPERSEDED | Replaced by newly supplied reconciliation plus latest device overlay. |
| MYFI_CODEX_TAKEOVER_HANDOFF_2026-08-16.md | SUPERSEDED | Generated handoff contained older authority/phase assumptions. |
| CODEX_START_HERE.txt | SUPERSEDED | Replaced by canonical START_HERE. |
| MYFI_LOCAL_SNAPSHOT_INFO.txt | HISTORICAL | Old local checkout snapshot only. |
| BASELINE_FINANCIAL_CORE_CUTOVER_2026-08-14_AR.md | HISTORICAL EVIDENCE | Baseline provenance, not current plan/status. |
| FINANCIAL_CORE_V7_RELEASE_GATE_2026-08-14_AR.md | HISTORICAL EVIDENCE | Older release-gate snapshot. |
| FUTURE_ROADMAP_AND_RELEASE_PLAN_AR.md | DEPRECATED ROADMAP | Frozen Master Plan controls phase order. |
| GIT_CHANGESET_REVIEW_AR.md | HISTORICAL | 2026-08-09 changeset review. |
| RELEASE_READINESS_AR.md | DEPRECATED SUMMARY | Broad readiness claims cannot close formal gates. |
| MYFI_IMPLEMENTATION_STATUS.md | DEPRECATED SUMMARY | Current Git + formal gate/evidence supersede this snapshot. |
| SYNC_RECOVERY_SCENARIOS_AR.md | LEGACY SCENARIO INVENTORY | Contains old Guest/logout behavior that conflicts with current ledger/session contract. |
| Pasted text(2).txt | TRANSIENT LOG | Test transcript only. |

No exact byte-for-byte duplicate files were found; the cleanup is semantic/version deduplication.

## Note (added 2026-08-26): a second, separate archive index exists

`docs/design/archive/00_ARCHIVE_INDEX.md` tracks supersession *within* the
design-canon subtree (e.g. `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`
being superseded for day-to-day reference by
`docs/design/01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md`). This root index was
last updated 2026-08-16 and does not cover that. **Check both** before treating
any document as either current or dead — this file for pre-2026-08-16 project-wide
cleanup, the design archive index for anything inside `docs/design/` or
`docs/01_CORE_AUTHORITY/*BLUEPRINT*`.
