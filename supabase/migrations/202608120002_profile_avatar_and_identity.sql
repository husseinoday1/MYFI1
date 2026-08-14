-- Completes MYFI cloud identity and avatar storage.
-- Safe to run even if the earlier username/phone migration is already deployed.

alter table public.profiles
  add column if not exists username text,
  add column if not exists phone text,
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_username_format_chk;

alter table public.profiles
  add constraint profiles_username_format_chk
  check (username is null or username ~ '^[a-z0-9_]{3,24}$');

with ranked as (
  select id,
         row_number() over (
           partition by lower(username)
           order by created_at nulls last, id
         ) as duplicate_rank
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

-- A user can read and manage only their own avatar folder: <auth.uid()>/avatar.
drop policy if exists "myfi_avatar_select_own" on storage.objects;
create policy "myfi_avatar_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'myfi-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "myfi_avatar_insert_own" on storage.objects;
create policy "myfi_avatar_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'myfi-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "myfi_avatar_update_own" on storage.objects;
create policy "myfi_avatar_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'myfi-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'myfi-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "myfi_avatar_delete_own" on storage.objects;
create policy "myfi_avatar_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'myfi-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
