-- MYFI P19 FINAL — preserve causal command order in V2 mutation batches.
--
-- Root cause:
-- The device drains ledger_outbox_v3 in sequence_id order, which preserves the
-- causal revision chain for repeated changes to the same entity. The server RPC
-- regrouped the request by command_id and then sorted those random command IDs
-- lexicographically. That can process revision N+1 before revision N and return
-- base_revision_mismatch even though the client batch itself is valid.
--
-- Fix:
-- Preserve the order of first appearance of each command in p_mutations by using
-- jsonb_array_elements(... WITH ORDINALITY). Command atomicity and all existing
-- CAS/idempotency checks remain unchanged.

do $migration$
declare
  v_proc regprocedure :=
    'public.sync_financial_mutations_v2(text,bigint,jsonb,bigint,text,integer)'::regprocedure;
  v_def text;
  v_old text := E'  for v_command_id in\n'
    || E'    select distinct item.value->>''commandId''\n'
    || E'      from jsonb_array_elements(coalesce(p_mutations, ''[]''::jsonb)) as item(value)\n'
    || E'     order by 1\n'
    || E'  loop';
  v_new text := E'  for v_command_id in\n'
    || E'    select item.value->>''commandId''\n'
    || E'      from jsonb_array_elements(coalesce(p_mutations, ''[]''::jsonb))\n'
    || E'           with ordinality as item(value, ordinal)\n'
    || E'     group by item.value->>''commandId''\n'
    || E'     order by min(item.ordinal)\n'
    || E'  loop';
  v_occurrences integer;
begin
  select pg_get_functiondef(v_proc) into v_def;
  if v_def is null then
    raise exception 'financial_v2_sync_function_missing' using errcode = '55000';
  end if;

  v_occurrences :=
    (length(v_def) - length(replace(v_def, v_old, '')))
    / greatest(1, length(v_old));

  if v_occurrences <> 1 then
    raise exception 'financial_v2_causal_order_patch_anchor_mismatch:%', v_occurrences
      using errcode = '55000';
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end;
$migration$;

-- Postcondition: the deployed function must preserve request ordinality and the
-- legacy random command-id ordering must be absent.
do $verify$
declare
  v_def text;
  v_old text := E'  for v_command_id in\n'
    || E'    select distinct item.value->>''commandId''\n'
    || E'      from jsonb_array_elements(coalesce(p_mutations, ''[]''::jsonb)) as item(value)\n'
    || E'     order by 1\n'
    || E'  loop';
begin
  select pg_get_functiondef(
    'public.sync_financial_mutations_v2(text,bigint,jsonb,bigint,text,integer)'::regprocedure
  ) into v_def;

  if position('with ordinality as item(value, ordinal)' in lower(v_def)) = 0
     or position('order by min(item.ordinal)' in lower(v_def)) = 0
     or position(v_old in v_def) <> 0 then
    raise exception 'financial_v2_causal_order_verification_failed'
      using errcode = '55000';
  end if;
end;
$verify$;
