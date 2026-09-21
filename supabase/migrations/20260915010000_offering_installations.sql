-- Local-only offering installation authority. Applying this migration or
-- enabling a production surface requires a separate authorized action.

create table public.offering_installations (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  definition_id text not null check (definition_id ~ '^[a-z][a-z0-9_]{0,79}$'),
  definition_version text not null check (definition_version ~ '^\d+\.\d+\.\d+$'),
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  revision bigint not null default 1 check (revision > 0),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  -- These are exact native ids, not copied records or inferred ownership.
  native_resources jsonb not null check (jsonb_typeof(native_resources) = 'array'),
  -- A provider request is not provider acceptance. This migration has no
  -- provider-acceptance command and cannot create a managed-service promise.
  responsibility jsonb not null check (jsonb_typeof(responsibility) = 'object'),
  -- The installing business actor acknowledges this bounded software scope.
  -- It does not grant new authority in any referenced native product.
  accepted_scope text[] not null check (cardinality(accepted_scope) between 1 and 16),
  surface_ids text[] not null check (cardinality(surface_ids) between 1 and 16),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  installed_by uuid not null references public.users(id) on delete restrict,
  installed_at timestamptz not null default now(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  retired_by uuid references public.users(id) on delete restrict,
  retired_at timestamptz,
  retirement_reason text check (retirement_reason is null or char_length(btrim(retirement_reason)) between 1 and 500),
  unique (business_workspace_id, idempotency_key),
  unique (id, business_workspace_id),
  check ((status = 'retired') = (retired_by is not null and retired_at is not null and retirement_reason is not null))
);

create unique index offering_installations_active_definition_idx
  on public.offering_installations (business_workspace_id, definition_id)
  where status in ('draft', 'active');
create index offering_installations_business_updated_idx
  on public.offering_installations (business_workspace_id, updated_at desc, id);

alter table public.offering_installations enable row level security;
revoke all on table public.offering_installations from public, anon, authenticated;
revoke all on table public.offering_installations from service_role;

create or replace function public.offering_assert_actor(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_manage boolean
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor_role text;
begin
  perform 1 from public.users
    where id = p_user_id
      and lower(email) = lower(btrim(p_verified_email))
      and verified_at is not null
    for key share;
  if not found then raise exception 'offering_actor_unverified'; end if;

  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_business_id
      and wm.user_id = p_user_id
      and w.kind = 'customer'
    for share of wm, w;
  if actor_role is null then raise exception 'offering_business_membership_required'; end if;
  if p_manage and actor_role not in ('owner', 'admin') then
    raise exception 'offering_manage_membership_required';
  end if;
  return actor_role;
end;
$$;

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
  application_id uuid;
begin
  if p_definition_id is distinct from 'private_staff_requests' or p_definition_version is distinct from '1.0.0' then
    raise exception 'offering_definition_not_installable';
  end if;
  if jsonb_typeof(p_configuration) is distinct from 'object' or char_length(p_configuration::text) > 4000 then
    raise exception 'offering_configuration_invalid';
  end if;
  if p_configuration - array['displayName', 'instructions']::text[] <> '{}'::jsonb
    or (p_configuration ? 'displayName' and (
      jsonb_typeof(p_configuration->'displayName') <> 'string'
      or char_length(btrim(p_configuration->>'displayName')) not between 1 and 80
    ))
    or (p_configuration ? 'instructions' and (
      jsonb_typeof(p_configuration->'instructions') <> 'string'
      or char_length(btrim(p_configuration->>'instructions')) not between 1 and 500
    )) then
    raise exception 'offering_configuration_invalid';
  end if;
  if jsonb_typeof(p_native_resources) is distinct from 'array'
    or jsonb_array_length(p_native_resources) <> 1
    or p_native_resources->0->>'kind' <> 'application'
    or (p_native_resources->0) - array['kind', 'id']::text[] <> '{}'::jsonb then
    raise exception 'offering_native_resources_invalid';
  end if;
  application_id := (p_native_resources->0->>'id')::uuid;
  perform 1
    from public.saved_product_work work
    join public.application_states app
      on app.work_id = work.id and app.workspace_id = work.workspace_id
    where work.id = application_id
      and work.workspace_id = p_business_id
      and work.product_id = 'applications'
      and work.resource_kind = 'application'
      and app.lifecycle_status = 'installed'
      and app.current_release_version is not null
    for share of work, app;
  if not found then raise exception 'offering_native_resource_outside_business'; end if;

  if p_accepted_scope is null
    or not (p_accepted_scope @> array['submit_requests', 'review_requests']::text[])
    or not (p_accepted_scope <@ array['submit_requests', 'review_requests']::text[])
    or cardinality(p_accepted_scope) <> cardinality(array(select distinct unnest(p_accepted_scope))) then
    raise exception 'offering_scope_invalid';
  end if;
  if p_surface_ids is null
    or not (p_surface_ids @> array['staff_app', 'business_workspace']::text[])
    or not (p_surface_ids <@ array['staff_app', 'business_workspace']::text[])
    or cardinality(p_surface_ids) <> cardinality(array(select distinct unnest(p_surface_ids))) then
    raise exception 'offering_surfaces_invalid';
  end if;

  if jsonb_typeof(p_responsibility) is distinct from 'object' then raise exception 'offering_responsibility_invalid'; end if;
  if p_responsibility->>'kind' = 'customer_operated' then
    if p_responsibility - array['kind', 'providerName']::text[] <> '{}'::jsonb
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120 then
      raise exception 'offering_responsibility_invalid';
    end if;
  elsif p_responsibility->>'kind' = 'provider_requested' then
    if p_responsibility - array['kind', 'providerKind', 'providerName', 'requestNote']::text[] <> '{}'::jsonb
      or jsonb_typeof(p_responsibility->'providerKind') is distinct from 'string'
      or p_responsibility->>'providerKind' not in ('strelva', 'named_third_party')
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120
      or (p_responsibility ? 'requestNote' and (
        jsonb_typeof(p_responsibility->'requestNote') is distinct from 'string'
        or char_length(btrim(p_responsibility->>'requestNote')) not between 1 and 500
      )) then
      raise exception 'offering_responsibility_invalid';
    end if;
  else
    raise exception 'offering_responsibility_invalid';
  end if;
end;
$$;

create or replace function public.offering_assert_metadata(
  p_configuration jsonb,
  p_responsibility jsonb,
  p_accepted_scope text[],
  p_surface_ids text[]
) returns void
language plpgsql immutable set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_configuration) is distinct from 'object' or char_length(p_configuration::text) > 4000
    or p_configuration - array['displayName', 'instructions']::text[] <> '{}'::jsonb
    or (p_configuration ? 'displayName' and (
      jsonb_typeof(p_configuration->'displayName') <> 'string'
      or char_length(btrim(p_configuration->>'displayName')) not between 1 and 80
    ))
    or (p_configuration ? 'instructions' and (
      jsonb_typeof(p_configuration->'instructions') <> 'string'
      or char_length(btrim(p_configuration->>'instructions')) not between 1 and 500
    )) then raise exception 'offering_configuration_invalid'; end if;
  if p_accepted_scope is null
    or not (p_accepted_scope @> array['submit_requests', 'review_requests']::text[])
    or not (p_accepted_scope <@ array['submit_requests', 'review_requests']::text[])
    or cardinality(p_accepted_scope) <> cardinality(array(select distinct unnest(p_accepted_scope))) then
    raise exception 'offering_scope_invalid';
  end if;
  if p_surface_ids is null
    or not (p_surface_ids @> array['staff_app', 'business_workspace']::text[])
    or not (p_surface_ids <@ array['staff_app', 'business_workspace']::text[])
    or cardinality(p_surface_ids) <> cardinality(array(select distinct unnest(p_surface_ids))) then
    raise exception 'offering_surfaces_invalid';
  end if;
  if jsonb_typeof(p_responsibility) is distinct from 'object' then raise exception 'offering_responsibility_invalid'; end if;
  if p_responsibility->>'kind' = 'customer_operated' then
    if p_responsibility - array['kind', 'providerName']::text[] <> '{}'::jsonb
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120 then
      raise exception 'offering_responsibility_invalid';
    end if;
  elsif p_responsibility->>'kind' = 'provider_requested' then
    if p_responsibility - array['kind', 'providerKind', 'providerName', 'requestNote']::text[] <> '{}'::jsonb
      or jsonb_typeof(p_responsibility->'providerKind') is distinct from 'string'
      or p_responsibility->>'providerKind' not in ('strelva', 'named_third_party')
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120
      or (p_responsibility ? 'requestNote' and (
        jsonb_typeof(p_responsibility->'requestNote') is distinct from 'string'
        or char_length(btrim(p_responsibility->>'requestNote')) not between 1 and 500
      )) then
      raise exception 'offering_responsibility_invalid';
    end if;
  else
    raise exception 'offering_responsibility_invalid';
  end if;
end;
$$;

create or replace function public.read_offering_installations(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_installation_id uuid default null
) returns table (installation jsonb, workspace_role text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  actor_role text;
begin
  actor_role := public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, false);
  if p_installation_id is not null and not exists (
    select 1 from public.offering_installations
      where business_workspace_id = p_business_id and id = p_installation_id
  ) then raise exception 'offering_installation_not_found'; end if;

  return query
    select to_jsonb(item) - 'idempotency_key' - 'command_digest', actor_role
    from public.offering_installations item
    where item.business_workspace_id = p_business_id
      and (p_installation_id is null or item.id = p_installation_id)
    order by item.updated_at desc, item.id;
  if not found then
    installation := null;
    workspace_role := actor_role;
    return next;
  end if;
end;
$$;

create or replace function public.install_offering(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_definition_id text,
  p_definition_version text,
  p_idempotency_key text,
  p_command_digest text,
  p_configuration jsonb,
  p_native_resources jsonb,
  p_responsibility jsonb,
  p_accepted_scope text[],
  p_surface_ids text[]
) returns setof public.offering_installations
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  existing public.offering_installations%rowtype;
  created public.offering_installations%rowtype;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'offering_idempotency_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offering:' || p_business_id::text || ':' || p_definition_id, 0));

  select * into existing from public.offering_installations
    where business_workspace_id = p_business_id and idempotency_key = p_idempotency_key
    for update;
  if found then
    if existing.command_digest <> p_command_digest then raise exception 'offering_idempotency_conflict'; end if;
    return next existing;
    return;
  end if;

  perform public.offering_assert_install_payload(
    p_definition_id, p_definition_version, p_business_id, p_configuration,
    p_native_resources, p_responsibility, p_accepted_scope, p_surface_ids
  );
  if exists (
    select 1 from public.offering_installations
      where business_workspace_id = p_business_id
        and definition_id = p_definition_id and status = 'active'
  ) then raise exception 'offering_definition_already_installed'; end if;

  insert into public.offering_installations (
    business_workspace_id, definition_id, definition_version, configuration,
    native_resources, responsibility, accepted_scope, surface_ids,
    idempotency_key, command_digest, installed_by, updated_by
  ) values (
    p_business_id, p_definition_id, p_definition_version, p_configuration,
    p_native_resources, p_responsibility, p_accepted_scope, p_surface_ids,
    p_idempotency_key, p_command_digest, p_user_id, p_user_id
  ) returning * into created;
  return next created;
