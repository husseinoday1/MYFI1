# MYFI — P10-013 bounded-memory Undo design

**Status:** DESIGN ONLY — no runtime wiring, schema change, migration application,
device action, or Supabase operation is authorized by this document.

**Verified branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**Verified HEAD:** `74a36923dd41e78810a6a5c3aed224da47c6e8df`  
**Verified at:** 2026-08-21 17:58:15 +03:00  
**Working tree before this document:** clean; local and remote were `0/0` after
`git fetch --all --prune` and `git pull --ff-only`.  
**Runtime baseline:** Expo `~54.0.36`, React Native `0.81.5`, expo-sqlite
`~16.0.10`, SQLite financial schema V8 with ledger model V7.

## 1. Decision summary

P10-013 remains the Frozen Plan's Undo operation:

```text
Undo(previous state) = Restore(verified pre-restore checkpoint)
```

It is not a second direct-overwrite path. It must reuse P10-007 through P10-012:
strict source validation, private stage, semantic and financial proof, proof-bound
epoch coordination, one atomic local promotion, post-commit reload and cloud
reconciliation.

The 2026-08-21 device OutOfMemoryError adds a mandatory implementation constraint:

> No Phase-10 source reader, checkpoint builder, decoder, validator, semantic hasher,
> stage writer, readback verifier, archive adapter or diagnostic may require the full
> financial graph, a duplicate graph, or one whole canonical JSON string in JS memory.

Every O(N) data phase before final promotion must be cursor-driven and bounded by both
row count and bytes. Only the final stage-to-live SQL promotion remains one atomic
transaction. That transaction is DB-native and memory-bounded, but still O(N) in I/O;
P10-014 must prove its duration is acceptable. If it is not, Phase 10 remains blocked
rather than weakening atomicity.

## 2. What the device evidence proves — and what it does not

`MYFI_P10_BENCHMARK_OOM_ON_DEVICE_2026-08-21.md` records a real flagship-device
failure after roughly 6.5 minutes: Java heap limit 256 MiB, RSS near 1 GiB, no result
from the old `ffe390f`-lineage APK.

This proves that the old full-materialisation diagnostic path is not acceptable. It
does not prove that current commit `74a3692` fails: Implementation 2 has since added
per-tier reporting, orphan-stage sweeping and the earlier `d245dc4` SQL-count/readback
memory correction. Those changes need a new CI-APK device run and remain owned by
Implementation 2.

P10-013 nevertheless adopts bounded memory as an architectural invariant. Its safety
must not depend on a particular phone having a larger heap or on `android:largeHeap`.

## 3. Current code reality that prevents a trivial P10-013

The isolated P10-006 through P10-012 chain is correctness-oriented but not yet a
bounded-memory engine:

- `readCanonicalBackupSource()` calls `readFinancialProjectionV7()` and
  `exportColdArchives()`, materialising the full ledger and archive graph.
- `canonicalizeFinancialLedgerV2()` maps and sorts every collection into another full
  graph.
- `stableSemanticJson()` creates one whole canonical JSON string before SHA-256.
- `decodeCanonicalBackupV11()` accepts an already-parsed full object.
- `validateCanonicalLedgerStructure()` retains full ID sets while traversing full
  arrays.
- `stageCanonicalRestoreV11()` receives the full decoded model, loops every row in JS,
  then reads the entire stage back and canonicalises it again.
- `recoverCanonicalRestoreAfterCommitV11()` again calls the full canonical backup
  reader, rebuilds the full semantic document, and passes the full source to its reload
  callback. A restore could therefore commit safely and then OOM during proof/reload.
- the legacy `dataSlice.importBackup()` captures current Zustand collections and Cold
  Archive arrays in memory for rollback; P10-013 must replace that Undo mechanism, not
  call it from the new engine.

Therefore P10-013 must not call the current writer to create a complete V11 object and
then pass that object back through the current decoder. That would duplicate the exact
memory shape the device evidence forbids.

