# MYFI — P10-012 Cloud Recovery: adversarial review and revised design

**Recorded:** 2026-08-21T14:13:58+03:00
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`
**HEAD:** `bfa1342b4a6ae1594532aa934b85c09f74c6696a` (local P10-010/P10-011 commits; not pushed)
**Fresh remote reference:** `37868db1136088971cc8b52f6c1ccf0f6e67b3a3` after `git fetch --all`.
**Working tree at research start:** clean (this uncommitted design record is the
only current working-tree change).
**Runtime / SQLite:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial schema V8 / ledger model V7.
**Status:** revised design/research only. No application code, database, migration,
Supabase schema/data, device, APK, push or CI operation occurred.
**User decision:** revised design approved at 2026-08-21T14:33:54+03:00 for isolated
local implementation and tests. This is not authorization to deploy a Supabase
migration or access/change real cloud data.

## Adversarial review of the first proposal

The first proposal was directionally safe but not sufficient for implementation.
This review rejects seven assumptions in it:

1. `operation_id` alone identifies an attempt but does not bind the exact staged
   financial content. The server proof must also bind an opaque digest derived from
   the canonical V11 proof; otherwise a corrupted/replaced local stage could be
   promoted under a valid operation ID.
2. The proposal did not carry operation identity across P10-010's COMMIT. The
   current local intent is deleted by the epoch transaction and the promotion record
   does not contain `operation_id` or server-event evidence. Recovery after COMMIT
   would therefore lose the exact cloud-operation binding.
3. Reusing `runControlledFinancialV2Activation()` as a narrow adapter is unsafe.
   The current function continues into `allowProductionApply: true`; P10-012 must
   stop after bootstrap, verified read-back, non-mutating shadow quiescence and
   atomic activation. Normal V2 sync may resume only afterwards.
4. “Server error means abort the intent” was too broad. A timeout may hide a
   successful server COMMIT. Independent review further proved that even a later
   read of the old epoch is racy while the timed-out transaction may still commit.
   Once the RPC is dispatched there is no cancellation path; one exact bounded
   invocation of the same idempotent, ledger-locking RPC resolves behind it.
5. Close/reopen SQLite is useful but not a literal process-kill test. The automated
   matrix must add a child-process hard exit at each durable boundary; P10-014 must
   repeat the critical locations on Android.
6. The first proposal did not specify a runtime SQL/RLS test. Static migration text
   cannot prove locking, authorization, idempotency or competing-device behavior.
7. The UI/write barrier was underspecified. After local promotion the restored
   ledger may be visible read-only, but financial writes and sync remain blocked
   before verified V2 activation, including after an app restart.

## Decision requested before implementation

P10-012 must not use the existing server restore-epoch RPC unchanged. It has safe
epoch CAS and basic retry idempotency, but its proof is only
`(ledger_id, to_epoch, reason)`. Two competing `backup_restore` operations can be
indistinguishable after a dropped response.

**Revised correction:** a new versioned RPC must require an immutable UUID
`operation_id` and a 64-hex opaque `restore_proof_digest`. The client derives that
digest with domain separation from operation ID, ledger ID, from/to epochs, V11
semantic hash, validator version and complete count proof. Supabase stores only the
opaque digest—not the raw semantic hash or row counts. Its event binds owner, ledger,
epochs, reason, device, operation and proof digest. An exact retry returns the same
event; any mismatch fails closed. The existing unique `(ledger_id, to_epoch)` remains
the serialization guard.

The safer rollout is not a silent overload of the existing RPC. Add nullable legacy
columns to the existing event table and introduce a distinctly named versioned RPC.
The old V2 RPC is then narrowed to `controlled_recovery` only, preserving the P19
diagnostic while preventing it from serving product `backup_restore` or
`delete_local_data`. Product restore uses only the new proof-bound RPC. This avoids a
flag-day migration while preventing an old callable path from bypassing content
binding.

No secret/service-role key is introduced. The authenticated-user ownership check
remains mandatory. Because the RPC needs a privileged atomic ledger/event write,
`security definer` remains justified only with an empty/fixed `search_path`, fully
qualified relations, explicit `auth.uid()` ownership verification, and `EXECUTE`
revoked from `PUBLIC`/`anon` before granting only `authenticated`. The existing event
table retains RLS and explicit authenticated SELECT for bounded evidence reads.

## Fixed model

- SQLite remains the financial authority. Supabase is transport/replication only.
- Network I/O never occurs inside the final SQLite transaction.
- The local stage is promoted exactly once, atomically, only after a server result
  has been proven to be for this exact operation.
- A cloud/bootstrap failure after local SQLite COMMIT never rolls back financial
  data. It produces a durable, visible recovery state with financial writes and
  sync paused.
- There is no automatic V1 fallback after V2 activation, no cloud snapshot
  overwrite, no automatic financial conflict merge, and no silent repair.
- Signed-in cloud-linked restore is unavailable offline. Offline/ambiguous network
  state preserves the same local intent and stage; it never starts local promotion.
- Language, theme and other local presentation preferences remain local; P10-012
  transfers no additional workspace preferences.

## Proposed durable state machine

All local state lives in namespaced `ledger_v7_meta` records, with only IDs,
epochs, operation ID, stage proof hash/counts, bounded status and safe error code.
No financial payload is written to metadata or logs.

```text
preflight_verified
  -> intent_pending_server
  -> server_outcome_unknown       (network ambiguity; no cancellation/promotion)
  -> server_epoch_proven          (same operation_id + restore_proof_digest)
  -> local_promoted_pending_reload             (P10-010)
  -> local_reloaded_reconciliation_required    (P10-011)
  -> cloud_bootstrapping
  -> cloud_readback_verified
  -> shadow_quiescent
  -> v2_activated

