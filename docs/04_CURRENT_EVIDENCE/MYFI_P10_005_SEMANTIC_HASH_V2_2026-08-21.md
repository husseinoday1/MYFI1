# MYFI — P10-005: semantic hash V2

**Recorded:** 2026-08-21T10:16:11+03:00  
**Branch:** `impl/p20-g01-acceptance-apk-2026-08-19`  
**Starting SHA:** `c7692a0a7cedf77b62691c475557ebe228b71aa9`  
**Runtime / schema:** Expo `~54.0.36`, React Native `0.81.5`, `expo-sqlite ~16.0.10`; financial SQLite V8/V7.  
**Data/schema/cloud impact:** none. This is a pure proof definition and test only; it does not export, restore, upload, or modify a ledger.

## Result

Semantic Hash V1 remains frozen for historical diagnostics. `semanticHashV2()` and
`compareSemanticLedgerV2()` are new and versioned independently as version 2. V2 is
not wired into a user-visible backup format yet; that integration remains P10-006.

## V2 field policy

Included:

- ledger identity, live transaction payloads and their revision/tombstone/archive
  state;
- postings, links, accounts, exchange rates, and canonical financial entities;
- complete cold-archive record content and archive metadata;
- only the existing financial backup configuration allowlist: currency, profile and
  scope, enabled modules, default wallet, budgets, and archive summaries.

Excluded:

- language, theme, notification settings, biometric/privacy controls, avatar and
  other device presentation choices;
- package transport fields and runtime diagnostics.

The exclusion is deliberate: the final logical backup must not become a mechanism
for moving device preferences across devices. It also matches the existing
`pickFinancialBackupConfig()` boundary.

## Verification

`tests/run-p10-002-semantic-hash.cjs` proves that V2 changes for a live note, an
archived transaction field, an archived entity field, and financial configuration;
it also proves theme/language/privacy changes and archive collection ordering do not
change V2.

`npm.cmd run test:gate`: **94 passed, 0 failed, 11 environment-dependent skips.**  
`git diff --check`: passed.

## Remaining boundary

V2 is intentionally not yet an acceptance claim for Phase 10. P10-006 must define
the V11 canonical backup package and make the writer source its records from the
canonical SQLite reader. P10-007 through P10-011 must still prove strict decoding,
staging, one-transaction promotion, and post-commit recovery.
