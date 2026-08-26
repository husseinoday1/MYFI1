# MYFI — Context Map

**Purpose:** answer "where is the authoritative information about X?" in one hop,
so no session needs a recursive repository or documentation scan.

**Scope:** navigation only. This file contains no source code, no state, and no
decisions. It is SEMI-STABLE — update it when a domain moves, not per commit.
Authority order lives in `00_MYFI_CANONICAL_AUTHORITY.md` and always wins.

| Domain | Code | Canonical docs | Tests |
|---|---|---|---|
| Product vision / roadmap / phases | — | `01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md` (+ active addenda in the same folder) | — |
| Financial engine (ledger, postings, balances) | `src/lib/financialLedgerV7Repository.js`, `src/lib/financial*`, `src/utils/calc.js` | `MYFI_FINANCIAL_CONTRACT.md`, `FINANCIAL_MODEL_2_0_AR.md`, `SQLITE_FINANCIAL_CORE_V7_DESIGN_AR.md` | `tests/run-financial-core.cjs` (`npm run test:logic`) |
| Multi-currency / FX | `src/lib/` currency + FX modules | `01_CORE_AUTHORITY/MYFI_MULTI_CURRENCY_FINANCIAL_POLICY_ADDENDUM.md`, `MYFI_FINANCIAL_CONTRACT.md` | financial-core + multi-currency groups in the gate |
| Local database / schema | `src/lib/*Repository*`; schema version constant in `financialLedgerV7Repository.js` | `DATABASE_ARCHITECTURE.md`, `MYFI_MIGRATION_POLICY.md` | `tests/db-schema.test.cjs` (`npm run test:db-schema`) |
| Migrations (cloud) | `supabase/migrations/` | `MYFI_MIGRATION_POLICY.md`, `MYFI_DATA_OWNERSHIP.md` | `npm run test:cloud` (gated) |
| Backup / restore | `src/lib/financialRestore*`, `src/lib/myfiFiles.js` | `MYFI_BACKUP_FORMAT.md`, `MYFI_DATA_OWNERSHIP.md`, newest `04_CURRENT_EVIDENCE/*PHASE10*` | restore/backup groups in `npm run test:gate` |
| Sync / cloud | `src/lib/*sync*`, `src/store/multiDeviceSync.js`, `supabase/functions/` | `MYFI_SYNC_PROTOCOL.md`, `01_CORE_AUTHORITY/MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md`, `CLOUD_INTEGRATION_STATUS_AR.md` | `tests/run-sync-scenarios.cjs`, `test:sync:two-client` |
| Auth / security / secrets | `src/lib/secure*` | `MYFI_SECURITY_THREAT_MODEL.md`, `01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md` | security groups in the gate |
| App state | `src/store/` (`useStore.js`, `domain.js`, `slices/`) | `DATABASE_ARCHITECTURE.md` for the persistence boundary | gate runtime group |
| UI / screens | `src/screens/`, `src/components/`, `src/hooks/` | `MYFI_UI_REDESIGN_SPEC_AR.md`, `USER_GUIDE_AND_SUPPORT_PLAN_AR.md` | `tests/ui-contract.test.cjs` (`npm run test:ui`) |
| Smart capture (OCR / voice) | `supabase/functions/smart-*`, related `src/lib` draft paths | `SMART_CAPTURE.md` | not in the default gate |
| Dev / diagnostic harnesses | `src/dev/` | the phase evidence doc that introduced the harness | `diag-*` scripts (not acceptance evidence) |
| Android / native / release build | `android/`, `app.json`, `tools/run-eas-build.cjs` | `ANDROID_RELEASE_READINESS_AR.md`, `MYFI_RELEASE_SCOPE.md`, `PLAY_CONSOLE_SUBMISSION_AR.md` | `npm run verify:android`, `test:gate:android` |
| CI / gates | `.github/workflows/`, `.github/*-allowed-source.txt` | `00_MYFI_CANONICAL_AUTHORITY.md` § Standing Engineering Rules | the workflow runs themselves |
| Performance | — | `MYFI_PERFORMANCE_SLO.md` | perf assertions inside the gate |
| Date / time handling | `src/lib` date helpers | `MYFI_DATE_TIME_CONTRACT.md` | gate contract group |
| Code standards | — | `CODE_QUALITY_STANDARDS_AR.md` | `/code-review` |
| Current state / active task | `.myfi-ai/PROJECT_STATE.md`, `.myfi-ai/CURRENT_TASK.md` | regenerate with `node tools/myfi-context.mjs` | — |

## Entry points worth knowing

- `App.js` — application root.
- `tests/run-quality-gate.cjs` — the acceptance suite; read it to learn what a
  "green gate" actually covers before citing it.
- `tools/myfi-context.mjs` — deterministic session baseline and staleness report.