Any interruption after intent_pending_server
  -> recovery_required (same durable operation; sync/writes paused)
```

Before local COMMIT, the V2 restore-intent record is authoritative. P10-010 must
atomically copy `operation_id`, server event ID, proof digest, semantic hash, ledger
and epochs into a versioned promotion record while deleting the intent. After
COMMIT, that promotion record is authoritative and P10-011 must validate/preserve the
same fields. This is the crash-safe handoff the first design omitted.

The coordinator is restartable at every arrow. It resolves a timed-out RPC by one
bounded exact invocation of the same ledger-locking RPC. A request timeout is `server_outcome_unknown`, not
`failed`, not permission to cancel, and not permission to create another operation.

## Exact workflow

1. **Local preflight under the restore maintenance owner.** Confirm authenticated
   session, current V2 identity/activation, no existing restore/recovery state, no
   pending V2 mutations, READY stage proof, and matching local ledger/epoch. If any
   condition fails, nothing reaches Supabase.
2. **Create one random operation ID and persist a versioned local intent.** The intent
   binds auth user, namespace, ledger ID, from/to epoch, device ID, operation ID,
   stage namespace, semantic hash, complete proof counts and derived opaque proof
   digest. The screen stays mounted; this is a destructive restore barrier, not the
   routine-sync overlay.
3. **Call the versioned server CAS.** Inputs are exact and bounded. A normal success
   or an automatic/exact retry returns the same event. The installed
   `supabase-js 2.110.8` may retry transient PostgREST/RPC requests, so server
   idempotency is mandatory. After an ambiguous result, the client invokes the same
   RPC once with the identical owner/ledger/epoch/device/operation/proof inputs. Its
   row lock serializes behind any timed-out transaction. If that resolver is also
   ambiguous, durable backoff applies; no new operation and no cancellation are
   permitted. Conflict, ownership failure or mismatched evidence remains fail-closed.
4. **Revalidate and promote once locally.** Immediately before P10-010, revalidate
   the immutable READY stage against the semantic hash/counts that reproduce the
   server-bound proof digest. P10-010's one SQLite transaction promotes the
   ledger/archive/epoch and
   copies the operation binding into promotion metadata. If the stage becomes
   invalid after server advance, do not invent data or start a new operation: keep
   recovery blocked and allow re-staging only from a user-reselected backup that
   reproduces the exact bound hash.
5. **Reload from verified SQLite.** P10-011 performs the canonical proof and bounded
   cache reload. UI never treats cached Zustand data as proof of a restore.
6. **Re-establish V2 through a restore-specific preactivation core.** Extract the
   reviewed bootstrap/read-back/shadow/activation portion into a narrow shared
   library coordinator. P10-012 uses shadow mode only and stops at atomic
   `activated_at`; it must not call production apply. The ordinary sync worker may
   resume afterwards and remains responsible for later V2 commands.
7. **Activate or retain recovery.** Only verified activation for the exact ledger,
   new epoch and bootstrap permits writes/sync again. Until then, the mounted app may
   show the restored ledger read-only plus recovery status. Bootstrap/read-back/hash/
   shadow failure preserves local truth and never falls back to V1.

## Why the cloud RPC needs operation and content identity

The existing `advance_financial_restore_epoch_v2` correctly locks the ledger row and
has a unique `(ledger_id, to_epoch)` event. But its idempotent branch confirms only
epochs and reason. A device ID is not enough, and an operation UUID alone still does
not identify the financial content. P10-012 needs immutable evidence for both the
exact durable attempt and the exact canonical stage proof. The opaque digest binds
that proof without placing the raw semantic hash or row counts in the cloud.

The new RPC is still idempotent, with no custom retry storm. Current Supabase
documentation notes that RPC/PostgREST calls may be retried for transient failures;
the server-side operation must therefore be safely repeatable and the client must
resolve ambiguous outcomes through the same idempotent operation under the ledger
lock, never by inferring safety from a racy unlocked read.

## Interface boundaries

`financialRestoreCloudRecoveryV11.js` (new, isolated) will own only the state
machine and injected narrow adapters:

- `advanceOrResolveRestoreEpoch(operation)` — exact server CAS/evidence adapter;
- `promoteCanonicalRestoreStageV11(...)` — existing P10-010 local transaction;
- `recoverCanonicalRestoreAfterCommitV11(...)` — existing P10-011 local reload;
- `activateRestoreBaselineV2(...)` — extracted shadow-only preactivation core;
- `setRecoveryStatus(...)` — bounded UI status only.

P10-010/P10-011 must first receive a small versioned metadata patch so operation/proof
identity survives their COMMIT/reload boundary. The cloud coordinator will not
import `App.js`, `dataSlice`, Settings, full Zustand state or financial-payload
logging. A later live entrypoint—only after P10-013 undo and P10-014 acceptance—will
own `runFinancialMaintenance()` and the non-unmounting visible barrier. Routine sync
remains silent and does not take this barrier.

## Final hardening additions

1. **Single-flight plus local transition CAS.** A process mutex alone is insufficient
   after restart. Every durable transition runs in the SQLite writer queue and
   verifies `(operation_id, expected_status, state_version)` before writing the next
   state. Two taps, timers or resume handlers cannot advance one operation twice.
2. **Session loss is phase-sensitive.** Before server proof, an account/session
   change pauses the operation. After server proof, local promotion may still finish
   from its durable identity because the server already fenced the epoch; cloud
   continuation waits for the original account to reauthenticate. A different user
   can never adopt that recovery operation.
3. **Low-storage gate before server advance.** READY stage, local health, SQLite
   integrity, writer-queue drain and a conservative free-space/WAL budget must pass
   before the irreversible server epoch CAS. P10-014 measures the real budget; live
   restore remains disabled until that device gate exists.
4. **Bounded network/resource behavior.** One logical RPC plus at most one exact
   ledger-locking resolver invocation, library backoff/jitter and a durable
   next-retry time; no custom tight retry loop. This limits Supabase requests and
   protects the Data API connection pool.
5. **Stage retention rules.** A user may cancel only before the first server RPC is
   dispatched. After dispatch, stage and evidence are never
   auto-deleted until local promotion succeeds or the same backup is safely re-staged
   to the exact proof digest.
6. **Additive rollout and non-destructive rollback.** Cloud migration adds nullable
   legacy columns, constraints/indexes and the versioned function. It does not
   rewrite financial rows or drop old audit events. Application rollback keeps the
   schema and never drops proof evidence created by a newer client.
7. **Safe observability.** Diagnostics may include operation/event IDs, epochs,
   bounded status, Postgres/PostgREST error code and timings. They exclude semantic
   hashes, proof inputs, counts, financial rows, bootstrap payloads and unrestricted
   server error details.

## Test matrix before any live cloud test

All first-round tests use a strict fake server adapter and a file-backed SQLite
fixture. They execute real P10-010/P10-011 local code; no mock may replace their
financial transaction.

1. definitive pre-dispatch rejection: old local ledger unchanged and no server call;
   after dispatch there is no cancellation path;
2. server advances but response is dropped: the exact ledger-locking retry proves the same operation,
   then exactly one local promotion occurs;
3. second device / different operation ID or proof digest races: second path fails
   closed and cannot promote its stage;
4. process stop after server CAS, before local COMMIT: restart resumes only the
   recorded operation;
5. process stop immediately after local COMMIT: P10-011 reloads exact SQLite truth;
6. bootstrap, read-back hash, identity, row-count or shadow-quiescence failure:
   local restored ledger stays complete; writes/sync remain paused;
7. session/account switch at every network boundary: recovery remains tied to its
   old namespace/identity; no other ledger is selected;
8. two consecutive successful restore epochs and a repeated recovery invocation:
   each is idempotent and cannot replay old epoch mutations;
9. child process exits without cleanup after server-proof, before local COMMIT,
   immediately after COMMIT, after reload and before activation; parent process
   reopens the file and proves the expected durable state;
10. runtime PostgreSQL/Supabase integration proves row locking, exact idempotency,
   competing-operation rejection, RLS ownership, old-RPC product-operation rejection
   and explicit function/table grants; a static SQL-string test is not an acceptance
   gate;
11. payload/privacy gate: statuses/errors contain identifiers and codes only, never
   amounts, transactions or serialized bootstrap rows.

Only after those pass, review, push and green CI may a **user-authorized disposable
account** execute the device/cloud matrix. That final matrix must test one operation
at a time, record only safe diagnostics, and leave the original account untouched.

## Sources checked

- MYFI canonical authority, data ownership contract, sync protocol, P19 V2 addendum,
  P10 execution plan, current RPC migration and current P10-010/P10-011 code.
- Supabase documentation: JavaScript RPC, database-function security, client error
  handling and retry guidance (checked 2026-08-21).

## Non-goals of this proposal

This report does not approve a cloud schema deployment, invoke Supabase, alter local
SQLite schema, connect P10 code to a live app path, change normal sync UX, or claim
P10-012/Phase 10 acceptance. Those happen only after explicit approval of this
design, isolated implementation/tests, independent review, push, green CI and the
separate disposable-device authorization.
