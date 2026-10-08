\set ON_ERROR_STOP on
begin;
create function pg_temp.wnf_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'website native fact assertion: %',message; end if; end $$;
create function pg_temp.wnf_expect(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not like expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
  end;
  raise exception 'statement unexpectedly succeeded';
end $$;
insert into public.users(id,email,verified_at) values
 ('7e000000-0000-4000-8000-000000000001','native-owner@example.test',now()),
 ('7e000000-0000-4000-8000-000000000002','native-member@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('7e000000-0000-4000-8000-000000000010','customer','Native fact fixture','7e000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('7e000000-0000-4000-8000-000000000010','7e000000-0000-4000-8000-000000000001','owner','7e000000-0000-4000-8000-000000000001'),
 ('7e000000-0000-4000-8000-000000000010','7e000000-0000-4000-8000-000000000002','member','7e000000-0000-4000-8000-000000000001');
insert into public.tenants(id,site_name,delivery_model,stable_id) values('native-fact-fixture','Native fact fixture','custom_repo','7e000000-0000-4000-8000-000000000020');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('7e000000-0000-4000-8000-000000000020','native-fact-fixture','7e000000-0000-4000-8000-000000000010','7e000000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000030',repeat('a',64),'{}');
insert into public.business_records(workspace_id,revision,created_by,updated_by) values('7e000000-0000-4000-8000-000000000010',1,'7e000000-0000-4000-8000-000000000001','7e000000-0000-4000-8000-000000000001');
do $$
declare ws uuid:='7e000000-0000-4000-8000-000000000010'; actor uuid:='7e000000-0000-4000-8000-000000000001'; token uuid:=gen_random_uuid(); next_token uuid:=gen_random_uuid(); result jsonb;
begin
 perform pg_temp.wnf_assert(public.claim_native_website_fact_review(ws,actor,'native-owner@example.test','native-fact-fixture',0,gen_random_uuid())=false,'stale revision dispatch denied');
 perform pg_temp.wnf_assert(public.claim_native_website_fact_review(ws,actor,'native-owner@example.test','native-fact-fixture',1,token),'first exact revision claimed');
 perform pg_temp.wnf_assert(not public.claim_native_website_fact_review(ws,actor,'native-owner@example.test','native-fact-fixture',1,gen_random_uuid()),'same revision cannot dispatch twice');
 update public.business_records set revision=2 where workspace_id=ws;
 perform pg_temp.wnf_assert(not public.claim_native_website_fact_review(ws,actor,'native-owner@example.test','native-fact-fixture',2,next_token),'another revision cannot dispatch concurrently');
 result:=public.record_native_website_fact_review(token,'queued','evt_native_fixture');
 perform pg_temp.wnf_assert(result->>'status'='queued','accepted review receipt retained');
 perform pg_temp.wnf_assert(public.record_native_website_fact_review(token,'queued','evt_native_fixture')=result,'receipt replay immutable');
 perform pg_temp.wnf_expect(format('select public.record_native_website_fact_review(%L,''unconfirmed'',null)',token),'%website_fact_review_closed%');
 perform pg_temp.wnf_assert(public.claim_native_website_fact_review(ws,actor,'native-owner@example.test','native-fact-fixture',2,next_token),'later revision separately claimable');
 perform public.record_native_website_fact_review(next_token,'unconfirmed',null);
 perform pg_temp.wnf_assert(not public.claim_native_website_fact_review(ws,actor,'native-owner@example.test','native-fact-fixture',2,gen_random_uuid()),'unknown dispatch never replayed');
 update public.business_records set revision=3 where workspace_id=ws;
 perform pg_temp.wnf_assert(not public.claim_native_website_fact_review(ws,actor,'native-owner@example.test','native-fact-fixture',3,gen_random_uuid()),'unknown dispatch blocks later revision until operator inspection');
 perform pg_temp.wnf_expect(format('select public.claim_native_website_fact_review(%L,%L,''native-member@example.test'',''native-fact-fixture'',2,gen_random_uuid())',ws,'7e000000-0000-4000-8000-000000000002'),'%business_record_access_denied%');
 perform pg_temp.wnf_expect(format('select public.claim_native_website_fact_review(%L,%L,''wrong@example.test'',''native-fact-fixture'',2,gen_random_uuid())',ws,actor),'%business_record_access_denied%');
 perform pg_temp.wnf_expect(format('select public.claim_native_website_fact_review(%L,%L,''native-owner@example.test'',''another-tenant'',3,gen_random_uuid())',ws,actor),'%business_record_access_denied%');
 update public.tenants set id='native-fact-renamed' where stable_id='7e000000-0000-4000-8000-000000000020';
 perform pg_temp.wnf_assert(not public.claim_native_website_fact_review(ws,actor,'native-owner@example.test','native-fact-renamed',3,gen_random_uuid()),'slug rename keeps stable dispatch block');
 perform pg_temp.wnf_assert((select count(*) from public.website_native_fact_reviews where workspace_id=ws)=2,'only two distinct revisions');
end $$;
select pg_temp.wnf_assert(not has_function_privilege('authenticated','public.claim_native_website_fact_review(uuid,uuid,text,text,bigint,uuid)','EXECUTE')
 and not has_table_privilege('service_role','public.website_native_fact_reviews','INSERT'),'server-only RPC; no direct ledger access');
rollback;
\echo 'Website native fact review checks passed.'
