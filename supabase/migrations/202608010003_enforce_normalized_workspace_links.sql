begin;

create or replace function public.validate_normalized_workspace_links()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_workspace_id uuid;
begin
  if tg_table_name = 'workspaces' then
    if new.default_wallet_id is not null and not exists (
      select 1 from public.wallets w
       where w.id = new.default_wallet_id and w.workspace_id = new.id
    ) then
      raise exception 'default wallet must belong to its workspace' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'commitments' then
    if new.category_id is not null and not exists (
      select 1 from public.categories c where c.id = new.category_id and c.workspace_id = new.workspace_id
    ) then
      raise exception 'commitment category must belong to its workspace' using errcode = '23514';
    end if;
    if new.wallet_id is not null and not exists (
      select 1 from public.wallets w where w.id = new.wallet_id and w.workspace_id = new.workspace_id
    ) then
      raise exception 'commitment wallet must belong to its workspace' using errcode = '23514';
    end if;
    if new.linked_type = 'none' and new.linked_id is not null then
      raise exception 'unlinked commitment cannot have linked_id' using errcode = '23514';
    end if;
    if new.linked_type = 'goal' and (new.linked_id is null or not exists (
      select 1 from public.goals g where g.id = new.linked_id and g.workspace_id = new.workspace_id
    )) then
      raise exception 'commitment goal must belong to its workspace' using errcode = '23514';
    end if;
    if new.linked_type in ('debt', 'receivable') and (new.linked_id is null or not exists (
      select 1 from public.debts d where d.id = new.linked_id and d.workspace_id = new.workspace_id
    )) then
      raise exception 'commitment debt must belong to its workspace' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'transactions' then
    if new.wallet_id is not null and not exists (
      select 1 from public.wallets w where w.id = new.wallet_id and w.workspace_id = new.workspace_id
    ) then
      raise exception 'transaction wallet must belong to its workspace' using errcode = '23514';
    end if;
    if new.from_wallet_id is not null and not exists (
      select 1 from public.wallets w where w.id = new.from_wallet_id and w.workspace_id = new.workspace_id
    ) then
      raise exception 'transfer source wallet must belong to its workspace' using errcode = '23514';
    end if;
    if new.to_wallet_id is not null and not exists (
      select 1 from public.wallets w where w.id = new.to_wallet_id and w.workspace_id = new.workspace_id
    ) then
      raise exception 'transfer target wallet must belong to its workspace' using errcode = '23514';
    end if;
    if new.category_id is not null and not exists (
      select 1 from public.categories c where c.id = new.category_id and c.workspace_id = new.workspace_id
    ) then
      raise exception 'transaction category must belong to its workspace' using errcode = '23514';
    end if;
    if new.debt_id is not null and not exists (
      select 1 from public.debts d where d.id = new.debt_id and d.workspace_id = new.workspace_id
    ) then
      raise exception 'transaction debt must belong to its workspace' using errcode = '23514';
    end if;
    if new.goal_id is not null and not exists (
      select 1 from public.goals g where g.id = new.goal_id and g.workspace_id = new.workspace_id
    ) then
      raise exception 'transaction goal must belong to its workspace' using errcode = '23514';
    end if;
    if new.commitment_id is not null and not exists (
      select 1 from public.commitments c where c.id = new.commitment_id and c.workspace_id = new.workspace_id
    ) then
      raise exception 'transaction commitment must belong to its workspace' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'debt_payments' then
    select d.workspace_id into parent_workspace_id from public.debts d where d.id = new.debt_id;
    if new.transaction_id is not null and not exists (
      select 1 from public.transactions t where t.id = new.transaction_id and t.workspace_id = parent_workspace_id
    ) then
      raise exception 'debt payment transaction must belong to the debt workspace' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'goal_savings' then
    select g.workspace_id into parent_workspace_id from public.goals g where g.id = new.goal_id;
    if new.transaction_id is not null and not exists (
      select 1 from public.transactions t where t.id = new.transaction_id and t.workspace_id = parent_workspace_id
    ) then
      raise exception 'goal saving transaction must belong to the goal workspace' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'transaction_tags' and not exists (
    select 1
      from public.transactions t
      join public.tags tag on tag.id = new.tag_id
     where t.id = new.transaction_id and t.workspace_id = tag.workspace_id
  ) then
    raise exception 'transaction tag must belong to the transaction workspace' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_normalized_workspace_links() from public, anon, authenticated;

drop trigger if exists validate_workspace_default_wallet on public.workspaces;
create trigger validate_workspace_default_wallet
before insert or update of default_wallet_id on public.workspaces
for each row execute function public.validate_normalized_workspace_links();

drop trigger if exists validate_commitment_workspace_links on public.commitments;
create trigger validate_commitment_workspace_links
before insert or update of workspace_id, category_id, wallet_id, linked_type, linked_id on public.commitments
for each row execute function public.validate_normalized_workspace_links();

drop trigger if exists validate_transaction_workspace_links on public.transactions;
create trigger validate_transaction_workspace_links
before insert or update of workspace_id, wallet_id, from_wallet_id, to_wallet_id, category_id, debt_id, goal_id, commitment_id on public.transactions
for each row execute function public.validate_normalized_workspace_links();

drop trigger if exists validate_debt_payment_workspace_links on public.debt_payments;
create trigger validate_debt_payment_workspace_links
before insert or update of debt_id, transaction_id on public.debt_payments
for each row execute function public.validate_normalized_workspace_links();

drop trigger if exists validate_goal_saving_workspace_links on public.goal_savings;
create trigger validate_goal_saving_workspace_links
before insert or update of goal_id, transaction_id on public.goal_savings
for each row execute function public.validate_normalized_workspace_links();

drop trigger if exists validate_transaction_tag_workspace_links on public.transaction_tags;
create trigger validate_transaction_tag_workspace_links
before insert or update of transaction_id, tag_id on public.transaction_tags
for each row execute function public.validate_normalized_workspace_links();

commit;
