-- A customer may grant a named agency operator authority to edit the
-- candidate of one already installed native application. The grant is an
-- additional, revocable fact. An accepted assignment or a provider read
-- grant alone never implies draft-edit authority.

create table public.agency_application_draft_grants (
  id uuid primary key default gen_random_uuid(),
  application_work_id uuid not null references public.saved_product_work(id) on delete cascade,
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  installation_id uuid not null,
  delivery_id uuid not null references public.offering_provider_deliveries(id) on delete restrict,
  assignment_id uuid not null references public.operational_assignments(id) on delete restrict,
  agency_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  operator_user_id uuid not null references public.users(id) on delete restrict,
  granted_by uuid not null references public.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete restrict,
  unique (application_work_id, assignment_id),
  foreign key (installation_id, business_workspace_id)
    references public.offering_installations(id, business_workspace_id) on delete restrict,
  check (expires_at > created_at),
  check ((status = 'revoked') = (revoked_at is not null and revoked_by is not null))
);

create index agency_application_draft_grants_operator_idx
  on public.agency_application_draft_grants(operator_user_id, status, expires_at);
create index agency_application_draft_grants_application_idx
  on public.agency_application_draft_grants(application_work_id, created_at desc);

alter table public.agency_application_draft_grants enable row level security;
revoke all on table public.agency_application_draft_grants from public, anon, authenticated, service_role;

-- This target query is shared by grant creation, grant reads, and the native
-- candidate write. Keeping the delivery/install/assignment checks together
-- prevents one path from accidentally surviving a provider revocation.
create or replace function public.agency_application_draft_target(
  p_delivery_id uuid,
  p_work_id uuid
) returns table (
  business_workspace_id uuid,
  installation_id uuid,
  delivery_id uuid,
  assignment_id uuid,
  agency_workspace_id uuid,
  operator_user_id uuid,
  expires_at timestamptz
)
language sql security definer set search_path = public, pg_temp as $$
  select delivery.business_workspace_id,
    installation.id,
    delivery.id,
    assignment.id,
    assignment.assignee_workspace_id,
    assignment.assignee_user_id,
    least(assignment.expires_at, delivery.expires_at)
  from public.offering_provider_deliveries delivery
  join public.operational_assignments assignment
    on assignment.id = delivery.assignment_id
  join public.saved_product_work responsibility
    on responsibility.id = assignment.work_id
    and responsibility.workspace_id = assignment.workspace_id
  join public.offering_installations installation
    on installation.id = delivery.installation_id
    and installation.business_workspace_id = delivery.business_workspace_id
  join public.saved_product_work application
    on application.id = p_work_id
    and application.workspace_id = delivery.business_workspace_id
    and application.product_id = 'applications'
    and application.resource_kind = 'application'
  join public.application_states state
    on state.work_id = application.id
    and state.workspace_id = application.workspace_id
  join public.workspaces customer
    on customer.id = delivery.business_workspace_id
    and customer.kind = 'customer'
  join public.workspace_memberships sponsor_member
    on sponsor_member.workspace_id = delivery.business_workspace_id
    and sponsor_member.user_id = assignment.sponsor_id
    and sponsor_member.role = 'owner'
  join public.workspaces agency
    on agency.id = assignment.assignee_workspace_id
    and agency.kind = 'agency'
  where delivery.id = p_delivery_id
    and delivery.status = 'accepted'
    and delivery.expires_at > clock_timestamp()
    and assignment.workspace_id = delivery.business_workspace_id
    and assignment.assignee_kind = 'agency'
    and assignment.status = 'accepted'
    and assignment.expires_at > clock_timestamp()
    and assignment.assignee_workspace_id = (installation.responsibility->>'agencyWorkspaceId')::uuid
    and installation.status = 'active'
    and installation.responsibility->>'kind' = 'provider_requested'
    and installation.responsibility->>'providerKind' = 'agency'
    and jsonb_array_length(installation.native_resources) = 1
    and installation.native_resources->0->>'kind' = 'application'
    and installation.native_resources->0->>'id' = p_work_id::text
    and cardinality(delivery.scope) = cardinality(installation.accepted_scope)
    and delivery.scope <@ installation.accepted_scope
    and installation.accepted_scope <@ delivery.scope
    and application.id = p_work_id
    and state.lifecycle_status in ('installed', 'draft')
    and state.current_release_version is not null
    and responsibility.payload->>'ownerId' = assignment.sponsor_id::text
    and responsibility.payload->>'approvedBy' = assignment.sponsor_id::text
    and jsonb_typeof(responsibility.payload->'approvedAt') = 'string'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(responsibility.payload->'steps', '[]'::jsonb)) step
      where step->>'workId' = p_work_id::text
        and step->>'operation' = 'application.command'
    )
  limit 1
