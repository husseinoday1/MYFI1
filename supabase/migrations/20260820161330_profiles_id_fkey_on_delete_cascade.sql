-- Mirrors the production migration recorded as 20260820161330.
-- It has already been applied remotely; this file restores source-of-truth
-- parity so future migration runs do not treat it as unknown history.

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;
