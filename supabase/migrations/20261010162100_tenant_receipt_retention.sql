-- Finding 19 default: preserve the five historical receipt tables. Teardown
-- through this opt-in adapter also expires outstanding agency draft grants.
set lock_timeout = '3s';
create table public.tenant_deprovision_retention_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null,
  tenant_stable_id uuid,
  retained_counts jsonb not null,
  policy text not null default 'keep_receipts' check(policy='keep_receipts'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.tenant_deprovision_retention_receipts enable row level security;
revoke all on public.tenant_deprovision_retention_receipts from public,anon,authenticated,service_role;
create function public.deprovision_tenant_rows_retained(p_tenant_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_counts jsonb := '{}'::jsonb; v_stable uuid; v_table text; v_count bigint; v_removed jsonb;
begin
  select stable_id into v_stable from public.tenants where id=p_tenant_id for update;
  foreach v_table in array array['agency_managed_website_draft_grants','agency_managed_website_draft_preparations',
    'agency_managed_website_draft_revisions','outside_write_receipts','report_snapshots'] loop
    execute format('select count(*) from public.%I where tenant_id=$1',v_table) into v_count using p_tenant_id;
    v_counts := v_counts || jsonb_build_object(v_table,v_count);
  end loop;
  -- Keep original author/revocation fields as evidence; an expired grant gives
  -- no publish authority and cannot authorize a later reuse of this slug.
  update public.agency_managed_website_draft_grants
    set expires_at=greatest(created_at+interval '1 microsecond',clock_timestamp()),updated_at=clock_timestamp()
    where tenant_id=p_tenant_id and status='active' and expires_at>clock_timestamp();
  v_removed := public.deprovision_tenant_rows(p_tenant_id);
  insert into public.tenant_deprovision_retention_receipts(tenant_slug,tenant_stable_id,retained_counts)
    values(p_tenant_id,v_stable,v_counts);
  return v_removed;
end $$;
revoke all on function public.deprovision_tenant_rows_retained(text) from public,anon,authenticated;
grant execute on function public.deprovision_tenant_rows_retained(text) to service_role;
