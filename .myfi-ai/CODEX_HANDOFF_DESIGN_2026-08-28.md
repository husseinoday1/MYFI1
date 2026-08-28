# MYFI — Codex Handoff (Design/UI line)

**Prepared:** 2026-08-28, by Implementation 6 (Claude, design/UI line).
**Purpose:** Give this entire document directly to Codex. It replaces no
canonical authority; it is a verified current-state handoff for continuing
the design-system migration and UI polish work.

---

## 1. Role and operating rules for this line of work

- This is the **design/UI line** — light oversight, but **never touch live
  financial code** (`src/lib/` financial core, ledger, sync, migrations,
  postings). If a design change seems to require touching financial logic,
  stop and ask the user first.
- Read first: `docs/00_MYFI_CANONICAL_AUTHORITY.md`, then the 14 files in
  `docs/design/` (especially `05_MYFI_COMPONENT_ARCHITECTURE.md`,
  `12_MYFI_DESIGN_MIGRATION_ROADMAP.md`, and
  `14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md` for the REF-xx image
  references everything below cites).
- Keep the app's current color palette/tokens (`src/lib/tokens.js`,
  `TH` in `src/lib/theme.js`) — don't invent new brand colors.
- Document every real decision (an evidence file under
  `docs/04_CURRENT_EVIDENCE/`, following the existing naming pattern:
  `MYFI_<TOPIC>_<DATE>.md`).
- **Push requires the user's explicit approval** — hold every commit until
  they say so, same as every other MYFI line.
- **Do not work in the shared folder** (`C:\Users\husse\OneDrive\Документы\MYFI`)
  concurrently with another process without isolating first. This exact
  handoff exists because two processes (this session and Codex) checked out
  different branches on that same shared folder mid-session, which nearly
  caused a lost/mismerged product decision (see §3 below). **Use your own
  git worktree** (you already have one:
  `C:\Users\husse\.codex\worktrees\1ee6\MYFI`) and fetch this branch into it
  rather than switching branches in the shared folder.

---

## 2. Repository / branch state (verified, not copied from memory)

- Repo: `https://github.com/husseinoday1/MYFI1` (`origin`)
- Branch pushed and ready for Codex to pull:
  **`impl6/language-conflict-resolution-2026-08-28`**
- HEAD at handoff: `5c66200` — `fix(onboarding): use live onboarding
  language for wallet name, restore radio a11y role`
- Based on `fix/pui-001-r2-onboarding-reader-recent-transactions` @
  `8b5b038` (already on origin).
- `npm run test:gate:static`: **72 passed / 0 failed / 11 skipped**
  (confirmed on this exact HEAD, after a fresh `npm install` in an isolated
  worktree — a brand-new worktree has no `node_modules`, install it first).
- `npm run verify:android` (`expo export --platform android`): clean, no
  errors.
- Not pushed as a PR yet, not merged into anything else. Sole content:
  `src/screens/HomeScreen.js`, `src/screens/OnboardingScreen.js`,
  `tests/onboarding-runtime-regressions.test.cjs`,
  `tests/product-readiness-batch7.test.cjs`, and one new evidence file
  (`docs/04_CURRENT_EVIDENCE/MYFI_IMPL6_LANGUAGE_CONFLICT_RESOLUTION_2026-08-28.md`).

---

## 3. What this branch resolved (context you need before touching onboarding/Home again)

A prior session (Implementation 5) found a real product conflict: two
commits on the shared folder (`8b5b038` and an unmerged `95d75bc`)
disagreed on whether the onboarding welcome-screen language toggle should
persist as the app's real language. Root cause, confirmed by this session:
**Codex was running in parallel on the same shared folder** and switched
the active branch mid-session without either side running `git checkout`
itself.

Resolved with the user directly. Final decision, now implemented on this
branch:
- Welcome's language pill is a **live reading-direction preview only**,
  active across all five onboarding steps from the moment it's picked.
- **Essentials (step 5) now has its own real "App language" row**
  (`SetupRow` + `ChoiceSheet`, same tier as country/currency/appearance),
  sourced from the same `lang` state. `finish()` commits it
  (`langMode: 'manual'`, `lang`) once, at the very end — not gated early on
  Welcome, no `languageConfirmed` lock.
- Both `tests/onboarding-runtime-regressions.test.cjs` and
  `tests/product-readiness-batch7.test.cjs` were updated (not deleted) to
  assert this exact contract.

A self-review before this handoff caught two real bugs already fixed on
this branch (see commit `5c66200`) — worth knowing about since they were
almost shipped:
1. The default wallet name/placeholder was reading the **previously-saved**
   app language instead of the live onboarding language, so a user who
   switched languages mid-onboarding got a wallet auto-named in the old
   language. Fixed to use the same `lang`/`T` everything else on screen
   uses.
2. The Welcome language pill's `accessibilityRole` had regressed from
   `"radio"` to `"button"` (screen readers no longer announced it as a
   toggle group). Restored.

