# MYFI — User-reported bugs, real daily-use device, 2026-08-21

Reported by: the user, direct daily-use testing (not a synthetic/disposable
test account scenario — treat repro steps as read-only investigation first,
do not touch this account's real data while diagnosing).

## Bug 1 — Cold start latency

App takes ~5–10 seconds on the logo/splash screen during ordinary daily
launch (not first-install/onboarding — this is a normal subsequent open).

## Bug 2 — Full-screen "flash" re-render on any settings change / sync

Repro:
```
Settings → Financial Settings → Account Type → Enabled Features
→ toggle any single feature (enable or disable)
```
Observed: the whole screen flashes/re-renders (looks like a full reload,
not a targeted update to just the toggled row), **then navigation kicks
back out to the Settings root screen** instead of staying on the "Enabled
Features" screen. The user cannot toggle a second feature without
re-navigating all the way back in each time.

This matches a broader pattern the user described: any flow that should
take multiple steps/toggles in one screen instead terminates/navigates away
after the first single action.

## Bug 3 — Backup restore silently fails, bounces to Settings (HIGH PRIORITY)

Repro:
```
Settings → restore backup from device → pick a file via the file picker
→ confirm restore
```
Observed: the restore does not complete. Instead of restoring, the app
exits back to the Settings screen. No confirmed error state observed by
the user (worth checking whether an error is being silently swallowed).

**This is the actual currently-shipped restore path used by real users
today — separate from the Phase 10 hardening work in progress, which is
about making backup/restore atomic and crash-safe going forward. This bug
means restore may not be functionally working *at all* right now for
current users, which is a more urgent, live issue than the Phase 10
architecture work.**

## Bug 4 — "stop using / don't add data" blocking screen during sync

Additional detail from the user (2026-08-21): sometimes during sync —
especially with larger data volumes, or after the app sat idle/unused for a
while — a screen appears telling the user to stop using the app or adding
data until sync finishes (exact wording not verified, paraphrased by user).
Also: feature show/hide (per Bug 2's Enabled Features flow) flickers
repeatedly across the app in general, not only on that one screen.

Possibly related to Bug 2 (same "full re-render" pattern) and to the
maintenance-barrier/sync-pause mechanism already in the codebase — worth
checking whether this blocking screen is the maintenance barrier UI
surfacing too aggressively/too often, or firing on ordinary sync rather
than only during restore/migration.

## Bug 5 — Non-functional +/- quick-add buttons on History/Reports (HIGH PRIORITY)

Reported 2026-08-21. The empty-state prompt on History/Reports (add
expense/income when no transactions exist) shows +/- action buttons that
are **purely decorative — pressing them does not add an expense or income**.
This is a real functional defect (a button that looks actionable but does
nothing), not a display-only issue. Treat with the same priority as Bug 3
(restore) — misleading non-functional UI on a financial action.

## Priority ordering (Planning & Audit)

1. Bug 3 (restore silently fails) — investigate first, real users depend on
   this working today.
2. Bug 2 (settings toggle flash + unwanted navigation reset) — real UX
   defect, moderate priority.
3. Bug 1 (slow splash) — performance, lower urgency than the above two.

## Safety note

Bug 3 investigation must be read-only/diagnostic first (no modification to
the user's real backup files or real financial data) until root cause is
understood — standard real-data-safety rule applies.

---

## Resolution status — 2026-08-21, MYFI Implementation

| Bug | State | Commit |
|---|---|---|
| 1 — cold start latency | instrumented, awaiting device numbers | `03db96b` |
| 2 — full-screen flash / navigation reset | fixed | `abe8fd7` |
| 3 — restore appears to fail | fixed, and it was never failing | `abe8fd7` |
| 4 — blocking screen during sync | fixed by the same change | `abe8fd7` |
| 5 — non-functional +/- buttons | fixed | `0609cf8` |

### Bugs 2, 3 and 4 were one defect

`App.js:644` returned a full-screen maintenance view when
`financialMaintenance.blocked` went true. That does not hide the app — it unmounts it,
and when the barrier lifts the tree is rebuilt with every component's state gone.

Bug 2 is that teardown seen directly. Bug 4 is the same screen, reported as intrusive.
Bug 3 is the same mechanism with a much worse read: restore calls the barrier itself
(`dataSlice.js:616`), so SettingsScreen unmounted mid-await and
`setRestoreResultOpen(true)` ran against a component that no longer existed.

**The restore had already succeeded. Only its confirmation was lost.** `importBackup`
completes in the store, which does not care that the component went away. A user
retrying on the assumption of failure was re-running an operation that had worked.

The maintenance screen is now an overlay over a still-mounted tree, in all four
branches that can be on screen when it fires.

### Duplicate protection confirmed by the user

Checked on the real device after the fix: transaction counts show **no duplication**,
including after repeated manual sync. So the idempotency protection held through the
period when restores were being retried under the false impression that they had
failed. Worth recording as its own result — it was never directly tested before, and it
is the thing that would have turned a confusing bug into a damaging one.

### Bug 5 was a missing prop

`HistoryScreen` and `ReportsScreen` declare `onAddExpense`/`onAddIncome` with no-op
defaults, and `App.js` rendered both with no props at all. The empty-state +/- buttons
did nothing: no crash, no log, nothing visible in review. The no-op defaults are what
made it silent — they turn a forgotten prop into a decorative button.

### Regression guards added

- `tests/app-maintenance-overlay.test.cjs` — the barrier must never gate a `return`.
- `tests/screen-action-props-wired.test.cjs` — an action prop a screen declares must be
  supplied where it is rendered.

Both fail against the pre-fix source.

---

## Guiding principle for later work — ordinary sync should be invisible

From the user, 2026-08-21. Recorded as direction, not a queued task; it does not
displace the current measure-first priority on bug 1.

Ordinary sync should have **no visible effect at all** — no screen, no flash, no
interruption — and should wait until the user has finished editing rather than firing
on every individual change.

The overlay fix is a step toward this and not the destination. It stops sync from
destroying UI state, but the maintenance panel is still shown for ordinary sync, which
is exactly what the user is asking to stop seeing. The remaining work is roughly:

1. Debounce the barrier so a burst of edits triggers one maintenance window, not one
   per change.
2. Distinguish maintenance that genuinely must block the user — restore, destructive
   recovery — from ordinary sync, which should not surface at all.
3. Show the panel only for the first kind.

Point 2 is the substantive one and needs care: the barrier currently has a single
"blocked" state used by every caller
(`dataSlice.js:176/494/616`, `useSyncSlice.js:1427/1611/1739/1937/2160/2686/2867`), so
telling the two kinds apart means giving callers a way to declare intent, not guessing
from context at the call site.
