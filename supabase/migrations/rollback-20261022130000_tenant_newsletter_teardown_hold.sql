-- No records, constraints, immutable guards or receipt authority changed.
begin;
set local lock_timeout='3s';
drop function public.tenant_cleanup_teardown_blockers(text);
alter function public.tenant_cleanup_teardown_blockers_before_newsletter(text) rename to tenant_cleanup_teardown_blockers;
grant execute on function public.tenant_cleanup_teardown_blockers(text) to service_role;
create or replace function public.deprovision_tenant_guarded_before_cleanup(
  p_tenant_id text, p_force boolean default false,
  p_require_inquiry_export boolean default false, p_retain_receipts boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stable uuid; v_status text; v_counts jsonb; v_paused bigint;
begin
  if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])$'
    or p_tenant_id=any(array['www','admin','app','api']::text[])
    or p_force is null or p_require_inquiry_export is null or p_retain_receipts is null then
    raise exception 'tenant_teardown_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
  select stable_id,subscription_status into v_stable,v_status from public.tenants where id=p_tenant_id for update;
  if not p_force and (p_tenant_id=any(array['gldf','rohlax']::text[])
    or v_status=any(array['active','trialing','past_due']::text[])
    or exists(select 1 from public.build_payments where tenant_id=p_tenant_id)) then
    raise exception 'tenant_teardown_active_subscription';
  end if;
  if exists(select 1 from public.website_document_publications where tenant_id=p_tenant_id)
    or exists(select 1 from public.website_hosted_tenant_reservations where tenant_id=p_tenant_id or tenant_stable_id=v_stable)
    or exists(select 1 from public.public_website_booking_grants where tenant_stable_id=v_stable)
    or exists(select 1 from public.public_website_bookings where tenant_stable_id=v_stable) then
    raise exception 'tenant_teardown_blocked_by_workspace_owned_records';
  end if;
  -- Failures after this point roll back the pause and all deletions together.
  if p_require_inquiry_export then perform public.assert_tenant_inquiry_export(p_tenant_id); end if;
  v_paused:=public.pause_tenant_systems(p_tenant_id);
  if p_require_inquiry_export then
    if p_retain_receipts then v_counts:=public.deprovision_tenant_rows_retained_after_inquiry_export(p_tenant_id);
    else v_counts:=public.deprovision_tenant_rows_after_inquiry_export(p_tenant_id); end if;
  elsif p_retain_receipts then v_counts:=public.deprovision_tenant_rows_retained(p_tenant_id);
  else v_counts:=public.deprovision_tenant_rows(p_tenant_id); end if;
  return jsonb_build_object('counts',v_counts,'paused',v_paused);
end $$;
revoke all on function public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean) from public,anon,authenticated,service_role;
commit;
