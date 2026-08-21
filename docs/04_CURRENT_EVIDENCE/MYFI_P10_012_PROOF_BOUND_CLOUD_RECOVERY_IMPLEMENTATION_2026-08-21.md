# MYFI — P10-012 proof-bound cloud recovery implementation evidence

**Recorded:** 2026-08-21T15:05:56+03:00
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`
**Starting HEAD:** `bc4f23470bb190709cfdfae7dd12a24c57f73d18`
**Fresh remote reference:** `37868db1136088971cc8b52f6c1ccf0f6e67b3a3`
**Runtime / SQLite:** Expo `~54.0.36`, React Native `0.81.5`,
`expo-sqlite ~16.0.10`; financial schema V8 / ledger model V7.
**Scope:** isolated implementation and local tests only. No live application
entrypoint, real Supabase call, migration deployment, real account/device, APK
installation, release or production action occurred.

## Outcome

P10-012's isolated implementation is present and passes the local project and
Android bundle gates. It is **not yet accepted/closed**: independent review, commit,
push and green CI are still required, and the versioned PostgreSQL function still
needs a real disposable PostgreSQL/Supabase runtime test before any live wiring.

The implementation deliberately remains dormant until P10-013/P10-014 provide the
undo/live-entrypoint/device acceptance gates. `App.js`, `dataSlice.js`,
`SettingsScreen.js`, normal sync and the maintenance UI were not connected or
modified by P10-012.

## Implemented safety model

1. A domain-separated opaque SHA-256 restore proof binds operation UUID, ledger,
   from/to epoch, semantic hash, validator version and the complete ordered V11
   counts. Only the opaque digest is designed for Supabase; raw hash/counts remain
   local.
2. P10-010 now requires a version-2 `server_epoch_proven` intent with exact owner,
   operation, server event, stage, epoch and digest binding. The same SQLite COMMIT
   that promotes the hot ledger/archive and epoch copies that binding into durable
   promotion metadata before consuming the intent.
3. P10-011 validates and preserves that operation/proof binding across process
   restart and does not regress a later cloud-recovery state.
4. The isolated P10-012 coordinator uses local compare-and-swap transitions plus a
   process single-flight guard. A dropped server response becomes
   `server_outcome_unknown`; it cannot permit local promotion. Resume uses the same
   durable operation UUID.
5. Session binding is phase-sensitive. A changed account cannot call/resolve the
   server operation or continue cloud activation. Once exact server proof exists,
   local promotion remains retryable from durable evidence, while cloud continuation
   still waits for the original account. User namespaces must equal
   `user:<auth-user-uuid>`; workspace namespaces require an explicit authorized
   preflight result. Empty stage suffixes are rejected before any server call.
6. Restore-specific V2 activation is injected and must prove read-back identity,
   manifest/row-count verification and zero-pending/zero-conflict shadow quiescence.
   The coordinator requires `allowProductionApply: false` and rejects any result
   that reports production apply.
7. Errors/status reads are bounded to identifiers and safe codes. Public recovery
   status excludes semantic hashes, proof counts and financial payloads.
8. The Supabase adapter performs one logical versioned RPC and, only for an
   ambiguous/malformed response, at most one invocation of the exact same
   ledger-locking RPC. It contains no custom retry loop, never infers cancellation
   from a racy epoch read, and durable retry timing suppresses request storms.
9. Preflight must attest that the restore maintenance barrier is already owned and
   remains the future live caller's responsibility through P10-010 promotion. The
   isolated coordinator will not begin from an unowned preflight.

## Independent adversarial review

The first independent review rejected the draft before commit/push. It found a
critical racy cancellation inference plus state-regression/CAS, namespace, retry and
diagnostic issues. No finding was waived. The implementation was changed to:

- remove all cancellation after first RPC dispatch and resolve only through the
  same exact ledger-locking RPC;
- advance `stateVersion` across P10-010 instead of resetting it;
- require exact status/operation/stateVersion in P10-011 before its post-reload
  write, with a runtime stale-callback regression test;
- require expected `stateVersion` at every coordinator CAS and retain an
  activation-attempt cursor so delayed callbacks cannot adopt a newer cycle;
- enforce durable exponential retry timing before another server adapter call;
- structurally bind account/workspace namespace, non-empty stage and maintenance-
  owned authorized preflight;
- replace regex-based error acceptance with an explicit safe-code allowlist;
- treat malformed successful RPC evidence as ambiguous and resolve it under the
  same server lock;
- use NULL-safe SQL reason comparisons and correct final reconciliation reporting.

The second review verified those fixes but still rejected push because restart did
not repeat maintenance-owned preflight, adapter-supplied five-second retry timing
could defeat exponential delay, and the literal hard-exit matrix still substituted
metadata for P10-010/P10-011. Those findings were also fixed without waiver:

- every pending resume now runs phase-aware preflight again; pre-COMMIT requires the
  READY stage and old epoch, post-COMMIT requires the new epoch, and both require
  maintenance ownership, workspace authorization, integrity, drained writer queue
  and zero pending current-epoch mutations;
- retry scheduling uses the later of adapter timing and durable exponential delay
  plus deterministic bounded jitter; a runtime test proves retry 2 is at least ten
  seconds rather than another fixed five seconds;
- all eight literal process exits now spawn the real P10-011 operational harness.
  Each path executes real P10-010 hot-ledger/archive/epoch promotion and real P10-011
  canonical verification/reload as applicable, while the parent inspects the actual
  transaction IDs, archive year, restore epoch and durable status before and after
  resume.

The third/final read-only review approved the corrected tree for local commit/push
with no remaining code blocker. It independently re-ran the focused tests, full
quality gate (`105/0/11`) and `git diff --check`, and verified phase-aware resume
preflight, exponential+jitter retry enforcement, and real P10-010/P10-011 financial
hard-exit coverage at all eight boundaries. It retained the disposable PostgreSQL/
Supabase runtime gate as a mandatory **pre-live** requirement, not a blocker to
commit/push of this isolated code.

## Cloud migration draft

Supabase CLI `2.113.0` generated
`20260821115320_p10_012_proof_bound_restore_epoch_v3.sql`. Because the CLI has a
Windows/OneDrive `AlreadyExists` defect when the repository migration directory
already exists, the timestamp/name was generated in a temporary local Supabase
project and the exact generated file was placed in the real migration directory.
The temporary files were removed.

The additive draft:

- adds nullable `event_uuid`, `operation_id` and `restore_proof_digest` fields plus
  all-or-none proof constraints and partial unique/evidence indexes;
- adds `advance_financial_restore_epoch_v3`, restricted to authenticated
  proof-bound `backup_restore` operations;
- locks the owned active ledger, performs epoch CAS, and requires exact retry
  equality across owner/ledger/epochs/device/operation/digest;
- narrows legacy `advance_financial_restore_epoch_v2` to
  `controlled_recovery` only;
- uses `security definer` with empty `search_path`, fully qualified relations,
  `auth.uid()` ownership checks, explicit revokes from `PUBLIC`/`anon`, and execute
  grant only to `authenticated`;
- stores no semantic hash, row counts or financial payload.

The migration was **not applied anywhere**.

## Operational tests

Local tests execute the following:

- production opaque proof derivation and tamper sensitivity;
- ambiguous RPC followed by exact evidence resolution and exactly one promotion;
- operation conflict, namespace mismatch, account switch and bounded diagnostic
  privacy;
- no cancellation path after the first RPC dispatch, including after timeout;
- rejection when durable read-back or shadow-quiescence proof is absent;
- literal child-process hard exit at 8 durable boundaries through the real P10-010
  financial SQLite promotion and real P10-011 canonical reload, including after
  server response, server proof, local COMMIT, reload, read-back, shadow and
  activation before final state; every file-backed recovery resumes the same
  operation and exact hot/archive/epoch data;
- Supabase client request shape, exact proof normalization, definitive rejection,
  locked exact resolution and the 2-RPC maximum;
- static migration security/contract assertions.

Final local results after the approved independent review:

- `npm run test:gate`: **105 passed, 0 failed, 11 explicitly skipped**.
- `npm run verify:android`: **success**, Android Hermes bundle exported; generated
  verification output then removed.
- `git diff --check`: clean (line-ending conversion warnings only; no whitespace
  errors).

## Known required gate — not disguised as success

No Docker/PostgreSQL runtime is installed in this workspace. Therefore the migration
has not yet been executed against a disposable PostgreSQL instance, and the static
SQL contract cannot prove PL/pgSQL syntax, row locking, exact retry idempotency,
competing-operation behavior, RLS ownership or effective grants.

Before any migration deployment or live P10 wiring, a disposable runtime gate must
prove:

1. successful first advance and exact retry return the same event;
2. different operation/proof/device for the same epoch fails closed;
3. simultaneous operations serialize under the ledger row lock;
4. a second authenticated owner cannot read or invoke another owner's evidence;
5. `anon`/`PUBLIC` cannot execute either product RPC or write the events table;
6. the legacy V2 RPC rejects `backup_restore` and `delete_local_data` but retains the
   controlled diagnostic path;
7. rollback is additive: no event/financial row is deleted and no new proof evidence
   is silently discarded.

This runtime requirement belongs before live integration; it is not permission to
connect to or change the real MYFI Supabase project.

## Phase status

- Phase 9 remains **CLOSED WITH CONDITIONAL ACCEPTANCE**; P10-012 does not reopen it.
- P10-010 and P10-011 remain local history preceding this work.
- P10-012 implementation is locally green but still pending review/push/CI and the
  documented PostgreSQL runtime acceptance gate before live use.
- P10-013 and P10-014 have not started.
