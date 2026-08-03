-- MYFI normalized core schema.
-- The legacy public.user_data JSON snapshot remains untouched during the migration period.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  country_code text,
  default_currency text not null default 'IQD',
  language text not null default 'ar' check (language in ('ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'personal' check (kind in ('personal', 'business', 'shared')),
  base_currency text not null default 'IQD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists workspaces_owner_kind_active_idx
  on public.workspaces(owner_id, kind)
  where archived_at is null and kind in ('personal', 'business');

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.workspace_members wm
     where wm.workspace_id = p_workspace_id
       and wm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  name text not null,
  name_en text,
  icon text not null default 'pricetag-outline',
  color text not null default '#5B8DEF',
  category_type text not null default 'both' check (category_type in ('income', 'expense', 'both')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, legacy_id)
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  name text not null,
  name_en text,
  wallet_type text not null default 'cash' check (wallet_type in ('cash', 'bank', 'savings', 'business', 'other')),
  currency_code text not null default 'IQD',
  opening_balance numeric(20, 4) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, legacy_id)
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  name text not null,
  direction text not null default 'owed' check (direction in ('owed', 'receivable')),
  total_amount numeric(20, 4) not null default 0 check (total_amount >= 0),
  archived_paid numeric(20, 4) not null default 0 check (archived_paid >= 0),
  currency_code text not null default 'IQD',
  status text not null default 'active' check (status in ('active', 'settled', 'archived')),
  scope text not null default 'personal' check (scope in ('personal', 'business')),
  created_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, legacy_id)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  name text not null,
  target_amount numeric(20, 4) not null default 0 check (target_amount >= 0),
  archived_saved numeric(20, 4) not null default 0 check (archived_saved >= 0),
  currency_code text not null default 'IQD',
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  scope text not null default 'personal' check (scope in ('personal', 'business')),
  created_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, legacy_id)
);

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  name text not null,
  amount numeric(20, 4) not null default 0 check (amount >= 0),
  currency_code text not null default 'IQD',
  due_day smallint not null default 1 check (due_day between 1 and 31),
  first_due_on date,
  repeat_monthly boolean not null default true,
  active boolean not null default true,
  scope text not null default 'personal' check (scope in ('personal', 'business')),
  category_id uuid references public.categories(id) on delete set null,
  wallet_id uuid references public.wallets(id) on delete set null,
  linked_type text not null default 'none' check (linked_type in ('none', 'debt', 'receivable', 'goal')),
  linked_id uuid,
  last_paid_month text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, legacy_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  title text not null,
  note text,
  amount numeric(20, 4) not null default 0,
  allocation_amount numeric(20, 4),
  transfer_amount numeric(20, 4),
  currency_code text not null default 'IQD',
  date_on date not null,
  occurred_at timestamptz,
  kind text not null default 'entry' check (kind in ('entry', 'transfer')),
  flow_type text,
  scope text not null default 'personal' check (scope in ('personal', 'business')),
  wallet_id uuid references public.wallets(id) on delete set null,
  from_wallet_id uuid references public.wallets(id) on delete set null,
  to_wallet_id uuid references public.wallets(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  debt_id uuid references public.debts(id) on delete set null,
  goal_id uuid references public.goals(id) on delete set null,
  commitment_id uuid references public.commitments(id) on delete set null,
  recurring_group_id text,
  commitment_month text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, legacy_id)
);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id) on delete cascade,
  legacy_id text,
  amount numeric(20, 4) not null check (amount >= 0),
  paid_on date not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (debt_id, legacy_id)
);

create table if not exists public.goal_savings (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  legacy_id text,
  amount numeric(20, 4) not null check (amount >= 0),
  saved_on date not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (goal_id, legacy_id)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  legacy_id text,
  name text not null,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (workspace_id, legacy_id),
  unique (workspace_id, name)
);

