# MYFI — Bug 1 (slow app open): measured, and the recorded hypothesis is wrong

**Device:** Samsung SM-S938B, real daily-use phone, USB-attached.
**Build:** installed `com.myfi.app`, startup marks from `03db96b` onward.
**Method:** `adb shell am force-stop` then `am start -W`, four times, with `logcat -v time`
so process start, first frame and the JS marks share one clock.

## The number that matters

| Step | Cold start (4 runs) |
|---|---|
| process start → first frame (native splash) | 81–122 ms |
| `loadLocal` | 32–35 ms |
| `getSession` | 10–13 ms |
| **`authTransition`** | **1614, 1699, 1922, 3191 ms** |
| `onboardFlag` + `ready` | 1–2 ms |
| **process start → `ready`** | **~1.7 – 3.3 s** |

`authTransition` is 95–99% of everything the JS startup sequence spends.

## The recorded hypothesis is disproven

`03db96b` states: *"that sequence awaits `supabase.auth.getSession()` — so first paint
waits on a network round trip. Nothing after `loadLocal` needs to block it."* The planned
fix was to move `getSession` off the critical path.

**`getSession` costs 10–13 ms.** Moving it would save roughly ten milliseconds of a
delay measured in seconds. The network was never the problem, and the fix everyone was
about to build would have changed nothing while touching the code path this project has
said produces its worst bugs.

This is the whole reason the step was measured before being reordered.

## Where the time actually goes

`authTransition` is `await authTransitionQueue.current` — the queued `setUser(...)`. That
runs under `runFinancialMaintenance('session_login_transition', ...)`
(`useSyncSlice.js:1427`), whose `beforeEnter` drains the sync queue, flushes the ledger
writer, yields a turn and flushes again — and whose body then re-runs `loadLocal` plus
the migration and cutover checks.

So a cold start pays for a full maintenance-fenced workspace transition before anything
is shown. Its variance (1.6 s to 3.2 s across four identical runs) points at the queue
drain rather than at fixed work.

## What this does not explain

The user reports 5–10 seconds. Measured process-start → `ready` is 1.7–3.3 s. The rest is
after `ready`, which is exactly what the payload's own caveat says it cannot see: `ready`
is when React is told to render, not when pixels appear. Logcat shows the app still
working for roughly another 3–4 s after that line — sync completing, repeated
`StatusBarModule` churn — consistent with the perceived delay.

**So there are two costs, not one**, and only the first is measured:
1. ~2 s of maintenance-fenced auth transition before first render.
2. Several more seconds of first render and post-mount work, still unmeasured.

Fixing only the first would take a 5–10 s open down to perhaps 3–8 s. Worth doing, not
sufficient.

## A trap in how these numbers get collected

The in-app panel read **128 ms total**, with `authTransition` at 60 ms — a *warm* launch,
where the process was already alive. The same build on a genuine cold start reports
`authTransition` twenty to fifty times higher.

Both numbers are real and they describe different things. Anyone reading the panel alone
would conclude startup is already fast and the delay must be elsewhere. The panel is
still the right tool for a phone with no cable attached, but a cold-start measurement has
to come from a force-stopped process.

## Recommendation

Do not reorder `getSession`. Measure the post-`ready` render before choosing a fix, and
treat the auth-transition cost as the first of two problems rather than the problem.
