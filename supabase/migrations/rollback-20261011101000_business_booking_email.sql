begin;
-- Preserve recorded operator actions: refuse a destructive rollback after use.
do $$ begin if exists(select 1 from public.business_booking_email_events) then raise exception 'rollback_booking_email_has_history'; end if; end; $$;
drop function public.read_business_booking_email_history(uuid,uuid,text),public.set_business_booking_email(uuid,uuid,text,text,text),public.read_business_booking_email(uuid);
drop table public.business_booking_email_events,public.business_booking_email_settings;
drop function public.business_booking_email_event_immutable();
commit;
