# MYFI — Phase 10 execution audit and gated plan

**Verified at:** 2026-08-21T10:00:01+03:00  
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**HEAD:** `1192e6ac7ef275b82cd9acabf3e846f087ca89f9`  
**Working tree:** clean  
**Remote freshness check:** `git fetch --all` completed before this report. The fetched implementation branch remains behind this local branch; no newer remote implementation branch was found that needs reconciliation before planning.  
**Runtime:** Expo `~54.0.36`; React Native `0.81.5`; `expo-sqlite ~16.0.10`.  
**SQLite:** financial schema V8; financial ledger model V7.  
**Scope:** planning/audit only. No financial data, SQLite schema, Supabase schema/data, migration, APK, push, or release was changed.

## Executive decision

Phase 10 should proceed as a **targeted refactor**, not a rewrite. The low-level pieces already exist: one native SQLite database, writer serialization, V7 staging/promotion, V8 ledger identity/restore epoch, Cold Archive tables, ZIP/package integrity, and AES-GCM/PBKDF2.

However, the current user-facing export/import path is not yet a Phase-10 restore engine. It reads/writes legacy/Zustand-shaped state, exposes restored UI cache before durable promotion, and promotes Cold Archive separately from the ledger. It cannot be declared atomic or crash-safe.

The governing invariant is:

> Before final SQLite `COMMIT`, the old ledger is complete. After it, the restored ledger is complete. No crash may expose a half-old/half-new financial ledger.

## Authority and fixed boundaries

- SQLite remains the only financial authority. Zustand is a bounded UI cache; Supabase is transport/auth/replication only.
- Same-ledger restore preserves `ledger_id`, entity IDs, transaction IDs, posting/link IDs, historical FX, and financial meaning.
- Unknown wallet/account/FX/transaction references fail closed. No default-wallet repair, FX synthesis, or silent normalization is legal in canonical restore.
- Restore is not import-as-new-ledger. That product mode stays unavailable until multi-ledger support actually exists.
- Cloud-linked destructive restore remains interlocked and fail-closed until the later V8/Phase-9-gated coordinator is implemented and accepted. Offline signed-in restore is not enabled by this plan.
- Normal sync must pause for restore/migration/cutover; it must not overwrite either side automatically after a restore.

## Actual baseline: completed versus not completed

| Work package | Actual status | Audit result |
|---|---|---|
| Canonical SQLite read model (`financialBackupV2.js`) | Implemented | Good foundation, but cannot yet be trusted as an isolated snapshot; see P10-004R below. |
| Semantic SHA-256 projection V1 | Implemented | Useful regression primitive, but incomplete for final backup proof: workspace payload/config and most archive content are not included. Do not publish a canonical backup writer on it. |
| Structural restore validator | Implemented | Pure, fail-closed preflight; it is not a complete package decoder or a stage writer. |
| Consistent-read patch P10-004 | Implemented but **not accepted** | It uses Expo `withTransactionAsync`; Expo documents that unrelated async queries can enter that transaction. This invalidates the claimed isolated snapshot guarantee. |
| Canonical backup writer | Not implemented | Current `exportBackup()` still builds v10 from Zustand/legacy collections. |
| Strict canonical decoder + explicit legacy adapter | Not implemented | Current `importBackup()` parses legacy v10 and uses UI/migration normalization. |
| Restore-only SQLite stage | Not implemented | Existing stage writes legacy commands, not an exact canonical backup model. |
| Stage health + semantic equality proof | Not implemented | Validator exists, but no decoded→stage→readback proof pipeline. |
| One combined ledger + Cold Archive + epoch promotion | Not implemented | Current archive replacement and V7 promotion are separate commits. |
| Post-commit canonical reload/crash proof | Not implemented | Current restore mutates Zustand before durable cutover. |
| V8/server recovery coordinator | Not implemented | Existing intent/epoch primitives each own their own transaction and cannot yet join one final local transaction. |
| Undo through the same engine | Not implemented | Current rollback checkpoint is useful UX but not the atomic restore protocol. |
| Performance gate | Partial | Harness exists; its first device run hit an Android heap OOM while materializing rows only to count them. That was fixed locally, but a CI-built diagnostic APK has not re-measured it. |

## Newly verified blocking defect: P10-004R

`runLedgerReadTransaction()` currently uses `withTransactionAsync()`. Expo explicitly warns that an async query outside that callback can still run inside the active transaction; it recommends `withExclusiveTransactionAsync()` when ordering/isolation matters. Therefore the current test double proves its own fake transaction, not the native Expo guarantee.

