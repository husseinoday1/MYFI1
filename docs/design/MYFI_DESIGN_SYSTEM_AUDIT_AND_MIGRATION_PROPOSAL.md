# MYFI — Design System Audit & Migration Proposal (Executive Report)

**Registered:** 2026-08-25 · **Status:** CANONICAL
**Branch:** `impl/p10-014a-local-strategy-b-device-gate-2026-08-22`
**HEAD:** `d2ed3ae03c137d818040dfe77c665c516b8440b7`
**Phase:** Design/product/architecture documentation audit — no production
code, navigation, financial logic, database, migration, backup/restore, sync,
or authentication behavior was modified to produce this document or any of
its companion files.

## Executive summary

MYFI's underlying design-system bones are sound — a real two-theme token
file, a type/spacing/radius/shadow scale, one consistent icon family, and
structurally-clean Light/Dark parity — but screens largely bypass them in
practice (hundreds of raw literals vs. a small number of token references),
and the brand color and the "income" semantic color are literally the same
value. A full set of Product Owner-approved visual references now exists for
Home, My Money, Follow-ups, More, Settings, and Onboarding, resolving most of
the open questions from the first audit pass (Settings root structure, the
Add-mode toggle, Follow-ups scope) and surfacing three new conflicts (a
rejected accent-color picker, an unconfirmed payment-methods row, an
unconfirmed VAT/rounding row) that must not be silently adopted. The
migration is substantially a **reorganization and token-adoption** effort,
not a rebuild: `TrackersLabScreen.js` is already close to "Follow-ups" in
substance, the Add-mode toggle already works globally, and Settings' root row
count already matches the approved 5-section target.

## Baseline

Repository `MYFI`, branch/HEAD above, Node `v24.18.0`, npm `12.0.2`, Expo
`~54.0.36`, React Native `0.81.5`. Working tree carries only documentation
changes (this design-audit output, plus earlier Planning & Audit context
files) — no application code modified. Test gate last verified at this exact
HEAD earlier in the session: 120 passed / 0 failed / 11 skipped; not rerun
here since no code changed.

## Major visual identity problems (confirmed)

1. Brand color and income color are the same literal token
   (`theme.js:11,16`) — corrected governance rule now defined, see Token
   Catalog.
2. No `danger` or `transfer` semantic token exists.
3. Category-color palette (12 hues, `constants.js:344-348`) is wider/more
   saturated than the restrained brand character — now explicitly sanctioned
   as a controlled exception, not a violation, per Product Owner decision,
   but hue-muting is still recommended.
4. Magic-value density: 532 raw `fontSize`, 614 raw padding/margin, 286 raw
   `borderRadius` literals in screens vs. light token adoption (15/23/158
   respectively).
5. One-off local colors outside the token system:
   `TrackersLabScreen.js:144`, `ReportsScreen.js:23` (`CHART_COLORS`), mixed
   raw hex at `ReportsScreen.js:840,966,984`.
6. No shared theme-access hook — 19 files independently do
   `TH[cfg.theme] || TH.dark`.

## Design consistency debt (confirmed)

Five orphaned/dead screens (`CommitScreen`, `DebtsScreen`, `GoalsScreen`,
`AuthScreen`, `SpaceScreen`); `SettingsLegacyScreen.js` still live and
entangled with `SettingsScreen.js` (not disposable independently); two
diagnostic Settings rows inconsistently gated between `__DEV__` and a
build-time env var; `ArchiveScreen.js` reachable only through Settings
despite belonging under More → My Tools per the corrected target.

## Canonical identity summary

Calm, restrained, olive/green (`#138A57`), Arabic/RTL-native, no
user-selectable accent color, structurally-identical Light/Dark, single icon
family (`Ionicons`, already consistent). Full definition:
`MYFI_VISUAL_IDENTITY_CANONICAL.md`.

## Token strategy

