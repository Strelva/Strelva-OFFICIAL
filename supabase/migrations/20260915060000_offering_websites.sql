-- Explicit local business-to-managed-website attachment. This does not change
-- tenant membership, domain verification, routing, billing, or provider terms.

create table public.offering_website_bindings (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  tenant_stable_id uuid references public.tenants(stable_id) on delete set null,
  tenant_id_at_binding text not null,
  site_name_at_binding text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  revision bigint not null default 1 check (revision > 0),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or char_length(btrim(revocation_reason)) between 1 and 500),
  unique (business_workspace_id, idempotency_key),
  unique (id, business_workspace_id),
  check ((status = 'revoked') = (revoked_by is not null and revoked_at is not null and revocation_reason is not null))
);
create unique index offering_website_binding_active_tenant_idx
  on public.offering_website_bindings(tenant_stable_id)
  where status='active' and tenant_stable_id is not null;
create index offering_website_binding_business_idx
  on public.offering_website_bindings(business_workspace_id, updated_at desc, id);

alter table public.offering_website_bindings enable row level security;
revoke all on table public.offering_website_bindings from public, anon, authenticated, service_role;

create or replace function public.read_offering_business_snapshot(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_installation_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor_role text;
  installations jsonb;
  bindings jsonb;
begin
  actor_role := public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, false);
  if p_installation_id is not null and not exists (
    select 1 from public.offering_installations
      where business_workspace_id=p_business_id and id=p_installation_id
  ) then raise exception 'offering_installation_not_found'; end if;
  select coalesce(jsonb_agg(to_jsonb(item)-'idempotency_key'-'command_digest' order by item.updated_at desc,item.id),'[]'::jsonb)
    into installations
    from public.offering_installations item
    where item.business_workspace_id=p_business_id
      and (p_installation_id is null or item.id=p_installation_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',binding.id,
      'business_workspace_id',binding.business_workspace_id,
      'status',binding.status,
      'revision',binding.revision,
      'tenant_id',coalesce(tenant.id,binding.tenant_id_at_binding),
      'site_name',coalesce(tenant.site_name,binding.site_name_at_binding),
      'tenant_active',coalesce(tenant.active,false),
      'actor_has_tenant_access',exists(
        select 1 from public.memberships membership
          where membership.user_id=p_user_id and membership.tenant_stable_id=binding.tenant_stable_id
      ),
      'created_by',binding.created_by,
      'created_at',binding.created_at,
      'updated_by',binding.updated_by,
      'updated_at',binding.updated_at,
      'revoked_by',binding.revoked_by,
      'revoked_at',binding.revoked_at,
      'revocation_reason',binding.revocation_reason
    ) order by binding.updated_at desc,binding.id),'[]'::jsonb)
    into bindings
    from public.offering_website_bindings binding
    left join public.tenants tenant on tenant.stable_id=binding.tenant_stable_id
    where binding.business_workspace_id=p_business_id;
  return jsonb_build_object(
    'workspaceRole',actor_role,
    'installations',installations,
    'websiteBindings',bindings
  );
end;
$$;

