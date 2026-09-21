-- Agency delivery keeps the customer work row in the customer workspace while
-- recording the agency workspace that may perform the explicitly assigned
-- work. It does not create cross-client membership or a paid commitment.

alter table public.operational_assignments
  add column if not exists assignee_workspace_id uuid references public.workspaces(id) on delete restrict;

do $$
begin
  alter table public.operational_assignments
    add constraint operational_assignments_agency_workspace_check
    check ((assignee_kind = 'agency') = (assignee_workspace_id is not null));
exception when duplicate_object then null;
end $$;

create index if not exists operational_assignments_assignee_workspace_open
  on public.operational_assignments(assignee_workspace_id, assignee_user_id, expires_at)
  where assignee_kind = 'agency' and status in ('offered','accepted');

create or replace function public.operational_assignment_agency_identity_guard()
returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.assignee_kind='agency' and new.assignee_workspace_id is null then
    raise exception 'operational_assignment_denied';
  end if;
  if new.assignee_kind<>'agency' and new.assignee_workspace_id is not null then
    raise exception 'operational_assignment_denied';
  end if;
  return new;
end $$;
drop trigger if exists operational_assignment_agency_identity on public.operational_assignments;
create trigger operational_assignment_agency_identity
  before insert or update on public.operational_assignments
  for each row execute function public.operational_assignment_agency_identity_guard();
revoke all on function public.operational_assignment_agency_identity_guard() from public,anon,authenticated;

-- Agency assignment is a separate entry point so the legacy assignment RPC
-- cannot silently turn a customer membership into agency authority.
create or replace function public.offer_agency_operational_assignment(
  p_user_id uuid,p_verified_email text,p_work_id uuid,p_agency_workspace_id uuid,
  p_assignee_email text,p_assignee_kind text,p_expires_at timestamptz,p_idempotency_key text
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.saved_product_work; assignee_id uuid; prior public.operational_assignments;
  blocking public.operational_assignments; frozen_scope jsonb;
begin
  if p_assignee_kind <> 'agency'
    or p_agency_workspace_id is null
    or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '90 days'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
    or not exists(select 1 from public.workspaces where id=p_agency_workspace_id and kind='agency')
  then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text
    or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
    or existing.payload ? 'budgetId'
    or jsonb_typeof(existing.payload->'steps') is distinct from 'array'
    or jsonb_array_length(existing.payload->'steps') not between 1 and 20
    or exists(select 1 from jsonb_array_elements(existing.payload->'steps') step
      where coalesce(step->>'maximumCents','')<>'0'
        or coalesce(step->>'capabilityVersion','1')<>'1'
        or coalesce(step->>'operation','') not in ('document.edit','tracker.command','investigation.run','schedule.command','application.command')
        or (step->>'operation'='tracker.command' and step->'input'->>'kind'='coordinate_records')
        or (step->>'operation'='application.command' and coalesce(step->'input'->>'kind','') not in ('revise','rehearse','install')))
    or exists(select 1 from public.standing_responsibility_jobs where finite_work_id=existing.id)
  then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id=existing.workspace_id and user_id=p_user_id and role='owner' for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  select id into assignee_id from public.users
    where lower(email)=lower(p_assignee_email) and verified_at is not null;
  if assignee_id is null or assignee_id=p_user_id then raise exception 'operational_assignment_denied'; end if;
  if not exists(select 1 from public.workspace_memberships
    where workspace_id=p_agency_workspace_id and user_id=assignee_id) then
    raise exception 'operational_assignment_denied';
  end if;
  frozen_scope:=public.operational_assignment_work_scope(existing.payload);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_work_id::text||':'||p_idempotency_key,0));
  select * into prior from public.operational_assignments
    where sponsor_id=p_user_id and work_id=p_work_id and offer_key=p_idempotency_key
    for update;
  if prior.id is null then
    select * into blocking from public.operational_assignments
      where work_id=p_work_id and status in ('offered','accepted')
      order by offered_at desc limit 1 for update;
  end if;
  select * into existing from public.saved_product_work where id=p_work_id for update;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text
    or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
    or existing.payload ? 'budgetId'
    or public.operational_assignment_work_scope(existing.payload) is distinct from frozen_scope
    or not exists(select 1 from public.workspace_memberships
      where workspace_id=existing.workspace_id and user_id=p_user_id and role='owner')
    or not exists(select 1 from public.workspace_memberships
      where workspace_id=p_agency_workspace_id and user_id=assignee_id)
  then raise exception 'operational_assignment_denied'; end if;
  select * into prior from public.operational_assignments
    where sponsor_id=p_user_id and work_id=p_work_id and offer_key=p_idempotency_key
    for update;
  if prior.id is null then
    select * into blocking from public.operational_assignments
      where work_id=p_work_id and status in ('offered','accepted')
      order by offered_at desc limit 1 for update;
  end if;
  if prior.id is not null then
    if prior.workspace_id<>existing.workspace_id or prior.work_id<>existing.id
      or prior.assignee_user_id<>assignee_id
      or prior.assignee_email<>lower(p_assignee_email) or prior.assignee_kind<>'agency'
      or prior.assignee_workspace_id<>p_agency_workspace_id
      or prior.expires_at<>p_expires_at or prior.work_scope is distinct from frozen_scope
    then raise exception 'operational_assignment_conflict'; end if;
    return query select * from public.operational_assignments where id=prior.id;
    return;
  end if;
  if blocking.id is not null and blocking.expires_at<=clock_timestamp() then
    update public.operational_assignments set status='expired' where id=blocking.id;
  elsif blocking.id is not null then
    raise exception 'operational_assignment_conflict';
  end if;
  return query insert into public.operational_assignments(
    workspace_id,work_id,sponsor_id,sponsor_email,assignee_user_id,assignee_email,
    assignee_kind,assignee_workspace_id,offer_key,work_scope,expires_at
  ) values(
    existing.workspace_id,existing.id,p_user_id,lower(p_verified_email),assignee_id,
    lower(p_assignee_email),'agency',p_agency_workspace_id,p_idempotency_key,frozen_scope,p_expires_at
  ) returning *;
