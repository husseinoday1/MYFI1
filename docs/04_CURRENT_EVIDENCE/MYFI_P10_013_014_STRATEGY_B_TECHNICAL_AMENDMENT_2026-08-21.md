# MYFI — P10-013/014 Strategy B technical amendment

**Status:** DESIGN ONLY. This is not an implementation, a runtime wiring approval,
a schema migration, a device action, or a Supabase operation.

**Verified branch:** `impl/p20-g01-acceptance-apk-2026-08-19`
**Verified HEAD:** `f921af691366e3f252b136f03624a51f35007ea2`
**Verified at:** 2026-08-21 18:42:01 +03:00
**Working tree before this document:** clean. `git fetch --all --prune` completed
before verification; local and `origin/impl/p20-g01-acceptance-apk-2026-08-19`
were `0/0`.
**Runtime baseline:** Expo `~54.0.36`, React Native `0.81.5`, expo-sqlite
`~16.0.10`, SQLite financial schema V8 with ledger model V7.

This supplements—not rewrites—
`MYFI_P10_013_BOUNDED_MEMORY_UNDO_DESIGN_2026-08-21.md` and the user-approved
`MYFI_P10_STRATEGY_B_DECISION_2026-08-21.md`. Where those documents imply that
incoming staging or the Undo checkpoint must be built under a long maintenance
fence, this amendment governs.

## 0. Mandatory semantic-ordering blocker before P10-013A

P10-013A must not start until the current semantic ordering is corrected and
its version compatibility is decided. `financialSemanticProjection.js` uses
default `localeCompare()` for record IDs, archive keys and entity keys. The
ECMAScript Internationalization specification makes that a locale-sensitive,
implementation-defined comparison. The same financial rows can therefore
produce different V2 canonical byte streams on devices with different locale
data or defaults.

This makes an exact bounded implementation of the current V2 byte stream an
unsafe target for H1. It also means that replacing the comparator in place is
not a harmless bug fix: it changes V2's hash inputs and can make a previously
written V2 package fail its manifest verification.

The required sequence is:

1. Do **not** silently redefine V2.
2. Submit and review a versioned deterministic semantic-order policy, expected
   to be semantic hash V3: an explicit UTF-8 byte-lexicographic comparator for
   every ordered financial key and JSON-object key. It must not call
   `localeCompare`, `Intl.Collator`, or use a host/UI locale.
3. Bind that policy/version into a new package manifest and every local proof
   record. The legacy V2 compatibility path has only two real choices, to be
   decided when that path is built: (a) recompute with the restore device's
   current locale and accept that a sound old package can rarely fail closed;
   or (b) stop treating V2's semantic hash as proof and rely on explicit
   structural validation instead. A newly calculated V3 digest is never proof
   for the contents of an old V2 manifest.
4. Prove the new ordering with Arabic, combining marks, Latin accents, case
   variants, supplementary-plane characters, archive/entity compound keys and
   randomized physical input order. Run the identical fixture in at least two
   isolated locale environments and require identical canonical bytes and hash.
5. Add a regression guard that fails if the semantic projection's ordered paths
   call `localeCompare` or a locale-aware collator.

The unavoidable legacy-V2 question is a compatibility decision, not an
implementation shortcut: old manifests do not record the locale/collation that
produced their V2 hash. The compatibility choice is deliberately deferred until
that actual restore path is built. A new V3 writer does not retroactively make
an old V2 proof portable.

## 0.1 Re-read of the 100k work budget

Strategy B removes the long *lock*, not the long user-visible preparation. The
device evidence measured about 200.06 seconds for stage writing and 90.66
seconds for one current JS `canonicalBuild` at 100,000 transactions. The
current V11 chain performs full canonical work more than once (source build,
stage readback and post-commit recovery), so P10-013 must not treat 91 seconds
as a one-off cost.

After the ordering/version decision, P10-013A is therefore a bounded streaming
proof-and-timing spike, not only a hash-parity test. It must account separately
for every required source proof, stage proof, checkpoint proof and post-commit
proof; identify and eliminate duplicate full projections; report cancellable,
throttled progress; and demonstrate a non-linear-memory envelope. No one may
call the final B design acceptable merely because its maintenance lock is short.

## 1. Adopted strategy: B only

There is one production path at every size:

