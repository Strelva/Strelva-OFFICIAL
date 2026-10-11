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
insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by) values
 ('25700000-0000-4000-8000-0000000000bb','25700000-0000-4000-8000-000000000010','Client website','website','25700000-0000-4000-8000-0000000000bb',repeat('a',64),'25700000-0000-4000-8000-000000000002','25700000-0000-4000-8000-000000000002');
insert into public.owner_decisions(id,workspace_id,system_id,change_kind,route,title,detail,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,sign_in_required,expires_at) values
 ('25700000-0000-4000-8000-000000000041','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-0000000000bb','system.go_live','owner_decides','Make the client website live','private-owner@example.test','Private approval effect','Private refusal effect','system_release','fixture-release',repeat('c',64),false,now()+interval '1 day'),
 ('25700000-0000-4000-8000-000000000042','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-0000000000bb','money','owner_decides','Private payer decision',null,'Charge','Wait','billing','fixture-billing',repeat('d',64),true,now()+interval '1 day');
insert into public.service_requests(id,business_workspace_id,status,request_text,outcome,context,scope,provider_kind,provider_agency_workspace_id,created_by) values
 ('25700000-0000-4000-8000-0000000000a1','25700000-0000-4000-8000-000000000010','requested','Private request body','Website update','{"private":"Private sensitive context"}',array['website.repo_change'],'agency','25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000001');
insert into public.google_listing_receipts(workspace_id,location_id,action,authority,status,readback,idempotency_key,error,provider_ref) values
 ('25700000-0000-4000-8000-000000000010','fixture-location','hours_patch','{"kind":"operator_instruction"}','posted_unverified','failed','fixture-home-check','Private diagnostic','Private provider reference');
-- Fictional fixtures are committed solely to exercise real READ ONLY transactions.
-- The owned runner destroys this entire local cluster on every exit.
commit;
begin read only;
set local role service_role;
do $$ declare home jsonb; overview jsonb; names jsonb; item jsonb; delivery_queue jsonb;
begin
 home:=public.read_agency_client_home('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002','staff@queue.example.test');
 if jsonb_array_length(home->'decisions')<>1 or home->'decisions'->0->>'id'<>'25700000-0000-4000-8000-000000000041' then raise exception 'shared decision scope mismatch'; end if;
 if jsonb_array_length(home->'deliveries')<>1 or home->'deliveries'->0->>'servingAgencyName'<>'Queue agency' then raise exception 'serving agency missing'; end if;
 if home::text like '%Private%' or home::text like '%private-owner%' or home::text like '%'||repeat('c',64)||'%' then raise exception 'sensitive metadata leaked'; end if;
 if jsonb_array_length(home->'deliveryChecks')<>1 then raise exception 'specific delivery check missing'; end if;
 delivery_queue:=public.read_provider_client_queue_v2('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020');
 if jsonb_array_length(delivery_queue->'items')<>2 or delivery_queue::text like '%Private%' then raise exception 'delivery queue exposes private owner-only decision'; end if;
 overview:=public.agency_client_overview_v3('25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000002','staff@queue.example.test',null,1);
 if overview->'clients'->0->>'canBuild'<>'true' then raise exception 'ordinary staffed owner cannot build'; end if;
 select value into item from jsonb_array_elements(overview->'queue') where value->>'kind'='needs_you';
 if item->>'title'<>home->'decisions'->0->>'title' or item->>'href' not like '%decision=25700000-0000-4000-8000-000000000041' then raise exception 'decision link lost identity'; end if;
 names:=public.read_service_request_agency_names('25700000-0000-4000-8000-000000000001','owner@queue.example.test',array['25700000-0000-4000-8000-0000000000a1']::uuid[]);
 if names->0->>'displayName'<>'Queue agency' then raise exception 'owner needs agency membership for actor name'; end if;
end $$;
rollback;
begin;
select public.set_agency_client_staff('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002',false);
select pg_temp.qdenied($q$select public.read_agency_client_home('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002','staff@queue.example.test')$q$,'access_denied');
select pg_temp.qdenied($q$select public.read_agency_client_home('25700000-0000-4000-8000-000000000011','25700000-0000-4000-8000-000000000002','staff@queue.example.test')$q$,'access_denied');
select pg_temp.qdenied($q$select public.read_agency_client_home('25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000001','wrong@example.test')$q$,'access_denied');
select pg_temp.qassert(not has_function_privilege('anon','public.read_agency_client_home(uuid,uuid,text)','execute'),'anon cannot call supplied-actor read');
select pg_temp.qassert(not has_function_privilege('authenticated','public.read_service_request_agency_names(uuid,text,uuid[])','execute'),'browser cannot supply actor');
rollback;
