\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.update_onboarding_work(uuid,uuid,uuid,text,integer,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.update_onboarding_work(uuid,uuid,uuid,text,integer,jsonb)', 'EXECUTE'),
  'only the trusted server role can update onboarding work'
);

insert into public.users(id, email, verified_at) values
  ('d2000000-0000-4000-8000-000000000001', 'onboarding-owner@example.com', now()),
  ('d2000000-0000-4000-8000-000000000002', 'onboarding-outsider@example.com', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('d2000000-0000-4000-8000-000000000010', 'customer', 'Onboarding business', 'd2000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('d2000000-0000-4000-8000-000000000010', 'd2000000-0000-4000-8000-000000000001', 'owner', 'd2000000-0000-4000-8000-000000000001');

insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values (
  'd2000000-0000-4000-8000-000000000020',
  'd2000000-0000-4000-8000-000000000010',
  'onboarding',
  'case',
  'Supplier onboarding',
  jsonb_build_object(
    'version', 1,
    'revision', 1,
    'title', 'Supplier onboarding',
    'subjectType', 'supplier',
    'subjectLabel', 'Acme Supplies',
    'status', 'in_progress',
    'assignee', null,
    'requirements', jsonb_build_array(jsonb_build_object(
      'id', 'd2000000-0000-4000-8000-000000000030',
      'key', 'tax_id',
      'label', 'Tax ID',
      'fields', jsonb_build_array(),
      'status', 'missing',
      'document', null,
      'proposedData', jsonb_build_object(),
      'reviewedData', null,
      'acceptedRevision', null,
      'acceptedAt', null
    )),
    'history', jsonb_build_array(jsonb_build_object(
      'revision', 1,
      'kind', 'created',
      'actorId', 'd2000000-0000-4000-8000-000000000001',
      'at', to_jsonb(now()),
      'requirementId', null,
      'before', null,
      'after', jsonb_build_object('requirementCount', 1),
      'note', null
    )),
    'createdBy', 'd2000000-0000-4000-8000-000000000001',
    'createdAt', to_jsonb(now())
  ),
  'd2000000-0000-4000-8000-000000000001'
);

select * from public.update_onboarding_work(
  'd2000000-0000-4000-8000-000000000020',
  'd2000000-0000-4000-8000-000000000010',
  'd2000000-0000-4000-8000-000000000001',
  'onboarding-owner@example.com',
  1,
  jsonb_build_object(
    'version', 1,
    'revision', 2,
    'title', 'Supplier onboarding',
    'subjectType', 'supplier',
    'subjectLabel', 'Acme Supplies',
    'status', 'in_progress',
    'assignee', jsonb_build_object('email', 'reviewer@example.com'),
    'requirements', (select payload->'requirements' from public.saved_product_work where id='d2000000-0000-4000-8000-000000000020'),
    'history', jsonb_build_array(
      (select payload->'history'->0 from public.saved_product_work where id='d2000000-0000-4000-8000-000000000020'),
      jsonb_build_object('revision', 2, 'kind', 'assigned', 'actorId', 'd2000000-0000-4000-8000-000000000001', 'at', to_jsonb(now()), 'requirementId', null, 'before', null, 'after', jsonb_build_object('email', 'reviewer@example.com'), 'note', null)
    ),
    'createdBy', 'd2000000-0000-4000-8000-000000000001',
    'createdAt', (select payload->'createdAt' from public.saved_product_work where id='d2000000-0000-4000-8000-000000000020')
  )
);

select pg_temp.assert_true(
  (select payload->>'revision' from public.saved_product_work where id='d2000000-0000-4000-8000-000000000020') = '2'
  and (select payload->'assignee'->>'email' from public.saved_product_work where id='d2000000-0000-4000-8000-000000000020') = 'reviewer@example.com',
  'onboarding assignment commits as the next case revision'
);

insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, input, created_by)
values (
  'd2000000-0000-4000-8000-000000000021',
  'd2000000-0000-4000-8000-000000000010',
  'documents',
  'document',
  'tax-id.txt',
  jsonb_build_object('version', 1, 'revision', 0, 'title', 'tax-id.txt', 'text', 'Tax ID: 12-3456789', 'createdBy', 'd2000000-0000-4000-8000-000000000001', 'createdAt', to_jsonb(now()), 'history', jsonb_build_array()),
  jsonb_build_object('source', 'onboarding_upload', 'rawBase64', 'VGF4IElEOiAxMi0zNDU2Nzg5'),
  'd2000000-0000-4000-8000-000000000001'
);

do $$
begin
  update public.saved_product_work
  set payload = jsonb_set(payload, '{text}', to_jsonb('rewritten'::text))
  where id = 'd2000000-0000-4000-8000-000000000021';
  raise exception 'onboarding attachment edit unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%onboarding_attachment_immutable%' then raise; end if;
end;
$$;

do $$
begin
  perform public.update_onboarding_work(
    'd2000000-0000-4000-8000-000000000020',
    'd2000000-0000-4000-8000-000000000010',
    'd2000000-0000-4000-8000-000000000001',
    'onboarding-owner@example.com',
    2,
    jsonb_set(
      (select payload from public.saved_product_work where id='d2000000-0000-4000-8000-000000000020'),
      '{version}',
      to_jsonb('1'::text)
    )
  );
  raise exception 'string onboarding version unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%onboarding_payload_invalid%' then raise; end if;
end;
$$;

do $$
begin
  perform public.update_onboarding_work(
    'd2000000-0000-4000-8000-000000000020',
    'd2000000-0000-4000-8000-000000000010',
    'd2000000-0000-4000-8000-000000000001',
    'onboarding-owner@example.com',
    1,
    (select payload from public.saved_product_work where id='d2000000-0000-4000-8000-000000000020')
  );
  raise exception 'stale onboarding revision unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%onboarding_revision_conflict%' then raise; end if;
end;
$$;

do $$
begin
  perform public.update_onboarding_work(
    'd2000000-0000-4000-8000-000000000020',
    'd2000000-0000-4000-8000-000000000010',
    'd2000000-0000-4000-8000-000000000002',
    'onboarding-outsider@example.com',
    2,
    (select payload from public.saved_product_work where id='d2000000-0000-4000-8000-000000000020')
  );
  raise exception 'unauthorized onboarding update unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%workspace_access_denied%' then raise; end if;
end;
$$;

select 'onboarding work schema checks passed' as result;
