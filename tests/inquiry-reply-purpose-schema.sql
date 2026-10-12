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
  ('d0000000-0000-4000-8000-0000000000e1', 'ir-operator@strelva.example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e2', 'ir-owner@example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e3', 'ir-member@example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e4', 'ir-admin@example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e5', 'ir-other-owner@example.test', now()),
  ('d0000000-0000-4000-8000-0000000000e6', 'ir-unverified@example.test', null);
insert into public.super_admins(user_id, email) values ('d0000000-0000-4000-8000-0000000000e1', 'ir-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('ir-site', 'd0000000-0000-4000-8000-0000000000b1', 'McClear Fixture', true),
  ('ir-other', 'd0000000-0000-4000-8000-0000000000b2', 'Other Inquiry Site', true),
  ('ir-plain', 'd0000000-0000-4000-8000-0000000000b3', 'Unconverted Site', true);

create temporary table ir_ws(name text primary key, id uuid) on commit drop;
insert into ir_ws select 'site', (public.convert_tenant_to_business('ir-operator@strelva.example.test', 'ir-site',
  '{"tenantId":"ir-site","tenantStableId":"d0000000-0000-4000-8000-0000000000b1","workspaceName":"McClear Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd0000000-0000-4000-8000-0000000000c1', repeat('a', 64))->>'workspaceId')::uuid;
insert into ir_ws select 'other', (public.convert_tenant_to_business('ir-operator@strelva.example.test', 'ir-other',
  '{"tenantId":"ir-other","tenantStableId":"d0000000-0000-4000-8000-0000000000b2","workspaceName":"Other Inquiry Business","billing":null,"account":null,"patch":{},"contacts":[]}',
  'd0000000-0000-4000-8000-0000000000c2', repeat('b', 64))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  select (select id from ir_ws where name = 'site'), u, r, 'd0000000-0000-4000-8000-0000000000e2'::uuid
  from (values ('d0000000-0000-4000-8000-0000000000e2'::uuid, 'owner'), ('d0000000-0000-4000-8000-0000000000e3'::uuid, 'member'),
    ('d0000000-0000-4000-8000-0000000000e4'::uuid, 'admin'), ('d0000000-0000-4000-8000-0000000000e6'::uuid, 'owner')) m(u, r)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  values ((select id from ir_ws where name = 'other'), 'd0000000-0000-4000-8000-0000000000e5', 'owner', 'd0000000-0000-4000-8000-0000000000e5')
  on conflict (workspace_id, user_id) do update set role = excluded.role;


insert into public.memberships(user_id,tenant_id,role,tenant_stable_id)
 values('d0000000-0000-4000-8000-0000000000e2','ir-site','owner','d0000000-0000-4000-8000-0000000000b1');
select public.record_tenant_lead('ir-site',pg_temp.ir_lead('lead_reply','r1','2026-10-05T10:00:00Z'),'dual_write');
create temporary table ir_reply as select id from public.tenant_leads where lead_id='lead_reply';
create function pg_temp.ir_claim(p_user uuid,p_ws text default 'site',p_request uuid default 'd0000000-0000-4000-8000-0000000000f1',p_digest text default repeat('a',64)) returns jsonb language sql as $$
 select public.claim_workspace_inquiry_reply((select id from ir_ws where name=p_ws),p_user,(select email from public.users where id=p_user),
 (select id from ir_reply),p_request,p_digest,'Re: Party','Thanks Dana. We can help.')
$$;

-- Owner wins: both in-flight and provider-accepted workspace claims exclude engine sends.
select pg_temp.ir_assert((pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2')->>'acquired')::boolean,'owner wins');
select pg_temp.ir_assert(not public.claim_engine_inquiry_reply('ir-site','lead_reply','d0000000-0000-4000-8000-0000000000f8'),'in-flight owner excludes engine');
select public.finish_workspace_inquiry_reply((select id from public.inquiry_workspace_messages where lead_row_id=(select id from ir_reply)),'accepted','purpose-provider','2026-10-05T12:00:00Z');
select pg_temp.ir_assert(not public.claim_engine_inquiry_reply('ir-site','lead_reply','d0000000-0000-4000-8000-0000000000f8'),'accepted owner excludes engine');

-- Engine wins: permanent claim excludes owner even before its provider call.
select public.record_tenant_lead('ir-site',pg_temp.ir_lead('lead_engine','engine1','2026-10-05T10:00:00Z'),'dual_write');
update ir_reply set id=(select id from public.tenant_leads where lead_id='lead_engine');
select pg_temp.ir_assert(public.claim_engine_inquiry_reply('ir-site','lead_engine','d0000000-0000-4000-8000-0000000000f8'),'engine claims before provider');
select pg_temp.ir_assert(not public.claim_engine_inquiry_reply('ir-site','lead_engine','d0000000-0000-4000-8000-0000000000f9'),'engine duplicate excluded');
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site',gen_random_uuid())$$,'inquiry_reply_already_sent');
select pg_temp.ir_assert(not public.release_rejected_engine_inquiry_reply('ir-other','lead_engine','d0000000-0000-4000-8000-0000000000f8'),'wrong tenant cannot release');
select pg_temp.ir_assert(not public.release_rejected_engine_inquiry_reply('ir-site','lead_engine','d0000000-0000-4000-8000-0000000000f9'),'wrong attempt cannot release');
select pg_temp.ir_assert(public.release_rejected_engine_inquiry_reply('ir-site','lead_engine','d0000000-0000-4000-8000-0000000000f8'),'known rejection releases exact purpose');
select pg_temp.ir_assert((pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site',gen_random_uuid())->>'acquired')::boolean,'owner can act after known engine rejection');

-- Prior engine acceptance (the deployed delivery mirror) also closes new engine claims.
select public.record_tenant_lead('ir-site',pg_temp.ir_lead('lead_prior','prior1','2026-10-05T10:00:00Z'),'dual_write');
select public.record_tenant_client_record('ir-site','inquiry_reply','lead_prior','{"firstReplyAt":"2026-10-05T12:00:00Z"}',repeat('c',64),'2026-10-05T12:00:00Z','dual_write','keep_first');
select pg_temp.ir_assert(not public.claim_engine_inquiry_reply('ir-site','lead_prior',gen_random_uuid()),'existing accepted engine message excluded');
select pg_temp.ir_assert(not has_table_privilege('service_role','public.inquiry_engine_reply_claims','select')
 and not has_function_privilege('authenticated','public.claim_engine_inquiry_reply(text,text,uuid)','execute')
 and not has_function_privilege('authenticated','public.release_rejected_engine_inquiry_reply(text,text,uuid)','execute'),'service RPC only');
rollback;