end $$;

revoke all on function public.offer_agency_operational_assignment(uuid,text,uuid,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.offer_agency_operational_assignment(uuid,text,uuid,uuid,text,text,timestamptz,text) to service_role;

create or replace function public.accept_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments; existing public.saved_product_work;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into item from public.operational_assignments where id=p_assignment_id for update;
  if not found or item.assignee_user_id<>p_user_id or item.assignee_email<>lower(p_verified_email)
    or item.status not in ('offered','accepted') or item.expires_at<=clock_timestamp()
  then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=item.work_id and workspace_id=item.workspace_id for share;
  if not found or existing.payload->>'ownerId' is distinct from item.sponsor_id::text
    or existing.payload->>'approvedBy' is distinct from item.sponsor_id::text
    or public.operational_assignment_work_scope(existing.payload) is distinct from item.work_scope
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
  then raise exception 'operational_assignment_conflict'; end if;
  perform 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner' for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  if item.assignee_kind='agency' then
    if item.assignee_workspace_id is null
      or not exists(select 1 from public.workspaces where id=item.assignee_workspace_id and kind='agency')
      or not exists(select 1 from public.workspace_memberships where workspace_id=item.assignee_workspace_id and user_id=p_user_id) then
      raise exception 'operational_assignment_denied';
    end if;
  elsif not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id) then
    raise exception 'operational_assignment_denied';
  end if;
  if item.status='accepted' then return query select * from public.operational_assignments where id=p_assignment_id; return; end if;
  return query update public.operational_assignments set status='accepted',accepted_at=clock_timestamp()
    where id=p_assignment_id returning *;
end $$;

create or replace function public.read_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid,p_access text default 'normal'
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments; existing public.saved_product_work; current_owner boolean; provider_member boolean;
begin
  if p_access not in ('normal','checkpoint','inspect')
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into item from public.operational_assignments where id=p_assignment_id;
  if not found then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=item.work_id and workspace_id=item.workspace_id;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or public.operational_assignment_work_scope(existing.payload) is distinct from item.work_scope
  then raise exception 'operational_assignment_conflict'; end if;
  select exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id and role='owner') into current_owner;
  if not current_owner then
    if item.assignee_user_id<>p_user_id or item.assignee_email<>lower(p_verified_email) then raise exception 'operational_assignment_denied'; end if;
    if item.assignee_kind='agency' then
      select item.assignee_workspace_id is not null
        and exists(select 1 from public.workspaces where id=item.assignee_workspace_id and kind='agency')
        and exists(select 1 from public.workspace_memberships where workspace_id=item.assignee_workspace_id and user_id=p_user_id)
        into provider_member;
    else
      select exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id) into provider_member;
    end if;
    if not provider_member then raise exception 'operational_assignment_denied'; end if;
    if p_access='normal' then
      if item.status<>'accepted' or item.expires_at<=clock_timestamp()
        or existing.payload->>'ownerId' is distinct from item.sponsor_id::text
        or existing.payload->>'approvedBy' is distinct from item.sponsor_id::text
        or not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner')
      then raise exception 'operational_assignment_denied'; end if;
    elsif p_access='checkpoint' then
      if existing.payload->>'status' not in ('running','paused','cancelled')
        or item.active_actor_id<>p_user_id or item.active_step_id is null or item.active_lease_id is null or item.active_attempt is null
        or not exists(select 1 from jsonb_array_elements(existing.payload->'steps') step
          where step->>'id'=item.active_step_id and step->>'status'='running'
            and step->>'leaseId'=item.active_lease_id and (step->>'attempt')::integer=item.active_attempt)
      then raise exception 'operational_assignment_denied'; end if;
    end if;
  end if;
  return jsonb_build_object(
    'assignment',to_jsonb(item),
    'responsibility',jsonb_build_object('id',existing.id,'workspaceId',existing.workspace_id,'payload',existing.payload)
  );
end $$;

create or replace function public.checkpoint_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid,p_expected_revision integer,
  p_payload jsonb,p_phase text
) returns setof public.saved_product_work
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments; existing public.saved_product_work; next_event jsonb;
  prior_step jsonb; next_step jsonb; step_index integer; changed_steps integer:=0; running_index integer:=-1; provider_member boolean;
