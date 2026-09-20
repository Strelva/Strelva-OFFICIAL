\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.read_application_use_v2(uuid,text,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.grant_application_use_with_edit(uuid,text,uuid,text,text[],text,text,boolean,text,timestamptz)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.submit_application_use_record_v2(uuid,text,uuid,uuid,integer,jsonb,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.edit_application_use_record(uuid,text,uuid,uuid,integer,integer,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.edit_application_use_record(uuid,text,uuid,uuid,integer,integer,jsonb,text)', 'EXECUTE'),
  'edit-aware application RPCs stay behind the service boundary'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.application_records', 'UPDATE')
  and not has_table_privilege('service_role', 'public.application_use_edits', 'INSERT'),
  'record and edit receipt tables cannot be written directly'
);
select pg_temp.assert_true(
  public.application_is_valid_date_only('2024-02-29')
  and not public.application_is_valid_date_only('2026-02-29')
  and not public.application_is_valid_date_only('2026-02-30')
  and not public.application_is_valid_date_only('0100-02-29')
  and public.application_is_valid_date_only('0400-02-29'),
  'SQL date validation follows the Gregorian calendar without timezone conversion'
);

do $application_edit_checks$
<<application_edit_checks>>
declare
  owner_id uuid := '94000000-0000-4000-8000-000000000001';
  staff_id uuid := '94000000-0000-4000-8000-000000000002';
  all_id uuid := '94000000-0000-4000-8000-000000000003';
  workspace_id uuid := '94000000-0000-4000-8000-000000000010';
  work_id uuid := '94000000-0000-4000-8000-000000000020';
  spec_v1 jsonb;
  spec_v2 jsonb;
  grant_row public.application_use_grants%rowtype;
  all_grant public.application_use_grants%rowtype;
  use_row record;
  snapshot jsonb;
  caught text;
  history_count integer;
begin
  insert into public.users(id, email, verified_at) values
    (owner_id, 'application-edit-owner@example.test', clock_timestamp()),
    (staff_id, 'application-edit-staff@example.test', clock_timestamp()),
    (all_id, 'application-edit-all@example.test', clock_timestamp())
  on conflict (id) do update set email = excluded.email, verified_at = excluded.verified_at;
  insert into public.workspaces(id, kind, name, created_by)
    values (workspace_id, 'personal', 'Appointment desk', owner_id)
    on conflict (id) do nothing;
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values (workspace_id, owner_id, 'owner', owner_id);

  spec_v1 := jsonb_build_object(
    'title', 'Appointment requests',
    'maintenanceOwner', owner_id::text,
    'fields', jsonb_build_array(
      jsonb_build_object('id', 'visit_date', 'label', 'Visit date', 'type', 'date', 'required', true),
      jsonb_build_object('id', 'problem', 'label', 'Problem', 'type', 'text', 'required', true),
      jsonb_build_object('id', 'notes', 'label', 'Office notes', 'type', 'text', 'required', false),
      jsonb_build_object('id', 'details', 'label', 'Details', 'type', 'text', 'required', false)
    ),
    'components', jsonb_build_array(
      jsonb_build_object('kind', 'form', 'fields', jsonb_build_array('visit_date', 'problem', 'details')),
      jsonb_build_object('kind', 'list', 'fields', jsonb_build_array('visit_date', 'problem', 'notes'))
    )
  );
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values (work_id, workspace_id, 'applications', 'application', 'Appointment requests', jsonb_build_object(
      'version', 1, 'revision', 0, 'title', 'Appointment requests', 'spec', spec_v1,
      'specVersion', 1, 'status', 'draft', 'versions', jsonb_build_array(jsonb_build_object('version', 1, 'spec', spec_v1)),
      'rehearsal', null, 'records', '[]'::jsonb, 'history', '[]'::jsonb
    ), owner_id)
  on conflict (id) do nothing;

  perform public.rehearse_application_candidate(work_id, workspace_id, owner_id, 'application-edit-owner@example.test', 0);
  perform public.publish_application_candidate(work_id, workspace_id, owner_id, 'application-edit-owner@example.test', 0, 0);
  insert into public.application_records(work_id, workspace_id, record_id, values, created_by)
    values
      (work_id, workspace_id, 'staff-appointment', '{"visit_date":"2026-02-28","problem":"Loose hinge","notes":"Keep the office annotation","details":"Clear this optional field"}'::jsonb, staff_id),
      (work_id, workspace_id, 'owner-appointment', '{"visit_date":"2024-02-29","problem":"Broken latch"}'::jsonb, owner_id);
  update public.application_states set records_revision = 2 where application_states.work_id = application_edit_checks.work_id;

  select * into grant_row from public.grant_application_use_with_edit(
    owner_id, 'application-edit-owner@example.test', work_id,
    'application-edit-staff@example.test', array['form', 'list']::text[], 'own', 'own', true,
    'Correct appointment requests', clock_timestamp() + interval '1 day'
  );
  select * into use_row from public.read_application_use_v2(staff_id, 'application-edit-staff@example.test', work_id);
  perform pg_temp.assert_true(use_row.record_edit_scope = 'own', 'own edit scope is returned to the recipient');
  perform pg_temp.assert_true(jsonb_array_length(use_row.records) = 1 and (use_row.records->0->>'revision') = '1', 'recipient receives the owned record revision');

  caught := null;
  begin
    perform public.submit_application_use_record(
      staff_id, 'application-edit-staff@example.test', work_id, grant_row.id, 1,
      '{"id":"bad-date","values":{"visit_date":"2026-02-30","problem":"Invalid date"}}'::jsonb, 'bad-date'
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'application_record_invalid', 'recipient writes reject rollover calendar dates');

  select * into use_row from public.edit_application_use_record(
    staff_id, 'application-edit-staff@example.test', work_id, grant_row.id, 1, 1,
    '{"id":"staff-appointment","values":{"visit_date":"2026-02-28","problem":"Loose hinge corrected"}}'::jsonb, 'staff-edit-1'
  );
  perform pg_temp.assert_true((select record_row.values->>'notes' from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment') = 'Keep the office annotation', 'recipient edits preserve values outside the form');
  perform pg_temp.assert_true((select not (record_row.values ? 'details') from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment'), 'omitted optional form fields can be cleared');
  perform pg_temp.assert_true((select record_row.record_revision from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment') = 2, 'edit increments the record revision');
  select jsonb_array_length(record_row.edit_history) into history_count from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment';
  perform pg_temp.assert_true(history_count = 1, 'edit appends one history entry');
  perform pg_temp.assert_true((select record_row.edit_history->0->'previousValues'->>'problem' from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment') = 'Loose hinge', 'history retains the previous values');

  perform public.edit_application_use_record(
    staff_id, 'application-edit-staff@example.test', work_id, grant_row.id, 1, 1,
    '{"id":"staff-appointment","values":{"visit_date":"2026-02-28","problem":"Loose hinge corrected"}}'::jsonb, 'staff-edit-1'
  );
  select jsonb_array_length(record_row.edit_history) into history_count from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment';
  perform pg_temp.assert_true((select record_row.record_revision from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment') = 2 and history_count = 1, 'same edit key replays without duplicating the correction');

  caught := null;
  begin
    perform public.edit_application_use_record(
      staff_id, 'application-edit-staff@example.test', work_id, grant_row.id, 1, 1,
      '{"id":"staff-appointment","values":{"visit_date":"2026-02-28","problem":"Stale correction"}}'::jsonb, 'staff-edit-stale'
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'application_record_revision_conflict', 'stale edits fail on the record revision');
  perform pg_temp.assert_true((select record_row.values->>'problem' from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment') = 'Loose hinge corrected', 'stale edits leave the accepted correction intact');

  caught := null;
  begin
    perform public.edit_application_use_record(
      staff_id, 'application-edit-staff@example.test', work_id, grant_row.id, 1, 1,
      '{"id":"owner-appointment","values":{"visit_date":"2024-02-29","problem":"Foreign correction"}}'::jsonb, 'foreign-edit'
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'application_use_denied', 'own scope cannot edit another recipient record');

  caught := null;
  begin
    perform public.edit_application_use_record(
      staff_id, 'application-edit-staff@example.test', work_id, grant_row.id, 1, 2,
      '{"id":"staff-appointment","values":{"visit_date":"2026-02-28","problem":"Not permitted","notes":"Overwrite office annotation"}}'::jsonb, 'outside-form-edit'
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'application_use_denied', 'recipient cannot write values outside the form');
  perform pg_temp.assert_true((select record_row.values->>'notes' from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment') = 'Keep the office annotation', 'denied edit preserves non-form values');
  perform pg_temp.assert_true((select record_row.edit_history->0->'values'->>'notes' from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment') = 'Keep the office annotation', 'history records the complete corrected record');

  select * into all_grant from public.grant_application_use_with_edit(
    owner_id, 'application-edit-owner@example.test', work_id,
    'application-edit-all@example.test', array['form', 'list']::text[], 'all', 'all', false,
    'Review and correct every appointment', clock_timestamp() + interval '1 day'
  );
  perform public.edit_application_use_record(
    all_id, 'application-edit-all@example.test', work_id, all_grant.id, 1, 2,
    '{"id":"staff-appointment","values":{"visit_date":"2026-02-28","problem":"Owner-wide correction"}}'::jsonb, 'all-edit-1'
  );
  perform pg_temp.assert_true((select record_row.values->>'problem' from public.application_records as record_row where record_row.work_id = application_edit_checks.work_id and record_row.record_id = 'staff-appointment') = 'Owner-wide correction', 'all scope can edit a foreign record');

  perform public.revoke_application_use(owner_id, 'application-edit-owner@example.test', work_id, grant_row.id);
  caught := null;
  begin
    perform public.edit_application_use_record(
      staff_id, 'application-edit-staff@example.test', work_id, grant_row.id, 1, 3,
      '{"id":"staff-appointment","values":{"visit_date":"2026-02-28","problem":"Revoked correction"}}'::jsonb, 'revoked-edit'
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'application_use_denied', 'revocation closes the edit boundary');

  -- Publishing and rolling back a release keeps the date as a calendar string.
  spec_v2 := jsonb_set(spec_v1, '{title}', '"Appointment requests v2"'::jsonb);
  perform public.update_application_candidate(work_id, workspace_id, owner_id, 'application-edit-owner@example.test', 0, spec_v2);
  perform public.rehearse_application_candidate(work_id, workspace_id, owner_id, 'application-edit-owner@example.test', 1);
  perform public.publish_application_candidate(work_id, workspace_id, owner_id, 'application-edit-owner@example.test', 1, 1);
  snapshot := public.application_runtime_snapshot(work_id);
  perform pg_temp.assert_true(snapshot->>'release_version' = '2' and exists (
    select 1 from jsonb_array_elements(snapshot->'records') as item(value)
    where item.value->>'id' = 'staff-appointment' and item.value->'values'->>'visit_date' = '2026-02-28'
  ), 'published date field remains date-only');
  perform public.rollback_application_release(work_id, workspace_id, owner_id, 'application-edit-owner@example.test', 1, 2, 1);
  snapshot := public.application_runtime_snapshot(work_id);
  perform pg_temp.assert_true(snapshot->>'release_version' = '1' and exists (
    select 1 from jsonb_array_elements(snapshot->'records') as item(value)
    where item.value->>'id' = 'staff-appointment' and item.value->'values'->>'visit_date' = '2026-02-28'
  ), 'rollback keeps the released calendar date and record');
end;
$application_edit_checks$;

select 'application record edit and date checks passed' as result;
