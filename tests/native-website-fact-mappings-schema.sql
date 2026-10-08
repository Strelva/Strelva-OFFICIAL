\set ON_ERROR_STOP on
begin;
create function pg_temp.nfm_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'native mapping assertion: %',message; end if; end $$;
create function pg_temp.nfm_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
 if sqlerrm not like expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end;
 raise exception 'statement unexpectedly succeeded'; end $$;
insert into public.users(id,email,verified_at) values
 ('7d000000-0000-4000-8000-000000000001','mapping-owner@example.test',now()),
 ('7d000000-0000-4000-8000-000000000002','mapping-member@example.test',now()),
 ('7d000000-0000-4000-8000-000000000003','mapping-provider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('7d000000-0000-4000-8000-000000000010','customer','Mapping business A','7d000000-0000-4000-8000-000000000001'),
 ('7d000000-0000-4000-8000-000000000011','customer','Mapping business B','7d000000-0000-4000-8000-000000000001'),
 ('7d000000-0000-4000-8000-000000000050','agency','Neutral mapping agency','7d000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('7d000000-0000-4000-8000-000000000010','7d000000-0000-4000-8000-000000000001','owner','7d000000-0000-4000-8000-000000000001'),
 ('7d000000-0000-4000-8000-000000000011','7d000000-0000-4000-8000-000000000001','owner','7d000000-0000-4000-8000-000000000001'),
 ('7d000000-0000-4000-8000-000000000010','7d000000-0000-4000-8000-000000000002','member','7d000000-0000-4000-8000-000000000001'),
 ('7d000000-0000-4000-8000-000000000050','7d000000-0000-4000-8000-000000000003','owner','7d000000-0000-4000-8000-000000000003');
insert into public.tenants(id,site_name,delivery_model,stable_id) values
 ('mapping-site-a','Mapping site A','custom_repo','7d000000-0000-4000-8000-000000000020'),
 ('mapping-site-b','Mapping site B','custom_repo','7d000000-0000-4000-8000-000000000021'),
 ('mapping-site-provider','Provider mapping site','custom_repo','7d000000-0000-4000-8000-000000000022');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
 ('7d000000-0000-4000-8000-000000000020','mapping-site-a','7d000000-0000-4000-8000-000000000010','7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000030',repeat('a',64),'{}'),
 ('7d000000-0000-4000-8000-000000000021','mapping-site-b','7d000000-0000-4000-8000-000000000011','7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000031',repeat('b',64),'{}'),
 ('7d000000-0000-4000-8000-000000000022','mapping-site-provider','7d000000-0000-4000-8000-000000000010','7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000032',repeat('c',64),'{}');
insert into public.business_records(workspace_id,revision,created_by,updated_by) values
 ('7d000000-0000-4000-8000-000000000010',1,'7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000001'),
 ('7d000000-0000-4000-8000-000000000011',1,'7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000001');
insert into public.business_services(id,workspace_id,name,external_ref,source,created_by,updated_by) values
 ('7d000000-0000-4000-8000-000000000040','7d000000-0000-4000-8000-000000000010','Pending service A','same-id','operator','7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000001'),
 ('7d000000-0000-4000-8000-000000000041','7d000000-0000-4000-8000-000000000011','Service B','same-id','owner','7d000000-0000-4000-8000-000000000001','7d000000-0000-4000-8000-000000000001');
insert into public.business_record_confirmed(workspace_id,entity,entity_id,state,confirmed_by_kind) values
 ('7d000000-0000-4000-8000-000000000010','service','7d000000-0000-4000-8000-000000000040','{"name":"Confirmed service A","description":"Owner description","priceText":"$90","durationMinutes":45,"active":true}','owner_write'),
 ('7d000000-0000-4000-8000-000000000011','service','7d000000-0000-4000-8000-000000000041','{"name":"Service B","description":null,"priceText":null,"durationMinutes":null,"active":true}','owner_write');
-- A neutral provider uses the same effective predecessor gate: verified user,
-- active seat, agency membership and active staff, with no super-admin role.
-- Keep a direct customer admin membership after the first positive proof so
-- revocation tests exercise the provider check, not just lost record access.
do $$
declare ws uuid:='7d000000-0000-4000-8000-000000000010'; owner_id uuid:='7d000000-0000-4000-8000-000000000001';
 provider_id uuid:='7d000000-0000-4000-8000-000000000003'; agency_id uuid:='7d000000-0000-4000-8000-000000000050'; token uuid:=gen_random_uuid();
begin
 perform public.choose_business_provider(owner_id,'mapping-owner@example.test',ws,agency_id);
 perform public.set_agency_client_staff(provider_id,'mapping-provider@example.test',agency_id,ws,provider_id,true);
 perform pg_temp.nfm_assert(public.needs_you_operator_id(provider_id,'mapping-provider@example.test') is null
   and public.needs_you_provider_id(ws,provider_id,'mapping-provider@example.test')=agency_id
   and not exists(select 1 from public.workspace_memberships where workspace_id=ws and user_id=provider_id),
   'neutral provider authority comes from its staffed seat, not global operator or direct customer membership');
 perform pg_temp.nfm_assert(public.read_native_website_fact_mapping(ws,provider_id,'mapping-provider@example.test','mapping-site-provider')->'mapping'->>'revision'='0',
   'neutral staffed provider reads the linked website mapping');
 perform pg_temp.nfm_assert(public.claim_native_website_mapped_fact_review(ws,provider_id,'mapping-provider@example.test','mapping-site-provider',1,token,'contact',0),
   'neutral staffed provider claims a review without publishing');
 perform public.record_native_website_fact_review(token,'blocked',null);
 perform pg_temp.nfm_expect(format('select public.save_native_website_fact_mapping(%L,%L,''mapping-provider@example.test'',''mapping-site-provider'',0,''{"fields":[],"services":[]}'')',ws,provider_id),'%access_denied%');
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,provider_id,'admin',owner_id);
 perform public.set_agency_client_staff(provider_id,'mapping-provider@example.test',agency_id,ws,provider_id,false);
 perform pg_temp.nfm_assert(public.business_record_assert_actor(ws,provider_id,'mapping-provider@example.test',false)='admin',
   'direct admin access survives staff removal but does not grant provider authority');
 perform pg_temp.nfm_expect(format('select public.read_native_website_fact_mapping(%L,%L,''mapping-provider@example.test'',''mapping-site-provider'')',ws,provider_id),'%access_denied%');
 perform pg_temp.nfm_expect(format('select public.claim_native_website_mapped_fact_review(%L,%L,''mapping-provider@example.test'',''mapping-site-provider'',1,gen_random_uuid(),''contact'',0)',ws,provider_id),'%access_denied%');
 perform public.set_agency_client_staff(provider_id,'mapping-provider@example.test',agency_id,ws,provider_id,true);
 perform pg_temp.nfm_assert(public.read_native_website_fact_mapping(ws,provider_id,'mapping-provider@example.test','mapping-site-provider')->'mapping'->>'revision'='0',
   'restored active staff can read before seat ends');
 perform public.end_provider_seat(owner_id,'mapping-owner@example.test',ws,agency_id,null);
 perform pg_temp.nfm_expect(format('select public.read_native_website_fact_mapping(%L,%L,''mapping-provider@example.test'',''mapping-site-provider'')',ws,provider_id),'%access_denied%');
 perform pg_temp.nfm_expect(format('select public.claim_native_website_mapped_fact_review(%L,%L,''mapping-provider@example.test'',''mapping-site-provider'',1,gen_random_uuid(),''contact'',0)',ws,provider_id),'%access_denied%');
end $$;
do $$
declare ws uuid:='7d000000-0000-4000-8000-000000000010'; actor uuid:='7d000000-0000-4000-8000-000000000001'; token uuid:=gen_random_uuid(); settings_token uuid:=gen_random_uuid(); mapping jsonb; result jsonb;
begin
 mapping:='{"fields":["display_name","phone"],"services":[{"serviceId":"7d000000-0000-4000-8000-000000000040","nativeServiceId":"same-id","fields":["name","priceText"]}]}';
 result:=public.read_native_website_fact_mapping(ws,actor,'mapping-owner@example.test','mapping-site-a');
 perform pg_temp.nfm_assert(result->'mapping'->>'revision'='0' and not result->'mapping'->'fields' ? 'display_name','legacy contact defaults without name/service inference');
 result:=public.save_native_website_fact_mapping(ws,actor,'mapping-owner@example.test','mapping-site-a',0,mapping);
 perform pg_temp.nfm_assert(result->'mapping'->>'revision'='1','explicit revisioned mapping saved');
 perform pg_temp.nfm_assert(result->'services'->0->>'name'='Confirmed service A' and jsonb_array_length(result->'services')=1,'only owner-confirmed service from this business');
 perform pg_temp.nfm_assert(public.save_native_website_fact_mapping(ws,actor,'mapping-owner@example.test','mapping-site-a',0,mapping)=result,'exact lost-response save retry safe');
 perform pg_temp.nfm_expect(format('select public.save_native_website_fact_mapping(%L,%L,''mapping-owner@example.test'',''mapping-site-a'',0,''{"fields":[],"services":[]}'')',ws,actor),'%revision_conflict%');
 perform pg_temp.nfm_expect(format('select public.save_native_website_fact_mapping(%L,%L,''mapping-owner@example.test'',''mapping-site-b'',0,%L)',ws,actor,mapping),'%access_denied%');
 perform pg_temp.nfm_expect(format('select public.save_native_website_fact_mapping(%L,%L,''mapping-owner@example.test'',''mapping-site-a'',1,%L)',ws,actor,replace(mapping::text,'000000000040','000000000041')),'%mapping_invalid%');
 perform pg_temp.nfm_expect(format('select public.save_native_website_fact_mapping(%L,%L,''mapping-owner@example.test'',''mapping-site-a'',1,''{"fields":["owner_recipient"],"services":[]}'')',ws,actor),'%mapping_invalid%');
 perform pg_temp.nfm_expect(format('select public.read_native_website_fact_mapping(%L,%L,''mapping-member@example.test'',''mapping-site-a'')',ws,'7d000000-0000-4000-8000-000000000002'),'%access_denied%');
 -- Global operator + direct admin is not the current acting provider. The
 -- successor claim must preserve the release's neutral provider boundary.
 update public.workspace_memberships set role='admin' where workspace_id=ws and user_id='7d000000-0000-4000-8000-000000000002';
 insert into public.super_admins(user_id,email) values('7d000000-0000-4000-8000-000000000002','mapping-member@example.test');
 perform pg_temp.nfm_expect(format('select public.read_native_website_fact_mapping(%L,%L,''mapping-member@example.test'',''mapping-site-a'')',ws,'7d000000-0000-4000-8000-000000000002'),'%access_denied%');
 perform pg_temp.nfm_expect(format('select public.claim_native_website_mapped_fact_review(%L,%L,''mapping-member@example.test'',''mapping-site-a'',1,gen_random_uuid(),''contact'',1)',ws,'7d000000-0000-4000-8000-000000000002'),'%access_denied%');

 perform pg_temp.nfm_assert(not public.claim_native_website_mapped_fact_review(ws,actor,'mapping-owner@example.test','mapping-site-a',0,gen_random_uuid(),'contact',1),'stale record denied');
 perform pg_temp.nfm_assert(not public.claim_native_website_mapped_fact_review(ws,actor,'mapping-owner@example.test','mapping-site-a',1,gen_random_uuid(),'contact',0),'changed mapping denied');
 -- Old contact claim blocks mapped contact retry, while settings/services have their own exact identities.
 perform pg_temp.nfm_assert(public.claim_native_website_fact_review(ws,actor,'mapping-owner@example.test','mapping-site-a',1,token),'legacy contact claim retained');
 perform pg_temp.nfm_assert(not public.claim_native_website_mapped_fact_review(ws,actor,'mapping-owner@example.test','mapping-site-a',1,gen_random_uuid(),'contact',1),'legacy claim cannot replay');
 perform pg_temp.nfm_assert(public.claim_native_website_mapped_fact_review(ws,actor,'mapping-owner@example.test','mapping-site-a',1,settings_token,'settings',1),'name section independently claimable');
 perform public.record_native_website_fact_review(settings_token,'unconfirmed',null);
 perform pg_temp.nfm_assert(not public.claim_native_website_mapped_fact_review(ws,actor,'mapping-owner@example.test','mapping-site-a',1,gen_random_uuid(),'settings',1),'uncertain settings never replayed');
 perform pg_temp.nfm_assert(public.claim_native_website_mapped_fact_review(ws,actor,'mapping-owner@example.test','mapping-site-a',1,gen_random_uuid(),'services',1),'mapped services independently claimable');
 update public.business_records set revision=2 where workspace_id=ws;
 perform pg_temp.nfm_assert(not public.claim_native_website_mapped_fact_review(ws,actor,'mapping-owner@example.test','mapping-site-a',2,gen_random_uuid(),'settings',1),'uncertain section blocks later revisions');
 update public.tenants set id='mapping-site-renamed' where id='mapping-site-a';
 perform pg_temp.nfm_assert(public.read_native_website_fact_mapping(ws,actor,'mapping-owner@example.test','mapping-site-renamed')->'mapping'->>'revision'='1','stable mapping survives slug rename');
 -- A second eligible site's first claim proves flags/link refusal independently
 -- of the unresolved claims on the first site.
 insert into public.workspace_release_flags(workspace_id,flag,state,changed_by) values('7d000000-0000-4000-8000-000000000011','systems','off',actor);
 perform pg_temp.nfm_assert(not public.claim_native_website_mapped_fact_review('7d000000-0000-4000-8000-000000000011',actor,'mapping-owner@example.test','mapping-site-b',1,gen_random_uuid(),'contact',0),'systems off refuses first claim');
 delete from public.workspace_release_flags where workspace_id='7d000000-0000-4000-8000-000000000011' and flag='systems';
 update public.tenants set active=false where id='mapping-site-b';
 perform pg_temp.nfm_expect(format('select public.claim_native_website_mapped_fact_review(''7d000000-0000-4000-8000-000000000011'',%L,''mapping-owner@example.test'',''mapping-site-b'',1,gen_random_uuid(),''contact'',0)',actor),'%access_denied%');
 update public.workspace_memberships set role='member' where workspace_id=ws and user_id=actor;
 perform pg_temp.nfm_expect(format('select public.claim_native_website_mapped_fact_review(%L,%L,''mapping-owner@example.test'',''mapping-site-renamed'',2,gen_random_uuid(),''contact'',1)',ws,actor),'%access_denied%');
end $$;
select pg_temp.nfm_assert(not has_function_privilege('authenticated','public.save_native_website_fact_mapping(uuid,uuid,text,text,bigint,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.read_native_website_fact_mapping(uuid,uuid,text,text)','EXECUTE')
 and not has_function_privilege('authenticated','public.claim_native_website_mapped_fact_review(uuid,uuid,text,text,bigint,uuid,text,bigint)','EXECUTE')
 and has_function_privilege('service_role','public.read_native_website_fact_mapping(uuid,uuid,text,text)','EXECUTE')
 and not has_table_privilege('service_role','public.website_native_fact_mappings','INSERT'),'server-only scoped RPCs, no direct browser or service table writes');
\if :{?keep_fixture}
commit;
\else
rollback;
\endif
\echo 'Native website fact mapping authority/isolation checks passed.'
-- The durable receipt itself carries exact service identities, even when no
-- ordinary fact changed. No implicit whole-service refresh is needed.
do $$ begin
  if public.business_fact_confirmation_json(jsonb_populate_record(null::public.business_record_fact_confirmations,
    '{"decision_id":"7d000000-0000-4000-8000-000000000060","workspace_id":"7d000000-0000-4000-8000-000000000010","record_revision":1,"revision_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","decided_by_kind":"owner_session","changes":[{"entity":"service","id":"7d000000-0000-4000-8000-000000000040"}]}'))->'serviceIds'
      is distinct from '["7d000000-0000-4000-8000-000000000040"]'::jsonb then
    raise exception 'Native mapping confirmation receipt lost exact service IDs';
  end if;
end $$;
\echo 'Native mapping confirmation receipt preserves exact service IDs.'
