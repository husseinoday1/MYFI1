# MYFI — Phase 10 Atomic Backup / Restore Engine

## Technical Research & Architecture Gap Analysis

**Date inspected:** 20 August 2026
**Repository:** `husseinoday1/MYFI1`
**Prepared by:** external research (ChatGPT Pro), relayed by the user, saved by MYFI Planning & Audit

**Status note (Planning & Audit, 2026-08-20):** relayed as-is, not independently
verified against the repo yet. Treat every "REQUIRES CODE VERIFICATION" /
"REQUIRES ACCEPTANCE EVIDENCE VERIFICATION" marker in this document as a
literal blocker — Implementation must confirm each one against the actual
current code/evidence before relying on it, per standing rule (don't trust
an external report blindly). See routing decision at the bottom of this file.

```text
Branch inspected:
impl/p20-g01-acceptance-apk-2026-08-19

HEAD commit:
REQUIRES CODE VERIFICATION
The GitHub connector resolved and inspected the branch contents and proved it is
ahead of r05-p20-phase9-restore-epoch-gate, but did not expose a trustworthy
exact branch-tip SHA. I will not invent one.

Known prior Phase-9 checkpoint:
fd98f80dd1eb2f7aca9ad23d5d06aa64940e8ba0

Date inspected:
2026-08-20
```

The repository itself defines A0 implementation reality, while the Frozen Master Plan and permanent contracts define what behavior is legal. This report follows that authority hierarchy and the independent-review methodology supplied for this Phase 10 analysis.

**Relevant source inspected:** `backupData.js`, `dataSlice.js`, `financialLedgerV7Migration.js`, `financialLedgerV7Repository.js`, `localArchiveRepository.js`, `ledgerDatabase.js`, `financialMaintenanceBarrier.js`, `useSyncSlice.js`, `myfiFiles.js`, `cryptoBox.js`, and the P20 restore-epoch device gate.

**Relevant contracts inspected:** Frozen Master Plan, Backup Format, Data Ownership, Sync Protocol, Performance/Reliability SLO, canonical authority, and current Phase-9 acceptance evidence.

---

# 1. Executive Verdict

## Verdict: **B**

> **Existing infrastructure is good, but restore orchestration needs a targeted structural refactor.**

A full rewrite is **not justified**.

MYFI already has most of the difficult low-level ingredients:

* one shared SQLite database/connection;
* WAL and foreign-key enforcement;
* serialized SQLite writer queue;
* exclusive transaction primitive;
* V7 stage → readback → parity → health → promotion machinery;
* V8 immutable `ledger_id` + `restore_epoch`;
* durable restore-intent primitives;
* restore-epoch server fencing;
* V2 re-bootstrap/reactivation workflow;
* a process-wide maintenance barrier;
* staged Cold Archive replacement;
* ZIP/manifest/SHA-256 package integrity;
* AES-256-GCM + PBKDF2 password encryption.

The defect is primarily **composition**.

The current `importBackup()` still behaves like a legacy-state restore coordinator wrapped around newer V7/V8 infrastructure. It:

1. sources backup financial collections from Zustand;
2. restores Cold Archive separately;
3. runs normalization helpers associated with legacy/UI data;
4. mutates Zustand before durable V7 promotion;
5. invokes V7 migration/cutover machinery afterward;
6. uses FNV-style logical checksums rather than an official canonical financial semantic hash;
7. has no final integration with the V8 restore-epoch protocol because signed-in V7 restore remains intentionally interlocked.

That combination cannot satisfy final Phase-10 atomicity.

**Confidence: HIGH — directly verified from current inspected source.**

The right direction is therefore:

```text
Keep:
file/crypto
maintenance barrier
SQLite writer serialization
V7 stage/readback/health primitives
V7 SQL promotion mechanics
V8 restore-epoch primitives
Cold Archive SQLite storage

Replace/refactor:
backup read source
strict restore decoder
semantic parity primitive
restore orchestration
combined archive+ledger promotion boundary
post-commit cache handling
V8 restore transaction integration
```

---

# 2. Verified Current Baseline

## A. Verified from current MYFI source

### SQLite is operational financial authority

The Data Ownership contract states that after Phase 8, V7 SQLite is the operational source of truth while Zustand is bounded UI/query cache.

The actual V8 schema contains:

```text
ledger_accounts_v7
ledger_exchange_rates_v7
ledger_financial_transactions_v7
ledger_postings_v7
ledger_transaction_links_v7
ledger_entities_v7
ledger_workspace_state_v7

ledger_sync_identity_v8
ledger_outbox_v3
ledger_inbox_v3
ledger_bootstrap_state_v8
ledger_bootstrap_import_state_v8
ledger_sync_state_v8
```

`ledger_sync_identity_v8` contains both immutable `ledger_id` and `restore_epoch`.

### One SQLite physical database

`ledgerDatabase.js` opens:

```text
myfi-ledger-v2.db
```

and exposes one shared writer queue plus `withExclusiveTransactionAsync()`. It also enables:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

### Cold Archive uses the same database

`localArchiveRepository.js` calls the same:

```js
getLedgerDb()
enqueueLedgerWrite()
runLedgerExclusiveTransaction()
```

Consequently, V7 financial tables and `cold_archive_*` tables can participate in **one SQLite transaction**. There is no requirement for a distributed transaction between two databases.

### Existing V7 migration infrastructure is substantial

`runFinancialOperationalCutoverV7()` already performs the conceptual sequence:

```text
build projection
→ write stage namespace
→ SQLite readback
→ checksum/metrics parity
→ financial invariant proof
→ promote staged namespace
```

This is one of the strongest reasons **not** to rewrite Phase 10 from scratch.

### Phase-9 restore-epoch primitives exist

Current source has:

```text
beginLedgerRestoreEpochV8()
commitLedgerRestoreEpochV8()
abortLedgerRestoreEpochV8()
readLedgerRestoreIntentV8()
```

The commit uses compare-and-swap against the current ledger/epoch, preserves `ledger_id`, advances only `restore_epoch`, starts the new epoch with a fresh sync state, and marks it pending reactivation.

