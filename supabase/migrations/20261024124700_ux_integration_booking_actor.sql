-- Prepared UX integration only: retain the selected agency deciding snapshot in
-- booking history. Historical gaps stay null; no current branding backfill.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
alter table public.business_booking_history add column actor_snapshot jsonb;
alter table public.business_booking_history add constraint ux_booking_actor_snapshot_object
  check (actor_snapshot is null or (jsonb_typeof(actor_snapshot) = 'object'
    and actor_snapshot->>'kind' = 'agency' and nullif(btrim(actor_snapshot->>'displayName'),'') is not null));

create function public.decide_scoped_agency_booking_request(p_workspace_id uuid, p_booking_id uuid, p_decision text, p_decision_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.owner_decisions; b public.business_bookings; target text; expected_state text; principal uuid; agency uuid; email text;
begin
  select * into d from public.owner_decisions where id=p_decision_id and workspace_id=p_workspace_id;
  principal := (d.deciding_actor->>'userId')::uuid;
  -- Lock identity before the decision, matching the claim's lock order.
  -- New support grants need the user FK lock and cannot race this refusal.
  perform 1 from public.users where id=principal and verified_at is not null for update;
  if not found then raise exception 'booking_agency_decision_required'; end if;
  perform 1 from public.super_admins where user_id=principal for share;
  select * into d from public.owner_decisions where id=p_decision_id and workspace_id=p_workspace_id for update;
  expected_state := case p_decision when 'approve' then 'approved' when 'not_yet' then 'declined' else '' end;
  if d.id is null or d.source_lifecycle <> 'booking_request' or d.source_id <> p_booking_id::text
    or d.decided_by_kind <> 'agency_session' or coalesce(d.deciding_actor->>'kind','') <> 'agency'
    or nullif(d.deciding_actor->>'agencyId','') is null or nullif(d.deciding_actor->>'userId','') is null
    or d.outcome is not null or d.state <> expected_state
    then raise exception 'booking_agency_decision_required'; end if;
  principal := (d.deciding_actor->>'userId')::uuid; agency := (d.deciding_actor->>'agencyId')::uuid;
  -- Lock the same current authority rows before the effect. A captured name is
  -- historical evidence, never a substitute for a still-active selected grant.
  perform 1 from public.agency_scope_grants g
    join public.provider_seats seat on seat.customer_workspace_id=g.customer_workspace_id and seat.agency_workspace_id=g.agency_workspace_id
    join public.agency_client_staff staff on staff.customer_workspace_id=seat.customer_workspace_id and staff.agency_workspace_id=seat.agency_workspace_id and staff.user_id=principal
    join public.workspace_memberships member on member.workspace_id=staff.agency_workspace_id and member.user_id=staff.user_id
    join public.users actor on actor.id=member.user_id
    join public.workspaces agency_row on agency_row.id=g.agency_workspace_id
    join public.workspaces business on business.id=g.customer_workspace_id
    where g.customer_workspace_id=p_workspace_id and g.agency_workspace_id=agency and g.scope='bookings'
    for share of g,seat,staff,member,actor,agency_row,business;
  select u.email into email from public.users u where u.id=principal;
  if not public.agency_owner_decision_allowed(p_workspace_id,p_decision_id,principal,email,agency) then
    raise exception 'booking_agency_access_denied'; end if;
  select * into b from public.business_bookings where id=p_booking_id and workspace_id=p_workspace_id for update;
  if b.id is null then raise exception 'booking_not_found'; end if;
  if b.status <> 'requested' then return jsonb_build_object('status','already_decided','booking',public.booking_json(b)); end if;
  target := case p_decision when 'approve' then 'confirmed' else 'declined' end;
  update public.business_bookings set status=target,updated_at=clock_timestamp() where id=b.id returning * into b;
  insert into public.business_booking_history(booking_id,actor,actor_snapshot,from_status,to_status,reason)
    values(b.id,'member',d.deciding_actor,'requested',target,case p_decision when 'approve' then 'Agency approved' else 'Agency said not yet' end);
  return jsonb_build_object('status','decided','booking',public.booking_json(b));
end $$;
revoke all on function public.decide_scoped_agency_booking_request(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.decide_scoped_agency_booking_request(uuid,uuid,text,uuid) to service_role;

alter function public.read_workspace_booking(uuid,uuid) rename to read_workspace_booking_before_ux_booking_actor;
revoke all on function public.read_workspace_booking_before_ux_booking_actor(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.read_workspace_booking(p_workspace_id uuid, p_booking_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.booking_json(b) || jsonb_build_object('lastChange', (
      select jsonb_build_object('actor', h.actor, 'actorSnapshot', h.actor_snapshot, 'from', h.from_status, 'to', h.to_status, 'reason', h.reason)
      from public.business_booking_history h where h.booking_id = b.id order by h.at desc, h.id desc limit 1))
  from public.business_bookings b
  where p_workspace_id is not null and b.id = p_booking_id and b.workspace_id = p_workspace_id
$$;
revoke all on function public.read_workspace_booking(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_workspace_booking(uuid,uuid) to service_role;

alter function public.read_tenant_booking_history(text,text) rename to read_tenant_booking_history_before_ux_booking_actor;
revoke all on function public.read_tenant_booking_history_before_ux_booking_actor(text,text) from public,anon,authenticated,service_role;
create or replace function public.read_tenant_booking_history(p_tenant_id text, p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_id uuid;
begin
  select coalesce(tenant_stable_id,workspace_id) into v_stable from public.booking_tenant(p_tenant_id);
  if v_stable is null then return '[]'::jsonb; end if;
  select id into v_id from public.business_bookings b where (b.calendar_key = v_stable or (b.tenant_stable_id is null and b.workspace_id=(select workspace_id from public.booking_tenant(p_tenant_id)))) and (b.legacy_id = p_ref or b.id::text = p_ref) limit 1;
  if v_id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('actor', h.actor, 'actorSnapshot', h.actor_snapshot, 'from', h.from_status, 'to', h.to_status, 'reason', h.reason,
      'at', to_char(h.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by h.at, h.id)
    from public.business_booking_history h where h.booking_id = v_id), '[]'::jsonb);
end;
$$;
revoke all on function public.read_tenant_booking_history(text,text) from public,anon,authenticated;
grant execute on function public.read_tenant_booking_history(text,text) to service_role;

alter function public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date) rename to read_workspace_booking_evidence_before_ux_booking_actor;
revoke all on function public.read_workspace_booking_evidence_before_ux_booking_actor(uuid,uuid,text,text,date,date) from public,anon,authenticated,service_role;
create or replace function public.read_workspace_booking_evidence(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_stable uuid; v_out jsonb; v_health text;
begin
  perform public.read_workspace_tenant_links(p_workspace_id,p_user_id,p_verified_email);
  select coalesce(tenant_stable_id,workspace_id) into v_stable from public.booking_tenant(p_tenant_id) where workspace_id=p_workspace_id;
  if v_stable is null then raise exception 'workspace_access_denied'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>6 then raise exception 'booking_invalid'; end if;
  select case when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status='connected' and calendar_id<>'pending') then 'connected'
    when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status in ('error','revoked')) then 'reconnect'
    when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status='authorized') then 'setup'
    else 'not_connected' end into v_health;
  with selected as (
    select b.* from public.business_bookings b where (b.calendar_key=v_stable or (b.tenant_stable_id is null and b.workspace_id=p_workspace_id and p_tenant_id=(select t.id from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id where l.workspace_id=p_workspace_id order by l.linked_at,t.id limit 1)))
      and (b.start_at at time zone b.time_zone)::date between p_from and p_to
      order by b.start_at,b.id limit 501
  ), visible as (select * from selected order by start_at,id limit 500)
  select jsonb_build_object('calendarHealth',v_health,'truncated',(select count(*)>500 from selected),
    'bookings',coalesce(jsonb_agg(jsonb_build_object('booking',public.booking_json(b),
      'calendar',(select jsonb_build_object('status',case when m.status='verified' and b.status in ('confirmed','cancelled') and m.updated_at<b.updated_at then 'unknown' else m.status end,'updatedAt',m.updated_at) from public.business_booking_calendar_mirrors m where m.booking_id=b.id),
      'history',coalesce((select jsonb_agg(e.entry order by e.at,e.id) from (
        select * from (
          select h.at,h.id,jsonb_build_object('kind','change','actor',h.actor,'actorSnapshot',h.actor_snapshot,'from',h.from_status,'to',h.to_status,'reason',h.reason,'at',h.at) entry
          from public.business_booking_history h where h.booking_id=b.id
          union all
          select coalesce(m.finished_at,m.claimed_at),m.id,jsonb_build_object('kind','reminder','reminder',m.kind,'status',m.status,'at',coalesce(m.finished_at,m.claimed_at))
          from public.business_booking_messages m where m.booking_id=b.id
        ) events order by at desc,id desc limit 50
      ) e),'[]'::jsonb),
      'historyTruncated',(select count(*) from public.business_booking_history h where h.booking_id=b.id)+(select count(*) from public.business_booking_messages m where m.booking_id=b.id)>50
    ) order by b.start_at,b.id),'[]'::jsonb)) into v_out from visible b;
  return v_out;
end $$;
revoke all on function public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date) from public,anon,authenticated;
grant execute on function public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date) to service_role;

