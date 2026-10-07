-- Rollback for 20261008124000_needs_you_policy_settings.sql
-- Forward SHA-256: d377b485506f9cc614091c73c1db80e0f71996c1bc3c94c69aaf00bc16aae5cf
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.needs_you_tenant_link(text)')))) is distinct from 'a69f2b08174ffac7412a966a6da965bb' then raise exception 'rollback_wrong_order_or_function_drift: needs_you_tenant_link'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_decision_routes(text)')))) is distinct from 'f77d5b574bee2d1205bc0b87504caa55' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_decision_routes'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.decision_policy_tenant_imports_immutable()')))) is distinct from 'bb50a4df23bc57ac733ea356d51f38bd' then raise exception 'rollback_wrong_order_or_function_drift: decision_policy_tenant_imports_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_decision_policy_businesses(uuid,text)')))) is distinct from 'cb748e9cc83736ad0ed8b318ab7652a3' then raise exception 'rollback_wrong_order_or_function_drift: list_decision_policy_businesses'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_owner_decisions_not_told(uuid,text,integer)')))) is distinct from 'ad76da29541eb187f5de1851fcaf8d05' then raise exception 'rollback_wrong_order_or_function_drift: list_owner_decisions_not_told'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_tenant_decision_route(text,uuid,text,text,text,text,text,text,text)')))) is distinct from '64f1ffe09921a6c60eb01d504320edf3' then raise exception 'rollback_wrong_order_or_function_drift: set_tenant_decision_route'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.decision_policy_tenant_imports') and attnum>0 and not attisdropped) <> 8 then raise exception 'rollback_wrong_order_or_table_drift: decision_policy_tenant_imports'; end if;
end;
$rollback_guard$;
lock table public."decision_policy_tenant_imports" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008124000_decision_policy_tenant_imports" as table public."decision_policy_tenant_imports";
revoke all on release_rollback_archive."m20261008124000_decision_policy_tenant_imports" from public, anon, authenticated, service_role;
drop trigger "decision_policy_tenant_imports_immutable" on public."decision_policy_tenant_imports";
alter table public."decision_policy_tenant_imports" drop constraint "decision_policy_tenant_imports_change_kind_check";
alter table public."decision_policy_tenant_imports" drop constraint "decision_policy_tenant_imports_today_value_check";
alter table public."decision_policy_tenant_imports" drop constraint "decision_policy_tenant_imports_imported_via_check";
alter table public."decision_policy_tenant_imports" drop constraint "decision_policy_tenant_imports_not_migrated_check";
drop function public.needs_you_tenant_link(text);
drop function public.read_tenant_decision_routes(text);
drop function public.decision_policy_tenant_imports_immutable();
drop function public.list_decision_policy_businesses(uuid,text);
drop function public.list_owner_decisions_not_told(uuid,text,integer);
drop function public.set_tenant_decision_route(text,uuid,text,text,text,text,text,text,text);
drop table public."decision_policy_tenant_imports";
commit;