---

# 3. Official Contract Requirements

## B. Required by MYFI canonical contract

The Frozen Master Plan says Phase 10 restore must be:

```text
select backup
→ decrypt
→ parse
→ schema validate
→ create staged ledger/database
→ import
→ financial health proof
→ semantic validation
→ checksum/hash
→ ready

then:

pause sync
pause recurring
acquire maintenance lock
→ atomic active-ledger promotion
→ increment restore_epoch
→ reopen
```

Before final promotion the active ledger must remain untouched. After crash, only these outcomes are valid:

```text
old complete ledger
OR
new complete ledger
```

never:

```text
half restored ledger
```

Same-ledger restore preserves `ledger_id`.

The Backup Format contract independently requires the same staged architecture and prohibits direct overwrite.

The canonical backup model must contain financial truth including postings and historical FX, not merely legacy transaction objects.

---

# 4. Existing Components Worth Keeping

| Component                             | Assessment                                  | Decision                                    |
| ------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| `cryptoBox.js`                        | AES-256-GCM/PBKDF2 already implemented      | **Keep**                                    |
| `myfiFiles.js`                        | ZIP, package manifests, SHA-256, limits     | **Keep / harden**                           |
| `financialMaintenanceBarrier.js`      | solid process-wide fencing primitive        | **Keep**                                    |
| shared SQLite write queue             | correct serialization point                 | **Keep**                                    |
| `stageFinancialWorkspaceV7()` concept | useful staged-write primitive               | **Generalize**                              |
| `readFinancialProjectionV7()`         | excellent foundation for canonical readback | **Reuse/extend**                            |
| `proveFinancialLedgerInvariantsV7()`  | required health gate                        | **Reuse**                                   |
| SQL stage→live promotion              | correct atomicity direction                 | **Reuse/extend**                            |
| `replaceColdArchives()` staging       | good local archive staging                  | **Extract promotion primitive**             |
| V8 restore-intent/epoch functions     | correct protocol foundation                 | **Reuse at lower transaction level**        |
| rollback checkpoint UX                | useful Undo mechanism                       | **Keep, but do not confuse with atomicity** |

The Frozen Master Plan explicitly says to retain the existing AES-GCM/PBKDF2 layer if testing proves it. Current implementation is AES-256-GCM with PBKDF2-SHA256 and authenticated AAD.

`myfiFiles.js` already verifies SHA-256 package manifests, supports encrypted packages, limits input size and checks logical backup data after decode. This is not the main architectural problem.

---

# 5. Gap Analysis

## P0 — Backup source is wrong after V7 cutover

Current `exportBackup()` begins from:

```js
const {
  trans,
  debts,
  goals,
  wallets,
  commitments,
  cats,
  cfg,
  workspaceNamespace
} = get();
```

It then calls `buildFinancialBackup()` with those Zustand collections.

After Phase 8, Zustand is explicitly not the financial database.

Therefore:

> **Final Phase-10 backup must read canonical SQLite directly.**

**Confidence: HIGH.**

This is the highest-priority Phase-10 gap.

---

## P0 — v10 logical backup is not the complete V7 ledger

`backupData.js` v10 handles:

```text
trans
debts
goals
wallets
commitments
cats
currencies
rates
budgets
coldArchives
financialConfig
```

but the current canonical database explicitly contains:

```text
accounts
financial transaction headers
postings
exchange-rate rows
transaction links
entities
workspace state
ledger identity
```

`buildFinancialBackup()` does not export those canonical tables directly. Its `rates` are reconstructed from transaction fields rather than read as authoritative SQLite FX records.

So:

```text
trans[] != canonical V7/V8 ledger
```

**Confidence: HIGH.**

---

## P0 — Cold Archive and main ledger promotion are separate commits

Current `importBackup()` first performs:

```js
replaceColdArchives(...)
```

and later:

```js
runFinancialOperationalCutoverV7(...)
```

Both are individually transactional, but **not jointly transactional**.

Crash window:

```text
replaceColdArchives COMMIT
↓
PROCESS KILL
↓
old V7 live ledger
+
new restored cold archive
```

That violates the Phase-10 all-or-nothing acceptance invariant.

**Confidence: HIGH.**

---

## P0 — Zustand becomes visible before durable promotion

Current restore executes `set({...})` with restored collections **before** `runFinancialOperationalCutoverV7()`.

Required order is the reverse:

```text
stage SQLite
→ validate
→ atomic SQLite promotion
→ COMMIT
→ canonical SQLite read
→ Zustand/cache refresh
```

Zustand must never participate in the durable atomic boundary.

**Confidence: HIGH.**

---

## P0 — No final semantic-hash contract

Current backup `logicalChecksum()` is stable JSON plus **FNV-1a 32-bit**.

V7 migration parity also currently uses a stable JSON/FNV-style projection checksum.

This may remain useful as legacy diagnostic compatibility, but it does not implement the Frozen Master Plan's formal:

```text
semantic_hash_version
```

nor does it establish a versioned cryptographic financial semantic identity.

**Confidence: HIGH.**

---

## P0/P1 — Restore is still a migration of legacy state, not strict canonical restoration

The current V7 cutover path builds canonical V7 commands from a legacy workspace representation.

That path deliberately contains **migration semantics**, including normalization and generation of synthetic migration records where required.

Those behaviors are appropriate when migrating an old model.

They are dangerous if silently reused as disaster-recovery semantics.

Restore needs:

```text
decode exact canonical backup
→ reject illegal references
→ preserve financial meaning
```

not:

```text
normalize legacy state
→ infer missing meaning
→ produce equivalent-looking V7 state
```

---

## P1 — `prepareWalletData()` is in strict restore path

`importBackup()` currently routes restored data through:

```js
prepareWalletData(...)
```

before V7 cutover.

The exact repair behavior of this helper was **not fully re-inspected in this research pass**.

Therefore:

> **REQUIRES CODE VERIFICATION:** determine whether it creates default wallets, attaches missing wallet references, rewrites relationships, or otherwise changes restore semantics.

