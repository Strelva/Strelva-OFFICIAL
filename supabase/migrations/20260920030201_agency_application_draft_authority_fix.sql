-- Correct the agency rehearsal fallback alias after 30200 was applied.
-- The PL/pgSQL variable `state` must not share a name with the SQL table alias.
create or replace function public.rehearse_application_candidate(
  p_work_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_expected_design_revision integer
) returns setof public.application_states
language plpgsql security definer set search_path=public,pg_temp as $$
declare state public.application_states%rowtype; record_row public.application_records%rowtype; checks jsonb; records_fit boolean:=true; delegated boolean:=false; draft_granted boolean:=false;
begin
  perform public.application_lock_work(p_workspace_id,p_work_id);
  select exists(
    select 1 from public.agency_application_draft_grants item
    join lateral public.agency_application_draft_target(item.delivery_id, item.application_work_id) target on true
    join public.workspace_memberships agency_member on agency_member.workspace_id=target.agency_workspace_id and agency_member.user_id=p_user_id
    where item.application_work_id=p_work_id and target.business_workspace_id=p_workspace_id
      and item.operator_user_id=p_user_id and item.status='active'
      and item.expires_at>clock_timestamp() and item.expires_at<=target.expires_at
  ) into draft_granted;
  delegated := draft_granted;
  if not delegated then
    select exists(
      select 1 from public.operational_assignments assignment
      join public.saved_product_work responsibility on responsibility.id=assignment.work_id
      join public.offering_provider_deliveries delivery on delivery.assignment_id=assignment.id
      join public.offering_installations installation on installation.id=delivery.installation_id and installation.business_workspace_id=delivery.business_workspace_id
      join public.application_states app_state on app_state.work_id=p_work_id and app_state.workspace_id=p_workspace_id
      where assignment.workspace_id=p_workspace_id and assignment.assignee_user_id=p_user_id and assignment.assignee_email=lower(p_verified_email)
        and assignment.status='accepted' and assignment.expires_at>clock_timestamp() and delivery.status='accepted'
        and delivery.business_workspace_id=p_workspace_id and installation.status='active'
        and installation.responsibility->>'kind'='provider_requested'
        and installation.responsibility->>'providerKind'='agency'
        and jsonb_array_length(installation.native_resources)=1
        and installation.native_resources->0->>'kind'='application'
        and installation.native_resources->0->>'id'=p_work_id::text
        and cardinality(delivery.scope)=cardinality(installation.accepted_scope)
        and delivery.scope <@ installation.accepted_scope
        and installation.accepted_scope <@ delivery.scope
        and responsibility.payload->>'ownerId'=assignment.sponsor_id::text
        and responsibility.payload->>'approvedBy'=assignment.sponsor_id::text
        and jsonb_typeof(responsibility.payload->'approvedAt')='string'
        and exists(select 1 from public.workspace_memberships sponsor_member where sponsor_member.workspace_id=p_workspace_id and sponsor_member.user_id=assignment.sponsor_id and sponsor_member.role='owner')
        and exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step where step->>'workId'=p_work_id::text and step->>'operation'='application.command' and step->'input'->>'kind'='rehearse')
        and app_state.lifecycle_status in ('installed','draft') and app_state.current_release_version is not null
        and ((assignment.assignee_kind='strelva' and assignment.assignee_workspace_id is null and exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null) and exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id))
          or (assignment.assignee_kind='agency' and assignment.assignee_workspace_id=(installation.responsibility->>'agencyWorkspaceId')::uuid and exists(select 1 from public.workspaces where id=assignment.assignee_workspace_id and kind='agency') and exists(select 1 from public.workspace_memberships where workspace_id=assignment.assignee_workspace_id and user_id=p_user_id)))
    ) into delegated;
  end if;
  if not delegated then perform public.application_assert_identity(p_workspace_id,p_work_id,p_user_id,p_verified_email,true); end if;
  if draft_granted then
    perform public.agency_application_draft_edit_assert(p_work_id,p_workspace_id,p_user_id,p_verified_email);
  elsif delegated then
    if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null) then raise exception 'application_access_denied'; end if;
  end if;
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id=p_work_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if state.candidate_design_revision<>p_expected_design_revision then raise exception 'application_design_revision_conflict'; end if;
  for record_row in select * from public.application_records where work_id=p_work_id loop
    begin perform public.validate_application_record(state.candidate_spec,record_row.record_id,record_row.values); exception when others then records_fit:=false; end;
  end loop;
  checks:=jsonb_build_array(jsonb_build_object('name','Declared fields and approved components','passed',true),jsonb_build_object('name','Executable code rejected','passed',true),jsonb_build_object('name','Existing records fit this version','passed',records_fit));
  update public.application_states set candidate_rehearsal=jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks),updated_at=clock_timestamp() where work_id=p_work_id;
  perform public.application_touch_compatibility(p_work_id,p_user_id,'rehearse_candidate',jsonb_build_object('rehearsal',jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks),'candidate',jsonb_build_object('designRevision',state.candidate_design_revision,'specVersion',state.candidate_spec_version,'spec',state.candidate_spec,'rehearsal',jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks))));
  return query select * from public.application_states where work_id=p_work_id;
end;
$$;

revoke all on function public.rehearse_application_candidate(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.rehearse_application_candidate(uuid,uuid,uuid,text,integer) to service_role;
