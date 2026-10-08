-- Rollback for 20261008151000_connected_sites.sql
-- Forward SHA-256: f9d54f4c426a3438a9a3c12224ab73473906b01d34da50c540bbc5aed381a4cd
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_origin_kinds()')))) is distinct from 'f2d2fb5977e297d796aeb15a9d33ebee' then raise exception 'rollback_wrong_order_or_function_drift: system_origin_kinds'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.resolve_connected_site(text)')))) is distinct from 'e1faa5bc506fa2be83f5d8dd3b162f2c' then raise exception 'rollback_wrong_order_or_function_drift: resolve_connected_site'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.connected_site_event_immutable()')))) is distinct from '5da92967b39249a1b17751034191ef8a' then raise exception 'rollback_wrong_order_or_function_drift: connected_site_event_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_connected_site_context(text)')))) is distinct from '056c4ba8659b804b59fd6c1575ed7c26' then raise exception 'rollback_wrong_order_or_function_drift: read_connected_site_context'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.connected_site_for_write(text,text)')))) is distinct from '8fb27cdaa28b58e2919800c3928f243a' then raise exception 'rollback_wrong_order_or_function_drift: connected_site_for_write'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_connected_sites(uuid,uuid,text)')))) is distinct from '372dfdbf9f826eadf221629f38f028f0' then raise exception 'rollback_wrong_order_or_function_drift: list_connected_sites'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.purge_connected_site_records(integer)')))) is distinct from '974d850f1bcf504a3f8d6dc5e528ed26' then raise exception 'rollback_wrong_order_or_function_drift: purge_connected_site_records'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.revoke_connected_site(uuid,uuid,text,uuid)')))) is distinct from 'b5bc2907b39e48f978ce64353b8d3e66' then raise exception 'rollback_wrong_order_or_function_drift: revoke_connected_site'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.create_connected_site(uuid,uuid,text,jsonb)')))) is distinct from 'f870fce5719b632856b387b44391014b' then raise exception 'rollback_wrong_order_or_function_drift: create_connected_site'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.connected_site_json(connected_sites,boolean)')))) is distinct from '0d8271673fe7f5fc978dd7fdc58092ad' then raise exception 'rollback_wrong_order_or_function_drift: connected_site_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_connected_site_events(text,text,jsonb)')))) is distinct from 'c3ac8ec002ce73cfea74b0ba09aae8c4' then raise exception 'rollback_wrong_order_or_function_drift: record_connected_site_events'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_connected_site_inquiry(text,text,jsonb)')))) is distinct from 'b770b67ad09a17861bd31c02dcf2ae92' then raise exception 'rollback_wrong_order_or_function_drift: record_connected_site_inquiry'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.update_connected_site(uuid,uuid,text,uuid,jsonb)')))) is distinct from 'eba7c1d27c2f468f4d040e80cc947a9d' then raise exception 'rollback_wrong_order_or_function_drift: update_connected_site'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.connected_site_assert_actor(uuid,uuid,text,boolean)')))) is distinct from '942960929bc9b0992dbcba5d0af01281' then raise exception 'rollback_wrong_order_or_function_drift: connected_site_assert_actor'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_connected_site_activity(uuid,uuid,text,integer)')))) is distinct from '66d75d900d7fb1d090173bba0818df01' then raise exception 'rollback_wrong_order_or_function_drift: read_connected_site_activity'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_connected_site_inquiries(uuid,uuid,text,integer)')))) is distinct from '8d18ab3f8dddb4e6dce0b063f1877c5e' then raise exception 'rollback_wrong_order_or_function_drift: read_connected_site_inquiries'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.confirm_connected_site_verification(uuid,uuid,text,uuid,text[])')))) is distinct from '3c65198710934957ca08de61e8595425' then raise exception 'rollback_wrong_order_or_function_drift: confirm_connected_site_verification'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_connected_site_spam(text,text,text,jsonb,text,timestamp with time zone)')))) is distinct from '7fc6495796c9a896f5d410bb5b467813' then raise exception 'rollback_wrong_order_or_function_drift: record_connected_site_spam'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.connected_sites') and attnum>0 and not attisdropped) <> 20 then raise exception 'rollback_wrong_order_or_table_drift: connected_sites'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.connected_site_events') and attnum>0 and not attisdropped) <> 11 then raise exception 'rollback_wrong_order_or_table_drift: connected_site_events'; end if;
end;
$rollback_guard$;
lock table public."connected_site_events", public."connected_sites", public."tenant_client_records", public."tenant_leads" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008151000_connected_site_events" as table public."connected_site_events";
revoke all on release_rollback_archive."m20261008151000_connected_site_events" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008151000_connected_sites" as table public."connected_sites";
revoke all on release_rollback_archive."m20261008151000_connected_sites" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008151000_tenant_client_records" as table public."tenant_client_records";
revoke all on release_rollback_archive."m20261008151000_tenant_client_records" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008151000_tenant_leads" as table public."tenant_leads";
revoke all on release_rollback_archive."m20261008151000_tenant_leads" from public, anon, authenticated, service_role;
-- Preserve 1.0-only rows before restoring the earlier constraints.
delete from public.tenant_leads where connected_site_id is not null;
delete from public.tenant_client_records where connected_site_id is not null;
drop trigger "connected_site_events_immutable" on public."connected_site_events";
alter table public."tenant_leads" drop constraint "tenant_leads_one_origin";
alter table public."tenant_leads" drop constraint "tenant_leads_recorded_via_check";
alter table public."tenant_leads" drop constraint "tenant_leads_connected_site_id_fkey";
alter table public."tenant_client_records" drop constraint "tenant_client_records_one_origin";
alter table public."tenant_client_records" drop constraint "tenant_client_records_recorded_via_check";
alter table public."tenant_client_records" drop constraint "tenant_client_records_connected_spam_only";
alter table public."tenant_client_records" drop constraint "tenant_client_records_connected_site_id_fkey";
drop index public."tenant_leads_connected_hash_idx";
drop index public."tenant_leads_connected_lead_idx";
drop index public."tenant_client_records_connected_idx";
alter table public."tenant_leads" drop column "connected_site_id";
alter table public."tenant_client_records" drop column "connected_site_id";
alter table public."connected_sites" drop constraint "connected_sites_check";
alter table public."connected_sites" drop constraint "connected_sites_label_check";
alter table public."connected_sites" drop constraint "connected_sites_status_check";
alter table public."connected_sites" drop constraint "connected_sites_platform_check";
alter table public."connected_sites" drop constraint "connected_sites_site_url_check";
alter table public."connected_sites" drop constraint "connected_sites_site_host_check";
alter table public."connected_sites" drop constraint "connected_sites_public_key_check";
alter table public."connected_sites" drop constraint "connected_sites_allowed_origins_check";
alter table public."connected_site_events" drop constraint "connected_site_events_kind_check";
alter table public."connected_site_events" drop constraint "connected_site_events_target_check";
alter table public."connected_sites" drop constraint "connected_sites_verification_token_check";
alter table public."connected_site_events" drop constraint "connected_site_events_page_path_check";
alter table public."connected_site_events" drop constraint "connected_site_events_dedupe_key_check";
alter table public."connected_site_events" drop constraint "connected_site_events_session_id_check";
alter table public."connected_site_events" drop constraint "connected_site_events_referrer_host_check";
drop function public.resolve_connected_site(text);
drop function public.connected_site_event_immutable();
drop function public.read_connected_site_context(text);
drop function public.connected_site_for_write(text,text);
drop function public.list_connected_sites(uuid,uuid,text);
drop function public.purge_connected_site_records(integer);
drop function public.revoke_connected_site(uuid,uuid,text,uuid);
drop function public.create_connected_site(uuid,uuid,text,jsonb);
drop function public.connected_site_json(connected_sites,boolean);
drop function public.record_connected_site_events(text,text,jsonb);
drop function public.record_connected_site_inquiry(text,text,jsonb);
drop function public.update_connected_site(uuid,uuid,text,uuid,jsonb);
drop function public.connected_site_assert_actor(uuid,uuid,text,boolean);
drop function public.read_connected_site_activity(uuid,uuid,text,integer);
drop function public.read_connected_site_inquiries(uuid,uuid,text,integer);
drop function public.confirm_connected_site_verification(uuid,uuid,text,uuid,text[]);
drop function public.record_connected_site_spam(text,text,text,jsonb,text,timestamp with time zone);
drop table public."connected_site_events", public."connected_sites";
CREATE OR REPLACE FUNCTION public.system_origin_kinds()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select array['saved_work','tenant','inquiry_workspace','google_location','tenant_newsletter']::text[]
$function$
;
revoke all on function public.system_origin_kinds() from public, anon, authenticated, service_role;
grant execute on function public.system_origin_kinds() to "service_role";
alter table public."tenant_leads" alter column "tenant_stable_id" set not null;
alter table public."tenant_client_records" alter column "tenant_stable_id" set not null;
alter table public."tenant_leads" add constraint "tenant_leads_recorded_via_check" CHECK ((recorded_via = ANY (ARRAY['dual_write'::text, 'repair'::text, 'backfill'::text])));
alter table public."tenant_client_records" add constraint "tenant_client_records_recorded_via_check" CHECK ((recorded_via = ANY (ARRAY['dual_write'::text, 'repair'::text, 'backfill'::text])));
commit;
