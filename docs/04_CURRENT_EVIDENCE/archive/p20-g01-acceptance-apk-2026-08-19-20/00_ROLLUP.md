# Rollup — P20/G01 acceptance APK gate (2026-08-19/20), CLOSED

Archived 2026-08-26 per `docs/04_CURRENT_EVIDENCE/00_EVIDENCE_INDEX_AND_ROLLUP_POLICY.md`
§"Policy going forward" (closed cluster, no re-open through one full subsequent
phase).

This cluster covers the P20/G01 acceptance-APK device gate: the APK build and
device-acceptance evidence, the D1-D3 diagnostics (cutover-blocker diagnosis,
restore-epoch V2 deactivation root cause, avatarUri parity/epoch resume, and the
follow-up bootstrap-trigger diagnosis), the mandatory-fix confirmations and
items 6-7/8-10 pass evidence, the shadow-parity diagnostic correction and wallet
shadow-parity defect record, the Supabase key-invalid incident and related
Supabase DB/disk-IO assessments and publishable-key migration, the
`finance_data`/`profiles` FK-cascade application records, the Scenario G
delete-account defect record, the P20 V2 client-closure plan, and the Phase 9
item-10 V2 sync recheck — all dated 2026-08-19 or 2026-08-20 (the sync recheck
2026-08-21), closing out the P20/G01 gate.

The cluster's consolidated status file, `MYFI_PHASE9_STATUS_CONSOLIDATED_2026-08-19.md`,
is cited directly by path from `docs/00_MYFI_CANONICAL_AUTHORITY.md` and was
**not** moved — it remains in `docs/04_CURRENT_EVIDENCE/` as the live citation
target for this cluster's status.

## Archived files

