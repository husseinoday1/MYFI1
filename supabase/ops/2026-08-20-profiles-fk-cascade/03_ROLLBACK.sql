-- MYFI — rollback for 02_MIGRATION.sql
-- Date: 2026-08-20
--
-- *** READ THIS BEFORE USING IT ***
--
-- This restores the CONSTRAINT. It does not restore ROWS.
--
-- While ON DELETE CASCADE was in place, any auth.users delete really deleted the
-- matching profiles row — and every other table already declared ON DELETE CASCADE
-- against auth.users deleted its rows too, because the constraint that used to make
-- the whole statement roll back was gone. Putting NO ACTION back stops future
-- cascades. It brings nothing back.
--
-- If a user was deleted after the migration and that was not intended, this file is
-- not the remedy. Restoring those rows needs a database backup or PITR, and that
-- decision belongs to the user, not to this script.
--
-- Rollback is only the right move if the migration committed but the resulting FK
-- shape is wrong, or the change is being reverted before any account deletion has
-- been attempted.
--
-- Impact
--   Financial data changed:      NO
--   Rows read or written:        NONE (constraint metadata only)
--   Supabase schema changed:     YES — reverts the delete rule to NO ACTION

begin;

do $$
declare
  v_delete_rule "char";
  v_orphans     bigint;
begin
  select c.confdeltype into v_delete_rule
  from pg_constraint c
  join pg_class     t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'profiles'
    and c.contype = 'f' and c.conname = 'profiles_id_fkey';

  if v_delete_rule is null then
    raise exception 'profiles_id_fkey not found — nothing to roll back';
  end if;

  -- Idempotent.
  if v_delete_rule <> 'c' then
    raise notice 'profiles_id_fkey is not ON DELETE CASCADE (delete rule = %) — nothing to roll back', v_delete_rule;
    return;
  end if;

  select count(*) into v_orphans
  from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id);

  if v_orphans > 0 then
    raise exception
      'found % orphan profiles row(s) — the restrictive constraint cannot be validated over them; investigate before rolling back', v_orphans;
  end if;

  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'profiles'
      and c.conname = 'profiles_id_fkey_noaction'
  ) then
    alter table public.profiles drop constraint profiles_id_fkey_noaction;
  end if;

  alter table public.profiles
    add constraint profiles_id_fkey_noaction
    foreign key (id) references auth.users(id)
    not valid;

  alter table public.profiles validate constraint profiles_id_fkey_noaction;

  alter table public.profiles drop constraint profiles_id_fkey;

  alter table public.profiles
    rename constraint profiles_id_fkey_noaction to profiles_id_fkey;

  select c.confdeltype into v_delete_rule
  from pg_constraint c
  join pg_class     t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'profiles'
    and c.contype = 'f' and c.conname = 'profiles_id_fkey';

  if v_delete_rule is distinct from 'a' then
    raise exception 'rollback post-assertion failed: delete rule is %, expected a (NO ACTION)', v_delete_rule;
  end if;

  raise notice 'profiles_id_fkey restored to NO ACTION — note that deleted rows are NOT restored';
end $$;

commit;
