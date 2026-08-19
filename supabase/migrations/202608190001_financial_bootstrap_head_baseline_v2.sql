-- MYFI P19 FINAL — seed V2 entity-head revisions from the finalized bootstrap baseline.
--
-- Root cause fixed here:
--   finalize_financial_bootstrap_v2() verifies and finalizes the immutable bootstrap
--   snapshot while financial_entity_heads_v2 is still empty. The first post-bootstrap
--   mutation therefore caused sync_financial_mutations_v2() to create an entity head at
--   revision 0, even when the bootstrap already contained that entity at revision N.
--   A legitimate next mutation with baseRevision=N then failed CAS with
--   financial_v2_revision_conflict.
--
-- Contract:
--   * The finalized bootstrap is the authoritative revision baseline.
--   * Only mutable bootstrap row types seed entity heads:
--       entity                -> payload.entity_type / payload.id / payload.revision
--       financial_transaction -> financial_transaction / payload.id / payload.revision
--   * Existing heads that already have an accepted cloud mutation are never rewritten.
--   * Existing zero/uninitialized heads from the pre-fix failure are repaired.
--   * Future bootstrap finalization seeds the baseline atomically in the same transaction.
--   * No financial mutation rows are manufactured and no bootstrap payload is changed.

create or replace function public.seed_financial_bootstrap_entity_heads_v2()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.bootstrapped_at is null or new.bootstrap_id is null then
    return new;
  end if;

  -- A finalized mutable bootstrap row must carry an explicit positive revision
  -- and stable entity identity. Fail the bootstrap transaction rather than
  -- silently establishing an unusable CAS baseline.
  if exists (
    select 1
      from public.financial_bootstrap_rows_v2 br
     where br.ledger_id = new.ledger_id
       and br.restore_epoch = new.restore_epoch
       and br.bootstrap_id = new.bootstrap_id
       and br.row_type in ('entity','financial_transaction')
       and (
         jsonb_typeof(br.payload_text::jsonb) <> 'object'
         or coalesce(trim(br.payload_text::jsonb->>'id'),'') = ''
         or coalesce(br.payload_text::jsonb->>'revision','') !~ '^[1-9][0-9]*$'
         or (
           br.row_type = 'entity'
           and coalesce(trim(br.payload_text::jsonb->>'entity_type'),'') = ''
         )
       )
  ) then
    raise exception 'financial_bootstrap_entity_head_baseline_invalid'
      using errcode = '55000';
  end if;

  insert into public.financial_entity_heads_v2 (
    ledger_id,
    restore_epoch,
    entity_type,
    entity_id,
    current_revision,
    last_mutation_id,
    last_command_id,
    updated_at
  )
  select
    br.ledger_id,
    br.restore_epoch,
    case
      when br.row_type = 'financial_transaction' then 'financial_transaction'
      else br.payload_text::jsonb->>'entity_type'
    end,
    br.payload_text::jsonb->>'id',
    (br.payload_text::jsonb->>'revision')::bigint,
    null,
    null,
    now()
  from public.financial_bootstrap_rows_v2 br
  where br.ledger_id = new.ledger_id
    and br.restore_epoch = new.restore_epoch
    and br.bootstrap_id = new.bootstrap_id
    and br.row_type in ('entity','financial_transaction')
  on conflict (ledger_id, restore_epoch, entity_type, entity_id) do update
    set current_revision = excluded.current_revision,
        updated_at = now()
  where public.financial_entity_heads_v2.last_mutation_id is null
    and public.financial_entity_heads_v2.last_command_id is null
    and public.financial_entity_heads_v2.current_revision < excluded.current_revision;

  return new;
end;
$$;

revoke all on function public.seed_financial_bootstrap_entity_heads_v2()
  from public, anon, authenticated;

drop trigger if exists financial_ledgers_v2_seed_bootstrap_entity_heads
  on public.financial_ledgers_v2;

create trigger financial_ledgers_v2_seed_bootstrap_entity_heads
after update of bootstrap_id, bootstrapped_at
on public.financial_ledgers_v2
for each row
when (new.bootstrapped_at is not null and new.bootstrap_id is not null)
execute function public.seed_financial_bootstrap_entity_heads_v2();

