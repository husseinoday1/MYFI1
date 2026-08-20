# MYFI — finance_data_id_fkey cascaded; no constraint blocks account deletion any more

Date: 2026-08-20
Produced by: MYFI Implementation session
Project: `qihahfufuupgivnjzmfe`
Decision: the user chose option 1 (cascade it) over dropping the legacy table, in the
Implementation conversation, after the options were laid out in
`MYFI_PROFILES_FK_CASCADE_APPLIED_2026-08-20.md`.

## Why this existed

The external Supabase report named `profiles` as the cause of "Database error deleting
user". Enumerating every foreign key to `auth.users` after fixing it showed a second
table refusing the same delete. Fixing only the reported one would have left the
symptom exactly as it was, and the obvious reading — "the fix didn't work" — would have
been wrong.

## Preflight

```text
constraint : FOREIGN KEY (id) REFERENCES auth.users(id)
confdeltype: 'a'  (NO ACTION)
row_count  : 1
orphan_rows: 0
inbound_fks: 0        (nothing references finance_data, so cascading it ends there)
total_size : 104 kB
```

`finance_data` is the legacy jsonb table. It is absent from the repo migration chain
and already noted for removal in Phase 13/19, which is why dropping it was the other
option on the table.

## Applied

Migration `finance_data_id_fkey_on_delete_cascade`, the same conservative path as the
profiles fix: add the replacement `NOT VALID`, `VALIDATE` it against existing data,
drop the old constraint, rename. Orphans stop the migration rather than being repaired,
and a wrong end state raises rather than commits.

## Postcheck

```text
finance_data_id_fkey : FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
validated            : true
fk_count             : 1     (no leftover constraint from the swap)
leftovers            : 0
finance_data_rows    : 1     unchanged
profiles_rows        : 6     unchanged
auth_users           : 6     unchanged
financial_ledgers_v2 : 5     unchanged
```

No row was read or written by either migration. Only constraint metadata changed.

## Nothing blocks a user delete now

Every foreign key to `auth.users` outside the reserved schemas, filtered to those that
are neither CASCADE nor SET NULL:

```text
(empty)
```

Twelve constraints reference `auth.users`: eleven CASCADE, one (`audit_events`) SET
NULL, which by design keeps the audit trail while unlinking the user.

## What this means in practice

Account deletion will now actually delete. That is the intended product behaviour and
it is what the Delete Account flow was always written to do — the constraint was
silently preventing it. Everything already declared CASCADE against `auth.users` really
does go: `workspaces`, `user_data`, `financial_ledgers_v2`, `financial_mutations_v1`,
`financial_bootstrap_sessions_v2`, `financial_restore_events_v2`, `subscriptions`,
`support_tickets`, `workspace_members`, plus `profiles` and `finance_data`.

Cascade behaviour was deliberately **not** tested by deleting a user. That is a
behavioural test and belongs on a disposable account under its own approval. Do not run
it against a real account.

Rolling the constraints back restores the block; it does not bring back rows a cascade
has already deleted.

## Impact

```text
Financial data changed        : NO
Rows read or written          : NONE
Local SQLite / V7 / V8 changed: NO
App code changed              : NO
Supabase schema changed       : YES — finance_data delete rule only
Reversible                    : the constraint, yes. Rows a future cascade deletes, no.
```
