-- Disable STRELVA_BOOKING_CALENDAR_MIRROR first. Preserve saved provider-state
-- work and existing event receipts: rollback must not erase accepted writes.
begin;
set local lock_timeout = '2s';
drop function if exists public.finish_booking_calendar_mirror(uuid,uuid,text,text,text);
drop function if exists public.prepare_booking_calendar_mirror(uuid,uuid);
drop table if exists public.business_booking_calendar_mirrors;
commit;
