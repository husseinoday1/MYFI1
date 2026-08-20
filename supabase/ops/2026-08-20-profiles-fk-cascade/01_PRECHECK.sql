-- MYFI — profiles_id_fkey drift PRECHECK
-- Date: 2026-08-20
-- READ-ONLY. No UPDATE, no DELETE, no ALTER, no DDL of any kind.
--
-- Purpose: prove or disprove, against the live database, the claim that
-- public.profiles' foreign key to auth.users is missing ON DELETE CASCADE.
--
-- Until this output exists, the drift is an unverified claim from an external
-- report. Do not run 02_MIGRATION.sql before reading these results.
--
-- Run in the Supabase SQL Editor (or psql) and return the output, redacted of any
-- user ids you would rather not share. Never paste a service_role key or database
-- password into a chat.

\echo '=== 1. Actual foreign keys on public.profiles ==='
-- pg_get_constraintdef prints the constraint exactly as the server holds it, which
-- is stronger evidence than reconstructing it from information_schema columns.
-- confdeltype: a = NO ACTION, r = RESTRICT, c = CASCADE, n = SET NULL, d = SET DEFAULT
select
  c.conname                                   as constraint_name,
  pg_get_constraintdef(c.oid)                 as definition,
  c.convalidated                              as is_validated,
  c.confdeltype                               as on_delete_code,
  case c.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else 'UNKNOWN'
  end                                         as on_delete_action,
  rt.relname                                  as references_table,
  rn.nspname                                  as references_schema
from pg_constraint c
join pg_class      t  on t.oid  = c.conrelid
join pg_namespace  n  on n.oid  = t.relnamespace
left join pg_class     rt on rt.oid = c.confrelid
left join pg_namespace rn on rn.oid = rt.relnamespace
where n.nspname = 'public'
  and t.relname = 'profiles'
  and c.contype = 'f'
order by c.conname;

\echo ''
\echo '=== 2. Verdict: is the drift real? ==='
select
  coalesce(
    (select case c.confdeltype when 'c' then 'NO DRIFT — already ON DELETE CASCADE'
                               else 'DRIFT CONFIRMED — on delete is ' ||
                                    case c.confdeltype
                                      when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                                      when 'n' then 'SET NULL'  when 'd' then 'SET DEFAULT'
                                      else 'UNKNOWN' end
     end
     from pg_constraint c
     join pg_class t on t.oid = c.conrelid
     join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public' and t.relname = 'profiles'
       and c.contype = 'f' and c.conname = 'profiles_id_fkey'),
    'CONSTRAINT profiles_id_fkey NOT FOUND — stop, this is a different shape than expected'
  ) as verdict;

\echo ''
\echo '=== 3. Orphan rows (profiles with no matching auth.users row) ==='
-- If this is greater than zero the migration must stop. Adding a validated FK over
-- orphans is impossible, and deleting them to make it fit would be silent data
-- repair on real user records.
select count(*) as orphan_profile_rows
from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

\echo ''
\echo '=== 4. Table size — how much data the DDL has to validate ==='
select
  (select count(*) from public.profiles)                       as profiles_row_count,
  pg_size_pretty(pg_total_relation_size('public.profiles'))    as profiles_total_size;

\echo ''
\echo '=== 5. Other constraints that would also fire on a user delete ==='
-- Context only. These already cascade from auth.users today; profiles is what
-- currently blocks the delete and makes the whole statement roll back.
select
  n.nspname   as schema,
  t.relname   as table_name,
  c.conname   as constraint_name,
  case c.confdeltype
    when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'  when 'd' then 'SET DEFAULT' else 'UNKNOWN'
  end         as on_delete_action
from pg_constraint c
join pg_class      t  on t.oid  = c.conrelid
join pg_namespace  n  on n.oid  = t.relnamespace
join pg_class      rt on rt.oid = c.confrelid
join pg_namespace  rn on rn.oid = rt.relnamespace
where c.contype = 'f'
  and rn.nspname = 'auth'
  and rt.relname = 'users'
  and n.nspname not in ('auth', 'storage', 'realtime', 'vault', 'extensions')
order by
  case c.confdeltype when 'c' then 1 else 0 end,  -- non-cascading first: these block
  n.nspname, t.relname;

\echo ''
\echo '=== PRECHECK COMPLETE — no data was modified ==='