This matters because a backup semantic hash over a torn or contaminated read can certify a ledger that never existed at one point in time. P10-004R is a required repair before the canonical writer.

Required repair:

1. Add a native-only exclusive read snapshot primitive using `withExclusiveTransactionAsync()` and pass the provided `txn` object to **every** query.
2. Refactor Cold Archive read helpers to accept that exact transaction handle; no helper may silently reopen/use the ambient database while a canonical read is in progress.
3. Fail closed on unsupported platforms rather than silently falling back to a non-isolated canonical export.
4. Add a native-behavior regression test showing that an outside async write cannot contaminate the canonical snapshot, and run the scenario twice consecutively.
5. Measure the exclusive-read blocking time in the Phase-10 device harness; it is a safety choice first and an UX cost to measure, not guess.

Expo documentation: <https://docs.expo.dev/versions/v55.0.0/sdk/sqlite/>. SQLite WAL provides a stable snapshot only for a real read transaction: <https://www.sqlite.org/isolation.html>.

## Newly verified proof gap: semantic hash V1

V1 correctly catches changes in many live rows, but its canonical archive representation reduces each archived transaction to IDs and a small amount subset. It also receives workspace `payloadJson` without parsing/canonicalizing the relevant financial configuration. A changed archived date, wallet/category relationship, historical FX field, user record field, or workspace financial configuration can therefore escape the final proof.

Do not mutate an already-versioned V1 definition. Create **semantic hash V2** before the canonical package writer, retain V1 only for existing historical diagnostics, and explicitly include every field the canonical backup promises to preserve. The V2 field policy must be documented and tested: excluded fields are only transport/package metadata and strictly device-local presentation data; user-entered financial record content and archived financial truth remain covered.

## Execution sequence

### P10-004R — repair the read-snapshot foundation

**Scope:** `ledgerDatabase`, canonical backup reader, Cold Archive read adapter, tests.  
**Financial/schema/cloud impact:** none.  
**Exit gate:** native exclusive snapshot proven under attempted concurrent async activity, twice sequentially; no raw financial values in diagnostics.

### P10-005 — semantic hash V2 and complete canonical model

**Scope:** canonical projection V2, financial workspace payload parser/allowlist, full canonical Cold Archive representation, regression fixtures.  
**Financial/schema/cloud impact:** none.  
**Exit gate:** one-unit, ID, tombstone, archive field, FX, financial-config and user-entered record-field changes all alter V2; order-only changes do not. V1 remains readable for old diagnostics.

### P10-006 — canonical backup package writer

**Scope:** a new versioned canonical package (recommended next format generation: v11), manifest, semantic hash V2, existing ZIP/encryption writer integration.  
**Financial/schema/cloud impact:** none.  
**Rules:** source only from the canonical SQLite model; no Zustand, `repairFrozenFx()`, or legacy checksum as final proof. Refuse missing ledger identity, incomplete cutover, invalid health, or unresolved required FX. Existing v10 stays a compatibility reader, not the new authority.  
**Exit gate:** export→decode equality from SQLite, including archived rows; corruption/wrong-password/truncation/tamper tests remain green.

### P10-007 — strict decoder and isolated legacy adapter

**Scope:** `decodeCanonicalBackupV11()` plus separately named v1–v10 compatibility adapters.  
**Financial/schema/cloud impact:** none.  
**Rules:** bounded parsing before allocation; exact version/manifest/hash checks; structural validator; no UI normalization helpers. A legacy adapter must declare its source version and transformation version, reject ambiguous money/FX, and produce the canonical model before the normal path starts.  
**Exit gate:** malformed/cross-version/unknown-reference fixtures fail with safe codes and identifiers only; no amount/balance reaches logs.

### P10-008 — restore-specific SQLite stage and proof

**Scope:** direct canonical row writer to a unique stage namespace plus explicit Cold Archive stage.  
**Financial/schema/cloud impact:** stage data only; live namespace unchanged.  
**Rules:** reuse low-level SQL primitives where safe, but never migration semantics (`prepareWalletData`, default creation, inferred relationships, synthetic FX).  
**Exit gate:** decoded model → stage → canonical readback passes FK check, financial invariants, archive coverage, semantic hash V2, and independent metrics. Every intentional defect fails before READY.

### P10-009 — transaction-scoped promotion primitives

