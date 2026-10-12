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
  ('d2000000-0000-4000-8000-0000000000e1', 'ir-operator@strelva.example.test', now()),
  ('d2000000-0000-4000-8000-0000000000e2', 'ir-owner@example.test', now()),
  ('d2000000-0000-4000-8000-0000000000e3', 'ir-member@example.test', now()),
  ('d2000000-0000-4000-8000-0000000000e4', 'ir-admin@example.test', now()),
  ('d2000000-0000-4000-8000-0000000000e5', 'ir-race-other-owner@example.test', now()),
  ('d2000000-0000-4000-8000-0000000000e6', 'ir-unverified@example.test', null);
insert into public.super_admins(user_id, email) values ('d2000000-0000-4000-8000-0000000000e1', 'ir-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('ir-race-site', 'd2000000-0000-4000-8000-0000000000b1', 'McClear Fixture', true),
  ('ir-race-other', 'd2000000-0000-4000-8000-0000000000b2', 'Other Inquiry Site', true),
  ('ir-race-plain', 'd2000000-0000-4000-8000-0000000000b3', 'Unconverted Site', true);

create temporary table ir_ws(name text primary key, id uuid) on commit drop;
insert into ir_ws select 'site', (public.convert_tenant_to_business('ir-operator@strelva.example.test', 'ir-race-site',
  '{"tenantId":"ir-race-site","tenantStableId":"d2000000-0000-4000-8000-0000000000b1","workspaceName":"McClear Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd2000000-0000-4000-8000-0000000000c1', repeat('a', 64))->>'workspaceId')::uuid;
insert into ir_ws select 'other', (public.convert_tenant_to_business('ir-operator@strelva.example.test', 'ir-race-other',
  '{"tenantId":"ir-race-other","tenantStableId":"d2000000-0000-4000-8000-0000000000b2","workspaceName":"Other Inquiry Business","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd2000000-0000-4000-8000-0000000000c2', repeat('b', 64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  select (select id from ir_ws where name = 'site'), u, r, 'd2000000-0000-4000-8000-0000000000e2'::uuid
  from (values ('d2000000-0000-4000-8000-0000000000e2'::uuid, 'owner'), ('d2000000-0000-4000-8000-0000000000e3'::uuid, 'member'),
    ('d2000000-0000-4000-8000-0000000000e4'::uuid, 'admin'), ('d2000000-0000-4000-8000-0000000000e6'::uuid, 'owner')) m(u, r)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ((select id from ir_ws where name = 'other'), 'd2000000-0000-4000-8000-0000000000e5', 'owner', 'd2000000-0000-4000-8000-0000000000e5')
  on conflict (workspace_id, user_id) do update set role = excluded.role;


insert into public.memberships(user_id,tenant_id,role,tenant_stable_id)
 values('d2000000-0000-4000-8000-0000000000e2','ir-race-site','owner','d2000000-0000-4000-8000-0000000000b1');
select public.record_tenant_lead('ir-race-site',pg_temp.ir_lead('lead_reply','r1','2026-10-05T10:00:00Z'),'dual_write');
create temporary table ir_reply as select id from public.tenant_leads where lead_id='lead_reply';

commit;
