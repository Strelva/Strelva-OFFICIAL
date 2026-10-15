-- Never discard later code/ACLs or leave explicit immutable declarations without
-- their validator. A populated inverse requires a forward-preserving successor.
begin;
set local lock_timeout='3s';
-- Fence publication while checking whether explicit declarations are retained.
LOCK TABLE public.system_version_source_revisions IN SHARE MODE;
do $$ declare row record; begin
 if (select count(*) from conn_apps_rollback.functions)<>3 or exists(
  select 1 from conn_apps_rollback.functions s left join pg_proc p on p.oid=to_regprocedure(s.signature)
  where p.oid is null or s.after_fingerprint is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then
  raise exception 'conn_apps_rollback_later_function_or_acl';
 end if;
 if exists(select 1 from public.system_version_source_revisions where declaration ? 'requiredConnections') then
  raise exception 'conn_apps_rollback_explicit_declarations_retained';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosrc ~ 'system_package_behavior_before_conn_apps\s*\('
  and not exists(select 1 from conn_apps_rollback.functions s where p.oid=to_regprocedure(s.signature))) then
  raise exception 'conn_apps_rollback_later_caller';
 end if;
 for row in select * from conn_apps_rollback.functions where before_definition is not null loop
  execute replace(row.before_definition,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 end loop;
end $$;
drop function public.system_package_behavior_before_conn_apps(jsonb,text[]);
drop table conn_apps_rollback.functions;
drop schema conn_apps_rollback;
notify pgrst,'reload schema';
commit;