begin
  if p_phase not in ('start','outcome')
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into item from public.operational_assignments where id=p_assignment_id for update;
  if not found or item.assignee_user_id<>p_user_id or item.assignee_email<>lower(p_verified_email)
  then raise exception 'operational_assignment_denied'; end if;
  if item.assignee_kind='agency' then
    select item.assignee_workspace_id is not null
      and exists(select 1 from public.workspaces where id=item.assignee_workspace_id and kind='agency')
      and exists(select 1 from public.workspace_memberships where workspace_id=item.assignee_workspace_id and user_id=p_user_id)
      into provider_member;
  else
    select exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id) into provider_member;
  end if;
  if not provider_member then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=item.work_id and workspace_id=item.workspace_id for update;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or public.operational_assignment_work_scope(existing.payload) is distinct from item.work_scope
  then raise exception 'operational_assignment_conflict'; end if;
  if p_phase='start' and (
    item.status<>'accepted' or item.expires_at<=clock_timestamp()
    or existing.payload->>'ownerId' is distinct from item.sponsor_id::text
    or existing.payload->>'approvedBy' is distinct from item.sponsor_id::text
    or not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner')
  ) then raise exception 'operational_assignment_denied'; end if;
  if p_expected_revision is null or p_expected_revision<0 or existing.payload->>'revision' is distinct from p_expected_revision::text
  then raise exception 'responsibility_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>1048576
    or p_payload->>'version' is distinct from '1'
    or p_payload->>'revision' is distinct from (p_expected_revision+1)::text
    or public.operational_assignment_work_scope(p_payload) is distinct from item.work_scope
    or p_payload->'title' is distinct from existing.payload->'title'
    or p_payload->'intent' is distinct from existing.payload->'intent'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or coalesce(p_payload->>'status','') not in ('running','waiting','ready','needs_attention','completed','cancelled')
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or jsonb_array_length(p_payload->'history')<>jsonb_array_length(existing.payload->'history')+1
    or jsonb_array_length(p_payload->'history')>1000
    or ((p_payload->'history')-(jsonb_array_length(p_payload->'history')-1)) is distinct from existing.payload->'history'
    or jsonb_array_length(p_payload->'steps')<>jsonb_array_length(existing.payload->'steps')
  then raise exception 'operational_assignment_conflict'; end if;
  next_event:=p_payload->'history'->(jsonb_array_length(p_payload->'history')-1);
  if next_event->>'actorId' is distinct from p_user_id::text
    or next_event->>'revision' is distinct from (p_expected_revision+1)::text
    or (p_phase='start' and next_event->>'kind'<>'started')
    or (p_phase='outcome' and next_event->>'kind'<>'outcome')
  then raise exception 'operational_assignment_denied'; end if;
  for step_index in 0..jsonb_array_length(p_payload->'steps')-1 loop
    prior_step:=existing.payload->'steps'->step_index;
    next_step:=p_payload->'steps'->step_index;
    if prior_step is distinct from next_step then changed_steps:=changed_steps+1; running_index:=step_index; end if;
  end loop;
  if changed_steps<>1 then raise exception 'operational_assignment_conflict'; end if;
  prior_step:=existing.payload->'steps'->running_index;
  next_step:=p_payload->'steps'->running_index;
  if p_phase='start' then
    if existing.payload->>'status' not in ('ready','waiting') or p_payload->>'status'<>'running'
      or prior_step->>'status' not in ('pending','waiting') or next_step->>'status'<>'running'
      or (next_step->>'attempt')::integer<>(prior_step->>'attempt')::integer+1
      or coalesce(next_step->>'leaseId','')='' or coalesce(next_step->>'startedAt','')=''
    then raise exception 'operational_assignment_conflict'; end if;
    update public.operational_assignments set active_step_id=next_step->>'id',active_lease_id=next_step->>'leaseId',
      active_attempt=(next_step->>'attempt')::integer,active_actor_id=p_user_id,active_started_at=(next_step->>'startedAt')::timestamptz
      where id=item.id;
  else
    if existing.payload->>'status' not in ('running','paused','cancelled') or prior_step->>'status'<>'running'
      or next_step->>'status' not in ('waiting','completed','accepted','failed','unknown')
      or next_step->>'leaseId' is distinct from prior_step->>'leaseId'
      or next_step->>'attempt' is distinct from prior_step->>'attempt'
      or item.active_step_id is distinct from prior_step->>'id'
      or item.active_lease_id is distinct from prior_step->>'leaseId'
      or item.active_attempt is distinct from (prior_step->>'attempt')::integer
      or item.active_actor_id is distinct from p_user_id
      or coalesce(next_step->>'finishedAt','')=''
    then raise exception 'operational_assignment_conflict'; end if;
    update public.operational_assignments set active_step_id=null,active_lease_id=null,active_attempt=null,active_actor_id=null,active_started_at=null where id=item.id;
  end if;
  return query update public.saved_product_work set payload=p_payload,title=p_payload->>'title',updated_at=clock_timestamp()
    where id=existing.id returning *;
end $$;

