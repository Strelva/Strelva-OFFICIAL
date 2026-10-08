-- Close composite mirrored-copy and orphan-event visitor-data retention gaps.
-- Existing business evidence stays attached; deprovisioned orphan payloads use
-- the established 365-day detached-record interval, retaining minimal outcomes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';

alter table public.inquiry_events add column if not exists retain_until timestamptz;
alter table public.inquiry_events add column if not exists retention_minimized_at timestamptz;
create index if not exists inquiry_events_retention_idx on public.inquiry_events(retain_until,id)
  where retain_until is not null and retention_minimized_at is null;

create table if not exists public.inquiry_retention_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_stable_id uuid,
  connected_site_id uuid,
  minimized_count integer not null check (minimized_count>0),
  retain_until timestamptz not null,
  minimized_at timestamptz not null default clock_timestamp(),
  check (num_nonnulls(tenant_stable_id,connected_site_id)=1)
);
alter table public.inquiry_retention_receipts enable row level security;
revoke all on public.inquiry_retention_receipts from public,anon,authenticated,service_role;
create or replace trigger inquiry_retention_receipts_immutable before update or delete on public.inquiry_retention_receipts
  for each row execute function public.tenant_lead_purge_immutable();


create or replace function public.inquiry_events_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Only purge_expired_tenant_leads sets this transaction-local guard, and it
  -- restores the prior value before returning. Normal callers still cannot
  -- update or delete history.
  if tg_op = 'DELETE' and current_setting('strelva.purging_expired_tenant_leads', true) = 'on' then
    return old;
  end if;
  -- Lifecycle stamps and expired orphan minimization are restricted to their
  -- structured fields. Raw business history cannot otherwise be rewritten.
  if tg_op = 'UPDATE' and current_setting('strelva.purging_expired_tenant_leads',true)='on'
    and (to_jsonb(new)-array['workspace_id','retain_until','retention_minimized_at','detail','actor_id','dedupe_key']::text[])
      =(to_jsonb(old)-array['workspace_id','retain_until','retention_minimized_at','detail','actor_id','dedupe_key']::text[]) then
    return new;
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
  v_minimized bigint := 0;
  v_event_ids uuid[];
begin
  select coalesce(array_agg(doomed.id), '{}'::uuid[]) into v_ids
  from (
    select id from public.tenant_leads
    where retain_until is not null and retain_until <= clock_timestamp() and workspace_id is null
    order by retain_until, id limit v_limit for update skip locked
  ) doomed;


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
      and r.tenant_stable_id = l.tenant_stable_id and (
        (r.store in ('inquiry_reply','spam_held') and r.record_id=l.lead_id)
        or (r.store='inquiry_timeline' and (r.record_id=l.lead_id
          or (left(r.record_id,length(l.lead_id)+1)=l.lead_id||':' and substring(r.record_id from length(l.lead_id)+2) ~ '^[a-f0-9]{32}$')))
        or (r.store='inquiry_delivery' and (r.payload->'value'->>'inquiryId'=l.lead_id
          or (left(r.payload->'value'->>'inquiryId',length(l.lead_id)+15)=l.lead_id||'_notice_repair_'
            and substring(r.payload->'value'->>'inquiryId' from length(l.lead_id)+16) ~ '^[a-f0-9]{32}$')))
      );
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

  -- No matching lead survives, no active origin/business holds this history,
  -- and its explicit lifecycle/fallback deadline has elapsed. Keep outcome
  -- evidence, but remove arbitrary visitor/contact/body payloads.
  select coalesce(array_agg(candidate.id),'{}'::uuid[]) into v_event_ids from (
    select e.id from public.inquiry_events e
    where e.retain_until<=clock_timestamp() and e.retention_minimized_at is null
      and e.workspace_id is null
      and not exists(select 1 from public.tenants t where t.stable_id=e.tenant_stable_id)
      and not exists(select 1 from public.connected_sites s where s.id=e.connected_site_id)
      and not exists(select 1 from public.tenant_workspace_links k where
        k.tenant_stable_id=e.tenant_stable_id or k.receipt->>'tenantStableId'=e.tenant_stable_id::text)
      and not exists(select 1 from public.tenant_leads l where l.lead_id=e.lead_id
        and ((l.tenant_stable_id=e.tenant_stable_id) or (l.connected_site_id=e.connected_site_id)))
    order by e.retain_until,e.id limit greatest(v_limit-cardinality(v_ids),0) for update skip locked
  ) candidate;
  with minimized as (
    update public.inquiry_events e set
      detail=jsonb_strip_nulls(jsonb_build_object('retention','minimized',
        'status',case when e.detail->>'status' in ('sending','suppressed','accepted','accepted_unverified','verified','delivered','deferred','bounced','failed','unknown','received') then e.detail->>'status' end,
        'action',case when e.detail->>'action' in ('reply','send_message','owner_notification','follow_up','escalate','forward') then e.detail->>'action' end,
        'ownerNotice',case when e.detail->'ownerNotice'='true'::jsonb then true end)),
      actor_id=case when e.actor_id ~ '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' then e.actor_id end,
      dedupe_key=null,retention_minimized_at=clock_timestamp()
    where e.id=any(v_event_ids)
    returning e.tenant_stable_id,e.connected_site_id,e.retain_until
  ), receipts as (
    insert into public.inquiry_retention_receipts(tenant_stable_id,connected_site_id,minimized_count,retain_until)
    select tenant_stable_id,connected_site_id,count(*),max(retain_until) from minimized group by tenant_stable_id,connected_site_id
    returning minimized_count
  ) select coalesce(sum(minimized_count),0) into v_minimized from receipts;

  perform set_config('strelva.purging_expired_tenant_leads', coalesce(v_prior_guard, ''), true);
  return jsonb_build_object('purged', v_purged, 'tenants', v_tenants, 'minimized', v_minimized);