$$;

revoke all on function public.agency_application_draft_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agency_application_draft_target(uuid, uuid) to service_role;

create or replace function public.agency_application_draft_edit_assert(
  p_work_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare grant_row public.agency_application_draft_grants%rowtype;
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id
      and lower(email) = lower(btrim(p_verified_email))
      and verified_at is not null
  ) then raise exception 'agency_application_draft_edit_denied'; end if;

  select item.* into grant_row
    from public.agency_application_draft_grants item
    join lateral public.agency_application_draft_target(item.delivery_id, item.application_work_id) target on true
    join public.workspace_memberships agency_member
      on agency_member.workspace_id = target.agency_workspace_id
      and agency_member.user_id = p_user_id
    join public.workspace_memberships sponsor_member
      on sponsor_member.workspace_id = target.business_workspace_id
      and sponsor_member.user_id = (select assignment.sponsor_id from public.operational_assignments assignment where assignment.id = target.assignment_id)
      and sponsor_member.role = 'owner'
    where item.application_work_id = p_work_id
      and target.business_workspace_id = p_workspace_id
      and item.operator_user_id = p_user_id
      and item.status = 'active'
      and item.expires_at > clock_timestamp()
      and item.expires_at <= target.expires_at
    order by item.created_at desc, item.id
    limit 1;
  if not found then raise exception 'agency_application_draft_edit_denied'; end if;
  return grant_row.id;
end;
$$;

