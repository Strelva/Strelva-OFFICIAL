-- Rollback for 20261007181000_tenant_client_records.sql
-- Forward SHA-256: 3aed57fe6984b933031df77c42a7d734ab7ca8e00dcc0618a78c346c868ae3b2
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_client_records_on_link()')))) is distinct from '2d2521745e371f1f0b06990754563fc2' then raise exception 'rollback_wrong_order_or_function_drift: tenant_client_records_on_link'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.client_record_parity_streak(text)')))) is distinct from '81ea1c81d98a9eda2f6aac2fca45caa9' then raise exception 'rollback_wrong_order_or_function_drift: client_record_parity_streak'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_client_records_on_unlink()')))) is distinct from 'eb4daceff8865171ac628932448c0531' then raise exception 'rollback_wrong_order_or_function_drift: tenant_client_records_on_unlink'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_client_record_workspace(uuid)')))) is distinct from '7d383b24913ba13545d77fe99e0588da' then raise exception 'rollback_wrong_order_or_function_drift: tenant_client_record_workspace'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_client_record_digests(text,text)')))) is distinct from 'ed2dc453be7773802bb59357ca77bdc8' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_client_record_digests'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_client_records(text,text,integer,timestamp with time zone)')))) is distinct from 'efdb3da3a4e9f059cab7cd79d014d24a' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_client_records'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_client_record_parity(text,text,integer,integer,integer,integer)')))) is distinct from '4139b288b0b42fb9e0edc6b0394c9848' then raise exception 'rollback_wrong_order_or_function_drift: record_client_record_parity'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_tenant_client_record(text,text,text,jsonb,text,timestamp with time zone,text,text)')))) is distinct from 'a0742b62f50f0669446f640b05063172' then raise exception 'rollback_wrong_order_or_function_drift: record_tenant_client_record'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.tenant_client_record_parity') and attnum>0 and not attisdropped) <> 9 then raise exception 'rollback_wrong_order_or_table_drift: tenant_client_record_parity'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.tenant_client_records') and attnum>0 and not attisdropped) <> 12 then raise exception 'rollback_wrong_order_or_table_drift: tenant_client_records'; end if;
end;
$rollback_guard$;
lock table public."tenant_client_record_parity", public."tenant_client_records" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007181000_tenant_client_record_parity" as table public."tenant_client_record_parity";
revoke all on release_rollback_archive."m20261007181000_tenant_client_record_parity" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007181000_tenant_client_records" as table public."tenant_client_records";
revoke all on release_rollback_archive."m20261007181000_tenant_client_records" from public, anon, authenticated, service_role;
drop trigger "tenant_workspace_links_client_records" on public."tenant_workspace_links";
drop trigger "tenant_workspace_links_client_records_unlink" on public."tenant_workspace_links";
alter table public."tenant_client_records" drop constraint "tenant_client_records_store_check";
alter table public."tenant_client_records" drop constraint "tenant_client_records_payload_check";
alter table public."tenant_client_records" drop constraint "tenant_client_records_record_id_check";
alter table public."tenant_client_records" drop constraint "tenant_client_records_payload_hash_check";
alter table public."tenant_client_records" drop constraint "tenant_client_records_recorded_via_check";
alter table public."tenant_client_record_parity" drop constraint "tenant_client_record_parity_missing_check";
alter table public."tenant_client_record_parity" drop constraint "tenant_client_record_parity_mismatched_check";
alter table public."tenant_client_record_parity" drop constraint "tenant_client_record_parity_redis_count_check";
alter table public."tenant_client_record_parity" drop constraint "tenant_client_record_parity_postgres_count_check";
drop function public.tenant_client_records_on_link();
drop function public.client_record_parity_streak(text);
drop function public.tenant_client_records_on_unlink();
drop function public.tenant_client_record_workspace(uuid);
drop function public.read_tenant_client_record_digests(text,text);
drop function public.read_tenant_client_records(text,text,integer,timestamp with time zone);
drop function public.record_client_record_parity(text,text,integer,integer,integer,integer);
drop function public.record_tenant_client_record(text,text,text,jsonb,text,timestamp with time zone,text,text);
drop table public."tenant_client_record_parity", public."tenant_client_records";
commit;
