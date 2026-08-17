# MYFI — P19 Sync V2 Activation Addendum

## Status
ACTIVE CANONICAL OVERLAY — 2026-08-17

## Authority
This addendum overlays `MYFI_MASTER_PLAN_FROZEN.md` only for the P19 sync/restore
hardening and activation gate. The Frozen Master Plan itself remains unchanged.

## Why this addendum exists
P19 introduced a stronger ledger-replication identity and restore model after the
general integrity audit identified unsafe V1 concurrency, namespace ambiguity,
restore replay risk, and an offline signed-in ledger-mount failure.

The activation sequence was further strengthened after implementation feedback.
A successful upload/finalize alone is not sufficient evidence to activate V2.

## Permanent P19 V2 activation sequence

```text
SQLite authoritative ledger
→ staged bootstrap snapshot
→ upload/finalize bootstrap in Supabase
→ cloud read-back of finalized bootstrap
→ per-row SHA-256 verification
→ ordered manifest SHA-256 verification
→ V2 shadow drain
→ observed quiescent V2 validation pass
→ atomic local activation evidence + activated_at
→ V2 operational sync
```

Activation MUST NOT occur unless all conditions below are true:

1. `ledger_id` matches the immutable local ledger identity.
2. `restore_epoch` matches current local/cloud epoch.
3. bootstrap is finalized for the exact `bootstrap_id`.
4. each cloud read-back row has valid JSON and correct SHA-256.
5. row ordinals are contiguous and row keys are unique.
6. read-back row count equals the expected bootstrap row count.
7. ordered row hashes reproduce the expected manifest SHA-256.
8. V2 shadow validation reaches a quiescent pass:
   - pendingAfterSync = 0
   - uploaded = 0
   - downloaded = 0
   - hasMore = false
9. no destructive restore intent is active.
10. SQLite re-checks unsuperseded pending V2 outbox rows inside the activation transaction.

## Fallback rule

Before durable `activated_at`:
- a failed bootstrap/read-back/shadow validation MAY leave V1 operational;
- the next attempt must resume/retry without deleting financial data.

After durable `activated_at`:
- automatic fallback to V1 is FORBIDDEN;
- a V2 failure is fail-closed and must be handled as a protocol recovery event.

## Activation evidence
The following evidence is persisted atomically with activation:
- namespace
- ledger_id
- restore_epoch
- bootstrap_id
- manifest_hash
- readback_verified_at
- shadow_validated_at
- validation_cursor
- activated_at

There must never be a durable state in which V2 is marked active without the
verification evidence that justified activation.

## Restore/reset rule during soak
The signed-in destructive Reset/Restore interlock remains active until the V2
activation/restore protocol has passed the required real-device acceptance.
Do not relax this interlock merely because automated P19 tests pass.

## Evidence precedence
The canonical evidence order remains:
1. real-device evidence
2. runtime/integration evidence
3. automated contract/unit evidence
4. static source presence

Therefore P19 cannot be declared production-ready from static or build tests alone.

## P19 gate closure
P19 code completion is not equivalent to Phase 9 closure.
Required before final closure:
- successful P19-011 repository gate;
- controlled V2 activation evidence;
- real-device offline/signed-in/reopen/sync acceptance;
- restore-epoch and destructive-operation acceptance on disposable data;
- no unresolved financial integrity conflicts.

## Financial/schema impact
This addendum itself changes no financial data and no schema.
P19 local schema remains SQLite V8 unless a later reviewed migration explicitly changes it.
