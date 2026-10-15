\set ON_ERROR_STOP on
-- read_provider_client_queue_v3: the agency Queue also lists its clients'
-- "Strelva reviews" drafts and Requests waiting for that agency's acceptance.
-- Runs in a transaction that is rolled back.
begin;
create or replace function pg_temp.q3_assert(ok boolean, msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'queue v3: %', msg; end if; end $$;
create or replace function pg_temp.q3_denied(statement text, expected text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'queue v3 expected denial: %', expected;
end $$;

select pg_temp.q3_assert(
  has_function_privilege('service_role', 'public.read_provider_client_queue_v3(uuid,text,uuid,timestamptz,text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.read_provider_client_queue_v3(uuid,text,uuid,timestamptz,text,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_provider_client_queue_v3(uuid,text,uuid,timestamptz,text,integer)', 'EXECUTE'),
  'only service_role executes v3');

insert into public.users(id,email,verified_at) values
 ('df300000-0000-4000-8000-000000000001','owner@q3.example.test',now()),
 ('df300000-0000-4000-8000-000000000002','staff@q3.example.test',now()),
 ('df300000-0000-4000-8000-000000000003','other@q3.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('df300000-0000-4000-8000-000000000010','customer','Q3 client','df300000-0000-4000-8000-000000000001'),
 ('df300000-0000-4000-8000-000000000011','customer','Q3 other client','df300000-0000-4000-8000-000000000001'),
 ('df300000-0000-4000-8000-000000000020','agency','Q3 agency','df300000-0000-4000-8000-000000000002'),
 ('df300000-0000-4000-8000-000000000030','agency','Q3 other agency','df300000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('df300000-0000-4000-8000-000000000010','df300000-0000-4000-8000-000000000001','owner','df300000-0000-4000-8000-000000000001'),
 ('df300000-0000-4000-8000-000000000011','df300000-0000-4000-8000-000000000001','owner','df300000-0000-4000-8000-000000000001'),
 ('df300000-0000-4000-8000-000000000020','df300000-0000-4000-8000-000000000002','owner','df300000-0000-4000-8000-000000000002'),
 ('df300000-0000-4000-8000-000000000030','df300000-0000-4000-8000-000000000003','owner','df300000-0000-4000-8000-000000000003');
select public.choose_business_provider('df300000-0000-4000-8000-000000000001','owner@q3.example.test','df300000-0000-4000-8000-000000000010','df300000-0000-4000-8000-000000000020');
select public.choose_business_provider('df300000-0000-4000-8000-000000000001','owner@q3.example.test','df300000-0000-4000-8000-000000000011','df300000-0000-4000-8000-000000000030');
select public.set_agency_client_staff('df300000-0000-4000-8000-000000000002','staff@q3.example.test','df300000-0000-4000-8000-000000000020','df300000-0000-4000-8000-000000000010','df300000-0000-4000-8000-000000000002',true);

-- Drafts: one Strelva reviews draft the agency should see, one customer message it must not,
-- one owner-routed draft (an owner_not_told row, not a review row), and another client's draft.
insert into public.owner_decisions(workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,sign_in_required,expires_at) values
 ('df300000-0000-4000-8000-000000000010','copy.routine','strelva_reviews','Update the hours copy','Live','Stays','queue_fixture','q3-review',repeat('1',64),false,now()+interval '7 days'),
 ('df300000-0000-4000-8000-000000000010','customer.message','strelva_reviews','Reply to a customer','Sends','Stays','queue_fixture','q3-message',repeat('2',64),false,now()+interval '7 days'),
 ('df300000-0000-4000-8000-000000000010','copy.routine','owner_decides','Owner routed copy','Live','Stays','queue_fixture','q3-owner',repeat('3',64),false,now()+interval '7 days'),
 ('df300000-0000-4000-8000-000000000011','copy.routine','strelva_reviews','Other client draft','Live','Stays','queue_fixture','q3-other',repeat('4',64),false,now()+interval '7 days');
-- Requests: one addressed to this agency and pending, one accepted, one for another agency, one for Strelva.
insert into public.service_requests(id,business_workspace_id,status,request_text,outcome,scope,provider_kind,provider_agency_workspace_id,created_by) values
 ('df300000-0000-4000-8000-0000000000a1','df300000-0000-4000-8000-000000000010','requested','Please add a page','Add a services page',array['website.repo_change'],'agency','df300000-0000-4000-8000-000000000020','df300000-0000-4000-8000-000000000001'),
 ('df300000-0000-4000-8000-0000000000a3','df300000-0000-4000-8000-000000000011','requested','Other agency work','Other agency outcome',array['website.repo_change'],'agency','df300000-0000-4000-8000-000000000030','df300000-0000-4000-8000-000000000001'),
 ('df300000-0000-4000-8000-0000000000a4','df300000-0000-4000-8000-000000000010','requested','Strelva work','Strelva outcome',array['website.repo_change'],'strelva',null,'df300000-0000-4000-8000-000000000001'),
 ('df300000-0000-4000-8000-0000000000a5','df300000-0000-4000-8000-000000000010','draft','Not yet sent','Draft outcome',array['website.repo_change'],'agency','df300000-0000-4000-8000-000000000020','df300000-0000-4000-8000-000000000001');

create temp table q3(result jsonb);
insert into q3 select public.read_provider_client_queue_v3('df300000-0000-4000-8000-000000000002','staff@q3.example.test','df300000-0000-4000-8000-000000000020');
select pg_temp.q3_assert((select count(*) from q3, jsonb_array_elements(result->'items') i where i->>'kind'='review') = 1
  and (select i->>'title' from q3, jsonb_array_elements(result->'items') i where i->>'kind'='review') = 'Update the hours copy'
  and (select i->>'status' from q3, jsonb_array_elements(result->'items') i where i->>'kind'='review') = 'waiting'
  and (select i->>'key' from q3, jsonb_array_elements(result->'items') i where i->>'kind'='review') ~ '^review:[0-9a-f-]{36}$',
  'the agency sees exactly its client''s Strelva reviews draft');
select pg_temp.q3_assert(not exists(select 1 from q3, jsonb_array_elements(result->'items') i where i->>'title' in ('Reply to a customer','Other client draft')),
  'customer messages and other clients'' drafts are excluded');
select pg_temp.q3_assert((select i->>'kind' from q3, jsonb_array_elements(result->'items') i where i->>'title'='Owner routed copy') = 'owner_not_told',
  'an owner-routed draft is still the owner-not-told row, never a review row');
select pg_temp.q3_assert((select count(*) from q3, jsonb_array_elements(result->'items') i where i->>'kind'='request') = 1
  and (select i->>'title' from q3, jsonb_array_elements(result->'items') i where i->>'kind'='request') = 'Add a services page'
  and (select i->>'status' from q3, jsonb_array_elements(result->'items') i where i->>'kind'='request') = 'pending_acceptance',
  'only the request addressed to this agency and still pending is listed');

-- v2 stays as it was: no review or request rows.
select pg_temp.q3_assert(not exists(select 1 from jsonb_array_elements(public.read_provider_client_queue_v2('df300000-0000-4000-8000-000000000002','staff@q3.example.test','df300000-0000-4000-8000-000000000020')->'items') i where i->>'kind' in ('review','request')),
  'v2 is unchanged');

-- An agency that does not hold the client sees none of it, and a non-member is refused.
select pg_temp.q3_assert(not exists(select 1 from jsonb_array_elements(public.read_provider_client_queue_v3('df300000-0000-4000-8000-000000000003','other@q3.example.test','df300000-0000-4000-8000-000000000030')->'items') i
  where i->>'title' in ('Update the hours copy','Add a services page')), 'another agency sees nothing of this client');
select pg_temp.q3_denied($$select public.read_provider_client_queue_v3('df300000-0000-4000-8000-000000000003','other@q3.example.test','df300000-0000-4000-8000-000000000020')$$, 'provider_queue_access_denied');
select pg_temp.q3_denied($$select public.read_provider_client_queue_v3('df300000-0000-4000-8000-000000000002','staff@q3.example.test','df300000-0000-4000-8000-000000000020', now(), 'bogus:1')$$, 'provider_queue_cursor_invalid');
-- Staff removed: the seat alone shows nothing.
select public.set_agency_client_staff('df300000-0000-4000-8000-000000000002','staff@q3.example.test','df300000-0000-4000-8000-000000000020','df300000-0000-4000-8000-000000000010','df300000-0000-4000-8000-000000000002',false);
select pg_temp.q3_assert(jsonb_array_length(public.read_provider_client_queue_v3('df300000-0000-4000-8000-000000000002','staff@q3.example.test','df300000-0000-4000-8000-000000000020')->'items') = 0,
  'inactive staff sees nothing');
rollback;
