# MYFI — Codex onboarding

Date: 2026-09-06
Written by: Planning & Audit (Claude), at the owner's explicit request, to
give Codex a full working role under the same standing rules every other
engineering session on this repo already operates under.
Repository: `https://github.com/husseinoday1/MYFI1`
Branch: `fix/pui-001-r2-onboarding-reader-recent-transactions`

Read this whole document before touching anything. It is written to be
usable without any conversation that came before it.

---

## 0. What you are, and who you report to

You are being brought on as extra engineering capacity on MYFI — the same
kind of role the "Implementation" Claude sessions have been filling. You
are not a research assistant here; you have real file/git/device-adjacent
access and are expected to read code, write code, run tests, and push,
under the same discipline the Implementation sessions have been held to
throughout this project.

**Reporting line:** the "Planning & Audit" Claude session (referred to as
PA throughout this repo's docs and memory) coordinates and reviews
engineering work on MYFI, the same way it has coordinated multiple
Claude Implementation sessions. There is currently no direct machine
channel between you and PA — the owner relays messages by hand, pasting
your output to PA and PA's responses back to you. Write your reports
assuming they will be read by PA through the owner, not by the owner
directly for their own technical judgment — PA will verify and translate
findings for the owner in plain terms.

**You have full authority to act** (read, write, test, commit, push)
**within the standing rules in §1** — this is not a request to check in
before every step. Report back when you have something complete and
verified, or when you hit something the rules below say needs a decision
you can't make alone.

---

## 1. Standing rules — non-negotiable, apply to every session including you

These are not preferences accumulated over the project's history; treat
each as load-bearing. Where to find the full detail is noted; the summary
here is enough to not violate one by accident.

1. **CI is the only acceptance build path.** Never trust a local build as
   acceptance evidence for anything that will be measured or shipped.
   Push, let GitHub Actions build, confirm the run ID went green — don't
   assume from local `test:gate` alone.
2. **Tests for anything stateful/counter/revision-based must exercise
   repetition**, not just a first pass. A real bug in this repo's history
   only showed up on the *second* time an operation ran.
3. **Run the project's code-review step and keep it clean before every
   push, no exceptions** — including changes that feel obviously correct.
   This exact discipline has caught real defects, repeatedly, in code that
   had already passed its own tests and a careful human-style read.
4. **Mutation-test your guards, not just the happy path.** Every real
   defect found across the last several sessions on this repo was caught
   by deliberately breaking the implementation and confirming the test
   actually notices — not by inspection, and not by a test that only
   checks good inputs. A test that cannot fail is worse than no test: it
   reads as evidence when it proves nothing. Concretely: after writing a
   guard/check, revert it (comment it out, invert the condition, etc.),
   re-run the test, confirm it fails with the expected message, then
   restore it.
5. **`Number(coerce)` on possibly-absent values is a known trap in this
   codebase.** `Number(null) === 0` and `Number.isInteger(0) === true` —
   this exact defect class silently emptied History's SQL read path for
   the entire life of the code (found 2026-09-05), and was reintroduced
   within the hour by the session that fixed it, in unrelated new code,
   caught only because a test asserted junk inputs are rejected. Prefer
   an explicit `=== null`/`typeof` check over bare `Number()` coercion
   whenever "absent" is a meaningful state.
6. **A change isn't "done" on green local tests alone** — confirm the
   actual CI run ID went green after push, every time.
7. **Every real change gets written into the evidence files
   (`docs/04_CURRENT_EVIDENCE/`), committed in the same commit as the
   work it describes**, not left in the working tree. Undocumented work
   is invisible to the next session and to CI.
8. **No schema migration without the owner present, ever** — even under
   broad delegated authority. If work turns out to need one, stop and
   surface it rather than proceeding.
9. **No automatic merge of financial data, ever.** Any place two sources
   of financial truth could conflict (local vs. cloud, two devices, a
   conflict-recovery flow), every decision is explicit and per-item,
   never guessed at or defaulted. An unrecognized/ambiguous decision
   counts as *undecided*, not resolved in either direction.
10. **Financial-impact check before touching anything under
    `src/lib/financial*`, `src/lib/secure*`, the SQLite schema, backup/
    restore, or sync** — think through data-safety/migration/existing-
    user-upgrade impact before writing the change, not after.
11. **Push does not need per-instance approval** (the owner relaxed this
    project-wide) — proceed by default, he'll interrupt if he wants to
    stop a specific push. **Device installs and any real-device action
    still do need his explicit go-ahead in the moment** — this is a
    separate, still-standing gate that push's relaxation did not touch.
12. **Never weaken an existing safety guard to make a new case pass.**
    When a guard's precondition doesn't fit a new scenario, build a
    parallel path for the new scenario; don't loosen the guard. (Concrete
    precedent: `inspectCandidate` in `financialV2ConflictRecoveryV1.js`
    correctly refuses when the local and cloud ledger identities differ —
    the fix for identity adoption was a whole new sibling module, not a
    loosened condition on that function.)

---

## 2. Where the real context lives (read these, don't re-derive)

1. `docs/00_MYFI_CANONICAL_AUTHORITY.md` — the authority order (A0–A7)
   for resolving any conflict between docs.
2. `docs/01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md` — the phase
   roadmap and architecture. Append-only for amendments (see its own
   §195/§196/§197 for the pattern — never edit history in place, add a
   new dated section and say what it changes).
3. `MYFI_ENGINEERING_HANDOFF.md` (repo root) — general engineering
   orientation, written 2026-08-19. **It says of itself: "this file will
   go stale, the repo will not."** Treat it as background, not current
   state — this document (§3 below) and the two files in §4 are more
   current.
