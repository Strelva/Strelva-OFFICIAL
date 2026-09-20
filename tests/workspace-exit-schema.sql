\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

insert into public.users(id, email, verified_at)
values
  ('f1000000-0000-4000-8000-000000000001', 'exit-owner@example.test', now()),
  ('f1000000-0000-4000-8000-000000000002', 'exit-member@example.test', now());
insert into public.workspaces(id, kind, name, created_by)
values ('f1000000-0000-4000-8000-000000000010', 'customer', 'Exit Harbor', 'f1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
values
  ('f1000000-0000-4000-8000-000000000010', 'f1000000-0000-4000-8000-000000000001', 'owner', 'f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000010', 'f1000000-0000-4000-8000-000000000002', 'member', 'f1000000-0000-4000-8000-000000000001');

insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values
  ('f1000000-0000-4000-8000-000000000020', 'f1000000-0000-4000-8000-000000000010', 'applications', 'application', 'Native form', '{"status":"draft","designRevision":0,"specVersion":1,"spec":{"title":"Native form","maintenanceOwner":"owner","fields":[{"id":"name","label":"Name","type":"text","required":false}],"components":[{"kind":"form","fields":["name"]}]},"records":[],"versions":[]}', 'f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000010', 'custom-applications', 'custom-application', 'Custom form',
    jsonb_build_object(
      'version', 1, 'title', 'Custom form', 'maintenanceOwner', 'f1000000-0000-4000-8000-000000000001',
      'candidate', jsonb_build_object(
        'revision', 0, 'version', 1, 'title', 'Custom form',
        'files', jsonb_build_object('build.mjs', 'local build source'),
        'sourceDigest', public.custom_application_source_digest(jsonb_build_object('build.mjs', 'local build source'))
      )
    ),
    'f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000023', 'f1000000-0000-4000-8000-000000000010', 'scheduling', 'schedule', 'Calendar', '{"reservations":[{"requestId":"confirmed-cancel","title":"Confirmed visit","start":"2026-09-20T09:00:00Z","end":"2026-09-20T10:00:00Z","status":"accepted","provider":"outlook","providerId":"event-confirmed","verification":"verified"},{"requestId":"inflight-one","title":"Inflight one","start":"2026-09-20T10:00:00Z","end":"2026-09-20T11:00:00Z","status":"writing","provider":"outlook","syncOperation":"create"},{"requestId":"inflight-two","title":"Inflight two","start":"2026-09-20T11:00:00Z","end":"2026-09-20T12:00:00Z","status":"writing","provider":"outlook","syncOperation":"create"}]}', 'f1000000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values
  ('f1000000-0000-4000-8000-000000000024', 'f1000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Budgeted tracker work', '{"status":"draft"}', 'f1000000-0000-4000-8000-000000000001');
insert into public.job_economics(
  id, workspace_id, work_id, product_id, resource_kind, payer_id,
  max_authorized_cents, status, created_by, accepted_by, accepted_at
) values (
  'f1000000-0000-4000-8000-000000000025',
  'f1000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000024',
  'tracker', 'tracker', 'f1000000-0000-4000-8000-000000000001',
  500, 'accepted', 'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001', now()
);
insert into public.application_states(work_id, workspace_id, candidate_spec, current_release_version, lifecycle_status)
values (
  'f1000000-0000-4000-8000-000000000020', 'f1000000-0000-4000-8000-000000000010',
  '{"title":"Native form","maintenanceOwner":"owner","fields":[{"id":"name","label":"Name","type":"text","required":false}],"components":[{"kind":"form","fields":["name"]}]}',
  1, 'installed'
)
on conflict (work_id) do update set current_release_version = 1, lifecycle_status = 'installed';
insert into public.custom_application_states(work_id, workspace_id, maintenance_owner, candidate_title, candidate_files, candidate_source_digest, current_release_version, lifecycle_status)
values (
  'f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000010', 'f1000000-0000-4000-8000-000000000001',
  'Custom form', '{"build.mjs":"local build source"}', public.custom_application_source_digest('{"build.mjs":"local build source"}'), 1, 'released'
)
on conflict (work_id) do update set current_release_version = 1, lifecycle_status = 'released';

-- A successor is only a review responsibility. It must not keep recipient
-- records or new publications writable after the exit decision.
insert into public.users(id, email, verified_at)
values ('f1000000-0000-4000-8000-000000000003', 'successor@example.test', now());
insert into public.workspaces(id, kind, name, created_by)
values ('f1000000-0000-4000-8000-000000000030', 'customer', 'Successor Harbor', 'f1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
values
  ('f1000000-0000-4000-8000-000000000030', 'f1000000-0000-4000-8000-000000000001', 'owner', 'f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000030', 'f1000000-0000-4000-8000-000000000003', 'member', 'f1000000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values
  ('f1000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000030', 'applications', 'application', 'Successor native form', '{"status":"draft","designRevision":0,"specVersion":1,"spec":{"title":"Successor native form","maintenanceOwner":"owner","fields":[{"id":"name","label":"Name","type":"text","required":false}],"components":[{"kind":"form","fields":["name"]}]},"records":[],"versions":[]}', 'f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000032', 'f1000000-0000-4000-8000-000000000030', 'custom-applications', 'custom-application', 'Successor custom form', jsonb_build_object('version', 1, 'title', 'Successor custom form', 'maintenanceOwner', 'f1000000-0000-4000-8000-000000000001', 'candidate', jsonb_build_object('revision', 0, 'version', 1, 'title', 'Successor custom form', 'files', jsonb_build_object('build.mjs', 'local build source'), 'sourceDigest', public.custom_application_source_digest(jsonb_build_object('build.mjs', 'local build source')))), 'f1000000-0000-4000-8000-000000000001');
update public.application_states set lifecycle_status = 'installed'
where work_id = 'f1000000-0000-4000-8000-000000000031';
update public.custom_application_states set lifecycle_status = 'released'
where work_id = 'f1000000-0000-4000-8000-000000000032';
insert into public.custom_application_artifacts(work_id, workspace_id, application_version, source_digest, artifact_digest, image, html, built_at, duration_ms, limits)
values ('f1000000-0000-4000-8000-000000000032', 'f1000000-0000-4000-8000-000000000030', 1, public.custom_application_source_digest('{"build.mjs":"local build source"}'), repeat('f', 64), 'preview', '<p>successor</p>', now(), 1, '{"network":"none"}');
insert into public.custom_application_releases(work_id, workspace_id, version, application_version, artifact_digest, published_by)
values ('f1000000-0000-4000-8000-000000000032', 'f1000000-0000-4000-8000-000000000030', 1, 1, repeat('f', 64), 'f1000000-0000-4000-8000-000000000001');

select public.save_service_request(
  'f1000000-0000-4000-8000-000000000001', 'exit-owner@example.test',
  'f1000000-0000-4000-8000-000000000010', null, null, 'requested',
  'Keep this request available for review', 'A pending provider request.', '{}',
  array['review_request']::text[], '{"kind":"strelva"}'::jsonb,
  'exit-service-request', repeat('d', 64)
);

do $$
declare result jsonb; caught text; begin
  result := public.complete_workspace_exit(
    'f1000000-0000-4000-8000-000000000010',
    'f1000000-0000-4000-8000-000000000001',
    'EXIT-OWNER@example.test', 'cancel', 'revoke', '{"kind":"stop"}', 'exit-schema-proof', repeat('c', 64)
  );
  perform pg_temp.assert_true(result#>>'{state,status}' = 'completed', 'exit state is durable');
  perform pg_temp.assert_true((select lifecycle_status from public.application_states where work_id='f1000000-0000-4000-8000-000000000020') = 'retired', 'native application is retired locally');
  perform pg_temp.assert_true((select lifecycle_status from public.custom_application_states where work_id='f1000000-0000-4000-8000-000000000021') = 'retired', 'custom application is retired locally');
  perform pg_temp.assert_true(result#>'{state,resources}' @> jsonb_build_array(jsonb_build_object('kind','native_application','id','f1000000-0000-4000-8000-000000000020','status','stopped')), 'native resource is listed in exit state');
  perform pg_temp.assert_true(result#>'{state,resources}' @> jsonb_build_array(jsonb_build_object('kind','custom_application','id','f1000000-0000-4000-8000-000000000021','status','stopped')), 'custom resource is listed in exit state');
  perform pg_temp.assert_true(result#>'{state,retainedObligations}' @> jsonb_build_array(jsonb_build_object('workId','f1000000-0000-4000-8000-000000000024','status','needs_attention','effect','none')), 'accepted budget without an execution remains visible for review');

  caught := null;
  begin
    insert into public.application_records(work_id, workspace_id, record_id, values)
      values ('f1000000-0000-4000-8000-000000000020', 'f1000000-0000-4000-8000-000000000010', 'after-exit', '{"name":"blocked"}');
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_resource_stopped%', 'native recipient writes are blocked after stop');

  caught := null;
  begin
    update public.application_states set lifecycle_status = 'installed' where work_id='f1000000-0000-4000-8000-000000000020';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_resource_stopped%', 'native publication state changes are blocked after stop');

  caught := null;
  begin
    insert into public.custom_application_artifacts(work_id, workspace_id, application_version, source_digest, artifact_digest, image, html, built_at, duration_ms, limits)
      values ('f1000000-0000-4000-8000-000000000021', 'f1000000-0000-4000-8000-000000000010', 1, repeat('a',64), repeat('b',64), 'preview', '<p>blocked</p>', now(), 1, '{"network":"none"}');
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_resource_stopped%', 'custom build artifacts are blocked after stop');

  caught := null;
  begin
    update public.saved_product_work
    set payload = jsonb_build_object('reservations', jsonb_build_array(
      jsonb_build_object('requestId', 'confirmed-cancel', 'title', 'Confirmed visit', 'start', '2026-09-20T09:00:00Z', 'end', '2026-09-20T10:00:00Z', 'status', 'accepted', 'provider', 'outlook', 'providerId', 'event-confirmed', 'verification', 'verified'),
      jsonb_build_object('requestId', 'inflight-one', 'title', 'Inflight one', 'start', '2026-09-20T10:00:00Z', 'end', '2026-09-20T11:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create'),
      jsonb_build_object('requestId', 'inflight-two', 'title', 'Inflight two', 'start', '2026-09-20T11:00:00Z', 'end', '2026-09-20T12:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create'),
      jsonb_build_object('requestId', 'after-exit', 'title', 'Visit', 'start', '2026-09-20T13:00:00Z', 'end', '2026-09-20T14:00:00Z', 'status', 'reserved')
    ))
    where id = 'f1000000-0000-4000-8000-000000000023';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_future_work_blocked%', 'new calendar reservations are blocked after exit');

  -- Existing provider work can complete its durable cancellation or readback
  -- reconciliation. The guard must inspect the changed reservation, rather
  -- than reject a payload merely because another reservation remains writing.
  caught := null;
  begin
    update public.saved_product_work
    set payload = jsonb_build_object('reservations', jsonb_build_array(
      jsonb_build_object('requestId', 'confirmed-cancel', 'title', 'Confirmed visit', 'start', '2026-09-20T09:00:00Z', 'end', '2026-09-20T10:00:00Z', 'status', 'writing', 'provider', 'outlook', 'providerId', 'event-confirmed', 'verification', 'verified', 'syncOperation', 'delete'),
      jsonb_build_object('requestId', 'inflight-one', 'title', 'Inflight one', 'start', '2026-09-20T10:00:00Z', 'end', '2026-09-20T11:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create'),
      jsonb_build_object('requestId', 'inflight-two', 'title', 'Inflight two', 'start', '2026-09-20T11:00:00Z', 'end', '2026-09-20T12:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create')
    ))
    where id = 'f1000000-0000-4000-8000-000000000023';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught is null, 'existing cancellation claim is allowed beside another in-flight reservation');

  caught := null;
  begin
    update public.saved_product_work
    set payload = jsonb_build_object('reservations', jsonb_build_array(
      jsonb_build_object('requestId', 'confirmed-cancel', 'title', 'Confirmed visit', 'start', '2026-09-20T09:00:00Z', 'end', '2026-09-20T10:00:00Z', 'status', 'cancelled', 'provider', 'outlook', 'providerId', 'event-confirmed', 'verification', 'verified'),
      jsonb_build_object('requestId', 'inflight-one', 'title', 'Inflight one', 'start', '2026-09-20T10:00:00Z', 'end', '2026-09-20T11:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create'),
      jsonb_build_object('requestId', 'inflight-two', 'title', 'Inflight two', 'start', '2026-09-20T11:00:00Z', 'end', '2026-09-20T12:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create')
    ))
    where id = 'f1000000-0000-4000-8000-000000000023';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught is null, 'existing provider cancellation can finish after exit');

  caught := null;
  begin
    update public.saved_product_work
    set payload = jsonb_build_object('reservations', jsonb_build_array(
      jsonb_build_object('requestId', 'confirmed-cancel', 'title', 'Confirmed visit', 'start', '2026-09-20T09:00:00Z', 'end', '2026-09-20T10:00:00Z', 'status', 'cancelled', 'provider', 'outlook', 'providerId', 'event-confirmed', 'verification', 'verified'),
      jsonb_build_object('requestId', 'inflight-one', 'title', 'Inflight one', 'start', '2026-09-20T10:00:00Z', 'end', '2026-09-20T11:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create'),
      jsonb_build_object('requestId', 'inflight-two', 'title', 'Inflight two', 'start', '2026-09-20T11:00:00Z', 'end', '2026-09-20T12:00:00Z', 'status', 'reserved', 'provider', 'outlook')
    ))
    where id = 'f1000000-0000-4000-8000-000000000023';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught is null, 'in-flight readback can reconcile to a reserved local state');

  caught := null;
  begin
    update public.saved_product_work
    set payload = jsonb_build_object('reservations', jsonb_build_array(
      jsonb_build_object('requestId', 'confirmed-cancel', 'title', 'Confirmed visit', 'start', '2026-09-20T09:00:00Z', 'end', '2026-09-20T10:00:00Z', 'status', 'cancelled', 'provider', 'outlook', 'providerId', 'event-confirmed', 'verification', 'verified'),
      jsonb_build_object('requestId', 'inflight-one', 'title', 'Inflight one', 'start', '2026-09-20T10:00:00Z', 'end', '2026-09-20T11:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create'),
      jsonb_build_object('requestId', 'inflight-two', 'title', 'Moved after exit', 'start', '2026-09-20T13:00:00Z', 'end', '2026-09-20T14:00:00Z', 'status', 'reserved', 'provider', 'outlook')
    ))
    where id = 'f1000000-0000-4000-8000-000000000023';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_future_work_blocked%', 'existing reservation reschedule remains blocked after exit');

  caught := null;
  begin
    update public.saved_product_work
    set payload = jsonb_build_object('reservations', jsonb_build_array(
      jsonb_build_object('requestId', 'confirmed-cancel', 'title', 'Confirmed visit', 'start', '2026-09-20T09:00:00Z', 'end', '2026-09-20T10:00:00Z', 'status', 'cancelled', 'provider', 'outlook', 'providerId', 'event-confirmed', 'verification', 'verified'),
      jsonb_build_object('requestId', 'inflight-one', 'title', 'Inflight one', 'start', '2026-09-20T10:00:00Z', 'end', '2026-09-20T11:00:00Z', 'status', 'unknown', 'provider', 'outlook', 'syncOperation', 'create'),
      jsonb_build_object('requestId', 'inflight-two', 'title', 'Inflight two', 'start', '2026-09-20T11:00:00Z', 'end', '2026-09-20T12:00:00Z', 'status', 'reserved', 'provider', 'outlook')
    ))
    where id = 'f1000000-0000-4000-8000-000000000023';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught is null, 'in-flight write can become an unresolved outcome');

  caught := null;
  begin
    update public.saved_product_work
    set payload = jsonb_build_object('reservations', jsonb_build_array(
      jsonb_build_object('requestId', 'confirmed-cancel', 'title', 'Confirmed visit', 'start', '2026-09-20T09:00:00Z', 'end', '2026-09-20T10:00:00Z', 'status', 'cancelled', 'provider', 'outlook', 'providerId', 'event-confirmed', 'verification', 'verified'),
      jsonb_build_object('requestId', 'inflight-one', 'title', 'Inflight one', 'start', '2026-09-20T10:00:00Z', 'end', '2026-09-20T11:00:00Z', 'status', 'writing', 'provider', 'outlook', 'syncOperation', 'create'),
      jsonb_build_object('requestId', 'inflight-two', 'title', 'Inflight two', 'start', '2026-09-20T11:00:00Z', 'end', '2026-09-20T12:00:00Z', 'status', 'reserved', 'provider', 'outlook')
    ))
    where id = 'f1000000-0000-4000-8000-000000000023';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_future_work_blocked%', 'unresolved provider work cannot be retried as a new write after exit');

  result := public.complete_workspace_exit(
    'f1000000-0000-4000-8000-000000000030',
    'f1000000-0000-4000-8000-000000000001',
    'EXIT-OWNER@example.test', 'pause', 'keep', '{"kind":"successor","successorUserId":"f1000000-0000-4000-8000-000000000003"}', 'exit-successor-proof', repeat('a', 64)
  );
  perform pg_temp.assert_true(result#>>'{state,maintainedResources,kind}' = 'successor', 'successor exit records review responsibility');

  caught := null;
  begin
    insert into public.application_records(work_id, workspace_id, record_id, values)
      values ('f1000000-0000-4000-8000-000000000031', 'f1000000-0000-4000-8000-000000000030', 'successor-record', '{}');
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_resource_stopped%', 'successor native recipient writes are blocked');

  caught := null;
  begin
    update public.application_states set lifecycle_status = 'installed' where work_id = 'f1000000-0000-4000-8000-000000000031';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_resource_stopped%', 'successor native publication updates are blocked');

  caught := null;
  begin
    update public.custom_application_states set lifecycle_status = 'released' where work_id = 'f1000000-0000-4000-8000-000000000032';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_resource_stopped%', 'successor custom publication updates are blocked');

  caught := null;
  begin
    insert into public.custom_application_releases(work_id, workspace_id, version, application_version, artifact_digest, published_by)
      values ('f1000000-0000-4000-8000-000000000032', 'f1000000-0000-4000-8000-000000000030', 2, 1, repeat('f', 64), 'f1000000-0000-4000-8000-000000000001');
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_resource_stopped%', 'successor custom releases are blocked');

  caught := null;
  begin
    perform public.save_service_request(
      'f1000000-0000-4000-8000-000000000001', 'exit-owner@example.test',
      'f1000000-0000-4000-8000-000000000010', null, null, 'requested',
      'New request after exit', 'This must be stopped.', '{}',
      array['review_request']::text[], '{"kind":"strelva"}'::jsonb,
      'exit-service-request-after', repeat('e', 64)
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught like '%workspace_exit_future_work_blocked%', 'new service requests are blocked after exit');
end $$;

set role service_role;
do $$
declare caught text; begin
  caught := null;
  begin
    insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
      values ('f1000000-0000-4000-8000-000000000022', 'f1000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'After exit', '{}', 'f1000000-0000-4000-8000-000000000001');
  exception when others then caught := sqlerrm; end;
  if caught is null then raise exception 'service_role admitted new saved work after exit'; end if;
  if caught not like '%workspace_exit_future_work_blocked%' then raise exception 'service_role saved-work guard returned: %', caught; end if;
end $$;
reset role;

select 'workspace exit checks passed' result;
