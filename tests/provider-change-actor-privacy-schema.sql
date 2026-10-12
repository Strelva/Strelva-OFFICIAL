\set ON_ERROR_STOP on
-- Real inherited authority and native transitions; fictional data rolls back.
-- Request identity has no approved action-time display name. Contact emails,
-- including a later changed contact, must not become requester presentation.
begin;
create function pg_temp.privacy_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'provider requester privacy: %',label; end if; end $$;
create function pg_temp.privacy_denied(q text) returns void language plpgsql as $$
begin
 begin execute q;
 exception when others then
  if sqlstate='P0001' and sqlerrm='connect_denied' then return; end if;
  raise exception 'Expected connect_denied, got % %',sqlstate,sqlerrm;
 end;
 raise exception 'Expected connect_denied but read succeeded';
end $$;
insert into public.users(id,email,verified_at) values
 ('ce113000-0000-4000-8000-000000000001','requester-private-canary@example.test',now()),
 ('ce113000-0000-4000-8000-000000000002','outgoing-private-canary@example.test',now()),
 ('ce113000-0000-4000-8000-000000000003','unrelated-private-canary@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ce113000-0000-4000-8000-000000000010','customer','Privacy business','ce113000-0000-4000-8000-000000000001'),
 ('ce113000-0000-4000-8000-000000000020','agency','Privacy outgoing agency','ce113000-0000-4000-8000-000000000002'),
 ('ce113000-0000-4000-8000-000000000021','agency','Privacy incoming agency','ce113000-0000-4000-8000-000000000003'),
 ('ce113000-0000-4000-8000-000000000022','agency','Privacy unrelated agency','ce113000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ce113000-0000-4000-8000-000000000010','ce113000-0000-4000-8000-000000000001','owner','ce113000-0000-4000-8000-000000000001'),
 ('ce113000-0000-4000-8000-000000000020','ce113000-0000-4000-8000-000000000002','owner','ce113000-0000-4000-8000-000000000002'),
 ('ce113000-0000-4000-8000-000000000021','ce113000-0000-4000-8000-000000000003','owner','ce113000-0000-4000-8000-000000000003'),
 ('ce113000-0000-4000-8000-000000000022','ce113000-0000-4000-8000-000000000003','owner','ce113000-0000-4000-8000-000000000003');
select public.choose_business_provider('ce113000-0000-4000-8000-000000000001','requester-private-canary@example.test','ce113000-0000-4000-8000-000000000010','ce113000-0000-4000-8000-000000000020');
create temp table privacy_first as select public.request_provider_change('ce113000-0000-4000-8000-000000000010','ce113000-0000-4000-8000-000000000001','requester-private-canary@example.test','ce113000-0000-4000-8000-000000000021','privacy-request-first') body;
select public.cancel_provider_change((select (body->>'id')::uuid from privacy_first),'ce113000-0000-4000-8000-000000000001','requester-private-canary@example.test');
create temp table privacy_second as select public.request_provider_change('ce113000-0000-4000-8000-000000000010','ce113000-0000-4000-8000-000000000001','requester-private-canary@example.test','ce113000-0000-4000-8000-000000000021','privacy-request-second') body;
-- Distinct historical timestamps make the order observable rather than relying
-- on transaction-stable now() and random request IDs.
update public.provider_change_requests set requested_at=requested_at-interval '1 day' where id=(select (body->>'id')::uuid from privacy_first);
do $$
declare owner_rows jsonb; agency_rows jsonb; original_rows jsonb;
begin
 owner_rows:=public.read_provider_change_requests('ce113000-0000-4000-8000-000000000010','ce113000-0000-4000-8000-000000000001','requester-private-canary@example.test');
 agency_rows:=public.read_provider_change_requests('ce113000-0000-4000-8000-000000000020','ce113000-0000-4000-8000-000000000002','outgoing-private-canary@example.test');
 original_rows:=public.read_provider_change_requests_before_coherence('ce113000-0000-4000-8000-000000000010','ce113000-0000-4000-8000-000000000001','requester-private-canary@example.test');
 perform pg_temp.privacy_assert(jsonb_array_length(owner_rows)=2 and owner_rows=agency_rows,'business owner and outgoing agency retain same scoped requests');
 perform pg_temp.privacy_assert(owner_rows->0->>'id'=(select body->>'id' from privacy_second) and owner_rows->1->>'id'=(select body->>'id' from privacy_first),'newest-first inherited ordering retained');
 perform pg_temp.privacy_assert((select jsonb_agg(item-array['business_name','outgoing_agency_name','incoming_agency_name','requested_by_name','completed_at','summary'] order by position) from jsonb_array_elements(owner_rows) with ordinality r(item,position))=original_rows,'all inherited fields, responses, and cancellation preserved exactly');
 perform pg_temp.privacy_assert(owner_rows->1->'cancellation'->>'cancelled_by'='ce113000-0000-4000-8000-000000000001' and owner_rows->1->'cancellation'->>'cancelled_at' is not null,'actual cancellation actor and time retained without internal email proof');
 perform pg_temp.privacy_assert(not exists(select 1 from jsonb_array_elements(owner_rows) item where item->>'requested_by_name'<>'Actor not recorded'),'missing approved actor snapshots use neutral fallback');
 perform pg_temp.privacy_assert(owner_rows::text not like '%@example.test%' and agency_rows::text not like '%@example.test%','neither owner nor agency projection leaks contact or verification emails');
 perform pg_temp.privacy_assert(owner_rows->0->>'business_name'='Privacy business' and owner_rows->0->>'outgoing_agency_name'='Privacy outgoing agency' and owner_rows->0->>'incoming_agency_name'='Privacy incoming agency','workspace display names retained');
 perform pg_temp.privacy_assert(jsonb_array_length(owner_rows->0->'summary')=6 and owner_rows->0->'summary'->2->>'detail'='No agency source snapshot has been recorded for this relationship.' and owner_rows->0->'summary'->3->'verified'='false'::jsonb and owner_rows->0->'completed_at'='null'::jsonb,'missing source and completion evidence remain honest');
 perform pg_temp.privacy_assert(public.read_provider_change_requests('ce113000-0000-4000-8000-000000000022','ce113000-0000-4000-8000-000000000003','unrelated-private-canary@example.test')='[]'::jsonb,'authorized unrelated agency has no cross-workspace requests');
 perform pg_temp.privacy_assert(public.read_provider_change_requests('ce113000-0000-4000-8000-000000000021','ce113000-0000-4000-8000-000000000003','unrelated-private-canary@example.test')='[]'::jsonb,'incoming agency is not granted outgoing history');
