begin;
set local lock_timeout = '2s';
drop function if exists public.read_tenant_booking_policy(text);
drop function if exists public.release_public_record_booking_claim(text,uuid);
drop trigger if exists native_booking_receipt_from_store_trg on public.public_website_bookings;
drop function if exists public.native_booking_receipt_from_store();
drop trigger if exists business_booking_receipt_sync_trg on public.business_bookings;
drop trigger if exists business_booking_request_clock_trg on public.business_bookings;
drop function if exists public.sync_native_booking_receipt();
drop function if exists public.booking_request_clock();
create or replace function public.read_workspace_booking_requests(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public.booking_json(b) order by b.start_at, b.id), '[]'::jsonb)
  from public.business_bookings b
  where p_workspace_id is not null and b.workspace_id = p_workspace_id and b.status = 'requested'
$$;
revoke all on function public.read_workspace_booking_requests(uuid) from public, anon, authenticated;
grant execute on function public.read_workspace_booking_requests(uuid) to service_role;
drop function public.booking_json(public.business_bookings);
alter function public.booking_json_before_w6(public.business_bookings) rename to booking_json;
commit;
