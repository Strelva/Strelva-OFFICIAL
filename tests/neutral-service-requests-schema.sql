\set ON_ERROR_STOP on
-- Apply 20261020090040 after the complete prior schema, then run this fictional
-- transaction. These are authority/history contracts, not provider operation.
begin;
create function pg_temp.ns_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'neutral request assertion: %',message; end if; end $$;
create function pg_temp.ns_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected %, got %',expected,sqlerrm; end if;
    return;
  end;
  raise exception 'expected failure: %',statement;
end $$;
insert into public.users(id,email,verified_at) values
 ('40e00000-0000-4000-8000-000000000001','neutral-owner@example.test',now()),
 ('40e00000-0000-4000-8000-000000000002','neutral-agency@example.test',now()),
 ('40e00000-0000-4000-8000-000000000003','neutral-operator@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('40e00000-0000-4000-8000-000000000010','customer','Neutral business','40e00000-0000-4000-8000-000000000001'),
 ('40e00000-0000-4000-8000-000000000020','agency','Ordinary agency','40e00000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('40e00000-0000-4000-8000-000000000010','40e00000-0000-4000-8000-000000000001','owner','40e00000-0000-4000-8000-000000000001'),
 ('40e00000-0000-4000-8000-000000000020','40e00000-0000-4000-8000-000000000002','owner','40e00000-0000-4000-8000-000000000002');
insert into public.super_admins(user_id,email) values ('40e00000-0000-4000-8000-000000000003','neutral-operator@example.test');
select public.choose_business_provider('40e00000-0000-4000-8000-000000000001','neutral-owner@example.test','40e00000-0000-4000-8000-000000000010','40e00000-0000-4000-8000-000000000020');
-- No agency membership is required of the customer choosing its provider.
select pg_temp.ns_assert(jsonb_array_length(public.read_service_request_providers('40e00000-0000-4000-8000-000000000001','neutral-owner@example.test','40e00000-0000-4000-8000-000000000010'))=1,'ordinary recipient');
select pg_temp.ns_expect($q$select public.read_service_requests_for_strelva('40e00000-0000-4000-8000-000000000003','neutral-operator@example.test')$q$,'service_request_provider_ineligible');
create temporary table neutral_saved as select * from public.save_service_request(
 '40e00000-0000-4000-8000-000000000001','neutral-owner@example.test','40e00000-0000-4000-8000-000000000010',null,null,
 'requested','Prepare a flow','A usable flow','{}',array['help_request'],
 '{"kind":"agency","agencyWorkspaceId":"40e00000-0000-4000-8000-000000000020"}','neutral:save',repeat('a',64));
select pg_temp.ns_expect(format('select public.respond_service_request(%L,%L,%L,1,%L,null,%L,%L)',
 '40e00000-0000-4000-8000-000000000002','neutral-agency@example.test',(select id from neutral_saved),'accepted','neutral:unstaffed',repeat('b',64)), 'service_request_provider_ineligible');
select public.set_agency_client_staff('40e00000-0000-4000-8000-000000000002','neutral-agency@example.test','40e00000-0000-4000-8000-000000000020','40e00000-0000-4000-8000-000000000010','40e00000-0000-4000-8000-000000000002',true);
select pg_temp.ns_assert((select count(*)=1 from public.read_service_requests_for_agency('40e00000-0000-4000-8000-000000000002','neutral-agency@example.test','40e00000-0000-4000-8000-000000000020')),'exact staffed inbox');
select * from public.respond_service_request('40e00000-0000-4000-8000-000000000002','neutral-agency@example.test',(select id from neutral_saved),1,'accepted',null,'neutral:accept',repeat('c',64));
select public.end_provider_seat('40e00000-0000-4000-8000-000000000001','neutral-owner@example.test','40e00000-0000-4000-8000-000000000010','40e00000-0000-4000-8000-000000000020','Owner ended access');
select pg_temp.ns_expect(format('select public.read_service_request(%L,%L,%L)', '40e00000-0000-4000-8000-000000000002','neutral-agency@example.test',(select id from neutral_saved)),'service_request_provider_ineligible');
select pg_temp.ns_assert((select count(*)=1 from public.read_service_request('40e00000-0000-4000-8000-000000000001','neutral-owner@example.test',(select id from neutral_saved))),'owner keeps acceptance history after revocation');
-- Historical special-provider records remain exact and owner-readable. They
-- cannot silently become a newly selected ordinary provider through save.
insert into public.service_requests(id,business_workspace_id,status,request_text,outcome,context,scope,provider_kind,history,created_by)
 values ('40e00000-0000-4000-8000-000000000030','40e00000-0000-4000-8000-000000000010','requested','Historical request','Original outcome','{}',array['help_request'],'strelva','[]','40e00000-0000-4000-8000-000000000001');
create temporary table neutral_history as select to_jsonb(r) as body from public.service_requests r where id='40e00000-0000-4000-8000-000000000030';
select pg_temp.ns_assert((select to_jsonb(r)=(select body from neutral_history) from public.read_service_request('40e00000-0000-4000-8000-000000000001','neutral-owner@example.test','40e00000-0000-4000-8000-000000000030') r),'exact historical read');
select pg_temp.ns_expect($q$select public.save_service_request('40e00000-0000-4000-8000-000000000001','neutral-owner@example.test','40e00000-0000-4000-8000-000000000010',null,null,'requested','Old caller','No write','{}',array['help_request'],'{"kind":"strelva"}','neutral:legacy',repeat('d',64))$q$,'service_request_provider_ineligible');
select pg_temp.ns_assert((select to_jsonb(r)=(select body from neutral_history) from public.service_requests r where id='40e00000-0000-4000-8000-000000000030'),'history unchanged');
rollback;
