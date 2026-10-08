-- Accepted-send state and inbound routing survive cache expiry under the same
-- dual-write/backfill/parity flags as other client records. No new write ledger.
begin;
set local lock_timeout = '3s';
alter table public.tenant_client_records drop constraint tenant_client_records_store_check;
alter table public.tenant_client_records add constraint tenant_client_records_store_check check (store in (
  'spam_held','inquiry_timeline','inquiry_reply','booking_config','account_grouping',
  'orders','provider_connections','provider_metadata','reward_members','reward_transactions','threads','tenant_settings',
  'inquiry_delivery'
)) not valid;
create function public.find_inquiry_delivery_reply_target(p_reply_to text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('tenantId',t.id,'inquiryId',r.payload#>>'{value,inquiryId}')
    from public.tenant_client_records r join public.tenants t on t.stable_id=r.tenant_stable_id
    where r.store='inquiry_delivery' and r.removed_at is null and r.payload->>'kind'='reply_target'
      and r.payload#>>'{value,replyTo}'=lower(btrim(p_reply_to))
    order by r.updated_at desc limit 1
$$;
revoke all on function public.find_inquiry_delivery_reply_target(text) from public,anon,authenticated;
grant execute on function public.find_inquiry_delivery_reply_target(text) to service_role;
commit;