4. `docs/04_CURRENT_EVIDENCE/MYFI_HANDOFF_PHASE15_AND_SYNC_2026-09-05.md`
   and `MYFI_HANDOFF_2_TRACKERS_AND_PHASE15_2026-09-06.md` — the last two
   Implementation sessions' full technical handoff, written for exactly
   this moment (whoever continues next, explicitly anticipating Codex).
   **Read both in full before writing any code.**

---

## 3. Current state, as of this document

**UPDATED 2026-09-06, after this document was first written — read this
correction before trusting the "nearly closed" framing below.**
`docs/04_CURRENT_EVIDENCE/MYFI_PHASE15_DATASET_TIER_V7_GAP_2026-09-06.md`
(commit `bc2063e`) found that the performance-data lab's dataset tiers
(§96/§98/§100's only measurement source) run on the **legacy V6 query
path**, not the V7 path every real cutover account uses — `enterDemoMode`
deliberately keeps demo data off V7 cutover (its own comment explains an
older stale-cutover-marker bug that made this the safe default), so
**every §96/§98/§100 number gathered from the dataset-tier lab so far
describes a code path no real post-cutover user is ever on.** §97 (History
read-path latency) is unaffected — it was measured on real (non-lab)
usage, on the actual V7 path, and remains confirmed: 45-47ms/61-64ms.
Explicitly not fixed yet: `financialLedgerV7Cutover` gates dozens of paths
(sync activation, Home/Reports' SQL-vs-fallback split, the identity-
adoption gate) that have never run with `demoMode:true` and
`financialLedgerV7Cutover:true` together — wiring the demo lab onto V7
needs its own careful session, not a rushed fix. Read that evidence doc in
full before touching the performance-data lab or Phase 15's remaining
measurement.

- Branch `fix/pui-001-r2-onboarding-reader-recent-transactions`, all
  pushed, HEAD `bc2063e`, CI green.
- Phase 15 (Performance + Reliability Gate): §97/§99/§101/§102/§103 are
  done and verified (including one real durability bug found and fixed in
  SQLite connection config, and one real bug where History's SQL read
  path had silently returned zero rows on every device since the code
  existed — both fixed and device-confirmed). **§96/§98/§100 are NOT
  actually measured yet** — everything gathered so far was on the wrong
  code path per the correction above. Getting real numbers requires
  wiring the demo lab onto the V7 path first (see the gap doc for what
  that needs), which is real, non-trivial engineering work, not just
  "run the owner's device test again."
- A full identity-adoption recovery flow was built this stretch to unstick
  3 real accounts blocked behind a ledger-identity conflict (see the
  handoff docs, §3/§6 of handoff 1). It is fully unit- and SQLite-tested,
  and pushed.

### The one thing that matters most if you touch sync/identity code

**The identity-adoption flow's network path
(`stageVerifiedBootstrapWithArchiveV2`, the real Supabase RPC calls) has
never executed against a real account.** Everything proven about it so
far is local SQLite-runtime and unit tests. This is the single largest
untested risk in the current tree. If you are the one who ends up running
the first real adoption: it must be run against a throwaway/test account
first, never an account with data that matters, and the owner must be
present and aware when it happens — this is real financial ledger identity
surgery, not a reversible UI action.

---

## 4. What's realistically next (candidates, not an assignment)

The owner has not assigned a specific next task to you as of this
writing — these are open items surfaced in the handoff docs, worth
knowing about, not a queue to work through unprompted:

- **Wiring the dataset-tier lab onto the real V7 path**, per §3's
  correction above — the most likely actual next Phase 15 task. Requires
  auditing every path `financialLedgerV7Cutover` gates before flipping it
  on for demo data (sync activation, Home/Reports' SQL-vs-fallback split,
  the identity-adoption gate — none tested with `demoMode` and cutover
  both true), then re-running all five dataset tiers on the corrected
  path. Read `MYFI_PHASE15_DATASET_TIER_V7_GAP_2026-09-06.md` in full
  first.
- `inspectCloudIdentityAdoptionV1` is exported with zero callers —
  written for a review screen that ended up reading store state directly
  instead. Needs a decision: wire it in, or delete it as dead code.
- History's now-safe-to-reconsider in-memory fallback (see handoff 1 §5
  and handoff 2 §6) — defensible to remove now that the SQL path actually
  works (reject rate measured at 0 on a clean account), but not yet
  attempted.
- §197 in the Frozen Master Plan (added 2026-09-04): a broad, systematic
  transaction-integrity audit across every transaction type and tracker
  lifecycle — triggered by two real bugs found this stretch (the frozen-
  state goal bug, the hidden-transaction goal-undo bug), scoped as its own
  project, doesn't need to wait for Phase 17.
- Phase 16 (Android Production + Security Gate) is the next phase in
  sequence once Phase 15 formally closes — includes the professional-
  account migration (Supabase/GitHub/signing move off the owner's personal
  accounts) that's been tracked as pending since Phase 13.

Confirm with the owner (who will relay to PA) before starting any of
these as new work — this section is orientation, not a task list.

---

## 5. How to report back

Write clearly enough to be read without you present — the owner is a
manual relay, not a technical reviewer of your work himself. State what
you changed, why, what you verified and how (name the mutation tests you
ran, not just "tested"), what's still open, and what — if anything — you
need a decision on. Follow the same evidence-doc discipline as §1.7: if
the work is real, it gets a dated file in `docs/04_CURRENT_EVIDENCE/`
committed alongside it.
