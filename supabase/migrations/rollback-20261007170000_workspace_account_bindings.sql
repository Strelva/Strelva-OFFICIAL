-- Rollback for 20261007170000_workspace_account_bindings.sql
-- Forward SHA-256: 27f045a496eb9afe579ddf26df151a84ca9ab3db0cff525b342be0ea5e45b086
-- Batch 3: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_origin_kinds()')))) is distinct from '15a9fa7aab17fad917c8117b35ebe936' then raise exception 'rollback_wrong_order_or_function_drift: system_origin_kinds'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.google_listing_receipt_guard()')))) is distinct from '252d73356a8c881fca5312847d20f268' then raise exception 'rollback_wrong_order_or_function_drift: google_listing_receipt_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_binding_target(text)')))) is distinct from 'e6d01294bc354e60778b3bc69a1c4493' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_binding_target'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_google_binding_for_tenant(text)')))) is distinct from '72b693befd339d94fc1b5b4fe10154e5' then raise exception 'rollback_wrong_order_or_function_drift: read_google_binding_for_tenant'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_google_listing_receipt(jsonb)')))) is distinct from 'f6678d182b4e19d5252afd77a5db0779' then raise exception 'rollback_wrong_order_or_function_drift: record_google_listing_receipt'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.account_binding_ciphertext_valid(text)')))) is distinct from '1df92c2db53a4f0e741b904297d8cf49' then raise exception 'rollback_wrong_order_or_function_drift: account_binding_ciphertext_valid'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_google_listing_receipt(uuid,uuid)')))) is distinct from 'cf44c5b20232e21d2612512f84f8e17b' then raise exception 'rollback_wrong_order_or_function_drift: read_google_listing_receipt'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.upsert_workspace_account_binding(jsonb,text)')))) is distinct from '0f0c8b0acbf0bd8ad6a1007eef72b513' then raise exception 'rollback_wrong_order_or_function_drift: upsert_workspace_account_binding'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.settle_google_listing_receipt(uuid,uuid,jsonb)')))) is distinct from '4b247260710ce7d7df435033c451402a' then raise exception 'rollback_wrong_order_or_function_drift: settle_google_listing_receipt'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_business_publishing(uuid,uuid,text,integer)')))) is distinct from '6c276fcce1957f452fdf982da62357b8' then raise exception 'rollback_wrong_order_or_function_drift: read_business_publishing'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.confirm_google_listing_receipt(uuid,uuid,text,text)')))) is distinct from '3f41cdf3fa6e294df544a17062c28e4a' then raise exception 'rollback_wrong_order_or_function_drift: confirm_google_listing_receipt'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.google_listing_receipt_json(google_listing_receipts)')))) is distinct from 'a1684be01b9f0c9911effe34f3abd85d' then raise exception 'rollback_wrong_order_or_function_drift: google_listing_receipt_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.upsert_workspace_google_location(uuid,text,text,text)')))) is distinct from '82a73ed88c2b26d436957c5029b21a09' then raise exception 'rollback_wrong_order_or_function_drift: upsert_workspace_google_location'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.account_binding_json(workspace_account_bindings,boolean)')))) is distinct from 'c20e311f68ae67172db541fc500a2545' then raise exception 'rollback_wrong_order_or_function_drift: account_binding_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_workspace_account_binding_status(uuid,text,text,timestamp with time zone)')))) is distinct from '1bbb1767face334f788ab048720f43ef' then raise exception 'rollback_wrong_order_or_function_drift: set_workspace_account_binding_status'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.update_workspace_account_binding_tokens(uuid,text,timestamp with time zone,text)')))) is distinct from 'e75d130e2ee44c6e7f9f94121f9bf64a' then raise exception 'rollback_wrong_order_or_function_drift: update_workspace_account_binding_tokens'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.workspace_google_locations') and attnum>0 and not attisdropped) <> 9 then raise exception 'rollback_wrong_order_or_table_drift: workspace_google_locations'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.google_listing_receipts') and attnum>0 and not attisdropped) <> 20 then raise exception 'rollback_wrong_order_or_table_drift: google_listing_receipts'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.workspace_account_bindings') and attnum>0 and not attisdropped) <> 15 then raise exception 'rollback_wrong_order_or_table_drift: workspace_account_bindings'; end if;
end;
$rollback_guard$;
lock table public."google_listing_receipts", public."workspace_account_bindings", public."workspace_google_locations" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007170000_google_listing_receipts" as table public."google_listing_receipts";
revoke all on release_rollback_archive."m20261007170000_google_listing_receipts" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007170000_workspace_account_bindings" as table public."workspace_account_bindings";
revoke all on release_rollback_archive."m20261007170000_workspace_account_bindings" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007170000_workspace_google_locations" as table public."workspace_google_locations";
revoke all on release_rollback_archive."m20261007170000_workspace_google_locations" from public, anon, authenticated, service_role;
drop trigger "google_listing_receipt_guard" on public."google_listing_receipts";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_check1";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_undo_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_error_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_action_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_status_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_readback_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_authority_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_target_ref_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_after_state_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_location_id_check";
alter table public."workspace_google_locations" drop constraint "workspace_google_locations_title_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_before_state_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_provider_ref_check";
alter table public."workspace_account_bindings" drop constraint "workspace_account_bindings_scopes_check";
alter table public."workspace_account_bindings" drop constraint "workspace_account_bindings_status_check";
alter table public."workspace_account_bindings" drop constraint "workspace_account_bindings_subject_check";
alter table public."workspace_account_bindings" drop constraint "workspace_account_bindings_provider_check";
alter table public."google_listing_receipts" drop constraint "google_listing_receipts_idempotency_key_check";
alter table public."workspace_account_bindings" drop constraint "workspace_account_bindings_last_error_check";
alter table public."workspace_google_locations" drop constraint "workspace_google_locations_account_id_check";
alter table public."workspace_google_locations" drop constraint "workspace_google_locations_location_id_check";
alter table public."workspace_account_bindings" drop constraint "workspace_account_bindings_migrated_from_check";
alter table public."workspace_account_bindings" drop constraint "workspace_account_bindings_access_token_ciphertext_check";
alter table public."workspace_account_bindings" drop constraint "workspace_account_bindings_refresh_token_ciphertext_check";
drop function public.google_listing_receipt_guard();
drop function public.read_tenant_binding_target(text);
drop function public.read_google_binding_for_tenant(text);
drop function public.record_google_listing_receipt(jsonb);
drop function public.account_binding_ciphertext_valid(text);
drop function public.read_google_listing_receipt(uuid,uuid);
drop function public.upsert_workspace_account_binding(jsonb,text);
drop function public.settle_google_listing_receipt(uuid,uuid,jsonb);
drop function public.read_business_publishing(uuid,uuid,text,integer);
drop function public.confirm_google_listing_receipt(uuid,uuid,text,text);
drop function public.google_listing_receipt_json(google_listing_receipts);
drop function public.upsert_workspace_google_location(uuid,text,text,text);
drop function public.account_binding_json(workspace_account_bindings,boolean);
drop function public.set_workspace_account_binding_status(uuid,text,text,timestamp with time zone);
drop function public.update_workspace_account_binding_tokens(uuid,text,timestamp with time zone,text);
drop table public."google_listing_receipts", public."workspace_account_bindings", public."workspace_google_locations";
CREATE OR REPLACE FUNCTION public.system_origin_kinds()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select array['saved_work','tenant','inquiry_workspace']::text[]
$function$
;
revoke all on function public.system_origin_kinds() from public, anon, authenticated, service_role;
grant execute on function public.system_origin_kinds() to "service_role";
commit;
