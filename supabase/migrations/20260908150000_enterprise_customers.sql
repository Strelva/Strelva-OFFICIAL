-- IMP-05 / AUTH-03 / AUTH-04 / OPS-01 / OPS-06
-- Enterprise Customers expand-only mapping schema.  This migration is
-- intentionally unapplied by this change; deployment, reviewed mapping load,
-- and release-gate activation are separate authorized operations.
--
-- The service-role repository remains the application authorization boundary.
-- RLS is enabled and all browser roles are denied by default as defense in
-- depth.  No public mapping/grant mutation route is created by this slice.

create table public.customer_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_workspace_id uuid not null
    references public.workspaces(id) on delete restrict,
  customer_workspace_id uuid
    references public.workspaces(id) on delete restrict,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 160),
  customer_kind text not null
    check (customer_kind in ('person', 'organization')),
  display_domain text
    check (display_domain is null or (
      display_domain = lower(btrim(display_domain))
      and char_length(display_domain) between 1 and 253
    )),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  provenance_source text not null
    check (provenance_source in ('operator_reviewed', 'reconciled', 'direct_mapping')),
  evidence_reference text
    check (evidence_reference is null or char_length(btrim(evidence_reference)) between 1 and 512),
  recorded_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid not null references public.users(id) on delete restrict,
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_workspace_id),
  check (customer_workspace_id is null or customer_workspace_id <> organization_workspace_id),
  check ((status = 'revoked') = (revoked_by is not null and revoked_at is not null))
);
create index customer_relationships_scope_idx
  on public.customer_relationships (organization_workspace_id, status, display_name, id);

create table public.customer_resources (
  id uuid primary key default gen_random_uuid(),
  organization_workspace_id uuid not null,
  customer_relationship_id uuid not null,
  resource_kind text not null
    check (resource_kind in ('website', 'assessment', 'home_finder_installation')),
  -- Exact tenant/provider identity.  This is server-only and must not be
  -- copied to the browser or used as an implicit customer/name join.
  resource_reference text not null
    check (char_length(btrim(resource_reference)) between 1 and 256),
  display_label text
    check (display_label is null or char_length(btrim(display_label)) between 1 and 160),
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  provenance_source text not null
    check (provenance_source in ('operator_reviewed', 'reconciled', 'direct_mapping')),
  evidence_reference text
    check (evidence_reference is null or char_length(btrim(evidence_reference)) between 1 and 512),
  recorded_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid not null references public.users(id) on delete restrict,
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_relationship_id, organization_workspace_id),
  unique (customer_relationship_id, resource_kind, resource_reference),
  check ((status = 'revoked') = (revoked_by is not null and revoked_at is not null)),
  foreign key (customer_relationship_id, organization_workspace_id)
    references public.customer_relationships(id, organization_workspace_id) on delete restrict
);
create index customer_resources_scope_idx
  on public.customer_resources (organization_workspace_id, customer_relationship_id, status, id);

