-- Ensure device audit metadata exists on every legacy MYFI user_data table and
-- force PostgREST to discard any schema cache created before the column existed.

alter table public.user_data
  add column if not exists last_device_id text;

notify pgrst, 'reload schema';
