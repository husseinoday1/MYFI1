# MYFI — §102 SQLite Operational Configuration Audit

Date: 2026-09-04
Session: Implementation 5
Scope: §102 only. Read-path independent, so it proceeds while §97/§98 measurement
is held pending the History read cutover (see
`MYFI_PHASE15_GAP_ANALYSIS_2026-09-04.md`).

§102 requires each of `foreign_keys`, `journal_mode`, `synchronous`, `busy_timeout`
and checkpoint policy to carry a **reason**, a **benchmark**, and **crash-safety
evidence**, and requires that they not be changed casually. This document supplies
the first two for all five and states honestly where the third is still missing.

---

## Correction to the gap analysis

The gap analysis reported this as "two connections to the same app's data
disagreeing" — `synchronous = NORMAL` in `activeLedgerRepository.js:41` versus no
setting (default FULL) in `ledgerDatabase.js`. **That framing was wrong**, and the
truth is worse rather than milder.

`activeLedgerRepository.openDb()` calls `getLedgerDb()`. There is exactly **one**
shared connection, used by 16 modules across `src/lib` and `src/dev` (98 call
sites of `getLedgerDb()`), including every financial repository. So the two
pragmas were never in competition on separate handles — they were sequential
writes to the same handle.

The actual defect: `synchronous = NORMAL` was applied opportunistically inside
`activeLedgerRepository`'s schema-bootstrap `execAsync`, guarded by a
module-level `schemaReady` flag, in among the `CREATE TABLE` statements. So for
the shared connection:

- before that bootstrap ran in a given process, the connection was at the SQLite
  default, **FULL**;
- after it ran, the connection was at **NORMAL**.

Which one the financial ledger got therefore depended on **call order** — on
whether anything had touched the active-ledger module yet in that process. On an
ordinary app boot the active ledger is read early, so NORMAL was the usual state;
but any path that reaches the ledger first — early restore promotion, a migration
on first launch, a diagnostic entry point — ran at FULL instead.

That is a **durability guarantee that varied by timing**, in the money-critical
store, with nobody having chosen either value deliberately. It is precisely what
§102 exists to prevent.

---

## The five settings

### `journal_mode = WAL` — kept

- **Reason.** Readers do not block the writer, which matters because the UI reads
  the ledger while the sync worker and outbox write to it. WAL is also what the
  existing restore/promotion machinery assumes (`wal_checkpoint` handling in the
  restore path, and the P10-014A full-disk probe explicitly restores WAL after
  temporarily switching to `delete`).
- **Benchmark.** Not re-measured; WAL versus rollback journal is not a live
  question here, and switching would invalidate the restore design.
- **Crash-safety.** WAL is crash-safe by design for app/process death. Real
  evidence exists in the P10-014A harness (`runRealSqliteFullScenario` asserts the
  journal mode returns to `wal` after the disk-full fault, and
  `runRealSqliteBusyScenario` asserts no partial write is visible after a busy
  fault). Device-only, and the CI test for it is a source-string assertion — see
  the §101 limits in the gap analysis.

### `foreign_keys = ON` — kept

- **Reason.** The V7 ledger schema relies on referential integrity between
  transactions, postings and entities; §101 lists FK violation as a probe
  category, which presumes enforcement is on.
- **Benchmark.** Not measured. FK enforcement cost is not a plausible bottleneck
  at this schema's fan-out and no one has proposed disabling it.
- **Crash-safety.** Asserted at runtime on real hardware by
  `financialLedgerV7DeviceHarness` (`foreign_keys_disabled`). Note the harness
  proves the setting is *on*; there is still **no FK-violation fault probe** (§101
  gap, unchanged by this document).

### `busy_timeout = 5000` — kept

- **Reason.** The write queue (`enqueueLedgerWrite`) serialises MYFI's own
  writers, so contention should be rare; the timeout covers the residual case of a
  read transaction overlapping a write, rather than being the primary concurrency
  mechanism.
