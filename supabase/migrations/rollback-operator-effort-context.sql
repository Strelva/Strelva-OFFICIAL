-- Disable the operator release first. Keep attribution receipts for history.
set lock_timeout = '3s';
drop function if exists public.record_operator_queue_effort(uuid,text,uuid,uuid,integer,text,date,text,jsonb);
create or replace function public.business_effort_row(p_entry_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', e.id, 'businessId', e.business_workspace_id, 'minutes', e.minutes,
    'category', e.category, 'occurredOn', e.occurred_on, 'note', e.note,
    'recordedBy', e.recorded_by, 'recordedAt', e.recorded_at,
    'void', case when v.entry_id is null then null else jsonb_build_object(
      'reason', v.reason, 'voidedBy', v.voided_by, 'voidedAt', v.voided_at) end)
  from public.business_effort_entries e
  left join public.business_effort_voids v on v.entry_id = e.id
  where e.id = p_entry_id;
$$;
