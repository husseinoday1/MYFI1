# MYFI — History read-path instrumentation (diagnostic only)

Date: 2026-09-04
Session: Implementation 5
Scope: **diagnostic only.** The fallback is NOT removed, no read-path behaviour
changes, and nothing from parts (B) or (C) of the sizing was touched.

Follows `MYFI_PHASE15_READ_CUTOVER_SIZING_2026-09-04.md`, which ended by saying
the cheapest next step is to measure two things that source code cannot answer.
This adds exactly those two measurements and nothing else.

## What it measures, and the distinction that makes it worth anything

HistoryScreen falls back to the in-memory list in two very different situations,
and conflating them would make the number useless:

1. **The by-design first paint.** On mount and after every mutation or filter
   change, the screen deliberately shows the in-memory list until the SQL query
   returns ~120 ms later. This happens on essentially every interaction. It is
   intentional, and it is **not counted**.
2. **A returned SQL page that was refused** — `ledgerPageCoversFallback` found an
   id in the in-memory list missing from the SQL page, or the query threw or came
   back unsupported. **This is the number nobody had**, and the one that decides
   whether the fallback can be removed safely.

Counting (1) would report a reject rate near 100% and make the fallback look
permanently load-bearing regardless of the truth.

## What was added

- `src/lib/historyReadPathTelemetry.js` — module-level counters
  (`accepted`, `rejectedCoverage`, `unsupported`, `errored`, `rejectRate`) plus a
  bounded 10-entry ring of recent rejections carrying **sizes and which filters
  were active only** — never row contents, because this surface is copyable to
  the clipboard. Counters are module-level rather than in the store on purpose:
  writing to Zustand on every query would re-render the screen being measured.
- `src/dev/historyReadPathDiagnostics.js` — read-only collector reporting the
  device's real `ledger_workspace_state_v7.source_mode`, `cutover_at`, and
  whether a workspace-state row exists at all (distinct from existing in shadow
  mode), alongside the counters.
- Four recording sites in `HistoryScreen.js`, and a section in
  `DiagnosticsScreen.js` following the existing pattern.
- `tests/phase15-history-read-path-telemetry.test.cjs`, registered in the gate.

Gate: **172 passed, 0 failed, 11 skipped.** No schema change.

## Two measurement biases the pre-push review caught

Both would have produced a confident, wrong number — worse than no number.

1. **Appended pages were counted as `accepted`.** The coverage check only runs on
   first-page queries (`!append`), so every scroll would have added an `accepted`
   with no possibility of rejection, driving the reject rate toward zero for a
   reason unrelated to whether the fallback is needed. All four recording sites
   are now gated on `!append`, and the test asserts that gating structurally, so
   a future edit cannot quietly reintroduce the bias.
2. **Stale responses were counted** on the `unsupported` and `error` paths, which
   ran before the `requestId === ledgerRequestRef.current` staleness guard that
   the accepted/rejected paths already respected. A superseded response is not an
   outcome the user ever saw. Now gated consistently.

## Mutation testing

Applied and reverted, each confirming the test fails as it should:

1. recording a rejection inside the by-design pre-query effect → **caught**
   ("the by-design first paint must never be counted as a rejection").
2. raising the rejection-ring cap from 10 to 1000 → **caught**.
3. narrowing `rejectRate` to coverage rejections only, dropping unsupported and
   errored → **caught**.
4. removing the `!append` gate from the accepted site → **caught**, by line
   number.

Also asserted directly: `rejectRate` is `null` rather than `0` before anything is
observed, so "no data yet" cannot be misread as a perfect score; an unrecognised
outcome increments nothing; `readHistoryReadPathTelemetry()` returns copies so a
caller cannot mutate the counters; and a caller passing extra context (e.g. rows)
cannot leak it into a sample.

## How to read the result

Open Diagnostics → "History read path". The two useful facts:

- **`sourceMode`** — `sqlite` means this device is cut over and the fallback is
  guarding against a risk that has largely dissolved; `shadow` means it is still
  guarding a live one, and removal is not on the table for that device.
- **`rejectRate` after a day of normal use** — if it stays at 0 with a healthy
  `resolvedQueries` count, removing the fallback (part A of the sizing, roughly
  half a day) is low-risk. If it is non-zero, the net is hiding a real defect;
  `recentRejections` shows which filters were active, which is where to look
  first.

Counters reset on app restart — deliberate, since the question is about normal
use in a session, not a lifetime total.

## Still open, unchanged by this

Removal itself, the eager `trans` hydration (part B, days, 16 components), and
what the 2,000-row cap means at the 25K/50K/100K tiers (part C, possibly a
correctness question). None were touched.