Regardless, a strict Phase-10 restore must not depend on a helper unless every normalization it performs is explicitly permitted by the Backup contract.

Unknown wallet references are a blocking error under MYFI's financial contract.

---

## P1 — Backup export currently contains FX repair

Current export path contains `repairFrozenFx()` and can derive missing exchange rates from frozen amounts, recording:

```text
backup_derived_from_frozen_amounts
```

This may be defensible as **legacy compatibility conversion**.

It is not appropriate as canonical Phase-10 behavior.

Canonical V7/V8 disaster recovery should read the immutable historical FX records already stored in SQLite.

If canonical SQLite itself contains unresolved/missing historical FX:

```text
BACKUP MUST FAIL CLOSED
```

rather than manufacturing historical truth.

**Confidence: HIGH for current repair behavior; HIGH that it must not define canonical DR semantics.**

---

# 6. Backup Export Architecture

## Recommended target

```text
SQLite canonical financial snapshot
        │
        ├── ledger identity
        ├── financial schema metadata
        ├── accounts
        ├── transactions
        ├── postings
        ├── historical FX
        ├── transaction links
        ├── financial entities
        ├── budgets
        ├── recurring
        ├── archive state
        ├── reconciliation
        └── relevant financial workspace config
        ↓
Canonical Backup Read Model
        ↓
Canonical semantic projection
        ↓
SHA-256 semantic hash
        ↓
Versioned backup envelope
        ↓
existing myfiFiles/crypto layer
```

### Important separation

The backup should contain **financial truth**, not V8 transport machinery.

Do not restore literally:

```text
ledger_outbox_v3
ledger_inbox_v3
server cursor
bootstrap upload job
retry timestamps
current activation job state
```

Those exist to transport financial truth, not define it.

The backup should preserve:

```text
ledger_id
```

for same-ledger restoration.

It may record the origin epoch as provenance:

```text
exported_from_restore_epoch
```

but should **not** treat that value as the transport epoch to restore verbatim.

The restore protocol establishes a new epoch.

### Consistent read requirement

The canonical export must see one logical SQLite point-in-time snapshot.

SQLite transactions provide snapshot/isolation semantics; in WAL mode a reader transaction sees a stable database snapshot while later writes are not visible to that transaction.

Expo's `withExclusiveTransactionAsync()` also gives a transaction-scoped `txn` object so queries outside the callback are not accidentally included in that transaction.

**Recommendation — MEDIUM confidence pending device benchmark:** implement the backup read model in one read transaction, using only the transaction handle.

Do not simply issue 8 unrelated SELECTs with commits occurring between them.

---

# 7. Restore Architecture

## Proposed final state machine

```text
FILE_SELECTED
    ↓
PACKAGE_VERIFIED
    ↓
DECRYPTED
    ↓
PARSED
    ↓
STRUCTURE_VALID
    ↓
CANONICAL_MODEL_READY
    ↓
SQLITE_STAGED
    ↓
STAGE_HEALTH_VALID
    ↓
SEMANTIC_VALID
    ↓
READY_TO_PROMOTE
    ↓
RESTORE_PRECONDITIONS_REVALIDATED
    ↓
V8_EPOCH_FENCE_READY
    ↓
ATOMIC_PROMOTION
    ↓
LOCAL_COMMITTED
    ↓
LIVE_READBACK_VERIFIED
    ↓
UI_CACHE_RELOADED
    ↓
SYNC_RECOVERY_PENDING
    ↓
V2_BOOTSTRAPPED
    ↓
V2_REACTIVATED
    ↓
RESTORE_COMPLETE
```

The most important design rule is:

> **No live financial state is touched before `READY_TO_PROMOTE`.**

---

# 8. Canonical Semantic Hash Design

The previous canonicalization incident is directly relevant.

Current source explicitly documents the bug class: source-side parity hashed a raw payload while persistence canonicalized it. `cfg.avatarUri` caused source and readback representations to differ. The fix made both paths call the same canonicalizer.

That lesson must become a Phase-10 contract.

## Required pipeline

```text
Decoded backup
    ↓
Canonical Financial Model
    ↓
canonicalFinancialSemanticProjection(version=N)
    ↓
stable serialization
    ↓
SHA-256
    ↓
Hash A
```

versus:

```text
Staged SQLite readback
    ↓
Canonical Financial Model
    ↓
THE SAME canonicalFinancialSemanticProjection(version=N)
    ↓
THE SAME stable serialization
    ↓
SHA-256
    ↓
Hash B
```

Then:

```text
Hash A === Hash B
```

### Recommended manifest fields

```text
semantic_hash_version
semantic_hash_algorithm
canonicalization_version
semantic_hash
```

Proposed example:

```text
semantic_hash_version: 1
semantic_hash_algorithm: "SHA-256"
canonicalization_version: 1
```

These names are architectural recommendations, not verified current canonical field names beyond the required `semantic_hash_version`.

### Critical nuance: same canonicalizer can hide a lossy bug

The current code review discovered exactly that danger: `canonicalFinancialEntityPayload()` strips `avatarUri` unconditionally, and because both persistence and comparison share that transform, parity can no longer detect loss of that field.

Therefore Phase 10 should not merely say:

> use the same canonicalizer.

It must say:

> use the same **contract-reviewed financial semantic projection**, whose inclusions and exclusions are explicit and versioned.

Every excluded field must be classified as non-financial or ephemeral.

---

# 9. Strict Validation Model

Validation should be layered.

### Layer 1 — Package integrity

Existing:

```text
ZIP validity
BagIt-style manifest
SHA-256 payload hash
tag manifest
authenticated encryption
size limits
```

This proves package integrity.

It does **not** prove financial correctness.

### Layer 2 — Format/schema compatibility

Validate:

```text
backup format
backup format version
financial schema version
semantic hash version
canonicalization version
required sections
unknown mandatory section policy
```

### Layer 3 — Structural financial validation

Examples:

