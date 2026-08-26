# MYFI — Design System Foundation: Tokens & Primitives (2026-08-26)

**Session:** MYFI Implementation 3. **Branch:** `impl/design-tokens-foundation-2026-08-26`,
cut from `docs/design-master-consolidation-2026-08-26` @ `945a532`.

**Scope confirmed with the user before writing code:** foundational, reusable
design elements (colors, typography, spacing, a few true primitives) built on
the approved tokens in `docs/design/04_MYFI_DESIGN_TOKEN_CATALOG.md` and
`docs/design/03_MYFI_DESIGN_SYSTEM_CANONICAL.md`. Explicitly **no full screens**
and **no composite screen-layout components** this pass (`GatewayCard`,
`SummaryCard`, `SectionListRow`, `SelectorRow` — deferred to the screen-by-screen
migration phase per canonical doc §13). Nothing under `src/lib/financial*` was
touched.

## Branch/HEAD verification (before any code)

- Checked out branch at session start: `docs/design-master-consolidation-2026-08-26`
  @ `945a532`.
- Verified the real implementation line's latest branch,
  `impl/p10-014a-local-strategy-b-device-gate-2026-08-22` (HEAD `ef18dce`), **is
  a direct ancestor** of `945a532` (`git merge-base --is-ancestor` = true;
  `git rev-list --left-right --count docs/design...impl/p10-014a` = `1  0`).
  The design branch is exactly the real implementation HEAD plus one docs
  commit — no divergence, no merge decision required, nothing from the
  implementation line is missing.
- New branch cut from that point: `impl/design-tokens-foundation-2026-08-26`.
- The shared working tree had unrelated in-progress uncommitted work from other
  sessions (`MYFI_ENGINEERING_HANDOFF.md`, `docs/00_MYFI_CANONICAL_AUTHORITY.md`,
  `docs/MYFI_SECURITY_THREAT_MODEL.md` modified; several new untracked files
  including `.claude/`, root `CLAUDE.md`, nested `CLAUDE.md`s, diagnostic
  scripts). None of it was staged, committed, or modified — only the specific
  files listed below were touched/added.

## What changed and why

### `src/lib/theme.js`
- Added `INCOME_GREEN` as its own named constant (currently `= BRAND_GREEN`).
  Per the token catalog's brand/income-independence ruling (APPROVED
  2026-08-26): `brand.primary` (`primary`) and `financial.income` (`inc`) must
  be independent semantic roles even while sharing a visible value. They were
  already separate object keys in `TH`, so this is a documentation/naming
  clarification, not a behavior change — no screen is affected.
- Added `financial.transfer` (`transfer`/`transferBg`): transfers are never
  income or expense (root `CLAUDE.md` financial invariant) and previously had
  no token — `HistoryScreen.js` borrows `primary` today (per catalog). Chose a
  neutral blue (`#2F6F9F` light / `#6BA8D8` dark), distinct from both `inc` and
  `exp` in each theme. Exact hue was explicitly left as an implementation-phase
  decision in the catalog; this is that decision, not yet consumed by any
  screen.
- Added `financial.danger` (`danger`/`dangerBg`/`onDanger`): destructive
  actions (delete account, delete local data) had no dedicated token and
  reused `exp`. Chose a value distinct from both `exp` and `warn` in each
  theme so they can diverge independently later, per the catalog's stated
  reason for the token.
