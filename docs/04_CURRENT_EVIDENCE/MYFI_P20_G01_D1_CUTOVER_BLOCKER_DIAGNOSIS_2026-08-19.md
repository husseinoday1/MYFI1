# MYFI P20-G01-D1 — Diagnosis of `financial_v7_cutover_required` and diagnostic rebuild

Date: 2026-08-19
Produced by: MYFI Implementation session
Input: `MYFI_P20_G01_DEVICE_ACCEPTANCE_2026-08-19.md` (items 2–5 PASS, items 6–7 blocked)
Branch: `impl/p20-g01-acceptance-apk-2026-08-19`

## What the blocker actually is

`financial_v7_cutover_required` is pushed by `disposableBlockers()` in
`src/dev/p19RestoreEpochDeviceGate.js` when `state.financialLedgerV7Cutover` is falsy.
It is **not** an emptiness check. It asserts that the workspace has completed the
R04/V7 operational cutover — i.e. that SQLite (not the Vault snapshot) is the
authoritative financial source for this account.

This confirms hypothesis (1) in the device-acceptance file: the gate's `reason`
string names the wrong thing. `disposable_financially_empty_account_required` is a
single hard-coded reason covering every precondition in the list, so a cutover-state
failure is reported using emptiness language. The `blockers` array was correct; the
`reason` was misleading.

## Ruled out by source inspection

- `R04_OPERATIONAL_CUTOVER_ENABLED` is hard-coded `true`
  (`src/store/slices/useSyncSlice.js:133`) — not a disabled build flag.
- `activeLedgerSupported()` is `Platform.OS !== 'web'`
  (`src/lib/activeLedgerRepository.js:262`) — true on the test device.
- The gate reads the live store (`useStore.getState`, `SettingsScreen.js:743`),
  not a stale snapshot.
- The acceptance flag was live in the build (item 3 label evidence), so the gate
  module itself was active.

## The unexplained signal — why a second device run is required

The **real** account returned `blockers: ["financial_v7_cutover_required"]` and
nothing else. That account holds at least one real transaction (accepted P20
evidence), yet no `transactions_present:N` and no `sqlite_transactions_present:N`
blocker appeared. `disposableBlockers()` accumulates every failing condition — it does
not short-circuit — so on that account at least one of the following is true, and
source reading alone cannot say which:

1. `state.trans` was empty at gate time while the UI rendered from the SQLite
   projection, and `financialLedgerV7Cutover` is being read as falsy despite the app
   behaving as cut over (store shape / read-path mismatch), or
2. the workspace genuinely never cut over, the app is running in pre-cutover Vault
   mode, and `readFinancialWorkspaceV7()` returned an empty/absent workspace for both
   accounts, or
3. cutover was attempted and failed, leaving the reason in `state.ledgerError` /
   `state.financialLedgerV7Migration` — neither of which the gate reports.

Case 2 is the benign one. **Case 1 would be a real defect** — the gate would be
unable to tell a financially-loaded account from an empty one, which is exactly the
safety property P20-G01 exists to prove. It must not be assumed away.

## Change made (P20-G01-D1)

`src/dev/p19RestoreEpochDeviceGate.js` — the BLOCKED payload now carries a
`diagnostics` object recording observed state only:

- `activeLedgerSupported`, `workspaceReady`, `demoMode`
- `cutoverKeyPresent` — separates "flag is false" from "key absent on the store root"
- `financialLedgerV7Cutover`, `financialLedgerV7Ready`, `ledgerReady`, `ledgerError`
- `migration` — `supported/ok/cutover/sourceMode/migrationReady/reason`
- `storeCounts` vs `sqliteCounts` — distinguishes case 1 from case 2 directly
- `sqliteWorkspacePresent` — an absent V7 workspace vs an empty one
- `coldArchiveBundles`

Read-only. No precondition was relaxed, no threshold changed, no destructive path
touched. One device round-trip now decides between the three cases instead of
further speculation.

## Impact

Financial values changed by code: NO
Gate preconditions changed: NO
SQLite schema changed: NO
Migration required: NO
SecureStore changed: NO
Supabase schema changed: NO
Production feature change: NO

## Local verification (this branch)

```text
p20-g01-phase9-restore-epoch-gate contract  PASS
p20-v2-client-closure contract              PASS
p19-final-clean-v2-hardening contract       PASS
test:gate:static    62 passed, 0 failed, 11 skipped
test:gate:runtime   18 passed, 0 failed,  6 skipped
verify:android      Exported: dist-android-verify (bundle hash changed, patch present)
```

## Build path

`.github/workflows/p20-g01-d1-diagnostic-apk.yml` — `workflow_dispatch`, same keystore
and same `EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE=1` as the accepted P20-G01 build,
so it installs over the existing app without Clear Data. Its scope guard asserts that
the only shipped-source delta versus accepted commit `fd98f80` is the gate module.

## Next (MYFI Testing & Release — not this session)

1. Dispatch the D1 workflow, install over the app (no Clear Data).
2. Press the gate on the **real** account once and capture the full `diagnostics`.
3. Press it on the disposable account once and capture the full `diagnostics`.
4. Return both payloads. Item 7's PASS marker is still not expected in this round —
   D1 is a diagnostic round, not an acceptance round.

Phase 9 remains OPEN. Items 6–10 remain unmet.
