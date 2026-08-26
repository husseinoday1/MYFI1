# MYFI — Scenario G (Delete Account) is currently failing in-app, not just via Supabase Dashboard

Date: 2026-08-20
Produced by: MYFI Testing & Release session
Requested by: Planning & Audit, to settle whether today's "Database error
deleting user" is pure Supabase infrastructure or touches MYFI's own delete
path, before deciding on Phase 9 closure.

## Test performed

MYFI's actual in-app "حذف حساب MYFI نهائيًا" (Permanently delete MYFI
account) button was pressed on a disposable, already-consumed test account
(`myfitest12345@gmail.com`, workspace `7d616a2a-...`) — deliberately not the
Supabase Dashboard's admin user-deletion UI, to isolate whether the app's own
delete path is affected.

## Result: also fails

```
"تعذر حذف الحساب"
"تحقق من الاتصال وخدمة الحساب ثم حاول مرة أخرى."
```

This is the app's generic `accountServiceIssue` message
(`src/screens/SettingsScreen.js:723` — the fallback branch when the thrown
error doesn't match `/invalid login credentials/i` or
`/local_account_delete_preservation_failed|guest_workspace_merge_failed/i`).

## What the app's delete flow actually does

`src/screens/SettingsScreen.js:693-723` (`deleteAccountPermanently`):
1. Re-authenticates with password (`supabase.auth.signInWithPassword`).
2. Prepares/verifies a local-only workspace snapshot *before* any cloud
   deletion (`prepareLocalWorkspaceForAccountDeletion`) — if this fails, no
   deletion is attempted and the account is untouched.
3. Only then calls a Supabase Edge Function:
   `supabase.functions.invoke('delete-account', { body: { confirm: true } })`.
4. On any failure, rolls back the local workspace snapshot
   (`rollbackLocalWorkspaceAfterAccountDeletionFailure`) — no partial/silent
   local state change.

**The `delete-account` Edge Function's source is not in this repository**
(no `supabase/functions/` directory exists here) — it's deployed
out-of-band, so its internals can't be inspected from this session.

## Conclusion for Planning & Audit's question

The failure is **not isolated to the Supabase Dashboard admin UI** — MYFI's
own delete-account feature, through its own Edge Function call, fails the
same way right now. This doesn't yet distinguish "pure Supabase-side
resource exhaustion also breaking the Edge Function's downstream
`admin.deleteUser()` call" from "a defect in the Edge Function itself" —
both would produce this exact symptom. But it does mean Scenario G can no
longer be treated as "just Dashboard/infrastructure, unrelated to our code"
— MYFI's actual account-deletion capability is confirmed non-functional
right now, regardless of root cause.

## Safety note

No partial state was left behind by this test — the app's own
prepare/rollback design meant either full success or a clean no-op, and
this was a full no-op (deletion never happened, local data untouched). The
disposable test account remains exactly as before, just still not deleted.

## Recommendation

Given this directly affects a real MYFI capability (not proven
infrastructure-only), recommend Planning & Audit treat this as its own
tracked item per your stated fallback ("if it touches our code, this becomes
an independent item, I'll decide then") rather than a precondition that
blocks Phase 9 closure outright — P20-G01 itself is unrelated to Scenario G.
Deciding whether it blocks closure is your call now that the isolation test
is done.
