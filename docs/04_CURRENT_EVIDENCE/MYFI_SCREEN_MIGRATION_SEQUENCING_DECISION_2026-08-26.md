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

## What is safe to run in parallel right now

Evidence archival (queued in
`04_CURRENT_EVIDENCE/00_EVIDENCE_INDEX_AND_ROLLUP_POLICY.md` §Policy) touches
none of the same files as the tokens/navigation work and has no dependency on
it — assigned to Implementation 4 now, in parallel with this sequencing
decision, on its own branch.
