-- Bookings, inquiries and the linked-site overlay read only the
-- owner-confirmed copy (#509, PR #523 round 3). The booking and inquiry
-- readers from wave 6 read the working record directly, so an operator's
-- pending edit reached customers with no owner decision:
--   read_tenant_booking_context_before_service_policy
--                       hours, phone, services: public availability, the
--                       MCP/agent booking tools, booking pages.
--   read_booking_business_details
--                       name, address: booking emails and calendar files.
--   read_inquiry_workspace_booking_context, inquiry_booking_offer_json,
--   prepare_inquiry_booking_offer
--                       hours, services, the offered service's name and
--                       length: inquiry booking offers sent to customers.
--   read_tenant_business_context
--                       facts and services overlaid on a linked client
--                       site's /api/v1 content (it served operator-sourced
--                       rows as confirmed).
--   read_inquiry_business_context
--                       service choices on the public inquiry form, and the
--                       hours that decide out-of-hours handling.
-- Now each reads business_record_confirmed through two internal helpers,
-- with the same output shape. A fact or service the owner never confirmed
-- is absent; with no confirmed hours or services, a converted site's booking
-- page keeps its own services and settings hours, as an unconverted site
-- does. Booking policies, settings and calendar identity are the owner's
-- booking setup and are unchanged. A service whose record row was removed
-- (a pending deletion) can't be booked or linked, so booking and inquiry
-- offers leave it out; its confirmed content is never replaced by the
-- working copy.
--
-- Rollback: rollback-20261013115000_booking_reads_confirmed_facts.sql
-- restores the earlier bodies exactly and drops the helpers. Roll back
-- 20261013120000 (if applied) first; roll this back before
-- 20261013110000 and 20261011133700.
begin;
set local lock_timeout = '3s';

-- The confirmed copy, one row per fact or service. Internal: only the
-- readers below call these.
create function public.business_confirmed_facts(p_workspace_id uuid)
returns table(fact_key text, value jsonb, verified boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.entity_id, c.state->'value', coalesce((c.state->>'verified')::boolean, false)
  from public.business_record_confirmed c
  where c.workspace_id = p_workspace_id and c.entity = 'fact'
$$;
revoke all on function public.business_confirmed_facts(uuid) from public, anon, authenticated, service_role;

create function public.business_confirmed_services(p_workspace_id uuid)
returns table(id uuid, name text, description text, duration_minutes integer, price_text text,
  active boolean, verified boolean, "position" integer, external_ref text)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.entity_id::uuid, c.state->>'name', c.state->>'description', (c.state->>'durationMinutes')::integer,
    c.state->>'priceText', coalesce((c.state->>'active')::boolean, false), coalesce((c.state->>'verified')::boolean, false),
    (c.state->>'position')::integer, c.state->>'externalRef'
  from public.business_record_confirmed c
  where c.workspace_id = p_workspace_id and c.entity = 'service'
$$;
revoke all on function public.business_confirmed_services(uuid) from public, anon, authenticated, service_role;

create or replace function public.read_tenant_booking_context_before_service_policy(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v record;
  v_settings public.booking_settings;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  if coalesce(v.tenant_stable_id,v.workspace_id) is null then return null; end if;
  select * into v_settings from public.booking_settings where calendar_key = coalesce(v.tenant_stable_id,v.workspace_id);
  return jsonb_build_object(
    'tenantStableId', v.tenant_stable_id,'calendarKey',coalesce(v.tenant_stable_id,v.workspace_id),
    'workspaceId', v.workspace_id,
    'systemId', v.system_id,
    'paused', coalesce(v.system_lifecycle = 'paused', false),
    'hours', (select f.value from public.business_confirmed_facts(v.workspace_id) f where f.fact_key = 'hours'),
    'phone', (select f.value from public.business_confirmed_facts(v.workspace_id) f where f.fact_key = 'phone'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'durationMinutes', s.duration_minutes,
        'active', s.active, 'externalRef', s.external_ref) order by s.position, s.id)
      from public.business_confirmed_services(v.workspace_id) s
      where exists (select 1 from public.business_services r where r.id = s.id and r.workspace_id = v.workspace_id)), '[]'::jsonb),
    'settings', case when v_settings.calendar_key is null then null else jsonb_build_object(
      'mode', v_settings.mode,
      'bufferMinutes', v_settings.buffer_minutes,
      'minNoticeMinutes', v_settings.min_notice_minutes,
      'maxAdvanceDays', v_settings.max_advance_days,
      'defaultLengthMinutes', v_settings.default_length_minutes,
      'maxPerDay', v_settings.max_per_day,
      'timezone', v_settings.timezone,
      'bookableHours', v_settings.bookable_hours,
      'bookableOverrides', v_settings.bookable_overrides,
      'legacyRequiresPayment', v_settings.legacy_requires_payment,
      'revision', v_settings.revision) end
  );
end;
$$;