## 4. Bounded canonical row-source boundary

Before implementing Undo, extract one internal source protocol used by checkpoint and
restore work. Conceptually:

```text
CanonicalRestoreRowSource
  openManifest()
  readSmallMetadata()
  iterate(section, afterKey, { maxRows, maxBytes })
  close()
```

The fixed sections are:

```text
financialConfig
accounts
exchangeRates
transactions
postings
links
entities
archiveHeaders
archiveRecords
```

Rules:

1. `iterate` returns at most one bounded batch and a deterministic continuation key.
2. Each section has one explicit total order and one keyset cursor; deep `OFFSET` is
   forbidden.
3. A row larger than the byte budget is handled alone up to a hard per-row package
   limit; an oversized row fails closed with an identifier-only diagnostic.
4. Progress payloads contain section, counts, elapsed time and keys/IDs only. They do
   not contain amounts, balances, notes, titles, payload JSON or archive records.
5. The adapter must release every batch before requesting the next one.
6. The first P10-013 adapter is canonical SQLite/checkpoint SQLite. A future external
   V11 file adapter must stream decrypt/inflate/parse or remain size-capped and
   non-production. Object-only V11 decoding is not sufficient for P10-014 closure.
7. Post-commit proof/reload uses the same bounded row source. It verifies the promoted
   namespace incrementally, then asks the UI loader for its normal bounded first page;
   it never passes the full canonical graph to Zustand.
8. P10-012 bootstrap upload, server readback and shadow validation must remain paged and
   cursor-driven. Coordinator callbacks may return counts/hashes/cursors only, never an
   accumulated row array.

The bounded structural validator must not replace full row arrays with full JS `Set`s
of every ID. Validate scalar row shape while streaming, let scoped UNIQUE/CHECK/FK
constraints reject invalid inserts, then run namespace-scoped SQL anti-joins for every
required relationship. Any global `PRAGMA foreign_key_check` remains a database-health
signal, not a substitute for exact stage/checkpoint relationship proof.

Expo SQLite v54 documents `getEachAsync()` as a result iterator that fetches one row at
a time and can reduce memory versus `getAllAsync()`. It also documents prepared
statements and transaction-scoped exclusive callbacks. Those are the permitted API
directions; implementation must still verify cancellation/finalisation behavior on the
installed expo-sqlite version.

## 5. Semantic proof gate — no silent hash substitution

The current V2 semantic hash cannot simply replace JS sorting with `ORDER BY id`:

- collection order currently uses `localeCompare`;
- object keys use JavaScript `.sort()`;
- the final hash is over one `stableSemanticJson()` string.

SQLite binary order and JavaScript locale order are not proven equivalent for Unicode.
A different order means a different financial proof even when rows are identical.

P10-013 therefore starts with a proof spike, not checkpoint code:

### H1 — preferred path

Implement an incremental serializer that emits exactly the same bytes as V2 while
holding at most one batch. Prove byte-for-byte and hash equality against current V2 for:

- randomized physical order;
- UUID/ASCII IDs;
- Arabic and other Unicode IDs/keys;
- empty and one-row sections;
- Cold Archive records and financial config;
- 1k and a generated large fixture.

### H2 — fail-closed path

If exact bounded V2 equivalence cannot be proven, stop. Do not relabel a new digest as
V2. Submit a separately reviewed Semantic Hash V3 proposal with deterministic binary
ordering, incremental domain-separated framing and a version-bound restore proof.

Whichever path succeeds, `semanticHashVersion` must be carried in the stage marker,
checkpoint manifest, restore intent, promotion record and local proof-digest input.
Supabase still receives only the opaque digest; no financial hash, counts or payload
is uploaded. The existing unapplied P10-012 migration is not to be applied or changed
as a side effect of P10-013 design.

## 6. Checkpoint storage and state machine

