-- A bounded native website handoff. A customer owner may name the operator
-- already attached to one accepted agency delivery. The operator prepares one
-- exact content section, which is written through draft_content and a durable
-- revision receipt. The customer remains the only publisher.

create table public.agency_managed_website_draft_grants (
  id uuid primary key default gen_random_uuid(),
  managed_website_binding_id uuid not null references public.offering_website_bindings(id) on delete restrict,
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tenant_id text not null,
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
  unique (managed_website_binding_id, assignment_id),
  check (expires_at > created_at),
  check ((status = 'revoked') = (revoked_at is not null and revoked_by is not null))
);
create index agency_managed_website_draft_grants_operator_idx
  on public.agency_managed_website_draft_grants(operator_user_id, status, expires_at);
create index agency_managed_website_draft_grants_binding_idx
  on public.agency_managed_website_draft_grants(managed_website_binding_id, created_at desc);

create table public.agency_managed_website_draft_revisions (
  id uuid primary key default gen_random_uuid(),
  managed_website_binding_id uuid not null references public.offering_website_bindings(id) on delete restrict,
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tenant_id text not null,
  delivery_id uuid not null references public.offering_provider_deliveries(id) on delete restrict,
  assignment_id uuid not null references public.operational_assignments(id) on delete restrict,
  agency_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  operator_user_id uuid not null references public.users(id) on delete restrict,
  section text not null check (char_length(btrim(section)) between 1 and 80),
  revision integer not null check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 500000),
  data_hash text not null check (data_hash ~ '^[0-9a-f]{32}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (managed_website_binding_id, section, revision)
);
create index agency_managed_website_draft_revisions_history_idx
  on public.agency_managed_website_draft_revisions(managed_website_binding_id, section, created_at desc);

create table public.agency_managed_website_draft_preparations (
  id uuid primary key default gen_random_uuid(),
  managed_website_binding_id uuid not null references public.offering_website_bindings(id) on delete restrict,
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tenant_id text not null,
  delivery_id uuid not null references public.offering_provider_deliveries(id) on delete restrict,
  assignment_id uuid not null references public.operational_assignments(id) on delete restrict,
  agency_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  operator_user_id uuid not null references public.users(id) on delete restrict,
  section text not null check (char_length(btrim(section)) between 1 and 80),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 500000),
  expected_revision integer not null check (expected_revision >= 0),
  expected_hash text not null check (expected_hash ~ '^[0-9a-f]{32}$'),
  status text not null default 'pending' check (status in ('pending','consumed','revoked')),
  created_at timestamptz not null default clock_timestamp(),
  consumed_at timestamptz,
  revision_id uuid references public.agency_managed_website_draft_revisions(id) on delete restrict,
  check ((status = 'consumed') = (consumed_at is not null and revision_id is not null))
);
create unique index agency_managed_website_draft_pending_unique
  on public.agency_managed_website_draft_preparations(managed_website_binding_id, assignment_id, section)
  where status = 'pending';
create index agency_managed_website_draft_preparations_work_idx
  on public.agency_managed_website_draft_preparations(assignment_id, operator_user_id, status, created_at desc);

alter table public.agency_managed_website_draft_grants enable row level security;
alter table public.agency_managed_website_draft_revisions enable row level security;
alter table public.agency_managed_website_draft_preparations enable row level security;
revoke all on table public.agency_managed_website_draft_grants, public.agency_managed_website_draft_revisions, public.agency_managed_website_draft_preparations from public, anon, authenticated, service_role;

