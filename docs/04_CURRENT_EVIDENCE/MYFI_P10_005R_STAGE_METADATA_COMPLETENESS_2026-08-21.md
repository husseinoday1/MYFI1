# MYFI — P10-005R: canonical stage metadata completeness

**Recorded:** 2026-08-21T10:36:33+03:00  
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**Starting SHA:** `011794fe6e37eb44055718d26305ea77af18f38b`  
**Runtime / schema:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite V8/V7.  
**Data/schema/cloud impact:** none. This corrects the logical V2 projection and its proof only; it does not open a database, export, stage, restore, upload, or modify any user data.

## Why this correction is required

P10-006 / V11 correctly preserved the financial payload, but the original canonical
projection omitted several stored SQLite fields needed to reconstruct a V7 row exactly.
Recreating them with defaults or generated values would violate the Phase-10 rule that
canonical restore must not normalize, synthesize, or silently repair financial records.

## Change

The V2 projection and semantic proof now include the stored fields required for an
exact direct stage:

- transaction storage fields, including kind, status, scope, dates, source,
  idempotency key, stored device provenance, and timestamps;
- account name and lifecycle timestamps;
- entity, posting, link, and exchange-rate timestamps.

This does **not** add device presentation data to the backup boundary. Theme, language,
notifications, biometric/privacy controls, avatar, and other presentation preferences
remain excluded. A transaction's stored origin device is different: it is a persisted
ledger record and is therefore included in the equality proof.

## Safety rule made explicit

The forthcoming P10-008 stage writer must write these values directly. A missing or
invalid required value is a fail-closed restore error; it is never replaced by a
default wallet, inferred FX value, current timestamp, generated idempotency key, or
normalizer output.

## Verification

`tests/run-p10-002-semantic-hash.cjs` now proves that changing stored transaction
provenance changes V2 equality proof.

`npm.cmd run test:gate`: **96 passed, 0 failed, 11 environment-dependent skips.**  
`git diff --check`: passed.

## Remaining boundary

This correction does not make a restore available. P10-008 must still stage both hot
ledger and Cold Archive data in an isolated namespace, read it back, and prove exact
semantic equality before P10-009 through P10-012 can implement atomic promotion,
post-commit recovery, and cloud-linked coordination.
