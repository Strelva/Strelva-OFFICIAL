-- Rollback for 20261007182000_workspace_export_v3.sql
-- Forward SHA-256: 94fff56f7d3ea8b8434a6c875aa60e432501c520b8c5e73d7c58273ee0f77861
-- Batch 4: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_export_v3_categories()')))) is distinct from '300e5d3267b55ac35f0169aa5b1f03cd' then raise exception 'rollback_wrong_order_or_function_drift: workspace_export_v3_categories'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.fail_workspace_export_build(uuid,text)')))) is distinct from '9757f265616eed0f40d62b409fca9822' then raise exception 'rollback_wrong_order_or_function_drift: fail_workspace_export_build'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_export_v3_role(uuid,uuid,text)')))) is distinct from '17107bf32f3a38be239f8cc7739b0cca' then raise exception 'rollback_wrong_order_or_function_drift: workspace_export_v3_role'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_export_build(uuid,uuid,text)')))) is distinct from 'c84970c516ac26bf42416d5a20a7b75f' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_export_build'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.start_workspace_export_build(uuid,uuid,text)')))) is distinct from 'da8f39a316213391421f836491b9b7c8' then raise exception 'rollback_wrong_order_or_function_drift: start_workspace_export_build'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_export_build_part(uuid,text,integer)')))) is distinct from '628cf054ad5f3c7aa31b8610ee87170c' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_export_build_part'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.append_workspace_export_build_part(uuid,integer,text)')))) is distinct from '0b8793e5adf0b3d0a9687051e7e27d00' then raise exception 'rollback_wrong_order_or_function_drift: append_workspace_export_build_part'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.complete_workspace_export_build(uuid,jsonb,text,jsonb)')))) is distinct from '33da8f0638a97f084b1bedc600687560' then raise exception 'rollback_wrong_order_or_function_drift: complete_workspace_export_build'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_export_v3_tenant_rows(text,uuid,text,integer,integer)')))) is distinct from '01cb2c6109711b6332f8267c2a8ccb7b' then raise exception 'rollback_wrong_order_or_function_drift: workspace_export_v3_tenant_rows'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer)')))) is distinct from '73cb620ae951d7ef88c30b514f795ebf' then raise exception 'rollback_wrong_order_or_function_drift: export_workspace_v3_category'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.workspace_export_build_parts') and attnum>0 and not attisdropped) <> 3 then raise exception 'rollback_wrong_order_or_table_drift: workspace_export_build_parts'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.workspace_export_builds') and attnum>0 and not attisdropped) <> 15 then raise exception 'rollback_wrong_order_or_table_drift: workspace_export_builds'; end if;
end;
$rollback_guard$;
lock table public."workspace_export_build_parts", public."workspace_export_builds" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007182000_workspace_export_build_parts" as table public."workspace_export_build_parts";
revoke all on release_rollback_archive."m20261007182000_workspace_export_build_parts" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007182000_workspace_export_builds" as table public."workspace_export_builds";
revoke all on release_rollback_archive."m20261007182000_workspace_export_builds" from public, anon, authenticated, service_role;
lock table public."workspace_export_receipts" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007182000_workspace_export_receipts" as table public."workspace_export_receipts";
revoke all on release_rollback_archive."m20261007182000_workspace_export_receipts" from public, anon, authenticated, service_role;
-- Preserve 1.0-only rows before restoring the earlier constraints.
delete from public.workspace_export_receipts where schema_version = 3;
alter table public."workspace_export_receipts" drop constraint "workspace_export_receipts_byte_size_check";
alter table public."workspace_export_receipts" drop constraint "workspace_export_receipts_schema_version_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_status_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_failure_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_manifest_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_byte_size_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_deliver_to_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_part_count_check";
alter table public."workspace_export_build_parts" drop constraint "workspace_export_build_parts_body_check";
alter table public."workspace_export_build_parts" drop constraint "workspace_export_build_parts_part_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_requester_role_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_schema_version_check";
alter table public."workspace_export_builds" drop constraint "workspace_export_builds_download_token_hash_check";
drop function public.workspace_export_v3_categories();
drop function public.fail_workspace_export_build(uuid,text);
drop function public.workspace_export_v3_role(uuid,uuid,text);
drop function public.read_workspace_export_build(uuid,uuid,text);
drop function public.start_workspace_export_build(uuid,uuid,text);
drop function public.read_workspace_export_build_part(uuid,text,integer);
drop function public.append_workspace_export_build_part(uuid,integer,text);
drop function public.complete_workspace_export_build(uuid,jsonb,text,jsonb);
drop function public.workspace_export_v3_tenant_rows(text,uuid,text,integer,integer);
drop function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer);
drop table public."workspace_export_build_parts", public."workspace_export_builds";
alter table public."workspace_export_receipts" add constraint "workspace_export_receipts_byte_size_check" CHECK (((byte_size >= 1) AND (byte_size <= 2000000)));
alter table public."workspace_export_receipts" add constraint "workspace_export_receipts_schema_version_check" CHECK ((schema_version = ANY (ARRAY[1, 2])));
commit;
