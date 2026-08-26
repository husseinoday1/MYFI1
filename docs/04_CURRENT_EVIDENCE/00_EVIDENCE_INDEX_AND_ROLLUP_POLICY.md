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

- **Phase 8/9 recovery (2026-08-17), CLOSED:** `MYFI_P18_011` through
  `MYFI_P18_021`, `MYFI_R04_1_DEVICE_ACCEPTANCE_CLOSURE_2026-08-17.md`.
- **P19 Sync V2 (2026-08-17/18), CLOSED:** `MYFI_P19_001_011_...`,
  `MYFI_P19_012_EMPTY_SHELL_CLOUD_RECOVERY`, `MYFI_P19_013_ATOMIC_V2_REMOTE_APPLY`.
- **P20/G01 acceptance APK (2026-08-19/20), CLOSED:** `MYFI_P20_G01_*` (13
  files — device acceptance, D1-D3 diagnostics, mandatory fixes, shadow
  parity, Supabase key issue), `MYFI_PHASE9_STATUS_CONSOLIDATED_2026-08-19.md`,
  `MYFI_PHASE9_ITEM10_V2_SYNC_RECHECK_2026-08-21.md`,
  `MYFI_P20_V2_CLIENT_CLOSURE_PLAN_2026-08-19.md`,
  `MYFI_SCENARIO_G_DELETE_ACCOUNT_BROKEN_2026-08-20.md`,
  `MYFI_SUPABASE_*_2026-08-20.md` (3 files),
  `MYFI_*_FK_CASCADE_APPLIED_2026-08-20.md` (2 files).
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
3. **First candidate once queued:** the Phase 8/9/P19/P20-G01 clusters above
   (all CLOSED, none re-opened since) — everything through 2026-08-20 except
   files still cited live by the canonical authority doc's A2/A4 sections
   (check citations before moving each one).
4. **Never archive** a cluster still being actively cross-checked (Phase 10's
   cluster stays put until the A2/restore-safety story is fully settled and
   Testing & Release has run its acceptance pass).
