# Phase 15 — operational-cutover health refusal

Date: 2026-09-07
Base: c3a16a3009becbe80c3cc7700fbe40c31694e4b7
Branch: fix/pui-001-r2-onboarding-reader-recent-transactions
Remote freshness verified: 2026-09-07 08:38 UTC (`git fetch --all` and remote
branches sorted by committer date); this branch remains the newest remote branch.
Status: device root cause unresolved; diagnostic fix and SQLite regression coverage.

## Observed evidence and corrections

The owner supplied a screenshot of `financial_v7_health_blocking` during lab
entry. The image does **not** identify the selected tier: the visible Active 25K
button behind the modal is not proof that it was pressed. Earlier chat claims
that this was specifically an Active 25K defect were unsupported.

In this entry path the error is returned by
`runFinancialOperationalCutoverV7` when `proveFinancialLedgerInvariantsV7` fails
on the staged namespace, **before promotion**. The preceding shadow parity pass
can succeed and leave `source_mode=shadow`. Therefore this observation is
consistent with a genuine refused promotion, not merely stale UI counters.
The precise failing invariant was discarded by the old error presentation.

The health proof checks database-wide quick_check/foreign_key_check, then
namespace-specific postings, revisions, transfer legs, FX references and opening
balances. A healthy selected fixture does not establish global database health.
An unrelated foreign-key violation is a reproduced cause of the same error,
but it is **not established as the owner's device cause**.

## Changes and financial impact

- Add actual SQLite integration coverage of the real fixture generator, archive
  storage, shadow migration, operational cutover and lab adapter. Native bindings
  are replaced by a Node SQLite adapter; application parity and health queries
  are executed unchanged. This is not Android performance evidence.
- Preserve health issue codes and the phase/tier of the last lab attempt in
  process memory. Diagnostics displays that attempt even when failed entry leaves
  the UI in the previous workspace. The entry error now includes the issue codes.
- Keep the diagnostic summary restricted to time, tier, phase, booleans and issue
  codes. Do not copy balances, financial rows, account IDs or raw health objects.
- Add a strict demoMode + performanceTestMode precondition before the helper can
  clear/rebuild any namespace. Current callers already supply both; malformed
  direct calls now fail before touching SQLite.
- No schema changes, weakening of health guards, cloud operations or live data
  repair. No Supabase identity adoption was attempted.

## Verification

The initial actual-SQLite clean-database run passed entry and repeated reuse for
200/5K/10K/25K/50K. The strengthened default test also runs the real cold-archive
write/export and snapshot serialize/hydrate/rebuild cycle for 200.
The strengthened Active 25K run also passed entry, saved-snapshot reuse, forced
rebuild, transport isolation and repeated global-health refusal. A 100K sweep
was started but is not acceptance evidence until its final result is available.

Full local quality gate: **186 passed, 0 failed, 11 skipped**, including the new
SQLite runtime test. Cloud and device-only gates remain explicitly skipped;
these results do not close Android acceptance.

It deliberately creates an unrelated foreign-key violation in its in-memory
test database and repeats failed entry twice. Both attempts must return
`financial_v7_health_blocking`, `cutover=false`, issue `foreign_key_violation`,
and retain the target in shadow mode. Transport tables remain empty for the lab.

Mutation checks performed:

1. Disable the new isolation precondition: the test fails expecting
   `performance_v7_isolation_required`. Restore the guard.
2. Suppress diagnostic issue codes: the test fails expecting
   `foreign_key_violation`. Restore code propagation.

## Remaining acceptance work

At investigation time `adb devices -l` returned no connected device. The precise
on-device health issue must be captured using this diagnostic build before any
data repair is proposed. The previous APK's generic error is insufficient for
that decision. Phase 15 and its five-tier/memory/100K measurements remain open.
