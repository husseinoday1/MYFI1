-- Adds MYFI account identity fields used for rooms, sharing, and future subscriptions.

alter table public.profiles
  add column if not exists username text,
  add column if not exists phone text;

alter table public.profiles
  drop constraint if exists profiles_username_format_chk;

alter table public.profiles
  add constraint profiles_username_format_chk
  check (
    username is null
    or username ~ '^[a-z0-9_]{3,24}$'
  );

-- Keep the migration safe if local testing created the same handle more than once.
with ranked as (
  select id,
         row_number() over (partition by lower(username) order by created_at nulls last, id) as duplicate_rank
    from public.profiles
   where username is not null
)
update public.profiles p
   set username = null
  from ranked r
 where p.id = r.id
   and r.duplicate_rank > 1;

create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.find_profile_by_username(p_username text)
returns table (
  id uuid,
  display_name text,
  username text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.display_name, p.username
    from public.profiles p
   where lower(p.username) = lower(trim(leading '@' from coalesce(p_username, '')))
     and p.username is not null
   limit 1;
$$;

revoke all on function public.find_profile_by_username(text) from public, anon;
grant execute on function public.find_profile_by_username(text) to authenticated;