- Added `financial.positive`/`financial.neutral` aliases, per the catalog's
  explicit default ("should alias income unless evidence requires a distinct
  hue") — `positive` aliases `inc`, `neutral` is a new muted gray distinct from
  both.
- **Not changed:** `CAT_COLORS` (category palette hex values) in
  `src/lib/constants.js` — the catalog itself states the recommended hex values
  are pending an implementation-time contrast pass and that "no row in this
  catalog authorizes a code change by itself." Confirmed explicitly with the
  user (2026-08-26): leave current values in place, only prepare the
  token/hook plumbing so a future contrast-pass-approved palette can drop in
  without touching call sites.

### `src/lib/tokens.js`
- Added `ICON_CONTAINER` (`sm`/`md`/`lg` — size + radius), formalizing the
  ad hoc tinted-icon-circle pattern the canonical doc calls out (§ icon
  tokens) as used behind Quick Add circles and list-row leading icons.

### `src/lib/useTheme.js` (new)
- One shared hook: `useTheme()` → `{ th, lang, cfg, isAr, align, rowDir, sym }`,
  reading `cfg` from the existing `useStore()` (read-only selector, no
  mutation). Replicates exactly what 19 screens currently do manually
  (`TH[cfg.theme] || TH.dark`, confirmed by grep — 19 files match) without
  touching any of those screens. Canonical doc §1 calls this out as "the first
  primitive-layer change... a maintainability fix, not a visual change."
  Adoption across the 19 screens is a separate, later migration — not done
  here.

### `src/components/AppPrimitives.js`
- Extended existing `AppButton` with an `variant="icon"` path (circular
  icon-only button sized via `ICON_CONTAINER`) rather than building a new
  `Button` component from scratch — `AppButton` already implements the
  primary/secondary/soft/danger tone set the canonical doc (§4) asks for; only
  the icon-button variant was missing.
- Added `IconContainer` (tinted rounded container behind a standalone icon).
- Added `Badge` (fill/outline, one primitive covering both "type pill" and
  "status badge" use cases per canonical doc §8).
- Added `SegmentedTabs` (horizontal single-active-state control per canonical
  doc §7).
- None of these are wired into any screen yet.

### `src/components/FinancialAmount.js` (new)
- Presentational-only composite per canonical doc §11: signed amount, color
  paired with the sign, currency code adjacent to the figure, thousands
  separators. Consumes `th.inc`/`th.exp`/`th.transfer` and the existing
  `FinancialDirectionMark` primitive and `formatMoneyNumber` (from
  `src/lib/money.js` — a formatting helper, not the ledger/business-logic
  layer). Takes an already-computed numeric magnitude and a `kind`; does not
  compute, round, or derive any financial value itself. Not wired into any
  screen yet.

## Deferred (explicitly, per user confirmation 2026-08-26)

- `GatewayCard`, `SummaryCard`, `SectionListRow`, `SelectorRow` — composite,
  screen-layout-bound components; risk of rework before screen-migration
  details (canonical doc §13) are known. Held for the screen-by-screen
  migration phase.
- `CAT_COLORS` hex value changes — held for a formal contrast-pass approval.
- Adoption of `useTheme()` in the 19 existing screens — separate migration
  task, not part of "foundational tokens/primitives."
- Motion system, responsive rules — canonical doc marks both as not evaluated/
  proposed-only this pass; out of scope here too.

## Push status

Committed locally to `impl/design-tokens-foundation-2026-08-26` (`f701a48`),
**not pushed to origin**, per explicit user instruction (2026-08-26): hold
until the full design rollout is ready to go up together, or until the
current weekly token allowance resets — whichever comes first. No APK was
built or installed; the only build step run was a local `expo export`
static-verification pass (output removed afterward, not shipped anywhere).
Device testing for this work happens live through the Expo Go / dev-client
app, not a packaged APK.

## Verification

- All five new/changed files parsed cleanly with `@babel/parser`
  (`sourceType: 'module'`, `jsx` plugin) — no syntax errors.
- `npm run verify:android` (Expo Android export) run against the branch to
  confirm the edited, already-imported files (`theme.js`, `tokens.js`,
  `AppPrimitives.js`) do not break the existing bundle — result recorded below.
- No financial/database/gate tests apply: nothing under `src/lib/financial*`,
  no stateful/counter logic, no schema change.
- `/code-review` run before push per standing rule 3 — result recorded below.

**Results:**
- `@babel/parser` syntax check: all 5 files OK (caught and fixed one real
  defect before this: `SegmentedTabs` referenced `s.segmentLabel`, which was
  never defined in the `StyleSheet.create` block — added it).
- `npm run verify:android`: exit code 0, bundled 1162 modules successfully
  (`Android Bundled 41378ms index.js (1162 modules)`, `Exported: dist-android-verify`).
  Confirms the edited files that real screens already import (`theme.js`,
  `tokens.js`, `AppPrimitives.js`) do not break the existing bundle. Output
  directory was removed after the check (gitignored via `dist-*/`, throwaway
  verification artifact, not acceptance evidence).
- `/code-review` (high effort): 2 correctness findings, both in
  `src/components/FinancialAmount.js`, both fixed before commit:
  1. Color/sign mismatch — `FinancialDirectionMark` treats any `kind` other
     than `'income'`/`'inc'` as the expense glyph, but the color ternary only
     matched the literal `'expense'`. Passing the codebase's own `'exp'` short
     form (used as the theme key convention everywhere else) would have
     produced a green minus sign — the exact color/sign mismatch canonical doc
     §11 exists to prevent. Fixed by normalizing `kind` once
     (`isExpense`/`isTransfer`/`normalizedKind`) so color and glyph can never
     disagree, and by accepting the `inc`/`exp` short forms explicitly.
  2. Missing `currency` default — every other prop had one, `currency` did
     not, so omitting it rendered the literal string `"undefined"` as the
     currency label. Fixed: `currency = 'IQD'`, matching `formatMoneyNumber`'s
     own internal default.
  Re-ran the babel syntax check after both fixes — clean. Both findings and
  their `fixed` outcome recorded via the review tool.
