begin;
set local lock_timeout = '3s';

-- An accepted Ask service keeps an immutable exact proposal receipt. It is
-- also the trusted marker that lets public booking use the publishing owner
-- for an agency-created schedule. Legacy grants retain their existing path.
create table public.ask_booking_service_publications (
  grant_id uuid primary key references public.public_website_booking_grants(id) on delete restrict,
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  work_id uuid not null references public.saved_product_work(id) on delete restrict,
  proposal jsonb not null,
  schedule_payload jsonb not null,
  calendar_connection_id uuid not null references public.workspace_calendar_connections(id) on delete restrict,
  calendar_updated_at timestamptz not null,
  published_by uuid not null references public.users(id) on delete restrict,
  published_at timestamptz not null default clock_timestamp()
);
alter table public.ask_booking_service_publications enable row level security;
revoke all on public.ask_booking_service_publications from public, anon, authenticated, service_role;
grant select on public.ask_booking_service_publications to service_role;

create function public.publish_ask_booking_service_grant(
  p_business_id uuid, p_user_id uuid, p_verified_email text,
  p_tenant_id text, p_work_id uuid, p_capability_id text, p_capability_version bigint,
  p_inquiry_capability_id text, p_inquiry_version bigint, p_provider text,
  p_display_name text, p_time_zone text, p_expected_schedule jsonb,
  p_proposal jsonb, p_calendar_connection_id uuid, p_calendar_updated_at timestamptz
) returns setof public.public_website_booking_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tenant_row public.tenants%rowtype;
  work_row public.saved_product_work%rowtype;
  calendar_row public.workspace_calendar_connections%rowtype;
  inquiry_row public.inquiry_workspaces%rowtype;
  capability jsonb;
  granted public.public_website_booking_grants%rowtype;
  receipt public.ask_booking_service_publications%rowtype;
  slot jsonb;
