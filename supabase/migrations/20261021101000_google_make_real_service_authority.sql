-- Recheck the logged service run and the owner's exact Google plan instruction.
-- This grants no membership and accepts no owner-email substitute for a session.
create function public.check_google_make_real_service_authority(
 p_workspace_id uuid,p_session_id uuid,p_decision_id uuid,p_request jsonb,
 p_mode text default 'inspect',p_possibility_id text default null,p_activation_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.strelva_service_actions%rowtype; d public.owner_decisions%rowtype;
 p public.system_possibilities%rowtype; actor_email text; recipient jsonb; binding uuid;
begin
 if p_mode is null or p_mode not in ('inspect','approve','undo') or jsonb_typeof(p_request) is distinct from 'object'
 or p_request->>'draftDigest' is null or p_request->>'draftDigest' !~ '^[a-f0-9]{64}$' then raise exception 'google_service_denied'; end if;
 select * into s from public.strelva_service_actions where id=p_session_id and workspace_id=p_workspace_id;
 if not found or s.purpose not in ('make_real_link','make_real_resume') or not public.platform_service_session_holds(s) then raise exception 'google_service_denied'; end if;
 select * into d from public.owner_decisions where id=p_decision_id and workspace_id=p_workspace_id;
 if not found or d.state<>'approved' or d.source_lifecycle<>'make_real' or d.route<>'owner_decides' then raise exception 'google_service_denied'; end if;
 if d.decided_by_kind='owner_link' then
  recipient:=public.resolve_business_owner_recipient(p_workspace_id);
  if lower(btrim(d.decided_by)) is distinct from lower(btrim(recipient->>'email')) or recipient->>'email' is null then raise exception 'google_service_denied'; end if;
 elsif d.decided_by_kind='owner_session' then
  if not exists(select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id and u.verified_at is not null where m.workspace_id=p_workspace_id and m.role='owner' and m.user_id::text=d.decided_by) then raise exception 'google_service_denied'; end if;
 else raise exception 'google_service_denied'; end if;
 select * into p from public.system_possibilities where business_workspace_id=p_workspace_id and id::text=split_part(d.source_id,'@',1);
 if not found or d.source_id<>p.id::text||'@'||p.candidate_revision::text or p.status='withdrawn'
 or (p_possibility_id is not null and p.id::text<>p_possibility_id)
 or not exists(select 1 from jsonb_array_elements(p.body->'effects') e where e->>'kind'='publish' and e->>'channel'='google_listing' and e->'request'=p_request) then raise exception 'google_service_denied'; end if;
 if s.purpose='make_real_link' then
  if p_mode='undo' or s.subject<>'owner_decision:'||d.id::text or d.decided_by_kind<>'owner_link'
  or not exists(select 1 from public.strelva_service_actions a where a.session_id=s.id and a.workspace_id=p_workspace_id and a.action='run' and a.subject='possibility:'||d.source_id) then raise exception 'google_service_denied'; end if;
 else
  if not exists(select 1 from public.saved_product_work w join public.strelva_service_actions a on a.subject='activation:'||(w.payload->>'id') and a.session_id=s.id and a.workspace_id=p_workspace_id
    where w.workspace_id=p_workspace_id and w.product_id='operations' and w.resource_kind='activation'
    and w.payload->>'possibilityId'=p.id::text
    and (p_activation_id is null or w.payload->>'id'=p_activation_id)
    and exists(select 1 from jsonb_array_elements(w.payload->'approvals') approval where approval->>'approvalId'=d.id::text)
    and (case when p_mode='undo' then a.action='rollback' else a.action in ('run','resume','reconcile','rollback') end)) then raise exception 'google_service_denied'; end if;
 end if;
 select b.id into binding from public.workspace_account_bindings b join public.workspace_google_locations l on l.binding_id=b.id and l.workspace_id=b.workspace_id
 where b.workspace_id=p_workspace_id and b.provider='google' and b.status='connected' and l.location_id=p_request->>'locationId'
 and ((b.origin_tenant_stable_id is null and p_request->>'tenantId'='workspace-'||p_workspace_id::text) or exists(select 1 from public.tenants t where t.stable_id=b.origin_tenant_stable_id and t.id=p_request->>'tenantId'));
 if binding is null or public.platform_provider_for_resource(p_workspace_id,s.provider_workspace_id,'google','google_location',p_request->>'locationId') is distinct from s.provider_workspace_id then raise exception 'google_service_denied'; end if;
 -- Resource admission may wait on a seat, verification or mandate writer.
 -- Re-read every unlocked premise after that wait, including the session clock.
 select * into s from public.strelva_service_actions where id=p_session_id and workspace_id=p_workspace_id;
 if not found or not public.platform_service_session_holds(s) then raise exception 'google_service_denied'; end if;
 select * into d from public.owner_decisions where id=p_decision_id and workspace_id=p_workspace_id;
 if not found or d.state<>'approved' or d.source_lifecycle<>'make_real' or d.route<>'owner_decides' then raise exception 'google_service_denied'; end if;
 if d.decided_by_kind='owner_link' then
  recipient:=public.resolve_business_owner_recipient(p_workspace_id);
  if recipient->>'email' is null or lower(btrim(d.decided_by)) is distinct from lower(btrim(recipient->>'email')) then raise exception 'google_service_denied'; end if;
 elsif d.decided_by_kind='owner_session' then
  if not exists(select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id and u.verified_at is not null where m.workspace_id=p_workspace_id and m.role='owner' and m.user_id::text=d.decided_by) then raise exception 'google_service_denied'; end if;
 else raise exception 'google_service_denied'; end if;
 select * into p from public.system_possibilities where business_workspace_id=p_workspace_id and id::text=split_part(d.source_id,'@',1);
 if not found or d.source_id<>p.id::text||'@'||p.candidate_revision::text or p.status='withdrawn'
 or (p_possibility_id is not null and p.id::text<>p_possibility_id)
 or not exists(select 1 from jsonb_array_elements(p.body->'effects') e where e->>'kind'='publish' and e->>'channel'='google_listing' and e->'request'=p_request) then raise exception 'google_service_denied'; end if;
 if not exists(select 1 from public.workspace_account_bindings b join public.workspace_google_locations l on l.binding_id=b.id and l.workspace_id=b.workspace_id
 where b.id=binding and b.workspace_id=p_workspace_id and b.status='connected' and l.location_id=p_request->>'locationId'
 and ((b.origin_tenant_stable_id is null and p_request->>'tenantId'='workspace-'||p_workspace_id::text) or exists(select 1 from public.tenants t where t.stable_id=b.origin_tenant_stable_id and t.id=p_request->>'tenantId'))) then raise exception 'google_service_denied'; end if;
 select lower(email) into actor_email from public.users where id=s.on_behalf_user_id and verified_at is not null;
 if actor_email is null then raise exception 'google_service_denied'; end if;
 return jsonb_build_object('userId',s.on_behalf_user_id,'verifiedEmail',actor_email,'bindingId',binding,'possibilityId',p.id);
end $$;
revoke all on function public.check_google_make_real_service_authority(uuid,uuid,uuid,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.check_google_make_real_service_authority(uuid,uuid,uuid,jsonb,text,text,text) to service_role;
