# MYFI — Product Design Restructure Blueprint: Planning & Audit reconciliation

**Date:** 2026-08-25
**Verified branch:** `impl/p10-014a-local-strategy-b-device-gate-2026-08-22`
**Verified HEAD:** `d2ed3ae03c137d818040dfe77c665c516b8440b7`
**Status:** Planning reconciliation of the new blueprint against current repo state, prior to Implementation handoff.

## Decision

`docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`
is accepted as the latest approved Product Owner design/product direction. It is
registered in `docs/00_MYFI_CANONICAL_AUTHORITY.md` as an active planning overlay,
alongside — not replacing — the 2026-08-24 Product/Security addendum. It
authorizes **design audit and documentation only**, per its own §0 and §34.
Implementation still requires a separate approved scope, exactly as the Aug-24
addendum already established for `PRODUCT-P0-A`/`SECURITY-S0`.

## Confirmed conflict: current navigation vs. approved target

The blueprint's §2 asserts a 4-tab primary navigation (`Home / My Money /
Follow-ups / More`) with History, Reports, and Settings explicitly **not**
primary tabs. Verified against the live source:

`App.js:54-60` (`BASE_TABS`, current HEAD):

```js
const BASE_TABS = [
  { key: 'home', ... },
  { key: 'history', labelAr: 'السجل', labelEn: 'History' },
  { key: 'trackers', labelAr: 'المتابعات', labelEn: 'Trackers' },
  { key: 'reports', ... },
  { key: 'settings', ... },
];
```

| | Current implementation (CONFIRMED) | Approved target (blueprint §2) |
|---|---|---|
| Primary tabs | 5: Home, History, Trackers, Reports, Settings | 4: Home, My Money, Follow-ups, More |
| History | primary tab | secondary destination, reached from My Money |
| Reports | primary tab | gateway inside My Money, not primary |
| Settings | primary tab | reached from More, not primary |
| "Trackers" | primary tab, Arabic label already "المتابعات" | renamed/reframed as "Follow-ups", becomes a first-class workspace (debts, receivables, commitments, goals, payment history — broader scope than current `TrackersLabScreen`) |
| My Money / More | do not exist as concepts | new gateways, no current code equivalent |

**Recommended resolution:** the blueprint's navigation is the approved target;
current 5-tab implementation is superseded for *design planning* purposes but
must not be touched yet — no code changes are authorized by this reconciliation
or by the blueprint itself. Screen-by-screen migration classification (which of
`HistoryScreen.js`, `ReportsScreen.js`, `SettingsScreen.js` / `SettingsLegacyScreen.js`,
`TrackersLabScreen.js`, `ArchiveScreen.js` become secondary destinations vs. get
folded into new My Money/Follow-ups/More gateways) is Implementation's work per
blueprint §29, not resolved here.

**Design impact:** major — a new top-level IA.
**Architecture impact:** navigation/routing restructure in `App.js`; no store or
data-layer impact expected at the design-audit stage.
**Financial-data impact:** none — this is presentation/navigation only.
**Product Owner decision required:** No for the audit itself (blueprint already
carries Product Owner approval for the target); **Yes** before any actual
navigation code change, per the blueprint's own §37 gate and standing rule that
Implementation always requires an explicit scoped-and-approved package.

## Other repo facts Implementation should not have to re-derive

- No `docs/design/` directory exists yet — all 8 required outputs are new files.
- Existing design-adjacent docs already in the canonical set: `MYFI_UI_REDESIGN_SPEC_AR.md`,
  `USER_GUIDE_AND_SUPPORT_PLAN_AR.md` (docs/, SUPPORTING per `docs/00_DOCUMENT_INDEX.md`).
  These are inputs to the audit (§33 Blueprint Revision Map), not to be overwritten.
- Screens present at this HEAD: `Onboarding`, `Home`, `History`, `TrackersLab`,
  `Reports`, `Archive`, `Settings`, `SettingsLegacy`, `Auth`, `Commit`, `Debts`,
  `Goals`, `Space` (`src/screens/`, 13 files). `src/components/` holds 20 shared
  components; `src/hooks/` currently holds one hook. This is the actual current
  inventory the blueprint's §11/§20/§29 audits must be run against — not assumed.
- `src/dev/` contains multiple diagnostic/benchmark harnesses from Phase 10
  (clone probes, cloud handshake gate, restore benchmark). These are exactly the
  "Dev/Internal UI" the blueprint's §30 asks to classify separately — do not
  delete them (per both this session's standing rules and the blueprint's own
  instruction).
- Working tree currently carries local, uncommitted documentation changes
  (3 modified + ~20 untracked files, including this reconciliation and the new
  blueprint file) on top of HEAD `d2ed3ae`. Implementation should be aware a
  fresh clone from GitHub will not yet reflect any of this.

## Boundary carried forward unchanged

Everything in the blueprint's §0, §34, and §37 stands as written: documentation
branch only (suggested `design/canonical-visual-system-audit`), no production
code edits, no financial/schema/migration/backup/sync change, no accidental
authorization of an accent color or a primary-tab count different from the
approved 4, no deletion of legacy docs or dev/diagnostic UI.

## Next path

1. Implementation opens `design/canonical-visual-system-audit` from this exact
   HEAD (or current tip at execution time — re-verify first).
2. Implementation executes the full blueprint (`docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`)
   as written, using this reconciliation's confirmed conflict table as a
   starting point rather than re-discovering it.
3. The 8 required `docs/design/*.md` outputs are produced; no code changes.
4. Outputs return to the Product Owner (user) for review before any
   implementation package is selected.
