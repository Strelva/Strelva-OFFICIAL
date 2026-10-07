-- Authority cutover uses this additive teardown wrapper. The original RPC
-- remains the flags-off path. Existing retained lead rows never cascade.
begin;
set local lock_timeout = '3s';
create function public.assert_tenant_inquiry_export(p_tenant_id text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stable uuid; v_workspace uuid; v_latest timestamptz;
begin
  select stable_id into v_stable from public.tenants where id=p_tenant_id for update;
  if v_stable is null then return; end if;
  select max(recorded_at) into v_latest from public.tenant_leads where tenant_stable_id=v_stable;
  if v_latest is null then return; end if;
  select workspace_id into v_workspace from public.tenant_workspace_links where tenant_stable_id=v_stable;
  if not exists(select 1 from public.workspace_export_builds b where b.workspace_id=v_workspace
    and b.status='ready' and b.schema_version=3 and b.created_at>=v_latest and b.expires_at>clock_timestamp()) then
    raise exception 'inquiry_export_required_before_teardown';
  end if;
end $$;
create function public.deprovision_tenant_rows_after_inquiry_export(p_tenant_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.assert_tenant_inquiry_export(p_tenant_id);
  return public.deprovision_tenant_rows(p_tenant_id);
end $$;
revoke all on function public.assert_tenant_inquiry_export(text),public.deprovision_tenant_rows_after_inquiry_export(text) from public,anon,authenticated;
grant execute on function public.assert_tenant_inquiry_export(text),public.deprovision_tenant_rows_after_inquiry_export(text) to service_role;
commit;