create or replace function public.bind_offering_website(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_tenant_id text,
  p_idempotency_key text,
  p_command_digest text
) returns table (
  id uuid, business_workspace_id uuid, status text, revision bigint,
  tenant_id text, site_name text, tenant_active boolean, actor_has_tenant_access boolean,
  created_by uuid, created_at timestamptz, updated_by uuid, updated_at timestamptz,
  revoked_by uuid, revoked_at timestamptz, revocation_reason text
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  existing public.offering_website_bindings%rowtype;
  created public.offering_website_bindings%rowtype;
  tenant_row public.tenants%rowtype;
begin
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  if p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null
    or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'offering_website_idempotency_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offering-website-key:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into existing from public.offering_website_bindings binding
    where binding.business_workspace_id=p_business_id and binding.idempotency_key=p_idempotency_key for update;
  if found then
    if existing.command_digest<>p_command_digest then raise exception 'offering_website_idempotency_conflict'; end if;
    return query select existing.id,existing.business_workspace_id,existing.status,existing.revision,
      coalesce(tenant.id,existing.tenant_id_at_binding),
      coalesce(tenant.site_name,existing.site_name_at_binding),coalesce(tenant.active,false),
      exists(select 1 from public.memberships membership where membership.user_id=p_user_id and membership.tenant_stable_id=existing.tenant_stable_id),
      existing.created_by,existing.created_at,existing.updated_by,existing.updated_at,
      existing.revoked_by,existing.revoked_at,existing.revocation_reason
      from (select 1) marker
      left join public.tenants tenant on tenant.stable_id=existing.tenant_stable_id;
    return;
  end if;

  select * into tenant_row from public.tenants tenant
    where tenant.id=p_tenant_id and tenant.active is true for share;
  if not found then raise exception 'offering_website_unavailable'; end if;
  perform 1 from public.memberships membership
    where membership.user_id=p_user_id
      and membership.tenant_id=tenant_row.id
      and membership.tenant_stable_id=tenant_row.stable_id
      and membership.role='owner'
    for share;
  if not found then raise exception 'offering_tenant_owner_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('offering-website:'||tenant_row.stable_id::text,0));
  if exists(
    select 1 from public.offering_website_bindings binding
      where binding.tenant_stable_id=tenant_row.stable_id and binding.status='active'
  ) then
    raise exception 'offering_website_already_bound';
  end if;
  insert into public.offering_website_bindings(
    business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,
    idempotency_key,command_digest,created_by,updated_by
  ) values (
    p_business_id,tenant_row.stable_id,tenant_row.id,tenant_row.site_name,
    p_idempotency_key,p_command_digest,p_user_id,p_user_id
  ) returning * into created;
  return query select created.id,created.business_workspace_id,created.status,created.revision,
    tenant_row.id,tenant_row.site_name,tenant_row.active,true,
    created.created_by,created.created_at,created.updated_by,created.updated_at,
    created.revoked_by,created.revoked_at,created.revocation_reason;
end;
$$;

create or replace function public.revoke_offering_website_binding(
  p_business_id uuid,
  p_binding_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_expected_revision bigint,
  p_reason text
) returns table (
  id uuid, business_workspace_id uuid, status text, revision bigint,
  tenant_id text, site_name text, tenant_active boolean, actor_has_tenant_access boolean,
  created_by uuid, created_at timestamptz, updated_by uuid, updated_at timestamptz,
  revoked_by uuid, revoked_at timestamptz, revocation_reason text
)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_row public.offering_website_bindings%rowtype;
begin
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  select * into current_row from public.offering_website_bindings binding
    where binding.id=p_binding_id and binding.business_workspace_id=p_business_id for update;
  if not found then raise exception 'offering_website_binding_not_found'; end if;
  if current_row.status<>'active' then raise exception 'offering_website_binding_revoked'; end if;
  if p_expected_revision is null or p_expected_revision<=0
    or current_row.revision<>p_expected_revision then raise exception 'offering_website_revision_conflict'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'offering_website_reason_invalid'; end if;
  update public.offering_website_bindings binding set status='revoked',revision=binding.revision+1,
    updated_by=p_user_id,updated_at=clock_timestamp(),revoked_by=p_user_id,
    revoked_at=clock_timestamp(),revocation_reason=btrim(p_reason)
    where binding.id=current_row.id returning binding.* into current_row;
  return query select current_row.id,current_row.business_workspace_id,current_row.status,current_row.revision,
    coalesce(tenant.id,current_row.tenant_id_at_binding),
    coalesce(tenant.site_name,current_row.site_name_at_binding),coalesce(tenant.active,false),
    exists(select 1 from public.memberships membership where membership.user_id=p_user_id and membership.tenant_stable_id=current_row.tenant_stable_id),
    current_row.created_by,current_row.created_at,current_row.updated_by,current_row.updated_at,
    current_row.revoked_by,current_row.revoked_at,current_row.revocation_reason
    from (select 1) marker
    left join public.tenants tenant on tenant.stable_id=current_row.tenant_stable_id;
end;
$$;

create or replace function public.guard_offering_website_binding_change()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  -- Preserve the binding as a tombstone when the existing deprovision path
  -- deletes its tenant. The FK clears only the physical reference; it does not
  -- delete history or alter workspace or tenant permissions.
  if old.tenant_stable_id is not null and new.tenant_stable_id is null
    and (new.id,new.business_workspace_id,new.tenant_id_at_binding,
      new.site_name_at_binding,new.status,new.revision,new.idempotency_key,
      new.command_digest,new.created_by,new.created_at,new.updated_by,new.updated_at,
      new.revoked_by,new.revoked_at,new.revocation_reason)
      is not distinct from
      (old.id,old.business_workspace_id,old.tenant_id_at_binding,
      old.site_name_at_binding,old.status,old.revision,old.idempotency_key,
      old.command_digest,old.created_by,old.created_at,old.updated_by,old.updated_at,
      old.revoked_by,old.revoked_at,old.revocation_reason) then
    return new;
  end if;
  if (new.id,new.business_workspace_id,new.tenant_stable_id,new.tenant_id_at_binding,
      new.site_name_at_binding,new.idempotency_key,new.command_digest,new.created_by,new.created_at)
    is distinct from
    (old.id,old.business_workspace_id,old.tenant_stable_id,old.tenant_id_at_binding,
      old.site_name_at_binding,old.idempotency_key,old.command_digest,old.created_by,old.created_at) then
    raise exception 'offering_website_binding_identity_immutable';
  end if;
  if old.status='revoked' then raise exception 'offering_website_binding_revoked'; end if;
  if new.revision<>old.revision+1 or new.status<>'revoked' then raise exception 'offering_website_binding_transition_invalid'; end if;
  return new;
end;
$$;
create trigger offering_website_binding_change_trg before update on public.offering_website_bindings
  for each row execute function public.guard_offering_website_binding_change();

-- Extend the installed-resource check without accepting a slug, domain, or URL
-- as website authority. The browser supplies only a binding UUID created above.
create or replace function public.offering_assert_install_payload(
  p_definition_id text,
  p_definition_version text,
  p_business_id uuid,
  p_configuration jsonb,
  p_native_resources jsonb,
  p_responsibility jsonb,
  p_accepted_scope text[],
  p_surface_ids text[]
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  resource_id uuid;
begin
  if p_definition_version is distinct from '1.0.0' then raise exception 'offering_definition_not_installable'; end if;
  if p_definition_id='private_staff_requests' then
    perform public.offering_assert_metadata(p_configuration,p_responsibility,p_accepted_scope,p_surface_ids);
    if jsonb_typeof(p_native_resources) is distinct from 'array' or jsonb_array_length(p_native_resources)<>1
      or p_native_resources->0->>'kind' is distinct from 'application'
      or (p_native_resources->0)-array['kind','id']::text[]<>'{}'::jsonb then raise exception 'offering_native_resources_invalid'; end if;
    resource_id := (p_native_resources->0->>'id')::uuid;
    perform 1 from public.saved_product_work work join public.application_states app
      on app.work_id=work.id and app.workspace_id=work.workspace_id
      where work.id=resource_id and work.workspace_id=p_business_id
        and work.product_id='applications' and work.resource_kind='application'
        and app.lifecycle_status='installed' and app.current_release_version is not null
      for share of work,app;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
    return;
  end if;
  if p_definition_id='managed_website_changes' then
    perform public.offering_assert_metadata(p_configuration,p_responsibility,
      array['submit_requests','review_requests'],array['staff_app','business_workspace']);
    if p_configuration is distinct from '{}'::jsonb
      or p_accepted_scope is distinct from array['request_changes']::text[]
      or p_surface_ids is distinct from array['managed_website']::text[]
      or jsonb_typeof(p_native_resources) is distinct from 'array' or jsonb_array_length(p_native_resources)<>1
      or p_native_resources->0->>'kind' is distinct from 'managed_website'
      or (p_native_resources->0)-array['kind','id']::text[]<>'{}'::jsonb then raise exception 'offering_native_resources_invalid'; end if;
    resource_id := (p_native_resources->0->>'id')::uuid;
    perform 1 from public.offering_website_bindings binding
      join public.tenants tenant on tenant.stable_id=binding.tenant_stable_id and tenant.active is true
      where binding.id=resource_id and binding.business_workspace_id=p_business_id and binding.status='active' for share of binding,tenant;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
    return;
  end if;
  raise exception 'offering_definition_not_installable';
end;
$$;

revoke all on function public.read_offering_business_snapshot(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.bind_offering_website(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.revoke_offering_website_binding(uuid,uuid,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.read_offering_business_snapshot(uuid,uuid,text,uuid) to service_role;
grant execute on function public.bind_offering_website(uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.revoke_offering_website_binding(uuid,uuid,uuid,text,bigint,text) to service_role;
revoke execute on function public.read_offering_installations(uuid,uuid,text,uuid) from service_role;
