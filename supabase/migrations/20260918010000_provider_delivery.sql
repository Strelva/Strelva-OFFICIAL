-- Provider delivery binds an explicit Strelva operational assignment to an
-- installed offering. It does not price work, create provider authority, or
-- accept a customer request on the provider's behalf.

-- Application setup is a local, zero-cost effect and is the installed resource
-- used by the first supported provider-delivery path. Delegation remains
-- limited to revise, rehearse, and install; publication, rollback, retirement,
-- access grants, paid work, and external effects remain owner-only.
create or replace function public.offer_operational_assignment(
  p_user_id uuid,p_verified_email text,p_work_id uuid,p_assignee_email text,
  p_assignee_kind text,p_expires_at timestamptz,p_idempotency_key text
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.saved_product_work; assignee_id uuid; prior public.operational_assignments;
  blocking public.operational_assignments; frozen_scope jsonb;
begin
  if p_assignee_kind not in ('agency','staff','strelva','agent')
    or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '90 days'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
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
  if p_assignee_kind='strelva' and not exists(
    select 1 from public.super_admins where user_id=assignee_id and revoked_at is null
  ) then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id=existing.workspace_id and user_id=assignee_id for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  frozen_scope:=public.operational_assignment_work_scope(existing.payload);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_work_id::text||':'||p_idempotency_key,0));
  select * into prior from public.operational_assignments
    where sponsor_id=p_user_id and work_id=p_work_id and offer_key=p_idempotency_key for update;
  if prior.id is null then
    select * into blocking from public.operational_assignments
      where work_id=p_work_id and status in ('offered','accepted') order by offered_at desc limit 1 for update;
  end if;
  select * into existing from public.saved_product_work where id=p_work_id for update;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text
    or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
    or existing.payload ? 'budgetId'
    or public.operational_assignment_work_scope(existing.payload) is distinct from frozen_scope
    or not exists(select 1 from public.workspace_memberships where workspace_id=existing.workspace_id and user_id=p_user_id and role='owner')
    or not exists(select 1 from public.workspace_memberships where workspace_id=existing.workspace_id and user_id=assignee_id)
  then raise exception 'operational_assignment_denied'; end if;
  select * into prior from public.operational_assignments
    where sponsor_id=p_user_id and work_id=p_work_id and offer_key=p_idempotency_key for update;
  if prior.id is null then
    select * into blocking from public.operational_assignments
      where work_id=p_work_id and status in ('offered','accepted') order by offered_at desc limit 1 for update;
  end if;
  if prior.id is not null then
    if prior.workspace_id<>existing.workspace_id or prior.work_id<>existing.id
      or prior.assignee_user_id<>assignee_id or prior.assignee_email<>lower(p_assignee_email)
      or prior.assignee_kind<>p_assignee_kind or prior.expires_at<>p_expires_at
      or prior.work_scope is distinct from frozen_scope
    then raise exception 'operational_assignment_conflict'; end if;
    return query select * from public.operational_assignments where id=prior.id;
    return;
  end if;
  if blocking.id is not null and blocking.expires_at<=clock_timestamp() then
    update public.operational_assignments set status='expired' where id=blocking.id;
  elsif blocking.id is not null then raise exception 'operational_assignment_conflict'; end if;
  return query insert into public.operational_assignments(
    workspace_id,work_id,sponsor_id,sponsor_email,assignee_user_id,assignee_email,
    assignee_kind,offer_key,work_scope,expires_at
  ) values(
    existing.workspace_id,existing.id,p_user_id,lower(p_verified_email),assignee_id,
    lower(p_assignee_email),p_assignee_kind,p_idempotency_key,frozen_scope,p_expires_at
  ) returning *;
end $$;

create table public.offering_provider_deliveries (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  installation_id uuid not null,
  assignment_id uuid not null references public.operational_assignments(id) on delete restrict,
  status text not null default 'requested' check (status in ('requested','accepted','revoked')),
  customer_decision text not null default 'pending' check (customer_decision in ('pending','confirmed','changes_requested')),
  revision bigint not null default 1 check (revision > 0),
  scope text[] not null check (cardinality(scope) between 1 and 16),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  requested_by uuid not null references public.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references public.users(id) on delete restrict,
  accepted_at timestamptz,
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or char_length(btrim(revocation_reason)) between 1 and 500),
  decided_by uuid references public.users(id) on delete restrict,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(btrim(decision_note)) between 1 and 1000),
  history jsonb not null check (jsonb_typeof(history)='array'),
  unique (business_workspace_id,idempotency_key),
  unique (assignment_id),
  foreign key (installation_id,business_workspace_id)
    references public.offering_installations(id,business_workspace_id) on delete restrict,
  check ((accepted_by is null)=(accepted_at is null)),
  check (status<>'accepted' or accepted_by is not null),
  check (status<>'requested' or accepted_by is null),
  check ((status='revoked')=(revoked_by is not null and revoked_at is not null and revocation_reason is not null)),
  check ((customer_decision='pending')=(decided_by is null and decided_at is null and decision_note is null))
);
create index offering_provider_deliveries_business_idx
  on public.offering_provider_deliveries(business_workspace_id,requested_at desc,id);
