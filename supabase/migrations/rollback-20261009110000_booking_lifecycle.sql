-- Rollback for 20261009110000_booking_lifecycle.sql
-- Forward SHA-256: a873c16d81b59d215f9361306f6d13b38bab3b043c92339b585876d8a5728b03
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_booking(uuid,uuid)')))) is distinct from '63d3dda6033f00351041e31e89b793c4' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_booking'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_public_booking_by_manage_token(text)')))) is distinct from 'a2ba09bd07bdf6d98528785b14b79997' then raise exception 'rollback_wrong_order_or_function_drift: read_public_booking_by_manage_token'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_workspace_booking(uuid,jsonb,text)')))) is distinct from '425134768c04ef7102e7d1dc5b2a4132' then raise exception 'rollback_wrong_order_or_function_drift: record_workspace_booking'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_tenant_booking_hours(uuid,text,jsonb)')))) is distinct from 'f32493356c3d03d2ddde4650ed84cc3c' then raise exception 'rollback_wrong_order_or_function_drift: set_tenant_booking_hours'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.finish_booking_message(uuid,text,text,text)')))) is distinct from '126c570b7c3d7fbe7bc518fac6fdbb55' then raise exception 'rollback_wrong_order_or_function_drift: finish_booking_message'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.expire_booking_holds(timestamp with time zone)')))) is distinct from '07998e14d925d9524a2da90176114d77' then raise exception 'rollback_wrong_order_or_function_drift: expire_booking_holds'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.claim_booking_messages(timestamp with time zone,integer)')))) is distinct from 'e4d941d1563be5fe587449cafd203a75' then raise exception 'rollback_wrong_order_or_function_drift: claim_booking_messages'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.lapse_booking_requests(timestamp with time zone,integer)')))) is distinct from '95c037d0b4bc5c59f713f8a52a25c106' then raise exception 'rollback_wrong_order_or_function_drift: lapse_booking_requests'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.business_booking_messages') and attnum>0 and not attisdropped) <> 8 then raise exception 'rollback_wrong_order_or_table_drift: business_booking_messages'; end if;
end;
$rollback_guard$;
lock table public."business_booking_messages" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009110000_business_booking_messages" as table public."business_booking_messages";
revoke all on release_rollback_archive."m20261009110000_business_booking_messages" from public, anon, authenticated, service_role;
drop index public."business_bookings_clock_idx";
drop index public."business_bookings_upcoming_idx";
drop index public."public_website_bookings_manage_token_idx";
alter table public."business_booking_messages" drop constraint "business_booking_messages_kind_check";
alter table public."business_booking_messages" drop constraint "business_booking_messages_detail_check";
alter table public."business_booking_messages" drop constraint "business_booking_messages_status_check";
alter table public."business_booking_messages" drop constraint "business_booking_messages_provider_message_id_check";
drop function public.read_workspace_booking(uuid,uuid);
drop function public.read_public_booking_by_manage_token(text);
drop function public.record_workspace_booking(uuid,jsonb,text);
drop function public.set_tenant_booking_hours(uuid,text,jsonb);
drop function public.finish_booking_message(uuid,text,text,text);
drop function public.expire_booking_holds(timestamp with time zone);
drop function public.claim_booking_messages(timestamp with time zone,integer);
drop function public.lapse_booking_requests(timestamp with time zone,integer);
drop table public."business_booking_messages";
commit;
