begin;

alter table public.transactions
  add column if not exists from_scope text check (from_scope in ('personal', 'business')),
  add column if not exists to_scope text check (to_scope in ('personal', 'business'));

create or replace function public.normalize_transfer_scopes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_scope text;
  target_scope text;
begin
  if new.kind <> 'transfer' then
    new.from_scope := null;
    new.to_scope := null;
    return new;
  end if;

  select w.scope into source_scope
    from public.wallets w
   where w.id = new.from_wallet_id and w.workspace_id = new.workspace_id;
  select w.scope into target_scope
    from public.wallets w
   where w.id = new.to_wallet_id and w.workspace_id = new.workspace_id;

  if source_scope is null or target_scope is null or new.from_wallet_id = new.to_wallet_id then
    raise exception 'transfer requires two different wallets in the same workspace' using errcode = '23514';
  end if;

  new.scope := source_scope;
  new.from_scope := source_scope;
  new.to_scope := target_scope;
  return new;
end;
$$;

revoke all on function public.normalize_transfer_scopes() from public, anon, authenticated;

drop trigger if exists normalize_transaction_transfer_scopes on public.transactions;
create trigger normalize_transaction_transfer_scopes
before insert or update of kind, workspace_id, from_wallet_id, to_wallet_id, from_scope, to_scope
on public.transactions
for each row execute function public.normalize_transfer_scopes();

create index if not exists transactions_workspace_transfer_scopes_date_idx
  on public.transactions (workspace_id, from_scope, to_scope, date_on desc)
  where kind = 'transfer' and deleted_at is null;

commit;
