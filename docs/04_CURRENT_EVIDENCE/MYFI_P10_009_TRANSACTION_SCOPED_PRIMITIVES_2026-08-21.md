# MYFI — P10-009: transaction-scoped promotion primitives

**Recorded:** 2026-08-21T12:40:26+03:00  
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**Starting SHA:** `c78478ba2a05d1678724aecccaa5f90799f35fdf`  
**Runtime / schema:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite V8/V7.  
**Data/schema/cloud impact:** no schema change, no device database operation, no cloud call, and no user-visible restore path.

## Delivered

The existing separately-transactional code now delegates to common raw primitives:

- copy/clear V7 financial rows inside a supplied transaction executor;
- replace/clear Cold Archive namespaces inside that same executor; and
- advance V8 restore epoch with the existing CAS and activation-pending provenance
  inside that executor.

`runFinancialRestorePromotionTransactionV8()` is the single reviewed wrapper that
warms schemas, owns the shared writer queue, opens one exclusive transaction, and
passes these capabilities to its callback. P10-010 will use this callback to combine
the final promotion. P10-009 itself does not call it for a live restore.

The old V7 stage promotion, Cold Archive replacement, and public epoch-commit APIs
remain present and delegate to the extracted operations, preserving their behavior.
No pending outbox/inbox rows are deleted by the new primitives.

## Verification

- `run-p10-009-transaction-primitives.cjs` proves raw primitives cannot enqueue or
  start their own transaction and that the one runner exposes ledger/archive/epoch
  actions on one executor.
- `run-p20-g01-d2-restore-epoch-activation.cjs` passes, including two consecutive
  epoch advances and preservation of previously-activated provenance.
- The real scope-script test now locates Git-for-Windows Bash when it is absent from
  PATH. This fixes local test execution only; workflows and Linux script behavior are
  unchanged.

`npm.cmd run test:gate`: **99 passed, 0 failed, 11 environment-dependent skips.**  
`git diff --check`: passed.

## Remaining boundary

P10-010 must still prove a fault-injected one-transaction live promotion of hot
ledger, Cold Archive, restore metadata and local epoch CAS. Nothing here promotes a
stage, changes UI cache, starts a new sync epoch in production, or contacts Supabase.
