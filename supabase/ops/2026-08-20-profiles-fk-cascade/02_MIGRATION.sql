-- MYFI — profiles_id_fkey → ON DELETE CASCADE
-- Date: 2026-08-20
--
-- ***  DO NOT RUN until 01_PRECHECK.sql output has been read and shows        ***
-- ***  "DRIFT CONFIRMED" and orphan_profile_rows = 0.                          ***
--
-- Rollback ships with this file, before execution: see 03_ROLLBACK.sql, and read
-- its warning about what rollback does and does not restore.
--
-- Impact
--   Financial data changed:      NO
--   Rows read or written:        NONE (constraint metadata only)
--   SQLite / V7 / V8 changed:    NO
--   App code changed:            NO
--   Supabase schema changed:     YES — public.profiles foreign key delete rule only
--
-- What this actually changes: today deleting an auth user fails because this
-- constraint refuses, which rolls the whole statement back and deletes nothing.
-- After this, that delete succeeds — and every table already declared
-- ON DELETE CASCADE against auth.users will then really delete its rows. The
-- constraint change is reversible. The deletions it enables are not.
--
-- Conservative path, per instruction: add the replacement NOT VALID, validate it
-- against existing data, and only then drop the old constraint. The protective
-- constraint is never absent at any point where this could be interrupted, and the
-- whole thing runs in one transaction so any failure rolls back completely.

begin;

do $$
declare
  v_delete_rule "char";
  v_validated   boolean;
  v_orphans     bigint;
  v_refs_users  boolean;
begin
  -- ---------------------------------------------------------------------------
  -- Preconditions. Every one of these stops the migration rather than adapting.
  -- ---------------------------------------------------------------------------
  select c.confdeltype,
         c.convalidated,
         (rn.nspname = 'auth' and rt.relname = 'users')
    into v_delete_rule, v_validated, v_refs_users
  from pg_constraint c
  join pg_class      t  on t.oid  = c.conrelid
  join pg_namespace  n  on n.oid  = t.relnamespace
  left join pg_class     rt on rt.oid = c.confrelid
  left join pg_namespace rn on rn.oid = rt.relnamespace
  where n.nspname = 'public'
    and t.relname = 'profiles'
    and c.contype = 'f'
    and c.conname = 'profiles_id_fkey';

  if v_delete_rule is null then
    raise exception 'profiles_id_fkey not found — live schema differs from what PRECHECK assumed; stopping';
  end if;

  if not v_refs_users then
    raise exception 'profiles_id_fkey does not reference auth.users — unexpected shape; stopping';
  end if;

  -- Idempotent: a second run after a successful first one is a no-op.
  if v_delete_rule = 'c' then
    raise notice 'profiles_id_fkey is already ON DELETE CASCADE — nothing to do';
    return;
  end if;

  -- Fail closed on orphans. Deleting them to make the constraint fit would be
  -- silent repair of real user records, which is forbidden.
  select count(*) into v_orphans
  from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id);

  if v_orphans > 0 then
    raise exception
      'found % orphan profiles row(s) with no auth.users match — stopping. Do not delete them automatically; this needs a separate decision', v_orphans;
  end if;

  raise notice 'precondition check passed: on delete = %, validated = %, orphans = 0',
    v_delete_rule, v_validated;

  -- ---------------------------------------------------------------------------
  -- Replace the delete rule.
  -- ---------------------------------------------------------------------------
  -- Leftover from an interrupted earlier attempt, if any.
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'profiles'
      and c.conname = 'profiles_id_fkey_cascade'
  ) then
    raise notice 'dropping leftover profiles_id_fkey_cascade from an interrupted run';
    alter table public.profiles drop constraint profiles_id_fkey_cascade;
  end if;

  alter table public.profiles
    add constraint profiles_id_fkey_cascade
    foreign key (id) references auth.users(id) on delete cascade
    not valid;

  -- Proves existing rows satisfy it before the old constraint is given up.
  alter table public.profiles validate constraint profiles_id_fkey_cascade;

  alter table public.profiles drop constraint profiles_id_fkey;

  alter table public.profiles
    rename constraint profiles_id_fkey_cascade to profiles_id_fkey;

  -- ---------------------------------------------------------------------------
  -- Post-assertion inside the same transaction: if the end state is not exactly
  -- what was intended, roll the whole thing back rather than commit it.
  -- ---------------------------------------------------------------------------
  select c.confdeltype, c.convalidated
    into v_delete_rule, v_validated
  from pg_constraint c
  join pg_class     t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'profiles'
    and c.contype = 'f' and c.conname = 'profiles_id_fkey';

  if v_delete_rule is distinct from 'c' then
    raise exception 'post-assertion failed: delete rule is % after migration, expected c', v_delete_rule;
  end if;
  if not coalesce(v_validated, false) then
    raise exception 'post-assertion failed: profiles_id_fkey is not validated';
  end if;

  raise notice 'profiles_id_fkey is now ON DELETE CASCADE and validated';
end $$;

-- Review the notices above before committing. If anything is unexpected, run
-- ROLLBACK; instead of COMMIT; and nothing will have changed.
commit;

-- Next: run 04_POSTCHECK.sql and keep its output as evidence.
