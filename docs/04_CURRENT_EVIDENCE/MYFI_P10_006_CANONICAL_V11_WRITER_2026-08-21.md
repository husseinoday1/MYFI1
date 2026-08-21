# MYFI — P10-006: canonical V11 logical backup writer

**Recorded:** 2026-08-21T10:19:00+03:00  
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**Starting SHA:** `10e72514c68fdb33f3ea41e977d1826e0c2bfb49`  
**Runtime / schema:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite V8/V7.  
**Data/schema/cloud impact:** none. The new writer is not connected to Settings, ZIP sharing, import, restore, or Supabase.

## Result

`src/lib/financialBackupV11.js` creates an internal logical document:

- format: `MYFI_CANONICAL_LEDGER_BACKUP`;
- data version: `11`;
- semantic proof: SHA-256 / semantic version 2;
- manifest: ledger id, created-at, and counts for every canonical collection;
- data: the exact V2 canonical document, sourced only from canonical SQLite through
  `readCanonicalBackupSource()`.

The writer fails closed if SQLite is unavailable, the canonical source is invalid,
the V7 cutover is incomplete, or the ledger identity is absent. It does not fall back
to the Zustand cache or legacy V10 data.

## Intentionally unchanged

The user-visible export flow remains V10. The V11 result is not written to disk,
encrypted, shared, or offered for import. That boundary stays until P10-007 supplies
a strict paired decoder and P10-008 proves isolated staging. A public backup format
must never be exposed before the product can prove safe restore.

## Verification

`tests/run-p10-006-canonical-backup-writer.cjs` proves manifest construction,
canonical-source-only provenance, and each fail-closed eligibility path. It is part
of the standard quality gate.

`npm.cmd run test:gate`: **95 passed, 0 failed, 11 environment-dependent skips.**  
`git diff --check`: passed.

## Next step

P10-007: strict V11 decoder and isolated adapters for old V1–V10 backups. No restore
operation is enabled by this writer.
