\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.import_public_continuation(uuid,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE'),
  'service role must execute public continuation import'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.read_public_continuation_import(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_public_continuation_import(uuid,uuid,text)', 'EXECUTE'),
  'only the service role may resolve an imported continuation'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.import_public_continuation(uuid,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.import_public_continuation(uuid,uuid,text,uuid,text,jsonb,jsonb)', 'EXECUTE'),
  'browser roles must not execute public continuation import'
);
select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.public_continuation_imports'::regclass),
  'public continuation imports must use RLS'
);

insert into public.users (id, email, verified_at) values
  ('90100000-0000-4000-8000-000000000001', 'continuation@example.com', now());
insert into public.workspaces (id, kind, name, created_by) values
  ('90200000-0000-4000-8000-000000000001', 'customer', 'Continuation Business', '90100000-0000-4000-8000-000000000001'),
  ('90200000-0000-4000-8000-000000000002', 'customer', 'Other Business', '90100000-0000-4000-8000-000000000001');
insert into public.workspace_memberships (workspace_id, user_id, role, created_by) values
  ('90200000-0000-4000-8000-000000000001', '90100000-0000-4000-8000-000000000001', 'owner', '90100000-0000-4000-8000-000000000001'),
  ('90200000-0000-4000-8000-000000000002', '90100000-0000-4000-8000-000000000001', 'owner', '90100000-0000-4000-8000-000000000001');

create temporary table first_import as
select * from public.import_public_continuation(
  '90300000-0000-4000-8000-000000000001',
  '90100000-0000-4000-8000-000000000001',
  'continuation@example.com',
  '90200000-0000-4000-8000-000000000001',
  'Inquiry brief',
  '{"id":"doc-1","title":"Inquiry brief","text":"Private brief","revision":0,"history":[],"createdAt":"2026-09-18T00:00:00Z","updatedAt":"2026-09-18T00:00:00Z","createdBy":"90100000-0000-4000-8000-000000000001"}'::jsonb,
  '{"source":"public_session"}'::jsonb
);
create temporary table repeated_import as
select * from public.import_public_continuation(
  '90300000-0000-4000-8000-000000000001',
  '90100000-0000-4000-8000-000000000001',
  'continuation@example.com',
  '90200000-0000-4000-8000-000000000001',
  'Inquiry brief', '{}'::jsonb, '{}'::jsonb
);
select pg_temp.assert_true(
  (select first_import.work_id = repeated_import.work_id and not first_import.already_imported and repeated_import.already_imported from first_import cross join repeated_import),
  'an identical retry must return the original work without creating a duplicate'
);
select pg_temp.assert_true(
  (select count(*) from public.saved_product_work where workspace_id = '90200000-0000-4000-8000-000000000001') = 1,
  'a repeated continuation must create one private work item'
);

do $$
begin
  perform public.import_public_continuation(
    '90300000-0000-4000-8000-000000000001',
    '90100000-0000-4000-8000-000000000001', 'continuation@example.com',
    '90200000-0000-4000-8000-000000000002', 'Wrong destination', '{}'::jsonb, '{}'::jsonb
  );
  raise exception 'destination change unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%continuation_destination_changed%' then raise; end if;
end;
$$;

insert into public.workspace_memberships (workspace_id, user_id, role, created_by) values
  ('90200000-0000-4000-8000-000000000002', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'owner', '90100000-0000-4000-8000-000000000001');
delete from public.saved_product_work where id = (select work_id from first_import);
select pg_temp.assert_true(
  (select imported_by = '90100000-0000-4000-8000-000000000001'::uuid
    and workspace_id = '90200000-0000-4000-8000-000000000001'::uuid and work_id is null
    from public.public_continuation_imports where continuation_id = '90300000-0000-4000-8000-000000000001'),
  'destination deletion must preserve an importer tombstone'
);
do $$
begin
  perform public.read_public_continuation_import(
    '90300000-0000-4000-8000-000000000001',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'other@example.com'
  );
  raise exception 'wrong account read after destination deletion unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%continuation_unavailable%' then raise; end if;
end;
$$;
do $$
begin
  perform public.import_public_continuation(
    '90300000-0000-4000-8000-000000000001',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'other@example.com',
    '90200000-0000-4000-8000-000000000002', 'Wrong account replacement', '{}'::jsonb, '{}'::jsonb
  );
  raise exception 'wrong account reimport after destination deletion unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%continuation_unavailable%' then raise; end if;
end;
$$;

do $$
begin
  perform public.read_public_continuation_import(
    '90300000-0000-4000-8000-000000000001',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'other@example.com'
  );
  raise exception 'wrong account read unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%continuation_unavailable%' then raise; end if;
end;
$$;

delete from public.workspace_memberships
where workspace_id = '90200000-0000-4000-8000-000000000001'
  and user_id = '90100000-0000-4000-8000-000000000001';
do $$
begin
  perform public.import_public_continuation(
    '90300000-0000-4000-8000-000000000001',
    '90100000-0000-4000-8000-000000000001', 'continuation@example.com',
    '90200000-0000-4000-8000-000000000001', 'Revoked retry', '{}'::jsonb, '{}'::jsonb
  );
  raise exception 'revoked retry unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%workspace_access_denied%' then raise; end if;
end;
$$;
do $$
begin
  perform public.read_public_continuation_import(
    '90300000-0000-4000-8000-000000000001',
    '90100000-0000-4000-8000-000000000001', 'continuation@example.com'
  );
  raise exception 'revoked import read unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%workspace_access_denied%' then raise; end if;
end;
$$;

do $$
begin
  perform public.import_public_continuation(
    '90300000-0000-4000-8000-000000000002',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'other@example.com',
    '90200000-0000-4000-8000-000000000001', 'Unauthorized', '{}'::jsonb, '{}'::jsonb
  );
  raise exception 'unauthorized import unexpectedly succeeded';
exception when others then
  if sqlerrm not like '%workspace_access_denied%' then raise; end if;
end;
$$;

select 'public continuation schema checks passed' as result;
