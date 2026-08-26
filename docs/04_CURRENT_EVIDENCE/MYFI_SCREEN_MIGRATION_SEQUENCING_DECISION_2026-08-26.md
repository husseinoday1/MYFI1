# Screen Migration Sequencing Decision — 2026-08-26 (Planning & Audit)

Source: `docs/design/12_MYFI_DESIGN_MIGRATION_ROADMAP.md` (the 10-step sequence
is already authored; this decision is which step gets a scoped execution
package authorized next, per that document's own rule that execution needs
per-phase authorization).

## Status of steps 1-2 (tokens + primitives)

Per Implementation 4's report (commit `f701a48` on
`impl/design-tokens-foundation-2026-08-26`, branch on hold, not yet pushed):
- Step 2 (shared `useTheme()` hook + primitive formalization): **done**.
- Step 1: **partially done.** The structural part (splitting `brand.primary`
  from `financial.income`, adding `financial.transfer`/`financial.danger`) is
  done. The "audited muted category-palette values" the roadmap's step 1 text
  refers to are **not** done and correctly weren't — cross-checked against
  `04_MYFI_DESIGN_TOKEN_CATALOG.md` line 80: "exact hex confirmed pending
  implementation-time contrast pass." That contrast pass has not happened yet.
  This matches the 2026-08-26 scope ruling
  (`myfi_design_tokens_scope_ruling_2026-08-26` in Planning & Audit memory) —
  not a gap, a correctly-deferred item.

**Resolved (user decision, 2026-08-26):** the implementation-time contrast
pass for the 12 `CAT_COLORS` category hues is deliberately deferred until the
actual screen-implementation phase (Step 3 onward) — not assigned to
Implementation 4 or DeepSeek now, even though the WCAG-ratio computation
itself is mechanical enough to delegate. Re-open this only when screen work
starts and a session is actively touching category-tagged UI.

## Decision: Step 3 (Navigation shell) — authorized, but sequenced *after* the tokens branch lands

Step 3 (restructure `App.js` `BASE_TABS` to 4 tabs, build My Money / More
thin-router screens) is the next roadmap item and is **authorized in
principle**. It is **not started now** for one concrete reason: it depends on
the `useTheme()` hook and primitives from Steps 1-2, which exist only on the
still-unpushed `impl/design-tokens-foundation-2026-08-26` branch. Starting
Step 3 from a different branch point (e.g. current `origin/main` or
`docs/design-master-consolidation-2026-08-26`) would build it without those
primitives and create a duplicate/divergent branch that collides with the
tokens branch once it lands — exactly the kind of shared-clone git collision
already seen once this project (Implementation 2, 2026-08-26, `git add -A`
sweeping another session's files).

**Trigger to start Step 3:** the moment the tokens branch is pushed (per the
user's own hold instruction — full rollout readiness or the next weekly
token-limit reset, whichever the user decides), Step 3 gets its scoped
package from `impl/design-tokens-foundation-2026-08-26`'s tip, not from
`main`.

**Trigger fired (user decision, 2026-08-26):** `impl/design-tokens-foundation-2026-08-26`
pushed to origin (tip `6cd1886`). Step 3 assigned to Implementation 4 from
that branch tip, scope per the roadmap's own Step 3 text: restructure
`App.js`'s `BASE_TABS` to 4 tabs, build thin-router **My Money** and **More**
screens per `05_MYFI_COMPONENT_ARCHITECTURE.md` and
`06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md`, reorganization not
rebuild. Steps 4+ (Settings/Legacy consolidation onward) remain unauthorized
until Step 3 closes with its own evidence + `/code-review` pass.

## What is safe to run in parallel right now

Evidence archival (queued in
`04_CURRENT_EVIDENCE/00_EVIDENCE_INDEX_AND_ROLLUP_POLICY.md` §Policy) touches
none of the same files as the tokens/navigation work and has no dependency on
it — assigned to Implementation 4 now, in parallel with this sequencing
decision, on its own branch.

## Step 3 closed, new scope gap found (2026-08-26)

Step 3 (nav shell + My Money + More) is **accepted** — commit `899fec7` on
`impl/nav-shell-step3-2026-08-26`, evidence at
`04_CURRENT_EVIDENCE/MYFI_STEP3_NAV_SHELL_MYMONEY_MORE_2026-08-26.md`, still
on hold for push pending the user's explicit go.

**New open item: Home screen is not covered by any of the roadmap's 10
numbered steps**, and `docs/design/07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`
§Home specifies **4 period pills (Today/Week/Month/Year)** replacing the
live `HomeScreen.js`'s **health-pulse pill** (OK/!/— indicator) — a real
structural/product difference, not a styling one, and not something either
document resolves. **Decision (2026-08-26): token/spacing/radius adoption on
Home is authorized now; the health-pill-vs-period-pills structural question
is explicitly NOT authorized and stays open** until it gets its own scoped
decision. Same principle applies to any other screen not in the numbered
roadmap: token-only changes proceed, any found structural gap against the
approved spec stops and escalates rather than being resolved unilaterally.

## Steps 5/6/7/8 + Home batch closed (2026-08-26)

Commit `302c020` (+ `4674cfa`) on `impl/nav-shell-step3-2026-08-26`, evidence
at `04_CURRENT_EVIDENCE/MYFI_STEPS_5_6_7_8_HOME_BATCH_2026-08-26.md`.
**Accepted:** Step 5 (Archive relocation), Step 7 (Reports color reconnect,
color-swap slice only), the color-guidance correction applied retroactively
to Step 3's GatewayCard tones (now uses live `CAT_COLORS`, not new catalog
hex), and Home's conservative token pass (exact-match substitutions only,
correctly declined to force-fit ambiguous radius values).

**Two new gates found and confirmed by Planning & Audit — both correctly
NOT touched by Implementation 4, per the standing "stop and escalate a
structural fork" rule:**

1. **Step 6 rename is done** (Trackers → Follow-ups, landed in Step 3). The
   roadmap's underlying claim that `TrackersLabScreen.js` "already covers
   most of this in substance" is **false** — Installments, Subscriptions,
   and Payment History do not exist as data concepts at all (no sub-typing
   on commitments, no payment-history view). Building them is new financial
   product/data-model work, not a UI step — **registered as a new plan item,
   17-G (Follow-ups tracker-type completion: Installments, Subscriptions,
   Payment History)**, full Verification-Floor rigor required, not part of
   any Implementation-4-scale light-rigor batch. See the master plan
   restructure proposal for where this sits in Phase 17.
2. **Step 8 cannot close as scoped.** `OnboardingScreen.js` is 3 steps, not
   the locked 6, and its `QuickSetupSlide` has a Personal/Business/Dual
   `profileType` selector the locked spec explicitly forbids — but
   `profileType`/`activeScope` drives data filtering app-wide
   (`filterByActiveScope` in `MyMoneyScreen.js`, `PlanBudgetScreen.js`,
   `WalletBalanceCard.js`, etc.). Removing it without a replacement breaks
   live scoping. **New dependency registered: Step 8's full conformance is
   gated on Phase 14-A landing its "personal/business workspace separation"
   item first** (a real replacement mechanism for what `profileType`
   currently does) — same pattern as Step 4's gate on Phases 11-13. Do not
   attempt Step 8's structural fix before Phase 14-A lands.

Implementation 4 correctly stopped at both forks and reported rather than
deciding unilaterally — this is the expected behavior, not a shortfall.
