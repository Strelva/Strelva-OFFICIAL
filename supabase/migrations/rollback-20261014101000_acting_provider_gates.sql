-- Rollback for 20261014101000_acting_provider_gates.sql
-- Forward SHA-256: 304090f8ead2ce8e363f2c217b901607865c14d10c01cb42b1f9af10c300aad9
-- Agency 1.0 #255 / #534. Undo this file before 20261014100000; undo every later file first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Restores every replaced body exactly as it stood before; no rows are removed.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_document_assert_actor(uuid,uuid,uuid,text,boolean,boolean)')))) is distinct from '3bf2b3106cacd86a65e69f4b15fa4acd' then raise exception 'rollback_wrong_order_or_function_drift: website_document_assert_actor'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_document_launch_authority(uuid,uuid,uuid)')))) is distinct from 'dc084faebbe7477624866e8a2fc529c7' then raise exception 'rollback_wrong_order_or_function_drift: website_document_launch_authority'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.authorize_website_domain_change(uuid,uuid,uuid,text,text,text,text)')))) is distinct from 'f237abeb2d987924d73d991153c59e7d' then raise exception 'rollback_wrong_order_or_function_drift: authorize_website_domain_change'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_change_actor_role(uuid,uuid,text)')))) is distinct from '35ed49f4604ae09599f6934f5b65785d' then raise exception 'rollback_wrong_order_or_function_drift: website_change_actor_role'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_website_change_receipt(uuid,uuid,text,uuid,text,jsonb)')))) is distinct from '05230feeff1007977192b8dc0f2feb02' then raise exception 'rollback_wrong_order_or_function_drift: record_website_change_receipt'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_make_systems_authority(uuid,uuid)')))) is distinct from 'f2681da34962f5a55291894067bb0099' then raise exception 'rollback_wrong_order_or_function_drift: workspace_make_systems_authority'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_require_make_systems(uuid,uuid)')))) is distinct from 'ac7913eb1620c424bbfefea98e0d1b28' then raise exception 'rollback_wrong_order_or_function_drift: workspace_require_make_systems'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_runs_business(uuid)')))) is distinct from '62dc98239575fd472d3f1c00a9acf1e6' then raise exception 'rollback_wrong_order_or_function_drift: strelva_runs_business'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_decision_policy(uuid,uuid,text,text,uuid,text,text,text,bigint)')))) is distinct from '87e1020fdb5f6970cb9da73da068b595' then raise exception 'rollback_wrong_order_or_function_drift: set_decision_policy'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_decision_policies(uuid,uuid,text)')))) is distinct from '72aeb3a567a302f34d8dbe5c20f539c9' then raise exception 'rollback_wrong_order_or_function_drift: read_decision_policies'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)')))) is distinct from '36a5d0173fc75332c1453e9368d01dc5' then raise exception 'rollback_wrong_order_or_function_drift: claim_owner_decision'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.escalate_owner_decision(uuid,uuid,uuid,text,text)')))) is distinct from '8ca0584d82cd96c79306ac8500e65189' then raise exception 'rollback_wrong_order_or_function_drift: escalate_owner_decision'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_owner_decisions(uuid,uuid,text,boolean)')))) is distinct from 'f07ec423e038ab50b480cf4dd082dbc1' then raise exception 'rollback_wrong_order_or_function_drift: list_owner_decisions'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_strelva_handled(uuid,uuid,text,timestamp with time zone)')))) is distinct from 'a4b9ccfb182dd6eec996166b43dea14e' then raise exception 'rollback_wrong_order_or_function_drift: read_strelva_handled'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.prepare_website_domain_request(uuid,uuid,uuid,uuid,text,text,integer,text,text,jsonb,text)')))) is distinct from 'f7785734bc388e57251dad3aa759be9e' then raise exception 'rollback_wrong_order_or_function_drift: prepare_website_domain_request'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.claim_native_website_fact_review(uuid,uuid,text,text,bigint,uuid)')))) is distinct from '1af0ff38b2f9a2bccbaf7ae6ffd50c73' then raise exception 'rollback_wrong_order_or_function_drift: claim_native_website_fact_review'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_catalog_report_receipts(uuid,uuid,text,timestamp with time zone)')))) is distinct from '2b471d1604161f032f99a4ebe5c9dfd1' then raise exception 'rollback_wrong_order_or_function_drift: read_catalog_report_receipts'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_tenant_decision_route(text,uuid,text,text,text,text,text,text,text)')))) is distinct from '266d7cad806dfd9aa236231d0aa3195e' then raise exception 'rollback_wrong_order_or_function_drift: set_tenant_decision_route'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.needs_you_provider_id(uuid,uuid,text)')))) is distinct from 'c69acb838b997dea305de00fef7d9ec4' then raise exception 'rollback_wrong_order_or_function_drift: needs_you_provider_id'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_agency_google_listing_readback_failures(uuid,text,uuid,integer)')))) is distinct from 'd8b1f0bdb71c9b57fd773a66c733f230' then raise exception 'rollback_wrong_order_or_function_drift: read_agency_google_listing_readback_failures'; end if;
end;
$rollback_guard$;
CREATE OR REPLACE FUNCTION public.website_document_assert_actor(p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_manage boolean, p_write boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  if p_write then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
    perform 1 from public.workspaces where id=p_workspace_id for update;
    if not found then raise exception 'workspace_access_denied'; end if;
    if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and (not p_manage or role in ('owner','admin')) for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  if p_work_id is not null and not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website') then raise exception 'workspace_access_denied'; end if;
end $function$

;
CREATE OR REPLACE FUNCTION public.website_document_launch_authority(p_workspace_id uuid, p_work_id uuid, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor_role text; approver uuid;
begin
  select m.role into actor_role from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
    where w.id=p_workspace_id and w.kind<>'agency' and m.user_id=p_user_id for share of w,m;
  if actor_role='owner' then return 'owner'; end if;
  if actor_role='admin'
    and exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer')
    and exists(select 1 from public.super_admins sa join public.users u on u.id=sa.user_id where sa.user_id=p_user_id and sa.revoked_at is null and u.verified_at is not null) then
    select h.approved_by into approver from public.website_document_heads h where h.website_work_id=p_work_id;
    if approver is not null and approver<>p_user_id and exists(
      select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
      where m.workspace_id=p_workspace_id and m.user_id=approver and m.role='owner' and u.verified_at is not null
    ) then return 'provider'; end if;
    raise exception 'website_customer_approval_required';
  end if;
  raise exception 'workspace_access_denied';
end $function$

;
CREATE OR REPLACE FUNCTION public.authorize_website_domain_change(p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_tenant_id text, p_hostname text, p_action text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor_role text; tenant_row public.tenants; host text := lower(trim(coalesce(p_hostname,'')));
begin
  if p_action is null or p_action not in ('attach','refresh') then raise exception 'website_domain_action_invalid'; end if;
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
  -- Owners keep exactly the published-tenant check they had.
  begin
    perform public.manage_published_website_tenant(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_tenant_id);
    return 'owner';
  exception when others then
    if sqlerrm not like '%website_tenant_access_denied%' then raise; end if;
  end;
  select m.role into actor_role from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
    where w.id=p_workspace_id and w.kind='customer' and m.user_id=p_user_id for share of w,m;
  if actor_role is distinct from 'admin' or not exists(
    select 1 from public.super_admins sa join public.users u on u.id=sa.user_id where sa.user_id=p_user_id and sa.revoked_at is null and u.verified_at is not null
  ) then raise exception 'website_tenant_access_denied'; end if;
  select t.* into tenant_row from public.website_document_publications p join public.tenants t on t.id=p.tenant_id
    where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=p_tenant_id and t.active for share of p,t;
  if not found then raise exception 'website_tenant_access_denied'; end if;
  -- Checking a hostname the site already holds is checking, not deciding.
  if p_action='refresh' and to_regclass('public.domain_claims') is not null then
    if exists(select 1 from public.domain_claims c where c.tenant_id=tenant_row.id and c.domain=host) then return 'provider'; end if;
  end if;
  if exists(
    select 1 from public.website_domain_approvals a
    join public.workspace_memberships wm on wm.workspace_id=a.workspace_id and wm.user_id=a.approved_by and wm.role='owner'
    join public.users u on u.id=a.approved_by and u.verified_at is not null
    where a.workspace_id=p_workspace_id and a.website_work_id=p_work_id and a.tenant_stable_id=tenant_row.stable_id
      and a.hostname=host and a.approved_by<>p_user_id and a.expires_at>clock_timestamp()
  ) then return 'provider'; end if;
  raise exception 'website_domain_owner_approval_required';
end $function$

;
CREATE OR REPLACE FUNCTION public.website_change_actor_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor_role text;
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null
    for key share;
  if not found then raise exception 'website_change_access_denied'; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and w.kind = 'customer'
    for share of wm;
  if actor_role is null then raise exception 'website_change_access_denied'; end if;
  return actor_role;
end;
$function$

;
CREATE OR REPLACE FUNCTION public.record_website_change_receipt(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_request_id uuid, p_kind text, p_details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor_role text;
  request public.service_requests;
  system_text text;
  last_kind text;
  saved public.website_change_receipts;
  details jsonb := coalesce(p_details, '{}'::jsonb);
begin
  actor_role := public.website_change_actor_role(p_workspace_id, p_user_id, p_verified_email);
  if jsonb_typeof(details) <> 'object' or octet_length(details::text) > 4000
    or details - array['previewUrl', 'commitSha', 'deploymentUrl', 'readBack', 'note']::text[] <> '{}'::jsonb then
    raise exception 'website_change_invalid';
  end if;
  if p_kind in ('preview', 'deployed') then
    if not exists (select 1 from public.super_admins where user_id = p_user_id and revoked_at is null) then
      raise exception 'website_change_operator_required';
    end if;
  elsif p_kind in ('approved', 'declined') then
    if actor_role <> 'owner' then raise exception 'website_change_owner_required'; end if;
  else
    raise exception 'website_change_invalid';
  end if;
  select * into request from public.service_requests
    where id = p_request_id and business_workspace_id = p_workspace_id
    for update;
  if request.id is null or request.context->>'source' is distinct from 'website_change' then
    raise exception 'website_change_not_found';
  end if;
  if request.status <> 'requested' then raise exception 'website_change_closed'; end if;
  system_text := request.context->>'systemId';
  if system_text is null or system_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'website_change_not_found';
  end if;
  select kind into last_kind from public.website_change_receipts
    where request_id = request.id order by recorded_at desc, id desc limit 1;
  if p_kind in ('approved', 'declined') and last_kind is distinct from 'preview' then
    raise exception 'website_change_out_of_order';
  end if;
  if p_kind = 'deployed' and last_kind is distinct from 'approved' then
    raise exception 'website_change_out_of_order';
  end if;
  -- A newer preview may replace one nobody has decided on; both stay recorded.
  insert into public.website_change_receipts(workspace_id, request_id, system_id, kind, preview_url, commit_sha, deployment_url, read_back, note, recorded_by)
    values (p_workspace_id, request.id, system_text::uuid, p_kind,
      case when p_kind = 'preview' then nullif(btrim(details->>'previewUrl'), '') end,
      case when p_kind = 'deployed' then lower(nullif(btrim(details->>'commitSha'), '')) end,
      case when p_kind = 'deployed' then nullif(btrim(details->>'deploymentUrl'), '') end,
      case when p_kind = 'deployed' then nullif(btrim(details->>'readBack'), '') end,
      nullif(btrim(details->>'note'), ''), p_user_id)
    returning * into saved;
  return jsonb_build_object(
    'id', saved.id, 'requestId', saved.request_id, 'systemId', saved.system_id, 'kind', saved.kind,
    'previewUrl', saved.preview_url, 'commitSha', saved.commit_sha, 'deploymentUrl', saved.deployment_url,
    'readBack', saved.read_back, 'note', saved.note, 'recordedAt', saved.recorded_at);
exception
  when check_violation then raise exception 'website_change_invalid';
end;
$function$

;
CREATE OR REPLACE FUNCTION public.workspace_make_systems_authority(p_workspace_id uuid, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor_role text;
begin
  if p_workspace_id is null or p_user_id is null then return null; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
    for share;
  if actor_role is not null and exists (
    select 1 from public.super_admins sa where sa.user_id = p_user_id and sa.revoked_at is null
  ) then
    return 'operator';
  end if;
  if exists (
    select 1
      from public.workspace_delegations d
      join public.workspaces customer on customer.id = d.customer_workspace_id and customer.kind = 'customer'
      join public.workspaces agency on agency.id = d.agency_workspace_id and agency.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = d.agency_workspace_id and am.user_id = p_user_id
      where d.customer_workspace_id = p_workspace_id and d.status = 'active'
  ) then
    return 'agency';
  end if;
  if actor_role is not null then return 'member'; end if;
  return null;
end;
$function$

;
CREATE OR REPLACE FUNCTION public.workspace_require_make_systems(p_workspace_id uuid, p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  authority text;
begin
  authority := public.workspace_make_systems_authority(p_workspace_id, p_user_id);
  if authority is null then raise exception 'workspace_membership_required'; end if;
  if authority not in ('operator', 'agency') then raise exception 'workspace_make_systems_required'; end if;
  return authority;
end;
$function$

;
CREATE OR REPLACE FUNCTION public.strelva_runs_business(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.platform_serves_business(p_workspace_id, 'email')
$function$

;
CREATE OR REPLACE FUNCTION public.set_decision_policy(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_layer text, p_system_id uuid, p_kind text, p_route text, p_reason text, p_expected_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_system_key text := coalesce(p_system_id::text, '*');
  current_row public.decision_policies%rowtype;
  current_version bigint;
  strelva_route text;
  reason text := p_reason;
  history_reason text;
  next_version bigint;
begin
  if p_layer not in ('strelva','owner') then raise exception 'decision_policy_invalid'; end if;
  if public.needs_you_kind_floor(p_kind) is null then raise exception 'decision_policy_invalid'; end if;
  if p_route is not null and public.needs_you_route_rank(p_route) is null then raise exception 'decision_policy_invalid'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer';
  if not found then raise exception 'decision_policy_access_denied'; end if;
  if p_layer = 'owner' then
    if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is distinct from 'owner' then
      raise exception 'decision_policy_access_denied';
    end if;
    reason := 'owner_setting';
  else
    if public.needs_you_operator_id(p_user_id, p_verified_email) is null then
      raise exception 'decision_policy_access_denied';
    end if;
    if reason is null or reason not in ('strelva_default','earned_trust','seed','inquiry_promote') then
      raise exception 'decision_policy_invalid';
    end if;
  end if;
  if p_system_id is not null and not exists (select 1 from public.systems s
      where s.id = p_system_id and s.business_workspace_id = p_workspace_id) then
    raise exception 'decision_policy_access_denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('decision_policy:' || p_workspace_id::text, 0));
  select * into current_row from public.decision_policies
    where workspace_id = p_workspace_id and decision_policies.system_key = v_system_key
      and change_kind = p_kind and layer = p_layer for update;
  current_version := coalesce(current_row.version, 0);
  if p_expected_version is distinct from current_version then raise exception 'decision_policy_version_conflict'; end if;
  if p_route is not null and public.needs_you_route_rank(p_route) < public.needs_you_route_rank(public.needs_you_kind_floor(p_kind)) then
    raise exception 'decision_policy_below_floor';
  end if;
  if p_layer = 'owner' and p_route is not null then
    strelva_route := public.needs_you_strelva_route(p_workspace_id, v_system_key, p_kind);
    if public.needs_you_route_rank(p_route) < public.needs_you_route_rank(strelva_route) then
      raise exception 'decision_policy_looser_than_default';
    end if;
  end if;
  next_version := current_version + 1;
  if p_route is null then
    if current_row.workspace_id is null then return public.read_decision_policy_state(p_workspace_id, p_system_id, p_kind); end if;
    delete from public.decision_policies where workspace_id = p_workspace_id
      and decision_policies.system_key = v_system_key and change_kind = p_kind and layer = p_layer;
    history_reason := case when p_layer = 'owner' then 'owner_reset' else 'strelva_reset' end;
  else
    insert into public.decision_policies(workspace_id, system_key, change_kind, layer, route, set_by, set_reason, version)
      values (p_workspace_id, v_system_key, p_kind, p_layer, p_route, p_user_id, reason, next_version)
      on conflict (workspace_id, system_key, change_kind, layer) do update
        set route = excluded.route, set_by = excluded.set_by, set_reason = excluded.set_reason,
            version = excluded.version, updated_at = clock_timestamp();
    history_reason := reason;
  end if;
  insert into public.decision_policy_history(workspace_id, system_key, change_kind, layer, old_route, new_route, set_by, set_reason, version)
    values (p_workspace_id, v_system_key, p_kind, p_layer, current_row.route, p_route, p_user_id, history_reason, next_version);
  return public.read_decision_policy_state(p_workspace_id, p_system_id, p_kind);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.read_decision_policies(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null
    and public.needs_you_operator_id(p_user_id, p_verified_email) is null then
    raise exception 'decision_policy_access_denied';
  end if;
  return jsonb_build_object(
    'settings', coalesce((select jsonb_agg(jsonb_build_object('systemId', nullif(p.system_key, '*'), 'kind', p.change_kind,
        'layer', p.layer, 'route', p.route, 'reason', p.set_reason, 'version', p.version, 'updatedAt', p.updated_at)
        order by p.change_kind, p.system_key, p.layer)
      from public.decision_policies p where p.workspace_id = p_workspace_id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(row_json order by created_at desc) from (
        select jsonb_build_object('id', h.id, 'systemId', nullif(h.system_key, '*'), 'kind', h.change_kind, 'layer', h.layer,
          'oldRoute', h.old_route, 'newRoute', h.new_route, 'reason', h.set_reason, 'version', h.version,
          'at', h.created_at) as row_json, h.created_at
        from public.decision_policy_history h where h.workspace_id = p_workspace_id
        order by h.created_at desc limit 50) recent), '[]'::jsonb));
end;
$function$

;
CREATE OR REPLACE FUNCTION public.claim_owner_decision(p_workspace_id uuid, p_decision_id uuid, p_revision_hash text, p_decision text, p_by_kind text, p_user_id uuid, p_verified_email text, p_recipient text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  item public.owner_decisions%rowtype;
  owner_recipient jsonb;
  actor_role text;
  v_decided_by text;
  by_kind text := p_by_kind;
begin
  if p_decision not in ('approve','not_yet') then raise exception 'owner_decision_invalid'; end if;
  if p_by_kind not in ('owner_link','session','operator') then raise exception 'owner_decision_invalid'; end if;
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'owner_decision_not_found'; end if;
  if item.state <> 'open' then
    return jsonb_build_object('status', case when item.state = 'superseded' then 'changed' else 'already_handled' end,
      'item', public.owner_decision_json(item));
  end if;
  if item.revision_hash <> p_revision_hash then
    return jsonb_build_object('status', 'changed', 'item', public.owner_decision_json(item));
  end if;
  if clock_timestamp() >= item.expires_at then
    return jsonb_build_object('status', 'expired', 'item', public.owner_decision_json(item));
  end if;

  if p_by_kind = 'owner_link' then
    if item.route <> 'owner_decides' then raise exception 'owner_decision_permission_denied'; end if;
    if item.sign_in_required then raise exception 'owner_decision_sign_in_required'; end if;
    owner_recipient := public.resolve_business_owner_recipient(p_workspace_id);
    if owner_recipient is null or p_recipient is null
      or lower(btrim(owner_recipient->>'email')) <> lower(btrim(p_recipient)) then
      raise exception 'owner_decision_recipient_not_owner';
    end if;
    v_decided_by := lower(btrim(p_recipient));
  elsif p_by_kind = 'operator' then
    if public.needs_you_operator_id(p_user_id, p_verified_email) is null then
      raise exception 'owner_decision_permission_denied';
    end if;
    -- An operator never decides an item routed to the owner.
    if item.route = 'owner_decides' then raise exception 'owner_decision_owner_only'; end if;
    v_decided_by := p_user_id::text;
  else
    actor_role := public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email);
    if actor_role is null then raise exception 'owner_decision_permission_denied'; end if;
    -- A strelva_reviews item reaches the owner only after an operator escalates it.
    if item.route <> 'owner_decides' then raise exception 'owner_decision_permission_denied'; end if;
    if not (actor_role = 'owner' or (actor_role = 'admin' and item.admin_may_decide)) then
      raise exception 'owner_decision_permission_denied';
    end if;
    by_kind := actor_role || '_session';
    v_decided_by := p_user_id::text;
  end if;

  update public.owner_decisions set
      state = case when p_decision = 'approve' then 'approved' else 'declined' end,
      decided_at = clock_timestamp(), decided_by_kind = by_kind, decided_by = v_decided_by
    where id = item.id returning * into item;
  return jsonb_build_object('status', 'claimed', 'item', public.owner_decision_json(item));
end;
$function$

;
CREATE OR REPLACE FUNCTION public.escalate_owner_decision(p_workspace_id uuid, p_decision_id uuid, p_user_id uuid, p_verified_email text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare item public.owner_decisions%rowtype;
begin
  if public.needs_you_operator_id(p_user_id, p_verified_email) is null then raise exception 'owner_decision_permission_denied'; end if;
  if p_note is null or char_length(btrim(p_note)) = 0 then raise exception 'owner_decision_invalid'; end if;
  update public.owner_decisions set route = 'owner_decides', operator_note = left(btrim(p_note), 1000),
      expires_at = greatest(expires_at, clock_timestamp() + make_interval(days => 14))
    where id = p_decision_id and workspace_id = p_workspace_id and state = 'open' and route = 'strelva_reviews'
    returning * into item;
  if not found then raise exception 'owner_decision_not_open'; end if;
  return public.owner_decision_json(item);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.list_owner_decisions(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_include_closed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_operator boolean;
begin
  v_operator := public.needs_you_operator_id(p_user_id, p_verified_email) is not null;
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null and not v_operator then
    raise exception 'owner_decision_access_denied';
  end if;
  return coalesce((select jsonb_agg(public.owner_decision_json(d) order by d.opened_at, d.id)
    from public.owner_decisions d
    where d.workspace_id = p_workspace_id
      and (v_operator or d.route = 'owner_decides')
      and (d.state = 'open' or (p_include_closed and d.decided_at > clock_timestamp() - interval '30 days'))), '[]'::jsonb);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.read_strelva_handled(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare since timestamptz := coalesce(p_since, clock_timestamp() - interval '7 days');
begin
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null
    and public.needs_you_operator_id(p_user_id, p_verified_email) is null then
    raise exception 'owner_decision_access_denied';
  end if;
  return coalesce((select jsonb_agg(entry order by (entry->>'at') desc) from (
    select jsonb_build_object('store', 'business_record_revisions', 'id', r.sequence::text, 'at', r.created_at,
        'source', r.source, 'changes', (select coalesce(jsonb_agg((c->>'entity') || ':' || coalesce(c->>'id', '')), '[]'::jsonb) from jsonb_array_elements(r.changes) c),
        'undoOf', r.undo_of_sequence,
        'undo', case
          when r.undo_of_sequence is not null then 'not_undoable'
          when exists (select 1 from public.business_record_revisions u where u.workspace_id = r.workspace_id and u.undo_of_sequence = r.sequence) then 'undone'
          when exists (select 1 from public.business_record_revisions later where later.workspace_id = r.workspace_id and later.sequence > r.sequence) then 'undo_needs_review'
          else 'undo' end) as entry
      from public.business_record_revisions r
      where r.workspace_id = p_workspace_id and r.created_at >= since
        and r.source in ('operator','agent','website_rebuild','bookings','inquiries','tenant_import')
    union all
    select jsonb_build_object('store', 'website_document_receipts', 'id', x.id::text, 'at', x.created_at,
        'websiteWorkId', x.website_work_id, 'revision', x.revision, 'action', x.receipt->>'action',
        'undo', 'undo_needs_review')
      from public.website_document_receipts x
      where x.workspace_id = p_workspace_id and x.created_at >= since
    union all
    select jsonb_build_object('store', 'decision_policy_history', 'id', h.id::text, 'at', h.created_at,
        'kind', h.change_kind, 'layer', h.layer, 'oldRoute', h.old_route, 'newRoute', h.new_route, 'reason', h.set_reason,
        'undo', 'undo')
      from public.decision_policy_history h
      where h.workspace_id = p_workspace_id and h.created_at >= since
    union all
    select jsonb_build_object('store', 'owner_decisions', 'id', d.id::text, 'at', d.decided_at, 'kind', d.change_kind,
        'title', d.title, 'state', d.state, 'outcome', d.outcome, 'outcomeReason', d.outcome_reason,
        'sourceLifecycle', d.source_lifecycle, 'sourceId', d.source_id, 'decidedByKind', d.decided_by_kind,
        'receiptRef', d.receipt_ref, 'approveEffect', d.approve_effect, 'notYetEffect', d.not_yet_effect,
        'systemId', d.system_id, 'openHref', d.open_href, 'undo', 'not_undoable')
      from public.owner_decisions d
      where d.workspace_id = p_workspace_id and d.decided_at >= since
        and d.state in ('expired', 'approved', 'declined')
  ) entries), '[]'::jsonb);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.prepare_website_domain_request(p_id uuid, p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_tenant_id text, p_published_revision integer, p_published_hash text, p_hostname text, p_records jsonb, p_revision_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t public.tenants; r public.website_domain_requests;
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 -- An owner may prepare; an admin must be a currently verified Strelva operator.
 if not exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner')
   and public.needs_you_operator_id(p_user_id,p_verified_email) is null then raise exception 'workspace_access_denied'; end if;
 select t0.* into t from public.website_document_publications p join public.tenants t0 on t0.id=p.tenant_id
   where p.workspace_id=p_workspace_id and p.website_work_id=p_work_id and p.tenant_id=p_tenant_id
   and p.revision=p_published_revision and p.content_hash=p_published_hash and t0.active and t0.delivery_model='platform_template' for share of p,t0;
 if not found then raise exception 'website_domain_request_conflict'; end if;
 insert into public.website_domain_requests(id,workspace_id,website_work_id,tenant_stable_id,published_revision,published_hash,hostname,records,revision_hash,created_by)
 values(p_id,p_workspace_id,p_work_id,t.stable_id,p_published_revision,p_published_hash,p_hostname,p_records,p_revision_hash,p_user_id) on conflict(id) do nothing;
 select * into r from public.website_domain_requests where id=p_id;
 if r.workspace_id<>p_workspace_id or r.website_work_id<>p_work_id or r.revision_hash<>p_revision_hash then raise exception 'website_domain_request_conflict'; end if;
 return public.website_domain_request_json(r);
end $function$

;
CREATE OR REPLACE FUNCTION public.claim_native_website_fact_review(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_tenant_id text, p_record_revision bigint, p_claim_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare access text; t public.tenants; actual_revision bigint;
begin
  access:=public.business_record_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
  if access<>'owner' and not(access='admin' and public.needs_you_operator_id(p_user_id,p_verified_email) is not null) then raise exception 'business_record_access_denied'; end if;
  select revision into actual_revision from public.business_records where workspace_id=p_workspace_id for share;
  if not found or actual_revision is distinct from p_record_revision then return false; end if;
  select * into t from public.tenants where id=p_tenant_id and active and delivery_model='custom_repo' for share;
  if t.id is null or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id) then raise exception 'business_record_access_denied'; end if;
  if exists(select 1 from public.workspace_release_flags where workspace_id=p_workspace_id and flag='systems' and state='off') then return false; end if;
  insert into public.website_native_fact_reviews(claim_token,workspace_id,tenant_stable_id,record_revision,claimed_by)
    values(p_claim_token,p_workspace_id,t.stable_id,p_record_revision,p_user_id) on conflict do nothing;
  return found;
end $function$

;
CREATE OR REPLACE FUNCTION public.read_catalog_report_receipts(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email) is null
    and public.needs_you_operator_id(p_user_id, p_verified_email) is null then
    raise exception 'workspace_access_denied';
  end if;
  return coalesce((select jsonb_agg(row order by row->>'at' desc) from (
    select jsonb_build_object('id', r.id, 'workspaceId', r.workspace_id, 'tenantId', t.id, 'kind', r.kind,
      'period', r.period, 'status', r.status, 'recipient', r.recipient, 'reason', r.reason,
      'providerMessageId', r.provider_message_id, 'at', r.created_at) as row
      from public.catalog_report_receipts r join public.tenants t on t.stable_id = r.tenant_stable_id
      where r.workspace_id = p_workspace_id and r.created_at >= coalesce(p_since, clock_timestamp() - interval '7 days')
      order by r.created_at desc limit 100
  ) rows), '[]'::jsonb);
end;
$function$

;
CREATE OR REPLACE FUNCTION public.set_tenant_decision_route(p_tenant_id text, p_user_id uuid, p_verified_email text, p_layer text, p_kind text, p_route text, p_today_value text, p_not_migrated text, p_via text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  link record;
  current_row public.decision_policies%rowtype;
  current_version bigint;
  strelva_route text;
  reason text;
  history_reason text;
  verified boolean;
  is_operator boolean;
begin
  if p_kind not in ('copy.routine','review.reply') then raise exception 'decision_policy_invalid'; end if;
  if p_layer not in ('strelva','owner') then raise exception 'decision_policy_invalid'; end if;
  if p_via not in ('seed','owner_save','operator_save') then raise exception 'decision_policy_invalid'; end if;
  if p_route is not null and public.needs_you_route_rank(p_route) is null then raise exception 'decision_policy_invalid'; end if;
  if p_today_value is null or char_length(p_today_value) not between 1 and 40 then raise exception 'decision_policy_invalid'; end if;
  select * into link from public.needs_you_tenant_link(p_tenant_id);
  if link.workspace_id is null then raise exception 'decision_policy_not_linked'; end if;
  select exists (select 1 from public.users u where u.id = p_user_id and u.verified_at is not null
      and lower(u.email) = lower(btrim(coalesce(p_verified_email, '')))) into verified;
  if not verified then raise exception 'decision_policy_access_denied'; end if;
  is_operator := public.needs_you_operator_id(p_user_id, p_verified_email) is not null;
  if p_via = 'seed' then
    -- The seed moves the owner's existing choice; only an operator runs it.
    if not is_operator then raise exception 'decision_policy_access_denied'; end if;
    reason := 'seed';
  elsif p_layer = 'owner' then
    if p_via <> 'owner_save' then raise exception 'decision_policy_invalid'; end if;
    if not exists (select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = p_user_id
          and m.role in ('editor','admin','owner'))
      and public.needs_you_member_role(link.workspace_id, p_user_id, p_verified_email) is distinct from 'owner' then
      raise exception 'decision_policy_access_denied';
    end if;
    reason := 'owner_setting';
  else
    if p_via <> 'operator_save' or not is_operator then raise exception 'decision_policy_access_denied'; end if;
    reason := 'strelva_default';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('decision_policy:' || link.workspace_id::text, 0));
  if p_route is not null and public.needs_you_route_rank(p_route) < public.needs_you_route_rank(public.needs_you_kind_floor(p_kind)) then
    raise exception 'decision_policy_below_floor';
  end if;
  if p_layer = 'owner' and p_route is not null then
    strelva_route := public.needs_you_strelva_route(link.workspace_id, '*', p_kind);
    if public.needs_you_route_rank(p_route) < public.needs_you_route_rank(strelva_route) then
      raise exception 'decision_policy_looser_than_default';
    end if;
  end if;
  select * into current_row from public.decision_policies
    where workspace_id = link.workspace_id and system_key = '*' and change_kind = p_kind and layer = p_layer for update;
  current_version := coalesce(current_row.version, 0);
  if p_route is null then
    if current_row.workspace_id is not null then
      delete from public.decision_policies where workspace_id = link.workspace_id and system_key = '*'
        and change_kind = p_kind and layer = p_layer;
      history_reason := case when p_layer = 'owner' then 'owner_reset' else 'strelva_reset' end;
    end if;
  elsif current_row.route is distinct from p_route then
    insert into public.decision_policies(workspace_id, system_key, change_kind, layer, route, set_by, set_reason, version)
      values (link.workspace_id, '*', p_kind, p_layer, p_route, p_user_id, reason, current_version + 1)
      on conflict (workspace_id, system_key, change_kind, layer) do update
        set route = excluded.route, set_by = excluded.set_by, set_reason = excluded.set_reason,
            version = excluded.version, updated_at = clock_timestamp();
    history_reason := reason;
  end if;
  if history_reason is not null then
    insert into public.decision_policy_history(workspace_id, system_key, change_kind, layer, old_route, new_route, set_by, set_reason, version)
      values (link.workspace_id, '*', p_kind, p_layer, current_row.route, p_route, p_user_id, history_reason, current_version + 1);
  end if;
  insert into public.decision_policy_tenant_imports(tenant_stable_id, change_kind, workspace_id, today_value, not_migrated, imported_by, imported_via)
    values (link.tenant_stable_id, p_kind, link.workspace_id, p_today_value, left(nullif(btrim(coalesce(p_not_migrated, '')), ''), 300), p_user_id, p_via)
    on conflict (tenant_stable_id, change_kind) do nothing;
  return jsonb_build_object('workspaceId', link.workspace_id,
    'state', public.read_decision_policy_state(link.workspace_id, null, p_kind));
end;
$function$

;
drop function public.needs_you_provider_id(uuid,uuid,text);
drop function public.read_agency_google_listing_readback_failures(uuid,text,uuid,integer);
commit;
