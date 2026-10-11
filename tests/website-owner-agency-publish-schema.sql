\set ON_ERROR_STOP on
-- Explicit owner consent on real local SQL, ordinary agency roles only.
begin;
create function pg_temp.woap_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'website agency consent: %',label; end if; end $$;
create function pg_temp.woap_expect(statement text,message text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like '%'||message||'%' then raise exception 'expected %, got %',message,sqlerrm; end if;
    return;
  end;
  raise exception 'expected failure: %',message;
end $$;
-- Inspect immutable storage without giving service_role table privileges.
create function pg_temp.woap_approved(wid uuid) returns integer language sql security definer as $$
  select approved_revision from public.website_document_heads where website_work_id=wid
$$;
create function pg_temp.woap_mandate_count(ws uuid,wid uuid,agency uuid) returns bigint language sql security definer as $$
  select count(*) from public.client_resource_mandates where customer_workspace_id=ws
    and agency_workspace_id=agency and effect='publish' and resource_kind='website'
    and resource_ref=public.system_origin_id(ws,'saved_work',wid::text)::text
$$;
insert into public.users(id,email,verified_at) values
 ('ac710000-0000-4000-8000-000000000001','woap-owner@example.test',now()),
 ('ac710000-0000-4000-8000-000000000002','woap-agency@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ac710000-0000-4000-8000-000000000010','customer','Consent Bakery','ac710000-0000-4000-8000-000000000001'),
 ('ac710000-0000-4000-8000-000000000011','agency','Consent Agency','ac710000-0000-4000-8000-000000000002'),
 ('ac710000-0000-4000-8000-000000000012','agency','Replacement Agency','ac710000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ac710000-0000-4000-8000-000000000010','ac710000-0000-4000-8000-000000000001','owner','ac710000-0000-4000-8000-000000000001'),
 ('ac710000-0000-4000-8000-000000000011','ac710000-0000-4000-8000-000000000002','owner','ac710000-0000-4000-8000-000000000002');
select format('grant usage on schema %I to service_role',nspname) from pg_namespace where oid=pg_my_temp_schema() \gexec
set local role service_role;
do $$
declare ws uuid:='ac710000-0000-4000-8000-000000000010'; agency uuid:='ac710000-0000-4000-8000-000000000011';
  owner_id uuid:='ac710000-0000-4000-8000-000000000001'; actor uuid:='ac710000-0000-4000-8000-000000000002'; work record;
  doc jsonb:='{"version":2,"siteName":"Consent Bakery","theme":{},"assets":{},"redirects":[],"pages":[],"nodes":{},"facts":{}}';
  h text:=repeat('a',64); permission jsonb;
begin
  perform public.choose_business_provider(owner_id,'woap-owner@example.test',ws,agency);
  perform public.set_agency_client_staff(actor,'woap-agency@example.test',agency,ws,actor,true);
  select * into work from public.claim_website_rebuild(ws,owner_id,'woap-owner@example.test','woap-request','consent-bakery.example.test','{}',jsonb_build_object('version',2,'revision',0,'createdBy',owner_id,'title','Consent Bakery','history','[]'::jsonb));
  perform public.append_website_document(ws,work.id,owner_id,'woap-owner@example.test',0,h,doc);
  permission:=public.read_website_agency_publish_permission(ws,work.id,owner_id,'woap-owner@example.test');
  perform pg_temp.woap_assert(permission->>'agencyName'='Consent Agency' and not (permission->>'granted')::boolean,'owner sees named current agency, initially not granted');
  perform pg_temp.woap_assert(public.read_website_agency_publish_permission(ws,work.id,actor,'woap-agency@example.test') is null,'agency cannot see owner consent control');
  perform public.approve_website_document(ws,work.id,owner_id,'woap-owner@example.test',1,h);
  perform pg_temp.woap_assert(jsonb_array_length(public.read_client_resource_mandates(owner_id,'woap-owner@example.test',ws))=0,'ordinary exact approval grants nothing');
  perform public.append_website_document(ws,work.id,owner_id,'woap-owner@example.test',1,h,doc);
  perform pg_temp.woap_expect(format('select public.approve_website_document_for_agency(%L,%L,%L,%L,2,%L,%L)',ws,work.id,actor,'woap-agency@example.test',h,agency),'provider_seat_owner_required');
  perform pg_temp.woap_expect(format('select public.approve_website_document_for_agency(%L,%L,%L,%L,2,%L,%L)',ws,work.id,owner_id,'woap-owner@example.test',h,'ac710000-0000-4000-8000-000000000012'),'website_agency_provider_changed');
  perform pg_temp.woap_expect(format('select public.approve_website_document_for_agency(%L,%L,%L,%L,1,%L,%L)',ws,work.id,owner_id,'woap-owner@example.test',h,agency),'website_revision_conflict');
  perform pg_temp.woap_assert(jsonb_array_length(public.read_client_resource_mandates(owner_id,'woap-owner@example.test',ws))=0
    and pg_temp.woap_approved(work.id) is null,'refused consent leaves neither write');
  perform public.end_provider_seat(owner_id,'woap-owner@example.test',ws,agency,'Local seat ended');
  perform pg_temp.woap_expect(format('select public.approve_website_document_for_agency(%L,%L,%L,%L,2,%L,%L)',ws,work.id,owner_id,'woap-owner@example.test',h,agency),'provider_seat_required');
  perform pg_temp.woap_assert(pg_temp.woap_approved(work.id) is null,'seat failure rolls back exact approval');
  perform public.choose_business_provider(owner_id,'woap-owner@example.test',ws,agency);
  perform public.approve_website_document_for_agency(ws,work.id,owner_id,'woap-owner@example.test',2,h,agency);
  perform public.approve_website_document_for_agency(ws,work.id,owner_id,'woap-owner@example.test',2,h,agency);
  perform pg_temp.woap_assert(pg_temp.woap_mandate_count(ws,work.id,agency)=1,'explicit grant is one website only and replay is idempotent');
  perform pg_temp.woap_assert((public.read_website_agency_publish_permission(ws,work.id,owner_id,'woap-owner@example.test')->>'granted')::boolean,'owner reads saved permission');
  perform public.append_website_document(ws,work.id,owner_id,'woap-owner@example.test',2,h,doc);
  perform pg_temp.woap_assert(pg_temp.woap_approved(work.id) is null,'standing website permission cannot approve a new candidate');
  perform public.choose_business_provider(owner_id,'woap-owner@example.test',ws,'ac710000-0000-4000-8000-000000000012');
  perform pg_temp.woap_expect(format('select public.approve_website_document_for_agency(%L,%L,%L,%L,3,%L,%L)',ws,work.id,owner_id,'woap-owner@example.test',h,agency),'website_agency_provider_changed');
  perform pg_temp.woap_assert(not (public.read_website_agency_publish_permission(ws,work.id,owner_id,'woap-owner@example.test')->>'granted')::boolean,'replacement agency inherits no consent');
end $$;
reset role;
select pg_temp.woap_assert(not has_function_privilege('authenticated','public.approve_website_document_for_agency(uuid,uuid,uuid,text,integer,text,uuid)','execute')
  and not has_function_privilege('anon','public.approve_website_document_for_agency(uuid,uuid,uuid,text,integer,text,uuid)','execute'),'anonymous and browser roles cannot impersonate owner');
rollback;
