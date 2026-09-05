# MYFI — handoff: Phase 15, the sync conflict, and everything found along the way

Date: 2026-09-05
Written for: whoever continues this (likely Codex), and for Planning & Audit.
Author: Implementation session (Claude), weekly usage ending.

Read this before touching Phase 15 or the sync/identity code. It is written to
be usable without the conversation it came from.

---

## 0. State in one paragraph

Branch `fix/pui-001-r2-onboarding-reader-recent-transactions`.
**Pushed and CI-green: `d0dbbd0`.** Six commits sit **local and unpushed** on top
of it (listed in §6) — they are complete and gate-green, held only because push
needs the owner's word each time and he is asleep. Local gate: **181 passed, 0
failed, 11 skipped.** Working tree clean apart from pre-existing untracked
scratch files that are not mine.

The single most important thing in this document is §2: History's SQL read has
**never worked on any device**, and that invalidates the premise of most Phase
15 measurement done so far.

---

## 1. Phase 15 status, item by item

From the audit in `MYFI_PHASE15_GAP_ANALYSIS_2026-09-04.md`.

| Item | Status now | Where |
|---|---|---|
| §96 Dataset tiers | PARTIAL, unchanged | tiers generate; still target the pre-cutover store |
| §97 p50/p95 metrics | **DONE (instrumented)** | `historyReadPathTelemetry.js`, commit `443569a` |
| §98 Memory metrics | **NOT DONE** | see §5 — needs a device, cannot be faked |
| §99 SLO doc | DONE earlier | `MYFI_PERFORMANCE_SLO.md` |
| §100 100K policy | PARTIAL, unchanged | generates in Node, unobserved on device |
| §101 Reliability probes | DONE earlier | 5 fault probes in CI |
| §102 SQLite config | DONE earlier | found + fixed a real durability bug (`070f5d9`) |
| §103 DB health | PROVEN earlier | quick_check |

**§97 is instrumented, not measured.** The code now records p50/p95/max per
first-page History query and shows them in Diagnostics. Nobody has read a real
number off a device yet. That is step 1 of §7.

---

## 2. The finding that changes Phase 15's premise

**History's SQL read path returned zero rows on every query, on every device,
for as long as the code has existed.**

```js
if (Number.isInteger(Number(year))) { clauses.push('date_iso LIKE ?'); params.push(`${Number(year)}-%`); }
```

`Number(null)` is `0` and `Number.isInteger(0)` is `true`. So "no year
requested" became year 0, and every query carried `date_iso LIKE '0-%'` — a
pattern no date has ever matched. Three query functions in
`activeLedgerRepository.js` carried the identical line.

Archive passes a real year and worked, which is why nobody saw it. History
passes none, always got nothing, and silently fell back to the in-memory list —
which renders correctly, so the app looked fine.

Fixed in `48d0b34` (pushed, in `d0dbbd0`) with one shared `yearFilter` helper
rather than three corrected copies. Regression test
`tests/history-sql-year-filter.test.cjs` runs the real sliced query against real
SQLite and was verified by restoring the original line.

### Why this matters for Phase 15

Every performance number Phase 15 has produced about the SQLite read path
measured a path that returned nothing. The §102 config work and §101 probes are
unaffected (they test writes and durability). But **§96/§97/§98/§100 read
measurements need redoing** once a device confirms the fix.

### How it was found

The counter shipped on 2026-09-04 measured a 0.8 reject rate on three stuck
accounts. PA and I both concluded it was probably an artifact of their broken
sync, and PA explicitly asked to re-measure on a healthy account before judging.
The owner created a brand-new account — no conflict, sync working, `no_cloud_data`
— and it measured **0.8 too, with `sqlRows: 0` in every sample**. That is what
made the bug findable. The hypothesis we had agreed on was wrong, and the clean
measurement is what disproved it.

---

## 3. The sync/identity conflict work

### The problem

Three real accounts were permanently blocked behind
`financial_v2_ledger_id_conflict`: the account has a cloud ledger from another
device/install, this device generated its own, and `resolveCloudLedgerV2`
correctly refuses to proceed. The guard is right. What was wrong is that sync
then **silently fell back to V1**, which succeeded on its own and drove
`dirty:false`/`lastSyncError:null` — so the UI said "Synced" while real
mutations sat in `ledger_outbox_v3`.

### What shipped already (in `d0dbbd0` and earlier)

- Honest sync status (`5f398d1`, `fc21746`): the indicator no longer says
  "Synced" while V2 activation is stuck or a conflict recovery is blocked.
  Confirmed on the owner's real device.
- Diagnostic split (`fe24d08`): `resume_intent_invalid` covered **five**
  distinct conditions under one string; each now reports itself, on both the
  manual and the automatic path.

### What is built but unpushed (§6)

A complete `financial_v2_ledger_id_conflict` recovery: decision layer,
promotion, prepare/confirm flow, re-entry queue drain, and the per-row review
screen.

### Three corrections I had to make about this, in order

Recorded because the pattern matters more than the conclusions:

1. I first said adopting a different cloud identity needed **new mechanism,
   days of work**. Based on tracing `bootstrapFinancialLedgerV2` only.
2. I then corrected that to **"the mechanism exists and is unreachable"**, based
   on finding `financialV2ConflictRecoveryV1.js`. Wrong too — I had not opened
   `inspectCandidate`.
