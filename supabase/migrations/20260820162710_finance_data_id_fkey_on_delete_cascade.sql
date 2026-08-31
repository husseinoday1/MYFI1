-- Mirrors the production migration recorded as 20260820162710.
-- It has already been applied remotely; this file restores source-of-truth
-- parity so future migration runs do not treat it as unknown history.

alter table public.finance_data
  drop constraint if exists finance_data_id_fkey;

alter table public.finance_data
  add constraint finance_data_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;
