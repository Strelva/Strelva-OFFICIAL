-- Inquiry business facts are read at use. The operator notice list reads
-- durable evidence only and never sends mail or creates approval authority.
begin;
set local lock_timeout = '3s';

create function public.read_inquiry_business_context(p_tenant_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('workspaceId', l.workspace_id,
    'facts', coalesce((select jsonb_object_agg(f.fact_key, jsonb_build_object('value', f.value, 'verified', f.verified))
      from public.business_record_facts f where f.workspace_id = l.workspace_id), '{}'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'active', p.active)
      order by p.id) from public.business_people p where p.workspace_id = l.workspace_id), '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
      'priceText', s.price_text, 'active', s.active, 'verified', s.verified) order by s.position, s.id)
      from public.business_services s where s.workspace_id = l.workspace_id), '[]'::jsonb))
  from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
  where t.id = p_tenant_id
$$;

create function public.list_inquiry_owner_notices_not_told(p_tenant_ids text[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with latest as (
    select distinct on (e.tenant_stable_id, e.lead_id) e.*, t.id as tenant_id
    from public.inquiry_events e join public.tenants t on t.stable_id = e.tenant_stable_id
    where t.id = any(p_tenant_ids) and e.kind = 'delivery' and e.detail->>'ownerNotice' = 'true'
    order by e.tenant_stable_id, e.lead_id, e.at desc, e.id desc
  ) select coalesce(jsonb_agg(jsonb_build_object('tenantId', tenant_id, 'workspaceId', workspace_id,
    'inquiryId', lead_id, 'at', at, 'status', detail->>'status', 'reason', detail->>'reason') order by at), '[]'::jsonb)
  from latest where detail->>'status' not in ('accepted', 'accepted_unverified', 'verified', 'delivered', 'deferred')
$$;

revoke all on function public.read_inquiry_business_context(text) from public, anon, authenticated;
revoke all on function public.list_inquiry_owner_notices_not_told(text[]) from public, anon, authenticated;
grant execute on function public.read_inquiry_business_context(text) to service_role;
grant execute on function public.list_inquiry_owner_notices_not_told(text[]) to service_role;

-- An operator may repair a bounced notice only after correcting its recipient.
-- Authorization is durable and idempotent per lead + new recipient digest.
create function public.authorize_inquiry_owner_notice_repair(p_tenant_id text, p_lead_id text, p_actor_id uuid, p_recipient_digest text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare stable uuid; ws uuid; prior jsonb; dedupe text; old_digest text;
begin
  if not exists(select 1 from public.super_admins a join public.users u on u.id = a.user_id
    where a.user_id = p_actor_id and a.revoked_at is null and u.verified_at is not null)
    or p_recipient_digest is null or p_recipient_digest !~ '^[a-f0-9]{64}$' then raise exception 'inquiry_access_denied'; end if;
  select t.stable_id, l.workspace_id into stable, ws from public.tenants t
    left join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id where t.id = p_tenant_id;
  if stable is null then return false; end if;
  dedupe := 'owner-notice-repair:' || p_recipient_digest;
  if exists(select 1 from public.inquiry_events e where e.tenant_stable_id = stable and e.lead_id = p_lead_id and e.dedupe_key = dedupe) then return true; end if;
  select e.detail into prior from public.inquiry_events e where e.tenant_stable_id = stable and e.lead_id = p_lead_id
    and e.kind = 'delivery' and e.detail->>'ownerNotice' = 'true' order by e.at desc, e.id desc limit 1;
  select e.detail->>'recipientDigest' into old_digest from public.inquiry_events e where e.tenant_stable_id = stable and e.lead_id = p_lead_id
    and e.kind = 'delivery' and e.detail->>'ownerNotice' = 'true' and e.detail->>'recipientDigest' is not null order by e.at desc, e.id desc limit 1;
  if prior is null or prior->>'status' not in ('bounced','failed','suppressed','unavailable')
    or old_digest is null or old_digest = p_recipient_digest then return false; end if;
  perform public.inquiry_event_write(stable, ws, p_lead_id, 'timeline', 'operator', p_actor_id::text,
    jsonb_build_object('ownerNoticeRepair', true, 'recipientDigest', p_recipient_digest), dedupe);
  return true;
end;
$$;
revoke all on function public.authorize_inquiry_owner_notice_repair(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.authorize_inquiry_owner_notice_repair(text,text,uuid,text) to service_role;
commit;
