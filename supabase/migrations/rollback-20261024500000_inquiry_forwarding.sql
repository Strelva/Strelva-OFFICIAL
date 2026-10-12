-- Inverse of 20261024500000_inquiry_forwarding.sql. Restores the prior catalog
-- exactly. Refuses once any address or forwarded inquiry exists: dropping them
-- would delete end-customer messages that cannot be restored.
begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.inquiry_forwarding_addresses)
    or exists (select 1 from public.tenant_leads where forwarding_address_id is not null) then
    raise exception 'inquiry_forwarding_rollback_requires_data_preservation';
  end if;
end $$;

drop function public.receive_forwarded_inquiry(text,jsonb);
drop function public.resolve_inquiry_forwarding_address(text);
drop function public.read_inquiry_forwarding(uuid,uuid,text);
drop function public.revoke_inquiry_forwarding_address(uuid,uuid,text,uuid);
drop function public.issue_inquiry_forwarding_address(uuid,uuid,text,text,boolean);
drop function public.inquiry_forwarding_json(public.inquiry_forwarding_addresses,boolean);
drop function public.inquiry_forwarding_actor(uuid,uuid,text,boolean);

create or replace function public.inquiry_lead_event_write(p_lead public.tenant_leads, p_kind text, p_actor text,
  p_actor_id text, p_detail jsonb, p_dedupe text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if p_lead.connected_site_id is null then
    return public.inquiry_event_write(p_lead.tenant_stable_id, p_lead.workspace_id, p_lead.lead_id,
      p_kind, p_actor, p_actor_id, p_detail, p_dedupe);
  end if;
  insert into public.inquiry_events(connected_site_id, workspace_id, lead_id, kind, actor, actor_id, detail, dedupe_key)
  values (p_lead.connected_site_id, p_lead.workspace_id, p_lead.lead_id, p_kind, p_actor, p_actor_id, coalesce(p_detail, '{}'::jsonb), p_dedupe)
  on conflict (connected_site_id, lead_id, dedupe_key) where connected_site_id is not null and dedupe_key is not null do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

drop index public.tenant_leads_forwarded_hash_idx;
drop index public.tenant_leads_forwarded_lead_idx;
alter table public.tenant_leads drop constraint tenant_leads_forwarded_shape;
alter table public.tenant_leads drop constraint tenant_leads_recorded_via_check;
alter table public.tenant_leads add constraint tenant_leads_recorded_via_check
  check(recorded_via in ('dual_write','repair','backfill','connected_site','spam_hold','agent'));
alter table public.tenant_leads drop constraint tenant_leads_one_origin;
alter table public.tenant_leads add constraint tenant_leads_one_origin
  check(num_nonnulls(tenant_stable_id,connected_site_id,agent_workspace_id)=1);
alter table public.tenant_leads drop column forwarding_address_id;
drop table public.inquiry_forwarding_addresses;
commit;