```text
immutable IDs present
IDs unique
postings reference existing transaction
postings reference existing account
FX IDs resolve
currency codes valid
links target valid entities
wallet/account references valid
ledger_id present
```

### Layer 4 — domain invariants

Use/refactor existing invariant machinery:

```text
foreign_key_check
quick_check / required integrity probes
posting/account consistency
currency consistency
balance derivability
transfer semantics
historical FX validity
no unresolved FX
no duplicate idempotency identity
```

### Layer 5 — semantic validation

```text
backup semantic hash
==
staged SQLite semantic hash
```

### Layer 6 — pre-promotion concurrency validation

Re-check immediately before COMMIT:

```text
expected ledger_id unchanged
expected restore_epoch unchanged
expected active namespace unchanged
expected source generation/revision unchanged
no unexpected restore intent
sync/writer state fenced
stage still READY and unchanged
```

---

# 10. Staging Design

## Recommendation

Use a **restore-specific namespace inside the existing SQLite database**, not a second physical database.

Example conceptually:

```text
<live namespace>::restore-stage::<restoreId>
```

Existing infrastructure already proves that namespace staging works.

Benefits:

* same schema;
* same foreign keys;
* same storage engine;
* same canonical readback functions;
* allows final `INSERT ... SELECT ...`;
* allows Cold Archive and V7 data to commit together;
* avoids multi-database atomicity.

### But do not call migration staging unchanged

Current:

```text
stageFinancialWorkspaceV7(commands, entities)
```

is migration-oriented.

Phase 10 needs something conceptually equivalent to:

```text
stageCanonicalFinancialBackup(...)
```

using lower-level persistence primitives shared with migration.

Recommended layering:

```text
low-level canonical SQLite writer
      ↑                ↑
V7 migration adapter   Backup restore adapter
```

not:

```text
Backup restore
→ pretend it is V7 legacy migration
```

---

# 11. Atomic Promotion Boundary

This is the heart of Phase 10.

SQLite's transactional guarantee is exactly the property MYFI needs: all modifications in a single transaction occur completely or not at all even across application/OS crash or power failure. WAL retains the same atomic-commit guarantee using WAL commit records.

Current MYFI already uses Expo's exclusive transaction API, which automatically commits or rolls back based on callback success.

## Final SQLite transaction should conceptually contain

```text
BEGIN EXCLUSIVE / existing MYFI exclusive transaction

1. Verify target ledger identity / expected epoch.
2. Verify durable restore-stage status = READY.
3. Clear live canonical financial rows.
4. INSERT ... SELECT staged accounts → live.
5. INSERT ... SELECT staged FX → live.
6. INSERT ... SELECT staged transactions → live.
7. INSERT ... SELECT staged postings → live.
8. INSERT ... SELECT staged links → live.
9. INSERT ... SELECT staged entities/workspace state → live.
10. Replace live cold_archive rows from archive stage.
11. Preserve ledger_id.
12. Commit local restore_epoch transition/fence.
13. Initialize required new-epoch local transport metadata.
14. Record durable restore result/hash/provenance.
15. Mark stage promoted.

COMMIT
```

Only after COMMIT:

```text
read canonical SQLite
→ verify
→ rebuild bounded UI cache
```

### Required targeted refactor

`commitLedgerRestoreEpochV8()` currently opens its **own** queued exclusive transaction.

For true Phase-10 atomicity, its local CAS logic should be extracted into an internal transaction-scoped primitive conceptually such as:

```text
commitLedgerRestoreEpochTxnV8(txn, ...)
```

Then both:

```text
commitLedgerRestoreEpochV8()
```

and:

```text
promoteBackupRestore(...)
```

can reuse it.

That is a targeted extraction, not a rewrite of V8.

**Confidence: HIGH.**

---

# 12. Maintenance / Concurrency Design

Current maintenance infrastructure is good.

A maintenance request becomes blocked/pending synchronously, tasks are FIFO, and `useSyncSlice` drains in-flight sync and SQLite writers before the critical section.

The current `importBackup()` enters maintenance before even parsing the JSON.

That is safe as an initial implementation but potentially expensive.

## Must always be under the lock

```text
final precondition revalidation
sync fencing
writer quiescence
server restore-epoch handshake if required
final atomic promotion
local identity/epoch transition
post-COMMIT activation of live state
```

## Can be outside the lock

```text
file read
ZIP verification
decrypt
parse
static schema validation
canonical conversion
```

## Staging: benchmark decision

Staging is different from promotion.

Current V7 staging loops through JS commands/entities and writes rows. For large backups this can be expensive. Promotion, by contrast, can predominantly use SQLite-native:

```sql
INSERT INTO live (...)
SELECT ...
FROM stage;
```

So:

> **Do not choose “all staging inside maintenance lock” merely because it is simpler.**

Initial safe baseline may do that.

But it must be labeled:

```text
SAFE BASELINE
NOT FINAL PERFORMANCE DECISION
```

and measured.

If staging later moves outside the lock, it needs an optimistic concurrency token:

```text
expectedLedgerId
expectedRestoreEpoch
expectedLiveGeneration
```

revalidated before final promotion.

---

# 13. V7/V8 Identity and Sync Interaction

This area is substantially healthier now than the legacy backup path.

The Sync Protocol requires cloud to remain replica/transport and says sync worker stops during restore. It also defines V2 activation as bootstrap + cryptographic readback + shadow validation + atomic activation evidence.

Current Phase-9 gate demonstrates the recovery sequence:

```text
validate active V2
ensure no pending mutations
begin local restore intent
→ server advance_financial_restore_epoch_v2
→ local commitLedgerRestoreEpochV8
→ new epoch
→ full V2 bootstrap
→ readback/hash verification
→ shadow validation
→ reactivation
→ verify old epoch does not replay
```

## Phase-10 integration

For a cloud-linked same-ledger restore, the safest current architecture is:

```text
STAGE + VALIDATE
↓
maintenance lock
↓
begin durable restore intent
↓
server epoch advance
↓
ONE LOCAL SQLite TRANSACTION:
    restore financial state
    + promote archive
    + preserve ledger_id
    + commit new local restore_epoch
↓
COMMIT
↓
local restore successful
↓
V2 bootstrap / reactivation
```

