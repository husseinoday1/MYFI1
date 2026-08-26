# MYFI P20 V2 Client Closure Plan — 2026-08-19

Status: PARTIAL EVIDENCE — source/build/device acceptance pending.

## Frozen source baseline

- Repository: `husseinoday1/MYFI1`
- Base branch: `r05-p19-final-v2-causal-command-order`
- Base commit: `8a31c7e1d885817f3b42f26cc14627c369558632`
- Target branch: `r05-p20-final-v2-client-closure`
- Expo: `~54.0.36`
- React Native: `0.81.5`
- SQLite schema: `FINANCIAL_SQLITE_SCHEMA_VERSION = 8`
- Financial ledger model: V7
- Android package: `com.myfi.app`
- Android versionCode: `2`

## Previously deployed V2 server corrections

1. `financial_bootstrap_head_baseline_v2`
2. `financial_v2_causal_command_order`

No new Supabase migration is part of P20.

## Live pre-P20 evidence

The test account is financially empty. V1 mutation count is zero.

Confirmed profile/workspace evidence:
- `profiles.avatar_path` is populated with the stable storage path.
- Workspace revisions 7 through 12 carried rotating signed `cfg.avatarUri` values.
- After removing only `cfg.avatarUri`, all six revisions had the same cfg digest:
  `008e8f62349d7fb8077871e90914031d`.

Conclusion: signed avatar URLs are derived/ephemeral display data and must not participate in canonical workspace equality or outbound canonical persistence.

## P20 design contract

- `avatarPath` remains canonical and syncable.
- `avatarUri` remains local/derived display state.
- Workspace equality ignores `avatarUri`.
- Three-way merge ignores base/remote signed URI and preserves this device's local display URI.
- V7 workspace entity storage/outbox is canonicalized before revision comparison and persistence.
- Compatibility `sync_user_data_v2` strips `avatarUri` from `p_cfg`.
- V2 sync context/result markers are explicit.
- No financial rows are deleted or rewritten by this patch.
- No SQLite schema change.
- No SecureStore change.
- Existing-user data is preserved.

## Upgrade normalization note

The first P20 run may create at most one workspace normalization revision if the currently stored workspace revision still contains an old signed `avatarUri`. Acceptance stability is measured after that one-time canonical cleanup. Repeated restart/foreground/manual sync after the cleanup must not advance the workspace revision without a real user change.

## Acceptance still required

1. Source targeted contract passes.
2. Full static/runtime quality gates pass.
3. Android export passes.
4. Signed release APK builds with the existing signing certificate.
5. Establish the post-upgrade workspace revision after any one-time canonical cleanup.
6. Repeated restart/foreground/manual Sync with no user edits keeps that revision stable.
7. V1 mutation count remains zero.
8. First real financial transaction is created and verified end-to-end over V2.
9. Restart and pull preserve the transaction without duplicate/conflict.
10. Final server/device evidence is appended in a follow-up evidence commit.

Until items 1-10 are completed, P20 is not production-proven.
