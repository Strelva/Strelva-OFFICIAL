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
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e3')$$,'inquiry_access_denied');
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e5','other')$$,'inquiry_not_found');
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e6')$$,'inquiry_access_denied');
select pg_temp.ir_assert((pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2')->>'acquired')::boolean,'owner claims exact message');
select pg_temp.ir_assert(not (pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2')->>'acquired')::boolean,'duplicate claim closed');
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site','d0000000-0000-4000-8000-0000000000f1',repeat('b',64))$$,'inquiry_reply_changed');
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site','d0000000-0000-4000-8000-0000000000f2',repeat('b',64))$$,'inquiry_reply_changed');
select public.finish_workspace_inquiry_reply((select id from public.inquiry_workspace_messages where lead_row_id=(select id from ir_reply)),'accepted','provider-one','2026-10-05T12:00:00Z');
select pg_temp.ir_assert(not (pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2')->>'acquired')::boolean,'acceptance never reopens sending');
select public.finish_workspace_inquiry_reply((select id from public.inquiry_workspace_messages where lead_row_id=(select id from ir_reply)),'bounced','provider-one','2026-10-05T12:00:00Z');
select pg_temp.ir_assert(pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2')->>'status'='bounced','bounce is permanently closed');
select pg_temp.ir_expect($$update public.inquiry_workspace_message_events set status='delivered'$$,'inquiry_events_immutable');
select pg_temp.ir_assert((public.business_inquiry_outcomes((select id from ir_ws where name='site'),'d0000000-0000-4000-8000-0000000000e2','ir-owner@example.test','2026-10-01','2026-10-08')->>'answered')::int=1,'first acceptance counted');
select pg_temp.ir_assert((public.business_inquiry_outcomes((select id from ir_ws where name='site'),'d0000000-0000-4000-8000-0000000000e2','ir-owner@example.test','2026-10-01','2026-10-08')->>'averageReplySeconds')::int=7200,'first reply seconds');
select public.hold_tenant_lead_as_spam('ir-site','{"id":"spam_1","reason":"honeypot","name":"Bot","email":"bot@example.test","createdAt":"2026-10-05T10:00:00Z"}');
select pg_temp.ir_assert((public.business_inquiry_outcomes((select id from ir_ws where name='site'),'d0000000-0000-4000-8000-0000000000e2','ir-owner@example.test','2026-10-01','2026-10-08')->>'inquiries')::int=1,'spam excluded');
select pg_temp.ir_expect(format($q$select public.claim_workspace_inquiry_reply(%L,'d0000000-0000-4000-8000-0000000000e2','ir-owner@example.test',%L,gen_random_uuid(),repeat('a',64),'Re: Hello','Hi')$q$,
 (select id from ir_ws where name='site'),(select id from public.tenant_leads where intake_state='held_as_spam' and workspace_id=(select id from ir_ws where name='site'))),'inquiry_reply_held');
select pg_temp.ir_assert(not has_table_privilege('service_role','public.inquiry_workspace_messages','select') and
 not has_function_privilege('authenticated','public.claim_workspace_inquiry_reply(uuid,uuid,text,uuid,uuid,text,text,text)','execute'),'service role RPC only');
select pg_temp.ir_assert(public.inquiry_safe_timestamp('yesterday') is null and public.inquiry_safe_timestamp('2026-99-99T10:00:00Z') is null,'malformed reply time refused');
-- More than 500 recent inquiries: summary is exact, page size is bounded, equal times use lead-id cursor.
insert into public.tenant_leads(tenant_stable_id,tenant_slug_at_capture,workspace_id,lead_id,submission_hash,name,captured_at,recorded_via)
 select 'd0000000-0000-4000-8000-0000000000b1','ir-site',(select id from ir_ws where name='site'),'lead_bulk_'||lpad(n::text,4,'0'),'b'||n,'Bulk','2026-10-06T00:00:00Z','backfill' from generate_series(1,501) n;
select pg_temp.ir_assert((public.read_tenant_lead_summary('ir-site','2026-10-01')->>'count')::int=502,'count not capped to cache size');
select pg_temp.ir_assert(jsonb_array_length(public.read_tenant_lead_summary('ir-site','2026-10-01')->'recent')=5,'summary five most recent');
select pg_temp.ir_assert(public.read_tenant_leads_page('ir-site',1,'2026-10-06T00:00:00Z','lead_bulk_0501')->0->>'leadId'='lead_bulk_0500','same timestamp cursor loses no rows');
-- Legacy malformed/null/negative reply timestamps cannot earn answered proof.
select public.record_tenant_client_record('ir-site','inquiry_reply','lead_bulk_0001','{"firstReplyAt":"bad"}',repeat('c',64),'2026-10-06','dual_write','keep_first');
select public.record_tenant_client_record('ir-site','inquiry_reply','lead_bulk_0002','{"firstReplyAt":"2026-10-05T00:00:00Z"}',repeat('d',64),'2026-10-06','dual_write','keep_first');
select pg_temp.ir_assert((public.business_inquiry_outcomes((select id from ir_ws where name='site'),'d0000000-0000-4000-8000-0000000000e2','ir-owner@example.test','2026-10-01','2026-10-08')->>'answered')::int=1,'bad reply evidence never counts');

-- New claims recheck closed work and the exact currently-live capability.
select public.record_tenant_lead('ir-site',pg_temp.ir_lead('lead_closed','closed1','2026-10-05T10:00:00Z'),'dual_write');
update ir_reply set id=(select id from public.tenant_leads where lead_id='lead_closed');
insert into public.inquiry_record_overlays(tenant_id,business_id,inquiry_id,capability_id,status)
 values('ir-site','reply-fixture','lead_closed','cap_reply','handled');
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site',gen_random_uuid())$$,'inquiry_reply_closed');
update public.inquiry_record_overlays set status='blocked' where inquiry_id='lead_closed';
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site',gen_random_uuid())$$,'inquiry_reply_closed');
select public.record_tenant_lead('ir-site',pg_temp.ir_lead('lead_cap_reply','cap1','2026-10-05T10:00:00Z','{"capabilityId":"cap_reply","capabilityVersion":1}'),'dual_write');
update ir_reply set id=(select id from public.tenant_leads where lead_id='lead_cap_reply');
insert into public.inquiry_workspaces(tenant_id,business_id,state)
 values('ir-site','reply-fixture','{"inquiries":[],"capabilities":[{"id":"cap_reply","status":"paused","live":{"version":1}}]}');
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site',gen_random_uuid())$$,'inquiry_reply_paused');
update public.inquiry_workspaces set state='{"inquiries":[],"capabilities":[{"id":"cap_reply","status":"live","live":{"version":2}}]}' where business_id='reply-fixture';
select pg_temp.ir_expect($$select pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site',gen_random_uuid())$$,'inquiry_reply_version_changed');
update public.inquiry_workspaces set state='{"inquiries":[],"capabilities":[{"id":"cap_reply","status":"live","live":{"version":1}}]}' where business_id='reply-fixture';
select pg_temp.ir_assert((pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site','d0000000-0000-4000-8000-0000000000f3')->>'acquired')::boolean,'exact live version claims');
update public.inquiry_workspaces set state='{"inquiries":[],"capabilities":[{"id":"cap_reply","status":"paused","live":{"version":2}}]}' where business_id='reply-fixture';
select pg_temp.ir_assert(not (pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site','d0000000-0000-4000-8000-0000000000f3')->>'acquired')::boolean,'pause and edit preserve read-only receipt check');

-- Recover an accepted provider write whose local checkpoint failed. Signed
-- event metadata is still checked against the destination, subject and scope.
create temporary table ir_provider_message as select id from public.inquiry_workspace_messages where lead_row_id=(select id from ir_reply);
update public.inquiry_workspace_messages set created_at='2026-10-05T10:00:00Z' where id=(select id from ir_provider_message);
select public.finish_workspace_inquiry_reply((select id from ir_provider_message),'unknown',null,null);
create function pg_temp.ir_event(p_event text,p_status text,p_at timestamptz,p_recipients text[] default array['dana@example.test'],p_subject text default 'Re: Party',p_provider text default 'provider-recovered',p_ws text default 'site') returns jsonb language sql as $$
 select public.record_workspace_inquiry_provider_event((select id from ir_provider_message),(select id from ir_ws where name=p_ws),p_provider,p_event,p_status,p_at,'2026-10-05T12:00:00Z',p_recipients,p_subject)
$$;
select pg_temp.ir_assert(pg_temp.ir_event('wrong-ws','accepted','2026-10-05T12:00:00Z',p_ws=>'other')->>'status'='unmatched','wrong business event refused');
select pg_temp.ir_assert(pg_temp.ir_event('wrong-recipient','accepted','2026-10-05T12:00:00Z',array['wrong@example.test'])->>'status'='unmatched','wrong destination refused');
select pg_temp.ir_assert(pg_temp.ir_event('wrong-subject','accepted','2026-10-05T12:00:00Z',p_subject=>'Different message')->>'status'='unmatched','wrong subject refused');
select pg_temp.ir_assert(pg_temp.ir_event('sent-event','accepted','2026-10-05T12:00:00Z')->>'status'='recorded','unknown recovered from provider acceptance');
select pg_temp.ir_assert((select status='accepted' and provider_message_id='provider-recovered' from public.inquiry_workspace_messages where id=(select id from ir_provider_message)),'provider recovery stores receipt without resend');
select pg_temp.ir_assert(pg_temp.ir_event('sent-event','accepted','2026-10-05T12:00:00Z')->>'status'='duplicate','provider duplicate is no-op');
select pg_temp.ir_assert(pg_temp.ir_event('swapped-provider','delivered','2026-10-05T12:01:00Z',p_provider=>'different-provider')->>'status'='unmatched','immutable provider correlation');
select pg_temp.ir_event('delay-event','deferred','2026-10-05T12:01:00Z');
select pg_temp.ir_event('delivery-event','delivered','2026-10-05T12:02:00Z');
select pg_temp.ir_assert((select status='delivered' from public.inquiry_workspace_messages where id=(select id from ir_provider_message)),'deferred becomes delivered');
select pg_temp.ir_event('old-delay','deferred','2026-10-05T12:01:30Z');
select pg_temp.ir_event('new-delay','deferred','2026-10-05T12:03:00Z');
select pg_temp.ir_event('late-sent','accepted','2026-10-05T12:04:00Z');
select pg_temp.ir_assert((select status='delivered' from public.inquiry_workspace_messages where id=(select id from ir_provider_message)),'old or weaker evidence cannot reverse delivery');
select pg_temp.ir_event('bounce-event','bounced','2026-10-05T12:05:00Z');
select pg_temp.ir_event('late-delivered','delivered','2026-10-05T12:06:00Z');
select pg_temp.ir_assert((select status='bounced' from public.inquiry_workspace_messages where id=(select id from ir_provider_message)),'bounce stays terminal');
select pg_temp.ir_assert(not (pg_temp.ir_claim('d0000000-0000-4000-8000-0000000000e2','site','d0000000-0000-4000-8000-0000000000f3')->>'acquired')::boolean,'provider events never reopen send');
select pg_temp.ir_assert(not has_function_privilege('authenticated','public.record_workspace_inquiry_provider_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text)','execute'),'provider repair service role only');

rollback;