revoke all on function public.agency_application_draft_edit_assert(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.agency_application_draft_edit_assert(uuid, uuid, uuid, text) to service_role;

create or replace function public.grant_agency_application_draft_edit(
  p_user_id uuid,
  p_verified_email text,
  p_delivery_id uuid,
  p_work_id uuid
) returns setof public.agency_application_draft_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare target record; prior public.agency_application_draft_grants%rowtype; created public.agency_application_draft_grants%rowtype;
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'agency_application_draft_edit_denied'; end if;
  select * into target from public.agency_application_draft_target(p_delivery_id, p_work_id);
  if not found
    or not exists (
      select 1 from public.workspace_memberships
      where workspace_id = target.business_workspace_id and user_id = p_user_id and role = 'owner'
    )
    or not exists (
      select 1 from public.workspace_memberships
      where workspace_id = target.agency_workspace_id and user_id = target.operator_user_id
    )
  then raise exception 'agency_application_draft_edit_denied'; end if;

  perform pg_advisory_xact_lock(hashtextextended('agency-application-draft:' || p_work_id::text || ':' || target.assignment_id::text, 0));
  select * into prior from public.agency_application_draft_grants
   where application_work_id = p_work_id and assignment_id = target.assignment_id
   for update;
  if found then
    if prior.business_workspace_id <> target.business_workspace_id
      or prior.installation_id <> target.installation_id
      or prior.delivery_id <> target.delivery_id
      or prior.agency_workspace_id <> target.agency_workspace_id
      or prior.operator_user_id <> target.operator_user_id then
      raise exception 'agency_application_draft_edit_conflict';
    end if;
    update public.agency_application_draft_grants set
      status = 'active',
      granted_by = p_user_id,
      expires_at = target.expires_at,
      updated_at = clock_timestamp(),
      revoked_at = null,
      revoked_by = null
    where id = prior.id
    returning * into created;
    return next created;
    return;
  end if;
  insert into public.agency_application_draft_grants(
    application_work_id, business_workspace_id, installation_id, delivery_id, assignment_id,
    agency_workspace_id, operator_user_id, granted_by, expires_at
  ) values (
    p_work_id, target.business_workspace_id, target.installation_id, target.delivery_id, target.assignment_id,
    target.agency_workspace_id, target.operator_user_id, p_user_id, target.expires_at
  ) returning * into created;
  return next created;
end;
$$;

revoke all on function public.grant_agency_application_draft_edit(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_agency_application_draft_edit(uuid, text, uuid, uuid) to service_role;

create or replace function public.read_agency_application_draft_edit(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid
) returns setof public.agency_application_draft_grants
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'agency_application_draft_edit_denied'; end if;
  return query
  select item.*
    from public.agency_application_draft_grants item
    where item.application_work_id = p_work_id
      and (
        exists (
          select 1 from public.workspace_memberships owner_member
          where owner_member.workspace_id = item.business_workspace_id
            and owner_member.user_id = p_user_id
            and owner_member.role in ('owner','admin')
        )
        or (
          item.status = 'active'
          and item.expires_at > clock_timestamp()
          and item.operator_user_id = p_user_id
          and exists (
            select 1 from public.agency_application_draft_target(item.delivery_id, item.application_work_id) target
            join public.workspace_memberships agency_member
              on agency_member.workspace_id = target.agency_workspace_id
              and agency_member.user_id = p_user_id
          )
        )
      )
    order by item.created_at desc, item.id;
end;
$$;

revoke all on function public.read_agency_application_draft_edit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.read_agency_application_draft_edit(uuid, text, uuid) to service_role;

create or replace function public.revoke_agency_application_draft_edit(
  p_user_id uuid,
  p_verified_email text,
  p_grant_id uuid
) returns setof public.agency_application_draft_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.agency_application_draft_grants%rowtype;
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'agency_application_draft_edit_denied'; end if;
  select * into item from public.agency_application_draft_grants where id = p_grant_id for update;
  if not found or not exists (
    select 1 from public.workspace_memberships
    where workspace_id = item.business_workspace_id and user_id = p_user_id and role = 'owner'
  ) then raise exception 'agency_application_draft_edit_denied'; end if;
  if item.status = 'revoked' then return next item; return; end if;
  update public.agency_application_draft_grants set
    status = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_user_id, updated_at = clock_timestamp()
  where id = item.id
  returning * into item;
  return next item;
end;
$$;

revoke all on function public.revoke_agency_application_draft_edit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.revoke_agency_application_draft_edit(uuid, text, uuid) to service_role;

-- A bounded operator may revise only through the grant above. Customer owners
-- and admins keep the original manager path, including publication.
create or replace function public.update_application_candidate(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_design_revision integer, p_spec jsonb
) returns setof public.application_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare state public.application_states%rowtype; next_version integer; patch jsonb; delegated boolean := false;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  select exists(
    select 1 from public.agency_application_draft_grants item
    join lateral public.agency_application_draft_target(item.delivery_id, item.application_work_id) target on true
    join public.workspace_memberships agency_member
      on agency_member.workspace_id = target.agency_workspace_id and agency_member.user_id = p_user_id
    where item.application_work_id = p_work_id
      and target.business_workspace_id = p_workspace_id
      and item.operator_user_id = p_user_id
      and item.status = 'active'
      and item.expires_at > clock_timestamp()
      and item.expires_at <= target.expires_at
  ) into delegated;
  if not delegated then
    if exists (
      select 1 from public.workspace_memberships
      where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin')
    ) then
      perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, true);
    else
      raise exception 'agency_application_draft_edit_denied';
    end if;
  else
    perform public.agency_application_draft_edit_assert(p_work_id, p_workspace_id, p_user_id, p_verified_email);
  end if;
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id = p_work_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if p_expected_design_revision is null or state.candidate_design_revision <> p_expected_design_revision then raise exception 'application_design_revision_conflict'; end if;
  perform public.validate_application_spec(p_spec);
  if p_spec->>'maintenanceOwner' is distinct from state.candidate_spec->>'maintenanceOwner' then raise exception 'application_design_access_denied'; end if;
  if jsonb_array_length(coalesce(state.candidate_versions, '[]'::jsonb)) >= 100 then raise exception 'application_candidate_history_limit_reached'; end if;
  next_version := state.candidate_spec_version + 1;
  update public.application_states set
    candidate_design_revision = state.candidate_design_revision + 1,
    candidate_spec_version = next_version,
    candidate_spec = p_spec,
    candidate_rehearsal = null,
    lifecycle_status = 'draft',
    candidate_versions = coalesce(state.candidate_versions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('version', next_version, 'spec', p_spec)),
    updated_at = clock_timestamp()
  where work_id = p_work_id;
  patch := jsonb_build_object(
    'spec', p_spec, 'specVersion', next_version, 'status', 'draft', 'rehearsal', null,
    'designRevision', state.candidate_design_revision + 1,
    'candidate', jsonb_build_object('designRevision', state.candidate_design_revision + 1, 'specVersion', next_version, 'spec', p_spec, 'rehearsal', null)
  );
  perform public.application_touch_compatibility(p_work_id, p_user_id, 'revise_candidate', patch);
  return query select * from public.application_states where work_id = p_work_id;
end;
$$;

revoke all on function public.update_application_candidate(uuid, uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.update_application_candidate(uuid, uuid, uuid, text, integer, jsonb) to service_role;

-- Rehearsal remains available to the existing explicit rehearsal assignment.
-- A new draft-edit grant also lets the named operator recheck the revision it
-- just saved, while publication stays on the customer manager path.
create or replace function public.rehearse_application_candidate(
  p_work_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_expected_design_revision integer
) returns setof public.application_states
language plpgsql security definer set search_path=public,pg_temp as $$
declare state public.application_states%rowtype; record_row public.application_records%rowtype; checks jsonb; records_fit boolean:=true; delegated boolean:=false; draft_granted boolean:=false;
begin
  perform public.application_lock_work(p_workspace_id,p_work_id);
  select exists(
    select 1 from public.agency_application_draft_grants item
    join lateral public.agency_application_draft_target(item.delivery_id, item.application_work_id) target on true
    join public.workspace_memberships agency_member on agency_member.workspace_id=target.agency_workspace_id and agency_member.user_id=p_user_id
    where item.application_work_id=p_work_id and target.business_workspace_id=p_workspace_id
      and item.operator_user_id=p_user_id and item.status='active'
      and item.expires_at>clock_timestamp() and item.expires_at<=target.expires_at
  ) into draft_granted;
  delegated := draft_granted;
  if not delegated then
    select exists(
      select 1 from public.operational_assignments assignment
      join public.saved_product_work responsibility on responsibility.id=assignment.work_id
      join public.offering_provider_deliveries delivery on delivery.assignment_id=assignment.id
      join public.offering_installations installation on installation.id=delivery.installation_id and installation.business_workspace_id=delivery.business_workspace_id
      join public.application_states state on state.work_id=p_work_id and state.workspace_id=p_workspace_id
      where assignment.workspace_id=p_workspace_id and assignment.assignee_user_id=p_user_id and assignment.assignee_email=lower(p_verified_email)
        and assignment.status='accepted' and assignment.expires_at>clock_timestamp() and delivery.status='accepted'
        and delivery.business_workspace_id=p_workspace_id and installation.status='active'
        and installation.responsibility->>'kind'='provider_requested'
        and installation.responsibility->>'providerKind'='agency'
        and jsonb_array_length(installation.native_resources)=1
        and installation.native_resources->0->>'kind'='application'
        and installation.native_resources->0->>'id'=p_work_id::text
        and cardinality(delivery.scope)=cardinality(installation.accepted_scope)
        and delivery.scope <@ installation.accepted_scope
        and installation.accepted_scope <@ delivery.scope
        and responsibility.payload->>'ownerId'=assignment.sponsor_id::text
        and responsibility.payload->>'approvedBy'=assignment.sponsor_id::text
        and jsonb_typeof(responsibility.payload->'approvedAt')='string'
        and exists(select 1 from public.workspace_memberships sponsor_member where sponsor_member.workspace_id=p_workspace_id and sponsor_member.user_id=assignment.sponsor_id and sponsor_member.role='owner')
        and exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step where step->>'workId'=p_work_id::text and step->>'operation'='application.command' and step->'input'->>'kind'='rehearse')
        and state.lifecycle_status in ('installed','draft') and state.current_release_version is not null
        and ((assignment.assignee_kind='strelva' and assignment.assignee_workspace_id is null and exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null) and exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id))
          or (assignment.assignee_kind='agency' and assignment.assignee_workspace_id=(installation.responsibility->>'agencyWorkspaceId')::uuid and exists(select 1 from public.workspaces where id=assignment.assignee_workspace_id and kind='agency') and exists(select 1 from public.workspace_memberships where workspace_id=assignment.assignee_workspace_id and user_id=p_user_id)))
    ) into delegated;
  end if;
  if not delegated then perform public.application_assert_identity(p_workspace_id,p_work_id,p_user_id,p_verified_email,true); end if;
  if draft_granted then
    perform public.agency_application_draft_edit_assert(p_work_id,p_workspace_id,p_user_id,p_verified_email);
  elsif delegated then
    if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null) then raise exception 'application_access_denied'; end if;
  end if;
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
end;
$$;