The pre-restore checkpoint is an immutable private SQLite namespace in the same
database as the live ledger and Cold Archive. It is not a plaintext temporary file,
not Zustand, not Vault authority and not Supabase data.

Suggested shapes:

```text
<live namespace>::restore-checkpoint::<checkpoint UUID>
canonical_restore_checkpoint:<live namespace>:<checkpoint UUID>
canonical_restore_undo_pointer:<live namespace>
```

Use `ledger_v7_meta` initially; P10-013 does not require a schema migration. Metadata
contains identifiers, versions, state, cursors, counts and hashes only.

```text
BUILDING_SOURCE_PROOF
COPYING
PROVING_CHECKPOINT
READY
REFERENCED_FOR_UNDO
GARBAGE_COLLECTABLE
ABORTED | FAILED
```

Every transition has an integer `stateVersion` and exact compare-and-swap. Stateful
tests must perform at least two complete operations sequentially.

The durable checkpoint manifest binds:

```text
checkpointId
namespace
ledgerId
sourceRestoreEpoch
semanticHashVersion
semanticHash
validatorVersion
exact manifest counts
batchPolicyVersion
createdAt / provedAt
```

It never includes auth tokens, device preferences, outbox/inbox rows, sync cursors or
raw financial values. Restore/Undo advances epoch; it does not replay old sync evidence.
The workspace row stores only the canonical financial-config allowlist; copying the raw
live workspace payload would incorrectly duplicate language, theme, privacy and other
device-local preferences into the checkpoint proof.

## 7. Checkpoint capture algorithm

Correctness-first sequence:

1. Perform bounded file/decryption/format checks that do not read or mutate live
   financial state.
2. Acquire the visible restore maintenance fence, pause sync/recurring work and drain
   the financial writer queue.
3. Under the current correctness-first policy, build and prove the requested incoming
   restore stage while the fence is owned. Any invalid source fails before an Undo
   checkpoint is needed. P10-013 does not independently move staging outside the
   fence; only P10-014 evidence plus generation/identity/epoch revalidation may approve
   that later optimization.
4. Revalidate namespace, ledger ID, restore epoch and incoming stage proof.
5. Stream the exact live semantic proof and persist it as the checkpoint source proof.
6. Copy the live hot-ledger and Cold Archive sections into the checkpoint namespace in
   bounded keyset batches. Each batch and its continuation cursor commit in the same
   SQLite transaction.
7. Stream SQL/structural/FK/financial checks and semantic proof from the checkpoint.
8. Recompute/revalidate the live identity, epoch and semantic proof. Any change means
   the maintenance ownership failed or the process resumed against a changed ledger;
   discard/restart rather than invent a repair.
9. Mark the checkpoint `READY` only when source and checkpoint hashes/counts/validator
   evidence match exactly.
10. Only then may P10-012 advance the server epoch and P10-010 promote the incoming
   restore stage.

The app-level maintenance fence may span many small checkpoint transactions, but the
live ledger is not changed by those transactions. A process death drops the in-memory
fence and leaves old live financial truth intact plus a partial private checkpoint.

### Resume after cancellation or process death

On restart:

1. reacquire maintenance ownership and drain writers;
2. read checkpoint state with exact `stateVersion`;
3. recompute live ledger ID, epoch and semantic proof;
4. resume only if all equal the persisted source proof;
5. otherwise mark the partial checkpoint garbage-collectable and start a new one.

Cancellation is honored only between batch transactions. Once the server epoch CAS is
dispatched, cancellation is disabled and P10-012 recovery rules own completion.

## 8. Batch mechanics

Use deterministic keyset ranges, not `OFFSET`:

```text
accounts / rates / transactions / postings / links: id
entities: (entity_type, id)
archive headers: (year, scope)
archive records: (year, scope, id)
```

