# MYFI — History read path: what is actually left, and what it would cost

Date: 2026-09-04
Session: Implementation 5
Status: **investigation and sizing only. No code changed, nothing removed.**
Requested by Planning & Audit after the Phase 15 gap analysis.

## First: correcting my own audit

The gap analysis said "the finance read cutover has not happened." That is wrong,
and the reasoning behind it was weak: it rested on
`grep -rn "readCutover|CANONICAL_READ" src` returning nothing, which tests a
guess about naming, not behaviour. The real mechanism uses different words.

What actually exists:

- `R04_OPERATIONAL_CUTOVER_ENABLED = true` (`useSyncSlice.js:181`).
- `activateFinancialV7Cutover` (`useSyncSlice.js:2065`) runs as a maintenance
  operation, verifies a vault checkpoint against live state first
  (`sameWorkspaceData`, refusing on `cutover_checkpoint_verification_failed`),
  then calls `runFinancialOperationalCutoverV7`.
- It is **automatic**: `loadLocal` triggers it whenever the shadow migration
  reports `migrationReady === true` (`useSyncSlice.js:2411-2413`).
- Once done, `ledger_workspace_state_v7.source_mode = 'sqlite'`, and `loadLocal`
  takes an early-return branch that hydrates state from **SQLite**
  (`readFinancialWorkspaceV7`, `useSyncSlice.js:2296-2323`) rather than the vault.
  The comment there is explicit: "once V7 is operational, the legacy relational
  mirror is frozen."

And HistoryScreen is not innocent of SQL either: it imports and calls
`queryLedgerTransactions` (`HistoryScreen.js:22, 302`) with cursor pagination,
search, class/category/wallet/scope/date filters — PA's reading was right.

So the correct framing is not "History never got migrated." It is: **History
runs SQL behind an in-memory safety net, and the net is still load-bearing.**

## (1) When does the fallback actually trigger?

Two distinct cases, and the first is not an edge case at all.

**Always, briefly, by design.** The effect at `HistoryScreen.js:340-355` runs on
mount and on every change to `trans`, `search`, `typeF`, `catF`, `walletF`,
`periodF`, dates or namespace. It unconditionally sets `setLedgerQueryOk(false)`
and schedules the SQL query 120 ms later. Since `filtered = ledgerQueryOk ?
ledgerRows : filteredFallback` (line ~357), **the in-memory list renders first on
every single one of those events**, including first load, and SQL only takes over
once the query returns. The code says so plainly: "Show the fresh in-memory rows
immediately after a mutation."

**Persistently, on any of:**

- the query throws (caught, logged as "using compatibility fallback"),
- `result.supported` is false,
- the coverage check fails:
  `ledgerPageCoversFallback(visible, filteredFallback, 250)` requires **every**
  id among the first 250 in-memory filtered rows to appear in the SQL page. One
  missing id rejects the entire page and pins History to the in-memory list until
  the next effect run.

That check is strict by construction, and deliberately so — the comment says a
lagging mirror "must never erase rows that are already present in the active UI
cache."

**How often the persistent case fires in practice cannot be determined from the
code.** It depends on whether a given device has actually reached
`source_mode='sqlite'`, and on whether the SQL page and the in-memory list agree
on ordering and filter semantics. Both are device facts. Nothing in the repo
records them, and I did not run the app. **This is the single biggest unknown in
this sizing** — see "what to measure first".

## (2) Is `trans` resident regardless? Yes. Removing the fallback saves ~nothing.

`HistoryScreen.js:163` destructures `trans` from the store; line 172 derives
`scopedTrans` from it unconditionally; `filteredFallback` re-filters it on every
render. But that is downstream of the real fact:

- **Pre-cutover:** `loadLocal` reads the whole vault workspace into `trans`, then
  *pushes* it into SQLite via `replaceLedgerSnapshot` (`useSyncSlice.js:2395`).
  SQLite is a mirror written from memory.
