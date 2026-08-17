# MYFI — Sync Protocol Contract

## الدور

Cloud هو replica/transport، وLocal SQLite commit هو البداية المالية.

## Mutation envelope المستهدف

`protocol_version, payload_schema_version, minimum_supported_version, mutation_id, ledger_id, entity_id, entity_type, operation, revision, base_revision, device_id, restore_epoch, created_at`.

## Outbox / Inbox

- outbox lifecycle: pending → in_flight → acknowledged أو failed_retryable/failed_permanent.
- retry يكون backoff+jitter، وليس fixed retry بلا نهاية.
- inbox يحفظ mutation id/server sequence/application status؛ repeated delivery idempotent.
- monetary conflict لا يعمل له automatic field merge.
- sync worker يتوقف أثناء restore/schema migration/canonical cutover.
- Snapshot fallback لا يحذف قبل نجاح mutation sync + two-device + restore epoch + cross-version + account lifecycle.

R01 لا يعيد تصميم sync؛ فقط يثبت العقد ويضمن أن migration infrastructure لا تسمح بالكتابة المالية قبل اكتمال schema.

## R04 session/ledger separation

Cloud authentication changes do not select or delete local financial truth implicitly. A local ledger pointer survives Logout. Account switch is an explicit namespace transition; ordinary Logout is not a transition to an unrelated Guest ledger. Pending V7 outbox rows remain namespaced to their ledger and are not cleared by operational stage promotion unless a dedicated reviewed reset protocol explicitly requests it.


<!-- P19_011_SYNC_V2_PERMANENT_CONTRACT -->
## P19 V2 bootstrap / activation contract

V2 activation is a verified cutover, not merely a successful upload.

Required sequence:

```text
local authoritative SQLite
→ finalize cloud bootstrap
→ cloud read-back
→ per-row SHA-256 verification
→ ordered manifest SHA-256 verification
→ V2 shadow synchronization
→ observed quiescent pass
→ atomic local activation evidence + activated_at
```

The quiescent pass requires pending=0, uploaded=0, downloaded=0 and hasMore=false.

Before durable activation, a failed verification may leave V1 operational.
After durable activation, automatic V1 fallback is forbidden. A post-activation
V2 failure is fail-closed and handled as a protocol recovery event.

Activation evidence must bind namespace, ledger_id, restore_epoch, bootstrap_id,
manifest hash, read-back verification time, shadow-validation time, validation
cursor and activated_at.

Signed-in destructive reset/restore stays interlocked until real-device V2
restore/activation acceptance closes that gate.

<!-- P19_012_013_RECOVERY_ATOMIC_APPLY_CONTRACT -->
## P19-012/P19-013 recovery and atomic V2 apply contract

A provably empty post-cutover local shell must resolve verified cloud recovery before a new V2 bootstrap can represent that shell. A legacy compatibility snapshot may be used only through the P19-012 read-only recovery source, with SHA-256 verification before parse, staged SQLite replacement, invariant proof, and semantic round-trip proof. Finalized V2 bootstrap state is higher authority and must use a dedicated bootstrap import path.

P19-013 removes P19-009's temporary V7 remote-apply reuse. V2 shadow validation is non-mutating. The durable `activated_at` marker is the no-fallback boundary and is committed with the verified shadow cursor, while the production cursor remains independent. Production commands are then re-read from the production cursor and applied with full CAS preflight. A complete command plus all financial writes, V3 inbox `applied` state, and production cursor advance are one SQLite transaction. Monetary/entity conflicts do not merge and do not advance the production cursor. Exact local echoes are permitted only when the immutable local V3 outbox mutation matches the cloud mutation exactly.
