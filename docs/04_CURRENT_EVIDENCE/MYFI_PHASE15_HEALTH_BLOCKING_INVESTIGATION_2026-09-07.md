# Phase 15 — operational-cutover health refusal

Date: 2026-09-07
Base: c3a16a3009becbe80c3cc7700fbe40c31694e4b7
Branch: fix/pui-001-r2-onboarding-reader-recent-transactions
Remote freshness verified: 2026-09-07 08:38 UTC (`git fetch --all` and remote
branches sorted by committer date); this branch remains the newest remote branch.
Status: the device reports a database foreign-key violation; its precise parent/
child relation remains read-only diagnostic work. The isolated V7 lab is now
proved independently from unrelated database rows; real cutovers remain blocked.

## Observed evidence and corrections

The owner supplied a screenshot of
`financial_v7_health_blocking: foreign_key_violation` during lab entry. The
image does **not** identify the selected tier: the visible Active 25K button
behind the modal is not proof that it was pressed. Earlier chat claims that
this was specifically an Active 25K defect were unsupported. It does establish
the invariant category (a foreign-key violation), but not the table, parent, or
the originating write path.

In this entry path the error is returned by
`runFinancialOperationalCutoverV7` when `proveFinancialLedgerInvariantsV7` fails
on the staged namespace, **before promotion**. The preceding shadow parity pass
can succeed and leave `source_mode=shadow`. Therefore this observation is
consistent with a genuine refused promotion, not merely stale UI counters.
The precise failing invariant was discarded by the old error presentation.

The health proof checks database-wide quick_check/foreign_key_check, then
namespace-specific postings, revisions, transfer legs, FX references and opening
balances. A healthy selected fixture does not establish global database health.
An unrelated foreign-key violation is a reproduced cause of the same error.
It is established that the owner's database has at least one foreign-key
violation, but its precise relation is not established without the local
read-only diagnostic.

## Follow-up: isolated performance-stage FK scope

The error was not a V7 fixture mismatch. `proveFinancialLedgerInvariantsV7`
previously ran `PRAGMA foreign_key_check` over the whole SQLite database even
while proving the disposable `::performance-test::shadow-stage::...` namespace.
That correctly blocks a real cutover, but it also made a row outside the lab
block an operation that cannot alter, synchronize, repair, or promote the
owner's real workspace.

The operational-cutover API now defaults to the unchanged **database** FK
scope. Only `ensurePerformanceTestLedgerV7`, after its existing strict
`demoMode:true` + `performanceTestMode:true` guard, explicitly requests
**namespace** FK scope for its staging namespace. The scope accepts violations
only from V7 tables that are materialized by that stage, and fails closed if a
candidate row cannot be attributed safely. Namespace-specific financial checks
(postings, transfer legs, revisions, FX and opening balances) remain unchanged.

This is not a repair or acceptance of the owner's database defect. Any real
V7 cutover keeps database-wide `foreign_key_check` blocking. No cloud identity
adoption, SQL schema change, deletion, or modification of financial data is
part of this change.

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
3. Replace the lab's namespace FK scope with database scope: the real SQLite
   test fails under an injected unrelated orphan, proving the isolation is
   required to reproduce the disposable lab path.

The new SQLite test proves all of the following:

- a database-wide orphan still blocks the default real-cutover invariant;
- the same unrelated orphan does not block an isolated performance-stage V7
  cutover;
- an orphan in the namespace being proved still blocks that stage;
- no lab transport identity/outbox state is created.

## Remaining acceptance work

At investigation time `adb devices -l` returned no connected device. The precise
on-device health issue must be captured using the local read-only diagnostic
before any data repair is proposed. The new lab scope allows the benchmark to
run despite an unrelated real-database violation; it does not authorize a
repair. Phase 15 and its five-tier/memory/100K measurements remain open.
