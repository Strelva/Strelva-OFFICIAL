-- #326 fail-closed rollback: quarantine affected entrypoints, preserve evidence.
-- Deployment order: pause package authoring/Version release traffic, apply this
-- quarantine, then roll application code back. Old application code must not
-- be allowed to publish through the pre-declaration RPC implementation.
-- This intentionally does NOT restore the unsafe historical schema: immutable
-- declarations, all rows/history and SQL guards stay installed. To resume,
-- deploy declaration-aware callers and reapply the forward migration; it
-- reinstalls the guards before atomically restoring service-only entrypoints.
begin;
set local lock_timeout='2s';
do $$ begin
  if to_regprocedure('public.system_version_assert_native_declaration(jsonb,jsonb,text[])') is null
    or to_regprocedure('public.read_system_version_pinned_revision(uuid,text,uuid)') is null
    or not exists(select 1 from pg_trigger where tgrelid='public.application_releases'::regclass
      and tgname='system_version_native_release_declaration_guard' and not tgisinternal and tgenabled='O')
    or not exists(select 1 from pg_trigger where tgrelid='public.application_states'::regclass
      and tgname='system_version_native_pointer_declaration_guard' and not tgisinternal and tgenabled='O')
    or not exists(select 1 from pg_trigger where tgrelid='public.system_version_source_revisions'::regclass
      and tgname='system_version_source_declaration_guard' and not tgisinternal and tgenabled='O') then
    raise exception 'package_declarations_rollback_guard_missing';
  end if;
end $$;
revoke all on function public.publish_system_version_source_revision(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.save_system_version(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_system_version_pinned_revision(uuid,text,uuid) from public,anon,authenticated,service_role;
commit;
