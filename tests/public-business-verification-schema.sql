\set ON_ERROR_STOP on
-- Fictional fixtures, canonical owner-confirmed copy and actual ordered schema.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'assertion failed: %',message; end if; end $$;
select pg_temp.assert_true(has_function_privilege('service_role','public.read_public_business_verification(text,text)','execute'),'service-role public read');
select pg_temp.assert_true(not has_function_privilege('anon','public.read_public_business_verification(text,text)','execute'),'anonymous database denial');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.read_public_business_verification(text,text)','execute'),'authenticated database denial');
select pg_temp.assert_true((select provolatile='s' from pg_proc where oid='public.read_public_business_verification(text,text)'::regprocedure),'reader supports PostgREST READ ONLY');
do $$
declare
  owner_id uuid := 'b3080000-0000-4000-8000-000000000001';
  ws uuid := 'b3080000-0000-4000-8000-000000000010';
  agency_id uuid := 'b3080000-0000-4000-8000-000000000020';
  binding_id uuid; result jsonb; tenant_stable uuid; owner_link text;
begin
  insert into public.users(id,email,verified_at) values (owner_id,'verification-owner@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values (ws,'customer','Fictional Verification Business',owner_id),(agency_id,'agency','Fictional Verification Agency',owner_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values (ws,owner_id,'owner',owner_id),(agency_id,owner_id,'owner',owner_id);
  insert into public.business_records(workspace_id,created_by,updated_by) values (ws,owner_id,owner_id);
  insert into public.business_record_facts(workspace_id,fact_key,value,source,verified,updated_by) values
    (ws,'display_name','"Fictional Verification Business"','owner',false,owner_id),
    (ws,'description','"SCRAPED_FACT_PRIVATE"','operator',true,owner_id),
    (ws,'links','[{"kind":"website","url":"https://verification.example/"}]','owner',false,owner_id),
    (ws,'owner_recipient','{"email":"private_owner_email@example.test"}','owner',true,owner_id);
  -- Production confirmation trigger must reject conversion and operator
  -- histories, even when their working state says verified.
  insert into public.business_record_revisions(workspace_id,sequence,record_revision,actor_id,actor_kind,source,command_id,command_digest,changes,result)
    select ws,n,n,owner_id,'operator',source,gen_random_uuid(),repeat('b',64),
      jsonb_build_array(jsonb_build_object('entity','fact','id','description','before',null,'after',public.business_record_entity_state(ws,'fact','description'))),'{}'
      from (values(1,'operator'),(2,'tenant_import')) v(n,source);
  perform pg_temp.assert_true(not exists(select 1 from public.business_record_confirmed where workspace_id=ws),'operator/import cannot create owner confirmation');
  insert into public.business_record_confirmed(workspace_id,entity,entity_id,state,confirmed_by_kind,confirmed_at)
    select ws,'fact',fact_key,public.business_record_entity_state(ws,'fact',fact_key),'owner_write',now()
    from public.business_record_facts where workspace_id=ws and fact_key in ('display_name','links','owner_recipient');
  insert into public.tenants(id,site_name,active) values('verification-site','Fictional Verification Site',true) returning stable_id into tenant_stable;
  insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
    values(tenant_stable,'verification-site',ws,owner_id,gen_random_uuid(),repeat('a',64),'{}');
  insert into public.business_pages(workspace_id,handle,published,published_at,updated_by) values (ws,'verification-fixture',true,now(),owner_id);
  insert into public.connected_sites(business_workspace_id,public_key,label,site_url,site_host,allowed_origins,verification_token,verified_at,verified_by,created_by)
    values (ws,'sk_pub_b30800000000000000000001','Fictional','https://verification.example/','verification.example',array['https://verification.example'],'b3080000000000000000000000000001',now(),owner_id,owner_id);
  insert into public.workspace_account_bindings(workspace_id,provider,scopes,status,last_checked_at,migrated_from)
    values(ws,'google',array['https://www.googleapis.com/auth/business.manage'],'connected',now(),'oauth') returning id into binding_id;
  insert into public.workspace_google_locations(workspace_id,binding_id,account_id,location_id,title)
    values(ws,binding_id,'accounts/fictional','fictional','PRIVATE_GOOGLE_ACCOUNT_TITLE');
  insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by)
    values(ws,agency_id,'operator',owner_id);
  insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values(ws,agency_id,'owner',owner_id);
  result := public.read_public_business_verification('verification-fixture',null);
  perform pg_temp.assert_true(result->'verification'->>'ownerConfirmedFactCount'='2','only served owner-confirmed facts count');
  perform pg_temp.assert_true(result->'verification'->'domains'->0->>'url'='https://verification.example/','owner public domain proof');
  perform pg_temp.assert_true(result->'verification'->'googleBusinessProfile'->>'linked'='true','location linked');
  perform pg_temp.assert_true(not (result->'verification'->'googleBusinessProfile' ? 'verified'),'Google verification not invented');
  perform pg_temp.assert_true(result->'verification'->'operatingAgency'->>'name'='Fictional Verification Agency','current agency with seat');
  perform pg_temp.assert_true(result::text not like '%PRIVATE_%' and result::text not like '%private_owner_email%' and result::text not like '%SCRAPED%' and result::text not like '%accounts/%' and result::text not like '%ciphertext%' and result::text not like '%'||owner_id::text||'%','private facts and actor/provider identifiers excluded');
  perform pg_temp.assert_true(public.read_public_business_verification('other-handle',null) is null,'unknown handle');
  perform pg_temp.assert_true(public.read_public_business_verification(null,null) is null and public.read_public_business_verification('verification-fixture','anything') is null,'exactly one locator');
  perform pg_temp.assert_true(public.read_public_business_verification(null,'verification-site')=result,'tenant locator has identical publication consent and evidence');
  update public.business_record_facts set value='[{"kind":"website","url":"https://verification.example"}]' where workspace_id=ws and fact_key='links';
  update public.business_record_confirmed set state=public.business_record_entity_state(ws,'fact','links') where workspace_id=ws and entity='fact' and entity_id='links';
  result := public.read_public_business_verification('verification-fixture',null);
  perform pg_temp.assert_true(result->'verification'->'domains'->0->>'url'='https://verification.example' and result->'verification'->'domains'->0->>'checkedAt' is not null,'owner no-slash root matches normalized slash proof and preserves public URL');
  foreach owner_link in array array['https://verification.example/other','https://verification.example:8443','https://other.example','https://owner@verification.example'] loop
    update public.business_record_facts set value=jsonb_build_array(jsonb_build_object('kind','website','url',owner_link)) where workspace_id=ws and fact_key='links';
    update public.business_record_confirmed set state=public.business_record_entity_state(ws,'fact','links') where workspace_id=ws and entity='fact' and entity_id='links';
    perform pg_temp.assert_true(public.read_public_business_verification('verification-fixture',null)->'verification'->'domains'='[]'::jsonb,'non-equivalent path/port/origin/credentials cannot borrow proof: '||owner_link);
  end loop;
  update public.business_record_facts set value='[{"kind":"website","url":"https://verification.example/"}]' where workspace_id=ws and fact_key='links';
  update public.business_record_confirmed set state=public.business_record_entity_state(ws,'fact','links') where workspace_id=ws and entity='fact' and entity_id='links';
  insert into public.domain_claims(tenant_id,domain,role,status,dns_status,ssl_status) values('verification-site','verification.example','production','verified','valid','ready'),('verification-site','private-admin.example','admin','verified','valid','ready');
  result := public.read_public_business_verification(null,'verification-site');
  perform pg_temp.assert_true(jsonb_array_length(result->'verification'->'domains')=1,'host and connected proofs deduplicated, private admin domain omitted');
  update public.connected_sites set status='revoked',revoked_at=now() where business_workspace_id=ws;
  update public.workspace_account_bindings set status='revoked' where id=binding_id;
  update public.workspace_providers set status='ended',ended_at=now(),ended_by=owner_id where customer_workspace_id=ws;
  result := public.read_public_business_verification('verification-fixture',null);
  perform pg_temp.assert_true(result->'verification'->'domains'->0->'checkedAt'='null'::jsonb,'generic hosted row timestamp never becomes provider proof');
  update public.domain_claims set updated_at=now() where tenant_id='verification-site';
  perform pg_temp.assert_true(public.read_public_business_verification('verification-fixture',null)->'verification'->'domains'->0->'checkedAt'='null'::jsonb,'generic hosted save cannot freshen proof');
  update public.domain_claims set status='misconfigured' where tenant_id='verification-site';
  result := public.read_public_business_verification('verification-fixture',null);
  perform pg_temp.assert_true(result->'verification'->'domains'='[]'::jsonb,'revoked domain disappears');
  perform pg_temp.assert_true(result->'verification'->'googleBusinessProfile'->>'linked'='false','revoked Google link disappears');
  perform pg_temp.assert_true(result->'verification'->'operatingAgency'='null'::jsonb,'ended agency disappears');
  update public.tenants set active=false where id='verification-site';
  perform pg_temp.assert_true(public.read_public_business_verification(null,'verification-site') is null,'inactive tenant denied');
  update public.business_pages set published=false where workspace_id=ws;
  perform pg_temp.assert_true(public.read_public_business_verification('verification-fixture',null) is null,'unpublished consent closes public read');
end $$;
rollback;
-- Actually execute the function under service role in a read-only transaction.
begin read only;
set local role service_role;
select public.read_public_business_verification('missing-business',null);
rollback;
