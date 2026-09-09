# Codex spec — Phase 15: baseline p50/p95 instrument + SLO thresholds

Author: Planning & Audit
Date: 2026-09-09
Status: **spec only.** Nothing implemented. Needs PA review (diff + tests +
mutation tests) before any commit, per this session's standing procedure.

---

## 1. Scope — exactly four operations, nothing more

| # | Operation | What starts the clock | What stops it |
|---|---|---|---|
| 1 | Cold start | process start / app entry | app is interactive (first usable frame after `ready`) |
| 2 | Open Home | Home tab selected | Home's own data is on screen |
| 3 | First History page | History opened | the first SQL page has resolved |
| 4 | Save a new transaction | user confirms the save | the save has fully settled (see §4) |

**Do not add a fifth.** No Reports, no search, no sync, no archive. If a fifth
looks obviously worth adding while you work, write it down and leave it — the
value of this task is a small instrument that lands, not a complete one that
does not.

---

## 2. Reuse the existing machinery — do not write a second one

`src/lib/historyReadPathTelemetry.js` already implements exactly this shape and
already encodes lessons that were paid for:

- `percentile()` — nearest-rank, deliberately not interpolated, so p95 names a
  query that actually happened.
- A bounded ring (`MAX_DURATIONS = 200`), oldest evicted first, so a long
  session cannot grow it and the percentiles describe recent behaviour.
- `recordHistoryLedgerQueryDuration`'s guard: `typeof durationMs !== 'number'`
  **before** any coercion. Read the comment there. A bare `Number()` records a
  missing measurement as a 0ms operation and silently drags p50 down — the same
  `Number(null) === 0` trap that emptied every History page until 2026-09-05,
  reintroduced within an hour of fixing it and caught only by a test that
  asserted junk input is *rejected* rather than only that good input works.
- `null` rather than `0` when nothing was observed, so "not measured" can never
  be misread as "instant".

**Operation 3 is already instrumented by this module.** Do not duplicate it.
Fold it into whatever shared shape you build so all four report identically —
one module, four operation keys, one percentile implementation.

---

## 3. Rules that are not negotiable

1. **Durations and structural names only.** No amounts, no ids, no account
   identifiers, no row contents. The precedent is `getLedgerDataHealth`'s
   `onDiagnosticStep` hook (`activeLedgerRepository.js:1039-1047`) — read its
   comment. This surface is copyable to the clipboard from Diagnostics.
2. **No new DB read and no new sync call on a render path.** See
   `MYFI_PHASE15_HISTORY_READ_PATH_TELEMETRY_2026-09-04.md` §"Why not read
   outbox count directly" for why this rule exists.
3. **Module-level counters, not store state.** Writing to Zustand on every
   measured operation re-renders the very screen being measured.
4. **A reachable reset.** `resetHistoryReadPathTelemetry` currently has **zero
   callers anywhere in the app** — which is why the owner had to fully restart
   the app between each dataset tier on 2026-09-08 to get isolated numbers.
   The new instrument must expose a reset the owner can actually press.

---

## 4. The one genuinely ambiguous boundary — decide it explicitly

Operation 4 ("save a new transaction") has at least three defensible stop
points, and they differ by orders of magnitude at 50K rows:

- (a) the SQLite commit returns;
- (b) the store state is updated and the UI reflects the new row;
- (c) `saveLocal()` has finished writing the encrypted snapshot.

**Pick one, name it in the code comment, and record why.** Do not measure (a)
and label it "save", because the owner's complaint is about what he
experiences, which is closer to (b) or (c). If you measure more than one
boundary, report them as separate named keys — never as one blended number.

This is deliberately left to you because it is a measurement-design judgement,
not a preference. Whatever you choose, the spec for task 2
(`implementation_add_operation_scale_slowdown_spec.md`) breaks this same
operation into steps, so keep the naming compatible with it.

---

## 5. SLO thresholds

### Evidence available right now

Real V7 path, ordinary account, measured on device 2026-09-05/06:
**History first page p50 45–47ms, p95 61–64ms** (33 and 50 samples). These are
the only production-path numbers that exist for any of the four operations.

Scale numbers across 200 / 5K / 10K / 25K / 50K exist from the 5-tier device
runs — see `MYFI_PHASE15_V7_REUSE_PROOF_ROOT_CAUSE_2026-09-09.md` and the
device-results evidence it references. Note that
`MYFI_PHASE15_DATASET_TIER_V7_GAP_2026-09-06.md` describes a period when the
lab ran the **V6** path; that gap has since been closed (`enterDemoMode` now
calls `ensurePerformanceTestLedgerV7`, which runs
`runFinancialOperationalCutoverV7`). Do not cite that doc as current state.

### What to propose

For each of the four operations, propose a p50 and p95 threshold, and label
each one:

- **evidence-based** — derived from a real measured number, cite it; or
- **provisional** — a placeholder that needs a device run to confirm.

Being honest that three of the four have no baseline yet is the correct
outcome. Do not invent numbers that look authoritative.

### What NOT to decide

**Do not define what happens when a threshold is breached.** Whether a breach
blocks a release, warns, or is only recorded is a product/risk call for the
owner. Propose the numbers; leave the enforcement policy as an explicit open
question.

---

## 6. Also required: correct the stale SLO doc

`docs/MYFI_PERFORMANCE_SLO.md` currently states:

> لا توجد حتى الآن أي أدوات قياس p50/p95 في `src/`

That has been false since 2026-09-05. Correct it in the same change, and
follow the correction style already used in that file (state what was said,
what is now true, and the date) rather than silently rewriting the line.

---

## 7. Verification required before PA review

- Unit tests that **execute** the percentile and recording logic against
  fixtures — not string-presence checks on the source.
- Explicit junk-input coverage for every recording entry point: `null`,
  `undefined`, `NaN`, `Infinity`, `-1`, `'42'`. Each must be rejected, and `0`
  must remain valid (a genuinely fast operation can measure 0 on a `Date.now()`
  diff).
- `null`-not-`0` asserted for every operation with no samples.
- Bounded-ring behaviour asserted: cap respected, oldest evicted, newest kept.
- **At least three mutation tests**, each applied and reverted, each confirmed
  to fail the suite: (i) replace the `typeof` guard with `Number()` coercion,
  (ii) raise or remove the ring cap, (iii) return `0` instead of `null` for an
  unmeasured operation.
- Full gate green, with the pass/fail/skip counts reported.

Report the mutation results as part of the handoff. A mutation that did **not**
fail the suite is the most useful thing you can tell PA — it means the test is
weaker than it looks, and that has happened three times in this project.