-- Validate all already-finalized bootstrap baselines before backfilling them.
do $$
begin
  if exists (
    select 1
      from public.financial_ledgers_v2 l
      join public.financial_bootstrap_rows_v2 br
        on br.ledger_id = l.ledger_id
       and br.restore_epoch = l.restore_epoch
       and br.bootstrap_id = l.bootstrap_id
     where l.bootstrapped_at is not null
       and l.bootstrap_id is not null
       and br.row_type in ('entity','financial_transaction')
       and (
         jsonb_typeof(br.payload_text::jsonb) <> 'object'
         or coalesce(trim(br.payload_text::jsonb->>'id'),'') = ''
         or coalesce(br.payload_text::jsonb->>'revision','') !~ '^[1-9][0-9]*$'
         or (
           br.row_type = 'entity'
           and coalesce(trim(br.payload_text::jsonb->>'entity_type'),'') = ''
         )
       )
  ) then
    raise exception 'financial_bootstrap_existing_entity_head_baseline_invalid'
      using errcode = '55000';
  end if;
end;
$$;

-- Repair existing finalized ledgers. This specifically repairs zero-valued heads
-- created by a failed first CAS attempt, while preserving any head that already
-- represents an accepted cloud mutation.
insert into public.financial_entity_heads_v2 (
  ledger_id,
  restore_epoch,
  entity_type,
  entity_id,
  current_revision,
  last_mutation_id,
  last_command_id,
  updated_at
)
select
  br.ledger_id,
  br.restore_epoch,
  case
    when br.row_type = 'financial_transaction' then 'financial_transaction'
    else br.payload_text::jsonb->>'entity_type'
  end,
  br.payload_text::jsonb->>'id',
  (br.payload_text::jsonb->>'revision')::bigint,
  null,
  null,
  now()
from public.financial_ledgers_v2 l
join public.financial_bootstrap_rows_v2 br
  on br.ledger_id = l.ledger_id
 and br.restore_epoch = l.restore_epoch
 and br.bootstrap_id = l.bootstrap_id
where l.bootstrapped_at is not null
  and l.bootstrap_id is not null
  and br.row_type in ('entity','financial_transaction')
on conflict (ledger_id, restore_epoch, entity_type, entity_id) do update
  set current_revision = excluded.current_revision,
      updated_at = now()
where public.financial_entity_heads_v2.last_mutation_id is null
  and public.financial_entity_heads_v2.last_command_id is null
  and public.financial_entity_heads_v2.current_revision < excluded.current_revision;

-- Migration-level postcondition: every mutable row in every finalized bootstrap
-- must have a cloud CAS head at least as new as the bootstrap baseline.
do $$
begin
  if exists (
    with baseline as (
      select
        br.ledger_id,
        br.restore_epoch,
        case
          when br.row_type = 'financial_transaction' then 'financial_transaction'
          else br.payload_text::jsonb->>'entity_type'
        end as entity_type,
        br.payload_text::jsonb->>'id' as entity_id,
        (br.payload_text::jsonb->>'revision')::bigint as baseline_revision
      from public.financial_ledgers_v2 l
      join public.financial_bootstrap_rows_v2 br
        on br.ledger_id = l.ledger_id
       and br.restore_epoch = l.restore_epoch
       and br.bootstrap_id = l.bootstrap_id
      where l.bootstrapped_at is not null
        and l.bootstrap_id is not null
        and br.row_type in ('entity','financial_transaction')
    )
    select 1
      from baseline b
      left join public.financial_entity_heads_v2 h
        on h.ledger_id = b.ledger_id
       and h.restore_epoch = b.restore_epoch
       and h.entity_type = b.entity_type
       and h.entity_id = b.entity_id
     where h.current_revision is null
        or h.current_revision < b.baseline_revision
  ) then
    raise exception 'financial_bootstrap_entity_head_baseline_verification_failed'
      using errcode = '55000';
  end if;
end;
$$;