### Why server advance precedes final local promotion

Network I/O should not occur inside a SQLite transaction.

If server advance succeeds but local promotion crashes before COMMIT:

```text
old local ledger remains complete
+
durable restore intent/stage remains
+
server epoch is newer
```

On restart, sync must remain fail-closed and recovery can finish the local promotion.

This is a recoverable split protocol state, not a half-financial-ledger state.

If server advance fails:

```text
abort intent
old ledger unchanged
no promotion
```

If local COMMIT succeeds but V2 bootstrap later fails:

```text
restored local ledger remains authoritative and complete
sync remains paused/recovery-required
```

Do **not** roll the financial restore back merely because Supabase bootstrap failed.

Supabase is not financial authority.

---

# 14. Cold Archive Atomicity

Current Cold Archive implementation is actually close to what Phase 10 needs.

`replaceColdArchives()`:

1. writes the entire incoming archive to a temporary namespace;
2. leaves active archive untouched while staging;
3. opens an exclusive transaction;
4. deletes active archive;
5. copies staged archive using SQL;
6. removes stage.

The missing piece is only:

> do not commit this archive promotion separately from main financial promotion.

Extract approximately:

```text
promoteColdArchiveStageTxn(txn, ...)
```

and invoke it from the **same final restore transaction** as V7 financial promotion.

This is a textbook targeted refactor.

---

# 15. Rollback / Undo Strategy

Current `restoreLastBackupRollback()` is useful but should be reclassified.

It is:

> **Recovery UX / Undo checkpoint**

not:

> **Atomicity mechanism**

Current `importBackup()` captures old state in memory, performs restore, then writes a rollback backup after successful completion.

Consequences:

* JS exception can often be handled.
* process kill cannot execute catch.
* crash after final commit but before rollback checkpoint persistence loses that Undo opportunity.

SQLite transaction must provide crash atomicity.

## Better Undo design

Before destructive promotion:

```text
canonical current SQLite
→ create validated rollback backup/stage/checkpoint
→ verify checkpoint semantic hash
```

Then promotion.

Undo itself should call the **same restore engine**, not direct overwrite.

Conceptually:

```text
Undo restore
=
Restore(previous checkpoint)
```

Therefore Undo receives all the same:

```text
staging
validation
epoch fencing
atomic promotion
post-commit verification
```

This avoids creating a second destructive code path.

---

# 16. Crash Recovery State Machine

Recommended durable states:

```text
NONE
PACKAGE_VALIDATED
STAGING
STAGED
VALIDATED
READY
EPOCH_INTENT_PENDING
SERVER_EPOCH_ADVANCED
PROMOTED_LOCAL
SYNC_RECOVERY_PENDING
COMPLETE
FAILED
ABORTED
```

A small durable restore metadata record keyed by `restoreId` is strongly recommended.

This can initially use `ledger_v7_meta`, although a dedicated restore-state table would provide cleaner lifecycle/query semantics.

## Restart rules

```text
STAGING
→ live untouched
→ discard/resume stage safely

STAGED / VALIDATED / READY
→ live untouched
→ user may resume promotion or discard

EPOCH_INTENT_PENDING + server not advanced
→ abort/retry handshake

server advanced + local old epoch
→ DO NOT sync
→ preserve stage
→ finish local promotion/epoch CAS

PROMOTED_LOCAL
→ never revert automatically
→ verify live SQLite
→ continue V2 recovery

SYNC_RECOVERY_PENDING
→ local financial success already durable
→ retry bootstrap/reactivation

COMPLETE
→ cleanup stale stage/checkpoint according to retention
```

---

# 17. Failure Matrix

| Crash/failure point                       | Durable state                            | User-visible financial state after restart | Required recovery              |
| ------------------------------------------ | ----------------------------------------- | -------------------------------------------- | -------------------------------- |
| file read                                 | old live                                 | old                                         | none                            |
| decrypt                                   | old live                                 | old                                         | report bad password/corruption  |
| parse                                     | old live                                 | old                                         | reject                          |
| schema validation                         | old live                                 | old                                         | reject                          |
| stage start                               | old live + maybe partial stage           | old                                         | remove/resume stage             |
| mid staging                               | old live + partial stage                 | old                                         | stage invalid; cleanup          |
| stage complete                            | old live + complete stage                | old                                         | validate/resume                 |
| health validation fails                   | old live                                 | old                                         | discard/quarantine stage        |
| semantic validation fails                 | old live                                 | old                                         | block restore                   |
| READY_TO_PROMOTE                          | old live + valid stage                   | old                                         | resume promotion                |
| before live delete inside txn             | old live                                 | old                                         | SQLite rollback                 |
| mid live DELETE/INSERT                    | transaction uncommitted                  | old after recovery                          | SQLite rollback                 |
| immediately before COMMIT                 | transaction uncommitted                  | old after recovery                          | SQLite rollback                 |
| immediately after COMMIT                  | new complete ledger                      | new                                         | post-commit verification        |
| after COMMIT before Zustand               | new complete SQLite, stale cache process | new after restart/read                      | reload cache                    |
| server epoch advanced before local COMMIT | old complete local + pending intent      | old; sync fenced                            | resume local promotion          |
| local promotion done before bootstrap     | new complete local                       | new                                         | keep sync paused; bootstrap     |
| during new V2 bootstrap                   | new complete local                       | new                                         | retry V2 recovery               |
| after V2 activation                       | new complete local                       | new                                         | normal operation                |

This fulfills the fundamental acceptance rule:

```text
Before final local COMMIT:
old financial ledger is complete.

After final local COMMIT:
restored financial ledger is complete.

There is no valid crash point:
half old + half new.
```

---

# 18. Performance / Memory Analysis

The current architecture has two very different costs.

## Stage ingestion

```text
decoded JSON
→ JS objects
→ canonical model
→ individual SQLite bindings/inserts
```

This is likely the expensive portion.

