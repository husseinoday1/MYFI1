# MYFI — System States and Feedback

**Status:** CANONICAL · **Created:** 2026-08-26 (expanded from
`03_MYFI_DESIGN_SYSTEM_CANONICAL.md` §10 into its own document, per the
Master Blueprint rebuild)

This document defines the **UX-contract presentation** of states across the
app. It does not describe or authorize any change to restore, sync, or
backup *behavior* — those remain owned by Implementation/Security and are
explicitly out of scope here (see §12).

## 1. Loading

Use a skeleton (`Skeleton` in `src/components/AppPrimitives.js`, confirmed
existing and canonical) wherever a screen's shape is known before its data
arrives. Use a blocking progress indicator only where no partial shape can
be shown (rare — most MYFI screens have a known layout).

## 2. Empty

Every empty state explains three things: what is missing, why it matters,
and a next action. Never a bare illustration with no path forward. Applies
to: no transactions yet, no wallets beyond the default, no budget set, no
goals, no debts/receivables, empty Reports for a period.

## 3. Error

- **Inline validation:** field-level, appears next to the input.
- **Recoverable error:** a retry action is offered directly (e.g. a failed
  load can be retried without leaving the screen).
- **Network/offline:** MYFI is local-first — most screens should keep
  working with local data; only sync-dependent actions should show an
  offline state, and they must say so plainly rather than failing silently.
- **Blocking error:** reserved for genuinely unrecoverable situations.
- **Destructive-operation error:** distinct from a normal error — pairs with
  the `financial.danger` token (see `04_MYFI_DESIGN_TOKEN_CATALOG.md`).
- **Data-integrity error:** surfaced honestly, never silently repaired —
  consistent with the standing financial-safety rule that MYFI never
  silently repairs financial data.

## 4. Success / feedback

Save, copy, delete, undo, import, sync, backup, restore, creation, and
settings-update confirmations each use one of:

- **Inline feedback** — a field or row visibly updates.
- **Toast/snackbar** — via `AppAlertHost.js` (confirmed existing, canonical
  global host) for transient, non-blocking confirmations.
- **Modal/dialog** — via `DecisionModal.js` for anything requiring
  acknowledgement before continuing (e.g. a destructive confirmation).
- **State transition** — the screen itself visibly changes (e.g. a
  completed onboarding step, a goal reaching 100%).

Do not mix these patterns arbitrarily for the same kind of event across
different screens.

## 5. Warning

Distinct from error — informational, not blocking (e.g. approaching a
budget limit). Uses `financial.warning`, paired with text, never color
alone.

## 6. Offline

Given MYFI's local-first architecture, "offline" is not a global blocking
state — only sync/cloud-dependent actions (backup, restore, cross-device
sync) need an explicit offline indicator; core financial entry/viewing must
continue to work without a connection.

## 7. Permission denied

Since permissions are requested contextually (per the onboarding ruling —
no bundled permission requests during onboarding), a denied permission's
feedback appears at the point of the feature that needed it, explains what
the feature can't do without it, and offers a path to system settings — not
a generic app-wide banner.

## 8. No data (distinct from Empty)

"No data" applies to a report/period with genuinely nothing to show yet
(e.g. a brand-new wallet with zero transactions) — treated per §2's rule,
distinguished from "Empty" only in that it may need a shorter, less
instructive message when the cause is obvious (e.g. "this month has no
transactions yet" needs no further explanation).

## 9. First use

First-use states (a fresh wallet, a fresh Follow-ups section) show a
lightweight version of the Empty pattern, tuned to be encouraging rather
than clinical — consistent with the onboarding tone defined in
`02_MYFI_VISUAL_IDENTITY_CANONICAL.md`.

## 10. Sync pending / sync failed

Presented as a **status indicator only** (e.g. the Account & Sync card's
existing "تمت المزامنة الآن" pattern, confirmed in the approved Settings
reference) — this document defines how that status is *shown*, not how sync
itself behaves, retries, or resolves conflicts, which remains entirely
owned by the sync/backend implementation.

## 11. Restore/recovery status — UX-contract level only

MYFI's restore flow may show a neutral status indicator (e.g. "restoring…",
"restore complete") using the same pattern as sync status. **This document
does not describe, does not evaluate, and does not authorize any change to
the actual restore engine's behavior, safety checks, or semantics** — that
is explicitly Testing & Release/Security/Implementation territory (see the
Planning handoff's "Known Technical Risks Outside Design" section for the
active restore-engine wiring correction, which this document does not
attempt to resolve).

## 12. Boundary

Nothing in this document touches: financial data, ledger, balances,
transactions, transfer semantics, historical FX, reconciliation, SQLite
schema, migrations, backup format, restore logic, restore engine, sync
behavior, authentication behavior, or SecureStore behavior. It defines
presentation only.
