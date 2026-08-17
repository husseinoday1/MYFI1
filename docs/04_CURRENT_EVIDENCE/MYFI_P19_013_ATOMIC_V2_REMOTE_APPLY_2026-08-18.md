# MYFI — P19-013 Atomic Protocol V2 Remote Apply Evidence

## Date
2026-08-18

## Baseline
- Repository: `https://github.com/husseinoday1/MYFI1`
- Base branch: `r05-p19-012-empty-shell-cloud-recovery`
- Required base HEAD: `884c349a6a0d624451a375ed7a6026e589985d49`
- SQLite schema version: 8
- Expo SDK: 54 (`expo ~54.0.36`)
- React Native: 0.81.5

## Trigger
P19-009 introduced an intentionally inactive Protocol V2 client but temporarily reused the V7 remote-apply engine. P19-011 added verified bootstrap/readback and a durable activation marker. P19-012 added verified Cloud -> Empty Local recovery for the legacy-cloud/no-V2 case. Before real-account V2 activation, the temporary V7 apply reuse must be removed.

## P19-013 implementation contract
P19-013 makes the V2 apply path explicit and fail-closed:

- `allowProductionApply=false` is the default.
- Shadow sync validates complete commands and CAS preconditions without financial writes.
- Shadow sync advances only `shadow_last_server_sequence`.
- Durable `activated_at` is the no-fallback barrier.
- The production cursor remains independent and is not advanced by activation.
- Production sync re-downloads from the production cursor with `allowProductionApply=true`.
- Exact local cloud echoes are recognized only by exact immutable V3 outbox mutation equality and are financial no-ops.
- A remote mutation not recognized as an exact local echo requires local current revision == remote `base_revision`.
- Equal/stale foreign revisions do not auto-merge or auto-skip.
- Complete command preflight occurs before any command financial write.
- Account currency/type/scope is immutable for an existing account identity.
- Currency minor exponent cannot silently change.
- Historical FX identity/value cannot silently change.
- Posting currency must match its account currency.
- Transaction idempotency keys cannot collide with another transaction.
- One command's financial rows, V3 inbox `applied` state, and production command cursor are committed in one SQLite transaction.
- Conflict evidence is written to V3 inbox with `apply_status='conflict'`; production cursor does not advance.
- A production catch-up failure after `activated_at` is a V2 recovery event; V1 fallback is forbidden.

## Automated verification required by runner
1. P19-013 static architecture contract.
2. P19-013 deterministic atomic command model.
3. P19-009 V2 client regression.
4. P19-010 bootstrap regression.
5. P19-011 activation/readback regressions.
6. P19-012 recovery regressions.
7. Full `npm run test:gate`.
8. `npm run verify:android`.
9. `git diff --check`.
10. Local Internal APK build after commit.

## Cloud and schema impact
- Financial values changed by patch: NO
- SQLite schema changed: NO
- SQLite schema version: 8
- SQLite migration required: NO
- Supabase DDL migration: NO
- Supabase live financial rows changed by runner: NO
- SecureStore format changed: NO
- Existing-user financial data preserved by patch application: YES

## Acceptance status
Automated evidence is necessary but not sufficient.

Real-device acceptance: PENDING

For the known account recovery case, the cloud compatibility snapshot was independently verified before P19-013 work to still contain revision 300 with 80 transactions, 7 wallets, 5 debts, 4 goals, and 14 commitments, while V2 ledger/bootstrap rows remained absent. That cloud verification is operational safety evidence; it does not itself prove P19-013 device acceptance.

The current installed APK is signed differently from the locally built Internal APK. `adb install -r` correctly failed with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. No uninstall or app-data clear was performed. A single controlled reinstall is deferred until the final P19-013 APK is built and cloud evidence is reverified.

Phase 9 remains OPEN until the required device recovery/sync evidence passes.