Current V7 stage writes commands/entities through JS in an exclusive transaction.

## Promotion

```text
stage tables / namespaces
→ live namespaces
```

can largely be SQL-native:

```sql
INSERT INTO ...
SELECT ...
```

which avoids reprocessing every financial object through JavaScript.

Therefore it is incorrect to describe a 100k restore as "100k INSERT SELECT" from source JSON.

The flow is:

```text
JSON → SQLite stage       expensive ingestion
SQLite stage → live       DB-native promotion
```

### Memory risk

`myfiFiles.js` currently:

* materializes ZIP content;
* inflates payload;
* parses JSON;
* backup v10 duplicates structured and flat collections for compatibility.

For large backups, peak JS memory may therefore materially exceed the raw file size.

A canonical format revision should avoid unnecessary duplicate in-memory representations where backward compatibility permits.

No destructive optimization should be made without device measurements.

---

# 19. Benchmark Gates

Use fixtures:

```text
1k
10k
50k
100k financial transactions
```

Measure independently:

```text
packageReadMs
decryptMs
inflateMs
parseMs
canonicalBuildMs
stageWriteMs
stageReadbackMs
semanticValidationMs
maintenanceBlockedMs
promotionTransactionMs
postCommitReadbackMs
uiReloadMs
totalRestoreMs
peakJsHeapApprox
sqliteSizeBefore
sqliteSizeStaged
sqliteSizeAfter
```

## Most important Phase-10 metric

```text
maintenanceBlockedMs
```

because it decides whether staging can safely remain under the lock.

Do not define arbitrary acceptance milliseconds in this report: the current Performance SLO specifies reliability probes but does not define a numeric Phase-10 restore lock budget.

So numeric thresholds are:

> **REQUIRES DEVICE BASELINE BEFORE CONTRACT FREEZE.**

---

# 20. Automated Test Matrix

Required automated coverage:

| Area              | Test                                            |
| ------------------ | ------------------------------------------------ |
| backup read model | SQLite canonical rows appear exactly once       |
| authority         | mutate Zustand cache only → backup unchanged    |
| authority         | mutate canonical SQLite → backup changes        |
| package           | wrong password                                  |
| package           | corrupt ciphertext                              |
| package           | truncated ZIP                                   |
| package           | manifest mismatch                               |
| format            | newer backup version                            |
| schema            | incompatible schema                             |
| identity          | same-ledger preserves `ledger_id`               |
| refs              | unknown wallet/account rejects                  |
| postings          | missing transaction rejects                     |
| FX                | missing referenced FX rejects                   |
| FX                | historical numerator/denominator preserved      |
| duplicate IDs     | rejects                                         |
| semantic hash     | deterministic order independence                |
| semantic hash     | financial difference detected                   |
| staging           | live unchanged while stage writes               |
| staging           | mid-stage exception leaves live unchanged       |
| health            | FK violation blocks promotion                   |
| promotion         | transaction rollback restores complete old live |
| archive           | archive + live promoted together                |
| cache             | no Zustand update before COMMIT                 |
| V8                | old epoch outbox never becomes current          |
| V8                | new epoch starts unactivated                    |
| V8                | bootstrap/reactivation required                 |
| restart           | post-COMMIT cache reload uses SQLite            |
| Undo              | rollback uses same restore engine               |

---

# 21. Permanent Regression Tests

## Regression Guard 1 — Canonicalization Trap

Fixture A:

```text
source representation != persisted representation
```

because of an explicitly excluded/non-financial representation field.

Expected:

```text
canonical(source)
==
canonical(staged readback)

PASS
```

A volatile presentation field such as an avatar URL is a suitable conceptual case only after its ownership semantics are formally resolved.

## Regression Guard 2 — Real financial difference

Take the same fixture and change one canonical posting:

```text
posting.amountMinor + 1
```

Expected:

```text
canonical(source)
!=
canonical(staged readback)

FAIL
```

## Regression Guard 3 — Lossy canonicalizer detection

A financial field must never disappear merely because both sides share the same transformation.

Test should enumerate all fields excluded by the semantic projection and assert they belong to an explicit exclusion contract.

This guard is especially important because the current code review demonstrated that sharing the same canonicalizer can hide genuine data loss if that canonicalizer is itself wrong.

These tests should live with the shared parity primitive, not only with Phase 10.

---

# 22. Real Device Acceptance

Minimum Android real-device matrix:

### A. Local-only restore

Only after exact local-only V8 identity policy is verified.

* backup;
* mutate ledger;
* restore;
* airplane mode;
* restart;
* semantic hash remains correct.

### B. Process kill mid-staging

Expected:

```text
old live ledger intact
partial stage ignored/cleaned
```

### C. Process kill during final promotion before COMMIT

Expected:

```text
old complete ledger
```

### D. Kill immediately after COMMIT before Zustand refresh

Expected:

```text
new complete ledger
startup reads SQLite
no stale legacy state overwrites it
```

### E. Multicurrency historical FX

Verify exact canonical:

```text
postings
FX numerator
FX denominator
rate_date
source
transaction links
```

No current-rate reinterpretation.

### F. Large restore

Run 1k/10k/50k/100k fixtures and collect all benchmark metrics.

### G. Corrupted financial reference

Expected hard failure before promotion.

### H. Canonicalization trap

Nonfinancial representation difference passes; one-minor-unit financial mutation fails.

### I. Same-ledger identity

```text
ledger_id before == ledger_id after
restore_epoch after == previous + 1
```

where V8 protocol requires the increment.

### J. Old epoch replay attack/regression

After restore:

```text
old epoch mutations cannot apply
```

### K. Restore while sync is active

Maintenance barrier must first quiesce/fence the worker.

### L. Restart after local restore before cloud reactivation

Expected:

```text
restored local data present
sync fail-closed
recovery resumes
```

### M. Undo

Undo must execute through the restore engine and produce a new valid restore transition rather than direct table overwrite.

---

# 23. Dependencies on Phase 9

There has been material progress since the earlier Phase-9 state.

