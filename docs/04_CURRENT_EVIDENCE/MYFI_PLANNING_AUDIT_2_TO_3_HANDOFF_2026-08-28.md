# Planning & Audit 2 → 3 Handoff (2026-08-28)

## Read first
- `docs/00_MYFI_CANONICAL_AUTHORITY.md`, `CLAUDE.md` (repo root).
- `docs/01_CORE_AUTHORITY/MYFI_MASTER_PLAN_RESTRUCTURE_PROPOSAL_2026-08-26.md`
  — **APPROVED**, this is the operative post-Phase-10 phase map (14-B, 16-B,
  17-B through 17-G, 18-A/18-B). Registered in canonical authority A1.
- `docs/04_CURRENT_EVIDENCE/MYFI_SCREEN_MIGRATION_SEQUENCING_DECISION_2026-08-26.md`
  — running log of every design-step decision/gate.
- Memory: `myfi_phase11_closure_handoff_2026-08-27` (most current, has
  live corrections appended through today), `myfi_deepseek_delegation_2026-08-26`,
  `myfi_session_handoff_threshold_rule`, `myfi_design_tokens_scope_ruling_2026-08-26`.

## Live team map (names change every restart — always re-verify via ListAgents)
- **Implementation 2 (Phase 11, financial track)** — isolated worktree
  `C:\Users\husse\MYFI-Implementation2-Phase11`. Phase 11 CLOSED (`89b3907`,
  5 green CI increments: 11-A/B, 11-C step1, D3, D5). Standing by — 11-C
  step 2 (the actual balance-source migration) is blocked on the design
  branch settling, needs a **fresh consumer re-survey** (already found:
  HomeScreen has 2 legacy calls now, MyMoneyScreen 1, and a brand-new file
  `SettingsLegacyScreen.js` has 1 — don't trust any older consumer list).
- **Codex** — own worktree (`C:\Users\husse\.codex\worktrees\1ee6\MYFI`),
  assigned **Phase 1 (Home) + now Reports/MYFI Insight too** by the user
  directly (design work). Closed the HomeScreen silent-fallback gap
  (`9bf5060`) — verified independently by Implementation 2, real fix, not
  a claim. Communicated with via the user relaying text (no direct
  SendMessage channel to Codex).
- **Implementation 6** — was doing design (Phase 3: Follow-ups/debts/
  installments/subscriptions/goals, in isolated worktree
  `C:\Users\husse\MYFI-Implementation6-Phase3`, branch
  `impl6/phase3-followups-2026-08-28`, local commit `ac45b54`, found+fixed
  2 real bugs — receivable filter missing entirely, payment-history using
  a nonexistent `debt.kind` field). User pulled it off Phase 4
  (Reports) mid-task — that went to Codex instead. Status of Implementation
  6 right now: unclear if still active or idle — re-check.
- **Shared OneDrive checkout** (`C:\Users\husse\OneDrive\Документы\MYFI`)
  is currently on branch `fix/pui-001-r2-onboarding-reader-recent-transactions`
  (Codex/design lineage, NOT the original `impl/nav-shell-step3-2026-08-26`
  — that branch's tip was pushed once at `68e0af6` then superseded locally
  by Codex's own checkpoint/branch chain). **Multiple different tools use
  this SAME physical folder** (this is what caused the branch-switch
  collision earlier today) — always `git status`/`git log -1` before
  trusting what's checked out, and prefer isolated worktrees for any write
  work.

## Just fixed, NOT yet committed (sitting in the shared checkout right now)
`src/screens/SettingsScreen.js` — was missing `SHADOW` from its
`../lib/tokens` import (used `SHADOW.card` at line ~2243 without it),
crashed on real-device load (`ReferenceError: Property 'SHADOW' doesn't
exist`, confirmed NOT a cache issue — verified by diffing every file that
uses `SHADOW` against every file that imports it). Fixed inline just now.
**This fix has not been committed** — next session should confirm it's
still there (`git diff src/screens/SettingsScreen.js`) and get it into
whatever commit/branch is appropriate before it's lost to another branch
switch.

## Standing rules this session enforced (keep enforcing)
- Never trust a "done" claim without checking source/diff yourself first.
- Any write to `docs/`/evidence files uses an isolated `git worktree`, not
  the shared checkout, when another session might be mid-edit there.
- CI: `.github/workflows/ci-test-gate.yml` now exists (added this session)
  and actually runs on `impl/**`/`impl2/**`/`docs/**`/`planning/**`/
  `chore/**` pushes — Node 22 (required for `node:sqlite`), 60min timeout.
  Nine older workflows are all still hardcoded to old dead branch names —
  don't rely on them for anything current.
- `ask_deepseek` MCP tool is live (user-scope, works in any conversation
  started after 2026-08-26) — default for non-financial Implementation
  work, never for anything on the Verification Floor list.
- Push/commit still needs the user's own explicit in-chat approval, every
  time, in the session actually doing it — Planning & Audit relaying "user
  said push" is explicitly NOT accepted as authorization by the other
  sessions (correct behavior, keep it that way).

## Immediate open items for Planning & Audit 3
1. Confirm the `SettingsScreen.js` SHADOW fix survived and get it
   committed/pushed properly.
2. Figure out current state of the design branch tangle (Codex + whatever
   Implementation 6 left) and drive it toward one coherent, mergeable
   state — this was requested by the user ("توحيد الفروع") but not started.
3. Once design settles: resume Phase 11-C step 2 with Implementation 2
   (re-survey first, don't trust old consumer lists) — real device
   acceptance on Home balance is still the outstanding proof, though the
   silent-fallback risk is now closed by design.
4. Register the `15_MYFI_VISUAL_ROLLOUT_IMPLEMENTATION_PLAN.md` supersession
   of `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`'s Follow-ups section in
   `00_MYFI_CANONICAL_AUTHORITY.md` — promised to Implementation 6, not
   yet done.
5. Step 4 (Settings/Legacy) stays blocked on Phases 12-13 (11 itself is
   closed now).
