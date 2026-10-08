\set ON_ERROR_STOP on
-- Disposable-cluster-only roundtrip. Run after the 655 contracts, before
-- later export/exit migrations replace these wrappers.
-- Fictional rows are committed because the migration scripts commit their DDL.
begin;
insert into public.users(id,email,verified_at) values
 ('e6550000-0000-4000-8000-000000000001','w6-report-roundtrip@example.test',now());
insert into public.super_admins(user_id,email) values
 ('e6550000-0000-4000-8000-000000000001','w6-report-roundtrip@example.test');
insert into public.tenants(id,stable_id,site_name,active,owner_email) values
 ('w6-report-roundtrip','e6550000-0000-4000-8000-0000000000a1','Roundtrip fixture',true,'owner@example.test');
create temporary table w6_report_roundtrip(workspace_id uuid);
insert into w6_report_roundtrip select (public.convert_tenant_to_business('w6-report-roundtrip@example.test','w6-report-roundtrip',
 jsonb_build_object('tenantId','w6-report-roundtrip','tenantStableId','e6550000-0000-4000-8000-0000000000a1',
 'workspaceName','Roundtrip fixture','billing',null,'account',null,'patch','{}'::jsonb,'contacts','[]'::jsonb),gen_random_uuid(),repeat('a',64))->>'workspaceId')::uuid;
create temporary table w6_report_tokens(month date,token uuid);
insert into w6_report_tokens select month,(public.reserve_business_outcome_report_delivery((select workspace_id from w6_report_roundtrip),month)->>'token')::uuid
 from unnest(array['2026-08-01'::date,'2026-09-01'::date,'2026-10-01'::date]) month;
select public.record_business_outcome_report_delivery((select workspace_id from w6_report_roundtrip),'2026-08-01',
 (select token from w6_report_tokens where month='2026-08-01'),'accepted');
select public.record_business_outcome_report_delivery((select workspace_id from w6_report_roundtrip),'2026-09-01',
 (select token from w6_report_tokens where month='2026-09-01'),'unknown');
-- October stays dispatching, modelling a crash after provider dispatch.
commit;
\ir ../supabase/migrations/rollback-20261010165500_business_portability.sql

do $$ begin
 if (select count(*) from public.business_outcome_report_deliveries d join w6_report_roundtrip r using(workspace_id))<>3
  or not exists(select 1 from public.business_outcome_report_deliveries d join w6_report_roundtrip r using(workspace_id) where d.month='2026-08-01' and d.status='accepted')
  or not exists(select 1 from public.business_outcome_report_deliveries d join w6_report_roundtrip r using(workspace_id) where d.month='2026-09-01' and d.status='unknown')
  or not exists(select 1 from public.business_outcome_report_deliveries d join w6_report_roundtrip r using(workspace_id) where d.month='2026-10-01' and d.status='dispatching') then
  raise exception 'rollback lost provider delivery evidence'; end if;
 if has_table_privilege('service_role','public.business_outcome_report_deliveries','SELECT')
  or has_table_privilege('authenticated','public.business_outcome_report_deliveries','SELECT') then
  raise exception 'rollback exposed private delivery evidence'; end if;
end $$;
\ir ../supabase/migrations/20261010165500_business_portability.sql

do $$ declare v_month date; begin
 for v_month in select month from w6_report_tokens loop
  if public.reserve_business_outcome_report_delivery((select workspace_id from w6_report_roundtrip),v_month) is not null then
   raise exception 'reapply retried already dispatched report %',v_month; end if;
 end loop;
 if exists(select 1 from public.business_outcome_report_deliveries d join w6_report_roundtrip r using(workspace_id)
  join w6_report_tokens t using(month) where d.token<>t.token) then raise exception 'reapply replaced durable delivery tokens'; end if;
 if has_table_privilege('service_role','public.business_outcome_report_deliveries','SELECT')
  or has_function_privilege('authenticated','public.reserve_business_outcome_report_delivery(uuid,date)','EXECUTE') then
  raise exception 'reapply exposed delivery authority'; end if;
end $$;