end;
$$;

create or replace function public.prepare_staff_request_offering(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_idempotency_key text,
  p_command_digest text,
  p_configuration jsonb,
  p_responsibility jsonb,
  p_accepted_scope text[],
  p_surface_ids text[]
) returns setof public.offering_installations
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  existing public.offering_installations%rowtype;
  created public.offering_installations%rowtype;
  application_id uuid := gen_random_uuid();
  created_at timestamptz := clock_timestamp();
  application_spec jsonb;
  application_payload jsonb;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then raise exception 'offering_idempotency_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('offering:' || p_business_id::text || ':private_staff_requests', 0));
  select * into existing from public.offering_installations
    where business_workspace_id = p_business_id and idempotency_key = p_idempotency_key
    for update;
  if found then
    if existing.command_digest <> p_command_digest then raise exception 'offering_idempotency_conflict'; end if;
    return next existing;
    return;
  end if;
  if exists (
    select 1 from public.offering_installations
      where business_workspace_id = p_business_id
        and definition_id = 'private_staff_requests' and status in ('draft', 'active')
  ) then raise exception 'offering_definition_already_installed'; end if;
  perform public.offering_assert_metadata(p_configuration, p_responsibility, p_accepted_scope, p_surface_ids);

  application_spec := jsonb_build_object(
    'title', 'Staff requests',
    'maintenanceOwner', p_user_id::text,
    'fields', jsonb_build_array(
      jsonb_build_object('id','request','label','Request','type','text','required',true),
      jsonb_build_object('id','details','label','Details','type','text','required',false)
    ),
    'components', jsonb_build_array(
      jsonb_build_object('kind','form','fields',jsonb_build_array('request','details')),
      jsonb_build_object('kind','list','fields',jsonb_build_array('request','details'))
    )
  );
  perform public.validate_application_spec(application_spec);
  application_payload := jsonb_build_object(
    'version', 1, 'revision', 0, 'title', 'Staff requests',
    'createdBy', p_user_id::text, 'createdAt', created_at,
    'history', '[]'::jsonb, 'spec', application_spec, 'specVersion', 1,
    'status', 'draft', 'versions', jsonb_build_array(jsonb_build_object('version',1,'spec',application_spec)),
    'rehearsal', 'null'::jsonb, 'records', '[]'::jsonb
  );
  insert into public.saved_product_work(
    id, workspace_id, product_id, resource_kind, title, payload, input, created_by
  ) values (
    application_id, p_business_id, 'applications', 'application', 'Staff requests',
    application_payload, jsonb_build_object('source','offering_default','definitionId','private_staff_requests','definitionVersion','1.0.0'), p_user_id
  );
  -- The application trigger creates canonical draft state in this transaction.
  if not exists (
    select 1 from public.application_states
      where work_id = application_id and workspace_id = p_business_id
        and lifecycle_status = 'draft' and current_release_version is null
  ) then raise exception 'offering_default_application_unavailable'; end if;

  insert into public.offering_installations(
    business_workspace_id, definition_id, definition_version, status, configuration,
    native_resources, responsibility, accepted_scope, surface_ids,
    idempotency_key, command_digest, installed_by, installed_at, updated_by, updated_at
  ) values (
    p_business_id, 'private_staff_requests', '1.0.0', 'draft', p_configuration,
    jsonb_build_array(jsonb_build_object('kind','application','id',application_id::text)),
    p_responsibility, p_accepted_scope, p_surface_ids,
    p_idempotency_key, p_command_digest, p_user_id, created_at, p_user_id, created_at
  ) returning * into created;
  return next created;
