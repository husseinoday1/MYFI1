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
