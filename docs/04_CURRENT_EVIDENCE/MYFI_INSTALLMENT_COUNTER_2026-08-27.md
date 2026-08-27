# Installment counter (auto-decrement) — evidence

**Session:** Implementation 5, 2026-08-27
**Branch:** `impl/nav-shell-step3-2026-08-26`
**Authorised by:** Planning & Audit 2 — "each installment payment decrements
remainingInstallments by one automatically", declared full Verification Floor
work (hand-written, reviewed line by line, no `ask_deepseek` delegation, plus a
repeat-action test).

## What was built

A commitment classified as `subType: 'installment'` can now carry a plan size,
and Follow-ups shows how many installments are left.

- `src/lib/commitments.js` — `totalInstallments` normalized into the single
  `normalizeCommitments` chokepoint every read and write already passes
  through. Only meaningful for `subType: 'installment'`; forced to `null`
  otherwise so a reclassified commitment cannot carry a stale plan size.
- `src/store/domain.js` — `commitmentPaidCycleCount` and
  `remainingInstallments`, placed beside the existing
  `latestCommitmentMonth`/`syncCommitmentPaidMonth` pair they mirror.
- `src/store/slices/managementSlice.js` — `addCommitment` passes the field
  through (one line). `editCommitment` needed no change: it already spreads
  normalized current state.
- `src/components/NewItemModal.js` — a numeric "Number of installments" field
  that appears only when Installment is selected.
- `src/screens/TrackersLabScreen.js` — the existing subType badge now reads
  "Installment · 2 of 3 left", or "Installments complete" at zero.

## The one design decision worth recording

**The counter is DERIVED from postings, never stored.**

Planning & Audit asked for "each payment decrements the counter by one". That
observable behaviour is delivered — but by deriving
`max(0, totalInstallments − paidCycleCount)` rather than by mutating a stored
number on each payment. Reasons, in order of weight:

1. **Financial contract rule 4** — every balance must be derivable from
   authoritative postings. A stored counter would not be.
2. **The codebase already does exactly this** for the adjacent field.
   `lastPaidMonth` is stored but continuously re-derived from transactions by
   `syncCommitmentPaidMonth`, and `financialIntegrity.js:84` actively audits
   the stored value against the derived one. A stored counter would be the
   only commitment payment state in the app with no such check.
3. **It makes the failure modes impossible rather than guarded.** "Stops at
   zero, never negative" falls out of `Math.max(0, …)` instead of depending on
   a guard in each of the four places `payCommitment` writes paid state (the
   unlinked path, the debt-linked path, the goal-linked path, and the ledger
   payload — a real duplication trap in that function).
4. **It stays correct through edit, delete, restore and sync replay.** The
   existing test "deleting a commitment transaction must reopen it" shows the
   app already expects commitment payment state to follow the ledger both
   ways. A stored counter would drift on every one of those paths.

This is a plain count of cycles. It is explicitly **not** an amortization
schedule — no interest/principal split — per the R04 contract freeze note in
`docs/MYFI_FINANCIAL_CONTRACT.md`.

## Financial impact check

```
Financial Data:      NONE — no stored money value changes meaning, precision
                     or units. remainingInstallments is a derived integer
                     count, not a monetary amount, and no total, balance,
                     posting or FX snapshot is read or written differently.
SQLite Schema:       NONE — totalInstallments is a key inside the existing
                     ledger_entities_v7.payload_json blob, the same low-risk
                     pattern subType used. FINANCIAL_SQLITE_SCHEMA_VERSION
                     stays 8, verified unchanged in
                     src/lib/financialLedgerV7Repository.js:22.
Migration Required:  NO.
Existing User Data:  PRESERVED — a commitment stored before this change has no
                     totalInstallments, normalizes to null, and renders the
                     plain "Installment" badge exactly as before. Confirmed
                     live: the pre-existing "Car loan" commitment created
                     earlier in the session still shows a bare "Installment"
                     badge with no count, beside a new plan that shows one.
Transfers/FX:        untouched — this change reads no transfer and no rate.
Backup/restore:      round-trip safe by construction — the derived value is
                     recomputed from restored postings rather than restored
                     as its own field.
Proof:               the repeat-action test below; test:database; test:gate:static.
```

## Repeat-action proof (the standing rule for anything with a counter)