alter table public.offering_provider_deliveries enable row level security;
revoke all on table public.offering_provider_deliveries from public,anon,authenticated,service_role;

create function public.read_provider_deliveries(
  p_user_id uuid,p_verified_email text,p_business_id uuid,p_delivery_id uuid default null
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,false);
  if p_delivery_id is not null and not exists(
    select 1 from public.offering_provider_deliveries
      where id=p_delivery_id and business_workspace_id=p_business_id
  ) then raise exception 'provider_delivery_not_found'; end if;
  return query select delivery.* from public.offering_provider_deliveries delivery
    where delivery.business_workspace_id=p_business_id
      and (p_delivery_id is null or delivery.id=p_delivery_id)
    order by delivery.requested_at desc,delivery.id;
end $$;

create function public.read_provider_delivery(
  p_user_id uuid,p_verified_email text,p_delivery_id uuid
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.offering_provider_deliveries%rowtype;
begin
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id;
  if not found then raise exception 'provider_delivery_not_found'; end if;
  perform public.offering_assert_actor(delivery.business_workspace_id,p_user_id,p_verified_email,false);
  return query select * from public.offering_provider_deliveries where id=p_delivery_id;
end $$;

create function public.request_provider_delivery(
  p_user_id uuid,p_verified_email text,p_business_id uuid,p_installation_id uuid,
  p_assignment_id uuid,p_idempotency_key text,p_command_digest text
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare installation public.offering_installations%rowtype;
  assignment public.operational_assignments%rowtype;
  responsibility public.saved_product_work%rowtype;
  prior public.offering_provider_deliveries%rowtype;
  created public.offering_provider_deliveries%rowtype;
begin
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
  then raise exception 'provider_delivery_idempotency_invalid'; end if;
  select * into installation from public.offering_installations
    where id=p_installation_id and business_workspace_id=p_business_id for share;
  if not found or installation.status<>'active'
    or installation.responsibility->>'kind' is distinct from 'provider_requested'
    or installation.responsibility->>'providerKind' is distinct from 'strelva'
  then raise exception 'provider_delivery_installation_invalid'; end if;
  select * into assignment from public.operational_assignments where id=p_assignment_id for share;
  if not found or assignment.workspace_id<>p_business_id or assignment.sponsor_id<>p_user_id
    or assignment.assignee_kind<>'strelva' or assignment.status not in ('offered','accepted')
    or assignment.expires_at<=clock_timestamp()
    or not exists(select 1 from public.super_admins where user_id=assignment.assignee_user_id and revoked_at is null)
  then raise exception 'provider_delivery_assignment_invalid'; end if;
  select * into responsibility from public.saved_product_work
    where id=assignment.work_id and workspace_id=p_business_id for share;
  if not found
    or exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
      where not exists(select 1 from jsonb_array_elements(installation.native_resources) resource
        where resource->>'id'=step->>'workId'))
    or exists(select 1 from jsonb_array_elements(installation.native_resources) resource
      where not exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
        where step->>'workId'=resource->>'id'))
  then raise exception 'provider_delivery_target_mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-delivery:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into prior from public.offering_provider_deliveries
    where business_workspace_id=p_business_id and idempotency_key=p_idempotency_key for update;
  if found then
    if prior.command_digest<>p_command_digest then raise exception 'provider_delivery_idempotency_conflict'; end if;
    return query select * from public.offering_provider_deliveries where id=prior.id;
    return;
  end if;
  insert into public.offering_provider_deliveries(
    business_workspace_id,installation_id,assignment_id,scope,idempotency_key,
    command_digest,requested_by,expires_at,history
  ) values (
    p_business_id,p_installation_id,p_assignment_id,installation.accepted_scope,
    p_idempotency_key,p_command_digest,p_user_id,assignment.expires_at,
    jsonb_build_array(jsonb_build_object('kind','requested','actorId',p_user_id,'at',clock_timestamp(),'note',null))
  ) returning * into created;
  return query select * from public.offering_provider_deliveries where id=created.id;
