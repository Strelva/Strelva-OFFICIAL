begin;
insert into public.tenants(id) values('w6-retention');
insert into public.report_snapshots(tenant_id,period,metrics) values('w6-retention','2026-10','{}');
-- Reuse the local agency authority fixture's FK graph. No live data is read.
update public.agency_managed_website_draft_grants
  set tenant_id='w6-retention',status='active',revoked_at=null,revoked_by=null,
      expires_at=clock_timestamp()+interval '7 days'
  where tenant_id='website-draft-a';
update public.agency_managed_website_draft_preparations set tenant_id='w6-retention' where tenant_id='website-draft-a';
update public.agency_managed_website_draft_revisions set tenant_id='w6-retention' where tenant_id='website-draft-a';
do $$declare v_result jsonb;
begin
  v_result:=public.deprovision_tenant_rows_retained('w6-retention');
  if exists(select 1 from public.tenants where id='w6-retention') then raise exception 'tenant not removed'; end if;
  if not exists(select 1 from public.report_snapshots where tenant_id='w6-retention') then raise exception 'receipt erased'; end if;
  if not exists(select 1 from public.tenant_deprovision_retention_receipts where tenant_slug='w6-retention' and retained_counts->>'report_snapshots'='1') then raise exception 'retention receipt missing'; end if;
  if not exists(select 1 from public.agency_managed_website_draft_grants where tenant_id='w6-retention' and expires_at<=clock_timestamp()) then raise exception 'draft grant not expired'; end if;
  if not exists(select 1 from public.agency_managed_website_draft_revisions where tenant_id='w6-retention') then raise exception 'draft history erased'; end if;
  if not exists(select 1 from public.agency_managed_website_draft_preparations where tenant_id='w6-retention') then raise exception 'preparation evidence erased'; end if;
  if has_table_privilege('authenticated','public.tenant_deprovision_retention_receipts','SELECT') then raise exception 'receipt exposed'; end if;
  if has_function_privilege('anon','public.deprovision_tenant_rows_retained(text)','EXECUTE') then raise exception 'purge exposed'; end if;
  if not (select relrowsecurity from pg_class where oid='public.tenant_deprovision_retention_receipts'::regclass) then raise exception 'retention RLS missing'; end if;
end $$;
-- A receipt failure rolls back the teardown, including grant expiry.
insert into public.tenants(id) values('w6-retention-failure');
create function pg_temp.fail_retention_receipt() returns trigger language plpgsql as $$
begin raise exception 'injected retention receipt failure'; end $$;
create trigger w6_retention_failure before insert on public.tenant_deprovision_retention_receipts
for each row execute function pg_temp.fail_retention_receipt();
do $$begin
  begin
    perform public.deprovision_tenant_rows_retained('w6-retention-failure');
    raise exception 'expected retention failure';
  exception when others then
    if sqlerrm <> 'injected retention receipt failure' then raise; end if;
  end;
  if not exists(select 1 from public.tenants where id='w6-retention-failure') then raise exception 'partial teardown after receipt failure'; end if;
end $$;
rollback;
