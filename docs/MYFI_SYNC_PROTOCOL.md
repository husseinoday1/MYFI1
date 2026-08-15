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
