\set ON_ERROR_STOP on
begin;
create function pg_temp.wbf_assert(v boolean,message text) returns void language plpgsql as $$ begin if v is not true then raise exception 'website facts: %',message; end if; end $$;
select pg_temp.wbf_assert(not has_function_privilege('anon','public.read_hosted_website_business_facts(text)','execute'),'no anonymous RPC');
select pg_temp.wbf_assert(not has_function_privilege('authenticated','public.read_hosted_website_business_facts(text)','execute'),'no authenticated RPC');
select pg_temp.wbf_assert(public.read_hosted_website_business_facts('unrelated-site') is null,'no cross-tenant fallback');
do $$
declare ws uuid:='62000000-0000-4000-8000-000000000110'; owner_id uuid:='62000000-0000-4000-8000-000000000101'; tenant text; result jsonb;
begin
 select tenant_id into tenant from public.website_document_publications where workspace_id=ws limit 1;
 perform pg_temp.wbf_assert(tenant is not null,'hosted fixture exists');
 insert into public.business_records(workspace_id,created_by,updated_by) values(ws,owner_id,owner_id) on conflict(workspace_id) do nothing;
 insert into public.business_record_facts(workspace_id,fact_key,value,source,updated_by) values(ws,'phone','"7165550123"','owner',owner_id) on conflict(workspace_id,fact_key) do update set value=excluded.value,source=excluded.source;
 insert into public.business_record_facts(workspace_id,fact_key,value,source,updated_by) values(ws,'email','"unconfirmed@example.test"','agent',owner_id) on conflict(workspace_id,fact_key) do update set value=excluded.value,source=excluded.source,verified=false;
 -- After 20261011133700 (#509) only the confirmed copy is read; this direct
 -- owner row stands in for the owner's own write, which confirms.
 if to_regclass('public.business_record_confirmed') is not null then
   insert into public.business_record_confirmed(workspace_id,entity,entity_id,state,confirmed_by_kind)
     values(ws,'fact','phone',public.business_record_entity_state(ws,'fact','phone'),'owner_write')
     on conflict(workspace_id,entity,entity_id) do update set state=excluded.state;
   delete from public.business_record_confirmed where workspace_id=ws and entity='fact' and entity_id='email';
 end if;
 result:=public.read_hosted_website_business_facts(tenant);
 perform pg_temp.wbf_assert(result->'facts'->>'phone'='7165550123','reads confirmed own record');
 perform pg_temp.wbf_assert(not(result->'facts' ? 'email') and not(result->'facts' ? 'owner_recipient'),'unconfirmed and private facts excluded');
 update public.tenants set active=false where id=tenant;
 perform pg_temp.wbf_assert(public.read_hosted_website_business_facts(tenant) is null,'paused runtime exposes no record');
end $$;
rollback;
