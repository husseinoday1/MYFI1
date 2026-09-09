# Implementation spec — why adding a transaction/commitment slows at 25K–50K

Author: Planning & Audit
Date: 2026-09-09
Status: **spec only.** Nothing implemented. Needs PA review (diff + tests +
mutation tests) before any commit, per this session's standing procedure.

---

## 1. This task is measurement. It is not a fix.

The owner reports that adding a transaction or a commitment becomes noticeably
slow at the 25K and 50K tiers, while History itself stays smooth.

**Do not fix anything in this task.** Do not optimise a step because it looks
slow. Do not conclude a cause before the numbers exist. The deliverable is
step-level timings from a real device and a written conclusion about which step
dominates — nothing else.

This constraint is not ceremony. On 2026-09-08 an initial read of "how big is
this" was wrong three separate times on the V7 staging work, and each
correction only came from measuring. Most recently, PA's own fix priority was
corrected by Codex's independent measurement (double-build and redundant
UPSERTs mattered more than the batching everyone assumed was the problem).

---

## 2. Follow the `missing_postings` precedent exactly

`getLedgerDataHealth` (`src/lib/activeLedgerRepository.js:1039-1047`) is the
model. Read it before writing anything:

```js
// The optional hook is deliberately duration-only instrumentation for the
// performance-lab startup proof. It receives structural step names only;
// no health counts, account IDs, or financial rows leave this function.
const diagnosticStep = name => {
  try { onDiagnosticStep?.(String(name)); } catch {}
};
```

Everything that matters is in that shape:

- an **optional** hook — the production path is unchanged when nothing is
  listening;
- **duration-only** — the hook receives a step *name*, and the caller times
  between calls;
- **structural names only** — no counts, no ids, no financial values;
- **`try/catch` around the hook** — instrumentation must never be able to break
  the operation it measures.

Wire the same hook shape into the add path. Do not invent a new mechanism, and
do not use `console.log`.

---

## 3. The steps to instrument — both layers, not just SQL

The likely answer is **not** in one layer, so instrumenting only one would
produce a confident wrong conclusion.

### Layer A — the store action (`addTrans`, `src/store/slices/transactionsSlice.js:38`)

Named steps, in order:

1. `wallet_position` — `walletPositionForCommand(get, tx.walletId)`
2. `ledger_commit` — `commitFinancialTransactionV7` /
   `commitExpenseToFinancialLedgerV7` (the whole call, as one step here; layer
   B breaks it down)
3. `store_set` — the `set(s => ({ trans: [tx, ...s.trans], ... }))` update
4. `save_local` — `await get().saveLocal()`
5. `schedule_sync` — `scheduleCloudSync?.('transaction_change')`

### Layer B — inside the commit (`commitFinancialLedgerV7Command`, `src/lib/financialLedgerV7Repository.js` ~4262)

Named steps, in order:

1. `db_handle` — `getLedgerDb()`
2. `schema_ensure` — `ensureFinancialLedgerV7(db)`
3. `write_queue` — time spent waiting inside `enqueueWrite` before the body runs
4. `txn_begin` — acquiring `runLedgerExclusiveTransaction`
5. `idempotency_lookup` — the existing-row `getFirstAsync`
6. `currencies_accounts_rates` — the currency/account/exchange-rate upserts
7. `insert_transaction` — the main row insert
8. `insert_postings_links` — postings + transaction links
9. `entity_changes` — `prepareLocalEntity` + `upsertEntity` loop
10. `outbox` — `insertFinancialTransactionOutbox`
11. `generation` — `advanceActiveFinancialGenerationInTransactionV13`
12. `read_back` — `readFinancialTransaction`
13. `txn_commit` — COMMIT

`write_queue` and `txn_begin` are separated on purpose: "waiting for another
write to finish" and "waiting for the database lock" are different problems
with different fixes, and a combined number cannot tell them apart.

### Commitments

Do the same for the add-commitment path. If it shares `addTrans`, say so
explicitly in the report rather than silently measuring only one and implying
both.

---

## 4. How to measure

- **Three sizes minimum: 200, 25K, 50K.** One data point cannot show a scaling
  shape. 200 is the control — if a step is slow there too, it is not a scale
  problem.
- **Real device, V7 path.** The performance lab now runs V7 (`enterDemoMode` →
  `ensurePerformanceTestLedgerV7` → `runFinancialOperationalCutoverV7`), so lab
  numbers are production-path numbers. Confirm `cutover: true` in Diagnostics
  before trusting any run — an earlier round of measurements was invalidated
  because the lab was silently on the V6 path
  (`MYFI_PHASE15_DATASET_TIER_V7_GAP_2026-09-06.md`).
- **Several adds per tier, not one.** Report the spread, not a single sample;
  the first add after a tier loads may behave differently from the fifth.
- **Report every step every time**, including the fast ones. A step that is
  reliably 0–1ms at 50K is a real finding: it rules that step out.

---

## 5. What the report must contain

1. A table: step × tier, with times.
2. Which step dominates at 50K, and whether it grows linearly, worse than
   linearly, or is flat.
3. Which steps are ruled **out**.
4. Whether commitments differ from transactions.
5. An explicit statement of what you did **not** measure.

Then stop. The fix is a separate task, scoped from these numbers.

---

## 6. Hypotheses — recorded so they can be falsified, not pursued

Written down only so the measurement is not quietly steered toward them. **Do
not optimise for these. If the numbers contradict them, the numbers win and
that is the valuable result.**

- `store_set` spreads a 25K–50K element array on every add, and any selector
  derived from `trans` (the transaction index) rebuilds afterwards.
- `save_local` may serialise and encrypt the whole workspace on every add.
- `wallet_position` may scan all in-memory transactions.

All three are plausible and none is verified. It is entirely possible the real
answer is in layer B and all three of these are noise.

---

## 7. Verification required before PA review

- The hook must be **optional and inert when absent** — assert that the add
  path behaves identically with no hook attached.
- Assert the hook receives **only** step names: a test that fails if any
  amount, id, or row content is passed through it. This is the same privacy
  rule as `onDiagnosticStep`, and it is testable.
- Assert a **throwing hook cannot break the add** — pass a hook that throws and
  confirm the transaction still commits. The `try/catch` in the precedent
  exists for this reason.
- **At least two mutation tests**, applied and reverted, each confirmed to fail
  the suite: (i) remove the `try/catch` around the hook, (ii) pass a financial
  value into a step name.
- Full gate green, with pass/fail/skip counts reported.
- **Financial impact: expected NONE.** This is additive instrumentation on an
  existing path. If your change turns out to alter any write, ordering, or
  transaction boundary, stop and say so — that would mean the task grew beyond
  measurement and needs re-scoping before it goes further.
