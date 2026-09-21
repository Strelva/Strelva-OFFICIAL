\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.grant_agency_application_draft_edit(uuid,text,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.update_application_candidate(uuid,uuid,uuid,text,integer,jsonb)', 'EXECUTE'),
  'agency draft authority stays behind the service boundary'
);

do $$
declare
  owner_id uuid := 'a3020000-0000-4000-8000-000000000001';
  operator_id uuid := 'a3020000-0000-4000-8000-000000000002';
  outsider_id uuid := 'a3020000-0000-4000-8000-000000000003';
  customer_id uuid := 'a3020000-0000-4000-8000-000000000010';
  agency_id uuid := 'a3020000-0000-4000-8000-000000000011';
  app_id uuid := 'a3020000-0000-4000-8000-000000000020';
  other_app_id uuid := 'a3020000-0000-4000-8000-000000000021';
  responsibility_id uuid := 'a3020000-0000-4000-8000-000000000030';
  app_spec jsonb;
  app_payload jsonb;
  responsibility_payload jsonb;
  assignment public.operational_assignments%rowtype;
  delivery public.offering_provider_deliveries%rowtype;
  grant_row public.agency_application_draft_grants%rowtype;
  grant_again public.agency_application_draft_grants%rowtype;
  state_row public.application_states%rowtype;
  caught text;
  expiry timestamptz := clock_timestamp() + interval '7 days';