revoke all on function public.rehearse_application_candidate(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.rehearse_application_candidate(uuid,uuid,uuid,text,integer) to service_role;

-- Operator discovery is deliberately a narrow projection. It exposes only
-- currently assigned installed applications and the grant state needed to
-- decide whether the draft editor should be enabled.
create or replace function public.list_agency_application_draft_work(
  p_user_id uuid,
  p_verified_email text,
  p_agency_workspace_id uuid
) returns table (
  application_work_id uuid,
  customer_workspace_id uuid,
  customer_workspace_name text,
  application_title text,
  assignment_id uuid,
  delivery_id uuid,
  assignment_expires_at timestamptz,
  draft_grant_status text,
  draft_grant_expires_at timestamptz
)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null)
    or not exists(select 1 from public.workspaces where id=p_agency_workspace_id and kind='agency')
    or not exists(select 1 from public.workspace_memberships where workspace_id=p_agency_workspace_id and user_id=p_user_id) then
    raise exception 'agency_application_draft_edit_denied';
  end if;
  return query
  select application.id, customer.id, customer.name, coalesce(application.title, state.candidate_spec->>'title'),
    assignment.id, delivery.id, least(assignment.expires_at, delivery.expires_at), grant_row.status, grant_row.expires_at
  from public.offering_provider_deliveries delivery
  join public.operational_assignments assignment on assignment.id=delivery.assignment_id
  join public.offering_installations installation on installation.id=delivery.installation_id and installation.business_workspace_id=delivery.business_workspace_id
  join public.saved_product_work responsibility on responsibility.id=assignment.work_id and responsibility.workspace_id=assignment.workspace_id
  join public.workspaces customer on customer.id=delivery.business_workspace_id and customer.kind='customer'
  join public.saved_product_work application on application.workspace_id=delivery.business_workspace_id and application.product_id='applications' and application.resource_kind='application'
  join public.application_states state on state.work_id=application.id and state.workspace_id=application.workspace_id
  join lateral public.agency_application_draft_target(delivery.id, application.id) target on true
  left join lateral (
    select item.status, item.expires_at
    from public.agency_application_draft_grants item
    where item.application_work_id=application.id and item.assignment_id=assignment.id
    order by item.created_at desc, item.id desc limit 1
  ) grant_row on true
  where delivery.status='accepted' and delivery.expires_at>clock_timestamp()
    and assignment.workspace_id=delivery.business_workspace_id and assignment.assignee_kind='agency'
    and assignment.assignee_workspace_id=p_agency_workspace_id and assignment.assignee_user_id=p_user_id
    and target.agency_workspace_id=p_agency_workspace_id and target.operator_user_id=p_user_id
    and assignment.status='accepted' and assignment.expires_at>clock_timestamp()
    and installation.status='active' and installation.responsibility->>'kind'='provider_requested'
    and installation.responsibility->>'providerKind'='agency'
    and jsonb_array_length(installation.native_resources)=1 and installation.native_resources->0->>'kind'='application'
    and installation.native_resources->0->>'id'=application.id::text
    and state.lifecycle_status in ('installed', 'draft') and state.current_release_version is not null
    and exists(select 1 from jsonb_array_elements(coalesce(responsibility.payload->'steps','[]'::jsonb)) step where step->>'workId'=application.id::text and step->>'operation'='application.command')
  order by assignment.expires_at, application.title, application.id;
end;
$$;

revoke all on function public.list_agency_application_draft_work(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.list_agency_application_draft_work(uuid,text,uuid) to service_role;