3. Final, verified position: the **download/checkpoint/intent scaffolding is
   reusable**, but `inspectCandidate` requires the local identity to *equal* the
   cloud one and requires all pending rows to be stale workspace commands (≤16),
   and `promotePreparedCloudConflictRecoveryV1` **clears the outbox by the CLOUD
   ledger id**. All three refusals are correct for their own case. So adoption
   needed its own sibling path, not a loosened condition.

PA independently verified corrections 2 and 3 in the code.

**The orphan hazard is the thing to remember**: reusing the existing promotion
would have deleted `ledger_outbox_v3` rows by the cloud id while the owner's
pending rows lived under the old local id — leaving them on disk under an
identity nothing reads again. Present, invisible, unrecoverable. The first
assertion in `tests/run-v2-identity-adoption-promotion.cjs` reproduces exactly
that and fails.

---

## 4. Design rules that must not be quietly dropped

These are decisions, not preferences. If a future change makes one of them
inconvenient, that is a conversation, not a cleanup.

1. **No automatic merge, ever.** Every pending mutation gets an explicit
   keep/discard from the owner. The library refuses to confirm while any row is
   undecided, and an unrecognised decision counts as undecided rather than
   defaulting either way.
2. **`inspectCandidate` must not be weakened.** Its two refusals are correct for
   the case it serves. PA ruled on this explicitly.
3. **Kept mutations are re-applied through the ordinary commit paths**, never
   reconstructed. Their revision chains were computed against the replaced
   ledger; re-deriving revisions by hand inside a destructive transaction is the
   arithmetic this design exists to avoid.
4. **A failed re-entry stays queued with its reason** and does not stop the
   others. Losing one of the owner's entries silently is the worst outcome here.
5. **Both top-level answers are equal-weight buttons.** "This is my data" and
   "wrong account" lead to opposite correct actions; making one a grey link
   pushes people into the other.
6. **The wrong-account answer changes nothing** and does not sign anyone out.

---

## 5. Open items, honestly

| Item | Why it is open |
|---|---|
| **§98 memory metrics** | Needs measurement on a device under the dataset tiers. Cannot be produced from a workstation, and I will not fabricate it. |
| **§96/§97/§100 re-measure** | The read path only started working today; earlier numbers describe an empty path. |
| **Adoption never run against real Supabase** | All of §6 is unit- and SQLite-tested. The network path (`stageVerifiedBootstrapWithArchiveV2`) has never executed in this flow on a real account. **This is the biggest untested risk in the unpushed work.** |
| **Goals undo never run on a device** | Logic is mutation-tested; the button has not been pressed. |
| `myfitest67890` classification | `fe24d08` makes the device say which of five conditions blocks it. Needs a build + a look. |
| `inspectCloudIdentityAdoptionV1` | Exported, zero callers. Written for the review screen, which ended up reading store state instead. Either wire it or delete it. |
| History fallback removal | Still not done, and **should not be attempted until §7 step 1 confirms the SQL path really serves rows on a device**. |
| Cross-session messaging | `SendMessage` went unavailable mid-session; the owner has been relaying to PA by hand. |

---

## 6. The unpushed commits, oldest first

All gate-green. Push order matters — they build on each other.

| Commit | What |
|---|---|
| `d3a43ac` (rebased) | Goals: refuse deleting a released goal's transaction; add a real "undo the transfer" with a wallet-balance check. Also the adoption decision layer. |
| `5ddc4e7` | Adoption promotion: identity swap, old-ledger cleanup by the **old** id, re-entry queue. |
| `8088eed` | Eligibility gate widened; adoption gets its own store actions. |
| `d771929` | Re-entry drain through the ordinary commit paths. |
| `14781d5` | The per-row review screen, which closes the dead end `8088eed` would otherwise have shipped. |
| `443569a` | §97 latency instrumentation. |

**`8088eed` must not ship without `14781d5`.** On its own it makes the existing
recovery button prepare an adoption, tell the owner "you can now replace", and
then fail on confirm because the old confirm looks for a different intent key —
leaving a durable intent that is resumed rather than replaced. I caught this by
inventory before pushing, not by testing, which is why §7 step 3 exists.

---

## 7. What to do next, in order

1. **Build an APK from `d0dbbd0` (or later) and re-measure History.**
   Diagnostics → five taps on the version → "History read path". Expect
   `sqlRows > 0` and `rejectRate` near 0, plus the first real `p50Ms`/`p95Ms`.
   If `sqlRows` is still 0, the year filter was not the whole story and
   everything in §2 needs revisiting.
2. **Then re-measure §96/§97/§100** on the dataset tiers, and do §98 on device.
3. **Before pushing §6**, get the owner's approval, and treat the Supabase path
   as unproven: the first real adoption should be run on a throwaway account,
   not one that matters.
4. The owner has said all his current data is test data. That lowers urgency; it
   does not lower the correctness bar, because a real user will hit the identity
   conflict on a device swap and their data will not be disposable.

---

## 8. Two habits worth keeping

**`Number(null) === 0`.** It emptied every History page for months, and I
reintroduced it in my own §97 code within the hour — caught only because the
test asserted junk inputs are rejected. Two other files in this repo already
carry comments warning about it. Prefer an explicit `typeof` check.

**Mutation-test the guard, not just the happy path.** Every real defect in this
session was found by breaking the code deliberately and checking the test
noticed. Three tests passed against a deliberately broken implementation before
being tightened — a test that cannot fail is worse than no test, because it
reads as evidence.
