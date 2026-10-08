begin;
set local lock_timeout = '2s';
drop function if exists public.read_booking_business_details(text);
drop function if exists public.record_tenant_booking(text,jsonb,text);
alter function public.record_tenant_booking_before_w6(text,jsonb,text) rename to record_tenant_booking;
grant execute on function public.record_tenant_booking(text,jsonb,text) to service_role;

drop function if exists public.change_native_booking(text,jsonb);
alter function public.change_native_booking_before_w6(text,jsonb) rename to change_native_booking;
grant execute on function public.change_native_booking(text,jsonb) to service_role;
drop function if exists public.claim_booking_messages(timestamptz,integer);
alter function public.claim_booking_messages_before_w6(timestamptz,integer) rename to claim_booking_messages;
grant execute on function public.claim_booking_messages(timestamptz,integer) to service_role;
drop function if exists public.lapse_booking_requests(timestamptz,integer);
alter function public.lapse_booking_requests_before_w6(timestamptz,integer) rename to lapse_booking_requests;
grant execute on function public.lapse_booking_requests(timestamptz,integer) to service_role;
alter table public.business_bookings drop column requested_at;
commit;
