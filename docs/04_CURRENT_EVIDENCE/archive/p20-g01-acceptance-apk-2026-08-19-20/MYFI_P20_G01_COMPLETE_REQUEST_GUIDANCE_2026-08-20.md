# MYFI P20-G01 — items 2-10 all complete, requesting guidance before Phase 9 closure

Date: 2026-08-20
From: MYFI Testing & Release session, for Planning & Audit

## Status: P20-G01 fully complete

All 10 items done:

| Item | Status |
|---|---|
| 1 | DONE (prior evidence) |
| 2-5 | DONE — install, real-account refusal, disposable account, V2 sync |
| 6-7 | **PASS**, confirmed twice consecutively (fresh account 1→2, and — since email signups hit Supabase's rate limit and account deletion failed on "Database error deleting user" — recovery of a previously split-state account 3→4). See `MYFI_P20_G01_ITEMS_6_7_PASS_2026-08-20.md`. |
| 8 | DONE — server-side `financial_restore_events_v2` audit matches device logs exactly (5/5 events, correct `reason: controlled_recovery`, correct epochs, correct device_id). |
| 9-10 | DONE — signed back into the real account (`husseinoday10@gmail.com`), sync healthy, real financial data present and intact. |

Build used for the passing runs: commit `37c1cca` (and equivalent `850fb7b`),
SHA-256 `131e0928dfbf54add2c8f5c2e59a2b92765900dc25e2108867afb75b856986ae`,
CI run `32324269939` (verified completed/success before use).

## Also on record from today, for awareness

- A false-lead ChatGPT diagnosis (not from Implementation/Planning) claimed
  a 38-million-row runaway V1 sync loop was bloating the database and
  recommended `REINDEX`/`VACUUM` on `financial_mutations_v1`. Checked and
  **debunked**: the table has 283 rows and is 13 MB total. Not executed.
  The Supabase dashboard's "exhausting multiple resources" warning is real
  (also seen as an email-signup rate limit and a failed user-deletion
  attempt today) but its actual cause is still unidentified — likely a
  plan/tier limit, not data bloat. Not a P20-G01 blocker, but worth
  Planning & Audit's attention separately (possible plan upgrade decision).
- Two test accounts consumed today (`husenaudi73@gmail.com` /
  `0c9600f3-...`, `myfitest12345@gmail.com` / `7d616a2a-...`) plus the two
  used for the passing runs (`myfitest67890@gmail.com` /
  `3b6e303d-...`, and `0c9600f3` again for the recovery run) — all
  disposable, no real data involved.

## Requesting guidance on

1. Per the standing rule, `/security-review` and `/code-review` are
   mandatory before any phase-closure decision. Should Testing & Release
   run these now against the `impl/p20-g01-acceptance-apk-2026-08-19`
   branch, or does Planning & Audit want to sequence this differently
   (e.g. after merge, or with a specific target)?
2. Any objection to declaring Phase 9 CLOSED once those two reviews pass,
   given P20-G01 is now fully PASS?
3. Should the Supabase resource-exhaustion issue be tracked as a separate
   item, and does it need resolving before Phase 9 closes or can it run in
   parallel?

Testing & Release is standing by.
