# MYFI — Design Migration Roadmap

**Status:** CANONICAL · **Consolidated:** 2026-08-26 (from
`archive/MYFI_DESIGN_SYSTEM_AUDIT_AND_MIGRATION_PROPOSAL.md`'s
implementation-sequence section, refined with the final Product Owner
corrections)

This is a **practical sequencing recommendation**, not an authorization to
implement. Execution requires its own scoped, approved package per screen/
phase, following standing MYFI engineering rules (CI-only acceptance
builds, `/code-review` before push, evidence written to
`docs/04_CURRENT_EVIDENCE/`).

## Sequence

**1. Token remediation.** Split `brand.primary` from `financial.income` as
independent semantic roles; add `financial.transfer` and `financial.danger`;
apply the audited muted category-palette values (see
`04_MYFI_DESIGN_TOKEN_CATALOG.md`). No screen changes yet.

**2. Shared theme hook + primitive formalization.** Introduce one
`useTheme()` hook, replacing the 19-file manual `TH[cfg.theme] || TH.dark`
pattern. Formalize `Button`, `FinancialAmount`, `SectionHeader`/`PageHeader`,
`SelectorRow`, `SegmentedTabs` from existing inline patterns (see
`05_MYFI_COMPONENT_ARCHITECTURE.md`).

**3. Navigation shell.** Restructure `App.js`'s `BASE_TABS` to 4 tabs; build
thin-router screens for **My Money** (assembling existing Wallets-on-Home
data, `HistoryScreen.js`, `ReportsScreen.js`, and a new Plan & Budget view)
and **More** (assembling relocated Data/Guide/Support/About content plus new
My Tools/Benefits sections). Both are largely reorganization, not rebuild.

**4. Settings/Legacy consolidation.** Migrate `SettingsScreen.js` and
`SettingsLegacyScreen.js` as one unit (Legacy is live, embedded at
`SettingsScreen.js:1172,1176,1680` — never treat it as independently
disposable). Relocate Data/Guide/Support/About content out to More.
Reassign Country/Base Currency to Financial Preferences. Remove the
accent-color, payment-methods, and VAT/rounding rows. Highest-risk single
item in this roadmap (live auth, account deletion, sync status all route
through it).

**5. Archive relocation.** Move `ArchiveScreen.js`'s entry point from
Settings to More → My Tools → Archive. Content/logic unaffected.

**6. Follow-ups relabeling and completion check.** Rename the `trackers` tab
to Follow-ups; confirm all target sections (Debts & Receivables,
Commitments, Installments, Subscriptions, Goals & Savings, **Payment
History**) exist or need adding — `TrackersLabScreen.js` already covers most
of this in substance.

**7. Reports reconnection.** Reconnect `ReportsScreen.js`'s local
`CHART_COLORS` to the governed token system (see
`10_MYFI_CHART_AND_FINANCIAL_VISUALIZATION_SYSTEM.md`); evaluate against the
full report taxonomy and per-report structure defined there — this is a
larger workstream than a color swap.

**8. Onboarding conformance check.** Verify current `OnboardingScreen.js`
against the locked 6-step flow and its exclusions (no account-type
selection, no opening balance, contextual permissions, existing-user "What
Changed" flow) — not yet confirmed compliant or non-compliant in this
audit; this is the first implementation-phase check for onboarding.

**9. Diagnostic-UI gating.** Apply one consistent gating mechanism (spec
owed to Security, `SECURITY-S6`) to the two currently-inconsistent
diagnostic rows in Settings.

**10. Legacy screen retirement (only after its 6-step gate is satisfied).**
`CommitScreen.js`, `DebtsScreen.js`, `GoalsScreen.js`, `AuthScreen.js`,
`SpaceScreen.js` — dependency verification → replacement-flow verification →
feature-parity verification → runtime/device verification → Product Owner
authorization → rollback-safe change package, in that order, always last.

## Validation at every phase

Screenshot baselines per screen per theme before/after; RTL check; a
financial-safety check confirming no phase alters ledger/balance/
transaction/schema/sync/backup/restore behavior (none of the above should,
but Settings/Data-page work is adjacent to backup/restore code and warrants
an explicit confirmation each time).

## Rollback

Every phase above is UI/navigation/documentation-only and independently
revertible via git; none requires a data-layer rollback path.

## Not sequenced here (explicitly out of scope)

The Restore V13/A2 stage-revalidation verification is a **separate,
higher-priority, non-design risk** — see the Planning handoff's "Known
Technical Risks Outside Design." It does not block or gate this roadmap's
design-phase sequencing, but Planning & Audit should not let device-restore
testing proceed without it being checked first, independent of design work.