create table public.customer_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_workspace_id uuid not null,
  user_id uuid not null,
  customer_relationship_id uuid not null,
  customer_resource_id uuid,
  allowed_operations text[] not null,
  status text not null default 'active'
    check (status in ('active', 'revoked')),
  grant_source text not null
    check (grant_source in ('operator_reviewed', 'reconciled', 'direct_mapping')),
  granted_by uuid not null references public.users(id) on delete restrict,
  updated_by uuid not null references public.users(id) on delete restrict,
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_workspace_id, user_id)
    references public.workspace_memberships(workspace_id, user_id) on delete cascade,
  foreign key (customer_relationship_id, organization_workspace_id)
    references public.customer_relationships(id, organization_workspace_id) on delete restrict,
  foreign key (customer_resource_id, customer_relationship_id, organization_workspace_id)
    references public.customer_resources(id, customer_relationship_id, organization_workspace_id) on delete restrict,
  check (
    cardinality(allowed_operations) between 1 and 3
    and allowed_operations <@ array['customer:read', 'resource:read', 'installation:read']::text[]
  ),
  -- A resource-specific assignment is required for any resource operation.
  check (
    customer_resource_id is not null
    or not (
      'resource:read' = any(allowed_operations)
      or 'installation:read' = any(allowed_operations)
    )
  ),
  check ((status = 'revoked') = (revoked_by is not null and revoked_at is not null))
);
create unique index customer_assignments_active_pair_idx
  on public.customer_assignments (
    organization_workspace_id,
    user_id,
    customer_relationship_id,
    coalesce(customer_resource_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where status = 'active';
create index customer_assignments_actor_scope_idx
  on public.customer_assignments (organization_workspace_id, user_id, status, customer_relationship_id);
create index customer_assignments_relationship_idx
  on public.customer_assignments (customer_relationship_id, customer_resource_id, status);

-- Audit is append-only from the application's perspective.  It records the
-- scope and immutable mapping identity, never private customer/provider data.
create table public.customer_mapping_audit (
  id uuid primary key default gen_random_uuid(),
  organization_workspace_id uuid not null
    references public.workspaces(id) on delete restrict,
  record_type text not null
    check (record_type in ('relationship', 'resource', 'assignment')),
  record_id uuid not null,
  action text not null
    check (action in ('created', 'updated', 'revoked')),
  record_version bigint not null check (record_version > 0),
  actor_id uuid references public.users(id) on delete restrict,
  provenance_source text
    check (provenance_source is null or provenance_source in ('operator_reviewed', 'reconciled', 'direct_mapping')),
  evidence_reference text
    check (evidence_reference is null or char_length(btrim(evidence_reference)) between 1 and 512),
  occurred_at timestamptz not null default now()
);
create index customer_mapping_audit_scope_idx
  on public.customer_mapping_audit (organization_workspace_id, occurred_at desc, id);
create index customer_mapping_audit_record_idx
  on public.customer_mapping_audit (record_type, record_id, occurred_at desc);

-- Mapping context is explicit.  A customer/workspace owner title never grants
-- access, but the selected context must be a non-personal workspace and any
-- direct customer workspace must have customer kind.
create or replace function public.assert_customer_mapping_context()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  organization_kind text;
  customer_kind text;
begin
  select kind into organization_kind
    from public.workspaces where id = new.organization_workspace_id;
  if organization_kind not in ('agency', 'customer') then
    raise exception 'customer_organization_invalid';
  end if;

  if new.customer_workspace_id is not null then
    select kind into customer_kind
      from public.workspaces where id = new.customer_workspace_id;
    if customer_kind <> 'customer' then
      raise exception 'customer_workspace_invalid';
    end if;
  end if;
  return new;
end;
$$;
create trigger customer_relationship_context_trg
  before insert or update on public.customer_relationships
  for each row execute function public.assert_customer_mapping_context();

-- Versions are database-owned.  A future scoped writer must predicate updates
-- on the caller's expected version; this trigger makes concurrent writes
-- monotonic and prevents callers from forging a version.
create or replace function public.bump_customer_mapping_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id then raise exception 'customer_mapping_id_immutable'; end if;
  if tg_table_name = 'customer_relationships' then
    if new.organization_workspace_id <> old.organization_workspace_id
      or new.customer_workspace_id is distinct from old.customer_workspace_id
      or new.customer_kind <> old.customer_kind
      or new.recorded_by <> old.recorded_by
      or new.created_at <> old.created_at then
      raise exception 'customer_mapping_identity_immutable';
    end if;
  elsif tg_table_name = 'customer_resources' then
    if new.organization_workspace_id <> old.organization_workspace_id
      or new.customer_relationship_id <> old.customer_relationship_id
      or new.resource_kind <> old.resource_kind
      or new.resource_reference <> old.resource_reference
      or new.recorded_by <> old.recorded_by
      or new.created_at <> old.created_at then
      raise exception 'customer_mapping_identity_immutable';
    end if;
  else
    if new.organization_workspace_id <> old.organization_workspace_id
      or new.user_id <> old.user_id
      or new.customer_relationship_id <> old.customer_relationship_id
      or new.customer_resource_id is distinct from old.customer_resource_id
      or new.granted_by <> old.granted_by
      or new.created_at <> old.created_at then
      raise exception 'customer_mapping_identity_immutable';
    end if;
  end if;
  if new.updated_by is null then raise exception 'customer_mapping_actor_required'; end if;
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'customer_mapping_reactivation_forbidden';
  end if;
  if new.version <> old.version then raise exception 'customer_mapping_version_managed'; end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger customer_relationship_version_trg
  before update on public.customer_relationships
  for each row execute function public.bump_customer_mapping_version();
create trigger customer_resource_version_trg
  before update on public.customer_resources
  for each row execute function public.bump_customer_mapping_version();
create trigger customer_assignment_version_trg
  before update on public.customer_assignments
  for each row execute function public.bump_customer_mapping_version();

-- Installation reads require both the generic resource permission and the
-- installation-specific permission.  The resource mapping is resolved by
-- exact ID, never by brokerage/name/domain.
create or replace function public.assert_customer_assignment_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  mapped_resource_kind text;
begin
  if new.customer_resource_id is null then
    if 'resource:read' = any(new.allowed_operations)
      or 'installation:read' = any(new.allowed_operations) then
      raise exception 'customer_resource_assignment_required';
    end if;
    return new;
  end if;

  select cr.resource_kind into mapped_resource_kind
    from public.customer_resources as cr
    where cr.id = new.customer_resource_id
      and cr.customer_relationship_id = new.customer_relationship_id
      and cr.organization_workspace_id = new.organization_workspace_id;
  if mapped_resource_kind is null then raise exception 'customer_resource_assignment_invalid'; end if;
  if mapped_resource_kind = 'home_finder_installation' then
    if not ('resource:read' = any(new.allowed_operations)
      and 'installation:read' = any(new.allowed_operations)) then
      raise exception 'customer_installation_scope_required';
    end if;
  elsif 'installation:read' = any(new.allowed_operations) then
    raise exception 'customer_installation_scope_invalid';
  end if;
  return new;
end;
$$;
create trigger customer_assignment_scope_trg
  before insert or update on public.customer_assignments
  for each row execute function public.assert_customer_assignment_scope();

create or replace function public.audit_customer_mapping_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  organization_id uuid;
  record_id uuid;
  record_version bigint;
  source text;
  evidence text;
  actor uuid;
  action_name text;
  record_kind text;
begin
  if tg_op = 'DELETE' then
    raise exception 'customer_mapping_delete_forbidden';
  end if;

  if tg_table_name = 'customer_relationships' then
    organization_id := new.organization_workspace_id;
    record_id := new.id;
    record_version := new.version;
    source := new.provenance_source;
    evidence := new.evidence_reference;
    actor := new.updated_by;
    record_kind := 'relationship';
  elsif tg_table_name = 'customer_resources' then
    organization_id := new.organization_workspace_id;
    record_id := new.id;
    record_version := new.version;
    source := new.provenance_source;
    evidence := new.evidence_reference;
    actor := new.updated_by;
    record_kind := 'resource';
  else
    organization_id := new.organization_workspace_id;
    record_id := new.id;
    record_version := new.version;
    source := new.grant_source;
    evidence := null;
    actor := new.updated_by;
    record_kind := 'assignment';
  end if;

  action_name := case
    when tg_op = 'INSERT' then 'created'
    when new.status = 'revoked' and old.status is distinct from 'revoked' then 'revoked'
    else 'updated'
  end;

  insert into public.customer_mapping_audit (
    organization_workspace_id, record_type, record_id, action,
    record_version, actor_id, provenance_source, evidence_reference
  ) values (
    organization_id, record_kind, record_id, action_name,
    record_version, actor, source, evidence
  );
  return new;
end;
$$;
create trigger customer_relationship_audit_trg
  after insert or update on public.customer_relationships
  for each row execute function public.audit_customer_mapping_change();
create trigger customer_resource_audit_trg
  after insert or update on public.customer_resources
  for each row execute function public.audit_customer_mapping_change();
create trigger customer_assignment_audit_trg
  after insert or update on public.customer_assignments
  for each row execute function public.audit_customer_mapping_change();

-- Native membership removal is an authoritative revocation, but it does not
-- carry an authenticated mapping-operator identity.  Record the affected
-- live assignments before the FK cascade deletes them, with a truthful NULL
-- actor and an explicit system evidence marker.  This preserves revocation
-- evidence without blocking the existing membership lifecycle.
create or replace function public.audit_customer_membership_removal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.customer_mapping_audit (
    organization_workspace_id, record_type, record_id, action,
    record_version, actor_id, provenance_source, evidence_reference
  )
  select
    ca.organization_workspace_id, 'assignment', ca.id, 'revoked',
    ca.version, null, ca.grant_source, 'native-membership-removal'
  from public.customer_assignments as ca
  where ca.organization_workspace_id = old.workspace_id
    and ca.user_id = old.user_id
    and ca.status = 'active';
  return old;
end;
$$;
create trigger customer_membership_removal_audit_trg
  before delete on public.workspace_memberships
  for each row execute function public.audit_customer_membership_removal();

alter table public.customer_relationships enable row level security;
alter table public.customer_resources enable row level security;
alter table public.customer_assignments enable row level security;
alter table public.customer_mapping_audit enable row level security;

revoke all on table public.customer_relationships,
  public.customer_resources, public.customer_assignments,
  public.customer_mapping_audit from public, anon, authenticated;
grant select, insert, update on table public.customer_relationships,
  public.customer_resources, public.customer_assignments to service_role;
grant select, insert on table public.customer_mapping_audit to service_role;

revoke all on function public.assert_customer_mapping_context() from public, anon, authenticated;
revoke all on function public.bump_customer_mapping_version() from public, anon, authenticated;
revoke all on function public.assert_customer_assignment_scope() from public, anon, authenticated;
revoke all on function public.audit_customer_mapping_change() from public, anon, authenticated;
revoke all on function public.audit_customer_membership_removal() from public, anon, authenticated;