```text
prepare private stage + verified Undo checkpoint without a maintenance lock
→ acquire short maintenance fence
→ revalidate immutable identity + epoch + live generation
→ P10-012 epoch handshake + P10-010 atomic promotion
→ reload/recovery
```

There is no A/B threshold and no small-ledger exception. Two operational paths
would create two correctness surfaces; the rare one would decay without evidence.

The real-device benchmark at 100,000 transactions is the decision evidence:

| Work | Strategy A lock | Strategy B lock contribution |
|---|---:|---:|
| Stage write + readback | 200.09 s | outside the lock |
| Final SQL promotion | included | 8.45 s |
| Full measured blocked lower bound | 208.54 s | promotion plus epoch handshake |

The 8.45 seconds is **not** a promised production lock budget: the benchmark
excluded the epoch handshake and did not measure a bounded checkpoint. P10-014
must measure the complete B fence before a budget is approved.

## 2. The non-negotiable safety mechanism: a local live-generation token

`ledger_outbox_v3.sequence_id`, row counts, `updated_at`, and sync cursors are
not accepted as a substitute. They are not a proven complete record of every
way the active financial ledger can change.

P10-013 therefore needs one namespace-scoped, monotonic **live-generation token**
stored in `ledger_v7_meta` (so this proposal itself needs no schema migration).
Its durable value binds at least:

```text
namespace
ledgerId
restoreEpoch
generation (non-negative integer)
tokenVersion
```

The counter is advanced in the *same SQLite transaction* as every successful
mutation of the active financial truth or its restore identity. That includes,
at minimum:

- local financial commands, replacement, void and archive commands;
- entity/account/rate/workspace financial changes;
- V2 remote-apply and any reconciliation path allowed to mutate financial rows;
- active-ledger clear/promote and a local restore-epoch change.

Cold Archive writes are a separate mandatory write surface, not covered by the
financial command bullet. `storeColdArchiveYear`, `storeColdArchiveYears`,
`clearColdArchives` and `replaceColdArchives` in `localArchiveRepository.js`
must each advance the matching active namespace generation in the **same SQLite
transaction** as their archive mutation. They currently have no direct
`ledger_v7_meta` access, so P10-013 implementation must first give them a
transactional repository dependency or an equivalent transaction-scoped
generation adapter. A follow-up write after an archive helper returns is not
acceptable: a crash between the two would leave changed financial truth with an
unchanged token.

Private restore stages and checkpoint namespaces never advance the active token.
Failed/rolled-back transactions do not advance it. A missing, malformed,
wrong-namespace, wrong-ledger or wrong-epoch token is a fail-closed error—not a
reason to initialise one silently during promotion.

Before implementation, P10-013 must audit every active-namespace write entry
point and put the increment inside the existing transaction. The audit needs a
runtime test that exercises each class, not a search-only claim. Until that test
proves coverage, Strategy B remains isolated and cannot be wired to a live
restore action.

## 3. B protocol: preparation without loss of concurrent work

### 3.1 Start snapshot

At the restore operation start, in one brief serialized read/metadata operation,
capture and persist:

```text
operationId
namespace
ledgerId
restoreEpoch
sourceLiveGeneration
incoming package/stage identity and proof version
```

This is a snapshot *identity*, not a copy of financial values. It becomes the
only generation allowed to promote this restore.

### 3.2 Unlocked preparation

Outside the maintenance fence, and with bounded cursor batches only:

1. validate and prove the incoming backup into a private stage;
2. copy/prove the current live hot ledger and Cold Archive into a private Undo
   checkpoint, with every cursor/state transition durable;
3. bind the checkpoint and the stage-ready record to `sourceLiveGeneration`,
   ledger ID, epoch, semantic-hash version and exact counts/proofs.

If the user or sync writes during that work, preparation may finish but is no
longer promotable. It is private, so this never changes the active ledger. A
restart may resume a batch only while the persisted token still equals the live
token; otherwise it marks the private operation `ABORTED_STALE` and starts again
only on explicit retry.

The semantic hash remains subject to P10-013 H1/H2: exact bounded V2 parity, or
a separately approved V3. A generation token proves freshness; it never replaces
financial/semantic proof.

### 3.3 Short fenced promotion

Only after both private artifacts are `READY` does the coordinator acquire the
visible maintenance fence, pause sync/recurring work and drain the financial
writer queue. Inside the serialized promotion boundary it must, before any
server epoch call:

