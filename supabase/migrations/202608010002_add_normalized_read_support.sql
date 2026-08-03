begin;

alter table public.wallets
  add column if not exists scope text not null default 'personal';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'wallets_scope_check'
       and conrelid = 'public.wallets'::regclass
  ) then
    alter table public.wallets
      add constraint wallets_scope_check check (scope in ('personal', 'business'));
  end if;
end;
$$;

alter table public.workspaces
  add column if not exists default_wallet_id uuid references public.wallets(id) on delete set null;

create index if not exists wallets_workspace_scope_order_idx
  on public.wallets (workspace_id, scope, sort_order)
  where archived_at is null;

commit;
