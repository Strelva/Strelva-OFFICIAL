\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.qassert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'provider queue: %',msg; end if; end $$;
create or replace function pg_temp.qdenied(statement text,expected text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'provider queue expected denial: %',expected;
end $$;
insert into public.users(id,email,verified_at) values
 ('25700000-0000-4000-8000-000000000001','owner@queue.example.test',now()),
 ('25700000-0000-4000-8000-000000000002','staff@queue.example.test',now()),
 ('25700000-0000-4000-8000-000000000003','other@queue.example.test',now()),
 ('25700000-0000-4000-8000-000000000004','unstaffed@queue.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('25700000-0000-4000-8000-000000000010','customer','Queue client','25700000-0000-4000-8000-000000000001'),
 ('25700000-0000-4000-8000-000000000011','customer','Other queue client','25700000-0000-4000-8000-000000000001'),
 ('25700000-0000-4000-8000-000000000020','agency','Queue agency','25700000-0000-4000-8000-000000000002'),
 ('25700000-0000-4000-8000-000000000030','agency','Other agency','25700000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000001','owner','25700000-0000-4000-8000-000000000001'),
 ('25700000-0000-4000-8000-000000000011','25700000-0000-4000-8000-000000000001','owner','25700000-0000-4000-8000-000000000001'),
 ('25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000002','owner','25700000-0000-4000-8000-000000000002'),
 ('25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000004','member','25700000-0000-4000-8000-000000000002'),
 ('25700000-0000-4000-8000-000000000030','25700000-0000-4000-8000-000000000003','owner','25700000-0000-4000-8000-000000000003');
select public.choose_business_provider('25700000-0000-4000-8000-000000000001','owner@queue.example.test','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000020');
select public.choose_business_provider('25700000-0000-4000-8000-000000000001','owner@queue.example.test','25700000-0000-4000-8000-000000000011','25700000-0000-4000-8000-000000000030');
select public.set_agency_client_staff('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002',true);
insert into public.google_listing_receipts(workspace_id,location_id,action,authority,status,readback,idempotency_key,error,provider_ref) values
 ('25700000-0000-4000-8000-000000000010','queue-location','hours_patch','{"kind":"operator_instruction"}','posted_unverified','failed','queue-listing-failed','private-owner@example.test token-secret','private-provider-secret'),
 ('25700000-0000-4000-8000-000000000010','queue-location','info_patch','{"kind":"operator_instruction"}','posted_unverified','differs','queue-listing-differs',null,null),
 ('25700000-0000-4000-8000-000000000010','queue-location','hours_patch','{"kind":"operator_instruction"}','posted','matched','queue-listing-matched',null,null),
 ('25700000-0000-4000-8000-000000000011','queue-location','hours_patch','{"kind":"operator_instruction"}','posted_unverified','failed','queue-listing-other',null,null);
insert into public.outside_write_receipts(command_key,workspace_id,provider,write_kind,subject,request,acceptance,accepted_at,readback,readback_at,undo,undo_label,actor) values
 ('queue-content-failure','25700000-0000-4000-8000-000000000010','strelva_content','content_publish','Secret subject','{"token":"private-secret"}','accepted',now(),'failed',now(),'put_back_draft','Undo','private-owner@example.test');
-- Created by an agency person, owned by the customer business.
insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by) values
 ('25700000-0000-4000-8000-0000000000bb','25700000-0000-4000-8000-000000000010','Client website','website','25700000-0000-4000-8000-0000000000bb',repeat('a',64),'25700000-0000-4000-8000-000000000002','25700000-0000-4000-8000-000000000002'),
 ('25700000-0000-4000-8000-0000000000cc','25700000-0000-4000-8000-000000000011','Foreign website','website','25700000-0000-4000-8000-0000000000cc',repeat('b',64),'25700000-0000-4000-8000-000000000002','25700000-0000-4000-8000-000000000002');
insert into public.service_requests(id,business_workspace_id,status,request_text,outcome,context,scope,provider_kind,created_by) values
 ('25700000-0000-4000-8000-0000000000a1','25700000-0000-4000-8000-000000000010','requested','Website work','Website update','{"source":"website_change","systemId":"25700000-0000-4000-8000-0000000000bb"}',array['website.repo_change'],'strelva','25700000-0000-4000-8000-000000000001');
insert into public.website_change_receipts(workspace_id,request_id,system_id,kind,commit_sha,deployment_url,read_back,recorded_by,note) values
 ('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-0000000000a1','25700000-0000-4000-8000-0000000000bb','deployed','abcdef1','https://private.example.test/','not_confirmed','25700000-0000-4000-8000-000000000002','private-owner@example.test token-secret');
insert into public.owner_decisions(workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,sign_in_required,expires_at) values
 ('25700000-0000-4000-8000-000000000010','system.go_live','owner_decides','Review the website','Publish','Leave draft','queue_fixture','queue-1',repeat('a',64),false,now()+interval '7 days'),
 ('25700000-0000-4000-8000-000000000011','system.go_live','owner_decides','Other owner decision','Publish','Leave draft','queue_fixture','queue-2',repeat('b',64),false,now()+interval '7 days');
insert into public.owner_decisions(workspace_id,system_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,sign_in_required,expires_at) values
 ('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-0000000000cc','system.go_live','owner_decides','Foreign system decision','Publish','Leave draft','queue_fixture','queue-foreign',repeat('c',64),false,now()+interval '7 days'),
 ('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-0000000000dd','system.go_live','owner_decides','Missing system decision','Publish','Leave draft','queue_fixture','queue-missing',repeat('d',64),false,now()+interval '7 days');
insert into public.owner_decisions(workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,sign_in_required,expires_at,state,decided_at,delivery_state) values
 ('25700000-0000-4000-8000-000000000010','system.go_live','owner_decides','Suppressed owner decision','Publish','Leave draft','queue_fixture','queue-suppressed',repeat('e',64),false,now()+interval '7 days','open',null,'suppressed'),
 ('25700000-0000-4000-8000-000000000010','system.go_live','owner_decides','Bounced owner decision','Publish','Leave draft','queue_fixture','queue-bounced',repeat('f',64),false,now()+interval '7 days','open',null,'bounced'),
 ('25700000-0000-4000-8000-000000000010','system.go_live','owner_decides','Recent expired owner decision','Publish','Leave draft','queue_fixture','queue-expired',repeat('1',64),false,now()+interval '7 days','expired',now()-interval '1 day','not_sent'),
 ('25700000-0000-4000-8000-000000000010','system.go_live','owner_decides','Old expired owner decision','Publish','Leave draft','queue_fixture','queue-old',repeat('2',64),false,now()+interval '7 days','expired',now()-interval '31 days','not_sent'),
 ('25700000-0000-4000-8000-000000000010','system.go_live','owner_decides','Sent owner decision','Publish','Leave draft','queue_fixture','queue-sent',repeat('3',64),false,now()+interval '7 days','open',null,'sent');
create or replace function pg_temp.queue(cap integer default 50,after_at timestamptz default null,after_key text default null) returns jsonb language sql stable as $$
 select public.read_provider_client_queue('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020',after_at,after_key,cap)
$$;
select pg_temp.qassert(not has_function_privilege('authenticated','public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)','execute')
 and has_function_privilege('service_role','public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)','execute'),'service-only ACL');
select pg_temp.qassert(jsonb_array_length(pg_temp.queue()->'items')=8,'own staffed client readbacks and owner-not-told, matched excluded');
select pg_temp.qassert(pg_temp.queue()::text not like '%private-%' and pg_temp.queue()::text not like '%token-secret%' and pg_temp.queue()::text not like '%Secret subject%','private receipt data absent');
select pg_temp.qassert(pg_temp.queue()::text not like '%Foreign system decision%' and pg_temp.queue()::text not like '%Missing system decision%','exact business ownership guards named systems');
select pg_temp.qassert(jsonb_array_length(pg_temp.queue(1)->'items')=1 and pg_temp.queue(1)->'nextCursor'<>'null'::jsonb,'bounded first page');
select pg_temp.qassert(jsonb_array_length(pg_temp.queue(50,(pg_temp.queue(1)->'nextCursor'->>'at')::timestamptz,pg_temp.queue(1)->'nextCursor'->>'key')->'items')=7,'cursor does not repeat or skip');
select pg_temp.qassert(jsonb_array_length(public.read_provider_client_queue('25700000-0000-4000-8000-000000000004','unstaffed@queue.example.test','25700000-0000-4000-8000-000000000020')->'items')=0,'unstaffed agency member sees no clients');
select pg_temp.qdenied($q$select public.read_provider_client_queue('25700000-0000-4000-8000-000000000003','other@queue.example.test','25700000-0000-4000-8000-000000000020')$q$,'provider_queue_access_denied');
select pg_temp.qdenied($q$select public.read_provider_client_queue('25700000-0000-4000-8000-000000000002','wrong@queue.example.test','25700000-0000-4000-8000-000000000020')$q$,'provider_queue_access_denied');
select pg_temp.qdenied($q$select pg_temp.queue(50,now(),null)$q$,'provider_queue_cursor_invalid');
-- Every paginated read rechecks the current seat/staff grant.
select public.set_agency_client_staff('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002',false);
select pg_temp.qassert(jsonb_array_length(pg_temp.queue()->'items')=0,'removed staff is invisible on the next read');
select public.set_agency_client_staff('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002',true);
update public.users set verified_at=null where id='25700000-0000-4000-8000-000000000002';
select pg_temp.qdenied($q$select pg_temp.queue()$q$,'provider_queue_access_denied');
update public.users set verified_at=now() where id='25700000-0000-4000-8000-000000000002';
-- Membership loss removes the agency view even when the staff history remains.
delete from public.workspace_memberships where workspace_id='25700000-0000-4000-8000-000000000020' and user_id='25700000-0000-4000-8000-000000000002';
select pg_temp.qdenied($q$select pg_temp.queue()$q$,'provider_queue_access_denied');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000002','owner','25700000-0000-4000-8000-000000000002');
select pg_temp.qassert(jsonb_array_length(pg_temp.queue()->'items')=0,'rejoining does not silently restore staff');
select public.set_agency_client_staff('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002',true);
savepoint seat_revoke;
select public.end_business_provider('25700000-0000-4000-8000-000000000001','owner@queue.example.test','25700000-0000-4000-8000-000000000010','Fixture revoked seat.');
select pg_temp.qassert(jsonb_array_length(pg_temp.queue()->'items')=0,'ending provider seat removes both lists');
rollback to seat_revoke;
-- A completed exit may retain seats/staff until provider cleanup succeeds.
-- Visibility must obey completed exit independently of that cleanup.
savepoint completed_exit;
insert into public.workspace_exit_requests(workspace_id,requested_by,idempotency_key,command_digest,future_work,provider_participation,maintained_resource_action,state,completed_at) values
 ('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000001','queue-exit-fixture',repeat('a',64),'cancel','revoke','stop','{"status":"completed"}',now());
select pg_temp.qassert(exists(select 1 from public.provider_seats where customer_workspace_id='25700000-0000-4000-8000-000000000010' and status='active') and exists(select 1 from public.agency_client_staff where customer_workspace_id='25700000-0000-4000-8000-000000000010' and status='active'),'completed-exit fixture deliberately retains grant cleanup gap');
select pg_temp.qassert(jsonb_array_length(pg_temp.queue()->'items')=0,'completed exit with retained seat/staff hides both lists');
rollback to completed_exit;
-- Native actual READ ONLY execution under the service role; no writer locks.
commit;
begin read only;
set local role service_role;
select public.read_provider_client_queue('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020');
reset role;
rollback;
\echo 'Provider client queue scope, privacy, pagination and READ ONLY passed.'
