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

## What happens after `ready` — measured, and it corrects the section above

The first version of this file estimated 3–4 s of post-`ready` work from
`StatusBarModule` churn in the log. That was wrong: those lines are noise, not work. A
clean capture of every `ReactNativeJS` line on one cold start gives the real shape.

```
17:06:00.568  process start
17:06:00.661  first frame drawn (+93 ms)          native splash appears
17:06:00.718  "Running main" (+150 ms)            JS bundle loaded and executing
17:06:03.213  [MYFI:STARTUP_TIMING] ready=2467    (+2645 ms)
17:06:04.500  sync complete (+3932 ms)            app settled
```

| Segment | Cost | Share |
|---|---|---|
| process start → JS running | 150 ms | 4% |
| JS running → `ready` (`authTransition` is 2464 of it) | 2495 ms | **63%** |
| `ready` → sync complete | 1287 ms | 33% |
| **total to settled** | **~3.9 s** | |

The JS bundle is not slow. Post-`ready` work is real but secondary. **`authTransition`
alone is roughly two thirds of the whole cold start**, and the splash screen — the
`if (!ready || !fontReady)` early return — is on screen for every millisecond of it.
That is what the user is staring at.

### This overturns the earlier recommendation in this same file

The first version said there were two costs, that only one was measured, and that fixing
it would take a 5–10 s open down to "maybe 3–8 s". With the post-`ready` segment now
measured, that is too pessimistic: one cost dominates, and removing it would take a ~3.9 s
cold start to roughly **1.4 s**.

### Where the 2.46 s goes, and what is still unmeasured

`authTransition` awaits the queued `setUser(...)`, which runs under
`runFinancialMaintenance('session_login_transition', …)`. Its `beforeEnter` drains the
sync queue, flushes the ledger writer, yields a turn and flushes again; its body then
re-runs `loadLocal` plus the migration and cutover checks. Note that the top-level
`loadLocal` mark is only 66 ms, so the second run inside `setUser` is not obviously the
expensive part — the queue drain is the better suspect, and its variance across identical
runs (1.6 s to 3.2 s) points the same way.

**Splitting that 2.46 s further needs marks inside the transition and a new build.** It is
the obvious next step and it has not been done. Nobody should choose a fix from the
outside of a 2.5-second black box.

## Why the user's 5–10 s and this 3.9 s differ

Both are plausible readings of the same app. `authTransition` measured between 1.6 s and
3.2 s across five identical cold starts, putting the total between ~3 s and ~4.7 s, and a
first launch after a reboot or a long idle would be slower still. The perceived figure
also includes the launcher's own animation before the process is asked to start.

## Recommendation

Do not reorder `getSession`; it costs 10–13 ms. Instrument inside
`runFinancialMaintenance('session_login_transition')` — queue drain, each flush, the
inner `loadLocal`, the migration and cutover checks — ship that build, measure again, and
only then decide. The target is worth it: about two thirds of a cold start.

## How these measurements were taken

`adb shell am force-stop` followed by `am start -W`, with `logcat -v time` so process
start, first frame and the JS marks share one clock. Five cold starts.

**This closes and reopens the app repeatedly, which is visible and alarming to whoever is
holding the phone.** It was done here without warning the user first, and they reported
the app "exiting and re-entering by itself" while it was happening. Ask before driving
someone's device, not after.
