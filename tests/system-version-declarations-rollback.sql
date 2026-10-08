\set ON_ERROR_STOP on
\if :{?declaration_rollback_expected}
\else
\set declaration_rollback_expected false
\endif
begin;
select set_config('declaration_fixture.rollback_expected', :'declaration_rollback_expected', true);
do $$ declare signature text; expected boolean := current_setting('declaration_fixture.rollback_expected')='false'; begin
 foreach signature in array array[
  'public.publish_system_version_source_revision(uuid,text,jsonb)',
  'public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb)',
  'public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb)',
  'public.save_system_version(uuid,text,uuid,bigint,jsonb)',
  'public.read_system_version_pinned_revision(uuid,text,uuid)'
 ] loop
  if has_function_privilege('service_role',signature,'EXECUTE') is distinct from expected
   or has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') then
    raise exception 'package_declaration_rollback_privilege_failed: %',signature;
  end if;
 end loop;
 if (select count(*) from public.system_version_source_revisions r join public.system_version_sources s on s.system_id=r.source_system_id
     where s.business_workspace_id='bc326000-0000-4000-8000-000000000010')<>5
  or (select count(*) from public.system_version_releases r join public.system_versions v on v.id=r.version_id
     where v.business_workspace_id='bc326000-0000-4000-8000-000000000011')<>4 then
   raise exception 'package_declaration_rollback_retention_failed';
 end if;
 if not exists(select 1 from pg_trigger where tgname='system_version_native_release_declaration_guard' and tgenabled='O')
  or not exists(select 1 from pg_trigger where tgname='system_version_native_pointer_declaration_guard' and tgenabled='O')
  or not exists(select 1 from pg_trigger where tgname='system_version_source_declaration_guard' and tgenabled='O') then
   raise exception 'package_declaration_rollback_guard_failed';
 end if;
end $$;
\if :declaration_rollback_expected
set local role service_role;
do $$ begin
 begin perform public.save_system_version(null,null,null,null,null); raise exception 'quarantined save accepted';
 exception when insufficient_privilege then null; end;
 begin perform public.publish_system_version_source_revision(null,null,null); raise exception 'quarantined publication accepted';
 exception when insufficient_privilege then null; end;
 begin perform public.publish_agency_package(null,null,null,null,null,null); raise exception 'quarantined agency publication accepted';
 exception when insufficient_privilege then null; end;
 begin perform public.create_version_system_command(null,null,null,null,null,null,null); raise exception 'quarantined creation accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
\endif
rollback;