end;
$$;


-- Stamp orphan events at the actual deletion boundary. A converted tenant's
-- unanchored history follows its business; deleting a site does not erase it.
create or replace function public.inquiry_events_retention_lifecycle() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior_guard text:=current_setting('strelva.purging_expired_tenant_leads',true); linked_workspace uuid;
begin
  perform set_config('strelva.purging_expired_tenant_leads','on',true);
  if tg_table_name='tenants' then
    select workspace_id into linked_workspace from public.tenant_workspace_links where tenant_stable_id=old.stable_id;
    update public.inquiry_events e set
      workspace_id=coalesce(e.workspace_id,linked_workspace),
      retain_until=case when coalesce(e.workspace_id,linked_workspace) is null
        then clock_timestamp()+public.tenant_lead_retention() else e.retain_until end
      where e.tenant_stable_id=old.stable_id and e.retention_minimized_at is null;
  else
    update public.inquiry_events e set retain_until=clock_timestamp()+public.tenant_lead_retention()
      where e.workspace_id=old.id and e.retention_minimized_at is null
        and not exists(select 1 from public.tenants t where t.stable_id=e.tenant_stable_id);
  end if;
  perform set_config('strelva.purging_expired_tenant_leads',coalesce(prior_guard,''),true);
  return old;
end $$;
create or replace trigger inquiry_events_retention_on_tenant_delete before delete on public.tenants
  for each row execute function public.inquiry_events_retention_lifecycle();
create or replace trigger inquiry_events_retention_on_workspace_delete before delete on public.workspaces
  for each row execute function public.inquiry_events_retention_lifecycle();
revoke all on function public.inquiry_events_retention_lifecycle() from public,anon,authenticated,service_role;

-- Historical orphans lack a deletion stamp. The immutable event timestamp is
-- their fallback, never earlier than an existing tenant's retained-lead deadline.
-- Active tenant/site/business origins and matching leads are always excluded.
select set_config('strelva.purging_expired_tenant_leads','on',true);
-- Deprovision clears a link's tenant FK, but its conversion receipt retains
-- the immutable tenant identity. Recover that business attachment first.
update public.inquiry_events e set workspace_id=k.workspace_id,retain_until=null
from public.tenant_workspace_links k where e.workspace_id is null and e.retention_minimized_at is null
  and (k.tenant_stable_id=e.tenant_stable_id or k.receipt->>'tenantStableId'=e.tenant_stable_id::text);
update public.inquiry_events e set workspace_id=s.business_workspace_id,retain_until=null
from public.connected_sites s where e.workspace_id is null and e.connected_site_id=s.id and e.retention_minimized_at is null;
update public.inquiry_events e set retain_until=greatest(e.at+public.tenant_lead_retention(),
  (select max(p.retain_until) from public.tenant_lead_purges p where p.tenant_stable_id=e.tenant_stable_id))
where e.workspace_id is null and e.retain_until is null and e.retention_minimized_at is null
  and not exists(select 1 from public.tenants t where t.stable_id=e.tenant_stable_id)
  and not exists(select 1 from public.connected_sites s where s.id=e.connected_site_id)
  and not exists(select 1 from public.tenant_leads l where l.lead_id=e.lead_id
    and (l.tenant_stable_id=e.tenant_stable_id or l.connected_site_id=e.connected_site_id));
select set_config('strelva.purging_expired_tenant_leads','',true);

revoke all on function public.purge_expired_tenant_leads(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_tenant_leads(integer) to service_role;
revoke all on function public.inquiry_events_immutable() from public, anon, authenticated;
commit;
