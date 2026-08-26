# MYFI — Security Threat Model

**Contract status:** Permanent security/domain contract

**Expanded:** 2026-08-24

**Verified baseline:** `impl/p10-014a-local-strategy-b-device-gate-2026-08-22` at `d2ed3ae03c137d818040dfe77c665c516b8440b7`

**Related planning overlay:** `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md`

**Phase-10 prerequisite:** Closed by
`docs/04_CURRENT_EVIDENCE/MYFI_PHASE10_LIVE_PRODUCTION_RESTORE_CLOSURE_2026-08-24.md`.

## 1. Security objective

MYFI protects three properties together:

```text
Confidentiality + Integrity + Recoverability
```

Confidentiality does not justify silent financial corruption or an
unrecoverable ledger. A control that cannot be migrated, recovered, rolled
back, and accepted on a real Android artifact is not production-ready.

## 2. Protected assets

- financial SQLite database and ledger identity;
- transactions, postings, balances, historical FX, debts, goals,
  commitments, budgets, recurring rules, archives, and restore metadata;
- exported backups, rollback checkpoints, and restore staging data;
- Supabase sessions, refresh tokens, device identity, mutation/outbox state,
  restore epoch, and sync cursors;
- database-encryption keys if adopted and every secret in SecureStore;
- OCR images/text, SMS content, statement files, voice recordings/transcripts,
  assistant prompts/results, and temporary smart-input artifacts;
- release signing identity, CI artifacts, diagnostics, logs, crash reports,
  analytics, and notification previews.

## 3. Trust boundaries

```text
User and app UI
→ financial command/query boundary
→ local SQLite ledger (financial authority)
→ outbox/sync boundary
→ Supabase (auth, transport, replication)
```

Additional boundaries exist at Android storage/backup, SecureStore/Keystore,
MYFI backup export/import, OCR/SMS/Voice/Statement providers, AI processing,
CI/release artifacts, and logs/telemetry.

Supabase and an LLM are never the operational financial source of truth.
`ledger_id` is not automatically `supabase_user_id`.

## 4. Threat inventory

- stolen, rooted, debugged, or copied device storage;
- copied plaintext SQLite file or Android generic backup;
- stolen, guessed-password, corrupted, truncated, old-version, or tampered backup;
- lost/corrupted SecureStore entry or encryption key;
- reinstall, downgrade, upgrade interruption, or crash during encryption migration;
- crash or process death during backup/restore/promotion;
- cloud-account compromise, cross-account leakage, weak RLS, or client service-role secret;
- replayed, stale, duplicated, reordered, or conflicting financial mutations;
- stale device operating against a newer restore epoch;
- account switching or Guest/account transition mounting the wrong ledger;
- sensitive financial data, secrets, or smart-input content in logs, analytics,
  notifications, crash reports, diagnostics, or CI artifacts;
- hidden cloud upload, excessive retention, or orphaned temporary OCR/SMS/Voice/AI artifacts;
- model hallucination or parser error becoming a direct financial write;
- confusing Logout, Delete Account, and Delete Local Financial Data;
- inaccessible warnings, confirmations, or privacy controls causing accidental destructive action.

## 5. Current-state assertions

### Proven architectural contracts

- SQLite remains local operational financial truth.
- SecureStore is for secrets/session material, not the financial ledger.
- Supabase is authentication/transport/replication, not ledger authority.
- Logout, Delete Account, and Delete Local Financial Data are separate operations.
- Restore uses strict validation/staging/semantic proof/atomic promotion contracts.
- Intelligent input produces a reviewed Draft; it never writes directly to the ledger.

### Must be treated as unproven until runtime evidence exists

- financial SQLite encryption at rest;
- SQLCipher compatibility in the current native Android build;
- existing-user plaintext-to-encrypted migration and recovery;
- actual merged-release `android:allowBackup="false"` and backup-rule behavior;
- production signing acceptance;
- complete log/analytics/crash-report redaction;
- final local/cloud privacy boundary for OCR, SMS, Voice, Statement Import, and Assistant.

Therefore the current financial SQLite database is treated as **plaintext at
rest** until code and native runtime evidence prove otherwise.

## 6. Database encryption decision gate

SQLCipher is the current architectural recommendation for production
hardening, but it is not a pre-approved implementation.

Recommended direction:

**A — Adopt SQLCipher before Production, confidence Medium.**

Reason: MYFI stores long-lived sensitive financial history locally. App
Lock/biometric controls prevent casual interactive access, but they do not
protect a copied SQLite database file.

The implementation decision must still be finalized in SECURITY-S1 as one of:

- **A — Adopt before Production**;
- **B — Defer with explicit threat-model justification**;
- **C — Reject for this release with compensating controls**.

The final decision requires evidence for native/Expo compatibility, CI Android
build behavior, performance, existing-user migration, key lifecycle,
backup/restore, crash recovery, rollback, downgrade behavior, and real-device
operation. A library's existence or a fresh-install proof is not enough.

If adopted, the required migration pattern is:

