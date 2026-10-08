\set ON_ERROR_STOP on
begin;
create function pg_temp.w6_assert(ok boolean, detail text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'w6 portability: %', detail; end if; end; $$;
create function pg_temp.w6_denied(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm = expected then return; end if; raise;
  end;
  raise exception 'expected denial %', expected;
end; $$;
insert into public.users(id,email,verified_at) values
 ('e6220000-0000-4000-8000-000000000001','w6-delivery-operator@example.test',now()),
 ('e6220000-0000-4000-8000-000000000002','w6-delivery-owner@example.test',now()),
 ('e6220000-0000-4000-8000-000000000003','w6-delivery-member@example.test',now());
insert into public.super_admins(user_id,email) values ('e6220000-0000-4000-8000-000000000001','w6-delivery-operator@example.test');
insert into public.tenants(id,stable_id,site_name,active,owner_email) values
 ('w6-delivery-site-a','e6220000-0000-4000-8000-0000000000a1','Store A',true,'w6-delivery-owner@example.test'),
 ('w6-delivery-site-b','e6220000-0000-4000-8000-0000000000b1','Store B',true,'w6-delivery-owner@example.test'),
 ('w6-delivery-site-other','e6220000-0000-4000-8000-0000000000c1','Other',true,'other@example.test');
create temporary table w6_workspace(id uuid);
insert into w6_workspace select (public.convert_tenant_to_business('w6-delivery-operator@example.test','w6-delivery-site-a',
 jsonb_build_object('tenantId','w6-delivery-site-a','tenantStableId','e6220000-0000-4000-8000-0000000000a1','workspaceName','Export business',
 'billing','{"billingType":"custom","subscriptionStatus":"active","monthlyCents":15000,"grandfathered":false}'::jsonb,
 'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('a',64))->>'workspaceId')::uuid;
select public.convert_tenant_to_business('w6-delivery-operator@example.test','w6-delivery-site-b',
 jsonb_build_object('tenantId','w6-delivery-site-b','tenantStableId','e6220000-0000-4000-8000-0000000000b1','workspaceName','Export business',
 'targetWorkspaceId',(select id from w6_workspace),'billing','{"billingType":"custom","subscriptionStatus":"active","monthlyCents":15000,"grandfathered":false}'::jsonb,
 'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('b',64));
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ((select id from w6_workspace),'e6220000-0000-4000-8000-000000000002','owner','e6220000-0000-4000-8000-000000000001'),
 ((select id from w6_workspace),'e6220000-0000-4000-8000-000000000003','member','e6220000-0000-4000-8000-000000000001');

select public.record_tenant_client_record('w6-delivery-site-a','inquiry_delivery','checkpoint:id','{"kind":"checkpoint","key":"inquiry-a:reply","value":{"status":"accepted","inquiryId":"inquiry-a"}}',repeat('a',64),now(),'dual_write','replace');
select public.record_tenant_client_record('w6-delivery-site-a','inquiry_delivery','reply_target:id','{"kind":"reply_target","key":"reply%40example.test","value":{"replyTo":"reply@example.test","inquiryId":"inquiry-a"}}',repeat('b',64),now(),'dual_write','replace');
select pg_temp.w6_assert(public.find_inquiry_delivery_reply_target('REPLY@example.test')->>'tenantId'='w6-delivery-site-a','reverse reply routing from Postgres');
update public.tenants set id='w6-delivery-renamed' where id='w6-delivery-site-a';
select pg_temp.w6_assert(public.find_inquiry_delivery_reply_target('reply@example.test')->>'tenantId'='w6-delivery-renamed','stable-id lookup survives rename without rewriting records');
select pg_temp.w6_assert(jsonb_array_length(public.read_tenant_client_records_page('w6-delivery-renamed','inquiry_delivery',1000,null,null))=2,'all operational history after rename');
select pg_temp.w6_assert(public.find_inquiry_delivery_reply_target('other@example.test') is null,'unknown inbound address never guessed');
select pg_temp.w6_assert(not has_function_privilege('authenticated','public.find_inquiry_delivery_reply_target(text)','execute') and not has_function_privilege('anon','public.find_inquiry_delivery_reply_target(text)','execute'),'no public routing read');
rollback;