`tests/financial-core.test.mjs`, in `runLinkedStoreAssertions`. It pays the
**same** 3-installment plan five times in a row, one cycle month at a time,
and asserts the whole observed sequence at once:

```
3 → 2 → 1 → 0 → 0 → 0
```

so the test fails if any payment decrements by the wrong amount, if the
counter passes zero, or if it goes negative. It further asserts:

- five distinct cycle months count as exactly five paid cycles;
- re-paying an already-settled cycle is refused (`already_paid`) and does not
  move the counter;
- **deleting a payment gives the installment back** — the property a stored
  counter could not hold, and the reason the derived design was chosen;
- a commitment reclassified away from `installment` drops its plan size;
- 15 explicit normalization cases, each asserting its own exact expected
  output (no disjunctions), covering `0`, `-4`, `'abc'`, `null`, `undefined`,
  `NaN`, `Infinity`, `''`, `601`, `1200`, `1.7`, `12`, `'12'`, `600`, `1`.

## Verification run

- `npm run test:logic` — all assertions passed (includes the new block).
- `npm run test:database` — schema contract (16 tables, RLS, workspace
  integrity), backfill helpers, and financial core all pass.
- `npm run test:gate:static` — **70 passed / 1 failed / 11 skipped**, exactly
  the documented pre-existing baseline. The single failure is the same
  long-standing `ui-contract` test; no new failure was introduced.
- `npm run verify:android` — clean export (6.19 MB android bundle).
- `/code-review` (medium) — **3 findings, all mine, all fixed before commit**:
  1. `normalizeTotalInstallments` clamped an out-of-range count to 600, so a
     typo of "1200" would have displayed "600 of 600 left" — a number the user
     never entered. Changed to fail closed to `null` (contract rule 5, no
     silent repair).
  2. `TrackersLabScreen` re-scanned the whole transaction array per row when
     the already-filtered `paymentRows` for that exact commitment was in scope
     one line above. Now passes `paymentRows`.
  3. The invalid-input test used `value === null || value === 2` for every
     case, which could not fail for most of them. Replaced with the 15
     exact-expectation cases listed above.

  Re-ran `test:logic` and `test:gate:static` after the fixes — both back to
  the same results.
- **Live Expo-web walkthrough** (`localhost:8098`, viewport 500x1400):
  - Opening the commitment form shows "Commitment type: General" and **no**
    installments field.
  - Selecting Installment makes "Number of installments" appear.
  - Saved "Phone plan", 30,000 د.ع, 3 installments → Follow-ups renders
    **"Phone plan · Active · Installment · 3 of 3 left"**.
  - Tapped its "Mark paid" → confirmed → the badge became
    **"Installment · 2 of 3 left"** and the next due date moved to 2026-09-27.
    One full decrement observed through the real user path; the walk to zero
    and the floor are covered by the repeat-action test.
  - The older "Car loan" commitment (no plan size) still renders a plain
    "Installment" badge — backward compatibility confirmed against real
    pre-existing data, not a fixture.

### Incidental fix

`commitmentSubType` was never reset when the commitment form reopened (a gap
in commit `7f87611`), so a previously chosen Installment/Subscription value
persisted into the next commitment the user created. Added to all three reset
sites alongside the new field. Confirmed live: reopening the form now shows
"General".

### Pre-existing console error, confirmed not ours

The web console logs `[STORE] loadLocal TypeError: Cannot read properties of
null (reading 'trans')` twice on boot. Confirmed pre-existing by stashing all
of this session's `src/` and `tests/` changes, reloading against the base
commit, and observing the identical pair of errors — then restoring the stash.
Nothing in this change touches `loadLocal` or persistence. **Flagged to
Planning & Audit as a separate item; not fixed here.**

## Deliberately not built (needs a product ruling)

**Nothing stops a finished installment plan from being paid again.** Once
remaining reaches zero the badge reads "Installments complete", but the
commitment stays active and `payCommitment` will happily record a seventh
payment on a 3-installment plan — it advances cycle-by-cycle off
`lastPaidMonth` and has no notion of a plan ending.

Auto-deactivating the commitment at zero would be a real financial-state
mutation beyond what was authorised, so it was not done silently. Raised with
Planning & Audit as an open question.

## Status

Committed, not pushed — held for explicit user push approval per the standing
git safety rule.