end $$;
select pg_temp.privacy_denied($q$select public.read_provider_change_requests('ce113000-0000-4000-8000-000000000010','ce113000-0000-4000-8000-000000000003','unrelated-private-canary@example.test')$q$);
select pg_temp.privacy_denied($q$select public.read_provider_change_requests('ce113000-0000-4000-8000-000000000020','ce113000-0000-4000-8000-000000000002','wrong@example.test')$q$);
update public.users set verified_at=null where id='ce113000-0000-4000-8000-000000000002';
select pg_temp.privacy_denied($q$select public.read_provider_change_requests('ce113000-0000-4000-8000-000000000020','ce113000-0000-4000-8000-000000000002','outgoing-private-canary@example.test')$q$);
update public.users set verified_at=now() where id='ce113000-0000-4000-8000-000000000002';
update public.users set email='changed-private-canary@example.test' where id='ce113000-0000-4000-8000-000000000001';
select pg_temp.privacy_assert((public.read_provider_change_requests('ce113000-0000-4000-8000-000000000020','ce113000-0000-4000-8000-000000000002','outgoing-private-canary@example.test')->0->>'requested_by_name')='Actor not recorded' and public.read_provider_change_requests('ce113000-0000-4000-8000-000000000020','ce113000-0000-4000-8000-000000000002','outgoing-private-canary@example.test')::text not like '%@example.test%','later current contact changes do not invent historical identity or disclose it');
select pg_temp.privacy_assert(has_function_privilege('service_role','public.read_provider_change_requests(uuid,uuid,text)','EXECUTE') and not has_function_privilege('anon','public.read_provider_change_requests(uuid,uuid,text)','EXECUTE') and not has_function_privilege('authenticated','public.read_provider_change_requests(uuid,uuid,text)','EXECUTE') and not has_function_privilege('service_role','public.read_provider_change_requests_before_coherence(uuid,uuid,text)','EXECUTE') and not has_table_privilege('service_role','public.provider_change_requests','SELECT'),'service-only scoped RPC and private predecessor/table boundaries preserved');
set transaction read only;
set local role service_role;
select pg_temp.privacy_assert(jsonb_array_length(public.read_provider_change_requests('ce113000-0000-4000-8000-000000000020','ce113000-0000-4000-8000-000000000002','outgoing-private-canary@example.test'))=2,'actual service role reads populated scoped projection in READ ONLY transaction');
rollback;
\echo Provider requester privacy: inherited authority, isolation, missing identity, no emails, ordering, summaries and ACL checks passed.
