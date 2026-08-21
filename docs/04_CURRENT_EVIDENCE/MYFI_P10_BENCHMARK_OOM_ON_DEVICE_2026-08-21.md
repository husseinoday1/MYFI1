# MYFI — the Phase 10 restore benchmark runs out of memory on a real device

**Device:** Samsung SM-S938B (flagship, 2025), real daily-use phone, USB-attached.
**Account:** freshly created disposable account, financially empty.
**Build:** `EXPO_PUBLIC_PHASE10_RESTORE_BENCHMARK=1`, commit `ffe390f` lineage.
**Outcome:** the app crashed after ~6.5 minutes. **No numbers were produced.**

## What happened

The operator tapped "Restore benchmark", confirmed the long-run warning, and left the
phone alone. Memory climbed steadily for six and a half minutes and then the process
died in the foreground.

```
t+30s    500 MB RSS     cpu 121%
t+90s    571 MB
t+150s   676 MB
t+210s   795 MB
t+300s   894 MB
t+390s   1.0 GB
t+~400s  dead
```

```
java.lang.OutOfMemoryError: Failed to allocate a 16 byte allocation with 189248 free
bytes and 184KB until OOM, target footprint 268435456, growth limit 268435456;
giving up on allocation because <1% of heap free after GC.
FATAL EXCEPTION: main
```

## What killed it

The **Java heap** hit its growth limit of 268435456 bytes — 256 MB — and could not
allocate 16 more bytes. `android:largeHeap` is not set in
`android/app/src/main/AndroidManifest.xml`, so the app runs on the default cap.

The fatal frame is in `FabricUIManager` mount-item dispatch, but that is just the
allocation unlucky enough to arrive last: an earlier `OutOfMemoryError` had already been
thrown on a different thread 373 ms before. The heap was exhausted; the next allocation
anywhere would have died.

RSS reached 1.0 GB, which includes Hermes and SQLite native memory. Those are not what
ran out. The 256 MB Java heap is.

## Why this is a result, not a failed test

The benchmark exists to decide whether restore staging can run under the maintenance
lock (Strategy A) or must move outside it (Strategy B). It could not stage 160k rows on
a 2025 flagship without dying.

That answers a question nobody had asked: before choosing where staging runs, the
staging path has to survive the volume at all. On this evidence it does not.

## Two design faults this exposed

### 1. All four tiers report only at the end

`runPhase10RestoreBenchmarkHarness` accumulates into `results` and logs
`[PHASE10_RESTORE_BENCHMARK_RESULTS]` once, after the loop over all four tiers. The
1k, 10k and 50k measurements had almost certainly completed — the run lasted six
minutes — and every one of them was lost with the process.

A benchmark whose whole purpose is to survive long enough to report must report each
tier as that tier finishes. Then a crash at 100k still leaves three usable data points
instead of none.

### 2. A crash skips the cleanup

The harness cleans up its disposable namespaces in a `finally`. A process death runs no
`finally`. Whatever staging rows existed at the moment of the crash are still in the
database under the test account's stage namespaces.

The account is disposable and financially empty, so nothing of the user's is at risk,
but a later run may find remnants and behave differently. Check before re-running.

## What was not learned

No `maintenanceBlockedMs`, no staging or promotion timings, at any tier. The Strategy A
vs B decision is still unmeasured, and remains blocked.

## Recommended next step

Report per tier, then re-run. That alone converts this from a lost afternoon into 1k,
10k and 50k numbers plus a hard upper bound on what the device can stage.

Raising `largeHeap` would let the run go further, but choosing it now would be fixing
the benchmark instead of hearing what it said: a restore of this size does not fit in
the memory an ordinary Android app is given. That belongs in the Strategy A/B decision,
not hidden behind a manifest flag.
