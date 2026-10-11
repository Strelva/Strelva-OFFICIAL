-- Reverses 20261013115000_booking_reads_confirmed_facts.sql: restores the
-- earlier reader bodies exactly (each from the migration named above it) and
-- drops the two confirmed-copy helpers. Privileges are unchanged by either
-- direction.
-- WARNING: booking availability, the MCP/agent booking tools, booking emails,
-- inquiry booking offers, the inquiry form's service choices and the linked
-- site overlay then read the working record again, so a provider's or
-- operator's pending edit reaches customers with no owner decision (#509).
-- Run only to unblock a failed release, and reapply before rollout.
-- Roll back 20261013120000 (if applied) first; run this before
-- 20261013110000 and 20261011133700. Nothing is deleted from either copy.
begin;
set local lock_timeout = '3s';

-- read_inquiry_business_context: exactly as 20261010123000_inquiry_context_notices.sql.
create or replace function public.read_inquiry_business_context(p_tenant_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('workspaceId', l.workspace_id,
    'facts', coalesce((select jsonb_object_agg(f.fact_key, jsonb_build_object('value', f.value, 'verified', f.verified))
      from public.business_record_facts f where f.workspace_id = l.workspace_id), '{}'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'active', p.active)
      order by p.id) from public.business_people p where p.workspace_id = l.workspace_id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
      'priceText', s.price_text, 'active', s.active, 'verified', s.verified) order by s.position, s.id)
      from public.business_services s where s.workspace_id = l.workspace_id), '[]'::jsonb))
  from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
  where t.id = p_tenant_id
$$;

-- read_inquiry_workspace_booking_context: exactly as 20261010125940_inquiry_booking_handoff.sql.
create or replace function public.read_inquiry_workspace_booking_context(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('tenantStableId',null,'workspaceId',p_workspace_id,'systemId',s.id,'paused',coalesce(s.lifecycle='paused',false),
 'hours',(select value from public.business_record_facts where workspace_id=p_workspace_id and fact_key='hours'),
 'phone',(select value from public.business_record_facts where workspace_id=p_workspace_id and fact_key='phone'),
 'services',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'durationMinutes',x.duration_minutes,'active',x.active,'externalRef',x.external_ref) order by x.position,x.id) from public.business_services x where x.workspace_id=p_workspace_id),'[]'::jsonb),
 'settings',case when b.calendar_key is null then null else jsonb_build_object('mode',b.mode,'bufferMinutes',b.buffer_minutes,'minNoticeMinutes',b.min_notice_minutes,'maxAdvanceDays',b.max_advance_days,'defaultLengthMinutes',b.default_length_minutes,'maxPerDay',b.max_per_day,'timezone',b.timezone,'bookableHours',b.bookable_hours,'bookableOverrides',b.bookable_overrides,'legacyRequiresPayment',b.legacy_requires_payment,'revision',b.revision) end)
 from (select 1) anchor left join lateral(select id,lifecycle from public.systems where business_workspace_id=p_workspace_id and kind='booking' order by created_at,id limit 1) s on true
 left join public.booking_settings b on b.calendar_key=p_workspace_id and b.tenant_stable_id is null
$$;

-- inquiry_booking_offer_json: exactly as 20261010125940_inquiry_booking_handoff.sql.
create or replace function public.inquiry_booking_offer_json(o public.inquiry_booking_offers) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',o.id,'serviceId',o.service_id,'expiresAt',to_char(o.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'serviceName',o.service_name,'timeZone',o.time_zone,'slots',o.slots,'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'durationMinutes',s.duration_minutes) order by s.position,s.id) from public.business_services s where s.workspace_id=(select l.workspace_id from public.tenant_leads l where l.id=o.lead_row_id) and s.active),'[]'::jsonb))
$$;

-- prepare_inquiry_booking_offer: exactly as 20261010125940_inquiry_booking_handoff.sql.
create or replace function public.prepare_inquiry_booking_offer(p_tenant_id text,p_inquiry_id text,p_witness jsonb,p_service_id uuid,p_slots jsonb,p_user_id uuid,p_verified_email text) returns jsonb
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

-- read_tenant_booking_context_before_service_policy: exactly as 20261010135956_booking_native_workspace.sql.
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
    'hours', (select f.value from public.business_record_facts f where f.workspace_id = v.workspace_id and f.fact_key = 'hours'),
    'phone', (select f.value from public.business_record_facts f where f.workspace_id = v.workspace_id and f.fact_key = 'phone'),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'durationMinutes', s.duration_minutes,
        'active', s.active, 'externalRef', s.external_ref) order by s.position, s.id)
      from public.business_services s where s.workspace_id = v.workspace_id), '[]'::jsonb),
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

-- read_booking_business_details: exactly as 20261010135956_booking_native_workspace.sql.
create or replace function public.read_booking_business_details(p_tenant_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('name',coalesce((select f.value#>>'{}' from public.business_record_facts f where f.workspace_id=v.workspace_id and f.fact_key='display_name'),t.site_name,w.name),
   'address',(select coalesce(f.value->>'formatted',concat_ws(', ',f.value->>'line1',f.value->>'line2',f.value->>'city',f.value->>'region',f.value->>'postalCode'))
     from public.business_record_facts f where f.workspace_id=v.workspace_id and f.fact_key='address'))
 from public.booking_tenant(p_tenant_id) v left join public.tenants t on t.stable_id=v.tenant_stable_id left join public.workspaces w on w.id=v.workspace_id
$$;

-- read_tenant_business_context: exactly as 20261010165000_tenant_business_context.sql.
create or replace function public.read_tenant_business_context(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_workspace uuid; v_revision bigint;
begin
  select l.workspace_id into v_workspace from public.tenant_workspace_links l
    join public.tenants t on t.stable_id = l.tenant_stable_id where t.id = p_tenant_id;
  if v_workspace is null then return null; end if;
  select revision into v_revision from public.business_records where workspace_id = v_workspace;
  return jsonb_build_object('revision', coalesce(v_revision, 0),
    'facts', coalesce((select jsonb_object_agg(f.fact_key, f.value) from public.business_record_facts f
      where f.workspace_id = v_workspace and f.fact_key in ('display_name','legal_name','description','phone','email','address','hours','links')
        and (f.verified or f.source in ('owner','operator'))), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'priceText', s.price_text) order by s.position, s.id)
      from public.business_services s where s.workspace_id = v_workspace and s.active and (s.verified or s.source in ('owner','operator'))), '[]'::jsonb));
end $$;
drop function public.business_confirmed_services(uuid);
drop function public.business_confirmed_facts(uuid);

commit;