create or replace function public.read_booking_business_details(p_tenant_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('name',coalesce((select f.value#>>'{}' from public.business_confirmed_facts(v.workspace_id) f where f.fact_key='display_name'),t.site_name,w.name),
   'address',(select coalesce(f.value->>'formatted',concat_ws(', ',f.value->>'line1',f.value->>'line2',f.value->>'city',f.value->>'region',f.value->>'postalCode'))
     from public.business_confirmed_facts(v.workspace_id) f where f.fact_key='address'))
 from public.booking_tenant(p_tenant_id) v left join public.tenants t on t.stable_id=v.tenant_stable_id left join public.workspaces w on w.id=v.workspace_id
$$;

create or replace function public.read_inquiry_workspace_booking_context(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('tenantStableId',null,'workspaceId',p_workspace_id,'systemId',s.id,'paused',coalesce(s.lifecycle='paused',false),
 'hours',(select value from public.business_confirmed_facts(p_workspace_id) where fact_key='hours'),
 'phone',(select value from public.business_confirmed_facts(p_workspace_id) where fact_key='phone'),
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'durationMinutes',x.duration_minutes,'active',x.active,'externalRef',x.external_ref) order by x.position,x.id)
   from public.business_confirmed_services(p_workspace_id) x where exists(select 1 from public.business_services r where r.id=x.id and r.workspace_id=p_workspace_id)),'[]'::jsonb),
 'settings',case when b.calendar_key is null then null else jsonb_build_object('mode',b.mode,'bufferMinutes',b.buffer_minutes,'minNoticeMinutes',b.min_notice_minutes,'maxAdvanceDays',b.max_advance_days,'defaultLengthMinutes',b.default_length_minutes,'maxPerDay',b.max_per_day,'timezone',b.timezone,'bookableHours',b.bookable_hours,'bookableOverrides',b.bookable_overrides,'legacyRequiresPayment',b.legacy_requires_payment,'revision',b.revision) end)
 from (select 1) anchor left join lateral(select id,lifecycle from public.systems where business_workspace_id=p_workspace_id and kind='booking' order by created_at,id limit 1) s on true
 left join public.booking_settings b on b.calendar_key=p_workspace_id and b.tenant_stable_id is null
$$;

create or replace function public.inquiry_booking_offer_json(o public.inquiry_booking_offers) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',o.id,'serviceId',o.service_id,'expiresAt',to_char(o.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'serviceName',o.service_name,'timeZone',o.time_zone,'slots',o.slots,'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'durationMinutes',s.duration_minutes) order by s.position,s.id)
    from public.tenant_leads l cross join lateral public.business_confirmed_services(l.workspace_id) s
    where l.id=o.lead_row_id and s.active and exists(select 1 from public.business_services r where r.id=s.id and r.workspace_id=l.workspace_id)),'[]'::jsonb))
$$;

-- The offered service, its name and its length are the confirmed ones.
create or replace function public.prepare_inquiry_booking_offer(p_tenant_id text,p_inquiry_id text,p_witness jsonb,p_service_id uuid,p_slots jsonb,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w jsonb; o public.inquiry_booking_offers; s record; x jsonb; expiry timestamptz;
begin
  w:=public.inquiry_booking_witness(p_tenant_id,p_inquiry_id);
  if w is distinct from p_witness then raise exception 'inquiry_booking_changed'; end if;
  if p_user_id is not null then perform public.resolve_workspace_inquiry_booking_lead((w#>>'{context,workspaceId}')::uuid,(w->>'leadRowId')::uuid,p_user_id,p_verified_email); end if;
  select c.* into s from public.business_confirmed_services((w#>>'{context,workspaceId}')::uuid) c
    where c.id=p_service_id and c.active
      and exists(select 1 from public.business_services r where r.id=c.id and r.workspace_id=(w#>>'{context,workspaceId}')::uuid and r.active);
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

-- Same keys as before; confirmed facts and confirmed active services only.
create or replace function public.read_tenant_business_context(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_workspace uuid; v_revision bigint;
begin
  select l.workspace_id into v_workspace from public.tenant_workspace_links l
    join public.tenants t on t.stable_id = l.tenant_stable_id where t.id = p_tenant_id;
  if v_workspace is null then return null; end if;
  select revision into v_revision from public.business_records where workspace_id = v_workspace;
  return jsonb_build_object('revision', coalesce(v_revision, 0),
    'facts', coalesce((select jsonb_object_agg(f.fact_key, f.value) from public.business_confirmed_facts(v_workspace) f
      where f.fact_key in ('display_name','legal_name','description','phone','email','address','hours','links')), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'priceText', s.price_text) order by s.position, s.id)
      from public.business_confirmed_services(v_workspace) s where s.active), '[]'::jsonb));
end $$;

-- Facts and services as confirmed, each with the verified flag it was
-- confirmed with. People are the business's routing, not published content.
create or replace function public.read_inquiry_business_context(p_tenant_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('workspaceId', l.workspace_id,
    'facts', coalesce((select jsonb_object_agg(f.fact_key, jsonb_build_object('value', f.value, 'verified', f.verified))
      from public.business_confirmed_facts(l.workspace_id) f), '{}'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'active', p.active)
      order by p.id) from public.business_people p where p.workspace_id = l.workspace_id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
      'priceText', s.price_text, 'active', s.active, 'verified', s.verified) order by s.position, s.id)
      from public.business_confirmed_services(l.workspace_id) s), '[]'::jsonb))
  from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
  where t.id = p_tenant_id
$$;

commit;