end;
$$;

create or replace function public.activate_offering(
  p_business_id uuid,
  p_installation_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_expected_revision bigint
) returns setof public.offering_installations
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_row public.offering_installations%rowtype;
  application_id uuid;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  select * into current_row from public.offering_installations
    where id = p_installation_id and business_workspace_id = p_business_id for update;
  if not found then raise exception 'offering_installation_not_found'; end if;
  if current_row.status <> 'draft' then raise exception 'offering_activation_status_invalid'; end if;
  if p_expected_revision is null or p_expected_revision <= 0
    or current_row.revision <> p_expected_revision then raise exception 'offering_revision_conflict'; end if;
  application_id := (current_row.native_resources->0->>'id')::uuid;
  perform 1 from public.saved_product_work work
    join public.application_states app on app.work_id=work.id and app.workspace_id=work.workspace_id
    where work.id=application_id and work.workspace_id=p_business_id
      and work.product_id='applications' and work.resource_kind='application'
      and app.lifecycle_status='installed' and app.current_release_version is not null
    for share of work, app;
  if not found then raise exception 'offering_native_release_required'; end if;
  update public.offering_installations set status='active', revision=revision+1,
    updated_by=p_user_id, updated_at=clock_timestamp()
    where id=current_row.id returning * into current_row;
  return next current_row;
