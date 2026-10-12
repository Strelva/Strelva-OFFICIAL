begin;
set local lock_timeout = '3s';

-- New records keep action-time names. Existing history is never attributed
-- from today's serving brand or backfilled from current membership.
alter table public.owner_decisions add column proposing_actor jsonb;
alter table public.owner_decisions add column deciding_actor jsonb;
create function public.owner_decision_actor_snapshot_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.proposing_actor is not null and new.proposing_actor is distinct from old.proposing_actor then
    raise exception 'owner_decision_actor_immutable'; end if;
  if old.deciding_actor is not null and new.deciding_actor is distinct from old.deciding_actor then
    raise exception 'owner_decision_actor_immutable'; end if;
  if new.deciding_actor is distinct from old.deciding_actor and
    (old.state <> 'open' or new.state not in ('approved','declined') or new.decided_by_kind <> 'agency_session') then
    raise exception 'owner_decision_actor_invalid'; end if;
  return new;
end;
$$;
create trigger owner_decision_actor_snapshot_guard before update on public.owner_decisions
  for each row execute function public.owner_decision_actor_snapshot_guard();

alter function public.owner_decision_json(public.owner_decisions) rename to owner_decision_json_before_ux_agency;
revoke all on function public.owner_decision_json_before_ux_agency(public.owner_decisions) from public, anon, authenticated, service_role;
create function public.owner_decision_json(d public.owner_decisions) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select public.owner_decision_json_before_ux_agency(d) || jsonb_build_object(
    'actor',d.proposing_actor, 'decidedActor',d.deciding_actor)
$$;
revoke all on function public.owner_decision_json(public.owner_decisions) from public, anon, authenticated, service_role;

