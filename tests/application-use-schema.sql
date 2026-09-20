\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

-- The focused surface is callable only through the service-role boundary.
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.read_application_use(uuid,text,uuid)', 'EXECUTE'),
  'authenticated cannot read application use'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.grant_application_use(uuid,text,uuid,text,text[],text,boolean,text,timestamptz)', 'EXECUTE'),
  'authenticated cannot grant application use'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.list_application_use_grants(uuid,text,uuid)', 'EXECUTE'),
  'authenticated cannot list application grants'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.submit_application_use_record(uuid,text,uuid,uuid,integer,jsonb,text)', 'EXECUTE'),
  'authenticated cannot submit application use'
);
select pg_temp.assert_true(
  not has_function_privilege('service_role', 'public.submit_application_record_internal(uuid,integer,integer,text,jsonb,uuid)', 'EXECUTE'),
  'service role cannot bypass the native append wrapper'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.application_use_grants', 'INSERT'),
  'service role cannot insert grants directly'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.application_use_grants', 'UPDATE'),
  'service role cannot update grants directly'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.application_use_submissions', 'INSERT'),
  'service role cannot insert submission receipts directly'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.application_use_submissions', 'UPDATE'),
  'service role cannot update submission receipts directly'
);

do $$
declare
  owner_id uuid := '92000000-0000-4000-8000-000000000001';
  staff_id uuid := '92000000-0000-4000-8000-000000000002';
  outsider_id uuid := '92000000-0000-4000-8000-000000000003';
  target_workspace_id uuid := '92000000-0000-4000-8000-000000000010';
  target_work_id uuid := '92000000-0000-4000-8000-000000000020';
  app_spec jsonb;
  incomplete_spec jsonb;
  draft_payload jsonb;
  grant_row public.application_use_grants%rowtype;
  old_grant public.application_use_grants%rowtype;
  replacement_grant public.application_use_grants%rowtype;
  all_grant public.application_use_grants%rowtype;
  use_row record;
  count_before integer;