1. re-read live namespace, ledger ID, restore epoch and live generation;
2. require exact equality with the start snapshot and both READY manifests;
3. on any mismatch, release the fence, retain only safe diagnostic identifiers,
   mark private material stale/garbage-collectable, and report a retriable
   `restore_source_changed` result;
4. only on equality, run the existing proof-bound P10-012 epoch sequence and
   P10-010 single atomic local promotion, including the Undo-pointer swap;
5. advance the live generation in the same local transaction as promotion and
   epoch CAS, then hand off to the existing P10-011 recovery/reload rules.

No remote epoch mutation is permitted before step 2. Thus a stale prepared
restore is rejected before it can create a cloud-side recovery obligation.
Cancellation remains available before the epoch sequence starts; after it starts,
P10-012's durable recovery contract owns completion.

## 4. Failure and crash boundaries

| Moment | Required result |
|---|---|
| Process dies during unlocked stage/checkpoint batch | Active ledger unchanged; a partial private namespace is not READY and can only resume with the exact token. |
| Local/remote financial write during preparation | Generation mismatch; no epoch call, no promotion, no merge; retry starts fresh. |
| Invalid/missing generation metadata | Fail closed before remote epoch call. |
| Fault inside P10-010 transaction | Current P10-010 atomicity remains: ledger, archive, pointer, epoch and generation are all old or all new. |
| Crash after server epoch advance | Existing P10-012/P10-011 recovery path applies; it must bind the new generation and never replay a stale stage. |

The implementation must not show a generic black/splash “maintenance” screen for
unlocked preparation. It may report bounded, throttled progress, but financial
writes stay available until the short final fence begins.

## 5. Required P10-013 tests before any live caller

1. **Coverage test:** each active write class advances exactly one matching
   generation in its successful transaction; failed and private-stage writes do not.
2. **Mid-preparation local write:** capture token, mutate the live ledger, then
   finish a valid stage/checkpoint. Promotion refuses before the epoch RPC/adapter.
3. **Mid-preparation remote apply:** inject an allowed V2 apply and prove the same
   refusal; outbox sequence alone must not be the asserted mechanism.
4. **Two sequential operations:** restore/Undo/reverse-Undo advances generation and
   epoch coherently on both runs, satisfying the standing stateful-counter rule.
5. **Fault matrix:** inject failure before/after each batch cursor commit, before
   generation revalidation, before epoch dispatch and at every P10-010 fault point.
   Assert hot ledger, Cold Archive, restore metadata, Undo pointer, epoch and
   generation are each wholly old or wholly new.
6. **No raw financial diagnostics:** progress/failure evidence contains IDs,
   counts, state and timings only—never rows, amounts, balances, titles or notes.

## 6. P10-014 acceptance: B at all tiers

The device gate must use a CI-built diagnostic APK and measure B—not compare or
select a threshold—with independent 1k/10k/50k/100k outcomes:

- private incoming staging, checkpoint construction and proof time;
- total final-fence time, separated into writer drain, revalidation, epoch
  handshake and single atomic promotion;
- JS/Hermes, Java/native and RSS high-water; peak memory must remain bounded by
  batch policy rather than total row count;
- an injected user write and V2 apply during preparation, each rejected safely;
- cancellation and foreground process kill at the worst unlocked batch and at
  the final locked boundary;
- restart/recovery, low storage and SQLite busy behavior.

The acceptance criterion is not “8.45 seconds again.” It is: the complete B
fence has a predeclared, user-reviewed limit after the epoch handshake is
measured; it has no linear JavaScript-memory growth; and no concurrent financial
change is overwritten. If any condition fails, Phase 10 stays blocked—do not
reintroduce Strategy A or a threshold silently.

## 7. Scope and review boundary

- This amendment changes no code, database, migration, device build or Supabase
  state.
- `src/dev/phase10RestoreBenchmarkHarness.js` remains Implementation 2-owned.
- P10-011's known idempotent-race and P10-012's PostgreSQL runtime gate remain
  pre-wiring blockers.
- Every P10-013 implementation slice remains isolated from `App.js`,
  `dataSlice.js` and `SettingsScreen.js` until all review and device gates close.
- Implementation 2 must review this design and every later patch before commit/
  push; clean code review and confirmed green CI remain required.