- **Benchmark.** Not measured as a threshold sweep. 5000 ms is an upper bound on
  waiting, not a cost paid in the normal path.
- **Crash-safety.** `runRealSqliteBusyScenario` exercises genuine contention (two
  connections, `BEGIN IMMEDIATE`, `busy_timeout` lowered to 100 ms to force the
  fault) and asserts that the loser observes busy/locked, that no partial write is
  visible, and that a retry then succeeds. Asserted at runtime by the device
  harness (`busy_timeout_too_low`).

### `synchronous` — **changed**: now pinned to NORMAL for the whole connection

This is the one setting this audit actually changes, and it is a change from
*non-deterministic* to *deterministic*, not from one value to another by taste.

- **Reason.** With WAL, `NORMAL` still fsyncs the WAL at checkpoints and remains
  safe against application and process crashes — an app kill cannot corrupt the
  database or lose a committed transaction. What `NORMAL` trades away, relative
  to `FULL`, is the last commits in the window before a checkpoint **in an OS
  crash or power loss**. `FULL` fsyncs on every commit.
- **Benchmark** (reproduced by `tests/phase15-sqlite-operational-config.test.cjs`
  on every gate run, so this number cannot rot silently). Node 24 `node:sqlite`,
  same WAL settings, Windows, this machine:

  | write pattern | FULL | NORMAL | ratio |
  |---|---|---|---|
  | one commit per row (2,000 rows) | 1,902 ms | 46 ms | **41x** |
  | one batched transaction (25,000 rows) | 33 ms | 26 ms | 1.27x |

  The shape is what matters, not the absolute numbers: `FULL` is punishing on the
  **per-command commit path** — the path every add / edit / delete / void takes,
  one durable commit each — and nearly free for **batched** work like restore and
  archive import. At ~0.95 ms per commit on a desktop SSD, and with Android
  storage fsync typically slower than desktop, `FULL` would put a visible cost on
  the single most common user action in the app.
- **Crash-safety evidence — PARTIAL, and stated as such.** The argument above for
  NORMAL is the standard SQLite WAL durability argument and is sound in theory,
  but MYFI has **not** run a power-loss or OS-crash probe to observe it. The
  relevant §101 categories (kill mid-command, kill after commit) exist as harness
  code but self-report `processKillAcceptance: 'PENDING_EXTERNAL_ADB_RUNNER'`,
  i.e. they have not been executed. **So this setting has a reason and a
  benchmark but not yet the crash-safety evidence §102 asks for.** That evidence
  is §101 work and is named as the blocking follow-up below rather than quietly
  assumed.
- **Honest note on what the change costs.** Pinning NORMAL at connection setup
  means the early-boot paths that previously happened to run at FULL — before the
  active-ledger bootstrap — now run at NORMAL too. For those paths this is a small
  *reduction* in durability against power loss, in exchange for the setting being
  knowable at all. The alternative (pinning FULL) would have raised durability but
  imposed the 41x per-commit cost app-wide, which §102's "do not change casually"
  argues against at least as strongly. Choosing the value the app already ran at
  in the common case is the smaller, more reversible move; if the §101 kill
  evidence later argues for FULL, or for raising to FULL around restore promotion
  specifically (cheap, since promotion is batched — 1.27x), that is a
  well-scoped follow-up.

### checkpoint policy — **unset, deliberately, and this is a gap**

No `wal_autocheckpoint` value is configured anywhere in `src/`, so the connection
runs SQLite's default (1000 pages). No reason, benchmark or crash-safety evidence
exists for that default, and §102 lists checkpoint policy as one of the five
settings requiring all three.

