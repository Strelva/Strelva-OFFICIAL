\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.execute_work_plan_output(uuid,uuid,uuid,text,integer,text,text,text,text,text,text,text,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'browser roles must not execute plan outputs directly'
);

do $$
declare
  workspace_key uuid := '66666666-6666-4666-8666-666666666666';
  plan_id uuid := '77777777-7777-4777-8777-777777777777';
  created record;
  replayed record;
  native_count integer;
begin
  insert into public.workspaces (id, kind, name, created_by)
  values (workspace_key, 'agency', 'Plan output workspace', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
  values (workspace_key, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  insert into public.saved_product_work (
    id, workspace_id, product_id, resource_kind, title, payload, created_by
  ) values (
    plan_id,
    workspace_key,
    'work_plans',
    'plan',
    'Plan',
    jsonb_build_object(
      'version', 1,
      'status', 'ready',
      'proposedOutputs', jsonb_build_array(jsonb_build_object(
        'id', 'private-doc',
        'nativeOperationIds', jsonb_build_array('create_document')
      )),
      'metadata', jsonb_build_object('workspaceId', workspace_key, 'revision', 1)
    ),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

  select * into created from public.execute_work_plan_output(
    plan_id, workspace_key, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com',
    1, 'private-doc', 'create_document', 'work-plan-output-test', repeat('a', 64),
    'documents', 'document', 'Procedure',
    '{"version":1,"revision":0,"title":"Procedure","text":"First","createdBy":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createdAt":"2026-09-11T12:00:00Z","history":[]}'::jsonb,
    '{"title":"Procedure","text":"First"}'::jsonb,
    '[]'::jsonb
  );
  perform pg_temp.assert_true(created.status = 'completed', 'first output must complete');
  perform pg_temp.assert_true(not created.replayed, 'first output must not be replayed');
  perform pg_temp.assert_true(created.native_work_id is not null, 'first output must create native work');
  perform pg_temp.assert_true(
    (select source_work_id from public.saved_product_work where id = created.native_work_id) = plan_id,
    'native work must retain plan provenance'
  );

  select * into replayed from public.execute_work_plan_output(
    plan_id, workspace_key, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com',
    1, 'private-doc', 'create_document', 'work-plan-output-test', repeat('a', 64),
    'documents', 'document', 'Procedure',
    '{"version":1,"revision":0,"title":"Procedure","text":"A retry may rebuild this payload","createdBy":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createdAt":"2026-09-11T12:00:01Z","history":[]}'::jsonb,
    '{"title":"Procedure","text":"A retry may rebuild this payload"}'::jsonb,
    '[]'::jsonb
  );
  perform pg_temp.assert_true(replayed.replayed, 'same output must return a durable replay');
  perform pg_temp.assert_true(replayed.native_work_id = created.native_work_id, 'replay must return the original native work');

  select count(*) into native_count from public.saved_product_work
  where saved_product_work.workspace_id = workspace_key and product_id = 'documents';
  perform pg_temp.assert_true(native_count = 1, 'replay must not create another native document');

  begin
    perform public.execute_work_plan_output(
      plan_id, workspace_key, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'other@example.com',
      1, 'private-doc', 'create_document', 'other-key', repeat('b', 64),
      'documents', 'document', 'Other',
      '{"version":1,"revision":0,"title":"Other","text":"No","createdBy":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","createdAt":"2026-09-11T12:00:00Z","history":[]}'::jsonb,
      '{"title":"Other","text":"No"}'::jsonb,
      '[]'::jsonb
    );
    raise exception 'foreign actor accepted';
  exception when others then
    if sqlerrm <> 'workspace_access_denied' then raise; end if;
  end;
end;
$$;

do $$
declare
  workspace_key uuid := '66666666-6666-4666-8666-666666666666';
  source_id uuid := '9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a';
  plan_id uuid := '9b9b9b9b-9b9b-49b9-89b9-9b9b9b9b9b9b';
  attempted record;
begin
  insert into public.saved_product_work (
    id, workspace_id, product_id, resource_kind, title, payload, updated_at, created_by
  ) values (
    source_id, workspace_key, 'documents', 'document', 'Source',
    '{"version":1,"revision":0,"title":"Source","text":"Current","createdBy":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createdAt":"2026-09-11T12:00:00Z","history":[]}'::jsonb,
    '2026-09-11T12:00:00Z', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  insert into public.saved_product_work (
    id, workspace_id, product_id, resource_kind, title, payload, created_by
  ) values (
    plan_id, workspace_key, 'work_plans', 'plan', 'Context plan',
    jsonb_build_object(
      'version', 1,
      'status', 'ready',
      'proposedOutputs', jsonb_build_array(
        jsonb_build_object('id', 'source-doc', 'nativeOperationIds', jsonb_build_array('create_document')),
        jsonb_build_object('id', 'source-doc-2', 'nativeOperationIds', jsonb_build_array('create_document'))
      ),
      'context', jsonb_build_object('version', 1, 'sources', jsonb_build_array(jsonb_build_object(
        'workId', source_id, 'productId', 'documents', 'resourceKind', 'document', 'kind', 'document',
        'title', 'Source', 'version', 1, 'revision', 0, 'updatedAt', '2026-09-11T12:00:00Z'
      ))),
      'metadata', jsonb_build_object('workspaceId', workspace_key, 'revision', 1)
    ),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  perform public.execute_work_plan_output(
    plan_id, workspace_key, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com',
    1, 'source-doc', 'create_document', 'context-output-1', repeat('c', 64),
    'documents', 'document', 'Prepared',
    '{"version":1,"revision":0,"title":"Prepared","text":"First","createdBy":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createdAt":"2026-09-11T12:00:00Z","history":[]}'::jsonb,
    '{"title":"Prepared","text":"First"}'::jsonb,
    '[{"workId":"9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a","productId":"documents","resourceKind":"document","kind":"document","title":"Source","version":1,"revision":0,"updatedAt":"2026-09-11T12:00:00Z"}]'::jsonb
  );
  update public.saved_product_work set updated_at = '2026-09-11T12:01:00Z' where id = source_id;
  begin
    select * into attempted from public.execute_work_plan_output(
      plan_id, workspace_key, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com',
      1, 'source-doc-2', 'create_document', 'context-output-2', repeat('d', 64),
      'documents', 'document', 'Prepared again',
      '{"version":1,"revision":0,"title":"Prepared again","text":"Second","createdBy":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","createdAt":"2026-09-11T12:00:00Z","history":[]}'::jsonb,
      '{"title":"Prepared again","text":"Second"}'::jsonb,
      '[{"workId":"9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a","productId":"documents","resourceKind":"document","kind":"document","title":"Source","version":1,"revision":0,"updatedAt":"2026-09-11T12:00:00Z"}]'::jsonb
    );
    raise exception 'stale source accepted';
  exception when others then
    if sqlerrm <> 'work_plan_revision_conflict' then raise; end if;
  end;
end;
$$;