```text
existing plaintext DB
→ safety checkpoint
→ provision key
→ create encrypted staging DB
→ transactional copy
→ schema/integrity validation
→ financial invariant validation
→ backup/restore validation
→ interruption/crash tests
→ atomic promotion
→ existing-user acceptance
```

Fresh-install-only evidence is insufficient. Real user financial data must
not be used for migration experiments.

## 7. Encryption-key lifecycle

If database encryption is adopted, the design must define:

- cryptographically secure key generation;
- SecureStore/Android Keystore-backed storage where supported;
- retrieval, rotation if supported, corruption detection, and deletion;
- first install, launch, reboot, logout, account deletion, local-data deletion,
  reinstall, biometric enrollment/removal, SecureStore loss, device migration,
  backup recovery, and permanent key loss;
- an explicit recoverability policy approved before implementation.

The key must never be stored in source code, SQLite, AsyncStorage, Git, logs,
analytics, crash reports, or CI output.

Biometric/App Lock and database encryption are separate layers. The database
key must not be bound to interactive biometric authentication in a way that
silently breaks background sync, notifications, backup, restore, or recovery.

## 8. Backup and restore security

Encrypting SQLite is insufficient if exported backups remain unprotected.
Backup/restore must cover:

- confidentiality and authenticated encryption where applicable;
- password/KDF policy and tamper detection;
- bounded parsing and package/schema/version validation;
- exact financial references and semantic proof;
- isolated staging and financial health checks;
- writer/sync pause at the approved boundary;
- atomic promotion and durable recovery state;
- interrupted restore, corruption, rollback/Undo, old-to-new version restore,
  and failed-password handling;
- no live financial mutation before the final approved promotion boundary.

Phase 10 live acceptance remains the prerequisite for any later redesign of
backup encryption or key handling.

## 9. Android and release controls

The merged release artifact—not only source configuration—must prove:

- the source contract `android:allowBackup=false` and the merged value
  `android:allowBackup="false"`;
- applicable data-extraction and backup rules;
- no unintended exported activities, services, receivers, or providers;
- minimal declared permissions;
- absence of debug-only entry points/components in normal production builds;
- expected application ID, version, signing certificate, and release manifest;
- CI-built acceptance artifact and reproducible evidence.

Debug signing is never production signing evidence.

## 10. Sensitive logging and telemetry

Production logs, crash reports, analytics, diagnostics, notification previews,
support exports, and CI artifacts must not contain:

- transaction notes, balances, amounts, or full financial histories;
- raw backup payloads or database rows;
- SMS content, OCR receipt text/images, statement content, or voice transcripts;
- passwords, tokens, refresh sessions, encryption keys, API secrets, or service-role keys.

Diagnostics use safe identifiers, bounded reason codes, shapes, and counts only
when those counts do not reveal sensitive financial facts. Raw coordinator or
payload objects are not log fields.

## 11. Smart-input and AI privacy contract

For OCR, Voice, SMS, Statement Import, and Financial Assistant, document before
implementation:

- local versus cloud processing;
- exact data leaving the device and its purpose;
- user disclosure and consent;
- authentication and authorization;
- retention and deletion timing;
- temporary-file cleanup;
- failure/offline behavior;
- provider and model boundaries;
- prevention of hidden upload.

All sources follow:

```text
Detection / Extraction / Understanding
→ Draft
→ Validate
→ Deduplicate
→ Categorize
→ Review
→ Confirm
→ Post
```

No model, parser, or extractor may directly create a final ledger mutation.
Authoritative calculations come from deterministic financial services.

## 12. Supabase and synchronization security

Production acceptance requires evidence for:

- RLS and cross-account isolation;
- no service-role secret in the client or artifact;
- Guest → account, logout/login, account switching, and device switching;
- mutation IDs, revisions, base revisions, device IDs, protocol version, and
  restore epoch;
- replay, retry, idempotency, stale-device, and out-of-order behavior;
- two-device convergence and outbox/inbox continuity;
- deterministic conflict policy with no destructive automatic merge of
  conflicting monetary values.

Cloud failure must not silently redefine or delete the local ledger.

## 13. Destructive-action and lifecycle safety

- Logout ends a cloud session; it does not delete local financial data.
- Delete Account and Delete Local Financial Data remain separate, explicit,
  clearly explained actions.
- Local deletion requires a destructive confirmation contract and must not be
  presented as cloud-account cleanup.
- Restore, migration, encryption cutover, and account transitions must fail
  closed when identity or state is ambiguous.
- Accessibility applies to security: confirmations, warnings, focus order,
  semantic labels, touch targets, RTL, and non-color-only states must be clear.

## 14. Production security gate

Security is accepted only when the selected control set has:

1. documented current and target state;
2. threat-model justification;
3. migration, recovery, rollback, and failure-mode design;
4. automated negative and lifecycle tests;
5. CI Android artifact proof;
6. real-device existing-user evidence where state is persistent;
7. no financial data loss, reinterpretation, or sensitive-data leakage;
8. explicit closure evidence under the canonical authority order.

## 15. Governing rule

Do not add a security mechanism merely because a library supports it. Add it
only when its compatibility, recovery, migration, rollback, and operational
behavior are proven strongly enough for a long-lived financial ledger.