begin
  insert into public.users(id, email, verified_at) values
    (owner_id, 'agency-authoring-owner@example.test', clock_timestamp()),
    (operator_id, 'agency-authoring-operator@example.test', clock_timestamp()),
    (outsider_id, 'agency-authoring-outsider@example.test', clock_timestamp())
  on conflict (id) do update set email = excluded.email, verified_at = excluded.verified_at;

  insert into public.workspaces(id, kind, name, created_by) values
    (customer_id, 'customer', 'Authoring customer', owner_id),
    (agency_id, 'agency', 'Authoring agency', operator_id)
  on conflict (id) do nothing;
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
    (customer_id, owner_id, 'owner', owner_id),
    (agency_id, operator_id, 'member', operator_id)
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  app_spec := jsonb_build_object(
    'title', 'Customer intake',
    'maintenanceOwner', owner_id::text,
    'fields', jsonb_build_array(
      jsonb_build_object('id', 'name', 'label', 'Name', 'type', 'text', 'required', true),
      jsonb_build_object('id', 'notes', 'label', 'Notes', 'type', 'text', 'required', false)
    ),
    'components', jsonb_build_array(
      jsonb_build_object('kind', 'form', 'fields', jsonb_build_array('name', 'notes')),
      jsonb_build_object('kind', 'list', 'fields', jsonb_build_array('name', 'notes')),
      jsonb_build_object('kind', 'detail', 'fields', jsonb_build_array('name', 'notes'))
    )
  );
  app_payload := jsonb_build_object(
    'version', 1, 'revision', 0, 'title', 'Customer intake', 'createdBy', owner_id::text,
    'createdAt', clock_timestamp(), 'history', '[]'::jsonb, 'spec', app_spec,
    'specVersion', 1, 'status', 'draft', 'versions', jsonb_build_array(jsonb_build_object('version', 1, 'spec', app_spec)),
    'rehearsal', null, 'records', '[]'::jsonb
  );
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values (app_id, customer_id, 'applications', 'application', 'Customer intake', app_payload, owner_id),
      (other_app_id, customer_id, 'applications', 'application', 'Other customer app', app_payload || jsonb_build_object('title', 'Other customer app'), owner_id);
  insert into public.application_releases(work_id, workspace_id, version, spec, published_by)
    values (app_id, customer_id, 1, app_spec, owner_id), (other_app_id, customer_id, 1, app_spec, owner_id);
  update public.application_states
    set current_release_version = 1, lifecycle_status = 'installed'
    where work_id in (app_id, other_app_id);

  responsibility_payload := jsonb_build_object(
    'version', 1, 'revision', 0, 'title', 'Revise the assigned application',
    'ownerId', owner_id::text, 'approvedBy', owner_id::text, 'approvedAt', clock_timestamp(),
    'status', 'ready', 'createdAt', clock_timestamp(), 'updatedAt', clock_timestamp(),
    'steps', jsonb_build_array(jsonb_build_object(
      'id', 'revise-application', 'operation', 'application.command', 'workId', app_id::text,
      'input', jsonb_build_object('kind', 'revise'), 'dependsOn', jsonb_build_array(),
      'maximumCents', 0, 'capabilityVersion', 1, 'status', 'pending', 'attempt', 0
    )), 'history', jsonb_build_array()
  );
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values (responsibility_id, customer_id, 'operations', 'responsibility', 'Revise the assigned application', responsibility_payload, owner_id);

  insert into public.offering_installations(
    id, business_workspace_id, definition_id, definition_version, status, configuration, native_resources,
    responsibility, accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by
  ) values (
    'a3020000-0000-4000-8000-000000000040', customer_id, 'private_staff_requests', '1.0.0', 'active', '{}',
    jsonb_build_array(jsonb_build_object('kind', 'application', 'id', app_id::text)),
    jsonb_build_object('kind', 'provider_requested', 'providerKind', 'agency', 'providerName', 'Authoring agency', 'agencyWorkspaceId', agency_id::text),
    array['exact_application_draft'], array['staff_app'], 'agency-authoring-install', repeat('a', 64), owner_id, owner_id
  );

  select * into assignment from public.offer_agency_operational_assignment(
    owner_id, 'agency-authoring-owner@example.test', responsibility_id, agency_id,
    'agency-authoring-operator@example.test', 'agency', expiry, 'agency-authoring-assignment'
  );
  select * into assignment from public.accept_operational_assignment(
    operator_id, 'agency-authoring-operator@example.test', assignment.id
  );
  select * into delivery from public.request_provider_delivery(
    owner_id, 'agency-authoring-owner@example.test', customer_id,
    'a3020000-0000-4000-8000-000000000040', assignment.id,
    'agency-authoring-delivery', repeat('b', 64)
  );
  select * into delivery from public.accept_provider_delivery(
    operator_id, 'agency-authoring-operator@example.test', delivery.id
  );
  perform pg_temp.assert_true(delivery.status = 'accepted' and assignment.status = 'accepted', 'agency delivery and assignment are accepted');

  perform pg_temp.assert_true(
    not exists(select 1 from public.read_agency_application_draft_edit(operator_id, 'agency-authoring-operator@example.test', app_id)),
    'operate delivery does not imply application draft edit authority'
  );
  begin
    perform public.update_application_candidate(
      app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 0,
      app_spec || jsonb_build_object('title', 'Should be denied')
    );
    raise exception 'operator edited before explicit grant';
  exception when others then
    if position('agency_application_draft_edit_denied' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.grant_agency_application_draft_edit(
      owner_id, 'agency-authoring-owner@example.test', delivery.id, other_app_id
    );
    raise exception 'owner granted a sibling application outside the installation';
  exception when others then
    if position('agency_application_draft_edit_denied' in sqlerrm) = 0 then raise; end if;
  end;

  select * into grant_row from public.grant_agency_application_draft_edit(
    owner_id, 'agency-authoring-owner@example.test', delivery.id, app_id
  );
  perform pg_temp.assert_true(grant_row.status = 'active' and grant_row.operator_user_id = operator_id, 'customer names one active operator for the exact app');
  perform pg_temp.assert_true(
    (select count(*) from public.read_agency_application_draft_edit(operator_id, 'agency-authoring-operator@example.test', app_id)) = 1,
    'named operator can read the active draft grant'
  );
  perform pg_temp.assert_true(
    (select count(*) from public.list_agency_application_draft_work(operator_id, 'agency-authoring-operator@example.test', agency_id)
      where application_work_id = app_id and draft_grant_status = 'active') = 1,
    'named operator discovers only the assigned installed app'
  );

  update public.workspace_memberships
    set role = 'admin'
    where workspace_id = customer_id and user_id = owner_id;
  begin
    perform public.update_application_candidate(
      app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 0,
      app_spec || jsonb_build_object('title', 'Sponsor membership revoked')
    );
    raise exception 'agency draft edit survived sponsor owner revocation';
  exception when others then
    if position('agency_application_draft_edit_denied' in sqlerrm) = 0 then raise; end if;
  end;
  update public.workspace_memberships
    set role = 'owner'
    where workspace_id = customer_id and user_id = owner_id;

  select * into state_row from public.update_application_candidate(
    app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 0,
    app_spec || jsonb_build_object('title', 'Customer intake revised by agency')
  );
  perform pg_temp.assert_true(state_row.candidate_design_revision = 1 and state_row.lifecycle_status = 'draft', 'named operator saves a new native candidate revision');
  perform pg_temp.assert_true(
    exists(select 1 from public.saved_product_work where id = app_id and payload->'history' @> jsonb_build_array(jsonb_build_object('kind', 'revise_candidate', 'actorId', operator_id::text))),
    'candidate history records the named operator'
  );
  begin
    perform public.update_application_candidate(
      app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 0,
      app_spec || jsonb_build_object('title', 'Stale operator edit')
    );
    raise exception 'stale agency input overwrote the candidate';
  exception when others then
    if position('application_design_revision_conflict' in sqlerrm) = 0 then raise; end if;
  end;
  select * into state_row from public.rehearse_application_candidate(
    app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 1
  );
  perform pg_temp.assert_true(state_row.candidate_rehearsal->>'specVersion' = state_row.candidate_spec_version::text, 'named operator can rehearse the saved candidate');
  begin
    perform public.publish_application_candidate(
      app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 1, 1
    );
    raise exception 'named operator published the customer candidate';
  exception when others then
    if position('application_design_access_denied' in sqlerrm) = 0 then raise; end if;
  end;

  select * into grant_again from public.revoke_agency_application_draft_edit(
    owner_id, 'agency-authoring-owner@example.test', grant_row.id
  );
  perform pg_temp.assert_true(grant_again.status = 'revoked', 'customer can revoke draft edit authority');
  begin
    perform public.update_application_candidate(
      app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 1,
      app_spec || jsonb_build_object('title', 'Revoked operator edit')
    );
    raise exception 'revoked agency grant still edited the candidate';
  exception when others then
    if position('agency_application_draft_edit_denied' in sqlerrm) = 0 then raise; end if;
  end;

  select * into grant_again from public.grant_agency_application_draft_edit(
    owner_id, 'agency-authoring-owner@example.test', delivery.id, app_id
  );
  perform pg_temp.assert_true(grant_again.id = grant_row.id and grant_again.status = 'active', 'grant can be explicitly restored for the same assignment');
  update public.agency_application_draft_grants
    set created_at = clock_timestamp() - interval '2 seconds', expires_at = clock_timestamp() - interval '1 second'
    where id = grant_again.id;
  begin
    perform public.update_application_candidate(
      app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 1,
      app_spec || jsonb_build_object('title', 'Expired operator edit')
    );
    raise exception 'expired agency grant still edited the candidate';
  exception when others then
    if position('agency_application_draft_edit_denied' in sqlerrm) = 0 then raise; end if;
  end;
  update public.agency_application_draft_grants set created_at = grant_again.created_at, expires_at = expiry where id = grant_again.id;

  perform public.revoke_provider_delivery(
    owner_id, 'agency-authoring-owner@example.test', delivery.id, delivery.revision, 'Customer stopped agency delivery'
  );
  begin
    perform public.update_application_candidate(
      app_id, customer_id, operator_id, 'agency-authoring-operator@example.test', 1,
      app_spec || jsonb_build_object('title', 'Revoked delivery edit')
    );
    raise exception 'provider revocation left draft edit authority active';
  exception when others then
    if position('agency_application_draft_edit_denied' in sqlerrm) = 0 then raise; end if;
  end;
  perform pg_temp.assert_true(
    not exists(select 1 from public.read_agency_application_draft_edit(operator_id, 'agency-authoring-operator@example.test', app_id)),
    'delivery revocation closes the operator draft path'
  );
  perform pg_temp.assert_true(
    (select count(*) from public.workspace_memberships where workspace_id = customer_id and user_id = operator_id) = 0,
    'agency delivery does not create customer membership'
  );
end;
$$;

select 'agency application authoring checks passed' as result;
