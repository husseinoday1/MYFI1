# src/lib — financial core, restore, sync, security

This is the highest-risk directory in MYFI. Changes here can corrupt real user
money data. The financial invariants in the root `CLAUDE.md` are binding here, and
`docs/MYFI_FINANCIAL_CONTRACT.md` is their authority — read it before editing
ledger, posting, balance, currency, or FX logic.

## Local rules

- **Search, don't sweep.** 96 modules live here. Grep for the symbol, read the one
  or two modules that own it, follow imports only where evidence requires.
- **SQLite schema version** is `FINANCIAL_SQLITE_SCHEMA_VERSION` in
  `financialLedgerV7Repository.js`. Changing it is a migration, governed by
  `docs/MYFI_MIGRATION_POLICY.md`, and requires explicit user approval.
- **No silent repair.** On inconsistent data, fail closed and surface it. Never
  auto-correct balances, re-derive IDs, or drop rows to make a check pass.
- **Edits are revisions, deletes are tombstones.** Financial IDs are immutable.
- **Restore/backup (`financialRestore*`, `myfiFiles.js`)** is under an active
  phase gate. Do not change production restore wiring without a reviewed,
  explicitly user-approved scope. Contracts: `docs/MYFI_BACKUP_FORMAT.md`,
  `docs/MYFI_DATA_OWNERSHIP.md`.
- **Sync** follows `docs/MYFI_SYNC_PROTOCOL.md`; local durable commit always
  precedes any cloud write.
- **`secure*` modules** (vault, uuid) fall under
  `docs/MYFI_SECURITY_THREAT_MODEL.md`. Never log, echo, or persist secret
  material; never weaken a check to make a test pass.
- **Dates and time** follow `docs/MYFI_DATE_TIME_CONTRACT.md` — do not introduce
  ad-hoc local-time arithmetic.

## Verification expected for any change here

Targeted contract test → `npm run test:database` → `npm run test:gate` (must be
green, no newly skipped tests) → `/code-review` clean → green CI run ID. Anything
with a counter, epoch, or revision needs a test that runs the action twice.
