-- Purge inquiry data with its lead when the 365-day detached-lead retention
-- window expires. Earlier event/reply tables were append-only but had no
-- retention path, so their visitor payloads outlived tenant_leads forever.
begin;
set local lock_timeout = '3s';

create or replace function public.inquiry_events_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Only purge_expired_tenant_leads sets this transaction-local guard, and it
  -- restores the prior value before returning. Normal callers still cannot
  -- update or delete history.
  if tg_op = 'DELETE' and current_setting('strelva.purging_expired_tenant_leads', true) = 'on' then
    return old;
  end if;
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
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 10000);
  v_ids uuid[];
  v_prior_guard text := current_setting('strelva.purging_expired_tenant_leads', true);
  v_purged bigint;
  v_tenants bigint;
begin
  select coalesce(array_agg(doomed.id), '{}'::uuid[]) into v_ids
  from (
    select id from public.tenant_leads
    where retain_until is not null and retain_until <= clock_timestamp() and workspace_id is null
    order by retain_until, id limit v_limit for update skip locked
  ) doomed;

  if cardinality(v_ids) = 0 then
    return jsonb_build_object('purged', 0, 'tenants', 0);
  end if;

  perform set_config('strelva.purging_expired_tenant_leads', 'on', true);

  -- Delete dependent reply state child-first. The event tables remain
  -- immutable to ordinary writes; the scoped guard above permits this purge.
  delete from public.inquiry_workspace_message_events e
    using public.inquiry_workspace_messages m
    where e.message_id = m.id and m.lead_row_id = any(v_ids);
  delete from public.inquiry_workspace_messages where lead_row_id = any(v_ids);
  delete from public.inquiry_engine_reply_claims where lead_row_id = any(v_ids);
  delete from public.connected_inquiry_owner_notice_repairs where lead_row_id = any(v_ids);
  delete from public.connected_inquiry_owner_notices where lead_row_id = any(v_ids);
  delete from public.inquiry_events e using public.tenant_leads l
    where l.id = any(v_ids) and e.lead_id = l.lead_id
      and ((l.tenant_stable_id is not null and e.tenant_stable_id = l.tenant_stable_id)
        or (l.connected_site_id is not null and e.connected_site_id = l.connected_site_id));

  -- These inquiry copies are keyed by stable tenant and public lead id rather
  -- than by a foreign key, so they need the same explicit retention cleanup.
  delete from public.tenant_client_records r using public.tenant_leads l
    where l.id = any(v_ids) and l.tenant_stable_id is not null
      and r.tenant_stable_id = l.tenant_stable_id and r.record_id = l.lead_id
      and r.store in ('inquiry_timeline', 'inquiry_reply', 'spam_held');
  delete from public.inquiry_record_overlays o using public.tenant_leads l
    where l.id = any(v_ids) and o.tenant_stable_id = l.tenant_stable_id and o.inquiry_id = l.lead_id;
  delete from public.booking_inquiry_offers b using public.tenant_leads l
    where l.id = any(v_ids) and b.tenant_stable_id = l.tenant_stable_id and b.inquiry_id = l.lead_id;

  -- The remaining inquiry FK (inquiry_booking_offers) has ON DELETE CASCADE.
  with deleted as (
    delete from public.tenant_leads l using unnest(v_ids) doomed(id)
    where l.id = doomed.id
    returning l.tenant_stable_id, l.tenant_slug_at_capture, l.captured_at,
      l.site_name_at_delete, l.tenant_deleted_at, l.retain_until
  ), receipts as (
    insert into public.tenant_lead_purges(tenant_stable_id, tenant_slug, site_name, tenant_deleted_at, retain_until, purged_count)
      select tenant_stable_id, (array_agg(tenant_slug_at_capture order by captured_at desc))[1], max(site_name_at_delete),
          min(tenant_deleted_at), max(retain_until), count(*)
        from deleted group by tenant_stable_id
      returning purged_count
  )
  select coalesce(sum(purged_count), 0), count(*) into v_purged, v_tenants from receipts;

  perform set_config('strelva.purging_expired_tenant_leads', coalesce(v_prior_guard, ''), true);
  return jsonb_build_object('purged', v_purged, 'tenants', v_tenants);
end;
$$;

revoke all on function public.purge_expired_tenant_leads(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_tenant_leads(integer) to service_role;
revoke all on function public.inquiry_events_immutable() from public, anon, authenticated;
commit;
