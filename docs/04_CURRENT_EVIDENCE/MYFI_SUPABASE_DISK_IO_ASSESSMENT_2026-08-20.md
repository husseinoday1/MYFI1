# MYFI — Supabase Disk IO warning: what it is, and why no action is recommended yet

Date: 2026-08-20
Produced by: MYFI Implementation session
Project: `qihahfufuupgivnjzmfe` — status at time of writing: `ACTIVE_HEALTHY`

Recorded because the warning was raised repeatedly during P20-G01 as an open risk
without anyone stating what decision it actually required. The answer is: almost none.

## What the warning means

The free tier gives the database a fixed baseline disk throughput plus a **burst
credit balance** for heavier bursts of work. Sustained activity drains the balance.
When it empties, the database drops to baseline speed — it does not stop, it gets
slow. The balance refills over time.

"Project is depleting its Disk IO Budget" is that balance running down. It is a
capacity signal, not an error and not a sign of data damage.

## Why it appeared on 2026-08-20

That day's device acceptance ran repeated heavy cycles against one small project:
several full V2 bootstraps, restore-epoch advances, shadow syncs, and repeated sign-in
attempts. That is what drained the balance.

It is also the explanation for the item-10 observation, where the real account's data
was verified intact on screen while cloud sync had not confirmed. The data was fine;
the transport was throttled. Recording that plainly so a future reader does not
re-open it as a data-integrity question.

## What it does NOT mean

- No financial data was lost, corrupted, or degraded. Disk IO throttling slows
  queries; it does not alter rows.
- It is not caused by a schema defect, an index problem, or anything in the app code.
- It is not a blocker for Phase 9 or Phase 10.

## The decision it requires

Only one, and only if it recurs under normal use rather than test bursts: upgrade the
plan, or accept slower cloud sync during heavy sessions. That is a billing decision for
the user, not an engineering one, and there is nothing for Implementation to do about
it.

## Performance advisors — checked, and deliberately not acted on

`get_advisors(performance)` was run against the live project. It returns INFO and WARN
lints, none of them Disk IO related:

- 17 foreign keys without a covering index
- 17 indexes reported as never used
- 3 RLS policies re-evaluating `auth.<function>()` per row
- `public.profiles` carrying three overlapping permissive policies per action

**No cleanup is recommended right now, and the reason matters more than the list.**

"Never used" means "not used since statistics were last reset". This project has six
users and tables measured in tens of kilobytes — `profiles` is 48 kB. An index that
looks unused at 5 rows may be exactly the one the app needs at 10,000 transactions, and
dropping it now would cost more later than it saves today. The same applies in reverse
to the missing FK indexes: they matter at scale, not at this size.

The IO pressure on 2026-08-20 came from repeated test cycles, not from index overhead
on tiny tables. Acting on these lints now would look like useful work and change
nothing measurable.

The overlapping RLS policies on `profiles` are the one item with a non-performance
angle — three permissive policies for the same role and action is a correctness smell
worth reviewing on its own merits, separately from performance.

## When to revisit

After the Phase 10 benchmark harness produces real numbers at 1k / 10k / 50k / 100k
transactions. At that point index and policy decisions can be made against
measurements instead of guesses, which is the same standard applied to the staging
strategy choice in Step 4.
