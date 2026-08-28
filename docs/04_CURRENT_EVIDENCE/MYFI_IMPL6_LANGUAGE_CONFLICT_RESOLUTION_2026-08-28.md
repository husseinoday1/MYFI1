# Implementation 6 — language-persistence conflict resolution (2026-08-28)

## Context
Implementation 5 handed off with a real, unresolved product conflict on
`fix/pui-001-r2-onboarding-reader-recent-transactions` (HEAD `8b5b038`):
whether the onboarding welcome-screen language toggle persists as the app's
real language (`cfg.lang`/`langMode`) or stays local to onboarding only.
Two commits on the shared working directory encoded opposite answers
(`8b5b038`'s ancestry vs. the unmerged `95d75bc`), caused by a second
process (Codex) checking out branches on the same shared folder
(`C:\Users\husse\OneDrive\Документы\MYFI`) concurrently with Implementation
5's session.

## Facts verified independently (not taken from the prior handoff on trust)
- `git merge-base --is-ancestor 95d75bc 8b5b038` → NO — confirmed real,
  divergent history, not a fast-forward relationship.
- Confirmed a live Codex worktree at
  `C:\Users\husse\.codex\worktrees\1ee6\MYFI` (detached HEAD `c78478b`),
  corroborating concurrent-process branch switching on the shared folder.
- Confirmed the ledger-import bug from the Implementation 5 handoff:
  `HomeScreen.js` at commit `8b5b038` uses `getLedgerNamespace`,
  `queryLedgerSummary`, `queryLedgerTransactions`,
  `queryLedgerWalletPositions` with no import — silent fallback to the
  legacy balance path inside a `catch`. The uncommitted working-tree fix
  (import added) was still present and was carried into this session's
  worktree via a patch backup taken before any further edits.

## Decision (asked directly, answered by the user this session)
- Confirmed: Codex was indeed running in parallel on the shared folder.
- Confirmed: the user's decision has **changed** from the earlier
  "persist as a whole-app preference" answer. Current, final decision:
  **the welcome-screen language toggle is local to onboarding reading
  direction only and must never write to `cfg.lang`/`cfg.langMode`.**

## What changed
- `src/screens/OnboardingScreen.js` / `HomeScreen.js`: no code change needed
  beyond what was already in the inherited working tree — it already
  implemented the non-persisting model correctly (verified: `finish()`'s
  `setCfg` call does not include `lang`/`langMode`; no `languageConfirmed`
  gate present).
- `tests/onboarding-runtime-regressions.test.cjs` and
  `tests/product-readiness-batch7.test.cjs`: updated the two assertions
  that encoded the old (persisting) contract. They now assert the
  **opposite** — that `languageConfirmed` and `langMode: 'manual'` do
  **not** appear in `OnboardingScreen.js` — following the same
  update-the-test-to-match-the-new-intentional-contract precedent already
  used on this branch's history.

## Isolation going forward
Per the standing instruction, this session now works from its own git
worktree (`C:\Users\husse\MYFI-Implementation6`, branch
`impl6/language-conflict-resolution-2026-08-28`, based on `8b5b038`)
instead of the shared folder that caused the original conflict.

## Verification
- `npm run test:gate:static` (after `npm install` — the fresh worktree had
  no `node_modules`, which was the actual cause of 8 additional failures
  seen on a first run; those were an environment artifact, not
  regressions): **72 passed / 0 failed / 11 skipped.** This is better than
  Implementation 5's documented baseline (70/1/11 — the ui-contract
  light/dark color test also now passes clean).
- `npm run verify:android` (`expo export --platform android`): bundles
  clean, 1170 modules, no errors.
- Attempted a live Expo-web walkthrough via the harness's browser-preview
  tool. It resolves the dev server's working directory to the session's
  main directory, not this worktree — the first launch attempt actually
  started Metro against the shared folder (`...\Документы\MYFI`), not
  `MYFI-Implementation6`. Stopped it immediately (no writes occurred) and
  did not retry; relying on `test:gate:static` + a clean `verify:android`
  export as the verification floor instead, consistent with the standing
  CI-only-builds / no-separate-staging-env rule.

## Follow-up scope added after the conflict resolution (same session)
The user clarified two more things once the conflict fix landed:

1. **Essentials (step 5) needed its own, real app-language setting** — the
   Welcome-page toggle only ever controlled the onboarding reading
   preview (already correct, see above), but the user's intent was for
   Essentials to *also* offer a language choice that behaves like
   country/currency/appearance: a real, persisted app setting. Added a
   fourth `SetupRow` to `EssentialsSlide` (`T.language`, sourced from the
   same `lang` state Welcome's toggle already drives) plus a matching
   `ChoiceSheet`. `finish()` now writes `langMode: 'manual'` and `lang`
   into `setCfg` — so language is confirmed once, at the end of
   onboarding, not gated early on Welcome. Updated both onboarding tests
   again to assert this (Essentials must expose the language row;
   `finish()` must commit it) instead of the intermediate "never persists
   anywhere" assertion from the first pass.
2. **HomeScreen.js Recent Transactions section**: made it match the
   existing Needs Attention / Savings pattern exactly — it now (a) is
   fully omitted from Home when there are zero recent transactions
   (matching `renderHomeSection`'s existing `goals`/`attention`
   empty-hides-the-whole-section behavior), instead of always rendering
   an empty-state card, and (b) gets the same tinted outer panel
   (`th.primSoft` background, `${th.primary}44` border) that Savings
   uses, replacing its previous neutral `th.card`/`th.border` styling.
   Added `s.recentPanel` alongside the existing `attentionPanel`/
   `savingPanel` styles.

Re-ran `npm run test:gate:static` after both: still **72 / 0 / 11**.
Re-ran `npm run verify:android`: clean export, no errors.

## Status
Not committed as of writing this file — evidence is written first, per
convention, then the commit follows in the same worktree. **Held for
explicit user push approval per the standing rule** — nothing here will be
pushed without that.
