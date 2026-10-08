begin;
set local lock_timeout = '2s';
drop function if exists public.choose_inquiry_booking_offer(text,timestamptz,jsonb);
drop function if exists public.read_inquiry_booking_receipt(text,text);
drop function if exists public.read_inquiry_booking_offer(text);
drop function if exists public.issue_inquiry_booking_offer(text,jsonb);
drop table if exists public.booking_inquiry_offers;
commit;