alter function public.read_strelva_handled(uuid,uuid,text,timestamptz) rename to read_strelva_handled_before_ux_booking_actor;
revoke all on function public.read_strelva_handled_before_ux_booking_actor(uuid,uuid,text,timestamptz) from public,anon,authenticated,service_role;
create function public.read_strelva_handled(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_since timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb;
begin
  rows := public.read_strelva_handled_before_ux_booking_actor(p_workspace_id,p_user_id,p_verified_email,p_since);
  return coalesce((select jsonb_agg(case when e->>'store'='owner_decisions' then e || jsonb_build_object('decidedActor',d.deciding_actor) else e end order by n)
    from jsonb_array_elements(rows) with ordinality entries(e,n)
    left join public.owner_decisions d on e->>'store'='owner_decisions' and d.id::text=e->>'id' and d.workspace_id=p_workspace_id),'[]'::jsonb);
end $$;
revoke all on function public.read_strelva_handled(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.read_strelva_handled(uuid,uuid,text,timestamptz) to service_role;
create table public.ux_booking_actor_catalog_guard(signature text primary key,definition_hash text not null);
alter table public.ux_booking_actor_catalog_guard enable row level security;
revoke all on public.ux_booking_actor_catalog_guard from public,anon,authenticated,service_role;
insert into public.ux_booking_actor_catalog_guard select signature,md5(pg_get_functiondef(to_regprocedure(signature))) from unnest(array[
  'public.decide_scoped_agency_booking_request(uuid,uuid,text,uuid)',
  'public.read_workspace_booking(uuid,uuid)',
  'public.read_tenant_booking_history(text,text)',
  'public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date)',
  'public.read_strelva_handled(uuid,uuid,text,timestamptz)',
  'public.read_workspace_booking_before_ux_booking_actor(uuid,uuid)',
  'public.read_tenant_booking_history_before_ux_booking_actor(text,text)',
  'public.read_workspace_booking_evidence_before_ux_booking_actor(uuid,uuid,text,text,date,date)',
  'public.read_strelva_handled_before_ux_booking_actor(uuid,uuid,text,timestamptz)']) signature;
commit;
