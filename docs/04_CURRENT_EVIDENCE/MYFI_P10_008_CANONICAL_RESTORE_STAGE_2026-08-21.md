# MYFI — P10-008: isolated canonical V11 restore stage

**Recorded:** 2026-08-21T10:46:00+03:00  
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**Starting SHA:** `4f74f7c5b04df41971aee19885254f54040ce53f`  
**Runtime / schema:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite V8/V7.  
**Data/schema/cloud impact:** no schema change, no cloud call, and no live namespace write. The code is not wired to Settings, ZIP import, backup export, app startup, sync, or promotion.

## Delivered

`financialRestoreStageV11.js` accepts only a successfully strict-decoded V11 document
and a namespace generated in the separate form:

`<live namespace>::restore-stage::<unique suffix>`

It writes hot-ledger rows and Cold Archive rows directly to that namespace, then reads
only that namespace back and requires all of the following before it returns `ok`:

1. structural validation;
2. SQLite foreign-key/invariant health;
3. V2 semantic hash equality with the decoded manifest; and
4. independent V11 manifest counts.

If a proof fails, the temporary stage is discarded. Its cleanup API refuses a live
namespace by shape, so it cannot be pointed at the active ledger accidentally.

## Fail-closed data policy

- The stage does not call command builders, wallet/default normalizers, FX repair, or
  UI import helpers.
- Required V7 storage fields (including idempotency keys, timestamps, source fields,
  and stored device provenance) must be present. A missing value is refused before a
  stage write; it is never generated.
- Currency definitions are global static application reference data. P10-008 reads
  their presence but deliberately does not insert or update them during staging. A
  missing referenced currency fails closed rather than leaving a shared-table change.
- Cold Archive search/index columns are deterministic local indexes derived from the
  already-backed-up payload. `payload_json` is preserved and is covered by the V2
  semantic proof; no financial amount, account, or FX value is inferred.

## Verification

`tests/run-p10-008-canonical-restore-stage.cjs` proves:

- direct rows go only to a distinct restore-stage namespace;
- stored idempotency and device provenance are passed directly to SQLite;
- missing storage values fail before any write;
- cleanup refuses a live namespace; and
- forbidden migration/UI repair helpers are absent.

`npm.cmd run test:gate`: **97 passed, 0 failed, 11 environment-dependent skips.**  
`git diff --check`: passed.

## Deliberate remaining boundary

This is a verified **temporary** area, not a user-visible restore. It does not replace
the live ledger, advance a restore epoch, alter any outbox or sync state, reload
Zustand/UI cache, or call Supabase. Those remain P10-009 through P10-012. A physical
device fault-injection and performance acceptance run remains P10-014.