alter function public.open_owner_decision(uuid,jsonb) rename to open_owner_decision_before_ux_agency;
revoke all on function public.open_owner_decision_before_ux_agency(uuid,jsonb) from public, anon, authenticated, service_role;
create function public.open_owner_decision(p_workspace_id uuid, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare prior uuid; result jsonb; row public.owner_decisions; snapshot jsonb := p_item->'actor';
begin
  if snapshot is not null and snapshot <> 'null'::jsonb then
    if jsonb_typeof(snapshot) <> 'object' or coalesce(snapshot->>'kind','') not in ('platform','agency','person','operator')
      or snapshot - array['kind','displayName']::text[] <> '{}'::jsonb
      or (snapshot->>'kind' in ('agency','person') and nullif(btrim(snapshot->>'displayName'),'') is null) then
      raise exception 'owner_decision_actor_invalid'; end if;
  else snapshot := null; end if;
  perform pg_advisory_xact_lock(hashtextextended('owner_decision:' || p_workspace_id::text || ':'
    || coalesce(p_item->>'sourceLifecycle','') || ':' || coalesce(p_item->>'sourceId',''),0));
  select id into prior from public.owner_decisions where workspace_id = p_workspace_id
    and source_lifecycle = p_item->>'sourceLifecycle' and source_id = p_item->>'sourceId' and revision_hash = p_item->>'revisionHash';
  result := public.open_owner_decision_before_ux_agency(p_workspace_id,p_item);
  if prior is null and snapshot is not null then
    update public.owner_decisions set proposing_actor = snapshot where id = (result->>'id')::uuid returning * into row;
    result := public.owner_decision_json(row);
  end if;
  return result;
end;
$$;
revoke all on function public.open_owner_decision(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.open_owner_decision(uuid,jsonb) to service_role;
revoke all on function public.owner_decision_actor_snapshot_guard() from public, anon, authenticated, service_role;

-- System kinds describe the business job, not a blanket publish permission.
create function public.agency_system_decision_scope(p_kind text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_kind when 'website' then 'website' when 'booking' then 'bookings'
    when 'inquiry' then 'inquiries' when 'listing' then 'google'
    when 'internal_app' then 'internal_tools' when 'document' then 'internal_tools'
    when 'report' then 'internal_tools' when 'tracker' then 'internal_tools'
    when 'proposal' then 'internal_tools' when 'pricing' then 'internal_tools'
    when 'portal' then 'internal_tools' when 'onboarding' then 'internal_tools' else null end
$$;

-- A plan may touch several areas. Every area requires the same agency's
-- Full-control grant. Unclassified effects, new Systems without an established
-- kind, Connection changes and payment effects remain the owner's decision.
create function public.agency_owner_decision_scopes(p_item public.owner_decisions) returns text[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare area text; areas text[] := '{}'; plan jsonb; part jsonb; system_kind text; target text; event_kind text;
begin
  if p_item.source_lifecycle in ('business_facts','business_record_draft','inquiry_fact')
    or public.owner_decision_scope(p_item.change_kind) is null then return null; end if;
  if p_item.source_lifecycle = 'tenant_event' then
    -- Facts/System kinds alone cannot distinguish Google facts from website
    -- facts, or an inquiry installation from an app. Require recorded source
    -- identity for those cases; a missing mirror never grants a fallback area.
    select e.metadata->>'kind' into event_kind from public.unified_events e
      join public.tenants tenant on tenant.id = e.tenant_id
      join public.tenant_workspace_links link on link.tenant_stable_id = tenant.stable_id and link.workspace_id = p_item.workspace_id
      where e.id::text = split_part(p_item.source_id,':',2) and e.tenant_id = split_part(p_item.source_id,':',1)
        and encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(jsonb_build_object(
          'id',e.id::text,'tenantId',e.tenant_id,'type',e.type,'title',e.title,'body',e.body,
          'metadata',coalesce(e.metadata,'{}'::jsonb) - array['execution','reviewAudience','escalatedByOperator']::text[])), 'UTF8')),'hex') = p_item.revision_hash;
    if p_item.change_kind = 'fact.inferred' and event_kind in ('workspace_google_listing_draft','gbp_hours_draft') then return array['google']; end if;
    if p_item.change_kind in ('system.go_live','system.change_live') and event_kind in ('inquiry_capability_publish','inquiry_capability_undo') then return array['inquiries']; end if;
  end if;
  if p_item.change_kind not in ('system.go_live','system.change_live','system.pause') then
    if p_item.change_kind in ('fact.owner_stated','fact.inferred')
      and p_item.source_lifecycle in ('website_document','connected_site_schema') then return array['website']; end if;
    if p_item.change_kind in ('copy.routine','copy.marketing','structure')
      and p_item.source_lifecycle in ('website_document','tenant_event') then return array['website']; end if;
    if p_item.change_kind in ('google.post','google.photo','review.reply','review.reply_critical')
      and p_item.source_lifecycle = 'tenant_event' then return array['google']; end if;
    if p_item.change_kind = 'customer.message' and p_item.source_lifecycle = 'tenant_event' then return array['inquiries']; end if;
    if p_item.change_kind = 'customer.commitment' and p_item.source_lifecycle = 'booking_request' then return array['bookings']; end if;
    -- Inquiry price/date promises are not booking approvals. Unknown source
    -- contracts never inherit a kind's blanket area mapping.
    return null;
  end if;
  if p_item.source_lifecycle in ('website_document','website_domain') then return array['website']; end if;
  if p_item.source_lifecycle = 'make_real' then
    select body into plan from public.system_possibilities
      where business_workspace_id = p_item.workspace_id and status = 'ready'
        and id::text = split_part(p_item.source_id,':',1)
        and candidate_revision::text = split_part(p_item.source_id,':',2);
    if plan is null or jsonb_typeof(plan->'changes') is distinct from 'array'
      or jsonb_typeof(plan->'effects') is distinct from 'array'
      or coalesce(plan->'introduces','[]'::jsonb) <> '[]'::jsonb
      or coalesce(plan->'connections','[]'::jsonb) <> '[]'::jsonb then return null; end if;
    for part in select value from jsonb_array_elements(plan->'changes') loop
      select kind into system_kind from public.systems
        where id::text = part->'baseline'->>'systemId' and business_workspace_id = p_item.workspace_id;
      area := public.agency_system_decision_scope(system_kind);
      if area is null then return null; end if;
      areas := array_append(areas,area);
    end loop;
    for part in select value from jsonb_array_elements(plan->'effects') loop
      if coalesce(part->>'kind','') not in ('publish','message','calendar') then return null; end if;
      area := case part->>'channel' when 'hosted_website' then 'website' when 'tenant_content' then 'website'
        when 'inquiry_form' then 'inquiries' when 'booking_page' then 'bookings'
        when 'internal_app' then 'internal_tools' when 'google_listing' then 'google' else null end;
      if area is null or (part->>'kind' = 'calendar' and area <> 'bookings')
        or (part->>'kind' = 'message' and area not in ('inquiries','google')) then return null; end if;
      target := part->'system'->>'systemId';
      select kind into system_kind from public.systems where id::text = target and business_workspace_id = p_item.workspace_id;
      if public.agency_system_decision_scope(system_kind) is distinct from area then return null; end if;
      areas := array_append(areas,area);
    end loop;
    if cardinality(areas) = 0 then return null; end if;
    return array(select distinct value from unnest(areas) value order by value);
  end if;
  -- Release/app decisions refer to the actual System whose content changes.
  if p_item.source_lifecycle not in ('version_release','application_release') then return null; end if;
  select kind into system_kind from public.systems where business_workspace_id = p_item.workspace_id
    and (id = p_item.system_id or (p_item.system_id is null and p_item.source_lifecycle = 'application_release'
      and split_part(p_item.source_id,':',1) in ('native','custom')
      and origin_kind = 'saved_work' and origin_ref = split_part(p_item.source_id,':',2)));
  area := public.agency_system_decision_scope(system_kind);
  return case when area is not null then array[area] else null end;
end;
$$;

-- One authority predicate for reading and claiming. A seat alone, a provider
-- label, platform administration, or Manage with approval grants no decision.
-- Fact confirmations can include private owner-recipient/contact data and
-- remain owner-only, as required by their existing source resolvers.
create function public.agency_owner_decision_allowed(p_workspace_id uuid, p_decision_id uuid, p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.owner_decisions d
      join public.agency_scope_grants g on g.customer_workspace_id = d.workspace_id
        and g.scope = any(public.agency_owner_decision_scopes(d)) and g.level = 'full_control' and g.status = 'active'
      join public.provider_seats seat on seat.customer_workspace_id = g.customer_workspace_id
        and seat.agency_workspace_id = g.agency_workspace_id and seat.status = 'active'
      join public.agency_client_staff staff on staff.customer_workspace_id = seat.customer_workspace_id
        and staff.agency_workspace_id = seat.agency_workspace_id and staff.user_id = p_user_id and staff.status = 'active'
      join public.workspace_memberships member on member.workspace_id = staff.agency_workspace_id and member.user_id = staff.user_id
      join public.users actor on actor.id = member.user_id
        and lower(actor.email) = lower(btrim(p_verified_email)) and actor.verified_at is not null
      join public.workspaces agency on agency.id = g.agency_workspace_id and agency.kind = 'agency'
      join public.workspaces business on business.id = d.workspace_id and business.kind = 'customer'
    where d.workspace_id = p_workspace_id and d.id = p_decision_id and d.route = 'owner_decides'
      and g.agency_workspace_id = p_agency_workspace_id
      and not exists (select 1 from unnest(public.agency_owner_decision_scopes(d)) required_scope
        where not exists (select 1 from public.agency_scope_grants required_grant
          where required_grant.customer_workspace_id = d.workspace_id and required_grant.agency_workspace_id = g.agency_workspace_id
            and required_grant.scope = required_scope and required_grant.level = 'full_control' and required_grant.status = 'active'))
      and not exists (select 1 from public.super_admins admin where admin.user_id = p_user_id and admin.revoked_at is null)
      and not public.workspace_exit_completed(p_workspace_id)
      and (d.system_id is null or exists (select 1 from public.systems s where s.id = d.system_id and s.business_workspace_id = p_workspace_id))
  )
$$;

create function public.list_agency_owner_decisions(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare selected_agency uuid := p_agency_workspace_id; available_agencies uuid[];
begin
  if selected_agency is null then
    select array_agg(distinct seat.agency_workspace_id) into available_agencies from public.provider_seats seat
      join public.agency_client_staff staff on staff.customer_workspace_id = seat.customer_workspace_id
        and staff.agency_workspace_id = seat.agency_workspace_id and staff.user_id = p_user_id and staff.status = 'active'
      join public.workspace_memberships member on member.workspace_id = staff.agency_workspace_id and member.user_id = staff.user_id
      where seat.customer_workspace_id = p_workspace_id and seat.status = 'active';
    if cardinality(available_agencies) is distinct from 1 then raise exception 'owner_decision_access_denied'; end if;
    selected_agency := available_agencies[1];
  end if;
  -- Admission uses the actual staff/seat pair, even when no decisions are open.
  if not exists (select 1 from public.provider_seats seat
      join public.agency_client_staff staff on staff.customer_workspace_id = seat.customer_workspace_id
        and staff.agency_workspace_id = seat.agency_workspace_id and staff.user_id = p_user_id and staff.status = 'active'
      join public.workspace_memberships member on member.workspace_id = staff.agency_workspace_id and member.user_id = staff.user_id
      join public.users actor on actor.id = member.user_id and lower(actor.email) = lower(btrim(p_verified_email)) and actor.verified_at is not null
      join public.workspaces agency on agency.id = seat.agency_workspace_id and agency.kind = 'agency'
      join public.workspaces business on business.id = seat.customer_workspace_id and business.kind = 'customer'
      where seat.customer_workspace_id = p_workspace_id and seat.agency_workspace_id = selected_agency and seat.status = 'active'
        and not public.workspace_exit_completed(p_workspace_id)
        and not exists (select 1 from public.super_admins admin where admin.user_id = p_user_id and admin.revoked_at is null)) then
    raise exception 'owner_decision_access_denied';
  end if;
  return coalesce((select jsonb_agg(public.owner_decision_json(d) order by d.opened_at, d.id)
    from public.owner_decisions d where d.workspace_id = p_workspace_id and d.state = 'open'
      and d.expires_at > statement_timestamp()
      and public.agency_owner_decision_allowed(p_workspace_id, d.id, p_user_id, p_verified_email, selected_agency)), '[]'::jsonb);
end;
$$;

-- Recheck/lock the same authority at claim time. This also prevents stale,
-- changed and already-handled responses disclosing an out-of-scope item.
alter function public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text) rename to claim_owner_decision_before_ux_agency;
revoke all on function public.claim_owner_decision_before_ux_agency(uuid,uuid,text,text,text,uuid,text,text) from public, anon, authenticated, service_role;
create function public.claim_scoped_agency_owner_decision(p_workspace_id uuid, p_decision_id uuid, p_revision_hash text,
  p_decision text, p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.owner_decisions%rowtype; plan jsonb; acting_agency uuid; agency_name text;
begin
  if p_agency_workspace_id is null then raise exception 'owner_decision_owner_only'; end if;
  -- Freeze identity before checking support authority; a new super-admin row
  -- references this user, so its FK insertion cannot race the negative check.
  perform 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null for update;
  if not found then raise exception 'owner_decision_owner_only'; end if;
  perform 1 from public.super_admins where user_id = p_user_id for share;
  select * into item from public.owner_decisions where workspace_id = p_workspace_id and id = p_decision_id for update;
  if not found then raise exception 'owner_decision_not_found'; end if;
  if item.source_lifecycle = 'make_real' then
    select body into plan from public.system_possibilities
      where business_workspace_id = p_workspace_id and id::text = split_part(item.source_id,':',1)
      for share;
  end if;
  if item.source_lifecycle = 'tenant_event' then
    perform 1 from public.unified_events where id::text = split_part(item.source_id,':',2)
      and tenant_id = split_part(item.source_id,':',1) for share;
  end if;
  perform 1 from public.systems s where s.business_workspace_id = p_workspace_id and
    (s.id = item.system_id or (item.source_lifecycle = 'application_release' and item.system_id is null
      and s.origin_kind = 'saved_work' and s.origin_ref = split_part(item.source_id,':',2))
      or (plan is not null and s.id::text in (
      select value->'baseline'->>'systemId' from jsonb_array_elements(plan->'changes')
      union select value->'system'->>'systemId' from jsonb_array_elements(plan->'effects')))) for share;
  perform 1 from public.owner_decisions d
    join public.agency_scope_grants g on g.customer_workspace_id = d.workspace_id
      and g.scope = any(public.agency_owner_decision_scopes(d)) and g.level = 'full_control' and g.status = 'active'
    join public.provider_seats seat on seat.customer_workspace_id = g.customer_workspace_id
      and seat.agency_workspace_id = g.agency_workspace_id and seat.status = 'active'
    join public.agency_client_staff staff on staff.customer_workspace_id = seat.customer_workspace_id
      and staff.agency_workspace_id = seat.agency_workspace_id and staff.user_id = p_user_id and staff.status = 'active'
    join public.workspace_memberships member on member.workspace_id = staff.agency_workspace_id and member.user_id = staff.user_id
    join public.users actor on actor.id = member.user_id
      and lower(actor.email) = lower(btrim(p_verified_email)) and actor.verified_at is not null
    where d.workspace_id = p_workspace_id and d.id = p_decision_id and g.agency_workspace_id = p_agency_workspace_id
    for share of g, seat, staff, member, actor;
  if not found or not public.agency_owner_decision_allowed(p_workspace_id, p_decision_id, p_user_id, p_verified_email, p_agency_workspace_id) then
    raise exception 'owner_decision_owner_only';
  end if;
  select g.agency_workspace_id,
      case when coalesce(nullif(btrim(w.agency_brand->>'displayName'),''),w.name) = 'Strelva' then 'Strelva Agency'
        else coalesce(nullif(btrim(w.agency_brand->>'displayName'),''),w.name) end
    into acting_agency,agency_name from public.agency_scope_grants g
    join public.workspaces w on w.id = g.agency_workspace_id and w.kind = 'agency'
    join public.agency_client_staff staff on staff.agency_workspace_id = g.agency_workspace_id
      and staff.customer_workspace_id = g.customer_workspace_id and staff.user_id = p_user_id and staff.status = 'active'
    where g.customer_workspace_id = p_workspace_id and g.agency_workspace_id = p_agency_workspace_id
      and g.scope = any(public.agency_owner_decision_scopes(item))
      and g.level = 'full_control' and g.status = 'active'
    order by g.scope limit 1 for share of w;
  if p_decision is null or p_decision not in ('approve','not_yet') then raise exception 'owner_decision_invalid'; end if;
  if item.state <> 'open' then
    return jsonb_build_object('status',case when item.state = 'superseded' then 'changed' else 'already_handled' end,'item',public.owner_decision_json(item));
  end if;
  if item.revision_hash is distinct from p_revision_hash then return jsonb_build_object('status','changed','item',public.owner_decision_json(item)); end if;
  if clock_timestamp() >= item.expires_at then return jsonb_build_object('status','expired','item',public.owner_decision_json(item)); end if;
  update public.owner_decisions set state = case when p_decision = 'approve' then 'approved' else 'declined' end,
    decided_at = clock_timestamp(), decided_by_kind = 'agency_session', decided_by = p_user_id::text,
    deciding_actor = jsonb_build_object('kind','agency','agencyId',acting_agency,'userId',p_user_id,'displayName',agency_name)
    where id = item.id returning * into item;
  return jsonb_build_object('status','claimed','item',public.owner_decision_json(item));
end;
$$;

create function public.claim_owner_decision(p_workspace_id uuid, p_decision_id uuid, p_revision_hash text,
  p_decision text, p_by_kind text, p_user_id uuid, p_verified_email text, p_recipient text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare agencies uuid[];
begin
  if p_by_kind = 'agency' then
    -- Legacy callers may proceed only when the actual eligible agency is
    -- unambiguous. The UI uses the explicit scoped RPC below instead.
    select array_agg(distinct g.agency_workspace_id) into agencies from public.agency_scope_grants g
      where g.customer_workspace_id = p_workspace_id and g.status = 'active' and g.level = 'full_control'
        and public.agency_owner_decision_allowed(p_workspace_id,p_decision_id,p_user_id,p_verified_email,g.agency_workspace_id);
    if cardinality(agencies) is distinct from 1 then raise exception 'owner_decision_owner_only'; end if;
    return public.claim_scoped_agency_owner_decision(p_workspace_id,p_decision_id,p_revision_hash,p_decision,p_user_id,p_verified_email,agencies[1]);
  end if;
  return public.claim_owner_decision_before_ux_agency(p_workspace_id,p_decision_id,p_revision_hash,p_decision,p_by_kind,p_user_id,p_verified_email,p_recipient);
end;
$$;

revoke all on function public.agency_system_decision_scope(text) from public, anon, authenticated, service_role;
revoke all on function public.agency_owner_decision_scopes(public.owner_decisions) from public, anon, authenticated, service_role;
revoke all on function public.agency_owner_decision_allowed(uuid,uuid,uuid,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.list_agency_owner_decisions(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid) to service_role;
revoke all on function public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.list_agency_owner_decisions(uuid,uuid,text,uuid) to service_role;
grant execute on function public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text) to service_role;

create table public.ux_agency_decisions_catalog_guard (signature text primary key, definition_hash text not null);
alter table public.ux_agency_decisions_catalog_guard enable row level security;
revoke all on public.ux_agency_decisions_catalog_guard from public, anon, authenticated, service_role;
insert into public.ux_agency_decisions_catalog_guard
  select signature, md5(pg_get_functiondef(signature::regprocedure)) from unnest(array[
    'public.owner_decision_actor_snapshot_guard()',
    'public.owner_decision_json(public.owner_decisions)',
    'public.owner_decision_json_before_ux_agency(public.owner_decisions)',
    'public.open_owner_decision(uuid,jsonb)',
    'public.open_owner_decision_before_ux_agency(uuid,jsonb)',
    'public.agency_system_decision_scope(text)',
    'public.agency_owner_decision_scopes(public.owner_decisions)',
    'public.agency_owner_decision_allowed(uuid,uuid,uuid,text,uuid)',
    'public.list_agency_owner_decisions(uuid,uuid,text,uuid)',
    'public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid)',
    'public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)',
    'public.claim_owner_decision_before_ux_agency(uuid,uuid,text,text,text,uuid,text,text)']) signature;
notify pgrst, 'reload schema';
commit;
