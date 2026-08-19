# MYFI — Phase 9 Consolidated Status

Prepared by: MYFI Planning & Audit session
Date: 2026-08-19

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

10 required steps, 0 done as of this file (see
`MYFI_P20_G01_PHASE9_RESTORE_EPOCH_GATE_2026-08-19.md` for full detail):

1. Build the signed P20-G01 acceptance APK.
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
