-- Rollback for 20261007150200_platform_agency_workspace.sql
-- Forward SHA-256: dbfef968b7fa4a1129ca9b5ffb26470d48529266109ad4d45d86be19d7a052ba
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_platform_workspace(text)')))) is distinct from '764d9b4b44fa6bca2e458b1f0cd932f2' then raise exception 'rollback_wrong_order_or_function_drift: read_platform_workspace'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_platform_workspace(text,text,uuid)')))) is distinct from 'fd01127d4dbfb0d7036721301e61d481' then raise exception 'rollback_wrong_order_or_function_drift: set_platform_workspace'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_agency_workspace_sync_platform()')))) is distinct from '0ab5d2935c33e2409d2532ad9c0a18e5' then raise exception 'rollback_wrong_order_or_function_drift: strelva_agency_workspace_sync_platform'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.platform_workspaces') and attnum>0 and not attisdropped) <> 4 then raise exception 'rollback_wrong_order_or_table_drift: platform_workspaces'; end if;
end;
$rollback_guard$;
lock table public."platform_workspaces" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007150200_platform_workspaces" as table public."platform_workspaces";
revoke all on release_rollback_archive."m20261007150200_platform_workspaces" from public, anon, authenticated, service_role;
drop trigger "strelva_agency_workspace_sync_platform" on public."strelva_agency_workspace";
alter table public."platform_workspaces" drop constraint "platform_workspaces_role_check";
drop function public.read_platform_workspace(text);
drop function public.set_platform_workspace(text,text,uuid);
drop function public.strelva_agency_workspace_sync_platform();
drop table public."platform_workspaces";
commit;
