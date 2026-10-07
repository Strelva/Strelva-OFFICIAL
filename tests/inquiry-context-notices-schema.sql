\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.ic_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry context assertion failed: %', message; end if; end; $$;
select pg_temp.ic_assert(not has_function_privilege('anon', 'public.read_inquiry_business_context(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.list_inquiry_owner_notices_not_told(text[])', 'execute')
  and has_function_privilege('service_role', 'public.read_inquiry_business_context(text)', 'execute'), 'internal read privileges');
insert into public.users(id, email, verified_at) values ('c1000000-0000-4000-8000-000000000001', 'context-operator@example.test', now());
insert into public.super_admins(user_id, email) values ('c1000000-0000-4000-8000-000000000001', 'context-operator@example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('context-site', 'c1000000-0000-4000-8000-000000000002', 'Context Fixture', true),
  ('context-other', 'c1000000-0000-4000-8000-000000000003', 'Other Fixture', true);
create temporary table ic_ws(id uuid) on commit drop;
insert into ic_ws select (public.convert_tenant_to_business('context-operator@example.test', 'context-site',
  '{"tenantId":"context-site","tenantStableId":"c1000000-0000-4000-8000-000000000002","workspaceName":"Context Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'c1000000-0000-4000-8000-000000000004', repeat('c',64))->>'workspaceId')::uuid;
insert into public.business_record_facts(workspace_id, fact_key, value, source, verified, updated_by)
  select id, 'hours', '{"timezone":"America/New_York","weekly":[{"day":6,"opens":"09:00","closes":"17:00"}]}',
    'operator', true, 'c1000000-0000-4000-8000-000000000001' from ic_ws;
insert into public.business_people(id, workspace_id, name, email, active, source, verified, created_by, updated_by)
  select 'c1000000-0000-4000-8000-000000000005', id, 'Maria', 'maria@example.test', true, 'operator', true,
    'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001' from ic_ws;
select pg_temp.ic_assert(public.read_inquiry_business_context('context-other') is null, 'unconverted site gets no other business facts');
select pg_temp.ic_assert(public.read_inquiry_business_context('context-site')->'facts'->'hours'->>'verified' = 'true'
  and jsonb_array_length(public.read_inquiry_business_context('context-site')->'people') = 1, 'current business facts and people');
update public.business_people set active = false where id = 'c1000000-0000-4000-8000-000000000005';
select pg_temp.ic_assert(public.read_inquiry_business_context('context-site')->'people'->0->>'active' = 'false', 'staff deactivation is read at use');
insert into public.inquiry_events(tenant_stable_id, workspace_id, lead_id, kind, actor, detail, at)
  select 'c1000000-0000-4000-8000-000000000002', id, 'lead_owner_notice', 'delivery', 'system',
    '{"ownerNotice":true,"status":"failed","reason":"email_suppressed_or_unconfigured"}', '2026-10-10T12:00:00Z' from ic_ws;
select pg_temp.ic_assert(jsonb_array_length(public.list_inquiry_owner_notices_not_told(array['context-site'])) = 1
  and public.list_inquiry_owner_notices_not_told(array['context-other']) = '[]'::jsonb, 'notice issue is tenant scoped');
insert into public.inquiry_events(tenant_stable_id, workspace_id, lead_id, kind, actor, detail, at)
  select 'c1000000-0000-4000-8000-000000000002', id, 'lead_owner_notice', 'delivery', 'system',
    '{"ownerNotice":true,"status":"accepted_unverified"}', '2026-10-10T12:01:00Z' from ic_ws;
select pg_temp.ic_assert(public.list_inquiry_owner_notices_not_told(array['context-site']) = '[]'::jsonb, 'acceptance clears unsent issue without claiming delivery');
insert into public.inquiry_events(tenant_stable_id, workspace_id, lead_id, kind, actor, detail, at)
  select 'c1000000-0000-4000-8000-000000000002', id, 'lead_owner_notice', 'delivery', 'system',
    '{"ownerNotice":true,"status":"bounced"}', '2026-10-10T12:02:00Z' from ic_ws;
select pg_temp.ic_assert(public.list_inquiry_owner_notices_not_told(array['context-site'])->0->>'status' = 'bounced', 'later bounce reopens owner-not-told issue');
rollback;