Extend `theme.js`/`tokens.js` rather than replace. Split `brand.primary` from
`financial.income` as independent semantic roles (not necessarily different
visible colors); add `financial.transfer` and `financial.danger`; keep
`category.palette` as a governed, muted-but-broader exception. Full catalog:
`MYFI_DESIGN_TOKEN_CATALOG.md`.

## Component strategy

Formalize a `Button`, `FinancialAmount`, `SectionHeader`/`PageHeader`,
`GatewayCard`, `SectionListRow`, `SelectorRow`, and `SegmentedTabs` — none
currently exist as a shared unit, all are inferable from existing inline
patterns. Reuse existing primitives/domain components rather than
duplicating (`WalletBalanceCard`, `AddTransModal`, `EntryContextRow`, etc.).
Full inventory: `MYFI_COMPONENT_INVENTORY_AND_MIGRATION.md`.

## Navigation audit

Confirmed gap: 5 current tabs (Home/History/Trackers/Reports/Settings) vs. 4
approved (Home/My Money/Follow-ups/More). The gap is materially smaller than
tab-count alone suggests — Follow-ups content mostly exists, the Add-mode
toggle already applies globally, and the navigation *rules themselves*
(View→Page / simple-Add→Sheet / complex→full-flow) are already confirmed by
the approved My Money reference as the intended global doctrine, not a new
invention.

## More/Settings audit

Settings' root row count already matches the approved 5-section target with
no duplicate Account/Sync row (confirmed directly against code and the
approved image). The real work is (a) relocating Data/Guide/Support/About
content out of Settings into the new More surface, (b) migrating
`SettingsLegacyScreen.js` together with `SettingsScreen.js` as one unit
rather than treating Legacy as disposable, and (c) resolving three
image-vs-text conflicts (accent color, payment methods, VAT) in the Product
Owner's favor of the text, per governance §2.

## Screen migration matrix summary

See `MYFI_SCREEN_VISUAL_CONSISTENCY_MATRIX.md`. Highest-risk single item:
Settings (5,600+ combined lines across two entangled files, live auth/
deletion logic). Highest-new-build item: My Money and More (both currently
non-existent as screens, though both substantially assemble existing logic).

## RTL audit

Existing infrastructure (`src/lib/layout.js`) is sound and used correctly
where checked (`HistoryScreen.js:15`). No RTL regressions found. Not
exhaustively re-verified for every screen in this pass — deferred to
implementation-time per-screen checks (Design Governance §7).

## Accessibility audit

The one confirmed strong pattern — signed amount + color + accessibility
label via `FinancialDirectionMark` — should be the template for every
amount display going forward. No broader accessibility audit (contrast
sweep, touch-target sweep) was performed in this pass; deferred.

## Chart audit

`ReportsScreen.js` (2,211 lines) uses its own local `CHART_COLORS`, disconnected
from the token system. The approved My Money reference confirms Reports
remains a full destination (not reduced to a bare summary), so its migration
scope is "reconnect color sourcing to tokens," not "rebuild."

## Internal/dev UI audit

Two diagnostic Settings rows are inconsistently gated (one `__DEV__`, one
build-time env var only) — flagged jointly to Product (this document) and
Security (`SECURITY-S6`).

## Blueprint Revision Map summary

Full detail in `MYFI_BLUEPRINT_REVISION_MAP.md`. Net effect: most of the
original Blueprint is confirmed correct and kept as-is; the amendments are
almost entirely *additions of detail now available from visual references*
rather than reversals, with three explicit exceptions where an image
conflicted with text and text won (accent color, payment methods, VAT/
rounding).

## Implementation sequence proposal (not authorized by this document)

1. Token remediation (brand/income split, add danger/transfer, category
   hue-muting decision).
2. Shared theme hook + primitive formalization (Button, FinancialAmount,
   SectionHeader).
3. Navigation shell: 4-tab `App.js` restructure, new My Money and More thin
   router screens.
4. Settings/Legacy consolidation + Data/Guide/Support/About relocation to
   More.
