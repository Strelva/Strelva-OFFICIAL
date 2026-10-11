-- Rollback for 20260928130000_business_effort_minutes.sql
-- Forward SHA-256: 98a629ae8ab02db231f7507da1139e9194348a98455ef3f89e18c2b4d7d13a83
-- Batch 1: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_effort_row(uuid)')))) is distinct from '9839e5bc4567af101d9d3a703054116d' then raise exception 'rollback_wrong_order_or_function_drift: business_effort_row'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_effort_append_only()')))) is distinct from '078542049c196f348a9d2bf62e946602' then raise exception 'rollback_wrong_order_or_function_drift: business_effort_append_only'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_effort_businesses(uuid,text)')))) is distinct from 'ae0767dc231595c402a73e2f2d8d80e9' then raise exception 'rollback_wrong_order_or_function_drift: read_effort_businesses'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_business_effort(uuid,text,date,uuid)')))) is distinct from '36fc6bde3843eb36efae0cb0773a0103' then raise exception 'rollback_wrong_order_or_function_drift: read_business_effort'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.void_business_effort(uuid,text,uuid,text)')))) is distinct from '47bfc6a0be7072addd621ab186063c72' then raise exception 'rollback_wrong_order_or_function_drift: void_business_effort'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_effort_assert_operator(uuid,text)')))) is distinct from '9d3bc9d201875d93ba90d50135b72737' then raise exception 'rollback_wrong_order_or_function_drift: business_effort_assert_operator'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_business_effort(uuid,text,uuid,uuid,integer,text,date,text)')))) is distinct from 'a52fddcc42ede98cf0cbe292c485470a' then raise exception 'rollback_wrong_order_or_function_drift: record_business_effort'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.business_effort_entries') and attnum>0 and not attisdropped) <> 8 then raise exception 'rollback_wrong_order_or_table_drift: business_effort_entries'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.business_effort_voids') and attnum>0 and not attisdropped) <> 4 then raise exception 'rollback_wrong_order_or_table_drift: business_effort_voids'; end if;
end;
$rollback_guard$;
lock table public."business_effort_entries", public."business_effort_voids" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20260928130000_business_effort_entries" as table public."business_effort_entries";
revoke all on release_rollback_archive."m20260928130000_business_effort_entries" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20260928130000_business_effort_voids" as table public."business_effort_voids";
revoke all on release_rollback_archive."m20260928130000_business_effort_voids" from public, anon, authenticated, service_role;
drop trigger "business_effort_voids_append_only" on public."business_effort_voids";
drop trigger "business_effort_entries_append_only" on public."business_effort_entries";
alter table public."business_effort_voids" drop constraint "business_effort_voids_reason_check";
alter table public."business_effort_entries" drop constraint "business_effort_entries_note_check";
alter table public."business_effort_entries" drop constraint "business_effort_entries_minutes_check";
alter table public."business_effort_entries" drop constraint "business_effort_entries_category_check";
alter table public."business_effort_entries" drop constraint "business_effort_entries_occurred_on_check";
drop function public.business_effort_row(uuid);
drop function public.business_effort_append_only();
drop function public.read_effort_businesses(uuid,text);
drop function public.read_business_effort(uuid,text,date,uuid);
drop function public.void_business_effort(uuid,text,uuid,text);
drop function public.business_effort_assert_operator(uuid,text);
drop function public.record_business_effort(uuid,text,uuid,uuid,integer,text,date,text);
drop table public."business_effort_entries", public."business_effort_voids";
commit;
