-- Inquiry → booking requests. Additive, callers off by default; no email or provider writes.
set local lock_timeout = '3s';
create table public.inquiry_booking_offers (
  id uuid primary key default gen_random_uuid(),
  lead_row_id uuid not null references public.tenant_leads(id) on delete cascade,
  service_id uuid not null, -- immutable service identity survives removal; witness then refuses new bookings
  witness jsonb not null,
  slots jsonb not null check(jsonb_typeof(slots)='array' and jsonb_array_length(slots) between 1 and 3),
  service_name text not null,
  time_zone text not null,
  requested_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours'
);
create index inquiry_booking_offers_lead_idx on public.inquiry_booking_offers(lead_row_id,created_at desc);
alter table public.inquiry_booking_offers enable row level security;
revoke all on public.inquiry_booking_offers from public,anon,authenticated,service_role;

-- Standalone calendars use the workspace as calendar_key in the same store.
create function public.read_inquiry_workspace_booking_context(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('tenantStableId',null,'workspaceId',p_workspace_id,'systemId',s.id,'paused',coalesce(s.lifecycle='paused',false),
 'hours',(select value from public.business_record_facts where workspace_id=p_workspace_id and fact_key='hours'),
 'phone',(select value from public.business_record_facts where workspace_id=p_workspace_id and fact_key='phone'),
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'durationMinutes',x.duration_minutes,'active',x.active,'externalRef',x.external_ref) order by x.position,x.id) from public.business_services x where x.workspace_id=p_workspace_id),'[]'::jsonb),
 'settings',case when b.calendar_key is null then null else jsonb_build_object('mode',b.mode,'bufferMinutes',b.buffer_minutes,'minNoticeMinutes',b.min_notice_minutes,'maxAdvanceDays',b.max_advance_days,'defaultLengthMinutes',b.default_length_minutes,'maxPerDay',b.max_per_day,'timezone',b.timezone,'bookableHours',b.bookable_hours,'bookableOverrides',b.bookable_overrides,'legacyRequiresPayment',b.legacy_requires_payment,'revision',b.revision) end)
 from (select 1) anchor left join lateral(select id,lifecycle from public.systems where business_workspace_id=p_workspace_id and kind='booking' order by created_at,id limit 1) s on true
 left join public.booking_settings b on b.calendar_key=p_workspace_id and b.tenant_stable_id is null
$$;
create function public.read_inquiry_workspace_bookings(p_workspace_id uuid,p_from date,p_to date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(public.booking_json(b) order by b.start_at,b.id),'[]'::jsonb) from public.business_bookings b
 where calendar_key=p_workspace_id and tenant_stable_id is null and workspace_id=p_workspace_id
 and (p_from is null or (b.start_at at time zone b.time_zone)::date>=p_from)
 and (p_to is null or (b.start_at at time zone b.time_zone)::date<=p_to)
$$;