-- One target query is reused by grant, preparation, execution and operator
-- reads. It binds the accepted request, installation, delivery, assignment,
-- binding and native tenant authority together at the point of use.
create or replace function public.agency_managed_website_delivery_target(
  p_delivery_id uuid,
  p_binding_id uuid
) returns table (
  managed_website_binding_id uuid,
  business_workspace_id uuid,
  tenant_id text,
  tenant_stable_id uuid,
  delivery_id uuid,
  assignment_id uuid,
  agency_workspace_id uuid,
  operator_user_id uuid,
  sponsor_user_id uuid,
  expires_at timestamptz
)
language sql security definer set search_path = public, pg_temp as $$
  select binding.id,
    delivery.business_workspace_id,
    coalesce(tenant.id, binding.tenant_id_at_binding),
    binding.tenant_stable_id,
    delivery.id,
    assignment.id,
    assignment.assignee_workspace_id,
    assignment.assignee_user_id,
    assignment.sponsor_id,
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
  join public.offering_website_bindings binding
    on binding.id = p_binding_id
    and binding.business_workspace_id = delivery.business_workspace_id
  join public.tenants tenant
    on tenant.stable_id = binding.tenant_stable_id
    and tenant.id = binding.tenant_id_at_binding
  join public.workspaces customer
    on customer.id = delivery.business_workspace_id
    and customer.kind = 'customer'
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
    and installation.definition_id = 'managed_website_changes'
    and installation.responsibility->>'kind' = 'provider_requested'
    and installation.responsibility->>'providerKind' = 'agency'
    and installation.native_resources = jsonb_build_array(jsonb_build_object('kind','managed_website','id',binding.id::text))
    and cardinality(delivery.scope) = cardinality(installation.accepted_scope)
    and delivery.scope <@ installation.accepted_scope
    and installation.accepted_scope <@ delivery.scope
    and binding.status = 'active'
    and tenant.active is true
    -- Match the native subscription gate's durable states. `case_study` and
    -- the legacy founder comp are active access even without a Stripe status;
    -- past_due remains usable only during the same three-day grace window.
    -- Read billing_type through to_jsonb so this migration stays additive on
    -- an aggregate workspace fixture that predates the billing classification
    -- column. Environment-only billing decisions are admitted only through
    -- the service_role-only transaction proof wrapper below.
    and (
      tenant.subscription_status in ('active','trialing')
      or to_jsonb(tenant)->>'plan_override' = 'founder_comp'
      or to_jsonb(tenant)->>'billing_type' = 'case_study'
      or (
        tenant.subscription_status = 'past_due'
        and (
          to_jsonb(tenant)->>'subscription_past_due_since' is null
          or (to_jsonb(tenant)->>'subscription_past_due_since')::timestamptz > clock_timestamp() - interval '3 days'
        )
      )
      or current_setting('strelva.agency_subscription_exemption', true) = 'on'
    )
    and not public.workspace_exit_completed(delivery.business_workspace_id)
    and exists (
      select 1 from public.workspace_memberships sponsor_workspace_member
      where sponsor_workspace_member.workspace_id = delivery.business_workspace_id
        and sponsor_workspace_member.user_id = assignment.sponsor_id
        and sponsor_workspace_member.role = 'owner'
    )
    and exists (
      select 1 from public.workspace_memberships agency_workspace_member
      where agency_workspace_member.workspace_id = assignment.assignee_workspace_id
        and agency_workspace_member.user_id = assignment.assignee_user_id
    )
    and responsibility.payload->>'ownerId' = assignment.sponsor_id::text
    and responsibility.payload->>'approvedBy' = assignment.sponsor_id::text
    and jsonb_typeof(responsibility.payload->'approvedAt') = 'string'
    and jsonb_typeof(responsibility.payload->'steps') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(responsibility.payload->'steps','[]'::jsonb)) step
      where step->>'workId' = binding.id::text
        and step->>'operation' = 'website.draft'
        and step->'input'->>'kind' = 'draft'
        and step->'input'->>'bindingId' = binding.id::text
        and char_length(btrim(step->'input'->>'section')) between 1 and 80
    )
    and exists (
      select 1 from public.memberships native_member
      where (native_member.tenant_stable_id = binding.tenant_stable_id or native_member.tenant_id = binding.tenant_id_at_binding)
        and native_member.user_id = assignment.sponsor_id
        and native_member.role in ('editor','admin','owner')
    )
    and exists (
      select 1 from public.service_requests request
      where request.business_workspace_id = delivery.business_workspace_id
        -- Customer confirmation links the delivery after the assigned native
        -- work returns. Until then, the accepted request and this exact
        -- delivery are joined by installation and scope; a different linked
        -- delivery is never admitted.
        and (request.delivery_id is null or request.delivery_id = delivery.id)
        and (request.installation_id is null or request.installation_id = delivery.installation_id)
        and request.status = 'requested'
        and request.provider_acceptance = 'accepted'
        and cardinality(request.scope) = cardinality(delivery.scope)
        and request.scope <@ delivery.scope
        and delivery.scope <@ request.scope
    )
  limit 1
$$;
revoke all on function public.agency_managed_website_delivery_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agency_managed_website_delivery_target(uuid, uuid) to service_role;

-- A binding grant covers the accepted delivery, but each write still names one
-- section that was accepted in that responsibility. This keeps a granted
-- operator from selecting another native section after the customer approves
-- the assignment.
create or replace function public.agency_managed_website_draft_section_allowed(
  p_delivery_id uuid,
  p_binding_id uuid,
  p_section text
) returns boolean
language sql security definer set search_path = public, pg_temp as $$
  select p_section is not null
    and char_length(btrim(p_section)) between 1 and 80
    and exists (
      select 1
      from public.offering_provider_deliveries delivery
      join public.operational_assignments assignment on assignment.id = delivery.assignment_id
      join public.saved_product_work responsibility
        on responsibility.id = assignment.work_id
        and responsibility.workspace_id = assignment.workspace_id
      cross join lateral jsonb_array_elements(coalesce(responsibility.payload->'steps', '[]'::jsonb)) step
      where delivery.id = p_delivery_id
        and delivery.status = 'accepted'
        and assignment.status = 'accepted'
        and step->>'operation' = 'website.draft'
        and step->'input'->>'kind' = 'draft'
        and step->'input'->>'bindingId' = p_binding_id::text
        and btrim(step->'input'->>'section') = btrim(p_section)
    )
$$;
revoke all on function public.agency_managed_website_draft_section_allowed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.agency_managed_website_draft_section_allowed(uuid, uuid, text) to service_role;