end $$;

create function public.accept_provider_delivery(
  p_user_id uuid,p_verified_email text,p_delivery_id uuid
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.offering_provider_deliveries%rowtype;
  assignment public.operational_assignments%rowtype;
  installation public.offering_installations%rowtype;
  responsibility public.saved_product_work%rowtype;
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null;
  if not found then raise exception 'provider_delivery_denied'; end if;
  perform 1 from public.super_admins where user_id=p_user_id and revoked_at is null for share;
  if not found then raise exception 'provider_delivery_denied'; end if;
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'provider_delivery_not_found'; end if;
  select * into assignment from public.operational_assignments where id=delivery.assignment_id for share;
  if not found or assignment.assignee_user_id<>p_user_id or assignment.assignee_email<>lower(p_verified_email)
    or assignment.assignee_kind<>'strelva' or assignment.status<>'accepted'
    or assignment.expires_at<=clock_timestamp() or delivery.status not in ('requested','accepted')
  then raise exception 'provider_delivery_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id=delivery.business_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'provider_delivery_denied'; end if;
  select * into installation from public.offering_installations
    where id=delivery.installation_id and business_workspace_id=delivery.business_workspace_id for share;
  if not found or installation.status<>'active'
    or installation.responsibility->>'kind' is distinct from 'provider_requested'
    or installation.responsibility->>'providerKind' is distinct from 'strelva'
  then raise exception 'provider_delivery_denied'; end if;
  select * into responsibility from public.saved_product_work
    where id=assignment.work_id and workspace_id=delivery.business_workspace_id for share;
  if not found
    or exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
      where not exists(select 1 from jsonb_array_elements(installation.native_resources) resource
        where resource->>'id'=step->>'workId'))
    or exists(select 1 from jsonb_array_elements(installation.native_resources) resource
      where not exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
        where step->>'workId'=resource->>'id'))
  then raise exception 'provider_delivery_denied'; end if;
  if delivery.status='accepted' then
    return query select * from public.offering_provider_deliveries where id=p_delivery_id;
    return;
  end if;
  return query update public.offering_provider_deliveries item set
    status='accepted',revision=item.revision+1,accepted_by=p_user_id,accepted_at=clock_timestamp(),
    history=item.history||jsonb_build_array(jsonb_build_object('kind','accepted','actorId',p_user_id,'at',clock_timestamp(),'note',null))
    where item.id=p_delivery_id returning item.*;
end $$;

