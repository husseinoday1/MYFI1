# Codex handoff — Phase 15 device measurement

From: Implementation (Claude)
Date: 2026-09-09
Baseline: `418a19b` on `fix/pui-001-r2-onboarding-reader-recent-transactions`,
pushed, both CI runs green — Test Gate `34333544148`, APK `34333543861`.

You are picking this up cold. Everything you need is below; you should not need
to re-derive anything from the previous session.

---

## 1. What your job is, and what it is not

Two instruments were built and shipped. **Neither has ever produced a number
from a real device.** Your job is to get those numbers.

**You are not fixing any slowness.** Not yet, not opportunistically, not even if
a step is obviously the culprit the moment the table comes back. The fix is a
separate task, scoped from the numbers. Three scope estimates on the V7 staging
work were wrong this month, and each was corrected only by measuring first.

The owner runs the phone. You give him **literal steps**, he executes and pastes
back the evidence. Vague instructions have stalled this work twice before, so
write steps a tired person can follow without interpreting anything.

---

## 2. What is instrumented, and where the numbers appear

Both surface in **Diagnostics**, reached by: Settings → About → tap the version
number **five times**.

### Instrument A — §97 p50/p95 (`src/lib/performanceTelemetry.js`)

Section titled **"قياس الأداء (§97)"**. Four operations only:

| key | what it times |
|---|---|
| `cold_start` | app launch to interactive (one sample per launch, persisted across launches) |
| `home_open` | Home tab selected → Home's data on screen |
| `history_first_page` | History opened → first SQL page resolved |
| `transaction_save` | user confirms a save → the row is in the store and renderable |

Each row shows observed p50/p95 with the sample count, its target, and whether
the target is `evidence-based` or `provisional`.

**Only `history_first_page` is evidence-based** (device-measured: p50 45–47ms,
p95 61–64ms). The other three targets are guesses labelled `provisional`, and a
test fails if anyone relabels a guess as evidence. Getting real numbers for
those three is the point of this exercise.

### Instrument B — add step timings (`src/lib/addOperationTiming.js`)

Section titled **"خطوات الإضافة (قياس)"**. 18 named steps across two layers:

- **Store layer (5):** `wallet_position`, `ledger_commit`, `store_set`,
  `save_local`, `schedule_sync`
- **Ledger commit (13):** `db_handle`, `schema_ensure`, `write_queue`,
  `txn_begin`, `idempotency_lookup`, `currencies_accounts_rates`,
  `insert_transaction`, `insert_postings_links`, `entity_changes`, `outbox`,
  `generation`, `read_back`, `txn_commit`

`write_queue` and `txn_begin` are separate on purpose: waiting for another write
to finish and waiting for the database lock are different problems with
different fixes, and one combined number cannot tell them apart. Do not merge
them in your report.

Commitments are recorded separately from transactions (`operation: 'commitment'`
vs `'transaction'`) because their shape differs — an entity commit with no
postings. Do not assume they behave alike.

### The reset button

**"تصفير عيّنات الأداء"** in the §97 section clears **both** instruments in one
press, then re-reads. This exists because `resetHistoryReadPathTelemetry`
shipped with zero callers, which forced the owner to fully restart the app
between every dataset tier on 2026-09-08 to get isolated numbers. Use the
button; he should not have to restart anything.

---

## 3. The device protocol — give him these steps

The dataset tiers are at: Settings → البيانات والتخزين → **مختبر بيانات الأداء**
(200 / 1,000 / 5,000 / 10,000 / 25,000 / 50,000). The lab runs the **V7** path
(`enterDemoMode` → `ensurePerformanceTestLedgerV7` →
`runFinancialOperationalCutoverV7`), so these are production-path numbers.

**Confirm `cutover: true` in Diagnostics before trusting any run.** An earlier
round of measurements was invalidated because the lab was silently on the V6
path (`MYFI_PHASE15_DATASET_TIER_V7_GAP_2026-09-06.md` describes that period;
it is closed, but verify rather than assume).

### For each tier — 200, then 25K, then 50K

1. Load the tier from the performance lab.
2. Diagnostics → press **"تصفير عيّنات الأداء"**.
3. Open **Home**, go back, repeat — at least 5 times.
4. Open **History**, scroll, change a filter, go back — at least 5 times.
5. **Add a transaction** — at least 5 times.
6. **Add a commitment** — at least 5 times.
7. Diagnostics → **"نسخ الكل"** → paste the whole evidence blob back.

Tell him explicitly: **do not skip the reset between tiers**, or the tiers blend
and the whole run is wasted.

### Cold start, separately

`cold_start` records one sample per launch and persists across launches, so it
needs the app fully closed and reopened **several times** (5+) to have anything
worth a percentile. This can be done once at whichever tier he is on; note which
tier it was.

---

## 4. What to produce when the numbers arrive

1. **A step × tier table**, per operation (transaction and commitment separately).
   Every step, every tier, including the fast ones — a step that is reliably
   0–1ms at 50K is a real finding because it rules that step out.
2. **Which step dominates at 50K**, and whether it grows linearly, worse than
   linearly, or is flat. The scaling shape is the answer, not the single worst
   number.
3. **Real p50/p95 for the three provisional operations**, and proposed threshold
   updates with the evidence label flipped to `evidence-based`.
4. **What you did not measure.**

Then stop and hand it to Planning & Audit. The fix is the next task.

---

## 5. Standing rules in this project

1. **No fix for any slowness until the numbers are back and reviewed.**
2. **No commit before Planning & Audit reviews** the diff, the tests, and the
   mutation results.
3. **A performance number is only real if it came from the device.** Node/CI
   timings are not performance evidence here.
4. **Mutation-test every guard you add**: apply a mutation, confirm the suite
   fails, revert, confirm it passes. Report any mutation that did *not* fail —
   that is the most useful thing you can report, because it means the test is
   weaker than it looks. That has happened three times in this project.
5. Builds are CI-only. Confirm green **by run ID**, not by assumption.

---

## 6. Traps this project has actually hit — worth your attention

- **`Number(null) === 0`.** A bare `Number()` coercion records a *missing*
  measurement as a 0ms operation and silently drags p50 down. This emptied every
  History page until 2026-09-05, and was then reintroduced in the duration
  recorder within the hour. Both instruments now guard with `typeof` first.
  Do not "simplify" that.
- **Instruments that ship unreachable.** Three times now: a reset with zero
  callers, then §97's read/reset/evaluate with zero callers (caught in review),
  then the add hook with nobody passing it (caught before commit). If you add
  anything, assert that it is *called*, not that its symbol exists.
- **`null` is not `0`.** An unmeasured operation reports `null` everywhere, so
  "not observed" can never be misread as "instant".
- **Blended numbers hide the answer.** The per-run table is carried in the
  evidence deliberately; do not report only an average.

---

## 7. One boundary decision you should know about

`transaction_save` is timed to **the row being in the store and renderable** —
not the SQLite COMMIT, and not `saveLocal` finishing.

COMMIT alone would flatter the number: what the owner waits for when he says
adding feels slow is the row appearing. `saveLocal` is real cost but runs after
the UI can already paint, so folding it in would charge the visible save for
work nobody is watching — it is measured separately as the `save_local` step in
instrument B instead.

`addTransfer` is deliberately excluded: different shape, and blending it with
`addTrans` would give a p50 describing neither. If the owner reports transfers
feeling slow, that is a separate measurement, not an edit to this key.
