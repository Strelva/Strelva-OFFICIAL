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
 ('e6000000-0000-4000-8000-000000000001','w6-port-operator@example.test',now()),
 ('e6000000-0000-4000-8000-000000000002','w6-port-owner@example.test',now()),
 ('e6000000-0000-4000-8000-000000000003','w6-port-member@example.test',now());
insert into public.super_admins(user_id,email) values ('e6000000-0000-4000-8000-000000000001','w6-port-operator@example.test');
insert into public.tenants(id,stable_id,site_name,active,owner_email) values
 ('w6-export-a','e6000000-0000-4000-8000-0000000000a1','Store A',true,'w6-port-owner@example.test'),
 ('w6-export-b','e6000000-0000-4000-8000-0000000000b1','Store B',true,'w6-port-owner@example.test'),
 ('w6-export-other','e6000000-0000-4000-8000-0000000000c1','Other',true,'other@example.test');
create temporary table w6_workspace(id uuid);
insert into w6_workspace select (public.convert_tenant_to_business('w6-port-operator@example.test','w6-export-a',
 jsonb_build_object('tenantId','w6-export-a','tenantStableId','e6000000-0000-4000-8000-0000000000a1','workspaceName','Export business',
 'billing','{"billingType":"custom","subscriptionStatus":"active","monthlyCents":15000,"grandfathered":false}'::jsonb,
 'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('a',64))->>'workspaceId')::uuid;
select public.convert_tenant_to_business('w6-port-operator@example.test','w6-export-b',
 jsonb_build_object('tenantId','w6-export-b','tenantStableId','e6000000-0000-4000-8000-0000000000b1','workspaceName','Export business',
 'targetWorkspaceId',(select id from w6_workspace),'billing','{"billingType":"custom","subscriptionStatus":"active","monthlyCents":15000,"grandfathered":false}'::jsonb,
 'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('b',64));
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ((select id from w6_workspace),'e6000000-0000-4000-8000-000000000002','owner','e6000000-0000-4000-8000-000000000001'),
 ((select id from w6_workspace),'e6000000-0000-4000-8000-000000000003','member','e6000000-0000-4000-8000-000000000001');
insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by) values
 ('e6000000-0000-4000-8000-000000000011',(select id from w6_workspace),'Website','website',gen_random_uuid(),repeat('c',64),'e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001'),
 ('e6000000-0000-4000-8000-000000000012',(select id from w6_workspace),'Inquiries','inquiries',gen_random_uuid(),repeat('d',64),'e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001');
select public.record_tenant_client_record('w6-export-a','orders','old-order','{"amount":2500}',repeat('e',64),'2025-01-01T00:00:00Z','backfill','replace');
select public.record_tenant_client_record('w6-export-b','orders','second-order','{"amount":1500}',repeat('f',64),'2026-01-01T00:00:00Z','backfill','replace');
select public.record_tenant_client_record('w6-export-other','orders','other-order','{"amount":9999}',repeat('a',64),'2025-01-01T00:00:00Z','backfill','replace');
select public.record_tenant_client_record('w6-export-a','provider_metadata','google','{"value":{"accountId":"account-a","locationId":"location-a","access_token":"never-export"}}',repeat('b',64),now(),'backfill','replace');
create function pg_temp.w6_category(category text, offset_value integer default 0, limit_value integer default 1000) returns jsonb language sql as $$
 select public.export_workspace_v3_category((select id from w6_workspace),'e6000000-0000-4000-8000-000000000001','w6-port-operator@example.test',category,offset_value,limit_value)
$$;
select pg_temp.w6_assert(jsonb_array_length(pg_temp.w6_category('orders')->'items')=2,'old orders from both sites, no other business');
select pg_temp.w6_assert(pg_temp.w6_category('orders',0,1)->>'next'='1' and jsonb_array_length(pg_temp.w6_category('orders',2,1)->'items')=0,'paged orders');
select pg_temp.w6_assert(pg_temp.w6_category('provider_metadata')#>>'{items,0,payload,locationId}'='location-a'
 and pg_temp.w6_category('provider_metadata')::text not like '%never-export%','connection metadata allowlist, no credential');

select public.record_tenant_client_record('w6-export-a','inquiry_delivery','checkpoint:a','{"kind":"checkpoint","key":"inquiry-a:reply","value":{"status":"accepted","inquiryId":"inquiry-a","attemptId":"internal-attempt","messageDigest":"internal-digest","replyTo":"private-reply-alias@example.test"}}',repeat('c',64),now(),'dual_write','replace');
select public.record_tenant_client_record('w6-export-a','inquiry_delivery','reply_target:a','{"kind":"reply_target","key":"private-reply-alias@example.test","value":{"replyTo":"private-reply-alias@example.test","inquiryId":"inquiry-a"}}',repeat('d',64),now(),'dual_write','replace');
select pg_temp.w6_assert(jsonb_array_length(pg_temp.w6_category('inquiry_delivery')->'items')=1,'checkpoint evidence exported; internal routing index omitted');
select pg_temp.w6_assert(pg_temp.w6_category('inquiry_delivery')::text not like '%internal-attempt%' and pg_temp.w6_category('inquiry_delivery')::text not like '%internal-digest%' and pg_temp.w6_category('inquiry_delivery')::text not like '%private-reply-alias%','delivery control credentials omitted');
select pg_temp.w6_assert(jsonb_array_length(pg_temp.w6_category('systems')->'items')=2,'every System');
select pg_temp.w6_assert(not ((pg_temp.w6_category('systems')#>'{items,0}') ? 'command_digest'),'internal command digests omitted');
select pg_temp.w6_assert(jsonb_array_length(public.read_business_portfolio_billing(array['w6-export-a','w6-export-b']))=1,'one MRR row per business');
select pg_temp.w6_assert(jsonb_array_length(public.read_business_portfolio_billing(array['w6-export-a','w6-export-b'])#>'{0,tenantIds}')=2,'both sites attached');
select pg_temp.w6_denied(format($q$select public.export_workspace_v3_category(%L,'e6000000-0000-4000-8000-000000000003','w6-port-member@example.test','orders',0,100)$q$,(select id from w6_workspace)),'workspace_export_denied');
select pg_temp.w6_denied(format($q$select public.complete_workspace_exit_with_handoff(%L,'e6000000-0000-4000-8000-000000000001','w6-port-operator@example.test','pause','keep','{"kind":"stop"}','operator-exit',repeat('a',64),null)$q$,(select id from w6_workspace)),'workspace_exit_denied');
create temporary table w6_exit as select public.complete_workspace_exit_with_handoff((select id from w6_workspace),'e6000000-0000-4000-8000-000000000002','w6-port-owner@example.test','pause','keep','{"kind":"stop"}','owner-exit',repeat('c',64),null) as result;
select pg_temp.w6_assert(jsonb_array_length((select result#>'{state,handoff,sites}' from w6_exit))=2,'exit contains every site');
select pg_temp.w6_assert(jsonb_array_length((select result#>'{state,handoff,systems}' from w6_exit))=2,'exit contains every System');
select pg_temp.w6_assert((select result#>>'{state,handoff,dataDeleted}' from w6_exit)='false','exit never deletes');
select pg_temp.w6_assert((select count(*) from public.tenant_client_records where store='orders')>=3,'orders kept after exit');
select pg_temp.w6_assert(public.complete_workspace_exit_with_handoff((select id from w6_workspace),'e6000000-0000-4000-8000-000000000002','w6-port-owner@example.test','pause','keep','{"kind":"stop"}','owner-exit',repeat('c',64),null)->>'replayed'='true','same exit idempotent');
select pg_temp.w6_assert(not has_function_privilege('authenticated','public.read_business_portfolio_billing(text[])','execute')
 and not has_function_privilege('service_role','public.export_workspace_v3_category_before_w6(uuid,uuid,text,text,integer,integer)','execute'),'only public guarded RPCs exposed');
rollback;
