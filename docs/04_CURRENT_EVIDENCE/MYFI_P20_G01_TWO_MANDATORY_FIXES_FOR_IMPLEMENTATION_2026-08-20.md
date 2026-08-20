# For Implementation: 2 mandatory fixes before Phase 9 closes

Date: 2026-08-20. Ruling: Planning & Audit (see code-review file for detail).

1. `p19RestoreEpochDeviceGate.js:102` `disposableBlockers` — must check
   actual SQLite wallet data, not just in-memory store state.
2. `financialLedgerV7Repository.js:1650` — stop writing the legacy
   namespace-only `sync_v2_activation_evidence` key entirely.

avatarUri silent-drop (`financialLedgerV7Repository.js:2487`): real, non-blocking follow-up.
Rest of `MYFI_P20_G01_CODE_SECURITY_REVIEW_2026-08-20.md`: backlog.

When both land + CI green, Testing & Release re-runs PASS, then Phase 9 closes.
