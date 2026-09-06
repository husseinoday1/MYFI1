# MYFI — handoff 2: tracker integrity, and where Phase 15 actually stands

Date: 2026-09-06
Supersedes nothing in `MYFI_HANDOFF_PHASE15_AND_SYNC_2026-09-05.md` — read that
one first, this continues it.

---

## 0. State

Branch `fix/pui-001-r2-onboarding-reader-recent-transactions`, **all pushed**,
HEAD `f289c62`. Local gate: **183 passed, 0 failed, 11 skipped.** Nothing is
being held back this time.

---

## 1. The year-filter fix is confirmed on a real device

Handoff 1 said History's SQL read had never returned a row and that the fix
needed device confirmation. It got it, on a clean account:

| | before | after |
|---|---|---|
| `rejectRate` | 0.8 | **0** |
| accepted | 3 of 18 | **33 of 33** |
| `sqlRows` | 0 always | real rows |

**So §97 now has its first real numbers: p50 45ms, p95 61ms over 33 samples.**
The SQLite read path is genuinely serving History for the first time.

---

## 2. A defect I shipped, and how it presented

Reported from the device: a 200 goal, released and undone four times, left the
wallet **800 higher**, and the released amount never came back out of the
available balance. Each undo looked like it worked.

Cause, in yesterday's undo: a goal release is written with `hiddenFromHistory`,
and `stateFromFinancialV7` filters those rows out of the in-memory list. The
undo looked for the release in `state.trans`, so after any reload it found
nothing, passed an empty id list to `voidFinancialTransactionsV7` — which
returns ok for an empty list — and reported success. The release's
`bucket:'reserved'` posting stayed in the ledger, the reservation never came
back, and every repeat release added another `-200`.

Fixed in `6f251c2`: the undo asks the ledger (`findGoalReleaseTransactionIdsV7`),
and **refuses** with `goal_release_undo_release_transaction_missing` when no
release is found. The silent no-op is what made this invisible, so the refusal
matters as much as the lookup.

### The general lesson

Two halves had to combine: a transaction **invisible to the in-memory list**,
and an operation that **reports success on an empty set**. Either alone is
harmless.

---

## 3. That class does not repeat elsewhere — checked, not assumed

The owner asked whether other trackers have the same problem. Traced every
writer and every lookup:

- **Hidden transactions exist only for**: the live goal release, the archive
  release, and two synthetic migration rows. Nothing else is ever hidden.
- **Debt payments, commitment payments and goal savings are all visible**, so
  the first half cannot apply to them.
- **Every one of their lookups already refuses on a miss**
  (`if (!currentTx) return false`), so the second half does not apply either.
- `deleteTransMany` refuses an empty selection.

`tests/tracker-hidden-transaction-lookups.test.cjs` pins the exact set of
hidden-transaction writers. **If someone adds a new hidden transaction type,
that test fails** and forces this reasoning to be redone rather than silently
inherited. That is the point of it.

---

## 4. An R04 contract was deliberately overridden

`tests/r04-phase6-9-contract.test.cjs` pinned: deleting a tracker is metadata
only, financial rows remain immutable history. Sound reasoning — the money did
move, and removing a label should not rewrite the record.

The owner overrode it after seeing the result: a deleted goal left its savings
and releases in History with nothing to explain them, which reads as corruption
rather than as history. He was told what the contract protected and what he
loses, and chose deletion.

**Applied to goals and debts together** (`f289c62`). Doing goals alone would
have left the app deleting history for one tracker type and keeping it for
another — worse than either rule applied consistently.

The assertion was **replaced, not deleted**. It now pins the part that is not a
preference: the sweep must come from the ledger, and transactions must be voided
before the entity is removed. The superseded rule and the reason it changed are
written above the new assertions, so the next reader sees a decision rather than
a gap.

**Known and accepted**: the cascade is not undoable. `deleteTrans`'s
single-transaction undo does not cover it.

---

## 5. Phase 15 — where it actually stands

| Item | Status |
|---|---|
| §97 p50/p95 | ✅ **complete and measured on device** — 45ms / 61ms |
| §99 SLO doc | ✅ |
| §101 reliability probes | ✅ |
| §102 SQLite config | ✅ (found and fixed a real durability bug) |
| §103 DB health | ✅ |
| §98 memory metrics | ❌ **needs a device** |
| §96 dataset tiers | ⚠️ **now measurable** — never re-measured since the fix |
| §100 100K policy | ⚠️ same |

**The honest summary**: everything that can be completed from a workstation is
done. What remains — §98, and re-measuring §96/§100 — requires running the
dataset tiers on a device and reading the numbers. That was blocked until today
because the read path returned nothing; it is unblocked now, and it is the
owner's to run.

I did not fabricate §98. It needs a device.

---

## 6. Still open

| Item | Note |
|---|---|
| §98 + re-measure §96/§100 | Device work, now unblocked |
| Adoption path vs. real Supabase | Still never executed against a live account. Largest untested risk in the shipped code. It is inert unless a device has a ledger-id conflict and someone presses through the review. |
| Goals undo on device | Fixed and mutation-tested; the button has not been pressed since the fix |
| Delete cascade on device | Shipped today, never exercised on a device |
| `inspectCloudIdentityAdoptionV1` | Exported, zero callers. Wire it or delete it. |
| History fallback removal | Now defensible for the first time (reject rate is 0), but not attempted |
| `myfitest67890` | `fe24d08` makes the device name which of five conditions blocks it; still unread |

---

## 7. The habit that found everything today

Every real defect this session came from breaking the code deliberately and
checking the test noticed. Three tests passed against a deliberately broken
implementation before being tightened.

The sharpest example: the §97 duration recorder had `Number(null) === 0`, so a
missing measurement was recorded as a 0ms query and would have dragged p50 down.
That is the *same defect class* as the year filter, reintroduced by me within
the hour, and it was caught only because the test asserted that junk inputs are
rejected rather than only that good inputs work.

Prefer an explicit `typeof` check over `Number()` coercion when absence is
meaningful.
