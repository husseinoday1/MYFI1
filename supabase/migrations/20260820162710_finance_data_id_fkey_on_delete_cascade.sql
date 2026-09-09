-- Mirrors the production migration recorded as 20260820162710.
-- It has already been applied remotely; this file restores source-of-truth
-- parity so future migration runs do not treat it as unknown history.
--
-- public.finance_data is not created by any migration in this repository --
-- confirmed by grepping every migration and every application/function source file --
-- so it only ever existed on the original personal-account project, predating
-- tracked migration history there. On a project provisioned from this repository's
-- migrations alone (e.g. the Phase 16 account migration), the table never exists,
-- and an unconditional ALTER TABLE would fail with relation-does-not-exist. Guard
-- on the table's presence so this stays a harmless no-op on a fresh project while
-- remaining byte-for-byte equivalent to the original statements wherever the
-- legacy table is actually present.
do $$
begin
  if to_regclass('public.finance_data') is not null then
    alter table public.finance_data
      drop constraint if exists finance_data_id_fkey;

    alter table public.finance_data
      add constraint finance_data_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end
$$;
