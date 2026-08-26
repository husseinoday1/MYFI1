# MYFI P20-G01 — items 6-7 PASS, confirmed twice consecutively

Date: 2026-08-20
Produced by: MYFI Testing & Release session
APK: CI build, commit `37c1cca` ("re-bootstrap the new epoch before
shadow-validating it"), SHA-256
`131e0928dfbf54add2c8f5c2e59a2b92765900dc25e2108867afb75b856986ae` — verified
via `gh run view 32324269939` (completed/success) before use, and hash-matched
after install.

Per Planning & Audit's standing rule for counter/epoch-related fixes
(consecutive-run verification before acceptance), the gate was pressed to a
PASS twice, on two different account states.

## Run 1 — fresh account

Newly created `myfitest67890@gmail.com` (workspace
`user:3b6e303d-4a03-4643-a5d8-2b54b613b3b8`), never used before, financially
empty, confirmed real sync ("last sync" timestamp populated, not "not yet").
Single gate press:

```json
{
  "ok": true, "blocked": false,
  "fromEpoch": 1, "toEpoch": 2,
  "protocolVersion": 2,
  "deleteLocalInterlock": "PASS_FAIL_CLOSED",
  "backupRestoreInterlock": "PASS_FAIL_CLOSED",
  "localIntentCommitted": true,
  "serverAdvanced": true,
  "restoreEventCount": 1,
  "disposableAccountConsumed": true,
  "financialDataChangedByGate": false
}
```

## Run 2 — recovery of an already-split-state account

`EXPO_PUBLIC_SUPABASE_KEY` rate limits and a Supabase resource-exhaustion
warning blocked creating a fourth fresh account (`email rate limit
exceeded` on signup, and a user-deletion attempt on old accounts also failed
with a generic "Database error deleting user" — both consistent with the
project's own "exhausting multiple resources" banner in the dashboard, not a
code defect). With the user's agreement, re-used
`husenaudi73@gmail.com` (workspace `user:0c9600f3-...`) instead — a test
account previously left in split state (epoch advanced without
re-activation, per `MYFI_P20_G01_D2_...ROOTCAUSE_2026-08-19.md` and
`MYFI_P20_G01_D3_...2026-08-20.md`). This is arguably a *stronger* test than
a second fresh account: it verifies the fix can recover a genuinely broken
prior state, not just avoid breaking a clean one.

```json
{
  "ok": true, "blocked": false,
  "fromEpoch": 3, "toEpoch": 4,
  "protocolVersion": 2,
  "deleteLocalInterlock": "PASS_FAIL_CLOSED",
  "backupRestoreInterlock": "PASS_FAIL_CLOSED",
  "localIntentCommitted": true,
  "serverAdvanced": true,
  "restoreEventCount": 1,
  "disposableAccountConsumed": true,
  "financialDataChangedByGate": false
}
```

Both runs: `financialDataChangedByGate: false`, `sqliteSchemaChanged: false`,
`secureStoreChanged: false`, `supabaseSchemaChanged: false` — no real
financial data touched by the gate itself in either run.

## Verdict

**Items 6 and 7: PASS, confirmed on two consecutive runs across two
different starting states (fresh account, recovered split-state account).**
Both accounts are now marked `disposableAccountConsumed: true` by the gate
itself and should not be reused further.

## Infrastructure note (separate from the code fix)

The Supabase project showed a "currently exhausting multiple resources"
warning in the dashboard, plus an email-send rate limit on new signups and a
failed user-deletion attempt with no specific error. None of this affected
the gate's correctness — it's a project-resource/billing matter, flagged for
Planning & Audit separately, not a P20-G01 blocker.

## Next

Both accounts' `nextAction` says
`SIGN_OUT_DISPOSABLE_ACCOUNT_AND_VERIFY_ORIGINAL_ACCOUNT_ONLY` — proceeding
to item 8 (read-only Supabase check of the restore event) and items 9-10
(sign out of disposable, verify the real account is untouched and V2-healthy).