Evidence dated 20 August says all original P20-G01 items were completed, including server restore-event verification and verification that the real account remained intact.

A subsequent code review then required two fixes before Phase 9 could close:

1. verify disposable-account wallet state from SQLite;
2. stop writing the ambiguous namespace-only activation-evidence key.

Both fixes are visible in the inspected current branch source.

However:

> **I did not locate newer canonical acceptance evidence proving the required post-fix CI/device rerun and an explicit Phase-9 CLOSED ruling.**

Therefore:

```text
Phase 9 formal closure:
REQUIRES ACCEPTANCE EVIDENCE VERIFICATION
```

Do not let Phase-10 production destructive restore bypass that gate.

---

# 24. Independent Phase-10 Work That Can Start Early

These are safe to develop before final Phase-9 closure because they do not enable destructive live restore:

```text
Canonical SQLite Backup Read Model

Versioned Semantic Hash Contract

Shared canonical semantic projection

Backup-format gap tests

Canonicalization permanent regression tests

Strict structural validator

Read-only backup exporter

Stage-only canonical restore writer

Stage readback validator

Benchmark harness

Restore crash-test harness infrastructure
```

What should remain Phase-9 gated:

```text
production signed-in destructive promotion
server restore-epoch handshake integration
local epoch + financial promotion final transaction
new-epoch bootstrap/reactivation acceptance
full Phase-10 release acceptance
```

---

# 25. Recommended Incremental Implementation Sequence

This is a **proposed implementation decomposition**, not an official canonical patch numbering scheme.

## Step 1 — Freeze the Canonical Backup Read Model

Implement read-only SQLite projection containing every financial authority required by the contract.

No restore changes.

**Financial data changed:** No.
**Schema changed:** No.
**Migration:** No.

---

## Step 2 — Semantic Hash Primitive

Create one versioned canonical financial projection and SHA-256 semantic hash.

Use it against:

```text
live SQLite
stage SQLite
decoded backup
```

Add canonicalization regression guards.

**Financial data changed:** No.
**Schema changed:** No.

---

## Step 3 — New Canonical Backup Writer

Make final backup export consume the SQLite read model.

Keep v10 compatibility reader if required, but don't let v10 define the new canonical ledger.

Do not silently invoke FX reconstruction for canonical exports.

**Financial data changed:** No.

---

## Step 4 — Strict Restore Decoder

Implement:

```text
backup package
→ canonical restore model
```

with zero implicit financial repair.

Legacy backup conversion becomes a separately identified compatibility adapter.

---

## Step 5 — Restore-Specific SQLite Stage

Generalize lower-level V7 writer primitives so migration and restore can share persistence code without sharing semantics.

Do not touch live namespace.

---

## Step 6 — Stage Health + Semantic Proof

Require:

```text
structural valid
FK valid
financial health valid
semantic hash exact
```

before `READY_TO_PROMOTE`.

---

## Step 7 — Extract Transaction-Scoped Promotion Primitives

Refactor:

```text
promoteFinancialWorkspaceStageV7
replaceColdArchives
commitLedgerRestoreEpochV8
```

so their low-level operations can be called with an existing `txn`.

This is probably the key structural Phase-10 patch.

---

## Step 8 — Combined Atomic Local Promotion

One transaction for:

```text
financial ledger
+
cold archive
+
restore metadata
+
local restore epoch transition
```

No Zustand modification within it.

---

## Step 9 — Post-COMMIT Canonical Reload

SQLite first, bounded cache second.

Add process-kill test immediately after COMMIT.

---

## Step 10 — Integrate Full V8 Recovery Coordinator

After formal Phase-9 closure:

```text
begin intent
→ server epoch advance
→ atomic local promotion+epoch CAS
→ bootstrap
→ verify
→ activate
```

---

## Step 11 — Undo Through Same Engine

Replace direct recovery overwrite semantics with a validated restore checkpoint fed through the standard engine.

---

## Step 12 — Performance Gate

Only after safety correctness passes:

determine whether staging remains under maintenance or is moved out with generation-token revalidation.

---

# 26. Schema Impact

## Financial schema

No redesign of canonical V7 financial tables is justified by this analysis.

The current schema already supports the required staging/promotion model.

## Restore metadata

A small Phase-10 metadata structure is recommended for durable restore state:

```text
restore_id
namespace
ledger_id
expected_restore_epoch
stage_namespace
backup_semantic_hash
state
created_at
updated_at
last_error
```

Two options:

### Minimal-change option

Use structured keys in `ledger_v7_meta`.

**Schema migration:** none.

### Cleaner long-term option

Introduce:

```text
ledger_restore_state_v8
```

or equivalent.

**Schema migration:** required, but metadata-only.

This report does **not** recommend changing financial table meaning merely to implement restore.

---

# 27. Financial Data Impact

The research itself changes **no financial data**.

For implementation:

### Backup/read/hash/staging work

```text
live financial data changed: NO
```

### Final promotion

```text
live financial data changed: YES, intentionally
```

but only at one audited atomic COMMIT.

### FX

No historical FX should be synthesized by the canonical restore.

### IDs

Same-ledger restore:

```text
ledger_id preserved
financial entity IDs preserved
transaction IDs preserved
posting/link identity preserved
```

### Cloud

Supabase failure after local commit must not invalidate local financial success.

---

# 28. Migration Impact

The most important conceptual separation is:

```text
Legacy Backup Migration
!=
Canonical Disaster-Recovery Restore
```

Legacy formats may require explicit adapters.

Those adapters may transform an old representation into the current canonical model, but must:

```text
identify source backup version
record transformation version
fail on ambiguous money/FX
produce a canonical model
validate semantic meaning
only then enter normal restore staging
```

Do not embed old-data migration repairs in the final promotion path.

Any future backup-format revision needs backward-reader coverage.

---

# 29. Recovery / Rollback Impact

The final system should have three distinct mechanisms:

### 1. SQLite transaction rollback

Protects the atomic local promotion from:

```text
exceptions
process kill
OS crash
power loss
```

This is the **safety boundary**.