begin
  insert into public.users(id, email, verified_at) values
    (owner_id, 'application-owner@example.test', clock_timestamp()),
    (staff_id, 'application-staff@example.test', clock_timestamp()),
    (outsider_id, 'application-outsider@example.test', null)
  on conflict (id) do update set email = excluded.email, verified_at = excluded.verified_at;

  insert into public.workspaces(id, kind, name, created_by)
    values (target_workspace_id, 'personal', 'Repair desk', owner_id)
    on conflict (id) do nothing;
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values (target_workspace_id, owner_id, 'owner', owner_id)
    on conflict (workspace_id, user_id) do nothing;

  app_spec := jsonb_build_object(
    'title', 'Repair requests',
    'maintenanceOwner', owner_id::text,
    'fields', jsonb_build_array(
      jsonb_build_object('id', 'problem', 'label', 'Problem', 'type', 'text', 'required', true),
      jsonb_build_object('id', 'priority', 'label', 'Priority', 'type', 'select', 'required', false, 'options', jsonb_build_array('standard', 'urgent')),
      jsonb_build_object('id', 'internal_note', 'label', 'Internal note', 'type', 'text', 'required', false)
    ),
    'components', jsonb_build_array(
      jsonb_build_object('kind', 'form', 'fields', jsonb_build_array('problem', 'priority')),
      jsonb_build_object('kind', 'list', 'fields', jsonb_build_array('problem', 'priority')),
      jsonb_build_object('kind', 'detail', 'fields', jsonb_build_array('problem', 'priority', 'internal_note'))
    )
  );
  draft_payload := jsonb_build_object('version', 1, 'revision', 0, 'title', 'Repair requests',
    'createdBy', owner_id::text, 'createdAt', clock_timestamp(), 'history', '[]'::jsonb,
    'spec', app_spec, 'specVersion', 1, 'status', 'draft', 'versions', jsonb_build_array(
      jsonb_build_object('version', 1, 'spec', app_spec)
    ), 'rehearsal', null, 'records', '[]'::jsonb);
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values (target_work_id, target_workspace_id, 'applications', 'application', 'Repair requests', draft_payload, owner_id);

  insert into public.application_releases(work_id, workspace_id, version, spec, published_by)
    values (target_work_id, target_workspace_id, 1, app_spec, owner_id);
  update public.application_states
    set current_release_version = 1, lifecycle_status = 'installed'
    where application_states.work_id = target_work_id;
  insert into public.application_records(work_id, workspace_id, record_id, values, created_by)
    values
      (target_work_id, target_workspace_id, 'staff-1', '{"problem":"Loose hinge","internal_note":"staff private"}', staff_id),
      (target_work_id, target_workspace_id, 'owner-1', '{"problem":"Broken latch","internal_note":"owner private"}', owner_id);

  begin
    perform public.grant_application_use(
      staff_id, 'application-staff@example.test', target_work_id,
      'application-owner@example.test', array['form']::text[], 'none', false,
      'Should fail without workspace membership', clock_timestamp() + interval '1 day'
    );
    raise exception 'nonmember issued a grant';
  exception when others then
    if position('workspace_access_denied' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.grant_application_use(
      owner_id, 'application-owner@example.test', target_work_id,
      'application-outsider@example.test', array['form']::text[], 'none', false,
      'Unverified recipient must fail', clock_timestamp() + interval '1 day'
    );
    raise exception 'unverified recipient received a grant';
  exception when others then
    if position('application_use_recipient_unverified' in sqlerrm) = 0 then raise; end if;
  end;

  select * into grant_row
  from public.grant_application_use(
    owner_id, 'application-owner@example.test', target_work_id,
    'application-staff@example.test', array['form', 'list']::text[], 'own', true,
    'Submit repair requests', clock_timestamp() + interval '1 day'
  );
  perform pg_temp.assert_true(grant_row.status = 'active' and grant_row.record_submit, 'owner issued active submit grant');
  -- An expired link can be replaced while the work lock is held. The old
  -- grant is closed before the new active row is inserted.
  update public.application_use_grants
    set expires_at = clock_timestamp() - interval '1 minute'
    where id = grant_row.id;
  select * into replacement_grant
  from public.grant_application_use(
    owner_id, 'application-owner@example.test', target_work_id,
    'application-staff@example.test', array['form', 'list']::text[], 'own', true,
    'Replacement repair access', clock_timestamp() + interval '1 day'
  );
  select * into old_grant
  from public.application_use_grants as expired
  where expired.id = grant_row.id;
  perform pg_temp.assert_true(old_grant.status = 'revoked' and replacement_grant.status = 'active', 'expired grant can be replaced');
  grant_row := replacement_grant;
  select count(*) into count_before
  from public.list_application_use_grants(owner_id, 'application-owner@example.test', target_work_id);
  perform pg_temp.assert_true(count_before = 2, 'owner can reopen the application and list its grants');

  select * into all_grant
  from public.grant_application_use(
    owner_id, 'application-owner@example.test', target_work_id,
    'application-owner@example.test', array['list']::text[], 'all', false,
    'Review every repair request', clock_timestamp() + interval '1 day'
  );
  select * into use_row
  from public.read_application_use(owner_id, 'application-owner@example.test', target_work_id);
  perform pg_temp.assert_true(all_grant.record_read_scope = 'all' and jsonb_array_length(use_row.records) = 2, 'all scope returns every canonical record');

  select * into use_row
  from public.read_application_use(staff_id, 'application-staff@example.test', target_work_id);
  perform pg_temp.assert_true(use_row.release_version = 1, 'staff sees the active release');
  perform pg_temp.assert_true(jsonb_array_length(use_row.records) = 1, 'own scope hides another person record');
  perform pg_temp.assert_true(use_row.records->0->>'id' = 'staff-1', 'own scope uses canonical created_by');
  perform pg_temp.assert_true(use_row.records->0 ? 'createdBy', 'created_by stays internal until TypeScript projection');
  perform pg_temp.assert_true(not (use_row.records->0->'values' ? 'internal_note'), 'records hide fields outside granted views');

  -- A form grant cannot write fields that exist in the native spec but are not
  -- listed by its released form component.
  begin
    perform public.submit_application_use_record(
      staff_id, 'application-staff@example.test', target_work_id, grant_row.id, 1,
      '{"id":"hidden","values":{"internal_note":"forged"}}', 'hidden-field'
    );
    raise exception 'hidden form field accepted';
  exception when others then
    if position('application_use_denied' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.submit_application_use_record(
      staff_id, 'application-staff@example.test', target_work_id, grant_row.id, 1,
      ('{"id":"forged","values":{"problem":"x"},"createdBy":"' || owner_id::text || '"}')::jsonb, 'forged-owner'
    );
    raise exception 'caller ownership metadata accepted';
  exception when others then
    if position('application_use_invalid' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.submit_application_use_record(
      staff_id, 'application-staff@example.test', target_work_id, grant_row.id, 1,
      '{"id":"invalid-priority","values":{"problem":"x","priority":"vip"}}', 'invalid-priority'
    );
    raise exception 'invalid select option accepted';
  exception when others then
    if position('application_record_invalid' in sqlerrm) = 0 then raise; end if;
  end;

  select * into use_row
  from public.submit_application_use_record(
    staff_id, 'application-staff@example.test', target_work_id, grant_row.id, 1,
    '{"id":"staff-2","values":{"problem":"Broken gate","priority":"urgent"}}', 'staff-2'
  );
  perform pg_temp.assert_true(use_row.release_version = 1, 'staff submit returns release one');
  select count(*) into count_before from public.application_records where application_records.work_id = target_work_id;
  perform pg_temp.assert_true(count_before = 3, 'native submit appended one canonical record');

  -- Replaying the accepted key is safe and does not append a second record.
  select * into use_row
  from public.submit_application_use_record(
    staff_id, 'application-staff@example.test', target_work_id, grant_row.id, 1,
    '{"id":"staff-2","values":{"problem":"Broken gate","priority":"urgent"}}', 'staff-2'
  );
  select count(*) into count_before from public.application_records where application_records.work_id = target_work_id;
  perform pg_temp.assert_true(count_before = 3 and use_row.release_version = 1, 'idempotent replay does not duplicate');

  -- Current-release changes do not strand a successful retry. The receipt is
  -- checked before the new-write version check, then the current projection is
  -- returned.
  insert into public.application_releases(work_id, workspace_id, version, spec, published_by)
    values (target_work_id, target_workspace_id, 2, app_spec, owner_id);
  update public.application_states set current_release_version = 2 where application_states.work_id = target_work_id;
  select * into use_row
  from public.submit_application_use_record(
    staff_id, 'application-staff@example.test', target_work_id, grant_row.id, 1,
    '{"id":"staff-2","values":{"problem":"Broken gate","priority":"urgent"}}', 'staff-2'
  );
  perform pg_temp.assert_true(use_row.release_version = 2 and jsonb_array_length(use_row.records) = 2, 'replay returns current permitted projection');
  begin
    perform public.submit_application_use_record(
      staff_id, 'application-staff@example.test', target_work_id, grant_row.id, 1,
      '{"id":"staff-3","values":{"problem":"stale"}}', 'new-stale-version'
    );
    raise exception 'new write accepted against stale release';
  exception when others then
    if position('release_version_conflict' in sqlerrm) = 0 then raise; end if;
  end;

  -- A submit grant is rejected when a required native field is not present in
  -- the only released form. This prevents issuing a link for a form that can
  -- never produce a valid native record.
  incomplete_spec := jsonb_set(app_spec, '{fields,2,required}', 'true'::jsonb);
  insert into public.application_releases(work_id, workspace_id, version, spec, published_by)
    values (target_work_id, target_workspace_id, 3, incomplete_spec, owner_id);
  update public.application_states set current_release_version = 3 where application_states.work_id = target_work_id;
  begin
    perform public.grant_application_use(
      owner_id, 'application-owner@example.test', target_work_id,
      'application-owner@example.test', array['form']::text[], 'own', true,
      'Incomplete form must fail', clock_timestamp() + interval '1 day'
    );
    raise exception 'incomplete submit form received a grant';
  exception when others then
    if position('application_use_invalid' in sqlerrm) = 0 then raise; end if;
  end;
  update public.application_states set current_release_version = 2 where application_states.work_id = target_work_id;
  delete from public.application_releases where work_id = target_work_id and version = 3;

  -- Revocation is serialized with submit and closes both read and write paths.
  perform public.revoke_application_use(owner_id, 'application-owner@example.test', target_work_id, grant_row.id);
  begin
    perform public.read_application_use(staff_id, 'application-staff@example.test', target_work_id);
    raise exception 'revoked staff read accepted';
  exception when others then
    if position('application_use_denied' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    perform public.submit_application_use_record(
      staff_id, 'application-staff@example.test', target_work_id, grant_row.id, 2,
      '{"id":"after-revoke","values":{"problem":"denied"}}', 'after-revoke'
    );
    raise exception 'revoked staff submit accepted';
  exception when others then
    if position('application_use_denied' in sqlerrm) = 0 then raise; end if;
  end;
  perform public.revoke_application_use(owner_id, 'application-owner@example.test', target_work_id, all_grant.id);
end;
$$;

select 'application use checks passed' as result;
