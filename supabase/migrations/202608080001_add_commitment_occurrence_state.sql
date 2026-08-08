alter table if exists public.commitments
  add column if not exists deferred_until_on date,
  add column if not exists deferred_cycle_month text,
  add column if not exists archived_from_active boolean;

alter table if exists public.goals
  add column if not exists archived_from_active boolean;

create index if not exists commitments_workspace_cycle_idx
  on public.commitments(workspace_id, last_paid_month, deferred_cycle_month);
