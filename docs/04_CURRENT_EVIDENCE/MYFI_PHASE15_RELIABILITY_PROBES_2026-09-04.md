# MYFI — §101 SQLite Reliability Probes: closing the unexecuted categories

Date: 2026-09-04
Session: Implementation 5
Scope: §101 only. Read-path independent, so it proceeds alongside the §102 audit
while §97/§98 measurement is held pending the History read cutover.

## The problem this addresses

The gap analysis found §101 in a state that is easy to mistake for coverage.
Real probe code exists — `runRealSqliteBusyScenario` and
`runRealSqliteFullScenario` in `src/dev/phase10RestoreBenchmarkHarness.js` are
genuine faults, not simulations — but three things limited it:

1. **Scope.** All of it is scoped to the Phase 10 restore path and gated behind
   diagnostic build flags.
2. **Automation.** The registered CI test, `phase10-restore-benchmark-memory.test.cjs`,
   asserts that those code strings are *present in the source file*. It never
   executes them. A probe can be deleted from the runtime path and still pass, as
   long as the identifier survives somewhere in the file.
3. **Self-declared not-run.** The harness records
   `processKillAcceptance: 'PENDING_EXTERNAL_ADB_RUNNER'` and
   `physicalDeviceStorageExhaustion: 'NOT_RUN_GLOBAL_SIDE_EFFECT_FORBIDDEN'`.

And three §101 categories had no coverage of any kind: **FK violation**,
**corrupted-DB simulation**, and a kill leaving an **un-checkpointed WAL**.

## What was added

`tests/phase15-sqlite-reliability-probes.test.cjs`, registered in the quality
gate, runs five real faults against real SQLite under MYFI's own pragma set
(WAL + `foreign_keys=ON` + `busy_timeout=5000` + `synchronous=NORMAL`):

| Probe | Fault | Assertion |
|---|---|---|
| FK violation | orphan row inside a multi-row transaction | rejected, **and** the valid row from the same transaction does not survive; `quick_check` still ok |
| Kill mid-command | `SIGKILL` with a transaction open | database healthy, uncommitted row absent |
| Kill after commit | `SIGKILL` immediately after `COMMIT`, no clean close, no checkpoint | database healthy, **committed row still present** |
| Un-checkpointed WAL | `SIGKILL` after 2,000 individually-committed rows | database healthy, all 2,000 rows recovered (observed WAL: ~4.1 MB outstanding) |
| Corruption | 4 KB of a data page overwritten past the header | `quick_check` fails closed (or the open is refused) |

The kills are real: the child process calls `process.kill(process.pid, 'SIGKILL')`
at the exact instruction that matters, so there is no timing race between a parent
and a child, and each probe asserts the child did **not** exit cleanly before
drawing any conclusion from the surviving database.

## What this is evidence for, and what it is not

**Is:** real evidence that MYFI's chosen SQLite configuration survives these
faults. Same SQLite library, same WAL/FK/synchronous semantics as on device.

**Is not:**

- Not Android. This runs desktop SQLite through `node:sqlite`, not `expo-sqlite`
  on Android. It says nothing about the Android storage stack or the bindings.
- **Not power loss.** A `SIGKILL` destroys the process but leaves the OS page
  cache intact. That is precisely the case `synchronous=NORMAL` is expected to
  survive. The power-loss / OS-crash case — the one thing NORMAL actually trades
  away versus FULL — is **not** covered here.

So this **partially** closes §102's open crash-safety item: the
application-crash half of the durability question for `synchronous=NORMAL` now
has executed evidence (probe 3), and the power-loss half does not and still needs
device work. Recorded that way in
`MYFI_PHASE15_SQLITE_CONFIG_AUDIT_2026-09-04.md` rather than counted as closed.

## Mutation testing

The probes were mutated to confirm they can fail, each mutation applied and
reverted:

1. `foreign_keys=OFF` in the shared pragma set → FK probe **failed** as it should.
2. corruption step removed (file left intact) → corruption probe **failed** as it
   should, i.e. it is detecting real damage rather than always reporting failure.
3. child body made to throw before reaching its kill point → **caught**. This one
   found a real hole in the first version of the file, during the pre-push review:
   the probes originally concluded "the kill happened" from a non-zero exit
   status alone, so a child that failed to start at all — bad flag, syntax error,
   missing module — would have satisfied the kill-mid-command probe's "no
   uncommitted row survived" assertion without ever running the fault. Each child
   now writes a marker to fd 1 (synchronously, since `console.log` to a pipe can
   be buffered and lost to the immediately following `SIGKILL`) and the parent
   requires that marker before drawing any conclusion.

Note honestly: probe 3 (kill after commit) would still pass at `synchronous=OFF`,
because a process kill does not lose the page cache. That is not a weakness in the
probe — it is the boundary of what a `SIGKILL` test can prove, and it is why the
power-loss claim is explicitly not made.

## §101 status after this change

| Category | Before | After |
|---|---|---|
| app killed mid-command | harness code, device-only, `PENDING_EXTERNAL_ADB_RUNNER` | **executed in CI** |
| app killed after commit | same | **executed in CI** |
| DB busy | real device probe, source-asserted in CI | unchanged |
| lock contention | real device probe, source-asserted in CI | unchanged |
| low storage / disk full | real device probe, `NOT_RUN` for physical exhaustion | unchanged |
| interrupted WAL checkpoint | none | **partial** — kill with un-checkpointed WAL executed; a true mid-checkpoint interrupt is not reachable through a synchronous API |
| interrupted migration | none | still none |
| corrupted DB simulation | none | **executed in CI** |
| FK violation | none | **executed in CI** |
| integrity / quick_check failure | used in production paths (§103 PROVEN) | **now also fault-tested** |

Remaining §101 gaps, unchanged and not silently closed: **interrupted migration**,
physical storage exhaustion on a device, and moving the existing device-only
busy/full probes off source-string assertion.
