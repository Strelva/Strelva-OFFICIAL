\set ON_ERROR_STOP on
begin;
create function pg_temp.ar_assert(ok boolean, message text) returns void language plpgsql as $$begin if ok is not true then raise exception 'access review assertion failed: %',message; end if; end;$$;
create function pg_temp.ar_expect(statement text, expected text) returns void language plpgsql as $$begin begin execute statement; exception when others then if sqlerrm<>expected then raise exception 'expected % got %',expected,sqlerrm; end if; return; end; raise exception 'expected % but succeeded',expected;end;$$;
insert into public.users(id,email,verified_at) select ('27500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'ar-'||n||'@example.test',case when n=6 then null else now() end from generate_series(1,6) n;
insert into public.workspaces(id,kind,name,created_by) select ('27500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=45 then 'agency' else 'customer' end,'Access unit '||n,'27500000-0000-4000-8000-000000000001' from generate_series(41,45) n;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
('27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000001','owner','27500000-0000-4000-8000-000000000001'),
('27500000-0000-4000-8000-000000000042','27500000-0000-4000-8000-000000000001','owner','27500000-0000-4000-8000-000000000001'),
('27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000002','admin','27500000-0000-4000-8000-000000000001'),
('27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000003','member','27500000-0000-4000-8000-000000000001'),
('27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000006','member','27500000-0000-4000-8000-000000000001'),
('27500000-0000-4000-8000-000000000043','27500000-0000-4000-8000-000000000004','owner','27500000-0000-4000-8000-000000000001'),
('27500000-0000-4000-8000-000000000045','27500000-0000-4000-8000-000000000005','owner','27500000-0000-4000-8000-000000000001');
insert into public.customer_relationships(organization_workspace_id,customer_workspace_id,display_name,customer_kind,provenance_source,recorded_by,updated_by)
select '27500000-0000-4000-8000-000000000041',id,'Mapped unit','organization','direct_mapping','27500000-0000-4000-8000-000000000001','27500000-0000-4000-8000-000000000001' from public.workspaces where id in ('27500000-0000-4000-8000-000000000042','27500000-0000-4000-8000-000000000043');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values ('27500000-0000-4000-8000-000000000051','27500000-0000-4000-8000-000000000041','tracker','tracker','Review work','{}','27500000-0000-4000-8000-000000000001');
insert into public.workspace_delegations(id,customer_workspace_id,customer_work_id,agency_workspace_id,granted_by,accepted_by) values('27500000-0000-4000-8000-000000000061','27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000051','27500000-0000-4000-8000-000000000045','27500000-0000-4000-8000-000000000001','27500000-0000-4000-8000-000000000001');
insert into public.workspace_work_participation(work_id,payload) values ('27500000-0000-4000-8000-000000000051',jsonb_build_object('version',1,'revision',1,'contributions','[]'::jsonb,'history','[]'::jsonb,'grants',jsonb_build_array(jsonb_build_object('id','27500000-0000-4000-8000-000000000071','participantKind','agent','participantEmail','ar-3@example.test','status','active','expiresAt',now()+interval '2 days','scope',jsonb_build_array('read','propose')))));
insert into public.workspace_agent_access_tokens(id,work_id,grant_id,token_hash,token_prefix,issuer_user_id,issuer_email,agent_label,scopes,expires_at) select ('27500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'27500000-0000-4000-8000-000000000051','27500000-0000-4000-8000-000000000071',lpad(n::text,64,'a'),'fixture-only','27500000-0000-4000-8000-000000000003','ar-3@example.test','Review AI',array['read'],now()+interval '1 day' from generate_series(81,87) n;
update public.workspace_agent_access_tokens set expires_at=now()-interval '1 day' where id='27500000-0000-4000-8000-000000000082';
update public.workspace_agent_access_tokens set revoked_at=now(),revoked_by='27500000-0000-4000-8000-000000000001' where id='27500000-0000-4000-8000-000000000083';
update public.workspace_agent_access_tokens set grant_id=gen_random_uuid() where id='27500000-0000-4000-8000-000000000084';
update public.workspace_agent_access_tokens set issuer_email='wrong@example.test' where id='27500000-0000-4000-8000-000000000085';
update public.workspace_agent_access_tokens set issuer_user_id='27500000-0000-4000-8000-000000000006',issuer_email='ar-6@example.test' where id='27500000-0000-4000-8000-000000000086';
insert into public.workspace_agent_access_events(event_key,token_id,issuer_user_id,work_id,grant_id,action,occurred_at) values('ar-read','27500000-0000-4000-8000-000000000081','27500000-0000-4000-8000-000000000003','27500000-0000-4000-8000-000000000051','27500000-0000-4000-8000-000000000071','read','2026-10-01T10:00:00Z');
insert into public.operational_assignments(id,workspace_id,work_id,sponsor_id,sponsor_email,assignee_user_id,assignee_email,assignee_kind,offer_key,work_scope,expires_at)
values('27500000-0000-4000-8000-000000000062','27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000051','27500000-0000-4000-8000-000000000001','ar-1@example.test','27500000-0000-4000-8000-000000000003','ar-3@example.test','staff','access-review-fixture','{}',now()+interval '1 day');
insert into public.workspace_providers(id,customer_workspace_id,provider_workspace_id,source,started_by) values('27500000-0000-4000-8000-000000000063','27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000045','business_choice','27500000-0000-4000-8000-000000000001');
insert into public.provider_seats(id,customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
('27500000-0000-4000-8000-000000000064','27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000045','owner','27500000-0000-4000-8000-000000000001'),
('27500000-0000-4000-8000-000000000065','27500000-0000-4000-8000-000000000042','27500000-0000-4000-8000-000000000045','owner','27500000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(id,agency_workspace_id,customer_workspace_id,user_id,assigned_by) values('27500000-0000-4000-8000-000000000066','27500000-0000-4000-8000-000000000045','27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000005','27500000-0000-4000-8000-000000000005');
create function pg_temp.ar_read(who integer, org boolean default false) returns jsonb language sql as $$select public.read_access_review('27500000-0000-4000-8000-000000000041',('27500000-0000-4000-8000-'||lpad(who::text,12,'0'))::uuid,'ar-'||who||'@example.test',org);$$;
create function pg_temp.ar_revoke(who integer,kind text,id integer,business integer default 41,org boolean default false) returns jsonb language sql as $$select public.revoke_access_review_entry('27500000-0000-4000-8000-000000000041',('27500000-0000-4000-8000-'||lpad(business::text,12,'0'))::uuid,('27500000-0000-4000-8000-'||lpad(who::text,12,'0'))::uuid,'ar-'||who||'@example.test',org,kind,('27500000-0000-4000-8000-'||lpad(id::text,12,'0'))::uuid);$$;
select pg_temp.ar_assert(not has_function_privilege('authenticated','public.read_access_review(uuid,uuid,text,boolean)','execute') and not has_function_privilege('service_role','public.access_review_require(uuid,uuid,text)','execute'),'service-only reader and private helper');

select pg_temp.ar_assert(jsonb_array_length(pg_temp.ar_read(1,true)->'units')=2 and pg_temp.ar_read(1,true)->>'inaccessibleUnits'='1','organization respects direct membership');
select pg_temp.ar_assert(pg_temp.ar_read(3)->'units'->0->>'role'='member','members can read business');

select pg_temp.ar_expect('select pg_temp.ar_read(3,true)','access_review_denied');
select pg_temp.ar_expect('select pg_temp.ar_read(4)','access_review_denied');
select pg_temp.ar_expect('select pg_temp.ar_read(6)','access_review_denied');
select pg_temp.ar_expect('select pg_temp.ar_revoke(3,''delegation'',61)','access_review_denied');
select pg_temp.ar_expect('select pg_temp.ar_revoke(2,''member'',3)','access_review_denied');
select pg_temp.ar_expect('select pg_temp.ar_revoke(1,''member'',1)','access_review_protected');
select pg_temp.ar_expect('select pg_temp.ar_revoke(1,''member'',4,43,true)','access_review_denied');
select pg_temp.ar_expect('select pg_temp.ar_revoke(1,''member'',1,44,true)','access_review_denied');
select pg_temp.ar_assert((select count(*)=2 from jsonb_array_elements(pg_temp.ar_read(1)->'units'->0->'entries') e where e->>'kind'='agent_token'),'only live credentials');
select pg_temp.ar_assert((select e->>'lastUsedAt' is not null from jsonb_array_elements(pg_temp.ar_read(1)->'units'->0->'entries') e where e->>'id'='27500000-0000-4000-8000-000000000081'),'last use is actual read/propose event');
-- Native audit insertion failure rolls back credential and token event writes.
create function pg_temp.ar_fail_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end;$$;
create trigger ar_fail before insert on public.customer_mapping_audit for each row execute function pg_temp.ar_fail_audit();
select pg_temp.ar_expect('select pg_temp.ar_revoke(2,''agent_token'',81)','audit unavailable');
select pg_temp.ar_assert(public.access_review_token_live('27500000-0000-4000-8000-000000000081') and not exists(select 1 from public.workspace_agent_access_events where event_key='revoked:27500000-0000-4000-8000-000000000081'),'failed receipt leaves token usable and event absent');
drop trigger ar_fail on public.customer_mapping_audit;
select pg_temp.ar_assert(pg_temp.ar_revoke(2,'agent_token',81)->>'changed'='true','admin can revoke another issuer credential');
select pg_temp.ar_assert(pg_temp.ar_revoke(2,'agent_token',81)->>'changed'='false','retry is no-op');
select pg_temp.ar_assert((select count(*)=1 from public.customer_mapping_audit where record_type='agent_token' and record_id='27500000-0000-4000-8000-000000000081'),'exactly one audit receipt');
select pg_temp.ar_assert((select payload->'grants'->0->>'status'='active' from public.workspace_work_participation where work_id='27500000-0000-4000-8000-000000000051'),'credential revoke preserves shared grant');
select pg_temp.ar_assert(pg_temp.ar_revoke(2,'delegation',61)->>'changed'='true','admin delegation revoke');
select pg_temp.ar_assert((select count(distinct e->>'kind')=7 from jsonb_array_elements(pg_temp.ar_read(1)->'units'->0->'entries') e),'all seven access categories');
select pg_temp.ar_expect('select pg_temp.ar_revoke(2,''operational_assignment'',62)','access_review_denied');
select pg_temp.ar_assert(pg_temp.ar_revoke(1,'operational_assignment',62)->>'changed'='true','owner assignment revoke');
select pg_temp.ar_assert(pg_temp.ar_revoke(1,'agency_assignment',66)->>'changed'='true','owner agency staff revoke');
select pg_temp.ar_assert(pg_temp.ar_revoke(1,'provider_seat',65,42,true)->>'changed'='true','unit owner can revoke seat from organization review');
savepoint notice_policy;
insert into public.provider_change_policy values('ar-policy',86400,'27500000-0000-4000-8000-000000000001',now());
select pg_temp.ar_expect('select pg_temp.ar_revoke(1,''provider'',63)','provider_change_completion_required');
select pg_temp.ar_assert((select not (e->>'canRevoke')::boolean from jsonb_array_elements(pg_temp.ar_read(1)->'units'->0->'entries') e where e->>'kind'='provider'),'provider notice reflected in review');
rollback to savepoint notice_policy;
savepoint no_notice_policy;
-- This isolated full-schema fixture retains unrelated approved notice policy.
-- Rehearse the pre-policy path inside a savepoint; restore all baseline rows.
truncate public.provider_change_policy cascade;
select pg_temp.ar_assert(pg_temp.ar_revoke(1,'provider',63)->>'changed'='true','provider of record end uses native owner protocol');
select pg_temp.ar_assert((select status='ended' from public.provider_seats where id='27500000-0000-4000-8000-000000000064'),'provider end also ends related seat');
select pg_temp.ar_assert((select count(*)=1 from public.customer_mapping_audit where record_type='provider' and record_id='27500000-0000-4000-8000-000000000063'),'provider end audit committed with change');
rollback to savepoint no_notice_policy;
-- Losing issuer membership or grant scope immediately excludes remaining token.
update public.workspace_work_participation set payload=jsonb_set(payload,'{grants,0,scope}','["propose"]') where work_id='27500000-0000-4000-8000-000000000051';
select pg_temp.ar_assert(not public.access_review_token_live('27500000-0000-4000-8000-000000000087'),'native scope withdrawn');
update public.workspace_work_participation set payload=jsonb_set(payload,'{grants,0,scope}','["read","propose"]') where work_id='27500000-0000-4000-8000-000000000051';
select pg_temp.ar_assert(pg_temp.ar_revoke(1,'member',3)->>'changed'='true','member removal committed');
select pg_temp.ar_assert(not public.access_review_token_live('27500000-0000-4000-8000-000000000087'),'member removal invalidates token on next read');
-- Restore member for the real two-session race fixture.
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000003','member','27500000-0000-4000-8000-000000000001');
\if :{?keep_fixture}
commit;
\else
rollback;
\endif
