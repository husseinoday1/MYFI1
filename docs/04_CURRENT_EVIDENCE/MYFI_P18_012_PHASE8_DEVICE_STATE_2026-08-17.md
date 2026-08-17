# MYFI P18-012 — Phase 8 Real-Device Operational State Evidence

**Date:** 2026-08-17
**Baseline HEAD:** `486731ea3b6e980a4eaa5540f953cc831e228e3e`
**Evidence class:** real-device runtime, operator-captured log
**Device platform:** Android
**R04.1:** remains CLOSED

## Result

**Phase 8 operational device state: PASS**

The active MYFI financial ledger on the tested real Android device was observed in SQLite V7 operational mode.

| Check | Result |
|---|---|
| Audit mode | `P18-012_READ_ONLY_DEVICE_STATE` |
| Read-only audit | PASS |
| Financial rows written by audit | 0 |
| Active namespace type | user |
| Linked account present | YES |
| DB existed before audit open | YES |
| Missing required V7 tables | NONE |
| `source_mode` | `sqlite` |
| Workspace schema version | V7 |
| `PRAGMA user_version` | 7 |
| V7 meta schema version | 7 |
| Baseline migration | `0007_financial_ledger_v7_baseline` = `completed` |
| Shadow verification marker | PRESENT |
| Cutover marker | PRESENT |
| Last reconciliation marker | PRESENT |
| `PRAGMA quick_check` | `ok` |
| Journal mode | `wal` |
| Active V7 transactions | 21 |
| Active V7 postings | 25 |
| Active V7 accounts | 2 |
| Active V7 entities | 11 |
| Pending V7 outbox mutations | 5 |
| `phase8Operational` | **true** |
| Temporary harness restored | **PASS** |

## Safety

The temporary audit harness was restored after the device run and the operator captured:

`P18-012 HARNESS RESTORED: PASS`

The audit itself reported `queryOnly=true` and `financialWrites=0`.

No transaction content, wallet name, amount, note, user identifier, or account identifier is recorded in this evidence document.

## Decision

The earlier Phase 8 uncertainty is resolved for the tested active device state:

- V7 SQLite is operationally active.
- `source_mode=sqlite`.
- schema V7 is active.
- migration journal records the V7 baseline as completed.
- cutover and reconciliation markers exist.
- SQLite health check is `ok`.
- no missing required V7 tables were reported.

This evidence does **not** claim that Phase 9 is closed.

**Phase 10 remains blocked until the Phase 9 Account Lifecycle Gate is accepted and Phases 6–9 are formally reconciled in canonical status documentation.**
