-- Public email confirmation carries only the business and requested time.
-- A GET does not consume, extend or place the request. No visitor data is exposed.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create or replace function public.read_public_booking_confirmation(p_hash text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'businessName', public.read_booking_business_details(t.id)->>'name',
    'start', r.start_at, 'end', r.end_at, 'state', r.state,
    'bookingStatus', b.status
  )
  from public.public_booking_requests r
  join public.tenants t on t.stable_id = r.tenant_stable_id
  left join public.public_website_bookings p on p.tenant_stable_id = r.tenant_stable_id and p.calendar_request_id = r.request_id
  left join public.business_bookings b on b.public_reservation_id = p.id and b.tenant_stable_id = r.tenant_stable_id
  where r.token_hash = p_hash
    and (r.state = 'placed' or (r.state in ('held', 'confirming') and r.expires_at > clock_timestamp()))
$$;
revoke all on function public.read_public_booking_confirmation(text) from public, anon, authenticated;
grant execute on function public.read_public_booking_confirmation(text) to service_role;

create or replace function public.read_public_booking_request(p_tenant_id text,p_request_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select to_jsonb(r)||jsonb_build_object('tenantId',t.id,'requestId',r.request_id) from public.public_booking_requests r
 join public.tenants t on t.stable_id=r.tenant_stable_id where t.id=p_tenant_id and r.request_id=p_request_id
$$;
revoke all on function public.read_public_booking_request(text,text) from public,anon,authenticated;
grant execute on function public.read_public_booking_request(text,text) to service_role;
drop function if exists public.read_public_inquiry_booking_receipt(text);
commit;
