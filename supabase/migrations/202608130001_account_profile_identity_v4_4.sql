-- MYFI V4.4: account profile identity boundary.
-- The profile belongs to the authenticated user; financial data belongs to workspaces.
-- This migration intentionally does NOT activate shared rooms yet.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_path text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;

drop policy if exists "myfi_profiles_own_v44" on public.profiles;
create policy "myfi_profiles_own_v44"
  on public.profiles for all
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;
revoke delete on public.profiles from authenticated;

create or replace function public.myfi_touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists myfi_profiles_touch_updated_at on public.profiles;
create trigger myfi_profiles_touch_updated_at
before update on public.profiles
for each row execute function public.myfi_touch_profile_updated_at();

-- Seed a profile row from Auth metadata. Account email remains in auth.users;
-- the app does not duplicate credentials in public.profiles.
create or replace function public.myfi_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'displayName',
      new.raw_user_meta_data ->> 'name',
      ''
    )), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists myfi_auth_user_profile_v44 on auth.users;
create trigger myfi_auth_user_profile_v44
after insert on auth.users
for each row execute function public.myfi_create_profile_for_auth_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'myfi-avatars',
  'myfi-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "myfi_avatar_select_own" on storage.objects;
create policy "myfi_avatar_select_own"
  on storage.objects for select to authenticated
  using (bucket_id = 'myfi-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "myfi_avatar_insert_own" on storage.objects;
create policy "myfi_avatar_insert_own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'myfi-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "myfi_avatar_update_own" on storage.objects;
create policy "myfi_avatar_update_own"
  on storage.objects for update to authenticated
  using (bucket_id = 'myfi-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'myfi-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "myfi_avatar_delete_own" on storage.objects;
create policy "myfi_avatar_delete_own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'myfi-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Future shared-room boundary: the normalized MYFI schema already owns financial
-- records by workspace_id / workspace_members. V4.4 deliberately leaves those
-- tables unchanged so enabling rooms later does not require changing profile ownership.