**Scope:** extract no-queue/no-transaction-inside helpers from V7 promotion, Cold Archive replacement, and V8 restore-epoch commit.  
**Financial/schema impact:** no changed table meaning; initial restore metadata should use namespaced `ledger_v7_meta` records to avoid an unnecessary migration.  
**Exit gate:** helpers are callable only through one reviewed exclusive transaction; every epoch/counter test runs two consecutive advances.

### P10-010 — combined atomic local promotion

**Scope:** one final SQLite transaction containing live V7 promotion, Cold Archive promotion, restore metadata/state, and local V8 epoch CAS. Zustand is untouched inside it.  
**Financial impact:** intentional replacement of the live ledger only at this one commit.  
**Cloud impact:** none at this stage.  
**Exit gate:** fault injection before every promotion boundary leaves the old complete ledger; after commit leaves the new complete ledger; never a mixed archive/ledger/epoch state. Preserve old outbox/inbox evidence and let epoch fencing—not ad-hoc deletion—prevent old replay.

### P10-011 — post-commit reload and crash recovery

**Scope:** canonical read reload after commit, bounded UI cache refresh, durable restore state, process-kill acceptance harness.  
**Financial impact:** no extra mutation after the promotion commit.  
**Exit gate:** kill immediately after COMMIT then reopen: canonical SQLite is complete, UI reload matches it, sync remains paused/reconciliation-required.

### P10-012 — cloud-linked recovery coordinator (gated)

**Prerequisite:** Phase-9 conditional closure and its V2 acceptance conditions remain satisfied; dedicated user authorization is required before any live Supabase test or schema/data operation.  
**Sequence:** local intent → server restore-epoch CAS → combined local promotion/epoch CAS → V2 bootstrap → server readback/hash verification → quiescent pass → activation.  
**Rule:** a cloud failure after local commit does not invalidate the local restore; it leaves a durable, visible recovery state. No automatic V1 fallback.

### P10-013 — undo through the same engine

**Scope:** create a verified pre-restore checkpoint and run it through P10-007 to P10-012, not direct overwrite.  
**Exit gate:** undo is a new restore epoch and has the same crash/fault/twice-sequential evidence as restore.

### P10-014 — performance and device acceptance gate

**Prerequisite:** correctness gates above complete.  
**Device path:** only a CI-built diagnostic APK is acceptance evidence.  
**Measure:** 1k, 10k, 50k, 100k records; memory high-water; stage duration; maintenance-block duration; final promotion duration; export/import size; cancellation; low storage; DB busy; app-kill locations.  
**Decision:** retain staging inside the maintenance fence unless measured evidence plus generation/identity/epoch revalidation proves an outside-fence design equally safe. Do not optimize based on the current unmeasured OOM fix.

## Decisions intentionally reserved for Planning & Audit / user review

These do not block P10-004R through P10-008, but they must be written down before final promotion:

1. Confirm v11 as the public canonical package version and the exact backward-reader support window.
2. Confirm the initial metadata-only `ledger_v7_meta` approach versus a later dedicated `ledger_restore_state_v8` migration.
3. Confirm whether cloud-linked offline restore is permanently disallowed for this release (recommended default: disallow/fail closed).
4. Approve the final P10-012 disposable-account device matrix before any cloud interaction is performed.

## Required acceptance matrix

- Correct password, wrong password, tampered/truncated/corrupt package, and package-size limits.
- Canonical V11 round trip with full hot ledger and Cold Archive coverage.
- Legacy version adapter fixtures; reject an unsupported/newer/ambiguous source.
- Unknown wallet/account/transaction/FX/link references; duplicate IDs; invalid minor units; invalid dates; FK violations.
- One-unit semantic changes across live and archived data, order-only changes, and two consecutive semantic/epoch operations.
- Restore while sync requested; restore while writer queue busy; restart before/after each critical boundary.
- Same-ledger ID/FX/tombstone preservation, no invented data, and no raw financial diagnostics.
- CI green by run ID after every pushed patch; device acceptance only from the CI artifact.

## Relationship to current sync UX work

The 2026-08-21 quiet-sync patch is compatible: routine sync is silent, while restore/migration/cutover owns an exclusive visible maintenance fence. Phase 10 must use that fence only for operations that can change financial truth; it must not reintroduce a tree-unmount or routine-sync flash.

## Current recommendation

Start with **P10-004R**, not the package writer. It is local, reversible, does not change any financial row or cloud state, and repairs the evidence foundation every later Phase-10 step relies on.
