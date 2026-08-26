# MYFI — Component Inventory and Migration

**Registered:** 2026-08-25 · **Status:** CANONICAL
**Basis:** direct inspection of `src/components/` (19 files) and
`src/screens/` at HEAD `d2ed3ae03c137d818040dfe77c665c516b8440b7`.
**Note:** per this phase's instructions, no component or screen is
recommended for deletion here — only classification. Legacy items are
"retirement candidates," pending a separate approved implementation package.

## Existing primitives

| Component | Path | Current role | Approved role | Keep/Consolidate/Replace | Migration required? | Screens using it | Priority |
|---|---|---|---|---|---|---|---|
| `AppPrimitives` (Touchable, Skeleton, FinancialDirectionMark) | `src/components/AppPrimitives.js` | Mixed primitive bundle | Split: keep as primitives, but `FinancialAmount` (new) should wrap `FinancialDirectionMark` | Keep, consolidate internally | Low | `HistoryScreen.js` and others | P2 |
| `PressableScale` | `src/components/PressableScale.js` | Pressable scale-animation wrapper | Base for `Button`/icon-button primitive | Keep | Low | Widespread | P2 |
| `ActionMenu` | `src/components/ActionMenu.js` | Generic action menu | Canonical menu primitive | Keep | None | Multiple | P3 |
| `ChoiceSheet` | `src/components/ChoiceSheet.js` | Generic choice bottom sheet | Canonical "simple add" sheet per nav rule | Keep | None | Multiple | P3 |
| `DecisionModal` | `src/components/DecisionModal.js` | Generic confirm/cancel dialog | Canonical destructive-confirmation dialog | Keep | None | Multiple | P3 |
| `MultiSelect` / `SelectionCheckbox` | `src/components/MultiSelect.js` | Generic multi-select | Reusable for onboarding-style priority pickers (REF-03) | Keep | None | Onboarding-equivalent, filters | P3 |
| `DateField` | `src/components/DateField.js` | Date input | Canonical date input | Keep | None | Multiple | P3 |
| `AppAlertHost` | `src/components/AppAlertHost.js` | Global alert/toast host | Canonical feedback host | Keep | None | App-wide | P3 |

## Existing domain components

| Component | Path | Current role | Approved role | Keep/Consolidate/Replace | Migration required? | Screens using it | Priority |
|---|---|---|---|---|---|---|---|
| `WalletBalanceCard` | `src/components/WalletBalanceCard.js` | Wallet balance display | Fills the Blueprint's "AccountCard" role for My Money's wallet strip/gateway | Keep, rename in docs only if needed | Low (token adoption) | Home, My Money (new) | P1 |
| `AddTransModal` | `src/components/AddTransModal.js` | Add expense/income/transfer/smart entry | Canonical single Add flow (Quick Add + side-plus both funnel here per `App.js:785-820`) | Keep | Low | Home, Follow-ups | P1 |
| `TransactionDetailsModal` | `src/components/TransactionDetailsModal.js` | Transaction detail view | Canonical transaction detail | Keep | Low | History, Home | P2 |
| `NewItemModal` | `src/components/NewItemModal.js` | Generic new-entity creation | Candidate base for Debt/Receivable/Commitment/Goal creation (Follow-ups Quick Add) | Keep, verify covers all 4 Follow-ups entity types | Medium — confirm during Follow-ups migration | Follow-ups | P1 |
| `HomeCenterModal` | `src/components/HomeCenterModal.js` | Home hub modal | Unclear exact current role vs. target Home | Needs code-level review during Home migration | Medium | Home | P2 |
| `EntryContextRow` | `src/components/EntryContextRow.js` | Ledger row | Base for canonical `TransactionRow`/`FollowUpCard` row pattern | Consolidate — extend to cover Follow-ups' colored-accent-bar variant (REF-05) | Medium | History, Trackers | P1 |
| `AccountDeleteModal` | `src/components/AccountDeleteModal.js` | Account deletion confirmation | Canonical destructive-account-action dialog, should adopt the new `financial.danger` token | Keep, token update | Low | Settings | P2 |

## Mixed (generic shell, app-specific content)

| Component | Path | Classification note |
|---|---|---|
| `NotificationCenterModal` | `src/components/NotificationCenterModal.js` | Generic modal shell, app-specific content — keep as domain-adjacent |
| `FirstUseGuideModal` | `src/components/FirstUseGuideModal.js` | Relevant to onboarding/first-use; compare against REF-02/03 series during Onboarding migration |
| `PasswordRecoveryModal` | `src/components/PasswordRecoveryModal.js` | Maps to Settings → Account & Sync → password recovery (REF-07) |
| `SmartImageViewerModal` | `src/components/SmartImageViewerModal.js` | Smart-capture adjacent, out of this design phase's scope |
| `DraggableFab` | `src/components/DraggableFab.js` | The "classic"/side-plus Add-mode control (`App.js:1044-1049`) — canonical, confirmed already implements the mutually-exclusive Add-mode requirement |

## Missing primitives (named in target, not found as a reusable unit)

