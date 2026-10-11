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
  ('d3000000-0000-4000-8000-0000000000e1', 'ir-member-proof-operator@strelva.example.test', now()),
  ('d3000000-0000-4000-8000-0000000000e2', 'ir-member-proof-owner@example.test', now()),
  ('d3000000-0000-4000-8000-0000000000e3', 'ir-member-proof-member@example.test', now()),
  ('d3000000-0000-4000-8000-0000000000e4', 'ir-member-proof-admin@example.test', now()),
  ('d3000000-0000-4000-8000-0000000000e5', 'ir-member-proof-other-owner@example.test', now()),
  ('d3000000-0000-4000-8000-0000000000e6', 'ir-member-proof-unverified@example.test', null);
insert into public.super_admins(user_id, email) values ('d3000000-0000-4000-8000-0000000000e1', 'ir-member-proof-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('ir-member-proof-site', 'd3000000-0000-4000-8000-0000000000b1', 'McClear Fixture', true),
  ('ir-member-proof-other', 'd3000000-0000-4000-8000-0000000000b2', 'Other Inquiry Site', true),
  ('ir-member-proof-plain', 'd3000000-0000-4000-8000-0000000000b3', 'Unconverted Site', true);

create temporary table ir_ws(name text primary key, id uuid) on commit drop;
insert into ir_ws select 'site', (public.convert_tenant_to_business('ir-member-proof-operator@strelva.example.test', 'ir-member-proof-site',
  '{"tenantId":"ir-member-proof-site","tenantStableId":"d3000000-0000-4000-8000-0000000000b1","workspaceName":"McClear Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd3000000-0000-4000-8000-0000000000c1', repeat('a', 64))->>'workspaceId')::uuid;
insert into ir_ws select 'other', (public.convert_tenant_to_business('ir-member-proof-operator@strelva.example.test', 'ir-member-proof-other',
  '{"tenantId":"ir-member-proof-other","tenantStableId":"d3000000-0000-4000-8000-0000000000b2","workspaceName":"Other Inquiry Business","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd3000000-0000-4000-8000-0000000000c2', repeat('b', 64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  select (select id from ir_ws where name = 'site'), u, r, 'd3000000-0000-4000-8000-0000000000e2'::uuid
  from (values ('d3000000-0000-4000-8000-0000000000e2'::uuid, 'owner'), ('d3000000-0000-4000-8000-0000000000e3'::uuid, 'member'),
    ('d3000000-0000-4000-8000-0000000000e4'::uuid, 'admin'), ('d3000000-0000-4000-8000-0000000000e6'::uuid, 'owner')) m(u, r)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ((select id from ir_ws where name = 'other'), 'd3000000-0000-4000-8000-0000000000e5', 'owner', 'd3000000-0000-4000-8000-0000000000e5')
  on conflict (workspace_id, user_id) do update set role = excluded.role;


insert into public.memberships(user_id,tenant_id,role,tenant_stable_id)
 values('d3000000-0000-4000-8000-0000000000e2','ir-member-proof-site','owner','d3000000-0000-4000-8000-0000000000b1');

insert into public.memberships(user_id,tenant_id,role,tenant_stable_id)
 values('d3000000-0000-4000-8000-0000000000e3','ir-member-proof-site','editor','d3000000-0000-4000-8000-0000000000b1');
insert into public.inquiry_workspaces(tenant_id,business_id,state) values('ir-member-proof-site','member-fixture','{"inquiries":[],"changes":[],"capabilities":[{"id":"cap_member","status":"live","live":{"version":1,"routing":{"destination":"owner@example.test"}}}]}');
select public.record_tenant_lead('ir-member-proof-site',pg_temp.ir_lead('lead_'||n,'member'||n,'2026-10-06T10:00:00Z','{"capabilityId":"cap_member","capabilityVersion":1}'),'dual_write') from generate_series(1,6) n;
insert into public.inquiry_record_overlays(tenant_id,business_id,inquiry_id,capability_id,status,assignee_id)
 select 'ir-member-proof-site','member-fixture','lead_'||n,'cap_member','assigned','d3000000-0000-4000-8000-0000000000e3' from generate_series(1,6) n;
create function pg_temp.member_claim(p_n int,p_body text default 'Thanks Dana. Please tell us more.',p_commitment boolean default false,p_user uuid default 'd3000000-0000-4000-8000-0000000000e3',p_request uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.claim_workspace_inquiry_reply_v2((select id from ir_ws where name='site'),p_user,(select email from public.users where id=p_user),
 (select id from public.tenant_leads where lead_id='lead_'||p_n),p_request,repeat('f',64),'Re: Your inquiry',p_body,p_commitment)
$$;
select pg_temp.ir_assert(not has_function_privilege('authenticated','public.claim_workspace_inquiry_reply_v2(uuid,uuid,text,uuid,uuid,text,text,text,boolean)','execute')
 and not has_function_privilege('service_role','public.workspace_inquiry_reply_permission(uuid,uuid,text,uuid)','execute'),'delegated send service RPC only');
select pg_temp.ir_assert(public.read_workspace_inquiry_leads_with_receipts((select id from ir_ws where name='site'),'d3000000-0000-4000-8000-0000000000e3','ir-member-proof-member@example.test',null,100,null)->0->>'replyPermission'='member','scoped read shows delegated permission');
select pg_temp.ir_expect($$select pg_temp.member_claim(1,'We can do that.',true)$$,'inquiry_reply_commitment_owner_only');
select pg_temp.ir_expect($$select pg_temp.member_claim(1,'The price is $40.',false)$$,'inquiry_reply_commitment_owner_only');
select pg_temp.ir_expect($$select pg_temp.member_claim(1,'We reserved Friday.',false)$$,'inquiry_reply_commitment_owner_only');
select pg_temp.ir_assert((pg_temp.member_claim(1)->>'acquired')::boolean,'assigned member sends ordinary text');
select pg_temp.ir_assert((select requested_by='d3000000-0000-4000-8000-0000000000e3'::uuid from public.inquiry_workspace_messages where lead_row_id=(select id from public.tenant_leads where lead_id='lead_1')),'member actor recorded');
select pg_temp.ir_assert(not (pg_temp.member_claim(1,p_request=>(select request_id from public.inquiry_workspace_messages where lead_row_id=(select id from public.tenant_leads where lead_id='lead_1')))->>'acquired')::boolean,'duplicate purpose never sends');
update public.inquiry_record_overlays set assignee_id=null where inquiry_id='lead_2';
select pg_temp.ir_expect($$select pg_temp.member_claim(2)$$,'inquiry_access_denied');
-- A published revoke takes precedence over a stale overlay assignment.
update public.inquiry_workspaces set state=jsonb_set(state,'{changes}','[{"status":"published","items":[{"path":"inquiries.lead_3.assigneeId","after":null}]}]') where business_id='member-fixture';
select pg_temp.ir_expect($$select pg_temp.member_claim(3)$$,'inquiry_access_denied');
update public.inquiry_workspaces set state=jsonb_set(state,'{changes}','[{"status":"published","items":[{"path":"inquiries.lead_3.assigneeId","after":"d3000000-0000-4000-8000-0000000000e3"}]}]') where business_id='member-fixture';
select pg_temp.ir_assert((pg_temp.member_claim(3)->>'acquired')::boolean,'published assignment authorizes member');
-- Routing resolves a current active business person and verified member email.
insert into public.business_people(workspace_id,name,email,source,created_by,updated_by) values((select id from ir_ws where name='site'),'Team Member','ir-member-proof-member@example.test','owner','d3000000-0000-4000-8000-0000000000e2','d3000000-0000-4000-8000-0000000000e2');
update public.inquiry_record_overlays set assignee_id=null where inquiry_id in ('lead_4','lead_5');
update public.inquiry_workspaces set state=jsonb_set(state,'{capabilities,0,live,routing,destination}',to_jsonb('person:'||(select id::text from public.business_people where workspace_id=(select id from ir_ws where name='site')))) where business_id='member-fixture';
select pg_temp.ir_assert((pg_temp.member_claim(4)->>'acquired')::boolean,'routed active member can reply');
update public.business_people set active=false where workspace_id=(select id from ir_ws where name='site');
select pg_temp.ir_expect($$select pg_temp.member_claim(5)$$,'inquiry_access_denied');
update public.inquiry_workspaces set state=jsonb_set(state,'{capabilities,0,status}','"paused"') where business_id='member-fixture';
select pg_temp.ir_expect($$select pg_temp.member_claim(6)$$,'inquiry_reply_paused');
update public.inquiry_workspaces set state=jsonb_set(state,'{capabilities,0,status}','"live"') where business_id='member-fixture';
update public.inquiry_record_overlays set status='blocked' where inquiry_id='lead_6';
select pg_temp.ir_expect($$select pg_temp.member_claim(6)$$,'inquiry_access_denied');
update public.inquiry_record_overlays set status='assigned' where inquiry_id='lead_6';
delete from public.memberships where user_id='d3000000-0000-4000-8000-0000000000e3';
select pg_temp.ir_expect($$select pg_temp.member_claim(6)$$,'inquiry_access_denied');
insert into public.memberships(user_id,tenant_id,role,tenant_stable_id) values('d3000000-0000-4000-8000-0000000000e3','ir-member-proof-site','editor','d3000000-0000-4000-8000-0000000000b1');
delete from public.workspace_memberships where user_id='d3000000-0000-4000-8000-0000000000e3';
select pg_temp.ir_expect($$select pg_temp.member_claim(6)$$,'inquiry_access_denied');
select pg_temp.ir_assert((pg_temp.member_claim(6,'We reserved Friday at $40.',true,'d3000000-0000-4000-8000-0000000000e2')->>'acquired')::boolean,'owner may approve explicit commitments');
rollback;
