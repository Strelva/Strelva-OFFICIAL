-- Restore the prior purge behavior only before this version has removed leads.
-- Deleted visitor payloads are unrecoverable; receipts make this stop point durable.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Serialize against purge transactions before checking their durable receipt.
lock table public.tenant_lead_purges in access exclusive mode;

do $$
begin
  if exists (
    select 1 from public.tenant_lead_purges
    where inquiry_purge_version = '20261017110000'
  ) then
    raise exception 'inquiry_lead_retention_rollback_requires_data_preservation';
  end if;
end
$$;

alter table public.tenant_lead_purges drop column inquiry_purge_version;

create or replace function public.inquiry_events_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- A workspace deletion may clear the reference (on delete set null); nothing else changes.
  if tg_op = 'UPDATE' and new.workspace_id is null and old.workspace_id is not null
    and (to_jsonb(new) - 'workspace_id') = (to_jsonb(old) - 'workspace_id') then
    return new;
  end if;
  raise exception 'inquiry_events_immutable';
end;
$$;

create or replace function public.purge_expired_tenant_leads(p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 10000); v_purged bigint; v_tenants bigint;
begin
  with doomed as (
    select id from public.tenant_leads
      where retain_until is not null and retain_until <= clock_timestamp() and workspace_id is null
      order by retain_until, id limit v_limit for update skip locked
  ), deleted as (
    delete from public.tenant_leads l using doomed d where l.id = d.id
      returning l.tenant_stable_id, l.tenant_slug_at_capture, l.captured_at, l.site_name_at_delete, l.tenant_deleted_at, l.retain_until
  ), receipts as (
    insert into public.tenant_lead_purges(tenant_stable_id, tenant_slug, site_name, tenant_deleted_at, retain_until, purged_count)
      select tenant_stable_id, (array_agg(tenant_slug_at_capture order by captured_at desc))[1], max(site_name_at_delete),
          min(tenant_deleted_at), max(retain_until), count(*)
        from deleted group by tenant_stable_id
      returning purged_count
  )
  select coalesce(sum(purged_count), 0), count(*) into v_purged, v_tenants from receipts;
  return jsonb_build_object('purged', v_purged, 'tenants', v_tenants);
end;
$$;

revoke all on function public.purge_expired_tenant_leads(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_tenant_leads(integer) to service_role;
revoke all on function public.inquiry_events_immutable() from public, anon, authenticated;
commit;
