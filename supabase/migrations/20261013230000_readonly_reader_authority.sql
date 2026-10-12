-- Database readers use snapshot authorization. Mutations keep their original
-- locking helpers and recheck authority while holding the write locks.
-- All new helpers are private to SECURITY DEFINER readers. No grant is widened.
-- Additive forward repair; previous checksum-pinned migrations stay unchanged.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
CREATE OR REPLACE FUNCTION public.provider_seat_read_role(p_workspace_id uuid, p_user_id uuid, p_lock boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_lock is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
  if p_workspace_id is null or p_user_id is null then return null; end if;
    perform 1 from public.provider_seats s
      join public.workspaces c on c.id = s.customer_workspace_id and c.kind = 'customer'
      join public.workspaces a on a.id = s.agency_workspace_id and a.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = s.agency_workspace_id and am.user_id = p_user_id
      join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
        and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
      where s.customer_workspace_id = p_workspace_id and s.status = 'active';

  if not found then return null; end if;
  return public.provider_seat_direct_role();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.business_record_read_actor(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor_role text;
begin
  if p_write is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then
    raise exception 'business_record_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'business_record_access_denied'; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and w.kind = 'customer';
  if actor_role is null then
    actor_role := public.provider_seat_read_role(p_workspace_id, p_user_id, false);
  end if;
  if actor_role is null and exists (
    select 1
      from public.operational_assignments a
      join public.offering_provider_deliveries d
        on d.assignment_id = a.id and d.business_workspace_id = a.workspace_id
      join public.workspaces agency on agency.id = a.assignee_workspace_id and agency.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = agency.id and am.user_id = p_user_id
      join public.workspaces customer on customer.id = a.workspace_id and customer.kind = 'customer'
      where a.workspace_id = p_workspace_id
        and a.assignee_kind = 'agency'
        and a.assignee_user_id = p_user_id
        and a.status = 'accepted' and a.expires_at > clock_timestamp()
        and d.status = 'accepted' and d.expires_at > clock_timestamp()
  ) then
    actor_role := 'agency';
  end if;
  if actor_role is null then
    raise exception 'business_record_access_denied';
  end if;
  return actor_role;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.system_read_scope(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean, OUT access text, OUT work_ids uuid[])
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_write is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
  if exists(select 1 from public.workspaces where id=p_workspace_id and kind='agency') then
    access:=public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email);
    if access is not null then
      work_ids:=null; return;
    end if;
  end if;
  if exists(select 1 from public.workspace_memberships wm join public.workspaces w on w.id=wm.workspace_id and w.kind='customer'
    where wm.workspace_id=p_workspace_id and wm.user_id=p_user_id)
    -- Batch 7A: a provider seat reads its client's Systems as a member does.
    or public.provider_seat_read_role(p_workspace_id,p_user_id,false) is not null then
    access:=public.business_record_read_actor(p_workspace_id,p_user_id,p_verified_email,false);
  else access:='agency'; end if;
  if access<>'agency' then work_ids:=null; return; end if;
  work_ids:=public.business_record_agency_work_ids(p_workspace_id,p_user_id,p_verified_email,p_write);
  if cardinality(work_ids)=0 then raise exception 'business_record_access_denied'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.system_read_load(p_workspace_id uuid, p_system_id uuid, p_lock boolean, p_work_ids uuid[])
 RETURNS systems
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s public.systems;
begin
  if p_lock is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
    select * into s from public.systems where id = p_system_id and business_workspace_id = p_workspace_id;

  if not found or not public.system_in_scope(p_workspace_id, s.origin_kind, s.origin_ref, p_work_ids) then
    raise exception 'system_not_found';
  end if;
  return s;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.system_version_read_access(v system_versions, p_user_id uuid, p_verified_email text, p_write boolean, OUT access text, OUT actor_role text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare scope record; mine uuid[];
begin
  if p_write is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
  begin
    scope := public.system_read_scope(v.business_workspace_id, p_user_id, p_verified_email, p_write);
    perform public.system_read_load(v.business_workspace_id, v.version_system_id, p_write, scope.work_ids);
    access := 'full';
    actor_role := scope.access;
    return;
  exception when others then
    if sqlerrm not in ('business_record_access_denied', 'system_not_found') then raise; end if;
  end;
  mine := public.system_version_actor_workspaces(p_user_id, p_verified_email);
  select g.scope into access from public.system_version_grants g
    where g.version_id = v.id and g.revoked_at is null and g.grantee_workspace_id = any(mine)
    order by case g.scope when 'lineage_and_data' then 0 else 1 end limit 1;
  actor_role := null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operator_queue_read_operator(p_user_id uuid, p_verified_email text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'operator_queue_access_denied'; end if;
  perform 1 from public.super_admins where user_id = p_user_id and revoked_at is null;
  if not found then raise exception 'operator_queue_access_denied'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.business_effort_read_operator(p_user_id uuid, p_verified_email text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'business_effort_access_denied'; end if;
  perform 1 from public.super_admins where user_id = p_user_id and revoked_at is null;
  if not found then raise exception 'business_effort_access_denied'; end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.make_real_read_actor(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor_role text;
begin
  if p_write is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then
    raise exception 'make_real_activation_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'make_real_activation_access_denied'; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id and w.kind = 'customer'
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id;
  if actor_role is null then
    raise exception 'make_real_activation_access_denied';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.website_document_read_actor(p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_manage boolean, p_write boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_write is distinct from false then raise exception 'readonly_authority_write_refused'; end if;
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;

  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and (not p_manage or role in ('owner','admin'));
  if not found then raise exception 'workspace_access_denied'; end if;
  if p_work_id is not null and not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website') then raise exception 'workspace_access_denied'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.inquiry_read_member(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_role text;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null
    or not exists (select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null) then
    raise exception 'inquiry_access_denied';
  end if;
  select m.role into v_role from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and w.kind = 'customer';
  if v_role is null then raise exception 'inquiry_access_denied'; end if;
  return v_role;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inquiry_booking_read_witness(p_tenant_id text, p_inquiry_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare l public.tenant_leads; c jsonb; st jsonb; cap jsonb; b public.offering_website_bindings; cs public.connected_sites;
begin
  if p_tenant_id is null then
    select * into l from public.tenant_leads where id=p_inquiry_id::uuid and tenant_stable_id is null and connected_site_id is not null;
  else
    select * into l from public.tenant_leads where tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id and active) and lead_id=p_inquiry_id;
  end if;
  if not found or l.workspace_id is null or l.intake_state not in ('kept','released') or not coalesce(public.business_record_email_valid(l.email),false)
    then raise exception 'inquiry_booking_unavailable'; end if;
  if public.workspace_exit_completed(l.workspace_id) then raise exception 'inquiry_booking_unavailable'; end if;
  if l.tenant_stable_id is not null then
  perform 1 from public.tenant_workspace_links where tenant_stable_id=l.tenant_stable_id and workspace_id=l.workspace_id;
  if not found then raise exception 'inquiry_booking_unavailable'; end if;
  select * into b from public.offering_website_bindings where tenant_stable_id=l.tenant_stable_id
    and business_workspace_id=l.workspace_id and status='active';
  if not found then raise exception 'inquiry_booking_unavailable'; end if;
  else
    select * into cs from public.connected_sites where id=l.connected_site_id and business_workspace_id=l.workspace_id and status='active' and verified_at is not null;
    if not found then raise exception 'inquiry_booking_unavailable'; end if;
  end if;
  select state into st from public.inquiry_workspaces where tenant_stable_id=l.tenant_stable_id;
  if l.capability_id is not null then
    select item into cap from jsonb_array_elements(coalesce(st->'capabilities','[]'::jsonb)) item where item->>'id'=l.capability_id;
    if cap is null or cap->>'status' not in ('live','live_unverified') or cap->'live'->>'version' is distinct from l.capability_version::text then
      raise exception 'inquiry_booking_unavailable'; end if;
  elsif exists(select 1 from jsonb_array_elements(coalesce(st->'capabilities','[]'::jsonb)) item where item->>'status'='paused') then
    raise exception 'inquiry_booking_unavailable';
  end if;
  if exists(select 1 from public.inquiry_record_overlays where tenant_stable_id=l.tenant_stable_id and inquiry_id=l.lead_id and status in ('handled','blocked')) then raise exception 'inquiry_booking_unavailable'; end if;
  perform 1 from public.systems where business_workspace_id=l.workspace_id and kind in ('booking','inquiry');
  if exists(select 1 from public.systems where business_workspace_id=l.workspace_id and kind='inquiry' and lifecycle='paused') then raise exception 'inquiry_booking_unavailable'; end if;
  perform 1 from public.booking_settings where calendar_key=coalesce(l.tenant_stable_id,l.workspace_id);
  perform 1 from public.business_services where workspace_id=l.workspace_id;
  perform 1 from public.business_record_facts where workspace_id=l.workspace_id and fact_key='hours';
  c:=case when l.tenant_stable_id is null then public.read_inquiry_workspace_booking_context(l.workspace_id) else public.read_tenant_booking_context(p_tenant_id) end;
  if c->>'workspaceId' is distinct from l.workspace_id::text or c->>'systemId' is null or not exists(select 1 from public.systems where id=(c->>'systemId')::uuid and lifecycle='live') or c->>'paused'='true' or c#>>'{settings,mode}' is distinct from 'request' then
    raise exception 'inquiry_booking_unavailable'; end if;
  return jsonb_build_object('bookingRevision',(select jsonb_build_object('revisionId',current_revision_id,'changeNumber',change_number) from public.systems where id=(c->>'systemId')::uuid),'context',c,'leadRowId',l.id,'lead',jsonb_build_object('id',l.lead_id,'name',l.name,'email',l.email,
    'fields',l.fields,'capabilityId',l.capability_id,'capabilityVersion',l.capability_version),'bindingId',coalesce(b.id,cs.id),'bindingRevision',case when b.id is not null then to_jsonb(b.revision) else to_jsonb(cs.updated_at) end);
end $function$
;

revoke all on function public.provider_seat_read_role(uuid,uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.business_record_read_actor(uuid,uuid,text,boolean) from public, anon, authenticated, service_role;
revoke all on function public.system_read_scope(uuid,uuid,text,boolean) from public, anon, authenticated, service_role;
revoke all on function public.system_read_load(uuid,uuid,boolean,uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.system_version_read_access(system_versions,uuid,text,boolean) from public, anon, authenticated, service_role;
revoke all on function public.operator_queue_read_operator(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.business_effort_read_operator(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.make_real_read_actor(uuid,uuid,text,boolean) from public, anon, authenticated, service_role;
revoke all on function public.website_document_read_actor(uuid,uuid,uuid,text,boolean,boolean) from public, anon, authenticated, service_role;
revoke all on function public.inquiry_read_member(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.inquiry_booking_read_witness(text,text) from public, anon, authenticated, service_role;

do $repair$
declare target record; definition text;
begin
  for target in select * from (values
    ('public.read_operator_queue_context(uuid,text)', 'public.operator_queue_assert_operator(', 'public.operator_queue_read_operator('),
    ('public.read_operator_queue_context_v2(uuid,text)', 'public.operator_queue_assert_operator(', 'public.operator_queue_read_operator('),
    ('public.read_outside_write_receipts(uuid,text,text,uuid,integer)', 'public.operator_queue_assert_operator(', 'public.operator_queue_read_operator('),
    ('public.read_google_listing_readback_failures(uuid,text,integer)', 'public.operator_queue_assert_operator(', 'public.operator_queue_read_operator('),
    ('public.read_google_listing_readback_failures_v2(uuid,text)', 'public.operator_queue_assert_operator(', 'public.operator_queue_read_operator('),
    ('public.read_operator_google_uncertainty(uuid,text)', 'public.operator_queue_assert_operator(', 'public.operator_queue_read_operator('),
    ('public.read_business_effort(uuid,text,date,uuid)', 'public.business_effort_assert_operator(', 'public.business_effort_read_operator('),
    ('public.read_effort_businesses(uuid,text)', 'public.business_effort_assert_operator(', 'public.business_effort_read_operator('),
    ('public.read_make_real_activation(uuid,uuid,text,text)', 'public.make_real_activation_actor(', 'public.make_real_read_actor('),
    ('public.read_business_record(uuid,uuid,text)', 'public.business_record_assert_actor(', 'public.business_record_read_actor('),
    ('public.read_business_systems(uuid,uuid,text)', 'public.system_actor_scope(', 'public.system_read_scope('),
    ('public.read_business_versions_sibling_core(uuid,uuid,text)', 'public.system_actor_scope(', 'public.system_read_scope('),
    ('public.agency_overview_client(uuid,uuid,text,uuid,boolean)', 'public.system_actor_scope(', 'public.system_read_scope('),
    ('public.agency_overview_queue(uuid,uuid,text,uuid)', 'public.system_actor_scope(', 'public.system_read_scope('),
    ('public.agency_client_overview(uuid,uuid,text,uuid,integer)', 'public.system_actor_scope(', 'public.system_read_scope('),
    ('public.agency_client_overview_v2(uuid,uuid,text,uuid,integer)', 'public.system_actor_scope(', 'public.system_read_scope('),
    ('public.read_provider_booking_evidence(uuid,uuid,text,date,text)', 'public.system_actor_scope(', 'public.system_read_scope('),
    ('public.read_version_binding_choices(uuid,uuid,text)', 'public.system_actor_scope(', 'public.system_read_scope('),
    ('public.read_version_native_runtime(uuid,uuid,text,uuid)', 'public.system_version_access(', 'public.system_version_read_access('),
    ('public.read_website_current_tenant(uuid,uuid,uuid,text)', 'public.website_document_assert_actor(', 'public.website_document_read_actor('),
    ('public.read_website_linked_publications(uuid,uuid,uuid,text)', 'public.website_document_assert_actor(', 'public.website_document_read_actor('),
    ('public.read_website_domain_approvals(uuid,uuid,uuid,text)', 'public.website_document_assert_actor(', 'public.website_document_read_actor('),
    ('public.business_inquiry_outcomes(uuid,uuid,text,timestamp with time zone,timestamp with time zone)', 'public.inquiry_assert_member(', 'public.inquiry_read_member('),
    ('public.read_workspace_leads(uuid,uuid,text,text[],integer,timestamp with time zone)', 'public.inquiry_assert_member(', 'public.inquiry_read_member('),
    ('public.read_workspace_inquiry_inbox_page(uuid,uuid,text,text[],integer,timestamp with time zone,uuid)', 'public.inquiry_assert_member(', 'public.inquiry_read_member('),
    ('public.read_workspace_inquiry_reply_receipts(uuid,uuid,text)', 'public.inquiry_assert_member(', 'public.inquiry_read_member('),
    ('public.workspace_inquiry_reply_permission(uuid,uuid,text,uuid)', 'public.inquiry_assert_member(', 'public.inquiry_read_member('),
    ('public.read_inquiry_booking_offer(uuid)', 'public.inquiry_booking_witness(', 'public.inquiry_booking_read_witness(')
  ) changes(signature, old_call, new_call) loop
    definition := pg_get_functiondef(target.signature::regprocedure);
    if position(target.old_call in definition) = 0 then
      if position(target.new_call in definition) = 0 then
        raise exception 'reader_authority_call_not_found: %', target.signature;
      end if;
      continue; -- Safe retry of the already-applied migration.
    end if;
    execute replace(definition, target.old_call, target.new_call);
  end loop;
end $repair$;
notify pgrst, 'reload schema';
commit;
