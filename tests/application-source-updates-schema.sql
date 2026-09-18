\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.adopt_application_source_update(uuid,uuid,uuid,text,integer,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.adopt_application_source_update(uuid,uuid,uuid,text,integer,uuid,integer)', 'EXECUTE'),
  'source adoption is available only through the trusted server boundary'
);

-- A product id alone cannot turn another saved resource into a native app.
do $$
declare
  v_work_id uuid := '93000000-0000-4000-8000-000000000020';
  v_workspace_id uuid := '91000000-0000-4000-8000-000000000010';
  v_owner_id uuid := '91000000-0000-4000-8000-000000000001';
  spec jsonb := jsonb_build_object(
    'title', 'Wrong resource kind',
    'maintenanceOwner', v_owner_id::text,
    'fields', jsonb_build_array(jsonb_build_object('id','problem','label','Problem','type','text','required',true)),
    'components', jsonb_build_array(jsonb_build_object('kind','form','fields',jsonb_build_array('problem'))));
  caught text;
begin
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
  values (v_work_id, v_workspace_id, 'applications', 'document', 'Wrong resource kind', jsonb_build_object(
    'version', 1, 'revision', 0, 'title', 'Wrong resource kind', 'spec', spec, 'specVersion', 1,
    'status', 'draft', 'versions', jsonb_build_array(jsonb_build_object('version', 1, 'spec', spec)),
    'rehearsal', null, 'records', '[]'::jsonb, 'history', '[]'::jsonb), v_owner_id);
  perform pg_temp.assert_true(
    not exists (select 1 from public.application_states as state where state.work_id = v_work_id),
    'wrong resource kind does not initialize native application state'
  );
  caught := null;
  begin perform public.application_lock_work(v_workspace_id, v_work_id); exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught = 'application_access_denied', 'wrong resource kind cannot acquire app lock');
  caught := null;
  begin perform public.application_assert_identity(v_workspace_id, v_work_id, v_owner_id, 'release-owner@example.com', true); exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught = 'application_access_denied', 'wrong resource kind cannot pass app identity');
end;
$$;

-- Immutable release history has an explicit bounded failure. The trigger
-- prevents a 101st release from leaving a row that the bounded read schema
-- cannot represent.
do $$
declare
  v_work_id uuid := '93000000-0000-4000-8000-000000000021';
  v_workspace_id uuid := '91000000-0000-4000-8000-000000000010';
  v_owner_id uuid := '91000000-0000-4000-8000-000000000001';
  spec jsonb := jsonb_build_object(
    'title', 'Release history limit',
    'maintenanceOwner', v_owner_id::text,
    'fields', jsonb_build_array(jsonb_build_object('id','problem','label','Problem','type','text','required',true)),
    'components', jsonb_build_array(jsonb_build_object('kind','form','fields',jsonb_build_array('problem'))));
  caught text;
  v_version integer;
begin
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
  values (v_work_id, v_workspace_id, 'applications', 'application', 'Release history limit', jsonb_build_object(
    'version', 1, 'revision', 0, 'title', 'Release history limit', 'spec', spec, 'specVersion', 1,
    'status', 'draft', 'versions', jsonb_build_array(jsonb_build_object('version', 1, 'spec', spec)),
    'rehearsal', null, 'records', '[]'::jsonb, 'history', '[]'::jsonb), v_owner_id);
  for v_version in 1..100 loop
    insert into public.application_releases(work_id, workspace_id, version, spec, published_by, published_at)
    values (v_work_id, v_workspace_id, v_version, spec, v_owner_id, null);
  end loop;
  caught := null;
  begin
    insert into public.application_releases(work_id, workspace_id, version, spec, published_by, published_at)
    values (v_work_id, v_workspace_id, 101, spec, v_owner_id, null);
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'application_release_history_limit_reached', 'release history limit fails before insert');
  perform pg_temp.assert_true(
    (select count(*) from public.application_releases as release_row where release_row.work_id = v_work_id) = 100,
    'release history retains every allowed version'
  );
end;
$$;

select 'application source update checks passed' as result;