Each copy operation is conceptually `INSERT INTO checkpoint ... SELECT ... FROM live`
for one key range. SQLite documents `INSERT ... SELECT`; this keeps row payloads on the
native side rather than crossing the JS bridge. The exact SQL, cursor predicate and
index plan must be tested against the real V8 schema.

Batch size is not a magic row constant. The policy uses both a maximum row count and a
maximum estimated/observed byte budget, with a version recorded in metadata. Initial
values are diagnostic defaults only and must be selected from P10-014 device evidence.

The implementation must throttle UI progress updates; no per-row React state update or
unbounded array of progress events is permitted.

## 9. Making Undo use the same restore engine

After a successful normal restore, the atomic Undo pointer references the verified
pre-restore checkpoint.

When the user requests Undo:

1. refuse while any prior restore is not fully reconciled/activated, while sync is not
   quiescent, or while another restore/Undo operation owns the namespace;
2. verify the referenced checkpoint and current ledger identity;
3. build/prove a normal private restore stage from that checkpoint using bounded,
   SQL-native batches;
4. create and prove a new checkpoint of the current ledger, so the operation has a
   safe reverse/redo point;
5. create a new restore operation UUID and advance from the current epoch to exactly
   `current + 1`;
6. execute P10-012 and P10-010 exactly as a backup restore; server reason remains the
   existing proof-bound `backup_restore`, while local metadata may record trigger kind
   `undo` for UX/audit;
7. reload/reconcile through P10-011;
8. after verified completion, garbage-collect only checkpoints not referenced by the
   active Undo pointer or any durable in-progress operation.

The P10-010 final transaction must atomically write/swap the Undo pointer alongside the
live ledger, Cold Archive, promotion metadata and local epoch CAS. Writing the pointer
after COMMIT would create a crash window where the restore succeeded but Undo vanished.

This gives one bounded reversible pointer: normal restore makes Undo available; Undo
captures the current state and swaps the pointer, so a second sequential operation is
still safe. Product naming of the second action as Undo or Redo is UX scope, not a
financial-engine decision.

## 10. Final promotion remains one short atomic boundary

P10-013 must not batch live replacement across commits. P10-010 remains:

```text
clear live hot ledger
SQL-copy proved stage to live
replace Cold Archive
write financial workspace state
write promotion + Undo-pointer metadata
advance local restore_epoch CAS
clear transient stage
COMMIT
```

All of that succeeds or rolls back together. The checkpoint is already complete and
verified before this transaction begins.

Batching removes JS-heap growth but does not make the SQL copy O(1). P10-014 must
measure `promotionTransactionMs` at 1k/10k/50k/100k. If the final transaction exceeds
the approved maintenance budget, do not split it. Escalate a separate active-namespace
pointer/swap design; that would be a schema/identity architecture decision and is not
silently authorized here.

## 11. Storage and failure policy

At peak, restore may temporarily contain live + incoming stage + Undo checkpoint + WAL.
P10-013 must therefore:

- estimate required pages/bytes before checkpoint copy where APIs permit;
- detect and classify `SQLITE_FULL`, `SQLITE_BUSY`, constraint, cancellation and
  integrity failures separately;
- never delete the current live ledger to make room;
- leave a partial checkpoint non-READY and never eligible for promotion;
- clean private rows in bounded batches only after proving no durable pointer or
  operation references them;
- require an exact checkpoint namespace shape and checkpoint UUID before any cleanup;
  wildcard/prefix-only deletion and cleanup of the live namespace are forbidden;
- never alter WAL/checkpoint/synchronous policy without separate crash evidence.

The exact free-space multiplier is a P10-014 measured decision, not a guessed constant.

## 12. Required tests before wiring

### Hash/source contract

- byte/hash equality of bounded proof and accepted semantic version;
- Unicode/order/randomized-row fixtures;
- maximum single-row rejection without raw payload diagnostics;
- a guard forbidding full `getAllAsync`/whole-document JSON on the bounded path.

