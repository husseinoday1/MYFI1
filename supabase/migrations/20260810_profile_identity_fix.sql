-- MYFI: profile identity schema repair
-- Fixes PostgREST/Supabase schema-cache errors around display_name.
-- Safe to run more than once.

begin;

alter table if exists public.profiles
  add column if not exists display_name text;

alter table if exists public.profiles
  add column if not exists username text;

alter table if exists public.profiles
  add column if not exists phone text;

alter table if exists public.profiles
  add column if not exists avatar_url text;

-- Normalize blanks so uniqueness behaves predictably.
update public.profiles
set username = null
where username is not null
  and btrim(username) = '';

-- Create case-insensitive username uniqueness only when existing data allows it.
do $$
begin
  if not exists (
    select 1
    from (
      select lower(btrim(username)) as normalized_username
      from public.profiles
      where username is not null and btrim(username) <> ''
      group by lower(btrim(username))
      having count(*) > 1
    ) d
  ) then
    create unique index if not exists profiles_username_unique_ci
      on public.profiles (lower(btrim(username)))
      where username is not null and btrim(username) <> '';
  end if;
end $$;

commit;

-- Ask PostgREST to refresh its schema cache immediately.
notify pgrst, 'reload schema';