-- Locks serialize against pause/revoke, record edits, settings edits and inquiry spam review.
create function public.inquiry_booking_witness(p_tenant_id text,p_inquiry_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.tenant_leads; c jsonb; st jsonb; cap jsonb; b public.offering_website_bindings; cs public.connected_sites;
begin
  if p_tenant_id is null then
    select * into l from public.tenant_leads where id=p_inquiry_id::uuid and tenant_stable_id is null and connected_site_id is not null for share;
  else
    select * into l from public.tenant_leads where tenant_stable_id=(select stable_id from public.tenants where id=p_tenant_id and active) and lead_id=p_inquiry_id for share;
  end if;
  if not found or l.workspace_id is null or l.intake_state not in ('kept','released') or not coalesce(public.business_record_email_valid(l.email),false)
    then raise exception 'inquiry_booking_unavailable'; end if;
  if public.workspace_exit_completed(l.workspace_id) then raise exception 'inquiry_booking_unavailable'; end if;
  if l.tenant_stable_id is not null then
  perform 1 from public.tenant_workspace_links where tenant_stable_id=l.tenant_stable_id and workspace_id=l.workspace_id for share;
  if not found then raise exception 'inquiry_booking_unavailable'; end if;
  select * into b from public.offering_website_bindings where tenant_stable_id=l.tenant_stable_id
    and business_workspace_id=l.workspace_id and status='active' for share;
  if not found then raise exception 'inquiry_booking_unavailable'; end if;
  else
    select * into cs from public.connected_sites where id=l.connected_site_id and business_workspace_id=l.workspace_id and status='active' and verified_at is not null for share;
    if not found then raise exception 'inquiry_booking_unavailable'; end if;
  end if;
  select state into st from public.inquiry_workspaces where tenant_stable_id=l.tenant_stable_id for share;
  if l.capability_id is not null then
    select item into cap from jsonb_array_elements(coalesce(st->'capabilities','[]'::jsonb)) item where item->>'id'=l.capability_id;
    if cap is null or cap->>'status' not in ('live','live_unverified') or cap->'live'->>'version' is distinct from l.capability_version::text then
      raise exception 'inquiry_booking_unavailable'; end if;
  elsif exists(select 1 from jsonb_array_elements(coalesce(st->'capabilities','[]'::jsonb)) item where item->>'status'='paused') then
    raise exception 'inquiry_booking_unavailable';
  end if;
  if exists(select 1 from public.inquiry_record_overlays where tenant_stable_id=l.tenant_stable_id and inquiry_id=l.lead_id and status in ('handled','blocked')) then raise exception 'inquiry_booking_unavailable'; end if;
  perform 1 from public.systems where business_workspace_id=l.workspace_id and kind in ('booking','inquiry') for share;
  if exists(select 1 from public.systems where business_workspace_id=l.workspace_id and kind='inquiry' and lifecycle='paused') then raise exception 'inquiry_booking_unavailable'; end if;
  perform 1 from public.booking_settings where calendar_key=coalesce(l.tenant_stable_id,l.workspace_id) for share;
  perform 1 from public.business_services where workspace_id=l.workspace_id for share;
  perform 1 from public.business_record_facts where workspace_id=l.workspace_id and fact_key='hours' for share;
  c:=case when l.tenant_stable_id is null then public.read_inquiry_workspace_booking_context(l.workspace_id) else public.read_tenant_booking_context(p_tenant_id) end;
  if c->>'workspaceId' is distinct from l.workspace_id::text or c->>'systemId' is null or not exists(select 1 from public.systems where id=(c->>'systemId')::uuid and lifecycle='live') or c->>'paused'='true' or c#>>'{settings,mode}' is distinct from 'request' then
    raise exception 'inquiry_booking_unavailable'; end if;
  return jsonb_build_object('bookingRevision',(select jsonb_build_object('revisionId',current_revision_id,'changeNumber',change_number) from public.systems where id=(c->>'systemId')::uuid),'context',c,'leadRowId',l.id,'lead',jsonb_build_object('id',l.lead_id,'name',l.name,'email',l.email,
    'fields',l.fields,'capabilityId',l.capability_id,'capabilityVersion',l.capability_version),'bindingId',coalesce(b.id,cs.id),'bindingRevision',case when b.id is not null then to_jsonb(b.revision) else to_jsonb(cs.updated_at) end);
end $$;
create function public.inquiry_booking_offer_json(o public.inquiry_booking_offers) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',o.id,'serviceId',o.service_id,'expiresAt',to_char(o.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'serviceName',o.service_name,'timeZone',o.time_zone,'slots',o.slots,'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'durationMinutes',s.duration_minutes) order by s.position,s.id) from public.business_services s where s.workspace_id=(select l.workspace_id from public.tenant_leads l where l.id=o.lead_row_id) and s.active),'[]'::jsonb))
$$;
create function public.resolve_workspace_inquiry_booking_lead(p_workspace_id uuid,p_row_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.tenant_leads;
begin
  if public.inquiry_assert_member(p_workspace_id,p_user_id,p_verified_email)<>'owner' then raise exception 'inquiry_access_denied'; end if;
  select * into l from public.tenant_leads where id=p_row_id and workspace_id=p_workspace_id;
  if not found or (l.tenant_stable_id is not null and not exists(select 1 from public.memberships where user_id=p_user_id and tenant_stable_id=l.tenant_stable_id)) then raise exception 'inquiry_access_denied'; end if;
  return jsonb_build_object('tenantId',(select id from public.tenants where stable_id=l.tenant_stable_id),'inquiryId',case when l.tenant_stable_id is null then l.id::text else l.lead_id end,'workspaceId',l.workspace_id);
end $$;
create function public.read_inquiry_booking_handoff(p_tenant_id text,p_inquiry_id text,p_workspace_id uuid,p_row_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w jsonb; o public.inquiry_booking_offers;
begin
  w:=public.inquiry_booking_witness(p_tenant_id,p_inquiry_id);
  if p_user_id is not null then
    perform public.resolve_workspace_inquiry_booking_lead(p_workspace_id,p_row_id,p_user_id,p_verified_email);
    if w->>'leadRowId' is distinct from p_row_id::text or w#>>'{context,workspaceId}' is distinct from p_workspace_id::text then raise exception 'inquiry_access_denied'; end if;
  end if;
  select * into o from public.inquiry_booking_offers where lead_row_id=(w->>'leadRowId')::uuid and witness=w and expires_at>clock_timestamp() order by created_at desc limit 1;
  return jsonb_build_object('context',w->'context','witness',w,'offer',case when o.id is null then null else public.inquiry_booking_offer_json(o) end);
end $$;
create function public.prepare_inquiry_booking_offer(p_tenant_id text,p_inquiry_id text,p_witness jsonb,p_service_id uuid,p_slots jsonb,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w jsonb; o public.inquiry_booking_offers; s public.business_services; x jsonb; expiry timestamptz;
begin
  w:=public.inquiry_booking_witness(p_tenant_id,p_inquiry_id);
  if w is distinct from p_witness then raise exception 'inquiry_booking_changed'; end if;
  if p_user_id is not null then perform public.resolve_workspace_inquiry_booking_lead((w#>>'{context,workspaceId}')::uuid,(w->>'leadRowId')::uuid,p_user_id,p_verified_email); end if;
  select * into s from public.business_services where id=p_service_id and workspace_id=(w#>>'{context,workspaceId}')::uuid and active;
  if not found or p_slots is null or jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots) not between 1 and 3 then raise exception 'inquiry_record_invalid'; end if;
  expiry:=clock_timestamp()+interval '24 hours';
  for x in select value from jsonb_array_elements(p_slots) loop
    if (x->>'start')::timestamptz<=clock_timestamp() or (x->>'end')::timestamptz<>(x->>'start')::timestamptz+make_interval(mins=>coalesce(s.duration_minutes,(w#>>'{context,settings,defaultLengthMinutes}')::integer)) then raise exception 'inquiry_record_invalid'; end if;
    expiry:=least(expiry,(x->>'start')::timestamptz);
  end loop;
  -- Stable saved choice makes email approval and send hash exactly the same links.
  perform pg_advisory_xact_lock(hashtextextended(w->>'leadRowId',9140));
  select * into o from public.inquiry_booking_offers where lead_row_id=(w->>'leadRowId')::uuid and witness=w and service_id=p_service_id and slots=p_slots and expires_at>clock_timestamp() order by created_at desc limit 1;
  if not found then
    insert into public.inquiry_booking_offers(lead_row_id,service_id,witness,slots,service_name,time_zone,requested_by,expires_at)
      values((w->>'leadRowId')::uuid,p_service_id,w,p_slots,s.name,coalesce(w#>>'{context,hours,timezone}',w#>>'{context,settings,timezone}'),p_user_id,expiry) returning * into o;
  end if;
  return public.inquiry_booking_offer_json(o);
end $$;
create function public.read_inquiry_booking_offer(p_offer_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.inquiry_booking_offers; l public.tenant_leads; t text; w jsonb; b public.business_bookings;
begin
  select * into o from public.inquiry_booking_offers where id=p_offer_id and expires_at>clock_timestamp();
  if not found then return null; end if;
  select * into l from public.tenant_leads where id=o.lead_row_id;
  select id into t from public.tenants where stable_id=l.tenant_stable_id;
  select * into b from public.business_bookings where calendar_key=coalesce(l.tenant_stable_id,l.workspace_id) and inquiry_id=case when l.tenant_stable_id is null then l.id::text else l.lead_id end and origin='inquiry' order by created_at limit 1;
  -- Already issued request remains readable after pause or edits. GET never writes.
  if b.id is null then
    w:=public.inquiry_booking_witness(t,case when l.tenant_stable_id is null then l.id::text else l.lead_id end);
    if w is distinct from o.witness then raise exception 'inquiry_booking_changed'; end if;
  else w:=o.witness; end if;
  return jsonb_build_object('tenantId',t,'workspaceId',l.workspace_id,'context',w->'context','offer',public.inquiry_booking_offer_json(o),'booking',case when b.id is null then null else public.booking_json(b) end);
end $$;
-- Only the chosen signed offer calls this; it uses the shared exclusion, history,
-- contact and Needs you rows. It never accepts an arbitrary customer commitment.
create function public.record_workspace_inquiry_booking(p_row_id uuid,p_service_id uuid,p_slot jsonb,p_witness jsonb,p_time_zone text,p_service_name text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.tenant_leads; b public.business_bookings; contact uuid; buffer integer; v_created timestamptz:=clock_timestamp();
begin
  select * into l from public.tenant_leads where id=p_row_id and tenant_stable_id is null for share;
  if not found or public.inquiry_booking_witness(null,l.id::text) is distinct from p_witness then raise exception 'inquiry_booking_changed'; end if;
  buffer:=(p_witness#>>'{context,settings,bufferMinutes}')::integer;
  perform pg_advisory_xact_lock(hashtextextended(l.workspace_id::text,9106));
  select * into b from public.business_bookings where calendar_key=l.workspace_id and origin='inquiry' and inquiry_id=l.id::text limit 1;
  if found then return public.booking_json(b); end if;
  -- Match the same email contact captured with the inquiry; source is additive.
  if l.contact_id is not null then
    update public.business_contacts set sources=case when 'booking'=any(sources) then sources else sources||array['booking'] end,last_seen_at=greatest(last_seen_at,v_created),updated_at=v_created where id=l.contact_id and workspace_id=l.workspace_id returning id into contact;
  end if;
  if contact is null then
  insert into public.business_contacts as c(workspace_id,name,email,sources,first_seen_at,last_seen_at)
    values(l.workspace_id,left(l.name,160),lower(btrim(l.email)),array['booking'],v_created,v_created)
    on conflict(workspace_id,email) where email is not null do update set
      sources=case when 'booking'=any(c.sources) then c.sources else c.sources||array['booking'] end,last_seen_at=greatest(c.last_seen_at,excluded.last_seen_at),updated_at=v_created returning id into contact;
  end if;
  begin
    insert into public.business_bookings(calendar_key,workspace_id,system_id,status,origin,business_service_id,service_ref,service_name_at_booking,start_at,end_at,buffer_minutes,block_end_at,time_zone,customer_name,customer_email,contact_id,intake_answers,inquiry_id,recorded_via,created_at)
      values(l.workspace_id,l.workspace_id,(p_witness#>>'{context,systemId}')::uuid,'requested','inquiry',p_service_id,p_service_id::text,p_service_name,(p_slot->>'start')::timestamptz,(p_slot->>'end')::timestamptz,buffer,(p_slot->>'end')::timestamptz+make_interval(mins=>buffer),p_time_zone,left(l.name,160),lower(btrim(l.email)),contact,coalesce(l.fields,'{}'::jsonb),l.id::text,'native',v_created) returning * into b;
  exception when exclusion_violation then return null; end;
  insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason) values(b.id,'visitor',null,'requested','Requested from an inquiry');
  return public.booking_json(b);
end $$;

create function public.choose_inquiry_booking_slot(p_offer_id uuid,p_slot_index integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.inquiry_booking_offers; l public.tenant_leads; w jsonb; t text; x jsonb; b public.business_bookings; result jsonb; sr text;
begin
  select * into o from public.inquiry_booking_offers where id=p_offer_id and expires_at>clock_timestamp() for share;
  if not found then raise exception 'inquiry_booking_unavailable'; end if;
  select * into l from public.tenant_leads where id=o.lead_row_id for share;
  perform pg_advisory_xact_lock(hashtextextended(l.id::text,9140));
  select * into b from public.business_bookings where calendar_key=coalesce(l.tenant_stable_id,l.workspace_id) and inquiry_id=case when l.tenant_stable_id is null then l.id::text else l.lead_id end and origin='inquiry' order by created_at limit 1;
  if found then return public.booking_json(b); end if;
  select id into t from public.tenants where stable_id=l.tenant_stable_id;
  w:=public.inquiry_booking_witness(t,case when l.tenant_stable_id is null then l.id::text else l.lead_id end);
  if w is distinct from o.witness then raise exception 'inquiry_booking_changed'; end if;
  if p_slot_index is null or p_slot_index<0 or p_slot_index>=jsonb_array_length(o.slots) then raise exception 'inquiry_record_invalid'; end if;
  x:=o.slots->p_slot_index;
  if (x->>'start')::timestamptz<clock_timestamp()+make_interval(mins=>(w#>>'{context,settings,minNoticeMinutes}')::integer) then raise exception 'inquiry_booking_changed'; end if;
  select coalesce(external_ref,id::text) into sr from public.business_services where id=o.service_id and active;
  if sr is null then raise exception 'inquiry_booking_changed'; end if;
  if l.tenant_stable_id is null then
    return public.record_workspace_inquiry_booking(l.id,o.service_id,x,w,o.time_zone,o.service_name);
  end if;
  result:=public.record_tenant_booking(t,jsonb_build_object('id',gen_random_uuid(),'status','requested','origin','inquiry',
    'serviceRef',sr,'serviceName',o.service_name,'start',x->>'start','end',x->>'end',
    'bufferMinutes',(w#>>'{context,settings,bufferMinutes}')::integer,'timeZone',o.time_zone,
    'customer',jsonb_build_object('name',l.name,'email',l.email),'intakeAnswers',coalesce(l.fields,'{}'::jsonb),'inquiryId',l.lead_id),'native');
  if result->>'status'='conflict' then return null; end if;
  update public.business_bookings set business_service_id=o.service_id,contact_id=coalesce(l.contact_id,contact_id) where id=(result#>>'{booking,id}')::uuid;
  select * into b from public.business_bookings where id=(result#>>'{booking,id}')::uuid;
  return public.booking_json(b);
end $$;
revoke all on function public.read_inquiry_workspace_booking_context(uuid),public.record_workspace_inquiry_booking(uuid,uuid,jsonb,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function public.read_inquiry_workspace_bookings(uuid,date,date) from public,anon,authenticated;
grant execute on function public.read_inquiry_workspace_bookings(uuid,date,date) to service_role;
revoke all on function public.inquiry_booking_witness(text,text),public.inquiry_booking_offer_json(public.inquiry_booking_offers) from public,anon,authenticated,service_role;
revoke all on function public.resolve_workspace_inquiry_booking_lead(uuid,uuid,uuid,text),public.read_inquiry_booking_handoff(text,text,uuid,uuid,uuid,text),
 public.prepare_inquiry_booking_offer(text,text,jsonb,uuid,jsonb,uuid,text),public.read_inquiry_booking_offer(uuid),public.choose_inquiry_booking_slot(uuid,integer) from public,anon,authenticated;
grant execute on function public.resolve_workspace_inquiry_booking_lead(uuid,uuid,uuid,text),public.read_inquiry_booking_handoff(text,text,uuid,uuid,uuid,text),
 public.prepare_inquiry_booking_offer(text,text,jsonb,uuid,jsonb,uuid,text),public.read_inquiry_booking_offer(uuid),public.choose_inquiry_booking_slot(uuid,integer) to service_role;
