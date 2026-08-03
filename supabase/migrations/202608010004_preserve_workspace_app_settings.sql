begin;

alter table public.workspaces
  add column if not exists app_settings jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'workspaces_app_settings_object_check'
       and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_app_settings_object_check
      check (jsonb_typeof(app_settings) = 'object');
  end if;
end;
$$;

commit;
