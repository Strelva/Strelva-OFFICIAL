\set ON_ERROR_STOP on
-- #271. Fictional rows, rolled back. No super_admin or client membership for
-- either agency actor; the current provider + seat + staff are the only access.
begin;
create function pg_temp.pa_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'provider health: %',message; end if; end $$;
create function pg_temp.pa_error(statement text) returns text language plpgsql as $$
begin execute statement; return 'no error'; exception when others then return sqlerrm; end $$;
select format('grant usage on schema %I to service_role, anon, authenticated',nspname) from pg_namespace where oid=pg_my_temp_schema() \gexec
insert into public.users(id,email,verified_at) values
 ('27100000-0000-4000-8000-000000000001','pa-owner@example.test',now()),
 ('27100000-0000-4000-8000-000000000002','pa-agency@example.test',now()),
 ('27100000-0000-4000-8000-000000000003','pa-other@example.test',now()),
 ('27100000-0000-4000-8000-000000000004','pa-unstaffed@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('27100000-0000-4000-8000-000000000010','customer','Alert client','27100000-0000-4000-8000-000000000001'),
 ('27100000-0000-4000-8000-000000000020','agency','Agency A','27100000-0000-4000-8000-000000000002'),
 ('27100000-0000-4000-8000-000000000030','agency','Agency B','27100000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('27100000-0000-4000-8000-000000000010','27100000-0000-4000-8000-000000000001','owner','27100000-0000-4000-8000-000000000001'),
 ('27100000-0000-4000-8000-000000000020','27100000-0000-4000-8000-000000000002','owner','27100000-0000-4000-8000-000000000002'),
 ('27100000-0000-4000-8000-000000000020','27100000-0000-4000-8000-000000000004','member','27100000-0000-4000-8000-000000000002'),
 ('27100000-0000-4000-8000-000000000030','27100000-0000-4000-8000-000000000003','owner','27100000-0000-4000-8000-000000000003');
select public.choose_business_provider('27100000-0000-4000-8000-000000000001','pa-owner@example.test','27100000-0000-4000-8000-000000000010','27100000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('27100000-0000-4000-8000-000000000002','pa-agency@example.test','27100000-0000-4000-8000-000000000020','27100000-0000-4000-8000-000000000010','27100000-0000-4000-8000-000000000002',true);
insert into public.google_listing_receipts(workspace_id,location_id,action,status,authority,readback,idempotency_key,error,after_state) values
 ('27100000-0000-4000-8000-000000000010','fixture','reply_post','posted_unverified','{"kind":"owner_approval"}','failed','provider-alert-fixture','SECRET_ERROR','{"secret":"SECRET_CONTENT"}');
insert into public.systems(id,business_workspace_id,name,kind,lifecycle,current_revision_id,current_revision_number,command_id,command_digest,created_by,updated_by) values
 ('27100000-0000-4000-8000-000000000050','27100000-0000-4000-8000-000000000010','Bookings','booking','live','27100000-0000-4000-8000-000000000051',1,gen_random_uuid(),repeat('a',64),'27100000-0000-4000-8000-000000000001','27100000-0000-4000-8000-000000000001');
insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by) values
 ('27100000-0000-4000-8000-000000000051','27100000-0000-4000-8000-000000000050','27100000-0000-4000-8000-000000000010',1,'{"kind":"booking","ref":"fixture"}',gen_random_uuid(),repeat('b',64),'27100000-0000-4000-8000-000000000001');
insert into public.workspace_calendar_connections(workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by,last_error,access_token_ciphertext) values
 ('27100000-0000-4000-8000-000000000010','google','fixture','Fixture calendar','America/New_York','error','27100000-0000-4000-8000-000000000001','SECRET_ERROR','SECRET_TOKEN');
-- Current publication is authoritative. Old healthy evidence must not certify
-- a new revision; an unpublished old failure must not remain a current alert.
do $$
declare i integer; work_id uuid; system_id uuid; revision_id uuid;
begin
 for i in 1..3 loop
  work_id:=('27100000-0000-4000-8000-'||lpad((60+i)::text,12,'0'))::uuid;
  system_id:=public.system_origin_id('27100000-0000-4000-8000-000000000010','saved_work',work_id::text);
  revision_id:=gen_random_uuid();
  insert into public.tenants(id,site_name) values('pa-hosted-'||i,'Hosted fixture '||i);
  insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
   (work_id,'27100000-0000-4000-8000-000000000010','websites','website_rebuild','Hosted fixture '||i,'{}','27100000-0000-4000-8000-000000000001');
  insert into public.systems(id,business_workspace_id,name,kind,lifecycle,origin_kind,origin_ref,current_revision_id,current_revision_number,command_id,command_digest,created_by,updated_by) values
   (system_id,'27100000-0000-4000-8000-000000000010','Hosted fixture '||i,'website','live','saved_work',work_id::text,revision_id,1,gen_random_uuid(),repeat('a',64),'27100000-0000-4000-8000-000000000001','27100000-0000-4000-8000-000000000001');
  insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by) values
   (revision_id,system_id,'27100000-0000-4000-8000-000000000010',1,jsonb_build_object('kind','website_document','ref',work_id::text||'@1'),gen_random_uuid(),repeat('a',64),'27100000-0000-4000-8000-000000000001');
  insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values
   ('27100000-0000-4000-8000-000000000010',work_id,1,repeat('a',64),'{"version":2}','27100000-0000-4000-8000-000000000001');
  insert into public.website_document_health(workspace_id,website_work_id,revision,content_hash,checked_at,status) values
   ('27100000-0000-4000-8000-000000000010',work_id,1,repeat('a',64),case when i=3 then now()-interval '60 hours' else now()-interval '30 minutes' end,case when i=2 then 'hash_mismatch' else 'healthy' end);
  if i=1 then
   insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values
    ('27100000-0000-4000-8000-000000000010',work_id,2,repeat('b',64),'{"version":2}','27100000-0000-4000-8000-000000000001');
  end if;
  if i<>2 then
   insert into public.website_document_publications(tenant_id,workspace_id,website_work_id,revision,content_hash,receipt,published_at) values
    ('pa-hosted-'||i,'27100000-0000-4000-8000-000000000010',work_id,case when i=1 then 2 else 1 end,repeat(case when i=1 then 'b' else 'a' end,64),'{}',case when i=3 then now()-interval '70 hours' else now()-interval '1 hour' end);
  end if;
 end loop;
end $$;
create function pg_temp.pa_read(actor uuid,email text,agency uuid default '27100000-0000-4000-8000-000000000020') returns jsonb language sql as $$
 select public.read_provider_health_alerts(agency,actor,email,array['27100000-0000-4000-8000-000000000010'::uuid]); $$;
select pg_temp.pa_assert(has_function_privilege('service_role','public.read_provider_health_alerts(uuid,uuid,text,uuid[])','execute')
 and not has_function_privilege('anon','public.read_provider_health_alerts(uuid,uuid,text,uuid[])','execute')
 and not has_function_privilege('authenticated','public.read_provider_health_alerts(uuid,uuid,text,uuid[])','execute'),'only service transport');
set local role service_role;
select pg_temp.pa_assert(jsonb_array_length(pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')->'alerts')=4,'ordinary current provider gets listing/calendar and missing/stale current publication alerts');
select pg_temp.pa_assert((select count(*) from jsonb_array_elements(pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')->'alerts') a where a->>'gap' is not null)=2,'missing and stale evidence explicitly incomplete');
select pg_temp.pa_assert(not exists(select 1 from jsonb_array_elements(pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')->'alerts') a where a->>'id'='hosted:27100000-0000-4000-8000-000000000062'),'unpublished failure is not current');
select pg_temp.pa_assert(pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')::text not like '%SECRET%','no customer contents/provider errors');
select pg_temp.pa_assert(jsonb_array_length(pg_temp.pa_read('27100000-0000-4000-8000-000000000003','pa-other@example.test','27100000-0000-4000-8000-000000000030')->'alerts')=0,'other agency gets nothing');
select pg_temp.pa_assert(jsonb_array_length(pg_temp.pa_read('27100000-0000-4000-8000-000000000004','pa-unstaffed@example.test')->'alerts')=0,'unassigned agency member gets nothing');
select pg_temp.pa_assert(pg_temp.pa_error($q$select pg_temp.pa_read('27100000-0000-4000-8000-000000000002','wrong@example.test')$q$)='business_record_access_denied','verified email mismatch refused');
reset role;
update public.users set verified_at=null where id='27100000-0000-4000-8000-000000000002';
select pg_temp.pa_assert(pg_temp.pa_error($q$select pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')$q$)='business_record_access_denied','unverified actor refused');
update public.users set verified_at=now() where id='27100000-0000-4000-8000-000000000002';
select public.set_agency_client_staff('27100000-0000-4000-8000-000000000002','pa-agency@example.test','27100000-0000-4000-8000-000000000020','27100000-0000-4000-8000-000000000010','27100000-0000-4000-8000-000000000002',false);
select pg_temp.pa_assert(jsonb_array_length(pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')->'alerts')=0,'staff revocation immediately removes alert');
select public.set_agency_client_staff('27100000-0000-4000-8000-000000000002','pa-agency@example.test','27100000-0000-4000-8000-000000000020','27100000-0000-4000-8000-000000000010','27100000-0000-4000-8000-000000000002',true);
select public.end_business_provider('27100000-0000-4000-8000-000000000001','pa-owner@example.test','27100000-0000-4000-8000-000000000010','Fixture ended');
select pg_temp.pa_assert(jsonb_array_length(pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')->'alerts')=0,'ended provider loses receipt and cached-evidence scope');
select pg_temp.pa_assert((select count(*) from public.google_listing_receipts where workspace_id='27100000-0000-4000-8000-000000000010')=1,'queue reads did not retry or mutate receipt');
set local role anon;
select pg_temp.pa_assert(pg_temp.pa_error($q$select pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')$q$) like '%permission denied%','anonymous caller cannot invoke reader');
reset role;
-- Restore a current staffed provider before the final phase. PostgreSQL does
-- not allow returning to read-write after a read-only query, so actual
-- PostgREST-style read-only assertions stay last and roll back the whole job.
select public.choose_business_provider('27100000-0000-4000-8000-000000000001','pa-owner@example.test','27100000-0000-4000-8000-000000000010','27100000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('27100000-0000-4000-8000-000000000002','pa-agency@example.test','27100000-0000-4000-8000-000000000020','27100000-0000-4000-8000-000000000010','27100000-0000-4000-8000-000000000002',true);
set local role service_role;
set local transaction_read_only = on;
select pg_temp.pa_assert(current_setting('transaction_read_only')='on','real read-only transaction');
select pg_temp.pa_assert(jsonb_array_length(pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')->'alerts')=4,'read-only current provider receives active sanitized payload');
select pg_temp.pa_assert(pg_temp.pa_read('27100000-0000-4000-8000-000000000002','pa-agency@example.test')::text not like '%SECRET%','read-only payload excludes secrets');
rollback;
