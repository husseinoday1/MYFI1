# MYFI — P10-007A: strict V11 logical decoder

**Recorded:** 2026-08-21T10:23:00+03:00  
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**Starting SHA:** `2883d52b5da3e1e9b8e4c06efb8cacec5851954d`  
**Runtime / schema:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite V8/V7.  
**Data/schema/cloud impact:** none. No import route, SQLite write, file access, or Supabase access changed.

## Result

`decodeCanonicalBackupV11()` accepts an already-parsed V11 logical document only
when all of these pass:

1. exact document kind, V11 format/version, semantic version/algorithm, timestamp,
   ledger id and manifest shape;
2. exact Semantic Hash V2 recomputation;
3. exact collection count manifest (key order is irrelevant; unknown/missing keys
   are refused);
4. the existing pure structural financial validator.

It never normalizes, creates defaults, maps wallets by name, repairs FX, or calls UI
helpers. Refused results contain safe codes and count-key names only—never a record,
note, amount, or balance.

## Important scope limit

This is **P10-007A**, not the full public legacy-import replacement. It is the strict
paired decoder for the newly introduced internal V11 document. Existing V1–V10
imports and the Settings import button remain untouched and therefore cannot reach
this decoder yet. Their isolated compatibility adapters are a later, separately
reviewed substep; they must not be silently routed into V11.

## Verification

`tests/run-p10-007-canonical-backup-decoder.cjs` covers valid V11, wrong kind/version,
malformed manifest hash, semantic tamper, count tamper, structural failure, and
diagnostic privacy. It is included in the quality gate.

`npm.cmd run test:gate`: **96 passed, 0 failed, 11 environment-dependent skips.**  
`git diff --check`: passed.

## Next step

P10-008: restore-specific SQLite staging. It must write to a unique stage namespace,
read it back through the canonical reader, prove V2 equality/invariants, and leave the
live namespace untouched on every failure.
