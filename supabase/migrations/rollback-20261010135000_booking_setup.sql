-- Disable STRELVA_BOOKING_SETTINGS first. Preserve approved settings.
begin;
set local lock_timeout='2s';
drop function if exists public.decide_booking_instant_policy(uuid,uuid,integer,text,uuid,text,boolean);
drop function if exists public.read_booking_instant_policies(uuid);
drop function if exists public.configure_booking_setup(uuid,text,uuid,text,jsonb);
drop function if exists public.read_booking_setup(uuid,text,uuid,text);
drop function if exists public.booking_setup_authorize(uuid,text,uuid,text);
drop table if exists public.booking_instant_policies;
alter table public.booking_settings drop column if exists cancellation_cutoff_hours;
commit;