create table if not exists public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (transaction_id, tag_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_play', 'app_store', 'web', 'manual')),
  product_id text not null,
  entitlement text not null default 'premium',
  status text not null default 'active' check (status in ('pending', 'active', 'grace', 'paused', 'cancelled', 'expired', 'refunded')),
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  original_transaction_id text,
  expires_at timestamptz,
  last_verified_at timestamptz,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_provider_transaction_idx
  on public.subscriptions(provider, original_transaction_id)
  where original_transaction_id is not null;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'billing', 'data', 'suggestion', 'account', 'other')),
  subject text not null,
  message text not null,
  app_version text,
  platform text,
  locale text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists categories_workspace_order_idx on public.categories(workspace_id, sort_order);
create index if not exists wallets_workspace_order_idx on public.wallets(workspace_id, sort_order);
create index if not exists debts_workspace_status_idx on public.debts(workspace_id, status, created_at desc);
create index if not exists goals_workspace_status_idx on public.goals(workspace_id, status, created_at desc);
create index if not exists commitments_workspace_active_idx on public.commitments(workspace_id, active, due_day);
create index if not exists transactions_workspace_date_idx on public.transactions(workspace_id, date_on desc);
create index if not exists transactions_workspace_wallet_date_idx on public.transactions(workspace_id, wallet_id, date_on desc);
create index if not exists transactions_workspace_category_date_idx on public.transactions(workspace_id, category_id, date_on desc);
create index if not exists transactions_workspace_scope_date_idx on public.transactions(workspace_id, scope, date_on desc);
create index if not exists debt_payments_debt_date_idx on public.debt_payments(debt_id, paid_on desc);
create index if not exists goal_savings_goal_date_idx on public.goal_savings(goal_id, saved_on desc);
create index if not exists subscriptions_user_status_idx on public.subscriptions(user_id, status, expires_at desc);
create index if not exists support_tickets_user_created_idx on public.support_tickets(user_id, created_at desc);
create index if not exists audit_events_workspace_created_idx on public.audit_events(workspace_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at before update on public.workspaces
for each row execute function public.set_updated_at();
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();
drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at before update on public.wallets
for each row execute function public.set_updated_at();
drop trigger if exists debts_set_updated_at on public.debts;
create trigger debts_set_updated_at before update on public.debts
for each row execute function public.set_updated_at();
drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at before update on public.goals
for each row execute function public.set_updated_at();
drop trigger if exists commitments_set_updated_at on public.commitments;
create trigger commitments_set_updated_at before update on public.commitments
for each row execute function public.set_updated_at();
drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions
for each row execute function public.set_updated_at();
drop trigger if exists tags_set_updated_at on public.tags;
create trigger tags_set_updated_at before update on public.tags
for each row execute function public.set_updated_at();
drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();
drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at before update on public.support_tickets
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.categories enable row level security;
alter table public.wallets enable row level security;
alter table public.debts enable row level security;
alter table public.goals enable row level security;
alter table public.commitments enable row level security;
alter table public.transactions enable row level security;
alter table public.debt_payments enable row level security;
alter table public.goal_savings enable row level security;
alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.subscriptions enable row level security;
alter table public.support_tickets enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for all to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists workspaces_read on public.workspaces;
create policy workspaces_read on public.workspaces for select to authenticated
using (owner_id = (select auth.uid()) or public.is_workspace_member(id));
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert to authenticated
with check (owner_id = (select auth.uid()));
drop policy if exists workspaces_owner_update on public.workspaces;
create policy workspaces_owner_update on public.workspaces for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists workspaces_owner_delete on public.workspaces;
create policy workspaces_owner_delete on public.workspaces for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists workspace_members_read on public.workspace_members;
create policy workspace_members_read on public.workspace_members for select to authenticated
using (user_id = (select auth.uid()) or exists (
  select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())
));
drop policy if exists workspace_members_owner_write on public.workspace_members;
create policy workspace_members_owner_write on public.workspace_members for all to authenticated
using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));

