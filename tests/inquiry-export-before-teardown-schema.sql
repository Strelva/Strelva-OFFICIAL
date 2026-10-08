begin;
insert into public.users(id,email,verified_at) values('e6000000-0000-4000-8000-000000000001','inquiry-export-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('e6000000-0000-4000-8000-000000000002','customer','Export fixture','e6000000-0000-4000-8000-000000000001');
insert into public.tenants(id,site_name) values('export-leads-fixture','Export leads fixture');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) select stable_id,id,'e6000000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'{}'::jsonb from public.tenants where id='export-leads-fixture';
select public.record_tenant_lead('export-leads-fixture','{"leadId":"lead_export","submissionHash":"exporthash","name":"Dana","capturedAt":"2026-10-01T00:00:00Z"}','dual_write');
do $$ begin
  begin perform public.assert_tenant_inquiry_export('export-leads-fixture'); raise exception 'missing export accepted';
  exception when others then if sqlerrm<>'inquiry_export_required_before_teardown' then raise; end if; end;
end $$;
insert into public.workspace_export_builds(workspace_id,requested_by,requester_role,status,manifest,download_token_hash,created_at,completed_at,expires_at)
values('e6000000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-000000000001','owner','ready','{}',repeat('a',64),clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 day');
select public.assert_tenant_inquiry_export('export-leads-fixture');
-- A newly captured lead invalidates that older export, including old submissions backfilled later.
select pg_sleep(0.01);
select public.record_tenant_lead('export-leads-fixture','{"leadId":"lead_after_export","submissionHash":"exportnew","name":"Sam","capturedAt":"2026-10-02T00:00:00Z"}','dual_write');
do $$ begin
  begin perform public.deprovision_tenant_rows_after_inquiry_export('export-leads-fixture'); raise exception 'stale export accepted';
  exception when others then if sqlerrm<>'inquiry_export_required_before_teardown' then raise; end if; end;
  if not exists(select 1 from public.tenants where id='export-leads-fixture') then raise exception 'tenant was deleted'; end if;
  if has_function_privilege('authenticated','public.deprovision_tenant_rows_after_inquiry_export(text)','execute') then raise exception 'export teardown privilege'; end if;
end $$;
update public.workspace_export_builds set created_at=clock_timestamp(),completed_at=clock_timestamp() where workspace_id='e6000000-0000-4000-8000-000000000002';
select public.deprovision_tenant_rows_after_inquiry_export('export-leads-fixture');
do $$ begin if (select count(*) from public.tenant_leads where lead_id in ('lead_export','lead_after_export')) <> 2 then raise exception 'lead evidence erased'; end if; end $$;
rollback;
