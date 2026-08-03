alter table public.user_data
  add column if not exists revision bigint not null default 0,
  add column if not exists device_id text;

create or replace function public.sync_user_data_v2(
  p_expected_revision bigint,
  p_trans jsonb,
  p_debts jsonb,
  p_goals jsonb,
  p_wallets jsonb,
  p_commitments jsonb,
  p_cats jsonb,
  p_cfg jsonb,
  p_device_id text
)
returns table (
  accepted boolean,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_revision bigint;
  v_updated_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  -- Serialize writes for the same account without locking unrelated users.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select user_data.revision
    into v_current_revision
    from public.user_data
   where user_data.user_id = v_user_id;

  if not found then
    if coalesce(p_expected_revision, 0) <> 0 then
      return query select false, 0::bigint, null::timestamptz;
      return;
    end if;

    insert into public.user_data (
      user_id, trans, debts, goals, wallets, commitments, cats, cfg,
      revision, device_id, updated_at
    ) values (
      v_user_id,
      coalesce(p_trans, '[]'::jsonb),
      coalesce(p_debts, '[]'::jsonb),
      coalesce(p_goals, '[]'::jsonb),
      coalesce(p_wallets, '[]'::jsonb),
      coalesce(p_commitments, '[]'::jsonb),
      coalesce(p_cats, '[]'::jsonb),
      coalesce(p_cfg, '{}'::jsonb),
      1,
      p_device_id,
      v_updated_at
    );
    return query select true, 1::bigint, v_updated_at;
    return;
  end if;

  if v_current_revision <> coalesce(p_expected_revision, 0) then
    return query
      select false, v_current_revision, user_data.updated_at
        from public.user_data
       where user_data.user_id = v_user_id;
    return;
  end if;

  update public.user_data
     set trans = coalesce(p_trans, '[]'::jsonb),
         debts = coalesce(p_debts, '[]'::jsonb),
         goals = coalesce(p_goals, '[]'::jsonb),
         wallets = coalesce(p_wallets, '[]'::jsonb),
         commitments = coalesce(p_commitments, '[]'::jsonb),
         cats = coalesce(p_cats, '[]'::jsonb),
         cfg = coalesce(p_cfg, '{}'::jsonb),
         revision = v_current_revision + 1,
         device_id = p_device_id,
         updated_at = v_updated_at
   where user_data.user_id = v_user_id;

  return query select true, v_current_revision + 1, v_updated_at;
end;
$$;

revoke all on function public.sync_user_data_v2(
  bigint, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) from public, anon;

grant execute on function public.sync_user_data_v2(
  bigint, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) to authenticated;