---

## 4. Known open item from this branch — needs a product call, not a silent fix

`HomeScreen.js`'s Recent Transactions section now **fully disappears**
when there are zero recent transactions (matching the existing
Needs-Attention/Savings hide-when-empty pattern, per the user's explicit
confirmation this session). One side effect worth flagging: this also
removes the **"Add income" / "Add expense" quick-action buttons** and the
"View all transactions" link that used to show inside that section's
empty state — meaning a brand-new user with zero transactions currently
has one less on-Home nudge toward their first entry. The empty-state JSX
is still in the file (commented as intentionally dead code) in case this
needs reverting or the CTA needs relocating elsewhere on Home instead.
**Ask the user whether this is fine as-is, or whether the add-income/
add-expense CTA needs to live somewhere else on Home now.**

---

## 5. What the user is asking Codex to do now

1. **Continue the design-system migration and UI updates** across the rest
   of the app, using `docs/design/12_MYFI_DESIGN_MIGRATION_ROADMAP.md` as
   the source of truth. Steps 1, 2, 3, 5, 6, 7, 8 were already reported
   done as of this handoff (see that file + `docs/04_CURRENT_EVIDENCE/` for
   the closure evidence); **Step 4 (Settings/Legacy consolidation) stays
   blocked** pending Phase 11-13 from the separate Implementation 2 /
   Phase 11 session — do not start it.
2. **Link the designs together and give every screen its own consistent
   extension of the design system** — i.e. don't treat each screen as an
   isolated reskin; make sure the shared primitives, tokens, and navigation
   patterns established on Home/My Money/Follow-ups/Onboarding (per the
   roadmap) actually get applied consistently as you touch remaining
   screens, so the whole app reads as one coherent system rather than a
   patchwork of separately-styled screens.
3. **Fix Home's wallet display for the 1-2-wallet case** — see next
   section for the concrete problem and two options the user offered.

---

## 6. Concrete problem: Home wallet strip looks bad with 1–2 wallets

File: `src/screens/HomeScreen.js`, `renderWalletStrip()` (search for
`WALLET_CARD_WIDTH`) and its styles (`walletStripBlock`, `walletStripCard`,
etc. near the bottom `StyleSheet.create` block).

**Exactly what's wrong:** each wallet renders as a fixed-width
(`WALLET_CARD_WIDTH = 112`px) card inside a horizontal `ScrollView`, with
an 8px gap between cards. This layout is designed for scrolling through
many wallets, but:
- With **1 wallet**: a single 112px card sits flush to one side (start
  side, so left in LTR / right in RTL), leaving a large empty gutter for
  the rest of the row's width. Looks unfinished/broken, not "one wallet by
  design."
- With **2 wallets**: two 112px cards + 8px gap = 232px total — still far
  short of the available row width on a normal phone screen, same
  unbalanced/sparse look, still floating at one edge.
- The pagination dots (`walletStripDots`) only render when
  `pageCount > 1` — correctly hidden for 1-2 wallets — but that means
  there's *also* no visual signal that the layout is "supposed" to look
  this sparse; it just reads as broken.
- Since the majority of personal-profile users start with exactly 1
  wallet (confirmed via the comment at `renderWalletStrip`'s definition:
  "every profile... has at least one real wallet"), this is the **common
  case**, not an edge case — worth prioritizing.

**The user gave two acceptable directions — pick with them, don't decide
alone:**
1. **Revert Home's wallet display to whatever it looked like before REF-01's
   always-visible strip** (check git history before this feature landed,
   look for the commit that introduced `renderWalletStrip`/REF-01 wallet
   strip work, and the design docs' REF-01 image reference for what came
   before it), if the strip approach turns out not to be worth salvaging.
2. **Find a better fix that keeps the strip concept** — most likely: only
   use the fixed-width horizontal-scroll layout when there are enough
   wallets to need scrolling (e.g. more than 2 or 3), and for 1-2 wallets
   render them as full-width (or evenly-split half-width for 2) cards that
   fill the row properly, no horizontal scroll needed. Confirm the exact
   number-of-wallets threshold and target look with the user/REF images
   before implementing — don't guess a breakpoint silently.

---

## 7. Verification expectations

- `npm run test:gate:static` must stay green (72/0/11 is the current
  floor — don't let it regress; if you intentionally change a contract,
  update the specific test assertion instead of deleting it, per this
  branch's own precedent in §3).
- `npm run verify:android` (`expo export --platform android`) as a cheap
  bundle-sanity check for any screen you touch.
- Live Expo-web verification: the harness's `preview_start` tool resolves
  the dev server's working directory to the **session's own main
  directory**, not an arbitrary worktree path — if you use a similar
  browser-preview tool, verify it's actually pointed at your checkout
  before trusting what it shows (this session almost verified against the
  wrong copy of the code because of this).
