-- Removes read projections only. Bookings, access and decisions are retained.
begin;
set local lock_timeout = '2s';
drop function if exists public.read_provider_booking_evidence(uuid,uuid,text,date,text);
drop function if exists public.read_agent_booking_proof(text,timestamptz,timestamptz);
drop function public.booking_json(public.business_bookings);
alter function public.booking_json_before_agent_visibility(public.business_bookings) rename to booking_json;
revoke all on function public.booking_json(public.business_bookings) from public,anon,authenticated,service_role;
commit;
