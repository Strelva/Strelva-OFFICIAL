-- Handoff completion is evidence recording only, after the owner's exit choice.
-- No provider is called and no billing or DNS state is changed.
begin;
set local lock_timeout = '3s';
create table public.workspace_exit_handoff_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tenant_stable_id uuid not null,
  kind text not null check (kind in ('export','files','billing','domain')),
  evidence text not null check (char_length(btrim(evidence)) between 1 and 1000),
  export_build_id uuid references public.workspace_export_builds(id) on delete restrict,
  completed_by uuid not null references public.users(id) on delete restrict,
  completed_at timestamptz not null default clock_timestamp(),
  primary key(workspace_id,tenant_stable_id,kind),
  check ((kind = 'export') = (export_build_id is not null))
);
alter table public.workspace_exit_handoff_receipts enable row level security;
revoke all on public.workspace_exit_handoff_receipts from public,anon,authenticated,service_role;
alter function public.read_workspace_exit_handoff_plan(uuid,uuid,text) rename to read_workspace_exit_handoff_plan_before_evidence;
revoke all on function public.read_workspace_exit_handoff_plan_before_evidence(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.read_workspace_exit_handoff_plan(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_plan jsonb; v_sites jsonb;
begin
  perform public.workspace_export_v3_role(p_workspace_id,p_user_id,p_verified_email);
  select state->'handoff' into v_plan from public.workspace_exit_requests where workspace_id=p_workspace_id;
  if v_plan is null then
    v_plan := public.read_workspace_exit_handoff_plan_before_evidence(p_workspace_id,p_user_id,p_verified_email);
  end if;
  select coalesce(jsonb_agg(site || jsonb_build_object('steps', (
    select coalesce(jsonb_agg(step || case when r.kind is null then '{}'::jsonb else jsonb_build_object(
      'status','completed','evidence',r.evidence,'completedAt',r.completed_at,'completedBy',r.completed_by) end order by step_no),'[]'::jsonb)
    from jsonb_array_elements(site->'steps') with ordinality s(step,step_no)
    left join public.workspace_exit_handoff_receipts r on r.workspace_id=p_workspace_id
      and r.tenant_stable_id=(site->>'tenantStableId')::uuid and r.kind=step->>'kind'
  )) order by site_no),'[]'::jsonb) into v_sites
  from jsonb_array_elements(v_plan->'sites') with ordinality s(site,site_no);
  return jsonb_set(v_plan,'{sites}',v_sites);
end $$;
create function public.record_workspace_exit_handoff(
  p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_stable_id uuid,p_kind text,
  p_evidence text,p_export_build_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state jsonb; v_old public.workspace_exit_handoff_receipts%rowtype;
begin
  if public.workspace_export_v3_role(p_workspace_id,p_user_id,p_verified_email)<>'operator' then
    raise exception 'workspace_exit_denied';
  end if;
  select state into v_state from public.workspace_exit_requests where workspace_id=p_workspace_id for update;
  if v_state is null or not exists(select 1 from jsonb_array_elements(v_state#>'{handoff,sites}') site
      where site->>'tenantStableId'=p_tenant_stable_id::text) then
    raise exception 'workspace_exit_conflict: owner exit and recorded site required';
  end if;
  if p_kind is null or p_kind not in ('export','files','billing','domain') or p_evidence is null
      or char_length(btrim(p_evidence)) not between 1 and 1000
      or ((p_kind='export') <> (p_export_build_id is not null)) then
    raise exception 'workspace_exit_command_invalid';
  end if;
  if p_kind='export' and not exists(select 1 from public.workspace_export_builds
      where id=p_export_build_id and workspace_id=p_workspace_id and status='ready') then
    raise exception 'workspace_exit_conflict: complete business export required';
  end if;
  select * into v_old from public.workspace_exit_handoff_receipts where workspace_id=p_workspace_id
    and tenant_stable_id=p_tenant_stable_id and kind=p_kind;
  if found then
    if v_old.evidence<>btrim(p_evidence) or v_old.export_build_id is distinct from p_export_build_id then
      raise exception 'workspace_exit_conflict: evidence already recorded';
    end if;
  else
    insert into public.workspace_exit_handoff_receipts(workspace_id,tenant_stable_id,kind,evidence,export_build_id,completed_by)
      values(p_workspace_id,p_tenant_stable_id,p_kind,btrim(p_evidence),p_export_build_id,p_user_id);
  end if;
  return public.read_workspace_exit_handoff_plan(p_workspace_id,p_user_id,p_verified_email);
end $$;
revoke all on function public.read_workspace_exit_handoff_plan(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.record_workspace_exit_handoff(uuid,uuid,text,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.read_workspace_exit_handoff_plan(uuid,uuid,text) to service_role;
grant execute on function public.record_workspace_exit_handoff(uuid,uuid,text,uuid,text,text,uuid) to service_role;
commit;
