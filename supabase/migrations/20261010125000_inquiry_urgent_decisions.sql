-- Exact source delivery for new inquiry decisions. No existing delivery read
-- changes; callers are behind the off-by-default inquiry/Needs you gates.
set local lock_timeout = '3s';
create function public.read_owner_decision_source_for_delivery(p_workspace_id uuid,p_lifecycle text,p_source_id text) returns jsonb
language sql stable security definer set search_path = public,pg_temp as $$
  select public.owner_decision_json(d) || jsonb_build_object(
    'businessName',w.name,
    'timezone',coalesce((select f.value->>'timezone' from public.business_record_facts f where f.workspace_id=d.workspace_id and f.fact_key='hours'),'America/New_York'),
    'recipient',public.resolve_business_owner_recipient(d.workspace_id))
  from public.owner_decisions d join public.workspaces w on w.id=d.workspace_id
  where d.workspace_id=p_workspace_id and d.source_lifecycle=p_lifecycle and d.source_id=p_source_id
    and d.state='open' and d.route='owner_decides' and d.urgent
  order by d.opened_at desc,d.id desc limit 1
$$;
revoke all on function public.read_owner_decision_source_for_delivery(uuid,text,text) from public,anon,authenticated;
grant execute on function public.read_owner_decision_source_for_delivery(uuid,text,text) to service_role;