- [MYFI_P20_G01_ACCEPTANCE_APK_BUILD_2026-08-19.md](./MYFI_P20_G01_ACCEPTANCE_APK_BUILD_2026-08-19.md)
- [MYFI_P20_G01_CODE_SECURITY_REVIEW_2026-08-20.md](./MYFI_P20_G01_CODE_SECURITY_REVIEW_2026-08-20.md)
- [MYFI_P20_G01_COMPLETE_REQUEST_GUIDANCE_2026-08-20.md](./MYFI_P20_G01_COMPLETE_REQUEST_GUIDANCE_2026-08-20.md)
- [MYFI_P20_G01_CONTINUE_VS_RESTART_QUESTION_2026-08-20.md](./MYFI_P20_G01_CONTINUE_VS_RESTART_QUESTION_2026-08-20.md)
- [MYFI_P20_G01_D1_CUTOVER_BLOCKER_DIAGNOSIS_2026-08-19.md](./MYFI_P20_G01_D1_CUTOVER_BLOCKER_DIAGNOSIS_2026-08-19.md)
- [MYFI_P20_G01_D2_RESTORE_EPOCH_V2_DEACTIVATION_ROOTCAUSE_2026-08-19.md](./MYFI_P20_G01_D2_RESTORE_EPOCH_V2_DEACTIVATION_ROOTCAUSE_2026-08-19.md)
- [MYFI_P20_G01_D3_AVATARURI_PARITY_AND_EPOCH_RESUME_2026-08-20.md](./MYFI_P20_G01_D3_AVATARURI_PARITY_AND_EPOCH_RESUME_2026-08-20.md)
- [MYFI_P20_G01_D3_STILL_HITS_BOOTSTRAP_TRIGGER_2026-08-20.md](./MYFI_P20_G01_D3_STILL_HITS_BOOTSTRAP_TRIGGER_2026-08-20.md)
- [MYFI_P20_G01_DEVICE_ACCEPTANCE_2026-08-19.md](./MYFI_P20_G01_DEVICE_ACCEPTANCE_2026-08-19.md)
- [MYFI_P20_G01_ITEMS_6_7_PASS_2026-08-20.md](./MYFI_P20_G01_ITEMS_6_7_PASS_2026-08-20.md)
- [MYFI_P20_G01_ITEMS_8_10_FINAL_2026-08-20.md](./MYFI_P20_G01_ITEMS_8_10_FINAL_2026-08-20.md)
- [MYFI_P20_G01_LOCAL_BUILD_ENV_ISOLATION_2026-08-20.md](./MYFI_P20_G01_LOCAL_BUILD_ENV_ISOLATION_2026-08-20.md)
- [MYFI_P20_G01_MANDATORY_FIXES_CONFIRMED_2026-08-20.md](./MYFI_P20_G01_MANDATORY_FIXES_CONFIRMED_2026-08-20.md)
- [MYFI_P20_G01_PHASE9_RESTORE_EPOCH_GATE_2026-08-19.md](./MYFI_P20_G01_PHASE9_RESTORE_EPOCH_GATE_2026-08-19.md)
- [MYFI_P20_G01_SHADOW_PARITY_DIAGNOSTIC_CORRECTION_2026-08-20.md](./MYFI_P20_G01_SHADOW_PARITY_DIAGNOSTIC_CORRECTION_2026-08-20.md)
- [MYFI_P20_G01_SUPABASE_KEY_INVALID_2026-08-20.md](./MYFI_P20_G01_SUPABASE_KEY_INVALID_2026-08-20.md)
- [MYFI_P20_G01_TWO_MANDATORY_FIXES_FOR_IMPLEMENTATION_2026-08-20.md](./MYFI_P20_G01_TWO_MANDATORY_FIXES_FOR_IMPLEMENTATION_2026-08-20.md)
- [MYFI_P20_G01_WALLET_SHADOW_PARITY_DEFECT_2026-08-20.md](./MYFI_P20_G01_WALLET_SHADOW_PARITY_DEFECT_2026-08-20.md)
- [MYFI_PHASE9_ITEM10_V2_SYNC_RECHECK_2026-08-21.md](./MYFI_PHASE9_ITEM10_V2_SYNC_RECHECK_2026-08-21.md)
- [MYFI_P20_V2_CLIENT_CLOSURE_PLAN_2026-08-19.md](./MYFI_P20_V2_CLIENT_CLOSURE_PLAN_2026-08-19.md)
- [MYFI_SCENARIO_G_DELETE_ACCOUNT_BROKEN_2026-08-20.md](./MYFI_SCENARIO_G_DELETE_ACCOUNT_BROKEN_2026-08-20.md)
- [MYFI_SUPABASE_DB_ASSESSMENT_2026-08-20.md](./MYFI_SUPABASE_DB_ASSESSMENT_2026-08-20.md)
- [MYFI_SUPABASE_DISK_IO_ASSESSMENT_2026-08-20.md](./MYFI_SUPABASE_DISK_IO_ASSESSMENT_2026-08-20.md)
- [MYFI_SUPABASE_PUBLISHABLE_KEY_MIGRATION_2026-08-20.md](./MYFI_SUPABASE_PUBLISHABLE_KEY_MIGRATION_2026-08-20.md)
- [MYFI_FINANCE_DATA_FK_CASCADE_APPLIED_2026-08-20.md](./MYFI_FINANCE_DATA_FK_CASCADE_APPLIED_2026-08-20.md)
- [MYFI_PROFILES_FK_CASCADE_APPLIED_2026-08-20.md](./MYFI_PROFILES_FK_CASCADE_APPLIED_2026-08-20.md)

Newer or still-active documents for related topics remain in
`docs/04_CURRENT_EVIDENCE/` — consult
`docs/04_CURRENT_EVIDENCE/00_EVIDENCE_INDEX_AND_ROLLUP_POLICY.md` for the
current cluster index rather than assuming this archive is exhaustive for the
topic going forward.

## Note on CI scope-gate references (checked, not blocking)

Two CI workflows hardcode the pre-archive path of some of these files inside a
`git diff --name-only`-based scope allowlist: `.github/workflows/p20-g01-phase9-restore-epoch-gate.yml`
(several `MYFI_P20_G01_*` files plus `MYFI_SUPABASE_PUBLISHABLE_KEY_MIGRATION_2026-08-20.md`)
and `.github/workflows/p20-final-v2-client-closure.yml` via
`.github/p20-final-v2-client-closure-allowed-source.txt` (`MYFI_P20_V2_CLIENT_CLOSURE_PLAN_2026-08-19.md`).
Both workflows trigger only on push to their own closed-phase branches
(`r05-p20-phase9-restore-epoch-gate`, `r05-p20-final-v2-client-closure`) or
manual `workflow_dispatch`, not on this archive branch, so this move does not
break any currently-running gate. It would only matter if new commits were
ever pushed to one of those specific branches after rebasing onto history that
includes this archive move — already-known brittle single-commit/hardcoded-list
pattern per `.github/CLAUDE.md`, not newly introduced here.
