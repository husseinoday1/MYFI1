# MYFI — Phase 15's dataset-tier lab measures the wrong code path

Date: 2026-09-06
Status: **investigation only, nothing implemented.** Owner explicitly chose to
document and defer rather than rush a fix in this session.

---

## The finding

The owner ran all five dataset tiers (200 / 5,000 / 10,000 / 25,000 / 50,000)
on a real device, restarting between each so `historyReadPathTelemetry`'s
counters (never reset except by process restart —
`resetHistoryReadPathTelemetry` has zero callers anywhere in the app) would
report each tier in isolation. Two things came back:

1. Reject rate did **not** scale with size the way expected: 200 → 0.2222,
   5,000 → 0.6364, 10,000 → 0.3448, 25,000 → 0.4545, 50,000 → 0.0000 (clean).
   Bigger was sometimes *better* than smaller, which is backwards from "more
   rows, more chance of a coverage mismatch."
2. Every single tier reported `cutover: false`, `sourceMode: "—"` in
   Diagnostics — **not once, across all five, not just some.**

(2) explains (1), and it changes what the whole exercise measured.

## Root cause, traced to the actual code

`enterDemoMode` (`src/store/slices/dataSlice.js`) deliberately keeps demo data
off the V7 cutover path. Its own comment says why:

> Test workspaces use the lightweight V6 query ledger. A stale V7 cutover
> marker from an older test run would otherwise return zero summaries while
> the visible fixture rows are present in History.

It calls `clearFinancialWorkspaceV7` and writes through `replaceLedgerSnapshot`
into the older `ledger_transactions` table — never
`runFinancialShadowMigrationV7` / `runFinancialOperationalCutoverV7`, the pair
every real account goes through at cutover (see `dataSlice.js` ~520-541 for an
existing call site using exactly that pair, so the mechanism itself is
proven — just never wired to the demo path).

So `queryLedgerTransactions` routes every demo-mode query to the **legacy V6
branch** (`openDb()` + `ledger_transactions`, `ORDER BY date_iso DESC, ts DESC,
id DESC`), never to `queryV7TransactionPage` (the V7 branch, the one the
2026-09-05 year-filter fix lives in, the one real cutover accounts actually
use).

## What this means for today's numbers

**Every §96/§97/§98/§100 number gathered from the dataset-tier lab today —
including the p50/p95 latencies — describes the V6 legacy path, not the V7
path a real user is on after cutover.** The two branches are different code
with different query shapes (V6's `ledger_transactions` is a flatter table;
V7's `ledger_financial_transactions_v7` joins through `ledger_postings_v7` for
wallet-scoped filters). A number that is fine on V6 says nothing certain about
V7 at the same size, and vice versa.

This also plausibly explains the non-monotonic reject rate: the V6 branch's
sort key (`ts`) matches the in-memory fallback's tie-break exactly (both use
`ts`), so a coverage rejection there is *not* the same class of mismatch the
V7 path could produce (V7 ties on `occurred_at`, a different field from the
in-memory sort's `ts` — a real, separate, so-far-unverified risk on the V7 side
that this investigation did not get to, precisely because the lab never
exercises it). The variance actually observed is more likely filter-switching
noise between sessions than a size effect — but this is not confirmed either,
because confirming it requires the V7 path to be actually running.

## Why this is not a quick fix

The mechanism exists (`runFinancialShadowMigrationV7` +
`runFinancialOperationalCutoverV7`) and is not new code. What makes this a real
investigation rather than "add two calls" is `financialLedgerV7Cutover`
gating dozens of other code paths this session touched today alone — sync
activation, Home's SQL-vs-fallback split, Reports' same split, the identity
adoption work. None of those have ever been exercised with
`cfg.demoMode: true` and `financialLedgerV7Cutover: true` at the same time,
because that combination has never existed. Making it exist requires checking
each of those paths behaves safely on a demo namespace, not just wiring the
migration call.

Given three separate scope corrections already happened today on unrelated
work by trusting a first read of "how big is this" (see
`MYFI_FULL_RESOLUTION_DESIGN_2026-09-05.md` §B, §B2, §B3), this was
deliberately not scoped further under time pressure. It needs its own session.

## What is actually true about Phase 15 right now

| Item | Status |
|---|---|
| §97 p50/p95 on V7, normal-sized real usage | ✅ measured and confirmed on device (45-47ms / 61-64ms), separate from this lab |
| §96/§98/§100 on V7, at scale | ❌ **still unmeasured** — this gap is why |
| §96/§100 on V6 (legacy), at scale | Measured today, but describes a path no real user is on after cutover |
| §98 memory, any path | ❌ not measured at all yet |

## Recommended next step (not started)

Make `enterDemoMode` run the same shadow-migration + cutover pair real
accounts use, namespaced under the existing `performanceTestMode` isolation
(already proven safe: never synced, separate storage key, one-tap exit).
Before wiring it, audit every `financialLedgerV7Cutover`-gated path this
session touched for demo-namespace safety, in particular:

- `HomeScreen.js` / `ReportsScreen.js`'s SQL-vs-in-memory-fallback split
- `useSyncSlice.js`'s activation/eligibility checks — must not attempt real
  network activation against a demo namespace
- The identity-adoption gate added today — must not treat a demo namespace's
  local ledger as eligible for adoption
