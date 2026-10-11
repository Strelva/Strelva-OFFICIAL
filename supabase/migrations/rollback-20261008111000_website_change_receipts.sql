-- Rollback for 20261008111000_website_change_receipts.sql
-- Forward SHA-256: 76383b48111a61eb2bac5cc7582e9bafe6f048861261add9ffb4ad7e68c2d727
-- Batch 5: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_change_actor_role(uuid,uuid,text)')))) is distinct from 'a268552782720a359ec2cbad5c412fe4' then raise exception 'rollback_wrong_order_or_function_drift: website_change_actor_role'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_website_change_requests(uuid,uuid,text,uuid)')))) is distinct from 'a964674fd3daed07f02c05db974f06a2' then raise exception 'rollback_wrong_order_or_function_drift: list_website_change_requests'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_website_change_receipt(uuid,uuid,text,uuid,text,jsonb)')))) is distinct from '1b3b5e8b1f863ad2bb8c8cd0d1310390' then raise exception 'rollback_wrong_order_or_function_drift: record_website_change_receipt'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_change_receipts') and attnum>0 and not attisdropped) <> 12 then raise exception 'rollback_wrong_order_or_table_drift: website_change_receipts'; end if;
end;
$rollback_guard$;
lock table public."website_change_receipts" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008111000_website_change_receipts" as table public."website_change_receipts";
revoke all on release_rollback_archive."m20261008111000_website_change_receipts" from public, anon, authenticated, service_role;
alter table public."website_change_receipts" drop constraint "website_change_receipts_check";
alter table public."website_change_receipts" drop constraint "website_change_receipts_check1";
alter table public."website_change_receipts" drop constraint "website_change_receipts_check2";
alter table public."website_change_receipts" drop constraint "website_change_receipts_kind_check";
alter table public."website_change_receipts" drop constraint "website_change_receipts_note_check";
alter table public."website_change_receipts" drop constraint "website_change_receipts_read_back_check";
alter table public."website_change_receipts" drop constraint "website_change_receipts_commit_sha_check";
alter table public."website_change_receipts" drop constraint "website_change_receipts_preview_url_check";
alter table public."website_change_receipts" drop constraint "website_change_receipts_deployment_url_check";
drop function public.website_change_actor_role(uuid,uuid,text);
drop function public.list_website_change_requests(uuid,uuid,text,uuid);
drop function public.record_website_change_receipt(uuid,uuid,text,uuid,text,jsonb);
drop table public."website_change_receipts";
commit;