begin
  -- Shared locks pin authority and all the owned inputs until the existing
  -- native publication commits. Every caller takes this order: workspace,
  -- tenant, tenant membership, website binding, schedule, inquiry, calendar.
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  select * into tenant_row from public.tenants where id=p_tenant_id and active is true for share;
  if not found then raise exception 'ask_booking_tenant_unavailable'; end if;
  perform 1 from public.memberships where user_id=p_user_id and tenant_stable_id=tenant_row.stable_id and role='owner' for share;
  if not found then raise exception 'ask_booking_tenant_owner_required'; end if;
  perform 1 from public.offering_website_bindings where business_workspace_id=p_business_id and tenant_stable_id=tenant_row.stable_id and status='active' for share;
  if not found then raise exception 'ask_booking_website_binding_required'; end if;
  if public.workspace_exit_completed(p_business_id) then raise exception 'ask_booking_workspace_exited'; end if;
  select * into work_row from public.saved_product_work where id=p_work_id and workspace_id=p_business_id and product_id='scheduling' and resource_kind='schedule' for share;
  if not found then raise exception 'ask_booking_schedule_required'; end if;
  select * into inquiry_row from public.inquiry_workspaces where tenant_stable_id=tenant_row.stable_id and business_id=p_business_id::text for share;
  if not found then raise exception 'ask_booking_inquiry_required'; end if;
  select * into calendar_row from public.workspace_calendar_connections where id=p_calendar_connection_id and workspace_id=p_business_id for share;
  if not found then raise exception 'ask_booking_calendar_required'; end if;

  -- Exact accepted replays need no second effect, even after legitimate new
  -- reservations change the schedule. A different proposal cannot reuse it.
  select g.* into granted from public.public_website_booking_grants g where g.tenant_stable_id=tenant_row.stable_id and g.capability_id=p_capability_id;
  if found then
    select * into receipt from public.ask_booking_service_publications where grant_id=granted.id;
    if not found or granted.status<>'published' or granted.work_id<>p_work_id or granted.business_workspace_id<>p_business_id
      or granted.capability_version<>p_capability_version or granted.inquiry_capability_id<>p_inquiry_capability_id or granted.inquiry_version<>p_inquiry_version
      or granted.provider<>p_provider or granted.display_name<>p_display_name or granted.time_zone<>p_time_zone
      or receipt.proposal is distinct from p_proposal or receipt.schedule_payload is distinct from p_expected_schedule
      or receipt.calendar_connection_id<>p_calendar_connection_id or receipt.calendar_updated_at is distinct from p_calendar_updated_at then
      raise exception 'ask_booking_publication_replay_mismatch';
    end if;
    return next granted; return;
  end if;
  if p_capability_id !~ '^ask-[a-f0-9]{32}$' or p_capability_version<>1
    or p_expected_schedule is null or work_row.payload is distinct from p_expected_schedule
    or work_row.payload ? 'pause' or work_row.payload->'reservations' is distinct from '[]'::jsonb
    or p_proposal->>'kind' is distinct from 'new-booking-service'
    or p_proposal->>'serviceName' is distinct from p_display_name
    or p_proposal->>'timeZone' is distinct from p_time_zone or p_proposal->>'provider' is distinct from p_provider
    or p_proposal->>'inquiryCapabilityId' is distinct from p_inquiry_capability_id
    or (p_proposal ? 'tenantId' and p_proposal->>'tenantId' is distinct from p_tenant_id)
    or p_proposal->'availability' is distinct from work_row.payload->'availability'
    or coalesce(p_proposal->>'durationMinutes','') !~ '^[0-9]+$'
    or (p_proposal->>'durationMinutes')::integer not between 5 and 480
    or jsonb_typeof(p_proposal->'availability') is distinct from 'array'
    or jsonb_array_length(p_proposal->'availability') not between 1 and 20 then
    raise exception 'ask_booking_proposal_changed';
  end if;
  for slot in select value from jsonb_array_elements(p_proposal->'availability') loop
    if (slot->>'start')::timestamptz<=clock_timestamp() or (slot->>'end')::timestamptz-(slot->>'start')::timestamptz<>make_interval(mins=>(p_proposal->>'durationMinutes')::integer) then raise exception 'ask_booking_proposal_time_invalid'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_proposal->'availability') with ordinality a(value,n),jsonb_array_elements(p_proposal->'availability') with ordinality b(value,n) where a.n<b.n and (a.value->>'start')::timestamptz<(b.value->>'end')::timestamptz and (b.value->>'start')::timestamptz<(a.value->>'end')::timestamptz) then raise exception 'ask_booking_proposal_time_invalid'; end if;
  select value into capability from jsonb_array_elements(inquiry_row.state->'capabilities') where value->>'id'=p_inquiry_capability_id and value->>'businessId'=p_business_id::text;
  if capability is null or capability->>'status' not in ('live','live_unverified')
    or capability->'live'->>'id' is distinct from p_inquiry_capability_id
    or capability->'live'->>'businessId' is distinct from p_business_id::text
    or capability->'live'->>'version' is distinct from p_inquiry_version::text
    or not exists(select 1 from jsonb_array_elements(capability->'live'->'form'->'fields') field where field->>'id'='name')
    or not exists(select 1 from jsonb_array_elements(capability->'live'->'form'->'fields') field where field->>'id'='email' and field->>'kind'='email')
    or not exists(select 1 from jsonb_array_elements(capability->'live'->'form'->'fields') field where field->>'id'='message')
    or exists(select 1 from jsonb_array_elements(capability->'live'->'form'->'fields') field where coalesce((field->>'required')::boolean,false) and field->>'id' not in ('name','email','message')) then raise exception 'ask_booking_inquiry_changed'; end if;
  if calendar_row.status<>'connected' or calendar_row.provider<>p_provider or calendar_row.time_zone<>p_time_zone or calendar_row.updated_at is distinct from p_calendar_updated_at then raise exception 'ask_booking_calendar_changed'; end if;
  select * into granted from public.publish_public_website_booking_grant(p_business_id,p_user_id,p_verified_email,p_tenant_id,p_work_id,p_capability_id,p_capability_version,p_inquiry_capability_id,p_inquiry_version,p_provider,p_display_name,p_time_zone);
  insert into public.ask_booking_service_publications(grant_id,business_workspace_id,work_id,proposal,schedule_payload,calendar_connection_id,calendar_updated_at,published_by)
    values(granted.id,p_business_id,p_work_id,p_proposal,p_expected_schedule,p_calendar_connection_id,p_calendar_updated_at,p_user_id);
  return next granted;
end $$;
revoke all on function public.publish_ask_booking_service_grant(uuid,uuid,text,text,uuid,text,bigint,text,bigint,text,text,text,jsonb,jsonb,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_ask_booking_service_grant(uuid,uuid,text,text,uuid,text,bigint,text,bigint,text,text,text,jsonb,jsonb,uuid,timestamptz) to service_role;
commit;