revoke all on function public.accept_operational_assignment(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.read_operational_assignment(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.checkpoint_operational_assignment(uuid,text,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.accept_operational_assignment(uuid,text,uuid) to service_role;
grant execute on function public.read_operational_assignment(uuid,text,uuid,text) to service_role;
grant execute on function public.checkpoint_operational_assignment(uuid,text,uuid,integer,jsonb,text) to service_role;

-- Provider responsibilities name the agency workspace explicitly. The
-- metadata helper stays immutable, so it validates the UUID-shaped identity;
-- the install helper additionally verifies that the referenced workspace is
-- an agency and belongs to a different workspace than the customer.
create or replace function public.offering_assert_install_payload(
  p_definition_id text,p_definition_version text,p_business_id uuid,p_configuration jsonb,
  p_native_resources jsonb,p_responsibility jsonb,p_accepted_scope text[],p_surface_ids text[]
) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare application_id uuid; agency_id uuid;
begin
  if p_definition_id is distinct from 'private_staff_requests' or p_definition_version is distinct from '1.0.0' then raise exception 'offering_definition_not_installable'; end if;
  if jsonb_typeof(p_configuration) is distinct from 'object' or char_length(p_configuration::text)>4000
    or p_configuration-array['displayName','instructions']::text[]<>'{}'::jsonb
    or (p_configuration?'displayName' and (jsonb_typeof(p_configuration->'displayName')<>'string' or char_length(btrim(p_configuration->>'displayName')) not between 1 and 80))
    or (p_configuration?'instructions' and (jsonb_typeof(p_configuration->'instructions')<>'string' or char_length(btrim(p_configuration->>'instructions')) not between 1 and 500)) then raise exception 'offering_configuration_invalid'; end if;
  if jsonb_typeof(p_native_resources) is distinct from 'array' or jsonb_array_length(p_native_resources)<>1
    or p_native_resources->0->>'kind'<>'application' or (p_native_resources->0)-array['kind','id']::text[]<>'{}'::jsonb then raise exception 'offering_native_resources_invalid'; end if;
  begin application_id:=(p_native_resources->0->>'id')::uuid; exception when invalid_text_representation then raise exception 'offering_native_resources_invalid'; end;
  perform 1 from public.saved_product_work work join public.application_states app on app.work_id=work.id and app.workspace_id=work.workspace_id
    where work.id=application_id and work.workspace_id=p_business_id and work.product_id='applications' and work.resource_kind='application'
      and app.lifecycle_status='installed' and app.current_release_version is not null for share of work,app;
  if not found then raise exception 'offering_native_resource_outside_business'; end if;
  if p_accepted_scope is null or not(p_accepted_scope@>array['submit_requests','review_requests']::text[])
    or not(p_accepted_scope<@array['submit_requests','review_requests']::text[])
    or cardinality(p_accepted_scope)<>cardinality(array(select distinct unnest(p_accepted_scope))) then raise exception 'offering_scope_invalid'; end if;
  if p_surface_ids is null or not(p_surface_ids@>array['staff_app','business_workspace']::text[])
    or not(p_surface_ids<@array['staff_app','business_workspace']::text[])
    or cardinality(p_surface_ids)<>cardinality(array(select distinct unnest(p_surface_ids))) then raise exception 'offering_surfaces_invalid'; end if;
  if jsonb_typeof(p_responsibility) is distinct from 'object' then raise exception 'offering_responsibility_invalid'; end if;
  if p_responsibility->>'kind'='customer_operated' then
    if p_responsibility-array['kind','providerName']::text[]<>'{}'::jsonb or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120 then raise exception 'offering_responsibility_invalid'; end if;
  elsif p_responsibility->>'kind'='provider_requested' then
    if jsonb_typeof(p_responsibility->'providerKind') is distinct from 'string'
      or p_responsibility->>'providerKind' not in ('strelva','agency','named_third_party')
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120
      or (p_responsibility?'requestNote' and (jsonb_typeof(p_responsibility->'requestNote') is distinct from 'string' or char_length(btrim(p_responsibility->>'requestNote')) not between 1 and 500)) then raise exception 'offering_responsibility_invalid'; end if;
    if p_responsibility->>'providerKind'='agency' then
      begin agency_id:=(p_responsibility->>'agencyWorkspaceId')::uuid; exception when invalid_text_representation then raise exception 'offering_responsibility_invalid'; end;
      if p_responsibility-array['kind','providerKind','providerName','agencyWorkspaceId','requestNote']::text[]<>'{}'::jsonb
        or agency_id=p_business_id or not exists(select 1 from public.workspaces where id=agency_id and kind='agency') then raise exception 'offering_responsibility_invalid'; end if;
    elsif p_responsibility-array['kind','providerKind','providerName','requestNote']::text[]<>'{}'::jsonb
      or p_responsibility?'agencyWorkspaceId' then raise exception 'offering_responsibility_invalid'; end if;
  else raise exception 'offering_responsibility_invalid'; end if;
end $$;

create or replace function public.offering_assert_metadata(
  p_configuration jsonb,p_responsibility jsonb,p_accepted_scope text[],p_surface_ids text[]
) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
begin
  if jsonb_typeof(p_configuration) is distinct from 'object' or char_length(p_configuration::text)>4000
    or p_configuration-array['displayName','instructions']::text[]<>'{}'::jsonb
    or (p_configuration?'displayName' and (jsonb_typeof(p_configuration->'displayName')<>'string' or char_length(btrim(p_configuration->>'displayName')) not between 1 and 80))
    or (p_configuration?'instructions' and (jsonb_typeof(p_configuration->'instructions')<>'string' or char_length(btrim(p_configuration->>'instructions')) not between 1 and 500)) then raise exception 'offering_configuration_invalid'; end if;
  if p_accepted_scope is null or not(p_accepted_scope@>array['submit_requests','review_requests']::text[])
    or not(p_accepted_scope<@array['submit_requests','review_requests']::text[])
    or cardinality(p_accepted_scope)<>cardinality(array(select distinct unnest(p_accepted_scope))) then raise exception 'offering_scope_invalid'; end if;
  if p_surface_ids is null or not(p_surface_ids@>array['staff_app','business_workspace']::text[])
    or not(p_surface_ids<@array['staff_app','business_workspace']::text[])
    or cardinality(p_surface_ids)<>cardinality(array(select distinct unnest(p_surface_ids))) then raise exception 'offering_surfaces_invalid'; end if;
  if jsonb_typeof(p_responsibility) is distinct from 'object' then raise exception 'offering_responsibility_invalid'; end if;
  if p_responsibility->>'kind'='customer_operated' then
    if p_responsibility-array['kind','providerName']::text[]<>'{}'::jsonb or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120 then raise exception 'offering_responsibility_invalid'; end if;
  elsif p_responsibility->>'kind'='provider_requested' then
    if jsonb_typeof(p_responsibility->'providerKind') is distinct from 'string'
      or p_responsibility->>'providerKind' not in ('strelva','agency','named_third_party')
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120
      or (p_responsibility?'requestNote' and (jsonb_typeof(p_responsibility->'requestNote') is distinct from 'string' or char_length(btrim(p_responsibility->>'requestNote')) not between 1 and 500)) then raise exception 'offering_responsibility_invalid'; end if;
    if p_responsibility->>'providerKind'='agency' then
      if p_responsibility-array['kind','providerKind','providerName','agencyWorkspaceId','requestNote']::text[]<>'{}'::jsonb
        or jsonb_typeof(p_responsibility->'agencyWorkspaceId') is distinct from 'string'
        or p_responsibility->>'agencyWorkspaceId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'offering_responsibility_invalid'; end if;
    elsif p_responsibility-array['kind','providerKind','providerName','requestNote']::text[]<>'{}'::jsonb
      or p_responsibility?'agencyWorkspaceId' then raise exception 'offering_responsibility_invalid'; end if;
  else raise exception 'offering_responsibility_invalid'; end if;
end $$;

revoke all on function public.offering_assert_install_payload(text,text,uuid,jsonb,jsonb,jsonb,text[],text[]) from public,anon,authenticated;
revoke all on function public.offering_assert_metadata(jsonb,jsonb,text[],text[]) from public,anon,authenticated;

create or replace function public.read_provider_deliveries(
  p_user_id uuid,p_verified_email text,p_business_id uuid,p_delivery_id uuid default null
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare customer_member boolean; provider_member boolean;
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'provider_delivery_denied'; end if;
  select exists(select 1 from public.workspace_memberships wm join public.workspaces w on w.id=wm.workspace_id
    where wm.workspace_id=p_business_id and wm.user_id=p_user_id and w.kind='customer') into customer_member;
  if not customer_member then
    select exists(
      select 1 from public.operational_assignments assignment
      where assignment.workspace_id=p_business_id and assignment.assignee_user_id=p_user_id
        and assignment.assignee_kind='agency' and assignment.status in ('offered','accepted')
        and assignment.expires_at>clock_timestamp()
        and exists(select 1 from public.workspaces where id=assignment.assignee_workspace_id and kind='agency')
        and exists(select 1 from public.workspace_memberships where workspace_id=assignment.assignee_workspace_id and user_id=p_user_id)
    ) into provider_member;
    if not provider_member then raise exception 'provider_delivery_denied'; end if;
  end if;
  if p_delivery_id is not null and not exists(select 1 from public.offering_provider_deliveries where id=p_delivery_id and business_workspace_id=p_business_id)
  then raise exception 'provider_delivery_not_found'; end if;
  return query select delivery.* from public.offering_provider_deliveries delivery
    where delivery.business_workspace_id=p_business_id
      and (p_delivery_id is null or delivery.id=p_delivery_id)
      and (customer_member or exists(select 1 from public.operational_assignments assignment
        where assignment.id=delivery.assignment_id and assignment.assignee_user_id=p_user_id and assignment.assignee_kind='agency'
          and assignment.status in ('offered','accepted') and assignment.expires_at>clock_timestamp()
          and assignment.assignee_workspace_id is not null
          and exists(select 1 from public.workspace_memberships where workspace_id=assignment.assignee_workspace_id and user_id=p_user_id)))
    order by delivery.requested_at desc,delivery.id;
end $$;

revoke all on function public.read_provider_deliveries(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_provider_deliveries(uuid,text,uuid,uuid) to service_role;

create or replace function public.read_provider_delivery(
  p_user_id uuid,p_verified_email text,p_delivery_id uuid
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.offering_provider_deliveries%rowtype; assignment public.operational_assignments%rowtype; customer_member boolean;
begin
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id;
  if not found then raise exception 'provider_delivery_not_found'; end if;
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'provider_delivery_denied'; end if;
  select exists(select 1 from public.workspace_memberships wm join public.workspaces w on w.id=wm.workspace_id
    where wm.workspace_id=delivery.business_workspace_id and wm.user_id=p_user_id and w.kind='customer') into customer_member;
  if not customer_member then
    select * into assignment from public.operational_assignments where id=delivery.assignment_id;
    if not found or assignment.assignee_user_id<>p_user_id or assignment.assignee_email<>lower(btrim(p_verified_email))
      or assignment.status not in ('offered','accepted') or assignment.expires_at<=clock_timestamp() then raise exception 'provider_delivery_denied'; end if;
    if assignment.assignee_kind='agency' then
      if assignment.assignee_workspace_id is null
        or not exists(select 1 from public.workspaces where id=assignment.assignee_workspace_id and kind='agency')
        or not exists(select 1 from public.workspace_memberships where workspace_id=assignment.assignee_workspace_id and user_id=p_user_id) then raise exception 'provider_delivery_denied'; end if;
    elsif assignment.assignee_kind='strelva' then
      if not exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null)
        or not exists(select 1 from public.workspace_memberships where workspace_id=delivery.business_workspace_id and user_id=p_user_id) then raise exception 'provider_delivery_denied'; end if;
    else raise exception 'provider_delivery_denied'; end if;
  end if;
  return query select * from public.offering_provider_deliveries where id=p_delivery_id;
end $$;

create or replace function public.request_provider_delivery(
  p_user_id uuid,p_verified_email text,p_business_id uuid,p_installation_id uuid,
  p_assignment_id uuid,p_idempotency_key text,p_command_digest text
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare installation public.offering_installations%rowtype; assignment public.operational_assignments%rowtype;
  responsibility public.saved_product_work%rowtype; prior public.offering_provider_deliveries%rowtype; created public.offering_provider_deliveries%rowtype;
  provider_kind text; agency_id uuid;
begin
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then raise exception 'provider_delivery_idempotency_invalid'; end if;
  select * into installation from public.offering_installations where id=p_installation_id and business_workspace_id=p_business_id for share;
  if not found or installation.status<>'active' or installation.responsibility->>'kind' is distinct from 'provider_requested'
    or installation.responsibility->>'providerKind' not in ('strelva','agency') then raise exception 'provider_delivery_installation_invalid'; end if;
  provider_kind:=installation.responsibility->>'providerKind';
  if provider_kind='agency' then
    begin agency_id:=(installation.responsibility->>'agencyWorkspaceId')::uuid; exception when invalid_text_representation then raise exception 'provider_delivery_installation_invalid'; end;
  end if;
  select * into assignment from public.operational_assignments where id=p_assignment_id for share;
  if not found or assignment.workspace_id<>p_business_id or assignment.sponsor_id<>p_user_id
    or assignment.status not in ('offered','accepted') or assignment.expires_at<=clock_timestamp() then raise exception 'provider_delivery_assignment_invalid'; end if;
  if provider_kind='strelva' then
    if assignment.assignee_kind<>'strelva' or assignment.assignee_workspace_id is not null
      or not exists(select 1 from public.super_admins where user_id=assignment.assignee_user_id and revoked_at is null)
      or not exists(select 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=assignment.assignee_user_id) then raise exception 'provider_delivery_assignment_invalid'; end if;
  else
    if assignment.assignee_kind<>'agency' or assignment.assignee_workspace_id<>agency_id
      or not exists(select 1 from public.workspaces where id=agency_id and kind='agency')
      or not exists(select 1 from public.workspace_memberships where workspace_id=agency_id and user_id=assignment.assignee_user_id) then raise exception 'provider_delivery_assignment_invalid'; end if;
  end if;
  select * into responsibility from public.saved_product_work where id=assignment.work_id and workspace_id=p_business_id for share;
  if not found or exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
      where not exists(select 1 from jsonb_array_elements(installation.native_resources) resource where resource->>'id'=step->>'workId'))
    or exists(select 1 from jsonb_array_elements(installation.native_resources) resource
      where not exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step where step->>'workId'=resource->>'id')) then raise exception 'provider_delivery_target_mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-delivery:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into prior from public.offering_provider_deliveries where business_workspace_id=p_business_id and idempotency_key=p_idempotency_key for update;
  if found then
    if prior.command_digest<>p_command_digest then raise exception 'provider_delivery_idempotency_conflict'; end if;
    return query select * from public.offering_provider_deliveries where id=prior.id; return;
  end if;
  insert into public.offering_provider_deliveries(
    business_workspace_id,installation_id,assignment_id,scope,idempotency_key,command_digest,requested_by,expires_at,history
  ) values (
    p_business_id,p_installation_id,p_assignment_id,installation.accepted_scope,p_idempotency_key,p_command_digest,p_user_id,assignment.expires_at,
    jsonb_build_array(jsonb_build_object('kind','requested','actorId',p_user_id,'at',clock_timestamp(),'note',null))
  ) returning * into created;
  return query select * from public.offering_provider_deliveries where id=created.id;
end $$;

create or replace function public.accept_provider_delivery(
  p_user_id uuid,p_verified_email text,p_delivery_id uuid
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.offering_provider_deliveries%rowtype; assignment public.operational_assignments%rowtype;
  installation public.offering_installations%rowtype; responsibility public.saved_product_work%rowtype; provider_kind text; agency_id uuid;
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'provider_delivery_denied'; end if;
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'provider_delivery_not_found'; end if;
  select * into assignment from public.operational_assignments where id=delivery.assignment_id for share;
  if not found or assignment.assignee_user_id<>p_user_id or assignment.assignee_email<>lower(btrim(p_verified_email))
    or assignment.status<>'accepted' or assignment.expires_at<=clock_timestamp() or delivery.status not in ('requested','accepted') then raise exception 'provider_delivery_denied'; end if;
  select * into installation from public.offering_installations where id=delivery.installation_id and business_workspace_id=delivery.business_workspace_id for share;
  if not found or installation.status<>'active' or installation.responsibility->>'kind' is distinct from 'provider_requested'
    or installation.responsibility->>'providerKind' not in ('strelva','agency') then raise exception 'provider_delivery_denied'; end if;
  provider_kind:=installation.responsibility->>'providerKind';
  if provider_kind='agency' then
    begin agency_id:=(installation.responsibility->>'agencyWorkspaceId')::uuid; exception when invalid_text_representation then raise exception 'provider_delivery_denied'; end;
    if assignment.assignee_kind<>'agency' or assignment.assignee_workspace_id<>agency_id
      or not exists(select 1 from public.workspaces where id=agency_id and kind='agency')
      or not exists(select 1 from public.workspace_memberships where workspace_id=agency_id and user_id=p_user_id) then raise exception 'provider_delivery_denied'; end if;
  else
    if assignment.assignee_kind<>'strelva' or assignment.assignee_workspace_id is not null
      or not exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null)
      or not exists(select 1 from public.workspace_memberships where workspace_id=delivery.business_workspace_id and user_id=p_user_id) then raise exception 'provider_delivery_denied'; end if;
  end if;
  select * into responsibility from public.saved_product_work where id=assignment.work_id and workspace_id=delivery.business_workspace_id for share;
  if not found or exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
      where not exists(select 1 from jsonb_array_elements(installation.native_resources) resource where resource->>'id'=step->>'workId'))
    or exists(select 1 from jsonb_array_elements(installation.native_resources) resource
      where not exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step where step->>'workId'=resource->>'id')) then raise exception 'provider_delivery_denied'; end if;
  if delivery.status='accepted' then return query select * from public.offering_provider_deliveries where id=p_delivery_id; return; end if;
  return query update public.offering_provider_deliveries item set status='accepted',revision=item.revision+1,accepted_by=p_user_id,accepted_at=clock_timestamp(),
    history=item.history||jsonb_build_array(jsonb_build_object('kind','accepted','actorId',p_user_id,'at',clock_timestamp(),'note',null)) where item.id=p_delivery_id returning item.*;
end $$;

revoke all on function public.read_provider_delivery(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.request_provider_delivery(uuid,text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.accept_provider_delivery(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_provider_delivery(uuid,text,uuid) to service_role;
grant execute on function public.request_provider_delivery(uuid,text,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.accept_provider_delivery(uuid,text,uuid) to service_role;

-- The customer request, accepted installation scope, and provider delivery
-- scope are one exact set. Linking does not broaden an accepted request.
create or replace function public.link_service_request_delivery(
  p_user_id uuid,p_verified_email text,p_business_id uuid,p_request_id uuid,
  p_installation_id uuid,p_delivery_id uuid,p_expected_revision bigint,
  p_idempotency_key text,p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.service_requests%rowtype; created public.service_requests%rowtype; receipt public.service_request_commands%rowtype;
  installation public.offering_installations%rowtype; delivery public.offering_provider_deliveries%rowtype; assignment public.operational_assignments%rowtype;
  request_scope text[]; provider_kind text; agency_id uuid; request_agency_id uuid;
begin
  perform public.service_request_assert_customer(p_business_id,p_user_id,p_verified_email,true);
  select * into existing from public.service_requests where id=p_request_id and business_workspace_id=p_business_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then raise exception 'service_request_idempotency_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-request:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into receipt from public.service_request_commands where business_workspace_id=p_business_id and idempotency_key=p_idempotency_key for update;
  if found then
    if receipt.command_digest<>p_command_digest then raise exception 'service_request_idempotency_conflict'; end if;
    return query select * from public.service_requests where id=receipt.request_id and business_workspace_id=p_business_id; return;
  end if;
  if p_expected_revision is null or p_expected_revision<>existing.revision then raise exception 'service_request_revision_conflict'; end if;
  if existing.status<>'requested' or existing.provider_acceptance<>'accepted'
    or existing.installation_id is not null or existing.delivery_id is not null then raise exception 'service_request_delivery_not_ready'; end if;
  select * into installation from public.offering_installations where id=p_installation_id and business_workspace_id=p_business_id for share;
  if not found or installation.status<>'active' then raise exception 'service_request_installation_invalid'; end if;
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id and business_workspace_id=p_business_id
    and installation_id=p_installation_id for share;
  if not found or delivery.status<>'accepted' then raise exception 'service_request_delivery_missing'; end if;
  if cardinality(existing.scope)<>cardinality(installation.accepted_scope)
    or not(existing.scope<@installation.accepted_scope and installation.accepted_scope<@existing.scope)
    or cardinality(existing.scope)<>cardinality(delivery.scope)
    or not(existing.scope<@delivery.scope and delivery.scope<@existing.scope)
    or cardinality(installation.accepted_scope)<>cardinality(delivery.scope)
    or not(installation.accepted_scope<@delivery.scope and delivery.scope<@installation.accepted_scope) then raise exception 'service_request_scope_mismatch'; end if;
  select * into assignment from public.operational_assignments where id=delivery.assignment_id for share;
  if not found or assignment.workspace_id<>p_business_id or assignment.status not in ('accepted','offered') then raise exception 'service_request_delivery_missing'; end if;
  provider_kind:=installation.responsibility->>'providerKind';
  if existing.provider_kind='strelva' then
    if provider_kind is distinct from 'strelva' or assignment.assignee_kind<>'strelva' or assignment.assignee_workspace_id is not null then raise exception 'service_request_provider_mismatch'; end if;
  else
    begin request_agency_id:=existing.provider_agency_workspace_id; agency_id:=(installation.responsibility->>'agencyWorkspaceId')::uuid; exception when invalid_text_representation then raise exception 'service_request_provider_mismatch'; end;
    if provider_kind is distinct from 'agency' or request_agency_id is distinct from agency_id
      or assignment.assignee_kind<>'agency' or assignment.assignee_workspace_id is distinct from request_agency_id then raise exception 'service_request_provider_mismatch'; end if;
  end if;
  update public.service_requests set installation_id=p_installation_id,delivery_id=p_delivery_id,revision=revision+1,updated_at=clock_timestamp(),
    history=history||jsonb_build_array(jsonb_build_object('kind','delivery_linked','actorId',p_user_id::text,'at',clock_timestamp())) where id=existing.id returning * into created;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id) values(p_business_id,p_idempotency_key,p_command_digest,created.id);
  return next created;
end $$;

revoke all on function public.link_service_request_delivery(uuid,text,uuid,uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.link_service_request_delivery(uuid,text,uuid,uuid,uuid,uuid,bigint,text,text) to service_role;

create or replace function public.rehearse_application_candidate(
  p_work_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_expected_design_revision integer
) returns setof public.application_states
language plpgsql security definer set search_path=public,pg_temp as $$
declare state public.application_states%rowtype; record_row public.application_records%rowtype; checks jsonb; records_fit boolean:=true; delegated boolean;
begin
  perform public.application_lock_work(p_workspace_id,p_work_id);
  select exists(
    select 1 from public.operational_assignments assignment
    join public.saved_product_work responsibility on responsibility.id=assignment.work_id
    join public.offering_provider_deliveries delivery on delivery.assignment_id=assignment.id
    join public.offering_installations installation on installation.id=delivery.installation_id and installation.business_workspace_id=delivery.business_workspace_id
    where assignment.workspace_id=p_workspace_id and assignment.assignee_user_id=p_user_id and assignment.assignee_email=lower(p_verified_email)
      and assignment.status='accepted' and assignment.expires_at>clock_timestamp() and delivery.status='accepted'
      and delivery.business_workspace_id=p_workspace_id and installation.status='active'
      and installation.responsibility->>'kind'='provider_requested'
      and exists(select 1 from jsonb_array_elements(installation.native_resources) resource where resource->>'id'=p_work_id::text)
      and exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step where step->>'workId'=p_work_id::text and step->>'operation'='application.command' and step->'input'->>'kind'='rehearse')
      and (
        (assignment.assignee_kind='strelva' and assignment.assignee_workspace_id is null
          and exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null)
          and exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id))
        or
        (assignment.assignee_kind='agency' and assignment.assignee_workspace_id=(installation.responsibility->>'agencyWorkspaceId')::uuid
          and exists(select 1 from public.workspaces where id=assignment.assignee_workspace_id and kind='agency')
          and exists(select 1 from public.workspace_memberships where workspace_id=assignment.assignee_workspace_id and user_id=p_user_id))
      )
  ) into delegated;
  if not delegated then perform public.application_assert_identity(p_workspace_id,p_work_id,p_user_id,p_verified_email,true); end if;
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id=p_work_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if state.candidate_design_revision<>p_expected_design_revision then raise exception 'application_design_revision_conflict'; end if;
  for record_row in select * from public.application_records where work_id=p_work_id loop
    begin perform public.validate_application_record(state.candidate_spec,record_row.record_id,record_row.values); exception when others then records_fit:=false; end;
  end loop;
  checks:=jsonb_build_array(jsonb_build_object('name','Declared fields and approved components','passed',true),jsonb_build_object('name','Executable code rejected','passed',true),jsonb_build_object('name','Existing records fit this version','passed',records_fit));
  update public.application_states set candidate_rehearsal=jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks),updated_at=clock_timestamp() where work_id=p_work_id;
  perform public.application_touch_compatibility(p_work_id,p_user_id,'rehearse_candidate',jsonb_build_object('rehearsal',jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks),'candidate',jsonb_build_object('designRevision',state.candidate_design_revision,'specVersion',state.candidate_spec_version,'spec',state.candidate_spec,'rehearsal',jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks))));
  return query select * from public.application_states where work_id=p_work_id;
end $$;

revoke all on function public.rehearse_application_candidate(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.rehearse_application_candidate(uuid,uuid,uuid,text,integer) to service_role;
