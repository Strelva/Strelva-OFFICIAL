\set ON_ERROR_STOP on
-- Inquiry records (20261009113000_inquiry_records.sql): spam held in
-- tenant_leads, inquiry_events, contact on capture, the workspace read and
-- the held-item review. Fictional tenants only; rolls back.
begin;
create or replace function pg_temp.ir_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry records assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ir_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.ir_lead(lead_id text, hash text, captured text, extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('leadId', lead_id, 'submissionHash', hash, 'name', 'Dana Reed',
    'email', 'Dana@Example.test', 'message', 'Private party for 30?', 'source', 'contact-form', 'capturedAt', captured) || extra
$$;

insert into public.users(id, email, verified_at) values
  ('d6100000-0000-4000-8000-0000000000e1', 'ip-operator@strelva.example.test', now()),
  ('d6100000-0000-4000-8000-0000000000e2', 'ip-owner@example.test', now()),
  ('d6100000-0000-4000-8000-0000000000e3', 'ip-member@example.test', now()),
  ('d6100000-0000-4000-8000-0000000000e4', 'ip-admin@example.test', now()),
  ('d6100000-0000-4000-8000-0000000000e5', 'ip-other-owner@example.test', now()),
  ('d6100000-0000-4000-8000-0000000000e6', 'ip-unverified@example.test', null);
insert into public.super_admins(user_id, email) values ('d6100000-0000-4000-8000-0000000000e1', 'ip-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('ip-site', 'd6100000-0000-4000-8000-0000000000b1', 'McClear Fixture', true),
  ('ip-other', 'd6100000-0000-4000-8000-0000000000b2', 'Other Inquiry Site', true),
  ('ip-plain', 'd6100000-0000-4000-8000-0000000000b3', 'Unconverted Site', true);

create temporary table ir_ws(name text primary key, id uuid) on commit drop;
insert into ir_ws select 'site', (public.convert_tenant_to_business('ip-operator@strelva.example.test', 'ip-site',
  '{"tenantId":"ip-site","tenantStableId":"d6100000-0000-4000-8000-0000000000b1","workspaceName":"McClear Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd6100000-0000-4000-8000-0000000000c1', repeat('a', 64))->>'workspaceId')::uuid;
insert into ir_ws select 'other', (public.convert_tenant_to_business('ip-operator@strelva.example.test', 'ip-other',
  '{"tenantId":"ip-other","tenantStableId":"d6100000-0000-4000-8000-0000000000b2","workspaceName":"Other Inquiry Business","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd6100000-0000-4000-8000-0000000000c2', repeat('b', 64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  select (select id from ir_ws where name = 'site'), u, r, 'd6100000-0000-4000-8000-0000000000e2'::uuid
  from (values ('d6100000-0000-4000-8000-0000000000e2'::uuid, 'owner'), ('d6100000-0000-4000-8000-0000000000e3'::uuid, 'member'),
    ('d6100000-0000-4000-8000-0000000000e4'::uuid, 'admin'), ('d6100000-0000-4000-8000-0000000000e6'::uuid, 'owner')) m(u, r)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ((select id from ir_ws where name = 'other'), 'd6100000-0000-4000-8000-0000000000e5', 'owner', 'd6100000-0000-4000-8000-0000000000e5')
  on conflict (workspace_id, user_id) do update set role = excluded.role;


insert into public.memberships(user_id,tenant_id,role,tenant_stable_id)
 values('d6100000-0000-4000-8000-0000000000e2','ip-site','owner','d6100000-0000-4000-8000-0000000000b1');

insert into public.tenant_leads(id,tenant_stable_id,tenant_slug_at_capture,workspace_id,lead_id,submission_hash,name,captured_at,recorded_via)
 select ('d6100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'d6100000-0000-4000-8000-0000000000b1','ip-site',(select id from ir_ws where name='site'),'lead_page_'||n,'pagehash'||n,'Dana','2026-06-01T00:00:00Z','backfill' from generate_series(1,501) n;
select pg_temp.ir_assert(jsonb_array_length(public.read_workspace_inquiry_inbox_page((select id from ir_ws where name='site'),'d6100000-0000-4000-8000-0000000000e2','ip-owner@example.test',null,500,null,null))=500,'old inquiries remain pageable');
select pg_temp.ir_assert(jsonb_array_length(public.read_workspace_inquiry_inbox_page((select id from ir_ws where name='site'),'d6100000-0000-4000-8000-0000000000e2','ip-owner@example.test',null,500,'2026-06-01T00:00:00Z','d6100000-0000-4000-8000-000000000002'))=1,'equal-time cursor retains the 501st lead');
insert into public.tenant_leads(id,tenant_stable_id,tenant_slug_at_capture,workspace_id,lead_id,submission_hash,name,captured_at,recorded_via)
 select ('d6100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'d6100000-0000-4000-8000-0000000000b1','ip-site',(select id from ir_ws where name='site'),'lead_micro_'||n,'microhash'||n,'Dana',('2026-07-01T00:00:00Z'::timestamptz+(n-900)*interval '1 microsecond'),'backfill' from generate_series(901,902) n;
do $$ declare first_page jsonb; next_page jsonb; begin
 first_page:=public.read_workspace_inquiry_inbox_page((select id from ir_ws where name='site'),'d6100000-0000-4000-8000-0000000000e2','ip-owner@example.test',null,1,null,null);
 perform pg_temp.ir_assert(first_page#>>'{0,capturedAt}'='2026-07-01T00:00:00.000002Z','cursor preserves all database timestamp precision');
 next_page:=public.read_workspace_inquiry_inbox_page((select id from ir_ws where name='site'),'d6100000-0000-4000-8000-0000000000e2','ip-owner@example.test',null,1,(first_page#>>'{0,capturedAt}')::timestamptz,(first_page#>>'{0,id}')::uuid);
 perform pg_temp.ir_assert(next_page#>>'{0,leadId}'='lead_micro_901','cursor never skips an adjacent microsecond');
end $$;
select pg_temp.ir_assert(jsonb_array_length(public.read_workspace_inquiry_inbox_page((select id from ir_ws where name='site'),'d6100000-0000-4000-8000-0000000000e3','ip-member@example.test',null,100,null,null))=0,'workspace membership never widens tenant access');
select pg_temp.ir_expect(format($q$select public.read_workspace_inquiry_inbox_page(%L,'d6100000-0000-4000-8000-0000000000e5','ip-other-owner@example.test',null,100,null,null)$q$,(select id from ir_ws where name='site')),'inquiry_access_denied');
select pg_temp.ir_assert(not has_function_privilege('authenticated','public.read_workspace_inquiry_inbox_page(uuid,uuid,text,text[],integer,timestamptz,uuid)','execute'),'service role with member proof only');
rollback;
