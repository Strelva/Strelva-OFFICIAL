begin;
set local lock_timeout='3s';
set local statement_timeout='120s';
-- New native setup only. Existing ordinary grants and operating rules remain.
create table public.ask_native_service_setups(
  id uuid primary key,
  business_workspace_id uuid not null,
  tenant_stable_id uuid not null,
  work_id uuid not null,
  grant_id uuid not null unique,
  business_service_id uuid not null,
  selection jsonb not null,
  accepted_by uuid not null,
  accepted_at timestamptz not null default clock_timestamp()
);
alter table public.ask_native_service_setups enable row level security;
revoke all on public.ask_native_service_setups from public,anon,authenticated,service_role;
grant select on public.ask_native_service_setups to service_role;
create function public.ask_native_service_setup_immutable() returns trigger language plpgsql as $$
begin raise exception 'ask_service_setup_receipt_immutable'; end $$;
create trigger ask_native_service_setup_immutable before update or delete on public.ask_native_service_setups
  for each row execute function public.ask_native_service_setup_immutable();

create function public.publish_ask_native_service_setup(p_business_id uuid,p_user_id uuid,p_verified_email text,p_setup jsonb)
returns setof public.public_website_booking_grants language plpgsql security definer set search_path=public,pg_temp as $$
declare
  selection jsonb:=p_setup->'selection'; service jsonb:=selection->'service';
  tenant_row public.tenants%rowtype; calendar_row public.workspace_calendar_connections%rowtype;
  inquiry_row public.inquiry_workspaces%rowtype; receipt public.ask_native_service_setups%rowtype;
  granted public.public_website_booking_grants%rowtype;
  native_state jsonb:=p_setup->'inquiryState'; schedule jsonb:=p_setup->'schedule';
  record_revision bigint; native_context jsonb; service_id uuid; patch_result jsonb; override_rows jsonb;
  capability jsonb; request jsonb; change_row jsonb; slot jsonb; array_name text; inquiry_present boolean;
  setup_id uuid:=(selection->>'setupId')::uuid; schedule_id uuid:=(p_setup->>'workId')::uuid;
