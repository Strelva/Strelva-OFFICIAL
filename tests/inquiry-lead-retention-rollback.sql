\set ON_ERROR_STOP on
-- Persist one fictional purge receipt so the guarded rollback stop point can
-- be tested. The disposable harness database is discarded after this check.
insert into public.tenants(id,site_name) values ('inquiry-retention-rollback-fixture','Retention rollback fixture');
insert into public.tenant_leads(id,tenant_stable_id,tenant_slug_at_capture,workspace_id,lead_id,submission_hash,
  name,source,fields,captured_at,recorded_via,tenant_deleted_at,site_name_at_delete,retain_until)
select 'f5380000-0000-4000-8000-000000000101',stable_id,'inquiry-retention-rollback-fixture',null,'lead_expired','rollback',
  'Visitor','public-form','{}',clock_timestamp(),'dual_write',clock_timestamp()-interval '366 days',site_name,clock_timestamp()-interval '1 day'
from public.tenants where id='inquiry-retention-rollback-fixture';
select public.purge_expired_tenant_leads(10);
do $$ begin
  if not exists(select 1 from public.tenant_lead_purges where tenant_slug='inquiry-retention-rollback-fixture'
    and inquiry_purge_version='20261017110000') then
    raise exception 'retention purge implementation marker missing';
  end if;
end $$;