### SQLite runtime

- real V8 schema; hot ledger and Cold Archive copied in bounded batches;
- injected process-equivalent failure before/after every batch+cursor commit;
- duplicate/replayed batch is idempotent or fails closed without duplicate rows;
- source changes between restart and resume force discard/restart;
- low storage, DB busy, FK/constraint/invariant and cleanup failure;
- checkpoint pointer is atomic with P10-010 promotion.

### Sequential operations

```text
restore A → B
Undo B → A at epoch +1
second reverse/redo A → B at epoch +2
```

Every boundary must prove hot ledger, Cold Archive, restore metadata, Undo pointer and
epoch are all old or all new—never mixed.

### P10-014 device acceptance

- CI-built diagnostic APK only;
- 1k/10k/50k/100k results emitted independently;
- Java heap, Hermes/native/RSS high-water, batch duration, total stage/checkpoint time,
  maintenance-block time and final promotion duration;
- foreground app-kill boundaries, cancellation, low storage and DB busy;
- demonstrate a bounded memory envelope: increasing total rows may increase elapsed
  work and database size, but peak JS/Java memory must plateau around the configured
  batch envelope rather than grow in proportion to total rows.

The numeric plateau threshold must be frozen before the acceptance run after the new
per-tier baseline exists. It must not be chosen after seeing the final result.

## 13. Implementation slices and ownership

No slice below is authorized by this design alone. Each requires Implementation 2
review before push.

1. **P10-013A — bounded proof spike:** source protocol + exact semantic-hash parity
   tests only. If H1 fails, stop for a V3 decision. The accepted implementation must
   also bind `semanticHashVersion` into the local proof-digest domain and all durable
   local state; the cloud continues to receive only the opaque digest.
2. **P10-013B — checkpoint repository:** private namespace, durable CAS state, bounded
   copy/proof/resume/GC; no live promotion caller.
3. **P10-013C — atomic pointer binding:** extend P10-010 fault-injection tests so the
   Undo pointer commits or rolls back with ledger/archive/epoch.
4. **P10-013D — isolated Undo coordinator:** checkpoint → standard stage → P10-012;
   still no App/Zustand/Settings caller.
5. **P10-013E — pre-wiring update and full regression:** keep modules dormant until
   the existing P10-011 idempotent-race defect, P10-012 PostgreSQL runtime gate and
   P10-014 device gate are closed. Replace P10-011's full-graph post-commit proof/reload
   with the bounded source and prove P10-012 adapters are paged before any live caller.

Do not touch `src/dev/phase10RestoreBenchmarkHarness.js`; Implementation 2 owns it.
Do not wire `App.js`, `dataSlice.js` or `SettingsScreen.js` during these isolated slices.

## 14. External references checked

- Expo SQLite v54: `getEachAsync()` cursor iteration, prepared statements and
  transaction scoping: <https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/>
- SQLite transactions and rollback behavior: <https://www.sqlite.org/lang_transaction.html>
- SQLite `INSERT ... SELECT`: <https://www.sqlite.org/lang_insert.html>
- SQLite WAL atomicity/concurrency constraints: <https://www.sqlite.org/wal.html>
- Android managed-heap and garbage-collection behavior:
  <https://developer.android.com/topic/performance/memory-overview>
- Supabase changelog checked 2026-08-21. No listed change alters this local checkpoint
  design. The P10-012 migration remains unapplied and protected by its existing gate:
  <https://supabase.com/changelog.md>

## 15. Approval gates

Before any P10-013 implementation:

1. Implementation 2 reviews this design and the exact current HEAD.
2. The user/Planning confirms the fail-closed hash decision: H1 exact V2 parity first;
   any V3 requires a separate explicit review.
3. The bounded source path remains isolated; no live restore wiring.
4. No real Supabase operation occurs without the user's direct permission.
5. Every patch runs code review before push and actual CI is monitored to completion.
