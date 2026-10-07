begin;
-- Rollback must never erase pending email authorizations or their outcomes.
do $$ begin
 if exists(select 1 from public.public_booking_requests) then raise exception 'public_booking_admission_rollback_requires_data_preservation'; end if;
end $$;
drop function public.claim_booking_updates(uuid,boolean,boolean,integer);
alter function public.claim_booking_updates_before_public_admission(uuid,boolean,boolean,integer) rename to claim_booking_updates;
grant execute on function public.claim_booking_updates(uuid,boolean,boolean,integer) to service_role;
drop trigger guard_public_booking_receipt on public.public_website_bookings;
drop function public.guard_public_booking_receipt();
alter table public.public_website_bookings drop column email_confirmation_required,drop column email_confirmation_expires_at;
drop trigger guard_public_booking_budget on public.business_bookings;
drop function public.guard_public_booking_budget();
drop function public.choose_inquiry_booking_offer(text,timestamptz,jsonb);
alter function public.choose_inquiry_booking_offer_before_public_admission(text,timestamptz,jsonb) rename to choose_inquiry_booking_offer;
grant execute on function public.choose_inquiry_booking_offer(text,timestamptz,jsonb) to service_role;
drop function public.claim_public_booking_request(text,jsonb),public.read_public_booking_request(text,text),public.consume_public_booking_request(text),
 public.finish_public_booking_request(text,text),public.cancel_public_booking_request(text,text),public.check_public_booking_budget(uuid,text,timestamptz,timestamptz,text,uuid);
drop table public.public_booking_requests;
commit;