create function public.revoke_provider_delivery(
  p_user_id uuid,p_verified_email text,p_delivery_id uuid,p_expected_revision bigint,p_reason text
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.offering_provider_deliveries%rowtype;
  assignment public.operational_assignments%rowtype;
begin
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'provider_delivery_not_found'; end if;
  perform public.offering_assert_actor(delivery.business_workspace_id,p_user_id,p_verified_email,true);
  if delivery.status='revoked' then return query select * from public.offering_provider_deliveries where id=p_delivery_id; return; end if;
  if delivery.revision<>p_expected_revision then raise exception 'provider_delivery_revision_conflict'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'provider_delivery_reason_invalid'; end if;
  perform public.revoke_operational_assignment(p_user_id,p_verified_email,delivery.assignment_id);
  return query update public.offering_provider_deliveries item set
    status='revoked',revision=item.revision+1,revoked_by=p_user_id,revoked_at=clock_timestamp(),revocation_reason=btrim(p_reason),
    history=item.history||jsonb_build_array(jsonb_build_object('kind','revoked','actorId',p_user_id,'at',clock_timestamp(),'note',btrim(p_reason)))
    where item.id=p_delivery_id returning item.*;
end $$;

create function public.decide_provider_delivery(
  p_user_id uuid,p_verified_email text,p_delivery_id uuid,p_expected_revision bigint,
  p_decision text,p_note text
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.offering_provider_deliveries%rowtype;
  assignment public.operational_assignments%rowtype;
  responsibility public.saved_product_work%rowtype;
begin
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'provider_delivery_not_found'; end if;
  perform public.offering_assert_actor(delivery.business_workspace_id,p_user_id,p_verified_email,true);
  if delivery.status<>'accepted' or delivery.revision<>p_expected_revision
    or p_decision not in ('confirmed','changes_requested')
    or p_note is null or char_length(btrim(p_note)) not between 1 and 1000
  then raise exception 'provider_delivery_decision_invalid'; end if;
  select * into assignment from public.operational_assignments where id=delivery.assignment_id for share;
  select * into responsibility from public.saved_product_work
    where id=assignment.work_id and workspace_id=delivery.business_workspace_id for share;
  if not found or responsibility.payload->>'status'<>'completed' then raise exception 'provider_delivery_work_incomplete'; end if;
  return query update public.offering_provider_deliveries item set
    customer_decision=p_decision,revision=item.revision+1,decided_by=p_user_id,decided_at=clock_timestamp(),decision_note=btrim(p_note),
    history=item.history||jsonb_build_array(jsonb_build_object('kind',p_decision,'actorId',p_user_id,'at',clock_timestamp(),'note',btrim(p_note)))
    where item.id=p_delivery_id returning item.*;
end $$;

-- An accepted internal provider assignment may rehearse only the exact
-- installed application named by its accepted delivery. This preserves the
-- application audit actor without granting the operator general app-manager
-- authority or any publish/retire capability.
create or replace function public.rehearse_application_candidate(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_design_revision integer
) returns setof public.application_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  state public.application_states%rowtype;
  record_row public.application_records%rowtype;
  checks jsonb;
  records_fit boolean := true;
  delegated boolean;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  select exists(
    select 1
    from public.operational_assignments assignment
    join public.saved_product_work responsibility on responsibility.id=assignment.work_id
    join public.offering_provider_deliveries delivery on delivery.assignment_id=assignment.id
    join public.offering_installations installation on installation.id=delivery.installation_id
      and installation.business_workspace_id=delivery.business_workspace_id
    where assignment.workspace_id=p_workspace_id
      and assignment.assignee_user_id=p_user_id
      and assignment.assignee_email=lower(p_verified_email)
      and assignment.assignee_kind='strelva'
      and assignment.status='accepted'
      and assignment.expires_at>clock_timestamp()
      and delivery.status='accepted'
      and delivery.business_workspace_id=p_workspace_id
      and installation.status='active'
      and exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null)
      and exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id)
      and exists(select 1 from jsonb_array_elements(installation.native_resources) resource where resource->>'id'=p_work_id::text)
      and exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
        where step->>'workId'=p_work_id::text and step->>'operation'='application.command'
          and step->'input'->>'kind'='rehearse')
  ) into delegated;
  if not delegated then
    perform public.application_assert_identity(p_workspace_id,p_work_id,p_user_id,p_verified_email,true);
  end if;
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id=p_work_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if state.candidate_design_revision<>p_expected_design_revision then raise exception 'application_design_revision_conflict'; end if;
  for record_row in select * from public.application_records where work_id=p_work_id loop
    begin
      perform public.validate_application_record(state.candidate_spec,record_row.record_id,record_row.values);
    exception when others then records_fit:=false;
    end;
  end loop;
  checks:=jsonb_build_array(
    jsonb_build_object('name','Declared fields and approved components','passed',true),
    jsonb_build_object('name','Executable code rejected','passed',true),
    jsonb_build_object('name','Existing records fit this version','passed',records_fit)
  );
  update public.application_states set candidate_rehearsal=jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks),updated_at=clock_timestamp() where work_id=p_work_id;
  perform public.application_touch_compatibility(p_work_id,p_user_id,'rehearse_candidate',jsonb_build_object(
    'rehearsal',jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks),
    'candidate',jsonb_build_object('designRevision',state.candidate_design_revision,'specVersion',state.candidate_spec_version,'spec',state.candidate_spec,'rehearsal',jsonb_build_object('specVersion',state.candidate_spec_version,'checks',checks))
  ));
  return query select * from public.application_states where work_id=p_work_id;
end $$;

revoke all on function public.read_provider_deliveries(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.read_provider_delivery(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.request_provider_delivery(uuid,text,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.accept_provider_delivery(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.revoke_provider_delivery(uuid,text,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.decide_provider_delivery(uuid,text,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.read_provider_deliveries(uuid,text,uuid,uuid) to service_role;
grant execute on function public.read_provider_delivery(uuid,text,uuid) to service_role;
grant execute on function public.request_provider_delivery(uuid,text,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.accept_provider_delivery(uuid,text,uuid) to service_role;
grant execute on function public.revoke_provider_delivery(uuid,text,uuid,bigint,text) to service_role;
grant execute on function public.decide_provider_delivery(uuid,text,uuid,bigint,text,text) to service_role;
