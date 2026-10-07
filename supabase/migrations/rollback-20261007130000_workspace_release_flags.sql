-- Rollback for 20261007130000_workspace_release_flags.sql
-- Forward SHA-256: f1c9a474ae30d058398552f7ab82d83236d39c76e4b7de59d49a0a96d4133994
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_release_flag_names()')))) is distinct from 'c01bf3fcf91f01e06965c7ff63d76b6c' then raise exception 'rollback_wrong_order_or_function_drift: workspace_release_flag_names'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_release_flags(uuid)')))) is distinct from 'df293324a8f2f40e54216d524c18526f' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_release_flags'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_release_assert_operator(text)')))) is distinct from '24b1bf1ef882eb1505e82de30f933d1e' then raise exception 'rollback_wrong_order_or_function_drift: workspace_release_assert_operator'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_release_assert_workspace(uuid)')))) is distinct from 'aa28b1ff049a8ec61f862a0453b29a49' then raise exception 'rollback_wrong_order_or_function_drift: workspace_release_assert_workspace'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_release_flag_change_immutable()')))) is distinct from '46580f83e0e90337abc4b3316bd53169' then raise exception 'rollback_wrong_order_or_function_drift: workspace_release_flag_change_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.resolve_tenant_owner_entry(text,uuid,text)')))) is distinct from 'de7281d81baede71fae6b55c76aae3ce' then raise exception 'rollback_wrong_order_or_function_drift: resolve_tenant_owner_entry'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_tenant_links(uuid,uuid,text)')))) is distinct from '784ac962d57e7d83dda5cb24d3239985' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_tenant_links'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_workspace_release_flag_history(text,uuid,integer)')))) is distinct from '13cd0ec8e218a1317f0b201393af4615' then raise exception 'rollback_wrong_order_or_function_drift: read_workspace_release_flag_history'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_workspace_release_tester(text,uuid,text,boolean,text)')))) is distinct from 'c718757ad068a4e51122806eeda53314' then raise exception 'rollback_wrong_order_or_function_drift: set_workspace_release_tester'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_workspace_release_flag(text,uuid,text,text,text,bigint)')))) is distinct from 'abfb91a1959e83e1044cf462711dd03d' then raise exception 'rollback_wrong_order_or_function_drift: set_workspace_release_flag'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.workspace_release_testers') and attnum>0 and not attisdropped) <> 4 then raise exception 'rollback_wrong_order_or_table_drift: workspace_release_testers'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.workspace_release_flag_changes') and attnum>0 and not attisdropped) <> 9 then raise exception 'rollback_wrong_order_or_table_drift: workspace_release_flag_changes'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.workspace_release_flags') and attnum>0 and not attisdropped) <> 6 then raise exception 'rollback_wrong_order_or_table_drift: workspace_release_flags'; end if;
end;
$rollback_guard$;
lock table public."workspace_release_flag_changes", public."workspace_release_flags", public."workspace_release_testers" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007130000_workspace_release_flag_changes" as table public."workspace_release_flag_changes";
revoke all on release_rollback_archive."m20261007130000_workspace_release_flag_changes" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007130000_workspace_release_flags" as table public."workspace_release_flags";
revoke all on release_rollback_archive."m20261007130000_workspace_release_flags" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007130000_workspace_release_testers" as table public."workspace_release_testers";
revoke all on release_rollback_archive."m20261007130000_workspace_release_testers" from public, anon, authenticated, service_role;
drop trigger "workspace_release_flag_changes_immutable_trg" on public."workspace_release_flag_changes";
alter table public."workspace_release_flags" drop constraint "workspace_release_flags_flag_check";
alter table public."workspace_release_flags" drop constraint "workspace_release_flags_state_check";
alter table public."workspace_release_flags" drop constraint "workspace_release_flags_revision_check";
alter table public."workspace_release_flag_changes" drop constraint "workspace_release_flag_changes_reason_check";
alter table public."workspace_release_flag_changes" drop constraint "workspace_release_flag_changes_subject_check";
alter table public."workspace_release_flag_changes" drop constraint "workspace_release_flag_changes_to_state_check";
alter table public."workspace_release_flag_changes" drop constraint "workspace_release_flag_changes_from_state_check";
drop function public.workspace_release_flag_names();
drop function public.read_workspace_release_flags(uuid);
drop function public.workspace_release_assert_operator(text);
drop function public.workspace_release_assert_workspace(uuid);
drop function public.workspace_release_flag_change_immutable();
drop function public.resolve_tenant_owner_entry(text,uuid,text);
drop function public.read_workspace_tenant_links(uuid,uuid,text);
drop function public.read_workspace_release_flag_history(text,uuid,integer);
drop function public.set_workspace_release_tester(text,uuid,text,boolean,text);
drop function public.set_workspace_release_flag(text,uuid,text,text,text,bigint);
drop table public."workspace_release_flag_changes", public."workspace_release_flags", public."workspace_release_testers";
commit;