begin
  if jsonb_typeof(p_setup) is distinct from 'object' or jsonb_typeof(selection) is distinct from 'object' or jsonb_typeof(service) is distinct from 'object'
    or setup_id is null or schedule_id is null or (selection->>'calendarConnectionId') is null
    or p_setup->>'capabilityId' is null or p_setup->>'inquiryId' is null or service->>'serviceName' is null or service->>'provider' is null
    or service->>'timeZone' is null or selection->>'businessRecordRevision' is null then raise exception 'ask_service_setup_invalid'; end if;
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  perform 1 from public.users where id=p_user_id and verified_at is not null and lower(btrim(email))=lower(btrim(p_verified_email)) for share;
  if not found then raise exception 'offering_actor_unverified'; end if;
  -- Setup is an owner's operating decision, never inferred provider authority.
  perform 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=p_user_id and role='owner' for share;
  if not found then raise exception 'ask_service_setup_owner_required'; end if;
  select * into tenant_row from public.tenants where id=service->>'tenantId' and active is true for share;
  if not found or tenant_row.stable_id is distinct from (selection->>'tenantStableId')::uuid then raise exception 'ask_service_setup_tenant_changed'; end if;
  perform 1 from public.memberships where user_id=p_user_id and tenant_stable_id=tenant_row.stable_id and role='owner' for share;
  if not found then raise exception 'ask_service_setup_tenant_owner_required'; end if;
  perform 1 from public.offering_website_bindings where business_workspace_id=p_business_id and tenant_stable_id=tenant_row.stable_id and status='active' for share;
  if not found then raise exception 'ask_service_setup_site_binding_required'; end if;
  if public.workspace_exit_completed(p_business_id) then raise exception 'ask_service_setup_workspace_stopped'; end if;
  -- An exact acceptance is answered before mutable schedule/calendar checks.
  -- Reservations or a token refresh do not create a second publication.
  select * into receipt from public.ask_native_service_setups where id=setup_id;
  if found then
    if receipt.business_workspace_id<>p_business_id or receipt.tenant_stable_id<>tenant_row.stable_id
      or receipt.selection is distinct from selection or receipt.work_id<>schedule_id then raise exception 'ask_service_setup_replay_mismatch'; end if;
    select * into granted from public.public_website_booking_grants where id=receipt.grant_id;
    if not found or granted.status is distinct from 'published' then raise exception 'ask_service_setup_replay_revoked'; end if;
    return next granted; return;
  end if;
  if selection->>'kind' is distinct from 'ask-new-service-setup' or selection->>'workspaceId' is distinct from p_business_id::text
    or service->>'kind' is distinct from 'new-booking-service'
    or p_setup->>'capabilityId' !~ '^ask-service-[a-f0-9]{32}$' or p_setup->>'inquiryId' !~ '^ask-inquiry-[a-f0-9]{32}$'
    or coalesce(service->>'durationMinutes','') !~ '^[0-9]+$'
    or (service->>'durationMinutes')::integer not between 5 and 480
    or char_length(btrim(service->>'serviceName')) not between 1 and 120
    or service->>'provider' not in ('google','outlook')
    or not exists(select 1 from pg_timezone_names where name=service->>'timeZone')
    or schedule->>'version' is distinct from '1' or schedule->>'revision' is distinct from '0'
    or schedule->>'createdBy' is distinct from p_user_id::text or schedule->>'title' is distinct from service->>'serviceName'
    or schedule ? 'pause' or schedule->'history' is distinct from '[]'::jsonb or schedule->'reservations' is distinct from '[]'::jsonb
    or schedule->'availability' is distinct from service->'availability'
    or jsonb_typeof(service->'availability') is distinct from 'array'
    or jsonb_array_length(service->'availability') not between 1 and 20 then raise exception 'ask_service_setup_invalid'; end if;
  for slot in select value from jsonb_array_elements(service->'availability') loop
    if slot->>'start' is null or slot->>'end' is null or (slot->>'start')::timestamptz<=clock_timestamp()+interval '4 hours' or (slot->>'end')::timestamptz>clock_timestamp()+interval '60 days'
      or date_trunc('minute',(slot->>'start')::timestamptz) is distinct from (slot->>'start')::timestamptz
      or date_trunc('minute',(slot->>'end')::timestamptz) is distinct from (slot->>'end')::timestamptz
      or exists(select 1 from unnest(array[(slot->>'start')::timestamptz-interval '1 day',(slot->>'end')::timestamptz,(slot->>'start')::timestamptz+interval '1 day']) t
        where ((t at time zone (service->>'timeZone'))-(t at time zone 'UTC')) is distinct from (((slot->>'start')::timestamptz at time zone (service->>'timeZone'))-((slot->>'start')::timestamptz at time zone 'UTC')))
      or ((slot->>'start')::timestamptz at time zone (service->>'timeZone'))::date is distinct from ((slot->>'end')::timestamptz at time zone (service->>'timeZone'))::date
      or (slot->>'end')::timestamptz-(slot->>'start')::timestamptz<>make_interval(mins=>(service->>'durationMinutes')::integer) then raise exception 'ask_service_setup_times_invalid'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(service->'availability') with ordinality a(value,n),jsonb_array_elements(service->'availability') with ordinality b(value,n)
    where a.n<b.n and (a.value->>'start')::timestamptz<(b.value->>'end')::timestamptz and (b.value->>'start')::timestamptz<(a.value->>'end')::timestamptz) then raise exception 'ask_service_setup_times_invalid'; end if;
  if (select count(*)<>count(distinct ((a->>'start')::timestamptz at time zone (service->>'timeZone'))::date) from jsonb_array_elements(service->'availability') a) then raise exception 'ask_service_setup_times_invalid'; end if;
  select * into calendar_row from public.workspace_calendar_connections where id=(selection->>'calendarConnectionId')::uuid and workspace_id=p_business_id for share;
  if not found or calendar_row.status<>'connected' or calendar_row.provider<>service->>'provider' or calendar_row.time_zone<>service->>'timeZone'
    or calendar_row.updated_at is distinct from (selection->>'calendarUpdatedAt')::timestamptz then raise exception 'ask_service_setup_calendar_changed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(tenant_row.stable_id::text,9107));
  select revision into record_revision from public.business_records where workspace_id=p_business_id for update;
  native_context:=public.read_tenant_booking_context(tenant_row.id);
  if record_revision is distinct from (selection->>'businessRecordRevision')::bigint or native_context->>'workspaceId' is distinct from p_business_id::text
    or native_context->'hours' is distinct from selection->'recordHours'
    or exists(select 1 from public.business_services where workspace_id=p_business_id)
    or exists(select 1 from public.business_record_confirmed where workspace_id=p_business_id and entity='service')
    or exists(select 1 from public.booking_settings where calendar_key=tenant_row.stable_id)
    or exists(select 1 from public.booking_service_policies where tenant_stable_id=tenant_row.stable_id)
    then raise exception 'ask_service_setup_native_booking_changed'; end if;
  if native_context->'hours' <> 'null'::jsonb then
    if native_context->'hours'->>'timezone' is distinct from service->>'timeZone' then raise exception 'ask_service_setup_hours_changed'; end if;
    for slot in select value from jsonb_array_elements(service->'availability') loop
      if not exists(select 1 from jsonb_array_elements(native_context->'hours'->'weekly') h
        where (h->>'day')::integer=extract(dow from (slot->>'start')::timestamptz at time zone (service->>'timeZone'))
        and h->>'opens'<=to_char((slot->>'start')::timestamptz at time zone (service->>'timeZone'),'HH24:MI')
        and h->>'closes'>=to_char((slot->>'end')::timestamptz at time zone (service->>'timeZone'),'HH24:MI'))
        or exists(select 1 from jsonb_array_elements(coalesce(native_context->'hours'->'overrides','[]')) h where h->>'date'=to_char((slot->>'start')::timestamptz at time zone (service->>'timeZone'),'YYYY-MM-DD'))
        then raise exception 'ask_service_setup_hours_changed'; end if;
    end loop;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ask-service-inquiry:'||tenant_row.stable_id::text,0));
  select * into inquiry_row from public.inquiry_workspaces where tenant_stable_id=tenant_row.stable_id and business_id=p_business_id::text for update;
  inquiry_present:=found;
  if inquiry_present then
    if inquiry_row.revision is distinct from (selection->>'inquiryRevision')::bigint or inquiry_row.state is distinct from p_setup->'expectedInquiryState' then raise exception 'ask_service_setup_inquiry_changed'; end if;
    foreach array_name in array array['requests','capabilities','changes','actionReceipts','rehearsalScenarios','rehearsalRuns','inquiries','timeline','responsibilities','responsibilityReceipts'] loop
      if inquiry_row.state->array_name is distinct from '[]'::jsonb then raise exception 'ask_service_setup_existing_inquiry_refused'; end if;
    end loop;
  elsif selection->>'inquiryRevision' is not null or p_setup->'expectedInquiryState' is distinct from 'null'::jsonb then raise exception 'ask_service_setup_inquiry_changed'; end if;
  foreach array_name in array array['requests','capabilities','changes','actionReceipts','rehearsalScenarios','rehearsalRuns','inquiries','timeline','responsibilities','responsibilityReceipts'] loop
    if jsonb_typeof(native_state->array_name) is distinct from 'array' then raise exception 'ask_service_setup_native_inquiry_invalid'; end if;
  end loop;
  if jsonb_typeof(native_state->'capabilities'->0->'live'->'form'->'fields') is distinct from 'array'
    or jsonb_typeof(native_state->'capabilities'->0->'live'->'connections') is distinct from 'array' then raise exception 'ask_service_setup_native_inquiry_invalid'; end if;
  capability:=native_state->'capabilities'->0; request:=native_state->'requests'->0; change_row:=native_state->'changes'->0;
  if native_state->>'stateVersion' is distinct from '1' or native_state->'inquiries' is distinct from '[]'::jsonb
    or jsonb_array_length(native_state->'capabilities')<>1 or jsonb_array_length(native_state->'requests')<>1 or jsonb_array_length(native_state->'changes')<>1
    or native_state->'responsibilities' is distinct from '[]'::jsonb or native_state->'responsibilityReceipts' is distinct from '[]'::jsonb
    or capability->>'id' is distinct from p_setup->>'inquiryId' or capability->>'businessId' is distinct from p_business_id::text
    or capability->>'status' is distinct from 'live_unverified' or capability->'previousLive' is distinct from 'null'::jsonb
    or capability->'live'->>'id' is distinct from p_setup->>'inquiryId' or capability->'live'->>'version' is distinct from '1'
    or capability->'live'->>'businessId' is distinct from p_business_id::text
    or capability->'live'->'routing' is distinct from 'null'::jsonb or capability->'live'->'followUp' is distinct from 'null'::jsonb
    or exists(select 1 from jsonb_array_elements(capability->'live'->'connections') c where c->>'consent' is distinct from 'missing' or c->>'status' is distinct from 'missing')
    or request->>'businessId' is distinct from p_business_id::text or request->>'actorId' is distinct from p_user_id::text
    or request->>'capabilityId' is distinct from p_setup->>'inquiryId' or request->>'state' is distinct from 'live_unverified'
    or request->'publishApproval'->>'actorId' is distinct from p_user_id::text or request->'publishApproval'->>'explicit' is distinct from 'true'
    or request->'publishApproval'->>'approvedAt' is null
    or (request->'publishApproval'->>'approvedAt')::timestamptz<clock_timestamp()-interval '5 minutes'
    or (request->'publishApproval'->>'approvedAt')::timestamptz>clock_timestamp()+interval '1 minute'
    or request->'draft' is distinct from capability->'live'
    or change_row->>'businessId' is distinct from p_business_id::text or change_row->>'providerAcceptanceId' is distinct from 'ask-service-setup:'||setup_id::text
    or change_row->>'capabilityId' is distinct from p_setup->>'inquiryId' or change_row->>'status' is distinct from 'published_unverified'
    or not exists(select 1 from jsonb_array_elements(capability->'live'->'form'->'fields') f where f->>'id'='name' and f->>'kind'='text')
    or not exists(select 1 from jsonb_array_elements(capability->'live'->'form'->'fields') f where f->>'id'='email' and f->>'kind'='email')
    or not exists(select 1 from jsonb_array_elements(capability->'live'->'form'->'fields') f where f->>'id'='message' and f->>'kind'='textarea')
    or exists(select 1 from jsonb_array_elements(capability->'live'->'form'->'fields') f where coalesce((f->>'required')::boolean,false) and f->>'id' not in ('name','email','message')) then raise exception 'ask_service_setup_native_inquiry_invalid'; end if;
  -- The existing owner-write path confirms only this new service and records its history.
  patch_result:=public.patch_business_record(p_business_id,p_user_id,p_verified_email,'owner',record_revision,
    jsonb_build_object('services',jsonb_build_array(jsonb_build_object('op','upsert','name',service->>'serviceName','durationMinutes',(service->>'durationMinutes')::integer,'active',true,'externalRef',p_setup->>'capabilityId','verified',true))),setup_id,encode(sha256(convert_to(selection::text,'UTF8')),'hex'));
  select (c->>'id')::uuid into service_id from public.business_record_revisions r cross join lateral jsonb_array_elements(r.changes) c
    where r.workspace_id=p_business_id and r.command_id=setup_id and c->>'entity'='service';
  if service_id is null then raise exception 'ask_service_setup_native_booking_invalid'; end if;
  select jsonb_agg(jsonb_build_object('date',to_char((s->>'start')::timestamptz at time zone (service->>'timeZone'),'YYYY-MM-DD'),'closed',false,
    'opens',to_char((s->>'start')::timestamptz at time zone (service->>'timeZone'),'HH24:MI'),'closes',to_char((s->>'end')::timestamptz at time zone (service->>'timeZone'),'HH24:MI')) order by s->>'start') into override_rows from jsonb_array_elements(service->'availability') s;
  insert into public.booking_settings(calendar_key,tenant_stable_id,workspace_id,mode,buffer_minutes,min_notice_minutes,max_advance_days,default_length_minutes,timezone,bookable_hours,bookable_overrides,recorded_via)
    values(tenant_row.stable_id,tenant_row.stable_id,p_business_id,'request',0,240,60,(service->>'durationMinutes')::integer,service->>'timeZone','[]',override_rows,'native');
  insert into public.booking_service_policies(tenant_stable_id,workspace_id,business_service_id,mode,buffer_minutes,bookable,intake)
    values(tenant_row.stable_id,p_business_id,service_id,'request',0,true,'[]');
  insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
    values(schedule_id,p_business_id,'scheduling','schedule',service->>'serviceName',schedule,p_user_id);
  if inquiry_present then
    update public.inquiry_workspaces set state=native_state,revision=revision+1,updated_by=p_user_id::text,updated_at=clock_timestamp() where id=inquiry_row.id;
  else
    insert into public.inquiry_workspaces(tenant_id,business_id,state,state_version,revision,updated_by)
      values(tenant_row.id,p_business_id::text,native_state,1,1,p_user_id::text);
  end if;
  select * into granted from public.publish_public_website_booking_grant(p_business_id,p_user_id,p_verified_email,tenant_row.id,schedule_id,p_setup->>'capabilityId',1,p_setup->>'inquiryId',1,service->>'provider',service->>'serviceName',service->>'timeZone');
  insert into public.ask_native_service_setups(id,business_workspace_id,tenant_stable_id,work_id,grant_id,business_service_id,selection,accepted_by)
    values(setup_id,p_business_id,tenant_row.stable_id,schedule_id,granted.id,service_id,selection,p_user_id);
  return next granted;
