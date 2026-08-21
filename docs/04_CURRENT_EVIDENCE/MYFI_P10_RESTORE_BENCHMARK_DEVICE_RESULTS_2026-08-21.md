# MYFI — Phase 10 restore benchmark: device results

**Device:** Samsung SM-S938B (2025 flagship), real phone, disposable financially-empty account.
**Build:** `74a3692`, `EXPO_PUBLIC_PHASE10_RESTORE_BENCHMARK=1`, APK from CI run 32493500962,
SHA256 `0ae4e269a89da1aa43bda8a144456be104644ca391da401f6ff573b9e83df958` verified after download.
**Run:** all four tiers completed, ~10 minutes wall clock. No crash.

The earlier attempt on the pre-`d245dc4` build died of an OutOfMemoryError partway
through and reported nothing. The sweep at the start of this run confirmed where it had
died — it removed exactly one orphan, the `100000` stage namespace — which means that run
had completed 1k, 10k and 50k and lost all three because results were only logged at the
end.

## Results

| Tier | canonicalBuild | stageWrite | stageReadback | promotion | **maintenanceBlocked** | totalRestore |
|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 0.26 s | 1.37 s | 1 ms | 0.05 s | **1.42 s** | 1.7 s |
| 10,000 | 4.39 s | 16.42 s | 2 ms | 0.37 s | **16.79 s** | 21.2 s |
| 50,000 | 33.28 s | 86.30 s | 7 ms | 2.07 s | **88.38 s** | 121.7 s |
| 100,000 | 90.66 s | 200.06 s | 29 ms | 8.45 s | **208.54 s** | 299.2 s |

**`maintenanceBlockedMs` is a lower bound.** It covers stage write + stage readback +
promotion. `beginLedgerRestoreEpochV8` and `commitLedgerRestoreEpochV8` are excluded and
production runs both under the same lock, so the real window is this plus both. The
payload carries `maintenanceBlockedIsLowerBound: true` so the number cannot be read
without that.

## What the numbers say

**Staging is the lock window.** At 100k, stage write is 200 s of a 208.5 s blocked
window — 96%. At every tier it is between 96% and 97%.

**Promotion scales, exactly as predicted.** `promoteFinancialWorkspaceStageV7` moves rows
with `INSERT INTO … SELECT` inside SQLite, and it costs 8.45 s for 100,000 transactions —
4% of the blocked window. The prior guidance to look at staging rather than promotion was
correct.

**Per-row staging cost degrades slightly with size**: 1.37, 1.64, 1.73, 2.00 ms per
transaction across the four tiers. Broadly linear with mild superlinearity.

**`canonicalBuild` is superlinear and large**: 0.26 → 4.4 → 33 → 91 s, a 16.7× jump for
the first 10× of rows. It is JS-side projection building, outside the blocked window but
inside the user's wait — 91 s of the 299 s total at 100k.

## Strategy A vs Strategy B

This is the decision the benchmark was built to settle.

**Strategy A — stage inside the maintenance lock.** At 100,000 transactions the app is
frozen and unusable for **at least 3 minutes 28 seconds**, plus the epoch handshake. At
50,000 it is at least 1 minute 28 seconds. A restore is already a frightening moment for
someone who has just lost their data; an app that appears hung for minutes during it is
not defensible. The research called A simpler, and it is — but simplicity was priced
before anyone knew the price.

**Strategy B — stage outside the lock, revalidate at promotion.** The lock then holds
only promotion plus the epoch handshake: **8.45 s at 100k**, 2.07 s at 50k. Roughly
twenty-five times shorter. The cost is the complexity the research named — the promotion
must revalidate the live generation/identity/epoch that existed when staging began, or a
concurrent write during the unlocked staging window is silently lost.

**The measurement supports B for anything above a few thousand transactions**, and shows A
is perfectly adequate below that: 1.42 s at 1,000 rows is a fine freeze.

That suggests the real choice may not be A or B but a threshold — though a threshold means
both paths exist, both need testing, and the rarely-taken one rots. That trade belongs to
Planning, not to this file.

## What is still not measured

`packageReadMs`, `decryptMs`, `inflateMs`, `parseMs`, peak JS heap and SQLite file sizes
are all still `null`. This harness measures staging and promotion only; ZIP, crypto and
parse costs sit outside it and would add to `totalRestore`, not to the lock window.

Also unmeasured: the epoch handshake itself, which is the gap between this lower bound and
the true production lock.

## The epoch handshake, measured

Every number above carries `maintenanceBlockedIsLowerBound` because it excludes
`beginLedgerRestoreEpochV8` and `commitLedgerRestoreEpochV8`. Measured on the same
device via the P19 restore-epoch gate on build `3719187`, epoch 1 → 2, gate PASS:

```
beginMs             6 ms     local exclusive transaction
serverAdvanceMs   581 ms     Supabase RPC round trip
commitMs            7 ms     local exclusive transaction
localHandshakeMs   13 ms
```

**The local half is 13 ms.** The lower bound was understating the SQLite work by
almost nothing, which is the reassuring half of the answer.

**The server round trip is 581 ms**, and in production it sits inside the same fence.
So the figure to add to `maintenanceBlockedMs` is roughly 594 ms, not 13.

### This inverts the picture for ordinary ledgers

At 100,000 transactions the handshake is noise: 0.59 s on top of an 8.45 s promotion.

At 1,000 transactions the promotion is 51 ms and the handshake is 594 ms — **the lock is
more than 90% network wait**. Most real users are far closer to the 1k end than the 100k
end, so for them a Strategy B restore does not block on database work at all. It blocks
on one Supabase call.

Two consequences worth carrying into the lock budget:

1. Optimising SQLite further buys nothing for a typical ledger. The remaining cost is a
   round trip, and the way to shrink a round trip is to not be inside the fence for it,
   or to accept it as the floor.
2. 581 ms is one sample on one network, on Wi-Fi, with a warm connection. A slow or
   flaky mobile connection makes this seconds, and it is the one component of the lock
   window that is not under the app's control. Any predeclared fence budget has to be
   stated against a network assumption, not as a single number.
