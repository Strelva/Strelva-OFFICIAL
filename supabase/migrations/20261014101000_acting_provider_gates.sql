-- Agency 1.0 #255 (2 of 2) and #534: every client-serving super_admins
-- branch becomes the acting provider (20261014100000). Local only until
-- Jacob's yes.
--
-- Before: the provider half of each gate was "a Strelva operator", an active
-- super_admins row, usually with a direct admin membership that conversion
-- gave Strelva's staff. No other agency had the path, and the operator acted
-- for every client at once. After: each gate asks acting_provider for the
-- business, the person, the effect and the named resource, the same for
-- every agency. Strelva's agency acts through its own seat, staff rows,
-- verification and mandates, like everyone else.
--
--   gate                               provider path now needs
--   website launch (reserve, publish)  publish + mandate on the website System,
--                                      on a verified owner's approval (unchanged)
--   domain attach / refresh            publish + mandate on the hostname, on the
--                                      owner's hostname approval (unchanged)
--   website change preview             the seat (a preview is not live)
--   website change deploy              publish + mandate on the website System
--   make Systems                       the seat ('provider'), or a delegation
--   Needs you provider layer           the seat (deciding is not the effect;
--                                      each effect is gated where it happens)
--   owner-link website launch (#534)   the serving provider verified for publish
--                                      with the website mandate, on top of the
--                                      email-served owner link; the owner's
--                                      preview needs the publish-served provider
--
-- A provider seat also opens the website document and change-request reads
-- and writes, as 7A's business_record_assert_actor does: the seat resolves
-- to provider_seat_direct_role().
--
-- Platform operator powers that remain are platform-wide and read-only, or
-- recorded where they happen; none serves a client: the operator queue and
-- its read-back list (20261007160000, 20261008123000), the not-told and
-- policy-business lists (20261008124000), catalog report failures
-- (20261010152000), the Needs-you tenant seed (20261008124000, logged in
-- decision_policy_tenant_imports), agency verification (20261009152000) and
-- conversion mandates (20261014100000), each naming the operator.
--
-- Rollback restores every replaced body from rollback-20261014101000.

set local lock_timeout = '3s';

-- ---- helpers ----

-- The agency this verified person acts for on this business through a
-- provider seat (no outside effect), or null. Replaces needs_you_operator_id
-- wherever Needs you serves one business.
create function public.needs_you_provider_id(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then return null; end if;
  perform 1 from public.users u
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then return null; end if;
  return public.acting_provider(p_workspace_id, p_user_id, null, null, null);
end;
$$;
revoke all on function public.needs_you_provider_id(uuid, uuid, text) from public, anon, authenticated, service_role;

-- ---- websites ----

-- Same contract as 20261001120000, plus the provider seat: a seat holder
-- reads and manages drafts the way a direct member with the seat's role does.
create or replace function public.website_document_assert_actor(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_manage boolean,p_write boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare seat_role text;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  if p_write then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
    perform 1 from public.workspaces where id=p_workspace_id for update;
    if not found then raise exception 'workspace_access_denied'; end if;
    if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and (not p_manage or role in ('owner','admin')) for share;
  if not found then
    seat_role := public.provider_seat_role(p_workspace_id,p_user_id,true);
    if seat_role is null or (p_manage and seat_role not in ('owner','admin')) then raise exception 'workspace_access_denied'; end if;
  end if;
  if p_work_id is not null and not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website') then raise exception 'workspace_access_denied'; end if;
end $$;

-- Launch authority (contract of 20261007101000): the owner, or the acting
-- provider for publishing this website System, launching an approval a
-- verified owner other than themself recorded.
create or replace function public.website_document_launch_authority(p_workspace_id uuid,p_work_id uuid,p_user_id uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role text; approver uuid;
begin
  select m.role into actor_role from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
    where w.id=p_workspace_id and w.kind<>'agency' and m.user_id=p_user_id for share of w,m;
  if actor_role='owner' then return 'owner'; end if;
  if not exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer')
    or public.acting_provider(p_workspace_id,p_user_id,null,null,null) is null then
    raise exception 'workspace_access_denied';
  end if;
  perform public.acting_provider_assert(p_workspace_id,p_user_id,'publish','website',
    public.system_origin_id(p_workspace_id,'saved_work',p_work_id::text)::text);
  select h.approved_by into approver from public.website_document_heads h where h.website_work_id=p_work_id;
  if approver is not null and approver<>p_user_id and exists(
    select 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
    where m.workspace_id=p_workspace_id and m.user_id=approver and m.role='owner' and u.verified_at is not null
  ) then return 'provider'; end if;
  raise exception 'website_customer_approval_required';
end $$;
revoke all on function public.website_document_launch_authority(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Domain authority (contract of 20261008150100): the owner exactly as before,
-- or the acting provider for publishing this hostname, on the owner's current
-- approval of it (or checking a hostname the site already holds).
create or replace function public.authorize_website_domain_change(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_hostname text,p_action text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare tenant_row public.tenants; host text := lower(trim(coalesce(p_hostname,'')));
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
  if not exists(select 1 from public.workspaces where id=p_workspace_id and kind='customer')
    or public.acting_provider(p_workspace_id,p_user_id,null,null,null) is null then
    raise exception 'website_tenant_access_denied';
  end if;
  if public.client_resource_ref('domain',host) is null then raise exception 'website_domain_invalid'; end if;
  perform public.acting_provider_assert(p_workspace_id,p_user_id,'publish','domain',host);
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
end $$;

-- Same contract as 20261008111000, plus the provider seat.
create or replace function public.website_change_actor_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
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
  if actor_role is null then actor_role := public.provider_seat_role(p_workspace_id, p_user_id, true); end if;
  if actor_role is null then raise exception 'website_change_access_denied'; end if;
  return actor_role;
end;
$$;

-- Same contract as 20261008111000. Previews: the business's acting provider
-- (its seat). Deploys: the acting provider for publishing this System.
create or replace function public.record_website_change_receipt(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_request_id uuid, p_kind text, p_details jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
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
    if public.acting_provider(p_workspace_id, p_user_id, null, null, null) is null then
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
  if p_kind = 'deployed' then
    perform public.acting_provider_assert(p_workspace_id, p_user_id, 'publish', 'website', system_text);
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
$$;

-- ---- making Systems (AP-1, RL-03) ----

-- Returns 'provider' (the business's acting provider: seat, agency
-- membership and staff row), 'agency' (a member of an agency holding an
-- active delegation), 'member' (a direct member who may not make Systems) or
-- null. No super_admins branch: Strelva's agency makes Systems through its
-- own seat or delegation.
create or replace function public.workspace_make_systems_authority(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
begin
  if p_workspace_id is null or p_user_id is null then return null; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
    for share;
  if public.acting_provider(p_workspace_id, p_user_id, null, null, null) is not null then
    return 'provider';
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
$$;

create or replace function public.workspace_require_make_systems(p_workspace_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  authority text;
begin
  authority := public.workspace_make_systems_authority(p_workspace_id, p_user_id);
  if authority is null then raise exception 'workspace_membership_required'; end if;
  if authority not in ('provider', 'agency') then raise exception 'workspace_make_systems_required'; end if;
  return authority;
end;
$$;

-- ---- owner-ask website launch (#534, M6) ----

-- An owner-decision link is served for email: its session and
-- assert_owner_decision_link (20261010102000) check the provider verified for
-- email, which is right for the email itself. Launching a website from one
-- also publishes, so the website checks add publish: the preview the owner
-- opens, and the launch choke point (reserve and publish both call it),
-- which also needs the session's provider to hold the website mandate,
-- rechecked at each step. strelva_runs_business keeps meaning email.
do $patch$
declare
  target text := 'public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text)';
  definition text;
  patched text;
begin
  definition := pg_get_functiondef(target::regprocedure);
  patched := replace(definition,
    '  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);',
    '  if public.platform_provider_for_resource(p_workspace_id,session_row.provider_workspace_id,''publish'',''website'',
    public.system_origin_id(p_workspace_id,''saved_work'',p_work_id::text)::text) is null then
    raise exception ''strelva_service_access_denied'';
  end if;
  perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);');
  if patched = definition then raise exception 'acting_provider_patch_drift: %', target; end if;
  execute patched;

  target := 'public.read_owner_decision_website_preview(uuid,uuid,text,text)';
  definition := pg_get_functiondef(target::regprocedure);
  patched := replace(definition, 'or not public.strelva_runs_business(p_workspace_id) then',
    'or not public.platform_serves_business(p_workspace_id,''publish'') then');
  if patched = definition then raise exception 'acting_provider_patch_drift: %', target; end if;
  execute patched;
end;
$patch$;

-- ---- Needs you, per business ----

-- The provider layer, provider claims and escalation, and the provider's
-- reads: needs_you_operator_id becomes needs_you_provider_id for the
-- business in every function that serves one business. Bodies are otherwise
-- unchanged, so later streams' edits to them survive.
do $patch$
declare
  target text;
  definition text;
  patched text;
begin
  foreach target in array array[
    'public.set_decision_policy(uuid,uuid,text,text,uuid,text,text,text,bigint)',
    'public.read_decision_policies(uuid,uuid,text)',
    'public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)',
    'public.escalate_owner_decision(uuid,uuid,uuid,text,text)',
    'public.list_owner_decisions(uuid,uuid,text,boolean)',
    'public.read_strelva_handled(uuid,uuid,text,timestamp with time zone)',
    'public.prepare_website_domain_request(uuid,uuid,uuid,uuid,text,text,integer,text,text,jsonb,text)',
    'public.claim_native_website_fact_review(uuid,uuid,text,text,bigint,uuid)',
    'public.read_catalog_report_receipts(uuid,uuid,text,timestamp with time zone)'
  ] loop
    definition := pg_get_functiondef(target::regprocedure);
    patched := regexp_replace(definition, 'needs_you_operator_id\(p_user_id,\s*p_verified_email\)',
      'needs_you_provider_id(p_workspace_id, p_user_id, p_verified_email)', 'g');
    if patched = definition or patched ~ 'needs_you_operator_id' then
      raise exception 'acting_provider_patch_drift: %', target;
    end if;
    execute patched;
  end loop;

  -- The tenant route save: the operator seed stays a platform step (it moves
  -- the owner's own choice and is logged in decision_policy_tenant_imports);
  -- the provider-layer save is the linked business's acting provider.
  target := 'public.set_tenant_decision_route(text,uuid,text,text,text,text,text,text,text)';
  definition := pg_get_functiondef(target::regprocedure);
  patched := replace(definition,
    'if p_via <> ''operator_save'' or not is_operator then',
    'if p_via <> ''operator_save'' or public.needs_you_provider_id(link.workspace_id, p_user_id, p_verified_email) is null then');
  if patched = definition then raise exception 'acting_provider_patch_drift: %', target; end if;
  execute patched;
end;
$patch$;

-- ---- Google listing read-back, for the agency ----

-- Google listing writes whose read-back failed, on the businesses this agency
-- member is staffed on through an active seat. The same shape as the
-- operator queue's read (20261008123000), which stays platform-wide and
-- read-only.
create function public.read_agency_google_listing_readback_failures(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_limit integer
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 200);
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where u.id = p_user_id and lower(u.email) = lower(btrim(coalesce(p_verified_email, ''))) and u.verified_at is not null
      and m.workspace_id = p_agency_workspace_id;
  if not found then raise exception 'workspace_access_denied'; end if;
  return coalesce((select jsonb_agg(row_json order by created_at desc, id) from (
      select r.id, r.created_at, jsonb_build_object(
        'id', r.id, 'workspaceId', r.workspace_id, 'workspaceName', w.name,
        'tenantId', coalesce(
          (select t.id from public.workspace_account_bindings b join public.tenants t on t.stable_id = b.origin_tenant_stable_id
            where b.id = r.binding_id),
          (select min(t.id) from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
            where l.workspace_id = r.workspace_id
            having count(*) = 1)),
        'action', r.action, 'targetRef', r.target_ref, 'status', r.status, 'readback', r.readback,
        'error', r.error, 'createdAt', r.created_at, 'completedAt', r.completed_at) as row_json
      from public.google_listing_receipts r
      join public.workspaces w on w.id = r.workspace_id and w.kind = 'customer'
      join public.provider_seats s on s.customer_workspace_id = r.workspace_id
        and s.agency_workspace_id = p_agency_workspace_id and s.status = 'active'
      join public.agency_client_staff st on st.agency_workspace_id = s.agency_workspace_id
        and st.customer_workspace_id = s.customer_workspace_id and st.user_id = p_user_id and st.status = 'active'
      where r.status = 'posted_unverified' and r.readback in ('failed', 'differs')
      order by r.created_at desc, r.id
      limit v_limit) failures), '[]'::jsonb);
end;
$$;
revoke all on function public.read_agency_google_listing_readback_failures(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.read_agency_google_listing_readback_failures(uuid, text, uuid, integer) to service_role;
