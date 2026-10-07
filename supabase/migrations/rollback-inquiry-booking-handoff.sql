-- Disable STRELVA_INQUIRY_BOOKING_HANDOFF first. Existing booking records stay.
begin;
set local lock_timeout='3s';
drop function if exists public.choose_inquiry_booking_slot(uuid,integer),public.read_inquiry_booking_offer(uuid),public.prepare_inquiry_booking_offer(text,text,jsonb,uuid,jsonb,uuid,text),public.read_inquiry_booking_handoff(text,text,uuid,uuid,uuid,text),public.resolve_workspace_inquiry_booking_lead(uuid,uuid,uuid,text);
drop function if exists public.inquiry_booking_offer_json(public.inquiry_booking_offers),public.inquiry_booking_witness(text,text);
drop function if exists public.record_workspace_inquiry_booking(uuid,uuid,jsonb,jsonb,text,text),public.read_inquiry_workspace_bookings(uuid,date,date),public.read_inquiry_workspace_booking_context(uuid);
drop table if exists public.inquiry_booking_offers;
commit;
