# MYFI P20-G01 — Phase 9 Restore-Epoch Device Acceptance Gate

Date: 2026-08-19

## Authority and purpose

This patch does **not** start Phase 10. The active P19 canonical overlay requires
real-device restore-epoch/destructive-operation acceptance on disposable data before
Phase 9 can close.

Accepted source baseline:
- branch: `r05-p20-final-v2-client-closure`
- HEAD: `d847957c05dc9fe3cdd0bc3eb9c93d525f65deb0`
- P20 GitHub run: `32219760502` = SUCCESS
- Expo: `~54.0.36`
- React Native: `0.81.5`
- SQLite schema: 8

## Current accepted P20 device evidence

The existing account/ledger passed:
- Protocol V2 active
- V2 sync OK
- first real transaction upload/download
- restart preservation
- account/profile first-open visibility
- no observed V1 fallback, revision conflict, or database lock

This accepted ledger is **not** used for P20-G01 destructive protocol testing.

## P20-G01 design

The acceptance APK is inert unless:
`EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE=1`

The gate is manually invoked from the existing local SQLite evidence row in Account
settings. In the acceptance APK that row is clearly relabeled as a disposable-only
Restore Epoch gate.

Before any epoch change the gate refuses to run when it observes:
- any transaction
- any debt
- any goal
- any commitment
- more than one wallet
- any non-zero wallet opening balance
- any archived transaction
- any budget state
- pending V2 mutations
- non-active/non-matching Protocol V2 identity
- an existing restore intent
- non-bootstrapped/mismatched cloud V2 ledger

It then proves that the current production `resetAll` and `importBackup` paths still
fail closed and leave the financial fingerprint unchanged.

Only after those checks does it execute the already-deployed P19-008 handshake:
1. durable local restore intent
2. server `advance_financial_restore_epoch_v2` CAS using `controlled_recovery`
3. local restore-epoch CAS commit
4. new-epoch shadow pull
5. verify zero old-epoch replay
6. verify server restore-event evidence
7. verify visible financial fingerprint remains unchanged

The disposable account is considered consumed after a PASS and must not be used as a
real financial account.

## Impact

Financial values changed by code: NO
SQLite schema changed: NO
Migration required: NO
SecureStore changed: NO
Supabase schema changed: NO
Existing accepted user ledger deleted/reset: NO
Production restore/reset interlock relaxed: NO

## Acceptance remaining

1. Build P20-G01 signed acceptance APK.
2. Install over current app without Clear Data.
3. Confirm gate blocks on the existing non-empty account.
4. Sign out and create/use a genuinely disposable financially empty account.
5. Let V2 reach active/quiescent state.
6. Run the gate once.
7. Require `[P20_G01_PHASE9_RESTORE_EPOCH_GATE_PASS]`.
8. Audit Supabase restore event/epoch.
9. Sign out disposable account and re-login original account.
10. Verify original transaction/account remains intact and V2 sync remains healthy.

Only after all ten items pass may Phase 9 be recorded CLOSED and Phase 10 opened.
