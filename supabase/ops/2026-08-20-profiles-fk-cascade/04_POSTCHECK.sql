-- MYFI — profiles_id_fkey POSTCHECK
-- Date: 2026-08-20
-- READ-ONLY. No UPDATE, no DELETE, no ALTER.
--
-- Run after 02_MIGRATION.sql commits. Keep the output as the evidence that the
-- change landed in the intended shape.
--
-- This deliberately does NOT test cascade behaviour by deleting a user. Proving the
-- constraint is correct is a schema question; proving the delete works is a
-- behavioural test, and it belongs on a dedicated disposable account under its own
-- separate approval — never on a real one.

\echo '=== 1. Final foreign key shape on public.profiles ==='
select
  c.conname                     as constraint_name,
  pg_get_constraintdef(c.oid)   as definition,
  c.convalidated                as is_validated,
  case c.confdeltype
    when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'  when 'd' then 'SET DEFAULT' else 'UNKNOWN'
  end                           as on_delete_action
from pg_constraint c
join pg_class     t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'profiles' and c.contype = 'f'
order by c.conname;

\echo ''
\echo '=== 2. Verdict ==='
select
  case
    when count(*) filter (
      where c.conname = 'profiles_id_fkey'
        and c.confdeltype = 'c'
        and c.convalidated
    ) = 1
     and count(*) = 1
      then 'PASS — profiles_id_fkey is ON DELETE CASCADE, validated, and is the only FK on the table'
    when count(*) > 1
      then 'FAIL — more than one FK left on public.profiles; an interrupted run may have left a leftover constraint'
    else 'FAIL — profiles_id_fkey is not a single validated ON DELETE CASCADE constraint'
  end as verdict
from pg_constraint c
join pg_class     t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'profiles' and c.contype = 'f';

\echo ''
\echo '=== 3. Leftover constraints from an interrupted run (must be empty) ==='
select c.conname
from pg_constraint c
join pg_class     t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'profiles'
  and c.conname in ('profiles_id_fkey_cascade', 'profiles_id_fkey_noaction');

\echo ''
\echo '=== 4. Orphan rows (must still be zero) ==='
select count(*) as orphan_profile_rows
from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

\echo ''
\echo '=== 5. Row count unchanged from PRECHECK? ==='
-- Compare this against section 4 of the PRECHECK output. The migration touches only
-- constraint metadata, so this number must be identical.
select count(*) as profiles_row_count from public.profiles;

\echo ''
\echo '=== POSTCHECK COMPLETE — no data was modified ==='
