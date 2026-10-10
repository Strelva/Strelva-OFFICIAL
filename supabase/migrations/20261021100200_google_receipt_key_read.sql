begin;
set local lock_timeout='3s';

-- Exact recovery read; independent of bounded recent-receipt projections.
create function public.read_google_listing_receipt_by_key(p_workspace_id uuid,p_idempotency_key text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select public.read_google_listing_receipt(id,p_workspace_id) from public.google_listing_receipts
 where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key limit 1
$$;
revoke all on function public.read_google_listing_receipt_by_key(uuid,text) from public,anon,authenticated;
grant execute on function public.read_google_listing_receipt_by_key(uuid,text) to service_role;

commit;
