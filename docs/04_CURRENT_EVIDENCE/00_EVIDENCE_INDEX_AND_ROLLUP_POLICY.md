# `04_CURRENT_EVIDENCE/` — cluster index and rollup policy (added 2026-08-26)

74 files with no consolidation cadence — only the standing rule "newest
real-device evidence beats older automated/static evidence" (A4). That rule
tells you how to pick a winner on conflict; it does not stop the folder from
growing forever. This file adds the missing piece: a navigable index by
cluster, and a policy for what happens to a cluster once its phase closes.

**No files were physically archived in this pass.** Several older files here
are directly cited by path from `docs/00_MYFI_CANONICAL_AUTHORITY.md` (A2/A4)
and `docs/START_HERE.md` — moving them now without updating every citing
document risked breaking pointers other sessions rely on mid-task. The index
below is the safe, real fix for navigability today; the physical archive move
is queued as a concrete Implementation task (see Policy §2), not left as a
vague someday.

## Cluster index (newest file per topic is the one to trust, per A4)

- **Phase 8/9 recovery (2026-08-17), CLOSED, ARCHIVED 2026-08-26:** moved to
  `archive/phase-8-9-recovery-2026-08-17/` — see that folder's `00_ROLLUP.md`.
  `MYFI_R04_1_DEVICE_ACCEPTANCE_CLOSURE_2026-08-17.md` stays in this directory
  (cited by path from `00_MYFI_CANONICAL_AUTHORITY.md`).
- **P19 Sync V2 (2026-08-17/18), CLOSED, PARTIALLY ARCHIVED 2026-08-26:**
  `MYFI_P19_012_EMPTY_SHELL_CLOUD_RECOVERY` moved to
  `archive/p19-sync-v2-2026-08-17-18/` — see that folder's `00_ROLLUP.md`.
  `MYFI_P19_001_011_SYNC_V2_EXECUTION_EVIDENCE` and
  `MYFI_P19_013_ATOMIC_V2_REMOTE_APPLY` stay in this directory (cited by path
  from `00_MYFI_CANONICAL_AUTHORITY.md`).
- **P20/G01 acceptance APK (2026-08-19/20), CLOSED, PARTIALLY ARCHIVED
  2026-08-26:** `MYFI_P20_G01_*` (device acceptance, D1-D3 diagnostics,
  mandatory fixes, shadow parity, Supabase key issue), the Phase 9 item-10
  sync recheck, the P20 V2 client-closure plan, the Scenario G delete-account
  record, the Supabase DB/disk-IO/publishable-key assessments, and the
  `finance_data`/`profiles` FK-cascade records all moved to
  `archive/p20-g01-acceptance-apk-2026-08-19-20/` — see that folder's
  `00_ROLLUP.md` for the full file list. `MYFI_PHASE9_STATUS_CONSOLIDATED_2026-08-19.md`
  stays in this directory (cited by path from `00_MYFI_CANONICAL_AUTHORITY.md`).
- **Phase 10 restore engine (2026-08-20 to 2026-08-25), CLOSED for the
  happy-path restore — see the standing correction below:**
  `MYFI_PHASE10_BACKUP_RESTORE_RESEARCH_2026-08-20.md`,
  `MYFI_PHASE10_EXECUTION_AUDIT_AND_PLAN_2026-08-21.md`,
  `MYFI_P10_STRATEGY_B_DECISION_2026-08-21.md`,
  `MYFI_P10_004R` through `MYFI_P10_013` (10 files, the build-out sequence),
  `MYFI_P10_BENCHMARK_OOM_ON_DEVICE`, `MYFI_P10_RESTORE_BENCHMARK_DEVICE_RESULTS`,
  `MYFI_P10_PRE_WIRING_CHECKLIST` (**stale** — see below),
  `MYFI_PHASE10_LIVE_PRODUCTION_RESTORE_CLOSURE_2026-08-24.md` (newest, wins),
  `MYFI_IMPLEMENTATION_HANDOFF_2026-08-21.md`,
  `MYFI_IMPLEMENTATION_2_HANDOFF_2026-08-25.md` (**the correction** — supersedes
  the isolation claim implied by the pre-wiring checklist; see
  [[myfi_p10_restore_wiring_correction_2026-08-25]] in Planning & Audit memory),
  `MYFI_P10_WORKING_STATE_2026-08-22.md`.
- **User-reported bugs / UX (2026-08-21):** `MYFI_USER_REPORTED_BUGS`,
  `MYFI_UX_POLISH_BACKLOG`, `MYFI_UX_POLISH_SETTINGS_SCREEN_OVERLAP`,
  `MYFI_SYNC_UX_QUIET_OPERATION`, `MYFI_BUG1_COLD_START_MEASURED`.
- **Product/Security/Design (2026-08-21 to 2026-08-26), ACTIVE:**
  `MYFI_CLOUD_DATA_MINIMIZATION_POLICY_2026-08-21.md`,
  `MYFI_POST_PHASE10_PRODUCT_SECURITY_RECONCILIATION_2026-08-24.md`,
  `MYFI_PRODUCT_DESIGN_BLUEPRINT_RECONCILIATION_2026-08-25.md`,
  `MYFI_DESIGN_SYSTEM_FOUNDATION_TOKENS_2026-08-26.md`,
  `MYFI_AGENT_CONVERSATIONS_READY.md`.
- **Untimestamped / in-flight:** `P10_014A_001_SCOPED_PLAN.md` (device-gate
  task, on hold per `myfi_session_structure` memory).

**Known-stale item flagged here explicitly:** `MYFI_P10_PRE_WIRING_CHECKLIST_2026-08-21.md`
lists `dataSlice.js`/`SettingsScreen.js`/`SettingsLegacyScreen.js` as untouched
entry points. Commit `5209d17` wired all three into production. Do not treat
that checklist's §C as current without cross-checking `MYFI_IMPLEMENTATION_2_HANDOFF_2026-08-25.md` first.

## Policy going forward

1. **Trigger:** when a phase or cluster is formally CLOSED (per
   `00_MYFI_CANONICAL_AUTHORITY.md` A4 closure language) and stays closed
   through one full subsequent phase with no re-open, its cluster becomes
   eligible for archival.
2. **Action (execution-scale, hand to Implementation, not Planning & Audit):**
   move the closed cluster's files into `04_CURRENT_EVIDENCE/archive/<cluster-name>/`,
   write one dated rollup file summarizing outcome + links to the moved
   originals, and update every citing path in `00_MYFI_CANONICAL_AUTHORITY.md`
   and `START_HERE.md` in the same commit — the move and the reference fix
   are one atomic change, never split across commits.
3. **First candidate, executed 2026-08-26:** the Phase 8/9/P19/P20-G01
   clusters above (all CLOSED, none re-opened since) were archived per this
   policy — see the "Cluster index" entries above for the resulting archive
   paths and rollup files. Files still cited live by the canonical authority
   doc's A2/A4 sections were checked and left in place before any move.
4. **Never archive** a cluster still being actively cross-checked (Phase 10's
   cluster stays put until the A2/restore-safety story is fully settled and
   Testing & Release has run its acceptance pass).
