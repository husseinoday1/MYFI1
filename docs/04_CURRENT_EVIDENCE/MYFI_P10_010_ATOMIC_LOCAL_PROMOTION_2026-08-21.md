# MYFI — P10-010: combined atomic local promotion

**Recorded:** 2026-08-21T13:27:36+03:00
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`
**Verified remote/HEAD:** `f39a75179004dc408c93a8e7f408d16db073c12a`
**Freshness check:** `git fetch --all` completed at 2026-08-21T13:27:36+03:00; `origin/impl/p20-g01-acceptance-apk-2026-08-19` still resolves to the SHA above.
**Working state:** this evidence describes the local, uncommitted P10-010 patch atop that SHA. It is **not accepted or pushed** yet.
**Runtime / schema:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite V8 / ledger model V7.
**Data/schema/cloud impact:** no device database was opened, no user data changed, no SQLite migration/table meaning changed, and no Supabase request/schema/data operation occurred.

## Delivered locally for review

`promoteCanonicalRestoreStageV11()` performs exactly one transaction through the
reviewed P10-009 runner. It performs, in order:

1. validates the private restore-stage namespace, its P10-008 READY record, active
   immutable ledger ID, proven semantic hash/counts, local restore intent, and epoch
   successor before deleting any live rows;
2. replaces the live V7 financial graph from the stage;
3. replaces the live Cold Archive from that same stage;
4. writes the live workspace state and a durable namespaced promotion state record;
5. performs the existing V8 local epoch compare-and-swap; and
6. removes the consumed stage and its READY record inside the same transaction.

Old V2/V3 outbox and inbox rows are deliberately untouched. The new epoch fences
their replay; the operation does not delete evidence ad hoc.

P10-008 now writes a small READY record in existing `ledger_v7_meta` after its
semantic/invariant proof. It contains only the stage namespace, ledger ID, semantic
hash, counts, validator version and time — no transaction payload, amount or balance.
P10-010 reads it from inside the final transaction. Abandoning or consuming a stage
deletes that record with the stage rows.

The workspace merge overlays only the reviewed financial configuration allowlist
(`currency`) from the backup. Existing device-local language, theme, privacy,
notifications and presentation preferences remain on the restoring phone.

## Operational fault-injection evidence

`tests/run-p10-010-atomic-local-promotion.cjs` compiles the actual P10-009 runner,
its actual hot-ledger SQL primitives, actual Cold Archive primitives, and the actual
P10-010 orchestration against a real in-memory SQLite database. Imports unrelated to
the transaction are replaced only with test adapters; the promotion SQL itself is
executed, not text-matched.

The fixture includes an old hot ledger, old archive, READY stage, pending local
restore intent, V8 identity/epoch, V2/V3 outbox and inbox evidence, and local device
preferences. It injects a throw at each boundary:

- before live clear;
- after live clear;
- after hot copy;
- after archive replacement;
- after workspace-state write;
- after durable restore metadata write;
- after epoch CAS; and
- after stage cleanup.

For every injected failure it compares the complete SQLite state before and after,
including hot financial tables, Cold Archive, `ledger_v7_meta`, V8 identity/sync
state, and V2/V3 outbox/inbox. Every comparison is equal: no mixed ledger/archive/
metadata/epoch state remains. A forged READY proof also fails before any mutation.

The success case proves the new hot ledger, new archive, durable restore state and
epoch commit together, preserves old V2/V3 transport evidence, preserves local
language/theme while overlaying only currency, and then runs a second sequential
promotion (epoch 7→8 then 8→9).

## Verification

- `node tests/run-p10-008-canonical-restore-stage.cjs`: PASS.
- `node tests/run-p10-009-transaction-primitives.cjs`: PASS.
- `node tests/run-p10-010-atomic-local-promotion.cjs`: PASS.
- `npm.cmd run test:gate`: **100 passed, 0 failed, 11 environment-dependent skips**.
- `git diff --check`: PASS.

## Deliberate non-claims / remaining gate

This patch is not wired to Settings, ZIP import, maintenance UI, Zustand reload,
device acceptance or cloud recovery. Those remain P10-011/P10-012 work. In
particular, P10-010 is **not closed** until independent review, a clean pre-push
review, push and a confirmed green CI run. No APK or device test is requested by this
local transaction proof.
