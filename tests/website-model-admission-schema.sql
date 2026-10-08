\set ON_ERROR_STOP on
begin;
create function pg_temp.wm_assert(v boolean,message text) returns void language plpgsql as $$ begin if v is not true then raise exception 'website model assertion: %',message; end if; end $$;
create function pg_temp.wm_error(statement text,expected text) returns void language plpgsql as $$ begin begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end; raise exception 'Expected %',expected; end $$;
select pg_temp.wm_assert(not has_table_privilege('service_role','public.website_model_allowances','update'),'no direct counter writes');
select pg_temp.wm_assert(not has_function_privilege('authenticated','public.reserve_website_model_call(uuid,uuid,uuid,text,integer)','execute'),'browser cannot select allowance');
do $$
declare ws uuid:='62000000-0000-4000-8000-000000000110'; owner_id uuid:='62000000-0000-4000-8000-000000000101'; work_id uuid;
begin
 select website_work_id into work_id from public.website_document_publications where workspace_id=ws limit 1;
 perform pg_temp.wm_assert(work_id is not null,'published fixture exists');
 perform pg_temp.wm_error(format('select public.reserve_website_model_call(%L,%L,%L,%L,2)',gen_random_uuid(),work_id,owner_id,'lp-owner@example.test'),'workspace_access_denied');
 perform pg_temp.wm_error(format('select public.reserve_website_model_call(%L,%L,%L,%L,2)',ws,work_id,owner_id,'someone@example.test'),'workspace_access_denied');
 perform pg_temp.wm_assert(public.reserve_website_model_call(ws,work_id,owner_id,'lp-owner@example.test',2)=1,'first attempt admitted');
 perform pg_temp.wm_assert(public.reserve_website_model_call(ws,work_id,owner_id,'lp-owner@example.test',64)=2,'restart cannot raise stored cap');
 perform pg_temp.wm_error(format('select public.reserve_website_model_call(%L,%L,%L,%L,64)',ws,work_id,owner_id,'lp-owner@example.test'),'website_model_allowance_exhausted');
 delete from public.workspace_memberships where workspace_id=ws and user_id=owner_id;
 perform pg_temp.wm_error(format('select public.reserve_website_model_call(%L,%L,%L,%L,2)',ws,work_id,owner_id,'lp-owner@example.test'),'workspace_access_denied');
 perform pg_temp.wm_assert((select consumed=2 and maximum=2 from public.website_model_allowances where website_work_id=work_id),'failed reservations do not refill allowance');
end $$;
rollback;