This audit does **not** set a value. Choosing one interacts directly with WAL
growth (§98's WAL-size metric, unmeasured) and with restore/promotion checkpoint
handling, and picking a number without either measurement would be exactly the
casual change §102 forbids. Recorded as an open §102 item, not silently closed.

---

## What changed in code

- `src/lib/ledgerDatabase.js` — `PRAGMA synchronous = NORMAL` added to the
  connection setup alongside the other three, with the reasoning inline.
- `src/lib/activeLedgerRepository.js` — the opportunistic pragma removed from the
  schema bootstrap; comment explains why it must not come back.
- `src/lib/localArchiveRepository.js` — stale comment corrected (it described the
  connection as initialising only WAL + foreign_keys).
- `src/dev/financialLedgerV7DeviceHarness.js` — reads `PRAGMA synchronous` and
  fails closed on `synchronous_not_normal`, so the pinned value is proven on real
  hardware next time the harness runs, not just asserted in source.
- `tests/phase15-sqlite-operational-config.test.cjs` (new, registered in the
  quality gate) — pins the single-owner rule, the four values, and the harness
  assertion; and re-runs the FULL-vs-NORMAL benchmark for real via `node:sqlite`
  so the numbers above stay reproducible.

- `src/dev/p10_014aCloneProbeEntry.js` — the clone's pragma line now carries
  `synchronous = NORMAL` too. **Found by the pre-push `/code-review high`, not by
  the work itself.** That clone is installed as the shared connection via
  `setP10CloneLedgerDbOverride`, and `getLedgerDb()` returns it *before* reaching
  its own pragma block, so the clone's setup line is the only place outside
  `ledgerDatabase.js` that must mirror the connection contract. It listed the old
  three pragmas and was not updated with the fourth — meaning the diagnostic
  clone-probe build still ran the ledger at FULL, the exact timing-dependent
  inconsistency this audit set out to remove, and running the V7 device harness
  after the clone probe in the same session would have failed with
  `synchronous_not_normal` for a reason that was not a real config defect.
  The first version of `phase15-sqlite-operational-config.test.cjs` exempted that
  whole file from the single-owner check, which is why its own gate did not catch
  it; the exemption is now paired with a positive assertion that the clone setup
  line carries all four pragmas.

The static half of that test was mutation-tested four ways before being trusted,
each mutation applied and reverted:

1. reintroducing `PRAGMA synchronous = NORMAL` into `activeLedgerRepository`'s
   bootstrap → **caught** (single-owner assertion);
2. changing the pinned value in `ledgerDatabase.js` to `OFF` → **caught**;
3. renaming the harness failure code so the runtime check no longer fails closed
   → **caught**;
4. dropping `synchronous` from the P10-014A clone's pragma line → **caught** (by
   the assertion added after the review finding above).

The benchmark half deliberately asserts only the *direction* (FULL not faster per
commit; batching cheaper than per-commit at FULL) and reports rather than fails if
the ratio is small on a given machine — a hard ratio would make the quality gate a
flaky hardware benchmark.

## Open §102 items (not closed by this document)

1. **Crash-safety evidence for `synchronous = NORMAL`** — now **half closed**.
   `tests/phase15-sqlite-reliability-probes.test.cjs` executes a real
   kill-after-commit probe in CI and proves a committed row survives a `SIGKILL`
   with no clean close and no checkpoint (see
   `MYFI_PHASE15_RELIABILITY_PROBES_2026-09-04.md`). That covers the
   application-crash case. It does **not** cover power loss or an OS crash —
   a `SIGKILL` leaves the OS page cache intact, and power loss is the only thing
   NORMAL actually trades away versus FULL. That half still needs device work,
   and the device harness's own kill probes remain `PENDING_EXTERNAL_ADB_RUNNER`.
2. **Checkpoint policy** — no value, no evidence, deliberately left alone pending
   WAL-size measurement (§98).
3. ~~**FK-violation probe**~~ — closed by
   `tests/phase15-sqlite-reliability-probes.test.cjs`, which now executes a real
   FK-violation fault in CI and asserts the whole transaction rolls back.
