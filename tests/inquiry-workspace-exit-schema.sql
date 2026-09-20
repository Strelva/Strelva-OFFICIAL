\set ON_ERROR_STOP on

create function pg_temp.assert_inquiry_exit(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

select pg_temp.assert_inquiry_exit(
  has_function_privilege('service_role', 'public.read_inquiry_workspace_exit(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_inquiry_workspace_exit(uuid)', 'EXECUTE'),
  'inquiry exit mapping is server-only'
);

insert into public.tenants (id, stable_id)
values
  ('inquiry-exit-tenant', '11000000-0000-4000-8000-000000000001'),
  ('managed-only-tenant', '11000000-0000-4000-8000-000000000002');

insert into public.workspaces (id, kind, name, created_by)
values
  ('11000000-0000-4000-8000-000000000010', 'customer', 'Inquiry exit business', 'f1000000-0000-4000-8000-000000000001'),
  ('11000000-0000-4000-8000-000000000011', 'customer', 'Managed website only', 'f1000000-0000-4000-8000-000000000001');

insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
values
  ('11000000-0000-4000-8000-000000000010', 'f1000000-0000-4000-8000-000000000001', 'owner', 'f1000000-0000-4000-8000-000000000001'),
  ('11000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000001', 'owner', 'f1000000-0000-4000-8000-000000000001');

insert into public.inquiry_workspaces (id, tenant_id, business_id, state)
values (
  '11000000-0000-4000-8000-000000000030',
  'inquiry-exit-tenant',
  '11000000-0000-4000-8000-000000000010',
  '{"inquiries": []}'::jsonb
);

insert into public.offering_installations (
  id, business_workspace_id, definition_id, definition_version, status,
  configuration, native_resources, responsibility, accepted_scope, surface_ids,
  idempotency_key, command_digest, installed_by, updated_by
) values (
  '11000000-0000-4000-8000-000000000020',
  '11000000-0000-4000-8000-000000000010',
  'customer_inquiry_intake', '1.0.0', 'active', '{}',
  jsonb_build_array(jsonb_build_object('kind', 'inquiry_workspace', 'id', '11000000-0000-4000-8000-000000000030')),
  '{}', array['handle_inquiries'], array['inquiry_workspace'],
  'inquiry-exit-install', repeat('a', 64),
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001'
);

-- A managed website installation for a different business does not create an
-- inquiry mapping. The resolver must keep that distinction instead of
-- inferring inquiry ownership from any offering row.
insert into public.offering_installations (
  id, business_workspace_id, definition_id, definition_version, status,
  configuration, native_resources, responsibility, accepted_scope, surface_ids,
  idempotency_key, command_digest, installed_by, updated_by
) values (
  '11000000-0000-4000-8000-000000000021',
  '11000000-0000-4000-8000-000000000011',
  'managed_website_changes', '1.0.0', 'active', '{}',
  '[{"kind":"managed_website","id":"11000000-0000-4000-8000-000000000031"}]'::jsonb,
  '{}', array['request_changes'], array['managed_website'],
  'managed-only-install', repeat('b', 64),
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001'
);

insert into public.workspace_exit_requests (
  workspace_id, requested_by, idempotency_key, command_digest,
  future_work, provider_participation, maintained_resource_action,
  state, completed_at
) values (
  '11000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000001',
  'inquiry-exit-request', repeat('c', 64), 'cancel', 'revoke', 'stop',
  '{"status":"completed","maintainedResources":{"kind":"stopped"}}'::jsonb,
  now()
);

set role service_role;
select pg_temp.assert_inquiry_exit(
  (select count(*) = 1
     and bool_and(workspace_id = '11000000-0000-4000-8000-000000000010'::uuid
       and installation_id = '11000000-0000-4000-8000-000000000020'::uuid
       and installation_status = 'active'
       and exit_completed)
   from public.read_inquiry_workspace_exit('11000000-0000-4000-8000-000000000001'::uuid)),
  'mapped inquiry resolves to its customer workspace and sees the completed exit'
);
select pg_temp.assert_inquiry_exit(
  (select count(*) = 0
   from public.read_inquiry_workspace_exit('11000000-0000-4000-8000-000000000002'::uuid)),
  'managed website or an uninstalled inquiry does not become an inquiry mapping'
);
reset role;

select 'inquiry workspace exit checks passed' as result;
