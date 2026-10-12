-- Append queue kind and System attribution beside the existing minute ledger.
-- No rewrite of the effort entries; manual entries and old callers stay valid.
set lock_timeout = '3s';
create table public.operator_queue_effort_context (
  entry_id uuid primary key references public.business_effort_entries(id) on delete cascade,
  kind text not null check (kind in ('draft_review','site_draft','maintenance_digest','change_request','owner_pending','ops_alert','domain_alert','domain_unverified','site_health','service_request','operational_exception','assignment_offer','lead_unkept','prospect_lead','readback_failed')),
  source_ref text not null check (char_length(source_ref) between 1 and 500),
  system_id uuid references public.systems(id) on delete set null,
  system_label text check (char_length(system_label) between 1 and 300)
);
alter table public.operator_queue_effort_context enable row level security;
revoke all on public.operator_queue_effort_context from public, anon, authenticated, service_role;
create trigger operator_queue_effort_context_append_only before update or delete on public.operator_queue_effort_context
  for each row execute function public.business_effort_append_only();

create function public.record_operator_queue_effort(
  p_user_id uuid, p_verified_email text, p_entry_id uuid, p_business_id uuid,
  p_minutes integer, p_category text, p_occurred_on date, p_note text, p_queue jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare entry jsonb; existing public.operator_queue_effort_context%rowtype;
begin
  perform public.business_effort_assert_operator(p_user_id, p_verified_email);
  if p_queue is null or p_queue->>'kind' is null or p_queue->>'sourceRef' is null then raise exception 'business_effort_invalid'; end if;
  if p_queue->>'systemId' is not null then
    perform 1 from public.systems where id = (p_queue->>'systemId')::uuid and business_workspace_id = p_business_id for key share;
    if not found then raise exception 'business_effort_invalid'; end if;
  end if;
  entry := public.record_business_effort(p_user_id,p_verified_email,p_entry_id,p_business_id,p_minutes,p_category,p_occurred_on,p_note);
  select * into existing from public.operator_queue_effort_context where entry_id = p_entry_id;
  if found then
    if existing.kind <> p_queue->>'kind' or existing.source_ref <> p_queue->>'sourceRef'
      or existing.system_id is distinct from (p_queue->>'systemId')::uuid
      or existing.system_label is distinct from p_queue->>'systemLabel' then raise exception 'business_effort_conflict'; end if;
  else
    insert into public.operator_queue_effort_context(entry_id,kind,source_ref,system_id,system_label)
      values (p_entry_id,p_queue->>'kind',p_queue->>'sourceRef',(p_queue->>'systemId')::uuid,p_queue->>'systemLabel');
  end if;
  return public.business_effort_row(p_entry_id);
end;
$$;

create or replace function public.business_effort_row(p_entry_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', e.id, 'businessId', e.business_workspace_id, 'minutes', e.minutes,
    'category', e.category, 'occurredOn', e.occurred_on, 'note', e.note,
    'recordedBy', e.recorded_by, 'recordedAt', e.recorded_at,
    'void', case when v.entry_id is null then null else jsonb_build_object(
      'reason', v.reason, 'voidedBy', v.voided_by, 'voidedAt', v.voided_at) end)
    || case when q.entry_id is null then '{}'::jsonb else jsonb_build_object('queue', jsonb_build_object(
      'kind',q.kind,'sourceRef',q.source_ref,'systemId',q.system_id,'systemLabel',q.system_label)) end
  from public.business_effort_entries e
  left join public.business_effort_voids v on v.entry_id = e.id
  left join public.operator_queue_effort_context q on q.entry_id = e.id
  where e.id = p_entry_id;
$$;
revoke all on function public.record_operator_queue_effort(uuid,text,uuid,uuid,integer,text,date,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_operator_queue_effort(uuid,text,uuid,uuid,integer,text,date,text,jsonb) to service_role;
