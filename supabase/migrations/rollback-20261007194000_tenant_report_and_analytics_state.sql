-- Rollback for 20261007194000_tenant_report_and_analytics_state.sql
-- Forward SHA-256: 7b014b307346abcb077165399806cfb74bc9ac8a2215dd7fb6d49b716d623a51
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_report_state(text)')))) is distinct from 'a318a2077bc7e838e56d4f54111e9bf1' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_report_state'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_analytics_config(text)')))) is distinct from '0c148b0e58fd30411ca87393b2621f58' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_analytics_config'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_tenant_report_cadence(text,text,text)')))) is distinct from '1e85bd797ba5a7ca2c04d93aa556c51d' then raise exception 'rollback_wrong_order_or_function_drift: set_tenant_report_cadence'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.write_tenant_analytics_config(text,jsonb,text)')))) is distinct from '5fb4d28203251318b84feecd73aa5a71' then raise exception 'rollback_wrong_order_or_function_drift: write_tenant_analytics_config'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.mark_tenant_report_sent(text,timestamp with time zone,text)')))) is distinct from '462995b706785175d977621988243ea4' then raise exception 'rollback_wrong_order_or_function_drift: mark_tenant_report_sent'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.tenant_report_state') and attnum>0 and not attisdropped) <> 5 then raise exception 'rollback_wrong_order_or_table_drift: tenant_report_state'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.tenant_analytics_config') and attnum>0 and not attisdropped) <> 6 then raise exception 'rollback_wrong_order_or_table_drift: tenant_analytics_config'; end if;
end;
$rollback_guard$;
lock table public."tenant_analytics_config", public."tenant_report_state" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007194000_tenant_analytics_config" as table public."tenant_analytics_config";
revoke all on release_rollback_archive."m20261007194000_tenant_analytics_config" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007194000_tenant_report_state" as table public."tenant_report_state";
revoke all on release_rollback_archive."m20261007194000_tenant_report_state" from public, anon, authenticated, service_role;
alter table public."tenant_report_state" drop constraint "tenant_report_state_cadence_check";
alter table public."tenant_report_state" drop constraint "tenant_report_state_recorded_via_check";
alter table public."tenant_analytics_config" drop constraint "tenant_analytics_config_gsc_property_check";
alter table public."tenant_analytics_config" drop constraint "tenant_analytics_config_recorded_via_check";
alter table public."tenant_analytics_config" drop constraint "tenant_analytics_config_ga4_property_id_check";
drop function public.read_tenant_report_state(text);
drop function public.read_tenant_analytics_config(text);
drop function public.set_tenant_report_cadence(text,text,text);
drop function public.write_tenant_analytics_config(text,jsonb,text);
drop function public.mark_tenant_report_sent(text,timestamp with time zone,text);
drop table public."tenant_analytics_config", public."tenant_report_state";
commit;
