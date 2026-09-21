-- Customer inquiry intake is a local installation over an existing inquiry
-- workspace. The offering remains release-gated in the application route; this
-- migration only makes the native resource and its ownership check durable.
-- Keep the provider responsibility variants introduced by the preceding
-- provider-delivery migration when replacing the install helper.

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
  agency_id uuid;
  inquiry_workspace_id uuid;
  website_binding_id uuid;
begin
  if p_definition_version is distinct from '1.0.0'
    or p_definition_id not in ('private_staff_requests', 'customer_inquiry_intake', 'managed_website_changes') then
    raise exception 'offering_definition_not_installable';
  end if;

  if p_definition_id = 'customer_inquiry_intake' then
    if p_configuration is distinct from '{}'::jsonb then
      raise exception 'offering_configuration_invalid';
    end if;
    if jsonb_typeof(p_native_resources) is distinct from 'array'
      or jsonb_array_length(p_native_resources) <> 1
      or p_native_resources->0->>'kind' <> 'inquiry_workspace'
      or (p_native_resources->0) - array['kind', 'id']::text[] <> '{}'::jsonb then
      raise exception 'offering_native_resources_invalid';
    end if;
    begin
      inquiry_workspace_id := (p_native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1
      from public.inquiry_workspaces inquiry
      where inquiry.id = inquiry_workspace_id
        and inquiry.business_id = p_business_id::text
      for share;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;

    if p_accepted_scope is null
      or not (p_accepted_scope @> array['handle_inquiries']::text[])
      or not (p_accepted_scope <@ array['handle_inquiries']::text[])
      or cardinality(p_accepted_scope) <> 1 then
      raise exception 'offering_scope_invalid';
    end if;
    if p_surface_ids is null
      or not (p_surface_ids @> array['inquiry_workspace']::text[])
      or not (p_surface_ids <@ array['inquiry_workspace']::text[])
      or cardinality(p_surface_ids) <> 1 then
      raise exception 'offering_surfaces_invalid';
    end if;
  elsif p_definition_id = 'managed_website_changes' then
    perform public.offering_assert_metadata(
      p_configuration,
      p_responsibility,
      array['submit_requests', 'review_requests'],
      array['staff_app', 'business_workspace']
    );
    if p_configuration is distinct from '{}'::jsonb
      or p_accepted_scope is distinct from array['request_changes']::text[]
      or p_surface_ids is distinct from array['managed_website']::text[]
      or jsonb_typeof(p_native_resources) is distinct from 'array'
      or jsonb_array_length(p_native_resources) <> 1
      or p_native_resources->0->>'kind' <> 'managed_website'
      or (p_native_resources->0) - array['kind', 'id']::text[] <> '{}'::jsonb then
      raise exception 'offering_native_resources_invalid';
    end if;
    begin
      website_binding_id := (p_native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1
      from public.offering_website_bindings binding
      join public.tenants tenant
        on tenant.stable_id = binding.tenant_stable_id and tenant.active is true
      where binding.id = website_binding_id
        and binding.business_workspace_id = p_business_id
        and binding.status = 'active'
      for share of binding, tenant;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
  else
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
    begin
      application_id := (p_native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
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
  end if;

  if jsonb_typeof(p_responsibility) is distinct from 'object' then raise exception 'offering_responsibility_invalid'; end if;
  if p_responsibility->>'kind' = 'customer_operated' then
    if p_responsibility - array['kind', 'providerName']::text[] <> '{}'::jsonb
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120 then
      raise exception 'offering_responsibility_invalid';
    end if;
  elsif p_responsibility->>'kind' = 'provider_requested' then
    if jsonb_typeof(p_responsibility->'providerKind') is distinct from 'string'
      or p_responsibility->>'providerKind' not in ('strelva', 'agency', 'named_third_party')
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120
      or (p_responsibility ? 'requestNote' and (
        jsonb_typeof(p_responsibility->'requestNote') is distinct from 'string'
        or char_length(btrim(p_responsibility->>'requestNote')) not between 1 and 500
      )) then
      raise exception 'offering_responsibility_invalid';
    end if;
    if p_responsibility->>'providerKind' = 'agency' then
      begin
        agency_id := (p_responsibility->>'agencyWorkspaceId')::uuid;
      exception when invalid_text_representation then
        raise exception 'offering_responsibility_invalid';
      end;
      if p_responsibility - array['kind', 'providerKind', 'providerName', 'agencyWorkspaceId', 'requestNote']::text[] <> '{}'::jsonb
        or agency_id = p_business_id
        or not exists (select 1 from public.workspaces where id = agency_id and kind = 'agency') then
        raise exception 'offering_responsibility_invalid';
      end if;
    elsif p_responsibility - array['kind', 'providerKind', 'providerName', 'requestNote']::text[] <> '{}'::jsonb
      or p_responsibility ? 'agencyWorkspaceId' then
      raise exception 'offering_responsibility_invalid';
    end if;
  else
    raise exception 'offering_responsibility_invalid';
  end if;
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
  inquiry_workspace_id uuid;
  website_binding_id uuid;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  select * into current_row from public.offering_installations
    where id = p_installation_id and business_workspace_id = p_business_id for update;
  if not found then raise exception 'offering_installation_not_found'; end if;
  if current_row.status <> 'draft' then raise exception 'offering_activation_status_invalid'; end if;
  if p_expected_revision is null or p_expected_revision <= 0
    or current_row.revision <> p_expected_revision then raise exception 'offering_revision_conflict'; end if;

  if current_row.definition_id = 'customer_inquiry_intake' then
    if jsonb_typeof(current_row.native_resources) is distinct from 'array'
      or jsonb_array_length(current_row.native_resources) <> 1
      or current_row.native_resources->0->>'kind' <> 'inquiry_workspace' then
      raise exception 'offering_native_resources_invalid';
    end if;
    begin
      inquiry_workspace_id := (current_row.native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1 from public.inquiry_workspaces
      where id = inquiry_workspace_id and business_id = p_business_id::text
      for share;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
  elsif current_row.definition_id = 'managed_website_changes' then
    if jsonb_typeof(current_row.native_resources) is distinct from 'array'
      or jsonb_array_length(current_row.native_resources) <> 1
      or current_row.native_resources->0->>'kind' <> 'managed_website' then
      raise exception 'offering_native_resources_invalid';
    end if;
    begin
      website_binding_id := (current_row.native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1
      from public.offering_website_bindings binding
      join public.tenants tenant
        on tenant.stable_id = binding.tenant_stable_id and tenant.active is true
      where binding.id = website_binding_id
        and binding.business_workspace_id = p_business_id
        and binding.status = 'active'
      for share of binding, tenant;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
  else
    application_id := (current_row.native_resources->0->>'id')::uuid;
    perform 1 from public.saved_product_work work
      join public.application_states app on app.work_id = work.id and app.workspace_id = work.workspace_id
      where work.id = application_id and work.workspace_id = p_business_id
        and work.product_id = 'applications' and work.resource_kind = 'application'
        and app.lifecycle_status = 'installed' and app.current_release_version is not null
      for share of work, app;
    if not found then raise exception 'offering_native_release_required'; end if;
  end if;

  update public.offering_installations set status = 'active', revision = revision + 1,
    updated_by = p_user_id, updated_at = clock_timestamp()
    where id = current_row.id returning * into current_row;
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
  application_id uuid;
  inquiry_workspace_id uuid;
  website_binding_id uuid;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  select * into current_row from public.offering_installations
    where id = p_installation_id and business_workspace_id = p_business_id for update;
  if not found then raise exception 'offering_installation_not_found'; end if;
  if current_row.status not in ('draft', 'active') then raise exception 'offering_installation_retired'; end if;
  if p_expected_revision is null or p_expected_revision <= 0
    or current_row.revision <> p_expected_revision then raise exception 'offering_revision_conflict'; end if;

  if current_row.definition_id = 'customer_inquiry_intake' then
    if p_configuration is distinct from '{}'::jsonb then raise exception 'offering_configuration_invalid'; end if;
    begin
      inquiry_workspace_id := (current_row.native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1 from public.inquiry_workspaces
      where id = inquiry_workspace_id and business_id = p_business_id::text
      for share;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
  elsif current_row.definition_id = 'managed_website_changes' then
    if p_configuration is distinct from '{}'::jsonb
      or jsonb_typeof(current_row.native_resources) is distinct from 'array'
      or jsonb_array_length(current_row.native_resources) <> 1
      or current_row.native_resources->0->>'kind' <> 'managed_website' then
      raise exception 'offering_native_resources_invalid';
    end if;
    begin
      website_binding_id := (current_row.native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1
      from public.offering_website_bindings binding
      join public.tenants tenant
        on tenant.stable_id = binding.tenant_stable_id and tenant.active is true
      where binding.id = website_binding_id
        and binding.business_workspace_id = p_business_id
        and binding.status = 'active'
      for share of binding, tenant;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
  else
    perform public.offering_assert_metadata(
      p_configuration, current_row.responsibility, current_row.accepted_scope, current_row.surface_ids
    );
    application_id := (current_row.native_resources->0->>'id')::uuid;
    perform 1 from public.saved_product_work
      where id = application_id and workspace_id = p_business_id
        and product_id = 'applications' and resource_kind = 'application'
      for share;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
  end if;

  update public.offering_installations set
    configuration = p_configuration,
    revision = revision + 1,
    updated_by = p_user_id,
    updated_at = now()
    where id = current_row.id returning * into current_row;
  return next current_row;
end;
$$;

revoke all on function public.offering_assert_install_payload(text, text, uuid, jsonb, jsonb, jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.offering_assert_install_payload(text, text, uuid, jsonb, jsonb, jsonb, text[], text[]) to service_role;
revoke all on function public.activate_offering(uuid, uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.activate_offering(uuid, uuid, uuid, text, bigint) to service_role;
revoke all on function public.update_offering_configuration(uuid, uuid, uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.update_offering_configuration(uuid, uuid, uuid, text, bigint, jsonb) to service_role;
