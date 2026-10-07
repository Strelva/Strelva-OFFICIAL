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
 ('e6570000-0000-4000-8000-000000000001','w6-recovery-operator@example.test',now()),
 ('e6570000-0000-4000-8000-000000000002','w6-recovery-owner@example.test',now()),
 ('e6570000-0000-4000-8000-000000000003','w6-recovery-member@example.test',now());
insert into public.super_admins(user_id,email) values ('e6570000-0000-4000-8000-000000000001','w6-recovery-operator@example.test');
insert into public.tenants(id,stable_id,site_name,active,owner_email) values
 ('w6-recovery-site-a','e6570000-0000-4000-8000-0000000000a1','Store A',true,'w6-recovery-owner@example.test'),
 ('w6-recovery-site-b','e6570000-0000-4000-8000-0000000000b1','Store B',true,'w6-recovery-owner@example.test'),
 ('w6-recovery-site-other','e6570000-0000-4000-8000-0000000000c1','Other',true,'other@example.test');
create temporary table w6_workspace(id uuid);
insert into w6_workspace select (public.convert_tenant_to_business('w6-recovery-operator@example.test','w6-recovery-site-a',
 jsonb_build_object('tenantId','w6-recovery-site-a','tenantStableId','e6570000-0000-4000-8000-0000000000a1','workspaceName','Export business',
 'billing','{"billingType":"custom","subscriptionStatus":"active","monthlyCents":15000,"grandfathered":false}'::jsonb,
 'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('a',64))->>'workspaceId')::uuid;
select public.convert_tenant_to_business('w6-recovery-operator@example.test','w6-recovery-site-b',
 jsonb_build_object('tenantId','w6-recovery-site-b','tenantStableId','e6570000-0000-4000-8000-0000000000b1','workspaceName','Export business',
 'targetWorkspaceId',(select id from w6_workspace),'billing','{"billingType":"custom","subscriptionStatus":"active","monthlyCents":15000,"grandfathered":false}'::jsonb,
 'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('b',64));
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ((select id from w6_workspace),'e6570000-0000-4000-8000-000000000002','owner','e6570000-0000-4000-8000-000000000001'),
 ((select id from w6_workspace),'e6570000-0000-4000-8000-000000000003','member','e6570000-0000-4000-8000-000000000001');

create temporary table recovery_build as select public.enqueue_workspace_export_recovery((select id from w6_workspace),'e6570000-0000-4000-8000-000000000001','w6-recovery-operator@example.test') as result;
create temporary table recovery_claim as select public.claim_workspace_export_recovery(((select result from recovery_build)->>'buildId')::uuid) as result;
select pg_temp.w6_assert(public.claim_workspace_export_recovery(((select result from recovery_build)->>'buildId')::uuid) is null,'active lease excludes second worker');
select pg_temp.w6_assert((select result->>'deliverTo' from recovery_claim)='w6-recovery-owner@example.test','delivery resolves business owner');
select public.write_workspace_export_recovery(((select result from recovery_claim)->>'buildId')::uuid,((select result from recovery_claim)->>'leaseToken')::uuid,'append_workspace_export_build_part','{"p_part":0,"p_body":"partial"}');
update public.workspace_export_recovery set lease_until=clock_timestamp()-interval '1 second';
create temporary table recovery_reclaim as select public.claim_workspace_export_recovery(((select result from recovery_build)->>'buildId')::uuid) as result;
select pg_temp.w6_assert((select count(*) from public.workspace_export_build_parts)=0,'restart clears unfinished parts');
select pg_temp.w6_assert((select result->>'leaseToken' from recovery_claim)<>(select result->>'leaseToken' from recovery_reclaim),'restart fences old worker');
select pg_temp.w6_denied(format($q$select public.write_workspace_export_recovery(%L,%L,'append_workspace_export_build_part','{"p_part":0,"p_body":"stale"}')$q$,(select result->>'buildId' from recovery_claim),(select result->>'leaseToken' from recovery_claim)),'workspace_export_lease_lost');
select public.write_workspace_export_recovery(((select result from recovery_reclaim)->>'buildId')::uuid,((select result from recovery_reclaim)->>'leaseToken')::uuid,'append_workspace_export_build_part','{"p_part":0,"p_body":"complete"}');
select public.write_workspace_export_recovery(((select result from recovery_reclaim)->>'buildId')::uuid,((select result from recovery_reclaim)->>'leaseToken')::uuid,'complete_workspace_export_build',jsonb_build_object('p_manifest','{"included":[]}'::jsonb,'p_token_hash',repeat('a',64),'p_category_counts','{}'::jsonb,'tokenCiphertext','enc:v1:fixture','tenantIds','["w6-recovery-site-a"]'::jsonb));
select public.write_workspace_export_recovery(((select result from recovery_reclaim)->>'buildId')::uuid,((select result from recovery_reclaim)->>'leaseToken')::uuid,'delivery_failed','{}');
update public.workspace_export_recovery set lease_until=clock_timestamp()-interval '1 second';
create temporary table delivery_claim as select public.claim_workspace_export_recovery(((select result from recovery_build)->>'buildId')::uuid) as result;
select pg_temp.w6_assert((select result->>'stage' from delivery_claim)='delivery','ready archives retry email without rebuilding');
select public.write_workspace_export_recovery(((select result from delivery_claim)->>'buildId')::uuid,((select result from delivery_claim)->>'leaseToken')::uuid,'delivered','{}');
select pg_temp.w6_assert(public.claim_workspace_export_recovery(((select result from recovery_build)->>'buildId')::uuid) is null,'accepted delivery completes queue');
select pg_temp.w6_assert((select token_ciphertext is null from public.workspace_export_recovery),'delivery drops credential copy');
-- The queue has bounded retries and explicit terminal state after three interrupted workers.
create temporary table exhausted_build as select public.enqueue_workspace_export_recovery((select id from w6_workspace),'e6570000-0000-4000-8000-000000000001','w6-recovery-operator@example.test') as result;
update public.workspace_export_recovery set attempts=3,lease_until=clock_timestamp()-interval '1 second' where build_id=((select result from exhausted_build)->>'buildId')::uuid;
select public.claim_workspace_export_recovery();
select pg_temp.w6_assert((select failure='export_worker_attempts_exhausted' from public.workspace_export_builds where id=((select result from exhausted_build)->>'buildId')::uuid),'three attempts terminal with evidence');
select pg_temp.w6_assert(not has_table_privilege('authenticated','public.workspace_export_recovery','SELECT') and not has_function_privilege('anon','public.claim_workspace_export_recovery(uuid)','EXECUTE'),'queue private');
-- An additional signed-in owner still sends only to the record's recipient.
insert into public.users(id,email,verified_at) values('e6570000-0000-4000-8000-000000000004','second-owner@example.test',now());
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
  values((select id from w6_workspace),'e6570000-0000-4000-8000-000000000004','owner','e6570000-0000-4000-8000-000000000001');
select pg_temp.w6_assert(public.start_workspace_export_build((select id from w6_workspace),'e6570000-0000-4000-8000-000000000004','second-owner@example.test')->>'deliverTo'='w6-recovery-owner@example.test','all archive emails follow record owner rule');
rollback;