end;
$$;

create or replace function public.update_offering_configuration(
  p_business_id uuid,
  p_installation_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_expected_revision bigint,
  p_configuration jsonb
) returns setof public.offering_installations
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_row public.offering_installations%rowtype;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  select * into current_row from public.offering_installations
    where id = p_installation_id and business_workspace_id = p_business_id
    for update;
  if not found then raise exception 'offering_installation_not_found'; end if;
  if current_row.status not in ('draft', 'active') then raise exception 'offering_installation_retired'; end if;
  if p_expected_revision is null or p_expected_revision <= 0
    or current_row.revision <> p_expected_revision then raise exception 'offering_revision_conflict'; end if;
  perform public.offering_assert_metadata(
    p_configuration, current_row.responsibility, current_row.accepted_scope, current_row.surface_ids
  );
  perform 1 from public.saved_product_work
    where id=(current_row.native_resources->0->>'id')::uuid
      and workspace_id=p_business_id and product_id='applications' and resource_kind='application'
    for share;
  if not found then raise exception 'offering_native_resource_outside_business'; end if;
  update public.offering_installations set
    configuration = p_configuration,
    revision = revision + 1,
    updated_by = p_user_id,
    updated_at = now()
    where id = current_row.id
    returning * into current_row;
  return next current_row;