create or replace function public.agency_managed_website_lock_target(
  p_delivery_id uuid,
  p_binding_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare delivery_id uuid; assignment_id uuid; installation_id uuid; business_id uuid; work_id uuid; sponsor_id uuid; operator_id uuid; tenant_stable uuid; request_id uuid;
begin
  select delivery.business_workspace_id
    into business_id
    from public.offering_provider_deliveries delivery
    where delivery.id = p_delivery_id;
  if business_id is null then raise exception 'agency_managed_website_draft_denied'; end if;
  -- Exit completion takes this workspace lock before retiring assignments,
  -- deliveries and installations. Acquire it before any child row so an exit
  -- either commits first (and this write is denied) or observes this write
  -- before recording the stop decision.
  perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
  perform 1 from public.workspaces where id = business_id for update;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  select delivery.id, delivery.assignment_id, delivery.installation_id, delivery.business_workspace_id
    into delivery_id, assignment_id, installation_id, business_id
    from public.offering_provider_deliveries delivery
    where delivery.id = p_delivery_id for update;
  if delivery_id is null then raise exception 'agency_managed_website_draft_denied'; end if;
  select assignment.work_id, assignment.sponsor_id, assignment.assignee_user_id
    into work_id, sponsor_id, operator_id
    from public.operational_assignments assignment
    where assignment.id = assignment_id and assignment.workspace_id = business_id for update;
  if work_id is null then raise exception 'agency_managed_website_draft_denied'; end if;
  perform 1 from public.saved_product_work responsibility
    where responsibility.id = work_id and responsibility.workspace_id = business_id for share;
  perform 1 from public.offering_installations where id = installation_id and business_workspace_id = business_id for update;
  select binding.tenant_stable_id into tenant_stable from public.offering_website_bindings binding
    where binding.id = p_binding_id and binding.business_workspace_id = business_id for update;
  if tenant_stable is null then raise exception 'agency_managed_website_draft_denied'; end if;
  perform 1 from public.tenants where stable_id = tenant_stable for share;
  perform 1 from public.workspace_memberships member
    where member.workspace_id = business_id and member.user_id = sponsor_id for share;
  perform 1 from public.workspace_memberships member
    where member.workspace_id = (select assignee_workspace_id from public.operational_assignments where id = assignment_id)
      and member.user_id = operator_id for share;
  perform 1 from public.memberships member
    where (member.tenant_stable_id = tenant_stable or member.tenant_id = (select tenant_id from public.tenants where stable_id = tenant_stable))
      and member.user_id = sponsor_id for share;
  select request.id into request_id from public.service_requests request
    where request.delivery_id = p_delivery_id and request.business_workspace_id = business_id
    order by request.updated_at desc, request.id desc limit 1 for update;
end;
$$;
revoke all on function public.agency_managed_website_lock_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agency_managed_website_lock_target(uuid, uuid) to service_role;

create or replace function public.agency_managed_website_draft_identity(p_user_id uuid, p_verified_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null) then
    raise exception 'agency_managed_website_draft_denied';
  end if;
end;
$$;
revoke all on function public.agency_managed_website_draft_identity(uuid, text) from public, anon, authenticated;
grant execute on function public.agency_managed_website_draft_identity(uuid, text) to service_role;

-- The application checks the native subscription gate before invoking the
-- write functions below. When billing is disabled or an environment-level
-- grandfather/comp decision makes that gate active, the application passes a
-- transaction-local server proof. These wrappers are service_role-only and
-- never accept the proof from a browser request; direct SQL callers still use
-- the durable tenant check in the four/five-argument functions above.
create or replace function public.read_agency_managed_website_draft_tenant(
  p_user_id uuid, p_verified_email text, p_binding_id uuid
) returns setof public.tenants
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  return query
  select tenant.*
  from public.offering_website_bindings binding
  join public.tenants tenant
    on tenant.stable_id = binding.tenant_stable_id
    and tenant.id = binding.tenant_id_at_binding
  where binding.id = p_binding_id;
end;
$$;
revoke all on function public.read_agency_managed_website_draft_tenant(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.read_agency_managed_website_draft_tenant(uuid, text, uuid) to service_role;

create or replace function public.grant_agency_managed_website_draft_edit_server(
  p_user_id uuid, p_verified_email text, p_delivery_id uuid, p_binding_id uuid,
  p_subscription_exemption boolean
) returns setof public.agency_managed_website_draft_grants
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('strelva.agency_subscription_exemption', case when p_subscription_exemption then 'on' else 'off' end, true);
  return query select * from public.grant_agency_managed_website_draft_edit(p_user_id, p_verified_email, p_delivery_id, p_binding_id);
end;
$$;
revoke all on function public.grant_agency_managed_website_draft_edit_server(uuid, text, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.grant_agency_managed_website_draft_edit_server(uuid, text, uuid, uuid, boolean) to service_role;

create or replace function public.prepare_agency_managed_website_draft_server(
  p_user_id uuid, p_verified_email text, p_assignment_id uuid, p_binding_id uuid,
  p_section text, p_data jsonb, p_expected_revision integer, p_expected_hash text,
  p_subscription_exemption boolean
) returns setof public.agency_managed_website_draft_preparations
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('strelva.agency_subscription_exemption', case when p_subscription_exemption then 'on' else 'off' end, true);
  return query select * from public.prepare_agency_managed_website_draft(
    p_user_id, p_verified_email, p_assignment_id, p_binding_id, p_section,
    p_data, p_expected_revision, p_expected_hash
  );
end;
$$;
revoke all on function public.prepare_agency_managed_website_draft_server(uuid, text, uuid, uuid, text, jsonb, integer, text, boolean) from public, anon, authenticated;
grant execute on function public.prepare_agency_managed_website_draft_server(uuid, text, uuid, uuid, text, jsonb, integer, text, boolean) to service_role;

create or replace function public.read_agency_managed_website_draft_preparation_server(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_binding_id uuid, p_section text,
  p_subscription_exemption boolean
) returns setof public.agency_managed_website_draft_preparations
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('strelva.agency_subscription_exemption', case when p_subscription_exemption then 'on' else 'off' end, true);
  return query select * from public.read_agency_managed_website_draft_preparation(
    p_user_id, p_verified_email, p_work_id, p_binding_id, p_section
  );
end;
$$;
revoke all on function public.read_agency_managed_website_draft_preparation_server(uuid, text, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.read_agency_managed_website_draft_preparation_server(uuid, text, uuid, uuid, text, boolean) to service_role;

create or replace function public.execute_agency_managed_website_draft_server(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_binding_id uuid, p_section text,
  p_subscription_exemption boolean
) returns table (
  tenant_id text, section text, revision integer, data jsonb, data_hash text,
  revision_id uuid, preparation_id uuid, assignment_id uuid, managed_website_binding_id uuid
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform set_config('strelva.agency_subscription_exemption', case when p_subscription_exemption then 'on' else 'off' end, true);
  return query select * from public.execute_agency_managed_website_draft(
    p_user_id, p_verified_email, p_work_id, p_binding_id, p_section
  );
end;
$$;
revoke all on function public.execute_agency_managed_website_draft_server(uuid, text, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.execute_agency_managed_website_draft_server(uuid, text, uuid, uuid, text, boolean) to service_role;

create or replace function public.grant_agency_managed_website_draft_edit(
  p_user_id uuid, p_verified_email text, p_delivery_id uuid, p_binding_id uuid
) returns setof public.agency_managed_website_draft_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare target record; prior public.agency_managed_website_draft_grants%rowtype; created public.agency_managed_website_draft_grants%rowtype;
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  perform pg_advisory_xact_lock(hashtextextended('agency-managed-website:' || p_binding_id::text, 0));
  perform public.agency_managed_website_lock_target(p_delivery_id, p_binding_id);
  select * into target from public.agency_managed_website_delivery_target(p_delivery_id, p_binding_id);
  if not found or target.sponsor_user_id is null
    or not exists (select 1 from public.workspace_memberships member where member.workspace_id = target.business_workspace_id and member.user_id = p_user_id and member.role = 'owner')
    or not exists (select 1 from public.workspace_memberships member where member.workspace_id = target.agency_workspace_id and member.user_id = target.operator_user_id)
  then raise exception 'agency_managed_website_draft_denied'; end if;
  perform 1 from public.workspace_memberships member where member.workspace_id = target.business_workspace_id and member.user_id = target.sponsor_user_id and member.role = 'owner' for share;
  select * into prior from public.agency_managed_website_draft_grants item
    where item.managed_website_binding_id = p_binding_id and item.assignment_id = target.assignment_id for update;
  if found then
    if prior.business_workspace_id <> target.business_workspace_id or prior.delivery_id <> target.delivery_id
      or prior.agency_workspace_id <> target.agency_workspace_id or prior.operator_user_id <> target.operator_user_id
      or prior.tenant_id <> target.tenant_id then raise exception 'agency_managed_website_draft_conflict'; end if;
    update public.agency_managed_website_draft_grants set status = 'active', granted_by = p_user_id,
      expires_at = target.expires_at, updated_at = clock_timestamp(), revoked_at = null, revoked_by = null
      where id = prior.id returning * into created;
  else
    insert into public.agency_managed_website_draft_grants(
      managed_website_binding_id, business_workspace_id, tenant_id, delivery_id, assignment_id,
      agency_workspace_id, operator_user_id, granted_by, expires_at
    ) values (
      p_binding_id, target.business_workspace_id, target.tenant_id, target.delivery_id, target.assignment_id,
      target.agency_workspace_id, target.operator_user_id, p_user_id, target.expires_at
    ) returning * into created;
  end if;
  return next created;
end;
$$;
revoke all on function public.grant_agency_managed_website_draft_edit(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_agency_managed_website_draft_edit(uuid, text, uuid, uuid) to service_role;

create or replace function public.read_agency_managed_website_draft_edit(
  p_user_id uuid, p_verified_email text, p_binding_id uuid
) returns setof public.agency_managed_website_draft_grants
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  return query
  select item.* from public.agency_managed_website_draft_grants item
  where item.managed_website_binding_id = p_binding_id
    and (
      exists (select 1 from public.workspace_memberships owner_member where owner_member.workspace_id = item.business_workspace_id and owner_member.user_id = p_user_id and owner_member.role in ('owner','admin'))
      or (
        item.status = 'active' and item.expires_at > clock_timestamp() and item.operator_user_id = p_user_id
        and exists (select 1 from public.agency_managed_website_delivery_target(item.delivery_id, item.managed_website_binding_id) target
          where target.operator_user_id = p_user_id
            and exists (select 1 from public.workspace_memberships agency_member where agency_member.workspace_id = target.agency_workspace_id and agency_member.user_id = p_user_id))
      )
    )
  order by item.created_at desc, item.id desc;
end;
$$;
revoke all on function public.read_agency_managed_website_draft_edit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.read_agency_managed_website_draft_edit(uuid, text, uuid) to service_role;

create or replace function public.revoke_agency_managed_website_draft_edit(
  p_user_id uuid, p_verified_email text, p_grant_id uuid
) returns setof public.agency_managed_website_draft_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.agency_managed_website_draft_grants%rowtype;
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  -- Read the identity before taking locks. All mutating paths then acquire the
  -- binding/workspace lock, grant row, and preparation rows in that order.
  -- This avoids a grant-row/workspace-lock inversion with a concurrent prepare
  -- or execution while still rechecking the owner after the lock is held.
  select * into item from public.agency_managed_website_draft_grants where id = p_grant_id;
  if not found or not exists (select 1 from public.workspace_memberships member where member.workspace_id = item.business_workspace_id and member.user_id = p_user_id and member.role = 'owner') then
    raise exception 'agency_managed_website_draft_denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agency-managed-website:' || item.managed_website_binding_id::text, 0));
  perform public.agency_managed_website_lock_target(item.delivery_id, item.managed_website_binding_id);
  select * into item from public.agency_managed_website_draft_grants where id = p_grant_id for update;
  if not found or not exists (select 1 from public.workspace_memberships member where member.workspace_id = item.business_workspace_id and member.user_id = p_user_id and member.role = 'owner') then
    raise exception 'agency_managed_website_draft_denied';
  end if;
  if item.status = 'revoked' then return next item; return; end if;
  update public.agency_managed_website_draft_grants set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_user_id, updated_at = clock_timestamp()
    where id = item.id returning * into item;
  update public.agency_managed_website_draft_preparations set status = 'revoked'
    where managed_website_binding_id = item.managed_website_binding_id and assignment_id = item.assignment_id and status = 'pending';
  return next item;
end;
$$;
revoke all on function public.revoke_agency_managed_website_draft_edit(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.revoke_agency_managed_website_draft_edit(uuid, text, uuid) to service_role;

create or replace function public.read_agency_managed_website_draft_state(
  p_user_id uuid, p_verified_email text, p_binding_id uuid, p_section text
) returns table (tenant_id text, section text, revision integer, data jsonb, data_hash text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare grant_row public.agency_managed_website_draft_grants%rowtype; target record; current_data jsonb; current_revision integer;
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  if p_section is null or char_length(btrim(p_section)) not between 1 and 80 then raise exception 'agency_managed_website_draft_invalid'; end if;
  select item.* into grant_row from public.agency_managed_website_draft_grants item
    where item.managed_website_binding_id = p_binding_id
      and (
        exists (select 1 from public.workspace_memberships member where member.workspace_id = item.business_workspace_id and member.user_id = p_user_id and member.role in ('owner','admin'))
        or (item.status = 'active' and item.expires_at > clock_timestamp() and item.operator_user_id = p_user_id
        and exists (select 1 from public.agency_managed_website_delivery_target(item.delivery_id, item.managed_website_binding_id) target_check where target_check.operator_user_id = p_user_id
          and exists (select 1 from public.workspace_memberships member where member.workspace_id = target_check.agency_workspace_id and member.user_id = p_user_id)))
      )
    order by item.created_at desc, item.id desc limit 1;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  if not exists (select 1 from public.workspace_memberships member where member.workspace_id = grant_row.business_workspace_id and member.user_id = p_user_id and member.role in ('owner','admin')) then
    select * into target from public.agency_managed_website_delivery_target(grant_row.delivery_id, grant_row.managed_website_binding_id);
    if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  end if;
  if not public.agency_managed_website_draft_section_allowed(grant_row.delivery_id, p_binding_id, p_section) then
    raise exception 'agency_managed_website_draft_denied';
  end if;
  select coalesce(draft.data, content.data, '{}'::jsonb) into current_data
    from (select 1) marker
    left join public.draft_content draft on draft.tenant_id = grant_row.tenant_id and draft.section = btrim(p_section)
    left join public.content content on content.tenant_id = grant_row.tenant_id and content.section = btrim(p_section);
  select coalesce(max(history.revision), 0) into current_revision from public.agency_managed_website_draft_revisions history
    where history.managed_website_binding_id = p_binding_id and history.section = btrim(p_section);
  return query select grant_row.tenant_id, btrim(p_section), current_revision, current_data, md5(current_data::text);
end;
$$;
revoke all on function public.read_agency_managed_website_draft_state(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.read_agency_managed_website_draft_state(uuid, text, uuid, text) to service_role;

create or replace function public.list_agency_managed_website_draft_work(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid
) returns table (
  managed_website_binding_id uuid, customer_workspace_id uuid, customer_workspace_name text,
  site_name text, tenant_id text, assignment_id uuid, delivery_id uuid,
  assignment_expires_at timestamptz, draft_grant_status text, draft_grant_expires_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  if not exists (select 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency')
    or not exists (select 1 from public.workspace_memberships where workspace_id = p_agency_workspace_id and user_id = p_user_id) then raise exception 'agency_managed_website_draft_denied'; end if;
  return query
  select target.managed_website_binding_id, target.business_workspace_id, customer.name,
    coalesce(tenant.site_name, binding.site_name_at_binding), target.tenant_id,
    target.assignment_id, target.delivery_id, target.expires_at,
    grant_row.status, grant_row.expires_at
  from public.offering_website_bindings binding
  join public.workspaces customer on customer.id = binding.business_workspace_id and customer.kind = 'customer'
  join public.tenants tenant on tenant.stable_id = binding.tenant_stable_id
  join public.offering_provider_deliveries delivery on delivery.business_workspace_id = binding.business_workspace_id
  join lateral public.agency_managed_website_delivery_target(delivery.id, binding.id) target on true
  left join lateral (select item.status, item.expires_at from public.agency_managed_website_draft_grants item
    where item.managed_website_binding_id = binding.id and item.assignment_id = target.assignment_id order by item.created_at desc, item.id desc limit 1) grant_row on true
  where target.agency_workspace_id = p_agency_workspace_id and target.operator_user_id = p_user_id
  order by target.expires_at, customer.name, binding.id;
end;
$$;
revoke all on function public.list_agency_managed_website_draft_work(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.list_agency_managed_website_draft_work(uuid, text, uuid) to service_role;

create or replace function public.prepare_agency_managed_website_draft(
  p_user_id uuid, p_verified_email text, p_assignment_id uuid, p_binding_id uuid,
  p_section text, p_data jsonb, p_expected_revision integer, p_expected_hash text
) returns setof public.agency_managed_website_draft_preparations
language plpgsql security definer set search_path = public, pg_temp as $$
declare target record; grant_row public.agency_managed_website_draft_grants%rowtype; existing public.agency_managed_website_draft_preparations%rowtype; created public.agency_managed_website_draft_preparations%rowtype; current_data jsonb; current_hash text; current_revision integer;
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  if p_section is null or char_length(btrim(p_section)) not between 1 and 80 or p_data is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 500000
    or p_expected_revision is null or p_expected_revision < 0 or p_expected_hash is null or p_expected_hash !~ '^[0-9a-f]{32}$' then raise exception 'agency_managed_website_draft_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('agency-managed-website:' || p_binding_id::text, 0));
  perform public.agency_managed_website_lock_target((select delivery_id from public.agency_managed_website_draft_grants where assignment_id = p_assignment_id and managed_website_binding_id = p_binding_id limit 1), p_binding_id);
  select item.* into grant_row from public.agency_managed_website_draft_grants item where item.managed_website_binding_id = p_binding_id and item.assignment_id = p_assignment_id and item.operator_user_id = p_user_id and item.status = 'active' and item.expires_at > clock_timestamp() for update;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  select * into target from public.agency_managed_website_delivery_target(grant_row.delivery_id, p_binding_id);
  if not found or target.assignment_id <> p_assignment_id or target.operator_user_id <> p_user_id or grant_row.expires_at > target.expires_at then raise exception 'agency_managed_website_draft_denied'; end if;
  if not public.agency_managed_website_draft_section_allowed(grant_row.delivery_id, p_binding_id, p_section) then raise exception 'agency_managed_website_draft_denied'; end if;
  select coalesce(draft.data, content.data, '{}'::jsonb) into current_data from (select 1) marker
    left join public.draft_content draft on draft.tenant_id = target.tenant_id and draft.section = btrim(p_section)
    left join public.content content on content.tenant_id = target.tenant_id and content.section = btrim(p_section);
  current_hash := md5(current_data::text);
  select coalesce(max(history.revision), 0) into current_revision from public.agency_managed_website_draft_revisions history where history.managed_website_binding_id = p_binding_id and history.section = btrim(p_section);
  if current_revision <> p_expected_revision or current_hash <> p_expected_hash then raise exception 'agency_managed_website_draft_revision_conflict'; end if;
  select * into existing from public.agency_managed_website_draft_preparations item where item.managed_website_binding_id = p_binding_id and item.assignment_id = p_assignment_id and item.section = btrim(p_section) and item.status = 'pending' for update;
  if found then
    if existing.data is not distinct from p_data and existing.expected_revision = p_expected_revision and existing.expected_hash = p_expected_hash and existing.operator_user_id = p_user_id then return next existing; return; end if;
    update public.agency_managed_website_draft_preparations set status = 'revoked' where id = existing.id;
  end if;
  insert into public.agency_managed_website_draft_preparations(
    managed_website_binding_id, business_workspace_id, tenant_id, delivery_id, assignment_id,
    agency_workspace_id, operator_user_id, section, data, expected_revision, expected_hash
  ) values (
    p_binding_id, target.business_workspace_id, target.tenant_id, target.delivery_id, target.assignment_id,
    target.agency_workspace_id, target.operator_user_id, btrim(p_section), p_data, p_expected_revision, p_expected_hash
  ) returning * into created;
  return next created;
end;
$$;
revoke all on function public.prepare_agency_managed_website_draft(uuid, text, uuid, uuid, text, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.prepare_agency_managed_website_draft(uuid, text, uuid, uuid, text, jsonb, integer, text) to service_role;

create or replace function public.read_agency_managed_website_draft_preparation(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_binding_id uuid, p_section text
) returns setof public.agency_managed_website_draft_preparations
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.agency_managed_website_draft_preparations%rowtype; target record; grant_row public.agency_managed_website_draft_grants%rowtype;
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  select preparation.* into item from public.agency_managed_website_draft_preparations preparation
    join public.operational_assignments assignment on assignment.id = preparation.assignment_id and assignment.work_id = p_work_id
    where preparation.managed_website_binding_id = p_binding_id and preparation.section = btrim(p_section)
      and preparation.operator_user_id = p_user_id and preparation.status = 'pending'
    order by preparation.created_at desc, preparation.id desc limit 1;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  select * into grant_row from public.agency_managed_website_draft_grants where id = (select grant_id from (select id as grant_id from public.agency_managed_website_draft_grants where managed_website_binding_id = item.managed_website_binding_id and assignment_id = item.assignment_id and status = 'active' and operator_user_id = p_user_id order by created_at desc, id desc limit 1) current_grant) for share;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  select * into target from public.agency_managed_website_delivery_target(grant_row.delivery_id, p_binding_id);
  if not found or target.assignment_id <> item.assignment_id or target.operator_user_id <> p_user_id or grant_row.expires_at > target.expires_at then raise exception 'agency_managed_website_draft_denied'; end if;
  if not public.agency_managed_website_draft_section_allowed(grant_row.delivery_id, p_binding_id, p_section) then raise exception 'agency_managed_website_draft_denied'; end if;
  return next item;
end;
$$;
revoke all on function public.read_agency_managed_website_draft_preparation(uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.read_agency_managed_website_draft_preparation(uuid, text, uuid, uuid, text) to service_role;

create or replace function public.execute_agency_managed_website_draft(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_binding_id uuid, p_section text
) returns table (
  tenant_id text, section text, revision integer, data jsonb, data_hash text,
  revision_id uuid, preparation_id uuid, assignment_id uuid, managed_website_binding_id uuid
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare prep public.agency_managed_website_draft_preparations%rowtype; grant_row public.agency_managed_website_draft_grants%rowtype; target record; current_data jsonb; current_hash text; current_revision integer; created_id uuid;
begin
  perform public.agency_managed_website_draft_identity(p_user_id, p_verified_email);
  if p_section is null or char_length(btrim(p_section)) not between 1 and 80 then raise exception 'agency_managed_website_draft_invalid'; end if;
  -- Find the preparation and its grant without locks so every writer can take
  -- the shared binding/workspace lock before locking grant then preparation.
  -- A consumed preparation is safe to reconcile from its durable receipt even
  -- after the customer revokes the grant.
  select item.* into prep from public.agency_managed_website_draft_preparations item
    join public.operational_assignments assignment on assignment.id = item.assignment_id and assignment.work_id = p_work_id
    where item.managed_website_binding_id = p_binding_id and item.section = btrim(p_section) and item.operator_user_id = p_user_id and item.status in ('pending','consumed')
    order by item.created_at desc, item.id desc limit 1;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  if prep.status = 'consumed' then
    return query select history.tenant_id, history.section, history.revision, history.data, history.data_hash,
      history.id, prep.id, history.assignment_id, history.managed_website_binding_id
      from public.agency_managed_website_draft_revisions history where history.id = prep.revision_id;
    return;
  end if;
  select * into grant_row from public.agency_managed_website_draft_grants item
    where item.managed_website_binding_id = p_binding_id and item.assignment_id = prep.assignment_id and item.operator_user_id = p_user_id;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended('agency-managed-website:' || p_binding_id::text, 0));
  perform public.agency_managed_website_lock_target(grant_row.delivery_id, p_binding_id);
  select * into grant_row from public.agency_managed_website_draft_grants item
    where item.managed_website_binding_id = p_binding_id and item.assignment_id = prep.assignment_id and item.operator_user_id = p_user_id and item.status = 'active' and item.expires_at > clock_timestamp() for update;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  select * into prep from public.agency_managed_website_draft_preparations item
    where item.id = prep.id and item.status in ('pending','consumed') for update;
  if not found then raise exception 'agency_managed_website_draft_denied'; end if;
  if prep.status = 'consumed' then
    return query select history.tenant_id, history.section, history.revision, history.data, history.data_hash,
      history.id, prep.id, history.assignment_id, history.managed_website_binding_id
      from public.agency_managed_website_draft_revisions history where history.id = prep.revision_id;
    return;
  end if;
  select * into target from public.agency_managed_website_delivery_target(grant_row.delivery_id, p_binding_id);
  if not found or target.assignment_id <> prep.assignment_id or target.operator_user_id <> p_user_id or grant_row.expires_at > target.expires_at then raise exception 'agency_managed_website_draft_denied'; end if;
  if not public.agency_managed_website_draft_section_allowed(grant_row.delivery_id, p_binding_id, p_section) then raise exception 'agency_managed_website_draft_denied'; end if;
  select coalesce(draft.data, content.data, '{}'::jsonb) into current_data from (select 1) marker
    left join public.draft_content draft on draft.tenant_id = target.tenant_id and draft.section = btrim(p_section)
    left join public.content content on content.tenant_id = target.tenant_id and content.section = btrim(p_section);
  current_hash := md5(current_data::text);
  select coalesce(max(history.revision), 0) into current_revision from public.agency_managed_website_draft_revisions history where history.managed_website_binding_id = p_binding_id and history.section = btrim(p_section);
  if current_revision <> prep.expected_revision or current_hash <> prep.expected_hash then raise exception 'agency_managed_website_draft_revision_conflict'; end if;
  current_revision := current_revision + 1;
  insert into public.draft_content(tenant_id, section, data, updated_at) values (target.tenant_id, btrim(p_section), prep.data, clock_timestamp())
    on conflict on constraint draft_content_pkey do update set data = excluded.data, updated_at = excluded.updated_at;
  current_hash := md5(prep.data::text);
  insert into public.agency_managed_website_draft_revisions(
    managed_website_binding_id, business_workspace_id, tenant_id, delivery_id, assignment_id,
    agency_workspace_id, operator_user_id, section, revision, data, data_hash
  ) values (
    p_binding_id, target.business_workspace_id, target.tenant_id, target.delivery_id, target.assignment_id,
    target.agency_workspace_id, p_user_id, btrim(p_section), current_revision, prep.data, current_hash
  ) returning id into created_id;
  update public.agency_managed_website_draft_preparations set status = 'consumed', consumed_at = clock_timestamp(), revision_id = created_id where id = prep.id;
  return query select target.tenant_id, btrim(p_section), current_revision, prep.data, current_hash, created_id, prep.id, target.assignment_id, p_binding_id;
end;
$$;
revoke all on function public.execute_agency_managed_website_draft(uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.execute_agency_managed_website_draft(uuid, text, uuid, uuid, text) to service_role;

create or replace function public.allow_agency_website_draft_step(p_step jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_step->>'operation','') = 'website.draft'
    and coalesce(p_step->>'capabilityVersion','1') = '1'
    and coalesce(p_step->>'maximumCents','') = '0'
    and p_step->'input'->>'kind' = 'draft'
    and (p_step->'input'->>'bindingId')::text <> ''
    and char_length(btrim(p_step->'input'->>'section')) between 1 and 80
    and jsonb_typeof(p_step->'input') = 'object'
$$;
revoke all on function public.allow_agency_website_draft_step(jsonb) from public, anon, authenticated;
grant execute on function public.allow_agency_website_draft_step(jsonb) to service_role;

-- Extend agency assignment admission without broadening the old operate/read
-- grant. The owner still approves this exact native step before offering it.
create or replace function public.offer_agency_operational_assignment(
  p_user_id uuid,p_verified_email text,p_work_id uuid,p_agency_workspace_id uuid,
  p_assignee_email text,p_assignee_kind text,p_expires_at timestamptz,p_idempotency_key text
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.saved_product_work; assignee_id uuid; prior public.operational_assignments; blocking public.operational_assignments; frozen_scope jsonb;
begin
  if p_assignee_kind <> 'agency' or p_agency_workspace_id is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '90 days'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
    or not exists(select 1 from public.users where id = p_user_id and lower(email) = lower(p_verified_email) and verified_at is not null)
    or not exists(select 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency') then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id = p_work_id;
  if not found or existing.product_id <> 'operations' or existing.resource_kind <> 'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null or coalesce(existing.payload->>'status','') not in ('ready','waiting')
    or existing.payload ? 'budgetId' or jsonb_typeof(existing.payload->'steps') is distinct from 'array'
    or jsonb_array_length(existing.payload->'steps') not between 1 and 20
    or exists(select 1 from jsonb_array_elements(existing.payload->'steps') step
      where coalesce(step->>'maximumCents','') <> '0' or coalesce(step->>'capabilityVersion','1') <> '1'
        or (coalesce(step->>'operation','') = 'tracker.command' and step->'input'->>'kind' = 'coordinate_records')
        or (coalesce(step->>'operation','') = 'application.command' and coalesce(step->'input'->>'kind','') not in ('revise','rehearse','install'))
        or (coalesce(step->>'operation','') not in ('document.edit','tracker.command','investigation.run','schedule.command','application.command') and not public.allow_agency_website_draft_step(step)))
    or exists(select 1 from public.standing_responsibility_jobs where finite_work_id = existing.id) then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id = existing.workspace_id and user_id = p_user_id and role = 'owner' for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  select id into assignee_id from public.users where lower(email) = lower(p_assignee_email) and verified_at is not null;
  if assignee_id is null or assignee_id = p_user_id or not exists(select 1 from public.workspace_memberships where workspace_id = p_agency_workspace_id and user_id = assignee_id) then raise exception 'operational_assignment_denied'; end if;
  frozen_scope := public.operational_assignment_work_scope(existing.payload);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_work_id::text || ':' || p_idempotency_key, 0));
  select * into prior from public.operational_assignments where sponsor_id = p_user_id and work_id = p_work_id and offer_key = p_idempotency_key for update;
  if prior.id is null then select * into blocking from public.operational_assignments where work_id = p_work_id and status in ('offered','accepted') order by offered_at desc limit 1 for update; end if;
  select * into existing from public.saved_product_work where id = p_work_id for update;
  if not found or existing.product_id <> 'operations' or existing.resource_kind <> 'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null or coalesce(existing.payload->>'status','') not in ('ready','waiting') or existing.payload ? 'budgetId'
    or public.operational_assignment_work_scope(existing.payload) is distinct from frozen_scope
    or not exists(select 1 from public.workspace_memberships where workspace_id = existing.workspace_id and user_id = p_user_id and role = 'owner')
    or not exists(select 1 from public.workspace_memberships where workspace_id = p_agency_workspace_id and user_id = assignee_id) then raise exception 'operational_assignment_denied'; end if;
  select * into prior from public.operational_assignments where sponsor_id = p_user_id and work_id = p_work_id and offer_key = p_idempotency_key for update;
  if prior.id is null then select * into blocking from public.operational_assignments where work_id = p_work_id and status in ('offered','accepted') order by offered_at desc limit 1 for update; end if;
  if prior.id is not null then
    if prior.workspace_id <> existing.workspace_id or prior.work_id <> existing.id or prior.assignee_user_id <> assignee_id or prior.assignee_email <> lower(p_assignee_email)
      or prior.assignee_kind <> 'agency' or prior.assignee_workspace_id <> p_agency_workspace_id or prior.expires_at <> p_expires_at or prior.work_scope is distinct from frozen_scope then raise exception 'operational_assignment_conflict'; end if;
    return query select * from public.operational_assignments where id = prior.id; return;
  end if;
  if blocking.id is not null and blocking.expires_at <= clock_timestamp() then update public.operational_assignments set status = 'expired' where id = blocking.id;
  elsif blocking.id is not null then raise exception 'operational_assignment_conflict'; end if;
  return query insert into public.operational_assignments(workspace_id,work_id,sponsor_id,sponsor_email,assignee_user_id,assignee_email,assignee_kind,assignee_workspace_id,offer_key,work_scope,expires_at)
    values(existing.workspace_id,existing.id,p_user_id,lower(p_verified_email),assignee_id,lower(p_assignee_email),'agency',p_agency_workspace_id,p_idempotency_key,frozen_scope,p_expires_at) returning *;
end;
$$;
revoke all on function public.offer_agency_operational_assignment(uuid,text,uuid,uuid,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.offer_agency_operational_assignment(uuid,text,uuid,uuid,text,text,timestamptz,text) to service_role;
