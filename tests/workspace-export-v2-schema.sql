\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

insert into public.users(id, email, verified_at)
values ('c1000000-0000-4000-8000-000000000001', 'export-v2-owner@example.test', now());
insert into public.workspaces(id, kind, name, created_by)
values ('c1000000-0000-4000-8000-000000000010', 'customer', 'Export V2 Harbor', 'c1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
values ('c1000000-0000-4000-8000-000000000010', 'c1000000-0000-4000-8000-000000000001', 'owner', 'c1000000-0000-4000-8000-000000000001');

insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values (
  'c1000000-0000-4000-8000-000000000020',
  'c1000000-0000-4000-8000-000000000010',
  'onboarding', 'case', 'Supplier packet',
  jsonb_build_object(
    'version', 1, 'revision', 1, 'title', 'Supplier packet',
    'subjectType', 'supplier', 'subjectLabel', 'Northwind Supplies', 'status', 'in_progress',
    'assignee', null,
    'requirements', jsonb_build_array(jsonb_build_object(
      'id', 'c1000000-0000-4000-8000-000000000030', 'key', 'tax_id', 'label', 'Tax ID',
      'fields', jsonb_build_array(), 'status', 'supplied',
      'document', jsonb_build_object(
        'workId', 'c1000000-0000-4000-8000-000000000021', 'revision', 0,
        'title', 'tax-id.txt', 'source', 'upload',
        'provenance', jsonb_build_object(
          'source', 'upload', 'storageBoundary', 'saved_product_work',
          'storageKey', 'onboarding-upload:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'originalName', 'tax-id.txt', 'contentType', 'text/plain', 'size', 19,
          'sha256', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'uploadedAt', '2026-09-20T12:00:00.000Z'
        ),
        'extraction', jsonb_build_object('status', 'available', 'provider', 'local-text', 'message', 'Text was parsed locally.', 'truncated', false)
      ),
      'proposedData', jsonb_build_object(), 'reviewedData', null, 'acceptedRevision', null,
      'acceptedAt', null, 'stale', false
    )),
    'history', jsonb_build_array(), 'createdBy', 'c1000000-0000-4000-8000-000000000001',
    'createdAt', '2026-09-20T12:00:00.000Z'
  ),
  'c1000000-0000-4000-8000-000000000001'
);
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, input, created_by)
values (
  'c1000000-0000-4000-8000-000000000021',
  'c1000000-0000-4000-8000-000000000010',
  'documents', 'document', 'tax-id.txt',
  jsonb_build_object('version', 1, 'revision', 0, 'title', 'tax-id.txt', 'text', 'Tax ID: 12-3456789', 'createdBy', 'c1000000-0000-4000-8000-000000000001', 'createdAt', '2026-09-20T12:00:00.000Z', 'history', jsonb_build_array()),
  jsonb_build_object(
    'version', 1, 'source', 'onboarding_upload',
    'caseId', 'c1000000-0000-4000-8000-000000000020',
    'requirementId', 'c1000000-0000-4000-8000-000000000030',
    'provenance', jsonb_build_object(
      'source', 'upload', 'storageBoundary', 'saved_product_work',
      'storageKey', 'onboarding-upload:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'originalName', 'tax-id.txt', 'contentType', 'text/plain', 'size', 19,
      'sha256', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'uploadedAt', '2026-09-20T12:00:00.000Z'
    ),
    'extraction', jsonb_build_object('status', 'available', 'provider', 'local-text', 'message', 'Text was parsed locally.', 'truncated', false),
    'rawBase64', 'VGF4IElEOiAxMi0zNDU2Nzg5'
  ),
  'c1000000-0000-4000-8000-000000000001'
);
insert into public.workspace_exit_requests(
  id, workspace_id, requested_by, idempotency_key, command_digest,
  future_work, provider_participation, maintained_resource_action, state, completed_at
) values (
  'c1000000-0000-4000-8000-000000000040',
  'c1000000-0000-4000-8000-000000000010',
  'c1000000-0000-4000-8000-000000000001', 'export-v2-exit', repeat('b', 64),
  'pause', 'keep', 'stop',
  jsonb_build_object(
    'id', 'c1000000-0000-4000-8000-000000000040', 'workspaceId', 'c1000000-0000-4000-8000-000000000010',
    'status', 'completed', 'requestedAt', '2026-09-20T12:01:00.000Z', 'completedAt', '2026-09-20T12:01:00.000Z',
    'requestedBy', 'c1000000-0000-4000-8000-000000000001', 'futureWork', 'paused', 'providerParticipation', 'kept',
    'maintainedResources', jsonb_build_object('kind', 'stopped'),
    'summary', jsonb_build_object('standingPaused', 0, 'standingRevoked', 0, 'scheduledPaused', 0, 'scheduledCancelled', 0, 'assignmentsRevoked', 0, 'providerDeliveriesRevoked', 0, 'investigationsPaused', 0, 'retainedAccepted', 0, 'retainedUnknown', 0),
    'retainedObligations', jsonb_build_array(),
    'resources', jsonb_build_array(jsonb_build_object('kind', 'custom_application', 'id', 'c1000000-0000-4000-8000-000000000021', 'status', 'stopped'))
  ),
  now()
);

do $$
declare exported jsonb; attachment jsonb; begin
  exported := public.export_workspace_snapshot(
    'c1000000-0000-4000-8000-000000000010',
    'c1000000-0000-4000-8000-000000000001',
    'EXPORT-V2-OWNER@example.test'
  );
  perform pg_temp.assert_true(exported->>'schemaVersion' = '2', 'export uses schema version 2');
  perform pg_temp.assert_true(jsonb_array_length(exported#>'{onboarding,cases}') = 1, 'onboarding case is portable');
  perform pg_temp.assert_true(jsonb_array_length(exported#>'{onboarding,attachments}') = 1, 'onboarding attachment reference is portable');
  select value into attachment from jsonb_array_elements(exported#>'{onboarding,attachments}');
  perform pg_temp.assert_true(attachment->>'downloadReference' = '/api/onboarding/file?workId=c1000000-0000-4000-8000-000000000021', 'attachment has an authenticated download reference');
  perform pg_temp.assert_true(attachment#>>'{extraction,provider}' = 'local-text', 'extraction evidence is preserved');
  perform pg_temp.assert_true(exported::text not like '%rawBase64%' and exported::text not like '%VGF4IElEOiAxMi0zNDU2Nzg5%', 'uploaded bytes never enter the export');
  perform pg_temp.assert_true(exported#>>'{lifecycle,exit,status}' = 'completed', 'exit state is portable');
  perform pg_temp.assert_true(exported#>'{manifest,unavailable}' @> jsonb_build_array(
    jsonb_build_object('category','custom_application_artifacts_and_releases'),
    jsonb_build_object('category','calendar_connections_and_event_receipts'),
    jsonb_build_object('category','inquiry_records_and_followups'),
    jsonb_build_object('category','offering_installations_and_provider_delivery')
  ), 'excluded custom, calendar, inquiry, and offering records are disclosed');
  perform pg_temp.assert_true((select schema_version from public.workspace_export_receipts where id = (exported->>'exportId')::uuid) = 2, 'receipt records schema version 2');
end $$;

select 'workspace export v2 checks passed' result;