5. Archive relocation to More → My Tools.
6. Reports color-sourcing reconnection.
7. Diagnostic-UI consistent gating.
8. Legacy screen retirement (only after the 6-step policy in the Component
   Inventory is satisfied).

## Visual regression strategy (proposed)

Screenshot baselines per screen per theme, captured before and after each
implementation phase above; Arabic-only verification is sufficient given no
English reference exists yet, but flag this gap if English support is ever
required.

## Risks

Settings/Legacy migration is the single highest-risk item (live auth,
account deletion, sync status all routed through it). My Money and More are
net-new screens with no existing direct equivalent, raising normal new-build
risk even though most of their *content* is reused. None of the above carries
any financial-data, schema, or migration risk — this entire workstream is
presentation/navigation only.

## Resolved Product Owner decisions (2026-08-26)

1. **Category color governance — APPROVED.** Broader-than-brand palette
   confirmed acceptable under the six governance conditions; concrete muted
   per-color values now specified in `MYFI_DESIGN_TOKEN_CATALOG.md` (final
   contrast pass remains an implementation-phase task, not a decision gap).
2. **Country/Base Currency placement — APPROVED.** Settings → Financial
   Preferences, not Appearance & Language. Current code groups them with
   Language/Theme — a confirmed implementation gap, not an open question.
3. **Payment methods / VAT / rounding — REJECTED FOR CURRENT TARGET.** Not
   approved MYFI capabilities; removed from the canonical target Settings
   design.
4. **Onboarding length and order — APPROVED.** Exact 6-step flow (Welcome →
   Priorities → Customize → Create first wallet → Privacy first →
   Everything ready); no account-type selection; no opening-balance
   requirement; contextual permissions; existing users get "What Changed"
   instead of full onboarding.
5. **Diagnostic/developer UI — APPROVED DIRECTION.** Must sit behind one
   consistent gate. (Exact mechanism spec still owed to the Security track,
   `SECURITY-S6` — not a Product Owner item, so not re-listed as open below.)
6. **Legacy/orphaned screens — APPROVED classification and retirement
   policy.** `AuthScreen.js` specifically held until its live replacement's
   dependencies are fully verified.
7. **Archive location — APPROVED.** More → My Tools → Archive.
8. **Brand vs. income tokens — APPROVED.** Independent semantic roles, not
   coupled through one source token; may still share a visible value.

## Open Product Owner decisions remaining

**None from the original list — all eight items above are resolved.** Two
items are downgraded from "Product Owner decision" to a different kind of
pending work, not a decision gap:

- Exact final category-palette hex values and a Light/Dark contrast pass —
  implementation-phase task, direction already approved.
- Exact diagnostic-UI gating mechanism — owed to the Security track
  (`SECURITY-S6`), not the Product Owner.

Orphaned-screen removal remains a **process gate** (the 6-step retirement
policy), not an open decision — the classification itself is already
approved.

## Final validation (per this phase's §19 checklist)

Approved visual references reviewed: YES (REF-01 through REF-07, all 10
supplied images). Approved Visual Reference Register created: YES. Previous
audit corrections applied: YES (§3.1 Archive, §3.2 brand/income, §3.5
Settings section-by-section, §3.6 Auth flow, §3.9 category governance, all
verified against code and/or images). Home re-evaluated against approved
visual: YES. My Money reconciled: YES. Follow-ups re-evaluated: YES. More
incorporated: YES. Settings incorporated and section-by-section audit
completed: YES. Live auth flow identified: YES. Archive corrected to More →
My Tools: YES. Brand/income semantic decoupling corrected: YES. Category
palette governance documented: YES. Legacy screens preserved as retirement
candidates: YES (none deleted). Developer diagnostics classified: YES.
Canonical Visual Identity / Design System / Token Catalog / Component
Inventory / Screen Matrix / Design Governance / Blueprint Revision Map / this
proposal: all YES, all created this session.

**Production UI code modified: NO. Navigation code modified: NO. Financial
data modified: NO. Database/schema modified: NO. Backup/restore modified:
NO. Sync modified: NO.**
