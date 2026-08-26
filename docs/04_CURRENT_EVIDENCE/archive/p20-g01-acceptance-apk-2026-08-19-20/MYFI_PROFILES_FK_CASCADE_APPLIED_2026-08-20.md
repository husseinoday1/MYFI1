# MYFI — profiles_id_fkey drift verified and fixed on the live database

Date: 2026-08-20
Produced by: MYFI Implementation session
Project: `qihahfufuupgivnjzmfe` (MYFI, ap-southeast-2, Postgres 17.6)
Authority: the user granted this session direct read/modify access to the Supabase
database, in the Implementation conversation, and confirmed the other standing rules
still apply.

## The drift was real — first direct proof

Until now this was a claim from an external report that nobody had checked against the
live database. It checks out.

```text
profiles_id_fkey
  definition : FOREIGN KEY (id) REFERENCES auth.users(id)
  confdeltype: 'a'  (NO ACTION)
  validated  : true
```

The repo declares `on delete cascade`
(`202608010001_create_normalized_core.sql:7`). The live database did not have it.

This is the cause of "Database error deleting user": the constraint refuses, the whole
delete statement rolls back, and nothing is deleted.

## Preflight

```text
orphan_profile_rows : 0
profiles_row_count  : 6
auth_users_count    : 6
profiles_total_size : 48 kB
```

Zero orphans, so the replacement constraint could be validated against existing data
without deleting anything.

## Applied

Migration `profiles_id_fkey_on_delete_cascade`, exactly the reviewed script in
`supabase/ops/2026-08-20-profiles-fk-cascade/02_MIGRATION.sql`: add the replacement
`NOT VALID`, `VALIDATE` it, drop the old constraint, rename. The protective constraint
is never absent at any interruptible point, orphans stop the migration rather than
being repaired, and a wrong end state raises rather than commits.

## Postcheck

```text
definition          : FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
validated           : true
fk_count_on_profiles: 1        (no leftover constraint from the swap)
leftover_constraints: 0
profiles_row_count  : 6        (unchanged from preflight)
orphan_profile_rows : 0
```

No row was read or written. Only constraint metadata changed.

Cascade behaviour was deliberately **not** tested by deleting a user. That is a
behavioural test and belongs on a disposable account under its own approval.

## The report missed a second blocker — account deletion is still blocked

The external report named only `profiles`. Enumerating every foreign key to
`auth.users` shows two tables refuse a user delete, not one:

| Table | Constraint | ON DELETE |
|---|---|---|
| `public.profiles` | `profiles_id_fkey` | ~~NO ACTION~~ → **CASCADE** (fixed here) |
| `public.finance_data` | `finance_data_id_fkey` | **NO ACTION** — still blocking |
| `public.audit_events` | `audit_events_user_id_fkey` | SET NULL (does not block) |
| 9 others (`workspaces`, `user_data`, `financial_ledgers_v2`, `financial_mutations_v1`, `financial_bootstrap_sessions_v2`, `financial_restore_events_v2`, `subscriptions`, `support_tickets`, `workspace_members`) | — | CASCADE |

**So deleting a user will still fail.** Anyone testing after this fix and seeing the
same error should not conclude the fix failed — it worked, and a second constraint is
next in line.

`finance_data` is not declared in any repo migration; it is the legacy jsonb schema
already noted for removal in Phase 13/19. It holds 1 row.

## Open decision — not taken here

`finance_data` is outside the mandate this fix was authorised under, and the right
answer is a product call rather than an engineering default:

1. Give it `ON DELETE CASCADE` to match every other table.
2. Drop the table, since it is legacy and already scheduled for removal.
3. Leave it, and accept that account deletion stays blocked until Phase 13/19.

Option 2 is the one that actually retires the problem, but dropping a table holding
financial-shaped data is a deliberate decision with its own evidence, not a follow-on
to this migration.

## Impact

```text
Financial data changed        : NO
Rows read or written          : NONE
Local SQLite / V7 / V8 changed: NO
App code changed              : NO
Supabase schema changed       : YES — public.profiles delete rule only
Reversible                    : the constraint, yes (03_ROLLBACK.sql).
                                Rows deleted by a future cascade, no.
```
