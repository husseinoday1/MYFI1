-- MYFI V4: harden legacy snapshot sync for multi-device use.
-- Idempotent migration. Direct client writes are disabled; authenticated writes go through sync_user_data_v2.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trans jsonb not null default '[]'::jsonb,
  debts jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  wallets jsonb not null default '[]'::jsonb,
  commitments jsonb not null default '[]'::jsonb,
  cats jsonb not null default '[]'::jsonb,
  cfg jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  last_device_id text
);

alter table public.user_data add column if not exists trans jsonb not null default '[]'::jsonb;
alter table public.user_data add column if not exists debts jsonb not null default '[]'::jsonb;
alter table public.user_data add column if not exists goals jsonb not null default '[]'::jsonb;
alter table public.user_data add column if not exists wallets jsonb not null default '[]'::jsonb;
alter table public.user_data add column if not exists commitments jsonb not null default '[]'::jsonb;
alter table public.user_data add column if not exists cats jsonb not null default '[]'::jsonb;
alter table public.user_data add column if not exists cfg jsonb not null default '{}'::jsonb;
alter table public.user_data add column if not exists revision bigint not null default 0;
alter table public.user_data add column if not exists updated_at timestamptz not null default now();
alter table public.user_data add column if not exists last_device_id text;
alter table public.user_data alter column trans set default '[]'::jsonb;
alter table public.user_data alter column debts set default '[]'::jsonb;
alter table public.user_data alter column goals set default '[]'::jsonb;
alter table public.user_data alter column wallets set default '[]'::jsonb;
alter table public.user_data alter column commitments set default '[]'::jsonb;
alter table public.user_data alter column cats set default '[]'::jsonb;
alter table public.user_data alter column cfg set default '{}'::jsonb;

update public.user_data set revision = 0 where revision is null or revision < 0;
update public.user_data set updated_at = now() where updated_at is null;

alter table public.user_data enable row level security;

-- Replace legacy policies so an old permissive policy cannot OR with the new privacy rule.
do $$
declare
  p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'user_data'
  loop
    execute format('drop policy if exists %I on public.user_data', p.policyname);
  end loop;
end $$;

create policy "user_data_select_own"
on public.user_data
for select
to authenticated
using (user_id = auth.uid());

-- Clients can read their own snapshot. All mutations are forced through the revision-checked RPC.
revoke all on table public.user_data from anon;
revoke insert, update, delete on table public.user_data from authenticated;
grant select on table public.user_data to authenticated;

create or replace function public.sync_user_data_v2(
  p_expected_revision bigint,
  p_trans jsonb,
  p_debts jsonb,
  p_goals jsonb,
  p_wallets jsonb,
  p_commitments jsonb,
  p_cats jsonb,
  p_cfg jsonb,
  p_device_id text default null
)
returns table(accepted boolean, revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_current_revision bigint;
  v_updated_at timestamptz;
  v_next_revision bigint;
  v_payload_bytes bigint;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if coalesce(p_expected_revision, -1) < 0 then
    raise exception 'invalid_expected_revision' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_trans, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_debts, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_goals, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_wallets, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_commitments, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_cats, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_cfg, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_sync_payload' using errcode = '22023';
  end if;

  v_payload_bytes :=
      pg_column_size(coalesce(p_trans, '[]'::jsonb))
    + pg_column_size(coalesce(p_debts, '[]'::jsonb))
    + pg_column_size(coalesce(p_goals, '[]'::jsonb))
    + pg_column_size(coalesce(p_wallets, '[]'::jsonb))
    + pg_column_size(coalesce(p_commitments, '[]'::jsonb))
    + pg_column_size(coalesce(p_cats, '[]'::jsonb))
    + pg_column_size(coalesce(p_cfg, '{}'::jsonb));

  if v_payload_bytes > 8 * 1024 * 1024 then
    raise exception 'sync_payload_too_large' using errcode = '54000';
  end if;

  -- Serialize writes for one user so two devices cannot both accept the same revision.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select ud.revision, ud.updated_at
    into v_current_revision, v_updated_at
  from public.user_data ud
  where ud.user_id = v_uid
  for update;

  if not found then
    if p_expected_revision <> 0 then
      return query select false, 0::bigint, now();
      return;
    end if;

    insert into public.user_data (
      user_id, trans, debts, goals, wallets, commitments, cats, cfg,
      revision, updated_at, last_device_id
    ) values (
      v_uid,
      coalesce(p_trans, '[]'::jsonb),
      coalesce(p_debts, '[]'::jsonb),
      coalesce(p_goals, '[]'::jsonb),
      coalesce(p_wallets, '[]'::jsonb),
      coalesce(p_commitments, '[]'::jsonb),
      coalesce(p_cats, '[]'::jsonb),
      coalesce(p_cfg, '{}'::jsonb),
      1, now(), nullif(left(coalesce(p_device_id, ''), 160), '')
    )
    returning user_data.revision, user_data.updated_at into v_next_revision, v_updated_at;

    return query select true, v_next_revision, v_updated_at;
    return;
  end if;

  if v_current_revision <> p_expected_revision then
    return query select false, v_current_revision, v_updated_at;
    return;
  end if;

  update public.user_data ud set
    trans = coalesce(p_trans, '[]'::jsonb),
    debts = coalesce(p_debts, '[]'::jsonb),
    goals = coalesce(p_goals, '[]'::jsonb),
    wallets = coalesce(p_wallets, '[]'::jsonb),
    commitments = coalesce(p_commitments, '[]'::jsonb),
    cats = coalesce(p_cats, '[]'::jsonb),
    cfg = coalesce(p_cfg, '{}'::jsonb),
    revision = ud.revision + 1,
    updated_at = now(),
    last_device_id = nullif(left(coalesce(p_device_id, ''), 160), '')
  where ud.user_id = v_uid
  returning ud.revision, ud.updated_at into v_next_revision, v_updated_at;

  return query select true, v_next_revision, v_updated_at;
end;
$$;

revoke all on function public.sync_user_data_v2(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) from public;
revoke all on function public.sync_user_data_v2(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) from anon;
grant execute on function public.sync_user_data_v2(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text) to authenticated;