end;
$$;

create or replace function public.retire_offering(
  p_business_id uuid,
  p_installation_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_expected_revision bigint,
  p_reason text
) returns setof public.offering_installations
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_row public.offering_installations%rowtype;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  select * into current_row from public.offering_installations
    where id = p_installation_id and business_workspace_id = p_business_id
    for update;
  if not found then raise exception 'offering_installation_not_found'; end if;
  if current_row.status not in ('draft', 'active') then raise exception 'offering_installation_retired'; end if;
  if p_expected_revision is null or p_expected_revision <= 0
    or current_row.revision <> p_expected_revision then raise exception 'offering_revision_conflict'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'offering_retirement_reason_invalid'; end if;
  update public.offering_installations set
    status = 'retired',
    revision = revision + 1,
    updated_by = p_user_id,
    updated_at = now(),
    retired_by = p_user_id,
    retired_at = now(),
    retirement_reason = btrim(p_reason)
    where id = current_row.id
    returning * into current_row;
  return next current_row;
end;
$$;

create or replace function public.guard_offering_installation_change()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if (new.id, new.business_workspace_id, new.definition_id, new.definition_version,
      new.native_resources, new.responsibility, new.accepted_scope, new.surface_ids,
      new.idempotency_key, new.command_digest, new.installed_by, new.installed_at)
    is distinct from
     (old.id, old.business_workspace_id, old.definition_id, old.definition_version,
      old.native_resources, old.responsibility, old.accepted_scope, old.surface_ids,
      old.idempotency_key, old.command_digest, old.installed_by, old.installed_at) then
    raise exception 'offering_installation_identity_immutable';
  end if;
  if old.status = 'retired' then raise exception 'offering_installation_retired'; end if;
  if new.revision <> old.revision + 1 then raise exception 'offering_revision_invalid'; end if;
  if new.status not in ('draft', 'active', 'retired') then raise exception 'offering_status_invalid'; end if;
  if old.status = 'active' and new.status = 'draft' then raise exception 'offering_status_invalid'; end if;
  return new;
end;
$$;

create trigger offering_installation_change_trg
  before update on public.offering_installations
  for each row execute function public.guard_offering_installation_change();

revoke all on function public.offering_assert_actor(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.offering_assert_install_payload(text, text, uuid, jsonb, jsonb, jsonb, text[], text[]) from public, anon, authenticated;
revoke all on function public.offering_assert_metadata(jsonb, jsonb, text[], text[]) from public, anon, authenticated;
revoke all on function public.read_offering_installations(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.install_offering(uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb, text[], text[]) from public, anon, authenticated;
revoke all on function public.prepare_staff_request_offering(uuid, uuid, text, text, text, jsonb, jsonb, text[], text[]) from public, anon, authenticated;
revoke all on function public.activate_offering(uuid, uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.update_offering_configuration(uuid, uuid, uuid, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.retire_offering(uuid, uuid, uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.install_offering(uuid, uuid, text, text, text, text, text, jsonb, jsonb, jsonb, text[], text[]) to service_role;
grant execute on function public.prepare_staff_request_offering(uuid, uuid, text, text, text, jsonb, jsonb, text[], text[]) to service_role;
grant execute on function public.activate_offering(uuid, uuid, uuid, text, bigint) to service_role;
grant execute on function public.read_offering_installations(uuid, uuid, text, uuid) to service_role;
grant execute on function public.update_offering_configuration(uuid, uuid, uuid, text, bigint, jsonb) to service_role;
grant execute on function public.retire_offering(uuid, uuid, uuid, text, bigint, text) to service_role;
