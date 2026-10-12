-- Rollback for 20261008141000_booking_store.sql
-- Forward SHA-256: 6c6a33fe69e36a3c6125af3da22391cd520b1e2662ed348cb9be578e2624b557
-- Batch 6: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.booking_tenant(text)')))) is distinct from 'ef5c997e1b268b92c9e1e21efe1f6e2c' then raise exception 'rollback_wrong_order_or_function_drift: booking_tenant'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.booking_json(business_bookings)')))) is distinct from 'bfb5d11135dc0b77140b50f54320cd15' then raise exception 'rollback_wrong_order_or_function_drift: booking_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_booking_context(text)')))) is distinct from 'e80961352ffd3365943811f1752ac316' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_booking_context'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_booking_history_immutable()')))) is distinct from '1f4fd382fa089346d7d08548f3b177c7' then raise exception 'rollback_wrong_order_or_function_drift: business_booking_history_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_bookings(text,date,date)')))) is distinct from 'c60b0095762fcdf0158f8a6e11bca4ea' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_bookings'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_booking_requests(uuid)')))) is distinct from '4fb95d147c66fd9f44e10cc81e63ce2a' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_booking_requests'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_booking_history(text,text)')))) is distinct from 'e84ed396a630df72ea0f7ddaf84cea51' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_booking_history'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_tenant_booking(text,jsonb,text)')))) is distinct from '130570d3eff48af2c82f3994d76aa49e' then raise exception 'rollback_wrong_order_or_function_drift: record_tenant_booking'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.upsert_tenant_booking_settings(text,jsonb,text)')))) is distinct from '74d1a96a0360e58e5bc6196d88381853' then raise exception 'rollback_wrong_order_or_function_drift: upsert_tenant_booking_settings'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_tenant_booking_status(text,text,text,text,text)')))) is distinct from 'f18ce2c958ba8b6720880b0d25d11f77' then raise exception 'rollback_wrong_order_or_function_drift: set_tenant_booking_status'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.decide_workspace_booking_request(uuid,uuid,text,text)')))) is distinct from '82fa5c3449ae1ba64ba05c081404248d' then raise exception 'rollback_wrong_order_or_function_drift: decide_workspace_booking_request'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.booking_settings') and attnum>0 and not attisdropped) <> 16 then raise exception 'rollback_wrong_order_or_table_drift: booking_settings'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.business_bookings') and attnum>0 and not attisdropped) <> 32 then raise exception 'rollback_wrong_order_or_table_drift: business_bookings'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.business_booking_history') and attnum>0 and not attisdropped) <> 7 then raise exception 'rollback_wrong_order_or_table_drift: business_booking_history'; end if;
end;
$rollback_guard$;
lock table public."booking_settings", public."business_booking_history", public."business_bookings", public."public_website_bookings" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008141000_booking_settings" as table public."booking_settings";
revoke all on release_rollback_archive."m20261008141000_booking_settings" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008141000_business_booking_history" as table public."business_booking_history";
revoke all on release_rollback_archive."m20261008141000_business_booking_history" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008141000_business_bookings" as table public."business_bookings";
revoke all on release_rollback_archive."m20261008141000_business_bookings" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008141000_public_website_bookings" as table public."public_website_bookings";
revoke all on release_rollback_archive."m20261008141000_public_website_bookings" from public, anon, authenticated, service_role;
drop trigger "business_booking_history_immutable" on public."business_booking_history";
alter table public."public_website_bookings" drop constraint "public_website_bookings_booking_id_fkey";
alter table public."public_website_bookings" drop column "booking_id";
alter table public."booking_settings" drop constraint "booking_settings_check";
alter table public."business_bookings" drop constraint "business_bookings_check";
alter table public."business_bookings" drop constraint "business_bookings_check1";
alter table public."business_bookings" drop constraint "business_bookings_check2";
alter table public."business_bookings" drop constraint "business_bookings_check3";
alter table public."business_bookings" drop constraint "business_bookings_check4";
alter table public."booking_settings" drop constraint "booking_settings_mode_check";
alter table public."booking_settings" drop constraint "booking_settings_revision_check";
alter table public."booking_settings" drop constraint "booking_settings_timezone_check";
alter table public."business_bookings" drop constraint "business_bookings_origin_check";
alter table public."business_bookings" drop constraint "business_bookings_status_check";
alter table public."booking_settings" drop constraint "booking_settings_max_per_day_check";
alter table public."business_bookings" drop constraint "business_bookings_legacy_id_check";
alter table public."business_bookings" drop constraint "business_bookings_time_zone_check";
alter table public."booking_settings" drop constraint "booking_settings_recorded_via_check";
alter table public."business_bookings" drop constraint "business_bookings_inquiry_id_check";
alter table public."business_bookings" drop constraint "business_bookings_service_ref_check";
alter table public."booking_settings" drop constraint "booking_settings_bookable_hours_check";
alter table public."booking_settings" drop constraint "booking_settings_buffer_minutes_check";
alter table public."business_bookings" drop constraint "business_bookings_external_ref_check";
alter table public."business_bookings" drop constraint "business_bookings_recorded_via_check";
alter table public."business_bookings" drop constraint "business_bookings_customer_name_check";
alter table public."booking_settings" drop constraint "booking_settings_max_advance_days_check";
alter table public."business_bookings" drop constraint "business_bookings_buffer_minutes_check";
alter table public."business_bookings" drop constraint "business_bookings_customer_email_check";
alter table public."business_bookings" drop constraint "business_bookings_customer_phone_check";
alter table public."business_bookings" drop constraint "business_bookings_intake_answers_check";
alter table public."business_bookings" drop constraint "business_bookings_external_source_check";
alter table public."booking_settings" drop constraint "booking_settings_bookable_overrides_check";
alter table public."booking_settings" drop constraint "booking_settings_min_notice_minutes_check";
alter table public."business_bookings" drop constraint "business_bookings_manage_token_hash_check";
alter table public."business_booking_history" drop constraint "business_booking_history_actor_check";
alter table public."business_bookings" drop constraint "business_bookings_request_fingerprint_check";
alter table public."booking_settings" drop constraint "booking_settings_default_length_minutes_check";
alter table public."business_booking_history" drop constraint "business_booking_history_reason_check";
alter table public."business_bookings" drop constraint "business_bookings_tenant_slug_at_booking_check";
alter table public."business_booking_history" drop constraint "business_booking_history_to_status_check";
alter table public."business_bookings" drop constraint "business_bookings_service_name_at_booking_check";
alter table public."business_booking_history" drop constraint "business_booking_history_from_status_check";
drop function public.booking_tenant(text);
drop function public.booking_json(business_bookings);
drop function public.read_tenant_booking_context(text);
drop function public.business_booking_history_immutable();
drop function public.read_tenant_bookings(text,date,date);
drop function public.read_workspace_booking_requests(uuid);
drop function public.read_tenant_booking_history(text,text);
drop function public.record_tenant_booking(text,jsonb,text);
drop function public.upsert_tenant_booking_settings(text,jsonb,text);
drop function public.set_tenant_booking_status(text,text,text,text,text);
drop function public.decide_workspace_booking_request(uuid,uuid,text,text);
drop table public."booking_settings", public."business_booking_history", public."business_bookings";
commit;
