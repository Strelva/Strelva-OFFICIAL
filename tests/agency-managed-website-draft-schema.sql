\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.grant_agency_managed_website_draft_edit(uuid,text,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.execute_agency_managed_website_draft(uuid,text,uuid,uuid,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.execute_agency_managed_website_draft(uuid,text,uuid,uuid,text)', 'EXECUTE'),
  'website draft authority stays behind the actor-bearing service boundary'
);
select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid='public.agency_managed_website_draft_grants'::regclass)
    and (select relrowsecurity from pg_class where oid='public.agency_managed_website_draft_revisions'::regclass)
    and (select relrowsecurity from pg_class where oid='public.agency_managed_website_draft_preparations'::regclass),
  'website draft grants, preparations, and revisions keep RLS enabled'
);

create table if not exists public.content (
  tenant_id text not null,
  section text not null,
  data jsonb not null default '{}'::jsonb,
  primary key (tenant_id, section)
);
create table if not exists public.draft_content (
  tenant_id text not null,
  section text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, section)
);

DO $$
declare
  owner_id uuid := 'a3021200-0000-4000-8000-000000000001';
  operator_id uuid := 'a3021200-0000-4000-8000-000000000002';
  outsider_id uuid := 'a3021200-0000-4000-8000-000000000003';
  customer_id uuid := 'a3021200-0000-4000-8000-000000000010';
  agency_id uuid := 'a3021200-0000-4000-8000-000000000011';
  binding_id uuid := 'a3021200-0000-4000-8000-000000000020';
  installation_value uuid := 'a3021200-0000-4000-8000-000000000021';
  responsibility_id uuid := 'a3021200-0000-4000-8000-000000000030';
  request_id uuid := 'a3021200-0000-4000-8000-000000000031';
  delivery_value uuid;
  assignment public.operational_assignments%rowtype;
  delivery public.offering_provider_deliveries%rowtype;
  grant_row public.agency_managed_website_draft_grants%rowtype;
  prep_row public.agency_managed_website_draft_preparations%rowtype;
  revision_row record;
  state_row record;
  responsibility_payload jsonb;
  draft_data jsonb := jsonb_build_object(
    'headline', 'A prepared website draft',
    'subheadline', 'Ready for customer review',
    'tagline', 'Prepared by the named agency operator',
    'ctaText', 'Learn more',
    'ctaLink', '/about',
    'backgroundImageUrl', ''
  );
  expiry timestamptz := clock_timestamp() + interval '7 days';
  caught text;
