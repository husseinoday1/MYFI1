# P18-021 — Phase 9 Recovery Incident Closure

Date: 2026-08-17
Status: CLOSED

## Incident

Phase-9 account lifecycle testing exposed two defects:
1. Guest/account wallet collapse caused by technical-ID based wallet reuse.
2. Stable-ID financial records could be collapsed by semantic dedupe.
3. After V7 cutover, the legacy user_data snapshot was still permitted to act as a financial pull source; snapshot omission could be converted by reconcileFinancialWorkspaceV7 into V7 void/delete mutations.

## Corrections

- P18-014: stable-ID-first dedupe and Guest referenced-wallet isolation.
- P18-016: V7 financial pull authority is mutation protocol only; legacy user_data snapshot is compatibility output and may not delete V7 data by omission.
- P18-017: controlled recovery of the audited accidental deletion cluster.
- P18-018: real-device read-only post-recovery verification.
- P18-019: cloud read-only revision preflight.
- P18-020: controlled mutation-only upload of exactly 32 recovery upserts.

## Final device/cloud evidence

P18-020 real-device PASS:
- 32 recovery mutations uploaded.
- 32 recovery rows verified in cloud.
- pending local outbox = 0.
- pending local delete/void = 0.
- 46 transactions total / 24 active / 22 intentionally or previously deleted.
- 49 postings unchanged.
- 20 entities / 0 deleted entities.
- SQLite quick_check = ok.
- SQLite user_version = 7.
- stable IDs preserved.
- legacy snapshot sync not invoked.

## Data impact

Financial data changed during P18-017/P18-020 only as controlled recovery of the proven accidental cluster.
No amount, currency, FX, posting, account, link, or historical financial value was recalculated.
SQLite schema unchanged.
No migration executed.
No SecureStore recovery write.
Other namespaces were not modified by recovery.

## Decision

The accidental deletion incident is CLOSED.
Phase 9 may resume from the next unresolved acceptance scenario.
Phase 10 remains blocked until Phase 9 minimum acceptance is fully completed.
