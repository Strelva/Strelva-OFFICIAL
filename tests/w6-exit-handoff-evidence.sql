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
 ('e6560000-0000-4000-8000-000000000001','w6-evidence-operator@example.test',now()),
 ('e6560000-0000-4000-8000-000000000002','w6-evidence-owner@example.test',now()),
 ('e6560000-0000-4000-8000-000000000003','w6-evidence-member@example.test',now());
insert into public.super_admins(user_id,email) values ('e6560000-0000-4000-8000-000000000001','w6-evidence-operator@example.test');
insert into public.tenants(id,stable_id,site_name,active,owner_email) values
 ('w6-evidence-site-a','e6560000-0000-4000-8000-0000000000a1','Store A',true,'w6-evidence-owner@example.test'),
 ('w6-evidence-site-b','e6560000-0000-4000-8000-0000000000b1','Store B',true,'w6-evidence-owner@example.test'),
 ('w6-evidence-site-other','e6560000-0000-4000-8000-0000000000c1','Other',true,'other@example.test');
create temporary table w6_workspace(id uuid);
insert into w6_workspace select (public.convert_tenant_to_business('w6-evidence-operator@example.test','w6-evidence-site-a',
 jsonb_build_object('tenantId','w6-evidence-site-a','tenantStableId','e6560000-0000-4000-8000-0000000000a1','workspaceName','Export business',
 'billing','{"billingType":"custom","subscriptionStatus":"active","monthlyCents":15000,"grandfathered":false}'::jsonb,
 'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('a',64))->>'workspaceId')::uuid;
select public.convert_tenant_to_business('w6-evidence-operator@example.test','w6-evidence-site-b',
 jsonb_build_object('tenantId','w6-evidence-site-b','tenantStableId','e6560000-0000-4000-8000-0000000000b1','workspaceName','Export business',
 'targetWorkspaceId',(select id from w6_workspace),'billing','{"billingType":"custom","subscriptionStatus":"active","monthlyCents":15000,"grandfathered":false}'::jsonb,
 'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('b',64));
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ((select id from w6_workspace),'e6560000-0000-4000-8000-000000000002','owner','e6560000-0000-4000-8000-000000000001'),
 ((select id from w6_workspace),'e6560000-0000-4000-8000-000000000003','member','e6560000-0000-4000-8000-000000000001');

-- The owner first confirms the exit; the operator records actual handoffs.
select public.complete_workspace_exit_with_handoff((select id from w6_workspace),'e6560000-0000-4000-8000-000000000002','w6-evidence-owner@example.test','pause','keep','{"kind":"stop"}','handoff-owner-exit',repeat('a',64),null);
select pg_temp.w6_denied(format($q$select public.record_workspace_exit_handoff(%L,'e6560000-0000-4000-8000-000000000002','w6-evidence-owner@example.test','e6560000-0000-4000-8000-0000000000a1','files','Owner receipt',null)$q$,(select id from w6_workspace)),'workspace_exit_denied');
select public.record_workspace_exit_handoff((select id from w6_workspace),'e6560000-0000-4000-8000-000000000001','w6-evidence-operator@example.test','e6560000-0000-4000-8000-0000000000a1','files','Repository and assets transferred on owner request',null);
select public.record_workspace_exit_handoff((select id from w6_workspace),'e6560000-0000-4000-8000-000000000001','w6-evidence-operator@example.test','e6560000-0000-4000-8000-0000000000a1','files','Repository and assets transferred on owner request',null);
select pg_temp.w6_assert((select count(*) from public.workspace_exit_handoff_receipts)=1,'completion retry is idempotent');
select pg_temp.w6_assert(public.read_workspace_exit_handoff_plan((select id from w6_workspace),'e6560000-0000-4000-8000-000000000002','w6-evidence-owner@example.test')#>>'{sites,0,steps,1,status}'='completed','owner sees recorded completion');
select pg_temp.w6_denied(format($q$select public.record_workspace_exit_handoff(%L,'e6560000-0000-4000-8000-000000000001','w6-evidence-operator@example.test','e6560000-0000-4000-8000-0000000000a1','files','Changed receipt',null)$q$,(select id from w6_workspace)),'workspace_exit_conflict: evidence already recorded');
select pg_temp.w6_denied(format($q$select public.record_workspace_exit_handoff(%L,'e6560000-0000-4000-8000-000000000001','w6-evidence-operator@example.test','e6560000-0000-4000-8000-0000000000c1','domain','Other client',null)$q$,(select id from w6_workspace)),'workspace_exit_conflict: owner exit and recorded site required');
select pg_temp.w6_denied(format($q$select public.record_workspace_exit_handoff(%L,'e6560000-0000-4000-8000-000000000001','w6-evidence-operator@example.test','e6560000-0000-4000-8000-0000000000a1','export','Unbuilt archive',gen_random_uuid())$q$,(select id from w6_workspace)),'workspace_exit_conflict: complete business export required');
-- The frozen exit record still lists sites even if current links later change.
select pg_temp.w6_denied(format($q$delete from public.tenant_workspace_links where workspace_id=%L$q$,
 (select id from w6_workspace)),'tenant_workspace_link_immutable');
select pg_temp.w6_denied(format($q$select public.unlink_tenant_from_business('w6-evidence-owner@example.test','w6-evidence-site-a',%L,gen_random_uuid(),repeat('e',64))$q$,
 (select id from w6_workspace)),'tenant_conversion_operator_required');
select public.unlink_tenant_from_business('w6-evidence-operator@example.test','w6-evidence-site-a',
 (select id from w6_workspace),gen_random_uuid(),repeat('c',64));
select public.unlink_tenant_from_business('w6-evidence-operator@example.test','w6-evidence-site-b',
 (select id from w6_workspace),gen_random_uuid(),repeat('d',64));
select pg_temp.w6_assert(not exists(select 1 from public.tenant_workspace_links where workspace_id=(select id from w6_workspace)),
 'supported unlink removes both current links');
select pg_temp.w6_assert(jsonb_array_length(public.read_workspace_exit_handoff_plan((select id from w6_workspace),'e6560000-0000-4000-8000-000000000002','w6-evidence-owner@example.test')->'sites')=2,'site history survives unlink');
select pg_temp.w6_assert(not has_table_privilege('service_role','public.workspace_exit_handoff_receipts','SELECT') and not has_function_privilege('authenticated','public.record_workspace_exit_handoff(uuid,uuid,text,uuid,text,text,uuid)','execute'),'private RPC-only evidence');
rollback;
