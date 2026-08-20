# MYFI — Phase 9 Consolidated Status

Prepared by: MYFI Planning & Audit session
Date: 2026-08-19

<!-- PHASE9_CLOSED_2026-08-20 -->
## ★ Phase 9: CLOSED — 2026-08-20

P20-G01 (the one remaining gate) passed real-device acceptance. Post-PASS
`/code-review` required 2 mandatory fixes (SQLite-verified empty-account
check; stop writing the ambiguous legacy activation-evidence key).
Implementation pushed both in commit `611b091`; Testing & Release
re-confirmed PASS on that exact commit on 2026-08-20 — `fromEpoch 2→3`,
`financialDataChangedByGate: false`. Evidence:
`docs/04_CURRENT_EVIDENCE/MYFI_P20_G01_MANDATORY_FIXES_CONFIRMED_2026-08-20.md`.

**Phase 10 (Atomic Backup / Restore Engine) is now open.** Non-destructive
prep work already started in parallel — see
`MYFI_PHASE10_BACKUP_RESTORE_RESEARCH_2026-08-20.md` §32 for what's safe to
build now vs. what stays gated on other conditions.

A separate, unrelated issue was found during Phase 9 testing (Supabase
`profiles_id_fkey` schema drift, real Postgres connectivity/load pressure)
— tracked independently in
`MYFI_SUPABASE_DB_ASSESSMENT_2026-08-20.md`, does not reopen Phase 9.

## Verified against

```text
Branch: r05-p20-phase9-restore-epoch-gate
HEAD:   fd98f80a... "P20-G01 add disposable restore epoch device gate"
Pushed: 2026-08-19 10:41 +0300
Verified via: git fetch --all && git branch -r --sort=-committerdate
```

Per the Evidence Freshness Rule (`docs/00_MYFI_CANONICAL_AUTHORITY.md`),
re-run that verification before trusting this file — a newer branch may
already exist.

## Purpose

This file reconciles the original Phase 9 scenario matrix
(`MYFI_P18_013_PHASE9_MINIMUM_ACCEPTANCE_MATRIX_2026-08-17.md`) against all
evidence produced since (P18-016 through P20-G01). Read this file first for
"what is actually left in Phase 9." Consult the individual dated evidence
files only for detail/provenance.

## Overall status

**Phase 9: OPEN. One gate remains: P20-G01 (see below). Phase 10 stays
BLOCKED until it passes.**

## Scenario-by-scenario reconciliation

| Scenario | Frozen requirement | Status as of 2026-08-19 | Source |
|---|---|---|---|
| A — Local-only | install/skip account/create data/reopen/data remains | PENDING — disposable/fresh workspace real-device run not yet recorded | P18-013 |
| B — Guest → Signup | currencies/IDs/balances/history unchanged after attach | Guest-wallet-collapse root cause fixed (P18-014/P18-021); PENDING a post-fix real-device run | P18-013, P18-021 |
| C — Logout | cloud session ends, local ledger stays | Automated PASS earlier; **now also indirectly device-proven** — a real account went through login/sync/restart cleanly under P20 evidence | P18-013 → P20 evidence |
| D — Re-login | same ledger reopens, no duplication | Automated PASS earlier; **device-proven** — P20 evidence shows a real account's V2 sync reached active/quiescent state with a real transaction surviving restart | P18-013 → P20 evidence |
| E — Second device | bootstrap + convergence, no contamination | PENDING — still needs a genuinely isolated second device/session; not attempted in P19/P20 evidence reviewed so far | P18-013 |
| F — Account switch | no cross-account contamination | Automated PASS earlier; the original Phase-9 incident (§ incident file) was *found through* this exact scenario and is now root-fixed (P18-014/016); PENDING a post-fix real-device re-run | P18-013, P18-021 |
| G — Delete Account | disposable account only, cloud identity removed, local continues | PENDING — not yet attempted | P18-013 |
| H — Delete Local Data | disposable dataset only, independent from Logout/Delete Account | PENDING — not yet attempted | P18-013 |

## The one gate actually blocking closure: P20-G01

Everything else in the table above is either done, indirectly covered by the
ordinary-path device evidence already collected, or bounded/low-risk
(A/B/F just need a confirmatory re-run after fixes already proven correct by
contract tests). **P20-G01 is the one gate with real, unstarted work**: proof
that the destructive restore-epoch/recovery handshake behaves safely, which
must be run on a real device against a disposable account.

10 required steps (see `MYFI_P20_G01_PHASE9_RESTORE_EPOCH_GATE_2026-08-19.md`
for full detail):

**Correction (2026-08-19, later same day):** this file originally said "0 of
10 done." That was wrong at the time of writing — CI run `32229015804` had
already built and signed the acceptance APK hours earlier, and the MYFI
Implementation session independently verified it (SHA-256 match, valid v2
signature matching the installed app, gate strings present in the bundle).
**This is exactly the kind of staleness the Evidence Freshness Rule in
`00_MYFI_CANONICAL_AUTHORITY.md` exists to catch** — this doc is proof the
rule is needed, and also proof it works once someone re-verifies.

1. ✅ **DONE** — Build the signed P20-G01 acceptance APK. Verified: SHA-256
   `b2bc29d3...2aa80a89`, arm64-v8a, 34.75 MB, apksigner v2 valid, signer
   fingerprint matches the installed MYFI app. Gate strings
   (`P20_G01_PHASE9_RESTORE_EPOCH_GATE_PASS`,
   `advance_financial_restore_epoch_v2`, `controlled_recovery`) confirmed
   present in the bundle. **Not independently confirmed:** whether the
   `EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE=1` build flag actually took
   effect — that can only be proven on-device at step 3 (the Settings row
   must read "Restore Epoch test — disposable data only", not the normal
   "Local SQLite evidence" row). GitHub Actions artifact expires in 7 days;
   local copy retained at
   `C:\Users\husse\Downloads\MYFI_P20_G01_ACCEPTANCE_APK\android\app\build\outputs\apk\release\app-release.apk`.
   Evidence: `docs/04_CURRENT_EVIDENCE/MYFI_P20_G01_ACCEPTANCE_APK_BUILD_2026-08-19.md`.
2. Install over the current app without clearing data.
3. Confirm the gate refuses to run on the real (non-empty) account.
4. Sign out; create/use a genuinely disposable, financially-empty test account.
5. Let Protocol V2 reach active/quiescent state on that account.
6. Run the restore-epoch gate once.
7. Require the exact pass marker `[P20_G01_PHASE9_RESTORE_EPOCH_GATE_PASS]`.
8. Audit the Supabase restore event/epoch server-side.
9. Sign out of the disposable account; re-login to the real account.
10. Verify the real account's data is untouched and V2 sync is still healthy.

## Recommended next session

Do not restart Phase 9 from scratch. Pick up directly at the P20-G01 checklist
above (item 1: build the acceptance APK). Treat Scenarios A/B/F as needing
only a confirmatory device pass once P20-G01 closes and a device is in hand
for acceptance testing — do not silently mark them CLOSED without that pass,
but do not re-derive their root-cause analysis either; it's already done.
