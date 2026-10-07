\set ON_ERROR_STOP on
begin;
create function pg_temp.brand_assert(ok boolean, message text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'brand assertion: %',message; end if; end $$;
create function pg_temp.brand_expect(statement text, expected text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then if sqlerrm not like expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end;
  raise exception 'expected refusal: %',statement;
end $$;
insert into public.users(id,email,verified_at) values
 ('b2640000-0000-4000-8000-000000000001','brand-owner@example.test',now()),
 ('b2640000-0000-4000-8000-000000000002','agency-owner@example.test',now()),
 ('b2640000-0000-4000-8000-000000000003','agency-member@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('b2640000-0000-4000-8000-000000000010','customer','Brand client','b2640000-0000-4000-8000-000000000001'),
 ('b2640000-0000-4000-8000-000000000020','agency','Agency A','b2640000-0000-4000-8000-000000000002'),
 ('b2640000-0000-4000-8000-000000000030','agency','Agency B','b2640000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b2640000-0000-4000-8000-000000000010','b2640000-0000-4000-8000-000000000001','owner','b2640000-0000-4000-8000-000000000001'),
 ('b2640000-0000-4000-8000-000000000020','b2640000-0000-4000-8000-000000000002','owner','b2640000-0000-4000-8000-000000000002'),
 ('b2640000-0000-4000-8000-000000000020','b2640000-0000-4000-8000-000000000003','member','b2640000-0000-4000-8000-000000000002');
select pg_temp.brand_assert(public.resolve_owner_brand('b2640000-0000-4000-8000-000000000010') is null,'self-serve brand');
select public.manage_agency_brand('b2640000-0000-4000-8000-000000000002','agency-owner@example.test','b2640000-0000-4000-8000-000000000020',
 '{"displayName":"Agency & Brand","accentColor":"#ffff00","replyTo":"reply@agency.example","logo":null,"credit":"runs_on_strelva"}');
select public.choose_business_provider('b2640000-0000-4000-8000-000000000001','brand-owner@example.test','b2640000-0000-4000-8000-000000000010','b2640000-0000-4000-8000-000000000020');
select pg_temp.brand_assert(public.resolve_owner_brand('b2640000-0000-4000-8000-000000000010')->'brand'->>'displayName'='Agency & Brand','seat brand');
select pg_temp.brand_assert(public.resolve_owner_brand('b2640000-0000-4000-8000-000000000030')->>'name'='Agency B','no cross-agency leakage');
select pg_temp.brand_expect($$select public.manage_agency_brand('b2640000-0000-4000-8000-000000000003','agency-member@example.test','b2640000-0000-4000-8000-000000000020',null)$$,'agency_brand_access');
select pg_temp.brand_expect($$select public.manage_agency_brand('b2640000-0000-4000-8000-000000000002','wrong@example.test','b2640000-0000-4000-8000-000000000020',null)$$,'agency_brand_access');
select pg_temp.brand_expect($$update public.workspaces set agency_brand='{"displayName":"Wrong","accentColor":"red","replyTo":null,"logo":null,"credit":"hidden"}' where id='b2640000-0000-4000-8000-000000000020'$$,'%workspaces_agency_brand_check%');
select public.choose_business_provider('b2640000-0000-4000-8000-000000000001','brand-owner@example.test','b2640000-0000-4000-8000-000000000010','b2640000-0000-4000-8000-000000000030');
select pg_temp.brand_assert(public.resolve_owner_brand('b2640000-0000-4000-8000-000000000010')->>'agencyId'='b2640000-0000-4000-8000-000000000030','switching provider switches brand');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values ('b2640000-0000-4000-8000-000000000010','b2640000-0000-4000-8000-000000000020','owner','b2640000-0000-4000-8000-000000000001');
select pg_temp.brand_assert(public.resolve_owner_brand('b2640000-0000-4000-8000-000000000010')->>'agencyId'='b2640000-0000-4000-8000-000000000030','provider of record wins multiple seats');
select public.end_provider_seat('b2640000-0000-4000-8000-000000000001','brand-owner@example.test','b2640000-0000-4000-8000-000000000010','b2640000-0000-4000-8000-000000000030','Brand test');
select pg_temp.brand_assert(public.resolve_owner_brand('b2640000-0000-4000-8000-000000000010')->>'agencyId'='b2640000-0000-4000-8000-000000000020','ended seat ignored');
delete from public.workspace_memberships where workspace_id='b2640000-0000-4000-8000-000000000020' and user_id='b2640000-0000-4000-8000-000000000002';
select pg_temp.brand_expect($$select public.manage_agency_brand('b2640000-0000-4000-8000-000000000002','agency-owner@example.test','b2640000-0000-4000-8000-000000000020',null)$$,'agency_brand_access');
select public.end_provider_seat('b2640000-0000-4000-8000-000000000001','brand-owner@example.test','b2640000-0000-4000-8000-000000000010','b2640000-0000-4000-8000-000000000020','End final seat');
select pg_temp.brand_assert(public.resolve_owner_brand('b2640000-0000-4000-8000-000000000010') is null,'ended seats stay Strelva');
select pg_temp.brand_assert(not has_function_privilege('anon','public.resolve_owner_brand(uuid)','execute') and not has_function_privilege('authenticated','public.manage_agency_brand(uuid,text,uuid,jsonb)','execute'),'service-only exposure');
rollback;