- **Post-cutover:** `loadLocal` reads from SQLite — but still with
  `transactionLimit: 2000` (`useSyncSlice.js:2301`), and still into `trans`.

So the store holds up to 2,000 transactions either way, before History renders
anything. Deleting History's fallback would remove a *filtered copy*, not the
underlying array. **Memory saving from the fallback removal alone: approximately
zero.**

Worth noting for §98: post-cutover the bootstrap is already **bounded** at 2,000
rows rather than unbounded. That is not the same as §98's "must not fetch the
whole ledger" being satisfied — 2,000 rows is still eager, and at the 25K/50K/100K
tiers it silently truncates what non-SQL screens can see — but it does mean the
memory story is less dire than the gap analysis implied.

## (3) Size of the remaining work

Three separable pieces, and only the first is a History task.

**A. Remove History's in-memory fallback — small, hours, contained.**
Touches `HistoryScreen.js` (the `filteredFallback` memo ~lines 230-291, the
`ledgerQueryOk` branch, the 120 ms effect) and `lib/history.js`
(`ledgerPageCoversFallback` becomes dead). `queryLedgerTransactions` already
covers every filter History offers, so no repository work. Realistic estimate
**half a day including tests**, and it is genuinely contained — no other screen
imports `ledgerPageCoversFallback`.
Caveat: this only makes History *display* SQL unconditionally. It does not make
the app SQL-first, and on its own it buys no memory (see 2).

**B. Stop hydrating `trans` eagerly — days, and it is not a History task.**
This is where §98 actually lives. 16 components read `trans` from the store
(13 screens + `AddTransModal`, `HomeCenterModal`, `NewItemModal`), and several
scan the whole array — e.g. `ReportsScreen.js:161` filters all of `trans` by
scope even though Reports also uses `queryLedgerCategorySpend`. Each consumer
needs its own bounded query or a scoped selector. This is a multi-day
refactor with real regression surface across the app, and History is a small
part of it.

**C. Decide what the 2,000-row cap means at the stress tiers — analysis, not
code yet.** At the 25K/50K/100K tiers, any consumer reading `trans` sees a
truncated ledger. Whether that is already a correctness problem (as opposed to a
performance one) is an open question I did not chase, and it may matter more than
either A or B.

**Sequencing opinion:** A is cheap but low-value alone. B is the real work and
does not need A first. C should be answered before B, because it may change what
"bounded" should mean.

## (4) Risk in removing the fallback

The fallback was built as a safety net for a specific thing: SQLite being a
**mirror written from the in-memory store**, which could lag or diverge. In
shadow mode that risk is real and the net is correct.

Post-cutover, both paths read from the same SQLite, so the original risk mostly
dissolves — but the net now also silently covers a *second* class of problem it
was not designed for: bugs in the SQL query's filtering or ordering. Today those
degrade invisibly into "History quietly used the in-memory list." Remove the net
and the same bug becomes visibly wrong rows on screen.

That is an argument for removing it **with instrumentation, not before it**.

## What to measure first (cheap, and it decides everything above)

Before any removal, answer on a real device, in one diagnostic pass:

1. Is this device actually at `source_mode='sqlite'`? (One read of
   `ledger_workspace_state_v7`.)
2. How often does the coverage check reject a page in normal use? A counter
   incremented at `HistoryScreen.js:324` would answer it in a day of dogfooding.
3. Does the SQL page and the in-memory filtered list agree on ordering for the
   same filters at the 25K tier?

If (2) shows the reject path effectively never fires post-cutover, removal is
low-risk and A becomes a genuinely small change. If it fires regularly, the net
is hiding a real defect and removing it would surface bugs, not fix them —
which is worth knowing either way, and is a better first move than either
removing or keeping it on argument alone.

**No recommendation is made here on timing.** That is the owner's call, and the
sizing above is offered so the decision rests on numbers rather than a guess.