end $$;
revoke all on function public.publish_ask_native_service_setup(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_ask_native_service_setup(uuid,uuid,text,jsonb) to service_role;
-- A stop retains accepted reservations, inquiries, snapshots and receipt rows.
create function public.revoke_ask_native_service_setup(p_business_id uuid,p_user_id uuid,p_verified_email text,p_grant_id uuid,p_reason text)
returns setof public.public_website_booking_grants language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.ask_native_service_setups%rowtype; granted public.public_website_booking_grants%rowtype; stamp text; current_service jsonb; record_revision bigint;
begin
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  perform 1 from public.users where id=p_user_id and verified_at is not null and lower(btrim(email))=lower(btrim(p_verified_email)) for share;
  if not found then raise exception 'offering_actor_unverified'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=p_user_id and role='owner' for share;
  if not found then raise exception 'ask_service_setup_owner_required'; end if;
  select * into receipt from public.ask_native_service_setups where business_workspace_id=p_business_id and grant_id=p_grant_id;
  if not found then raise exception 'ask_service_setup_receipt_required'; end if;
  perform 1 from public.memberships where user_id=p_user_id and tenant_stable_id=receipt.tenant_stable_id and role='owner' for share;
  if not found then raise exception 'ask_service_setup_tenant_owner_required'; end if;
  select * into granted from public.revoke_public_website_booking_grant(p_business_id,p_user_id,p_verified_email,p_grant_id,p_reason);
  select revision into record_revision from public.business_records where workspace_id=p_business_id for update;
  current_service:=public.business_record_entity_state(p_business_id,'service',receipt.business_service_id::text);
  if current_service->>'active'='true' then
    perform public.patch_business_record(p_business_id,p_user_id,p_verified_email,'owner',record_revision,
      jsonb_build_object('services',jsonb_build_array((current_service-array['source','createdAt','createdBy','updatedAt','updatedBy']::text[])||jsonb_build_object('op','upsert','id',receipt.business_service_id,'active',false))),gen_random_uuid(),encode(sha256(convert_to('stop:'||receipt.id::text,'UTF8')),'hex'));
  end if;
  update public.booking_service_policies set bookable=false,revision=revision+1 where tenant_stable_id=receipt.tenant_stable_id and business_service_id=receipt.business_service_id and bookable;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  update public.saved_product_work w set payload=w.payload||jsonb_build_object(
    'pause',jsonb_build_object('pausedAt',stamp,'pausedBy',p_user_id::text,'reason',p_reason),
    'revision',(w.payload->>'revision')::int+1,
    'history',w.payload->'history'||jsonb_build_array(jsonb_build_object('revision',(w.payload->>'revision')::int+1,'kind','pause','actorId',p_user_id::text,'at',stamp))),updated_at=clock_timestamp()
    where w.id=receipt.work_id and w.workspace_id=p_business_id and not(w.payload ? 'pause');
  update public.inquiry_workspaces i set state=jsonb_set(i.state,'{capabilities}',
    (select jsonb_agg(case when c->>'id'=granted.inquiry_capability_id then c||jsonb_build_object('status','paused','updatedAt',stamp) else c end order by n)
      from jsonb_array_elements(i.state->'capabilities') with ordinality x(c,n))),
    revision=i.revision+1,updated_by=p_user_id::text,updated_at=clock_timestamp()
    where i.tenant_stable_id=receipt.tenant_stable_id and i.business_id=p_business_id::text
      and exists(select 1 from jsonb_array_elements(i.state->'capabilities') c where c->>'id'=granted.inquiry_capability_id and c->>'status'<>'paused');
  return next granted;
end $$;
revoke all on function public.revoke_ask_native_service_setup(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_ask_native_service_setup(uuid,uuid,text,uuid,text) to service_role;
-- Tenant teardown already removes published grants. Only this setup's new
-- operating policy is removed; its complete acceptance and bookings survive.
create function public.ask_native_service_setup_tenant_teardown() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.booking_service_policies p join public.ask_native_service_setups r on r.business_service_id=p.business_service_id and r.tenant_stable_id=p.tenant_stable_id and coalesce(p.calendar_key,p.tenant_stable_id,p.workspace_id)=r.tenant_stable_id
    join public.business_services s on s.id=p.business_service_id where r.tenant_stable_id=old.stable_id
    and (p.workspace_id is distinct from r.business_workspace_id or p.mode<>'request' or p.buffer_minutes<>0 or p.intake<>'[]'::jsonb
      or not((p.revision=1 and p.bookable) or (p.revision=2 and not p.bookable))
      or s.name is distinct from r.selection#>>'{service,serviceName}' or s.duration_minutes is distinct from (r.selection#>>'{service,durationMinutes}')::int))
    then raise exception 'ask_service_setup_teardown_policy_changed'; end if;
  delete from public.booking_service_policies p using public.ask_native_service_setups r
    where r.tenant_stable_id=old.stable_id and p.tenant_stable_id=old.stable_id
      and p.workspace_id=r.business_workspace_id and p.business_service_id=r.business_service_id and coalesce(p.calendar_key,p.tenant_stable_id,p.workspace_id)=r.tenant_stable_id;
  return old;
end $$;
create trigger ask_native_service_setup_tenant_teardown before delete on public.tenants for each row execute function public.ask_native_service_setup_tenant_teardown();
revoke all on function public.ask_native_service_setup_immutable(),public.ask_native_service_setup_tenant_teardown() from public,anon,authenticated,service_role;
-- Read-only preflight for the existing one-time email confirmation token.
create function public.inspect_ask_service_confirmation(p_token_hash text) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('selection',s.selection,'grant_id',s.grant_id,'business_service_id',s.business_service_id,
    'work_id',s.work_id,'business_workspace_id',s.business_workspace_id,'tenant_stable_id',s.tenant_stable_id)
  from public.public_booking_requests r join public.public_website_bookings b
    on b.tenant_stable_id=r.tenant_stable_id and b.calendar_request_id=r.request_id
  join public.ask_native_service_setups s on s.grant_id=b.grant_id
    and s.work_id=b.work_id and s.business_workspace_id=b.business_workspace_id
    and s.tenant_stable_id=b.tenant_stable_id
  join public.public_website_booking_grants g on g.id=s.grant_id and g.capability_id=b.capability_id
    and g.work_id=s.work_id and g.business_workspace_id=s.business_workspace_id and g.tenant_stable_id=s.tenant_stable_id
  where p_token_hash ~ '^[a-f0-9]{64}$' and r.token_hash=p_token_hash
$$;
revoke all on function public.inspect_ask_service_confirmation(text) from public,anon,authenticated;
grant execute on function public.inspect_ask_service_confirmation(text) to service_role;
create table release_rollback_baseline.ask_native_service_setup(signature text primary key,function_oid oid not null,owner_oid oid not null,after_hash text not null,acl aclitem[]);
revoke all on release_rollback_baseline.ask_native_service_setup from public,anon,authenticated,service_role;
insert into release_rollback_baseline.ask_native_service_setup select signature,p.oid,p.proowner,md5(pg_get_functiondef(p.oid)),p.proacl from unnest(array[
  'public.publish_ask_native_service_setup(uuid,uuid,text,jsonb)',
  'public.revoke_ask_native_service_setup(uuid,uuid,text,uuid,text)',
  'public.ask_native_service_setup_immutable()',
  'public.ask_native_service_setup_tenant_teardown()',
  'public.inspect_ask_service_confirmation(text)'
]) signature join pg_proc p on p.oid=signature::regprocedure;
commit;