| Proposed component | Rationale | Priority |
|---|---|---|
| `Button` | No standalone primitive found; styling appears inlined per screen (not exhaustively confirmed) | P1 |
| `FinancialAmount` | Amount formatting/coloring appears inline per screen rather than one shared component | P1 |
| `SectionHeader` / `PageHeader` | Repeated header pattern (profile/title/bell) across every approved screen reference, likely reimplemented per screen | P1 |
| `GatewayCard` | My Money's 4-card pattern (REF-04) has no current equivalent — new screen needs this | P1 (blocks My Money build) |
| `SectionListRow` | More/Settings/Follow-ups' icon+title+description+chevron row (REF-05/06/07) — likely 3 separate implementations today | P2 |
| `SelectorRow` | Onboarding's chevron/current-value row (REF-03B) | P2 |
| `SegmentedTabs` | Filter-tab pattern seen in History, Follow-ups sub-screens, Reports | P2 |

## Duplicated components

None found at the shared-component level. Duplication instead exists at the
**screen** level — see the retirement-candidate table below.

## Consolidation candidates

- The 19-file manual `TH[cfg.theme] || TH.dark` pattern → one shared
  `useTheme()` hook (see `MYFI_DESIGN_SYSTEM_CANONICAL.md` §1).
- `ReportsScreen.js`'s standalone `CHART_COLORS` → sourced from
  `category.palette` + semantic tokens (see Design System §12).
- Three independent list-row implementations (More/Settings/Follow-ups
  section rows) → one `SectionListRow`.

## Legacy / retirement candidates (do NOT delete in this phase)

| Screen | Path | Lines | Status | Note |
|---|---|---|---|---|
| `CommitScreen` | `src/screens/CommitScreen.js` | 75 | Orphaned, unreferenced by `App.js` | Superseded by `TrackersLabScreen.js` |
| `DebtsScreen` | `src/screens/DebtsScreen.js` | 356 | Orphaned, unreferenced | Superseded by `TrackersLabScreen.js` |
| `GoalsScreen` | `src/screens/GoalsScreen.js` | 347 | Orphaned, unreferenced | Superseded by `TrackersLabScreen.js` |
| `AuthScreen` | `src/screens/AuthScreen.js` | 361 | Orphaned, unreferenced | Live auth flow confirmed elsewhere: `SettingsScreen.js`'s `AuthModal` (`SettingsScreen.js:1978`, credential logic `619-620`) and duplicated again in `SettingsLegacyScreen.js:794-795`. `AuthScreen.js` independently re-implements the same logic (lines 124/129) but nothing routes to it |
| `SpaceScreen` | `src/screens/SpaceScreen.js` | 184 | Orphaned, abandoned feature | References `family_rooms`/`room_members` Supabase tables used nowhere else in `src/` |

**Retirement policy — Status: APPROVED (2026-08-26).** Classification as
LEGACY / RETIREMENT CANDIDATE is confirmed; none are deleted during design
work. Future removal of any of the above requires, in order: (1)
dependency/reference verification, (2) replacement-flow verification, (3)
feature-parity verification, (4) runtime/device verification where
applicable, (5) explicit Product Owner authorization, (6) an explicit
rollback-safe change package. Until all six steps are satisfied, all five
files are preserved as-is. **`AuthScreen.js` specifically must not be
retired until the live authentication replacement (`SettingsScreen.js`'s
`AuthModal`, confirmed at `SettingsScreen.js:1978`/`619-620`, plus its
duplicate in `SettingsLegacyScreen.js:794-795`) and all its dependencies are
fully identified and verified** — already confirmed located in this
document's table above, but full dependency verification is still an
implementation-phase task, not complete here.

**Also confirmed live, not legacy (correction from initial assumption):**
`SettingsLegacyScreen.js` (3,235 lines) is **not** a retirement candidate in
the same sense as the five screens above — it is embedded and executing
inside `SettingsScreen.js` today (`SettingsScreen.js:1172,1176,1680`,
duplicated auth logic at `794-795`) and must be migrated as one unit with
`SettingsScreen.js`, not retired independently.

## Diagnostic / internal UI (classify, do not delete, do not expose as normal Settings)

**Status: APPROVED DIRECTION (2026-08-26).** Developer, benchmark, SQLite
evidence, restore-benchmark, startup-timing, recovery-gate, and test-data
controls must not appear as normal production-user Settings/More items —
future implementation places them behind one explicit Developer/Diagnostics
mechanism or build/runtime gate. This is no longer an open Product Owner
decision; the exact gating mechanism's technical spec remains owed to the
Security track (`SECURITY-S6`), not to this design workstream. Nothing here
is deleted or modified in this phase.

| Item | Location | Gating today | Target |
|---|---|---|---|
| Performance data lab | `SettingsScreen.js:1834-1848` | `__DEV__`-gated | Already correctly hidden in release builds — keep as-is |
| "Local SQLite evidence" row | `SettingsScreen.js:1544-1557` | **Not gated** — reachable in production | Move behind the one consistent Developer/Diagnostics gate |
| Restore benchmark row | `SettingsScreen.js:1520-1531` | Gated only by build-time env var `EXPO_PUBLIC_PHASE10_RESTORE_BENCHMARK`, not `__DEV__` | Same — mechanism spec owed to Security (`SECURITY-S6`) |
