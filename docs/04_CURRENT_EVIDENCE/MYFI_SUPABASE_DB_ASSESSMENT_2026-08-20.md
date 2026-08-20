# MYFI — Supabase/Database Engine Assessment

**Date:** 2026-08-20
**Prepared by:** external research (ChatGPT Pro), read-only inspection of live
Supabase project + GitHub, relayed by the user, saved by MYFI Planning & Audit.
**Impact:** no code, schema, or data changed by the assessment itself.

## Verdict

**Keep SQLite (device) + Supabase/PostgreSQL (cloud). Do not migrate to
Firebase/Appwrite/Neon.** The current login/signup failures are not evidence
the database choice is wrong — they trace to three separate, fixable causes
below. Migrating a financial app's backend now would be much higher risk
than fixing the actual causes.

## Three real problems found (not hypothetical)

1. **Intermittent Postgres connectivity** — Auth logs show `context deadline
   exceeded`, `request_timeout`, `/signup → 504`, `/token → 504`,
   `failed to connect ... database=postgres` clustered together; the same
   Auth flow returned clean 200s hours earlier the same day. Server-side/
   connectivity, not an email/password validation bug, not SQLite.
2. **Abnormal Postgres transaction pressure** — `pg_stat_database` showed
   `xact_commit ≈ 1.24M` vs `xact_rollback ≈ 311M` (never confirmed when
   `stats_reset` last happened, so don't treat the 311M as "today's" number
   without more evidence), correlated with bursts of `mutation_id_conflict`
   in Postgres logs. Medium-high confidence this is sync/retry traffic
   putting real load on the DB, not yet proven as the sole 504 cause.
3. **Real schema drift, verified directly** — the GitHub migration defines
   `profiles.id → auth.users(id) ON DELETE CASCADE`, but the actual live
   Supabase constraint has **no CASCADE**. This matches an already-logged
   real error: `update or delete on table users violates foreign key
   constraint profiles_id_fkey` on Delete Account attempts. **This is the
   most likely explanation for today's Delete Account failure investigated
   separately during P20-G01 testing.**

## Also flagged

- The app currently shows the user a raw HTTP error response (headers,
  Cloudflare metadata, cookies, request IDs) instead of a plain message —
  independent UX/hygiene issue, not database-engine-related.
- Current architecture is mid-transition across several storage/sync
  generations (legacy `user_data`, normalized Postgres tables, V7/V8 SQLite,
  Sync V1/V2, shadow mode, restore epoch, V2 bootstrap) — normal during a
  staged migration, but the real risk is more than one active writer or
  undisciplined retry semantics between generations, not the DB choice.

## Cost analysis (informational, needs a user decision — see routing below)

- Free tier: $0, Nano compute (shared CPU), pauses after 1 week inactivity —
  fine for dev, not recommended by the report for the production/acceptance
  workload MYFI is running (Auth + financial sync + bootstrap + restore
  epoch + storage, RPC-heavy).
- Pro + Micro compute: ≈ $25/month (Pro base $25 includes $10 compute credit
  that covers Micro). Report's recommendation as a starting point — do not
  jump straight to Small/Medium without measuring actual CPU/RAM/connection
  usage first.
- Neon/Firebase/Appwrite: technically viable database engines in isolation,
  but MYFI also depends on Supabase Auth/RPC/RLS/Storage — migrating any of
  those away is a much bigger, unjustified project right now.

## Proposed remediation plan (report's priority order)

1. Reduce/pause repeated cloud-stress testing cycles against the live
   project until the resource picture is diagnosed (relevant now — Testing
   & Release has been running many device-test rounds against this same
   project today).
2. Confirm current Supabase plan/compute tier from the dashboard; if
   Free/Nano, consider upgrading before further production-acceptance load
   (cost decision — user's call).
3. Investigate CPU/RAM/connections/pooler/disk-IO/long-running
   queries/lock waits/DB size directly.
4. Forensic query on `mutation_id_conflict`: which device/V1-or-V2/same-ID-
   different-payload/retry count/stale outbox resend loop.
5. Make `mutation_id_conflict` non-retryable on payload mismatch (or
   quarantine) instead of retry-looping; add exponential backoff/circuit
   breaker for 500/502/503/504.
6. Fix the `profiles_id_fkey` schema drift via a proper reviewed migration
   (snapshot + preflight first, no ad-hoc manual SQL) — production schema
   change, needs explicit user approval per standing policy.
7. Stop showing raw HTTP response detail to users; show a plain "service
   temporarily unavailable" message, keep technical detail in diagnostics
   only.
8. Confirm Continue-Offline still works cleanly during a cloud outage — local
   SQLite must stay intact and simply defer sync.
9. Re-run the full acceptance sequence after the above (signup, confirm,
   login, refresh, recovery, profile creation, storage, V1/V2 sync,
   two-device conflict, bootstrap, restore epoch, Delete Account,
   existing-user upgrade, 25K/100K load tests).

## Explicitly not recommended

Reinstalling the app or clearing SecureStore/SQLite — this would not fix a
cloud-side 504 and would put local device data at unnecessary risk.

## Planning & Audit routing decision (2026-08-20)

- **Needs the user's direct decision (real money / production schema —
  standing hard-boundary items):**
  1. Whether to upgrade the Supabase plan (~$25/month recurring cost).
  2. Whether to approve fixing the `profiles_id_fkey` schema drift via a
     reviewed production migration (snapshot + preflight required first).
- **Immediate, no approval needed:** Testing & Release eases off
  high-frequency device-test cycles against the live project until items
  2-4 above are checked, so as not to keep adding load while the resource
  picture is unclear.
- **Normal engineering backlog, Implementation:** items 4, 5, 7 (forensics,
  retry/circuit-breaker hardening, error-message sanitization) — none touch
  real financial data destructively, proceed under standard delegation.
- Item 9 (full re-acceptance sequence) happens after 5-7 land, not before.