drop policy if exists categories_member on public.categories;
create policy categories_member on public.categories for all to authenticated
using (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
drop policy if exists wallets_member on public.wallets;
create policy wallets_member on public.wallets for all to authenticated
using (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
drop policy if exists debts_member on public.debts;
create policy debts_member on public.debts for all to authenticated
using (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
drop policy if exists goals_member on public.goals;
create policy goals_member on public.goals for all to authenticated
using (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
drop policy if exists commitments_member on public.commitments;
create policy commitments_member on public.commitments for all to authenticated
using (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
drop policy if exists transactions_member on public.transactions;
create policy transactions_member on public.transactions for all to authenticated
using (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));
drop policy if exists tags_member on public.tags;
create policy tags_member on public.tags for all to authenticated
using (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())))
with check (public.is_workspace_member(workspace_id) or exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = (select auth.uid())));

drop policy if exists debt_payments_member on public.debt_payments;
create policy debt_payments_member on public.debt_payments for all to authenticated
using (exists (select 1 from public.debts d where d.id = debt_id and (public.is_workspace_member(d.workspace_id) or d.workspace_id in (select w.id from public.workspaces w where w.owner_id = (select auth.uid())))))
with check (exists (select 1 from public.debts d where d.id = debt_id and (public.is_workspace_member(d.workspace_id) or d.workspace_id in (select w.id from public.workspaces w where w.owner_id = (select auth.uid())))));
drop policy if exists goal_savings_member on public.goal_savings;
create policy goal_savings_member on public.goal_savings for all to authenticated
using (exists (select 1 from public.goals g where g.id = goal_id and (public.is_workspace_member(g.workspace_id) or g.workspace_id in (select w.id from public.workspaces w where w.owner_id = (select auth.uid())))))
with check (exists (select 1 from public.goals g where g.id = goal_id and (public.is_workspace_member(g.workspace_id) or g.workspace_id in (select w.id from public.workspaces w where w.owner_id = (select auth.uid())))));
drop policy if exists transaction_tags_member on public.transaction_tags;
create policy transaction_tags_member on public.transaction_tags for all to authenticated
using (exists (select 1 from public.transactions t where t.id = transaction_id and (public.is_workspace_member(t.workspace_id) or t.workspace_id in (select w.id from public.workspaces w where w.owner_id = (select auth.uid())))))
with check (exists (select 1 from public.transactions t where t.id = transaction_id and (public.is_workspace_member(t.workspace_id) or t.workspace_id in (select w.id from public.workspaces w where w.owner_id = (select auth.uid())))));

drop policy if exists subscriptions_own_read on public.subscriptions;
create policy subscriptions_own_read on public.subscriptions for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.get_my_subscription_status()
returns table (
  entitlement text,
  status text,
  provider text,
  product_id text,
  environment text,
  expires_at timestamptz,
  last_verified_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.entitlement, s.status, s.provider, s.product_id,
         s.environment, s.expires_at, s.last_verified_at
    from public.subscriptions s
   where s.user_id = auth.uid()
   order by s.expires_at desc nulls last, s.updated_at desc
   limit 1;
$$;

revoke all on function public.get_my_subscription_status() from public, anon;
grant execute on function public.get_my_subscription_status() to authenticated;
drop policy if exists support_tickets_own on public.support_tickets;
create policy support_tickets_own on public.support_tickets for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets for insert to authenticated
with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.wallets to authenticated;
grant select, insert, update, delete on public.debts to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.commitments to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.debt_payments to authenticated;
grant select, insert, update, delete on public.goal_savings to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.transaction_tags to authenticated;
grant select, insert on public.support_tickets to authenticated;

revoke all on table public.profiles, public.workspaces, public.workspace_members,
  public.categories, public.wallets, public.debts, public.goals, public.commitments,
  public.transactions, public.debt_payments, public.goal_savings, public.tags,
  public.transaction_tags, public.subscriptions, public.support_tickets
  from anon;
revoke all on table public.subscriptions from authenticated;
revoke all on public.audit_events from public, anon, authenticated;