begin
  insert into public.users(id, email, verified_at) values
    (owner_id, 'website-draft-owner@example.test', clock_timestamp()),
    (operator_id, 'website-draft-operator@example.test', clock_timestamp()),
    (outsider_id, 'website-draft-outsider@example.test', clock_timestamp())
  on conflict (id) do update set email=excluded.email, verified_at=excluded.verified_at;
  insert into public.workspaces(id, kind, name, created_by) values
    (customer_id, 'customer', 'Website draft customer', owner_id),
    (agency_id, 'agency', 'Website draft agency', operator_id)
  on conflict (id) do nothing;
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
    (customer_id, owner_id, 'owner', owner_id),
    (agency_id, operator_id, 'member', operator_id)
  on conflict (workspace_id, user_id) do update set role=excluded.role;
  insert into public.tenants(id, stable_id, site_name, active, subscription_status) values
    ('website-draft-a', binding_id, 'Website draft customer', true, 'active')
  on conflict (id) do update set stable_id=excluded.stable_id, site_name=excluded.site_name, active=true, subscription_status='active';
  insert into public.memberships(user_id, tenant_id, role, tenant_stable_id)
    values (owner_id, 'website-draft-a', 'owner', binding_id)
    on conflict (user_id, tenant_id) do update set role='owner', tenant_stable_id=binding_id;
  insert into public.offering_website_bindings(
    id, business_workspace_id, tenant_stable_id, tenant_id_at_binding, site_name_at_binding,
    idempotency_key, command_digest, created_by, updated_by
  ) values (
    binding_id, customer_id, binding_id, 'website-draft-a', 'Website draft customer',
    'website-draft-binding', repeat('a', 64), owner_id, owner_id
  ) on conflict (id, business_workspace_id) do nothing;

  responsibility_payload := jsonb_build_object(
    'version', 1, 'revision', 0, 'title', 'Prepare the managed website draft',
    'intent', 'Save one customer-reviewed website revision',
    'ownerId', owner_id::text, 'approvedBy', owner_id::text, 'approvedAt', clock_timestamp(),
    'status', 'ready', 'createdAt', clock_timestamp(), 'updatedAt', clock_timestamp(),
    'history', '[]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object(
      'id', 'website-draft', 'operation', 'website.draft', 'workId', binding_id::text,
      'input', jsonb_build_object('kind', 'draft', 'bindingId', binding_id::text, 'section', 'hero'),
      'dependsOn', '[]'::jsonb, 'maximumCents', 0, 'capabilityVersion', 1,
      'status', 'pending', 'attempt', 0
    ))
  );
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values (responsibility_id, customer_id, 'operations', 'responsibility', 'Prepare the managed website draft', responsibility_payload, owner_id);
  insert into public.offering_installations(
    id, business_workspace_id, definition_id, definition_version, status, configuration, native_resources,
    responsibility, accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by
  ) values (
    installation_value, customer_id, 'managed_website_changes', '1.0.0', 'active', '{}',
    jsonb_build_array(jsonb_build_object('kind', 'managed_website', 'id', binding_id::text)),
    jsonb_build_object('kind', 'provider_requested', 'providerKind', 'agency', 'providerName', 'Website draft agency', 'agencyWorkspaceId', agency_id::text),
    array['request_changes'], array['managed_website'], 'website-draft-installation', repeat('b', 64), owner_id, owner_id
  );
  insert into public.service_requests(
    id, business_workspace_id, status, request_text, outcome, context, scope, provider_kind,
    provider_agency_workspace_id, provider_acceptance, accepted_by, accepted_at, created_by
  ) values (
    request_id, customer_id, 'requested', 'Prepare one website draft', 'A draft is ready for review', '{}',
    array['request_changes'], 'agency', agency_id, 'accepted', operator_id, clock_timestamp(), owner_id
  );

  select * into assignment from public.offer_agency_operational_assignment(
    owner_id, 'website-draft-owner@example.test', responsibility_id, agency_id,
    'website-draft-operator@example.test', 'agency', expiry, 'website-draft-assignment'
  );
  select * into assignment from public.accept_operational_assignment(operator_id, 'website-draft-operator@example.test', assignment.id);
  select * into delivery from public.request_provider_delivery(
    owner_id, 'website-draft-owner@example.test', customer_id, installation_value,
    assignment.id, 'website-draft-delivery', repeat('c', 64)
  );
  select * into delivery from public.accept_provider_delivery(operator_id, 'website-draft-operator@example.test', delivery.id);
  delivery_value := delivery.id;
  perform pg_temp.assert_true(delivery.status='accepted' and assignment.status='accepted', 'website delivery and assignment are accepted');
  perform pg_temp.assert_true((select installation_id is null and delivery_id is null from public.service_requests where id=request_id), 'customer confirmation has not linked the accepted delivery yet');

  perform pg_temp.assert_true(
    (select count(*) from public.read_agency_managed_website_draft_edit(operator_id, 'website-draft-operator@example.test', binding_id)) = 0,
    'accepted delivery does not imply website draft editing'
  );
  select * into grant_row from public.grant_agency_managed_website_draft_edit(
    owner_id, 'website-draft-owner@example.test', delivery_value, binding_id
  );
  perform pg_temp.assert_true(grant_row.status='active' and grant_row.operator_user_id=operator_id, 'customer names the exact website operator');
  perform pg_temp.assert_true(
    (select count(*) from public.read_agency_managed_website_draft_edit(operator_id, 'website-draft-operator@example.test', binding_id)) = 1,
    'named operator reads the active website grant'
  );
  perform pg_temp.assert_true(
    (select count(*) from public.list_agency_managed_website_draft_work(operator_id, 'website-draft-operator@example.test', agency_id)
      where managed_website_binding_id=binding_id and draft_grant_status='active') = 1,
    'named operator discovers only the assigned website'
  );
  select * into state_row from public.read_agency_managed_website_draft_state(operator_id, 'website-draft-operator@example.test', binding_id, 'hero');
  perform pg_temp.assert_true(state_row.revision=0 and state_row.data_hash=md5('{}'), 'operator reads the current native draft state');
  caught := null;
  begin
    perform public.prepare_agency_managed_website_draft(operator_id, 'website-draft-operator@example.test', assignment.id, binding_id, 'services', draft_data, 0, md5('{}'));
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='agency_managed_website_draft_denied', 'operator cannot select a section outside accepted scope');
  select * into prep_row from public.prepare_agency_managed_website_draft(
    operator_id, 'website-draft-operator@example.test', assignment.id, binding_id, 'hero', draft_data, 0, md5('{}')
  );
  perform pg_temp.assert_true(prep_row.status='pending' and prep_row.assignment_id=assignment.id, 'operator preparation is tied to the exact assignment');
  select * into revision_row from public.execute_agency_managed_website_draft(
    operator_id, 'website-draft-operator@example.test', responsibility_id, binding_id, 'hero'
  );
  perform pg_temp.assert_true(revision_row.revision=1 and revision_row.preparation_id=prep_row.id and revision_row.assignment_id=assignment.id, 'execution returns the exact native revision receipt');
  perform pg_temp.assert_true(
    (select data from public.draft_content where tenant_id='website-draft-a' and section='hero') = draft_data,
    'execution writes the native draft content row'
  );
  perform pg_temp.assert_true(
    (select count(*) from public.agency_managed_website_draft_revisions where managed_website_binding_id=binding_id and operator_user_id=operator_id and revision=1)=1,
    'website draft history records the named operator'
  );
  perform pg_temp.assert_true(
    (select count(*) from public.workspace_memberships where workspace_id=customer_id and user_id=operator_id) = 0,
    'website draft authority does not create customer membership'
  );

  -- A preparation cannot overwrite a customer change between prepare and run.
  select * into state_row from public.read_agency_managed_website_draft_state(operator_id, 'website-draft-operator@example.test', binding_id, 'hero');
  select * into prep_row from public.prepare_agency_managed_website_draft(
    operator_id, 'website-draft-operator@example.test', assignment.id, binding_id, 'hero', draft_data, state_row.revision, state_row.data_hash
  );
  update public.draft_content set data=jsonb_build_object('headline','Customer changed this'), updated_at=clock_timestamp()
    where tenant_id='website-draft-a' and section='hero';
  caught := null;
  begin
    perform public.execute_agency_managed_website_draft(operator_id, 'website-draft-operator@example.test', responsibility_id, binding_id, 'hero');
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='agency_managed_website_draft_revision_conflict', 'stale agency input is rejected');

  -- Native subscription and sponsor authority are checked at the write.
  update public.draft_content set data=draft_data where tenant_id='website-draft-a' and section='hero';
  update public.tenants set subscription_status='canceled' where id='website-draft-a';
  caught := null;
  begin
    perform public.prepare_agency_managed_website_draft(operator_id, 'website-draft-operator@example.test', assignment.id, binding_id, 'hero', draft_data, 1, md5(draft_data::text));
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='agency_managed_website_draft_denied', 'inactive subscription closes preparation');
  update public.tenants set subscription_status='active' where id='website-draft-a';

  select * into grant_row from public.revoke_agency_managed_website_draft_edit(owner_id, 'website-draft-owner@example.test', grant_row.id);
  perform pg_temp.assert_true(grant_row.status='revoked', 'customer can revoke website draft authority');
  caught := null;
  begin
    perform public.prepare_agency_managed_website_draft(operator_id, 'website-draft-operator@example.test', assignment.id, binding_id, 'hero', draft_data, 1, md5(draft_data::text));
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='agency_managed_website_draft_denied', 'revoked website authority cannot prepare');

  -- Regranting still cannot bypass an expired assignment or delivery.
  select * into grant_row from public.grant_agency_managed_website_draft_edit(owner_id, 'website-draft-owner@example.test', delivery_value, binding_id);
  update public.operational_assignments set offered_at=clock_timestamp()-interval '2 seconds', expires_at=clock_timestamp()-interval '1 second' where id=assignment.id;
  caught := null;
  begin
    perform public.prepare_agency_managed_website_draft(operator_id, 'website-draft-operator@example.test', assignment.id, binding_id, 'hero', draft_data, 1, md5(draft_data::text));
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='agency_managed_website_draft_denied', 'expired assignment closes preparation');
  perform pg_temp.assert_true(
    (select count(*) from public.workspace_memberships where workspace_id=customer_id and user_id=outsider_id) = 0,
    'outsider remains outside customer workspace'
  );
  raise notice 'agency managed website draft checks passed';
end;
$$;

select 'agency managed website draft checks passed' as result;