### 2. Restore protocol recovery

Handles:

```text
server epoch advanced
but
local epoch/promotion not yet committed
```

using durable intent + stage.

### 3. User Undo

Uses a verified prior checkpoint and invokes the same restore engine again.

These mechanisms must not be conflated.

SQLite itself explicitly guarantees transaction all-or-nothing behavior through crashes, making it the correct financial safety primitive rather than JavaScript `try/catch`.

---

# 30. Risks and Open Decisions

## Risk 1 — Exact current branch HEAD

**Status:** REQUIRES CODE VERIFICATION.

Before implementation Claude Code must record exact branch/HEAD and compare against this inspection.

---

## Risk 2 — Phase-9 formal closure

Both mandatory source fixes appear present, but final post-fix acceptance closure was not proven by the evidence I inspected.

**Status:** REQUIRES ACCEPTANCE EVIDENCE VERIFICATION.

---

## Risk 3 — `prepareWalletData()`

Need line-by-line review before deciding which behaviors can survive in legacy import adapters.

**Status:** REQUIRES CODE VERIFICATION.

---

## Risk 4 — `avatarUri` canonicalization defect

Current source still strips `avatarUri` from persisted workspace canonical payload, and the existing review identifies this as potential user-facing data loss.

It is not inherently a financial-integrity blocker, but Phase-10 semantic code must not copy this pattern blindly.

---

## Risk 5 — Staging under maintenance

Safety is strong, UX may be poor at 50k/100k.

Decision requires real-device `maintenanceBlockedMs`.

---

## Risk 6 — Staging outside maintenance

Better performance, but unsafe unless final promotion revalidates the live generation/identity/epoch that existed when staging began.

---

## Risk 7 — Signed-in offline restore

Do **not** freeze behavior yet.

Current V8 controlled recovery advances server epoch before local epoch commit.

Therefore a cloud-linked offline restore needs a separately proven deferred-handshake design if it is to be allowed.

For now:

```text
DESIGN DECISION REQUIRES FINAL PHASE-9/V8 CONTRACT CONFIRMATION
```

---

## Risk 8 — Large backup JS memory

Current package code inflates/parses payload in JS and v10 intentionally duplicates data sections for compatibility.

Measure before optimizing.

---

## Risk 9 — Outer checksum mistaken for semantic proof

SHA-256 package verification proves:

```text
bytes are what were packaged
```

not:

```text
financial meaning is correct
```

Both are required.

---

# 31. Final Recommendation

## Final classification

> **B. Existing infrastructure is good, but restore orchestration needs targeted structural refactor.**

I do **not** recommend a Phase-10 rewrite.

The strongest existing primitives — shared SQLite, exclusive transactions, V7 stage/readback/invariant proof, SQL promotion, Cold Archive staging, maintenance fencing, V8 restore intents and epoch fencing, V2 bootstrap/activation, ZIP/SHA-256/AES-GCM — are precisely the expensive parts one would otherwise have to invent.

The refactor should center on four architectural boundaries:

```text
1. SQLite → Canonical Backup Read Model
   Zustand is removed from financial backup authority.

2. Canonical Backup Model → Strict SQLite Stage
   No financial repair or UI normalization.

3. SAME Semantic Projection
   backup model and staged/live readback use one versioned financial
   canonicalization + SHA-256 contract.

4. ONE Final SQLite Promotion Transaction
   V7 financial rows
   + Cold Archive
   + restore metadata
   + local V8 epoch transition
   commit together.
```

The target architecture is therefore:

```text
                BACKUP
                  │
Canonical SQLite read transaction
                  │
     Canonical Financial Model
                  │
    semantic_hash_version N
                  │
         existing ZIP/crypto
                  │
                FILE


                RESTORE
                  │
         verify/decrypt/parse
                  │
       strict canonical decode
                  │
          SQLite staging
                  │
    health + semantic proof
                  │
             READY
                  │
       maintenance + V8 fence
                  │
      ┌───────────────────────┐
      │ ONE SQLITE TRANSACTION│
      │                       │
      │ promote V7 ledger     │
      │ promote Cold Archive  │
      │ preserve ledger_id    │
      │ commit restore_epoch  │
      │ restore metadata      │
      └───────────┬───────────┘
                  │
                COMMIT
                  │
      canonical SQLite readback
                  │
        bounded Zustand refresh
                  │
       V2 bootstrap/reactivate
                  │
             COMPLETE
```

That design directly satisfies the acceptance invariant Phase 10 actually needs:

> **Before the final SQLite COMMIT, the old live ledger remains complete. After that COMMIT, the restored ledger is complete. There is no valid crash point at which MYFI can expose a financially half-old, half-new ledger.**

**Overall architecture confidence: HIGH.**
**Exact implementation details requiring Claude Code verification:** current branch HEAD, final Phase-9 closure evidence, `prepareWalletData()` semantics, exact extraction points inside `promoteFinancialWorkspaceStageV7()` and `commitLedgerRestoreEpochV8()`, and the final benchmark decision for staging inside vs outside maintenance.

---

# 32. Planning & Audit routing decision (2026-08-20)

- **Safe to start now, in parallel, before Phase 9 formally closes:** everything in
  §24 ("Independent Phase-10 Work That Can Start Early") — canonical SQLite
  backup read model, semantic hash primitive + regression guards, structural
  validator, benchmark harness. None of this touches live financial state.
- **Gated on Phase 9 CLOSED:** anything in §24's second list — destructive
  promotion, server epoch handshake integration, final atomic transaction,
  V2 bootstrap/reactivation on real restore, full release acceptance.
- **Verify before relying on, per standing rule (don't trust an external
  report blindly):** exact current branch HEAD, `prepareWalletData()`
  behavior, and the exact extraction points in
  `promoteFinancialWorkspaceStageV7()` / `commitLedgerRestoreEpochV8()`
  (Risks 1, 3, and the Step 7 extraction described above).
- Follow the Step 1→12 sequence in §25 in order; each step states its own
  financial/schema impact — don't skip ahead to destructive steps.
