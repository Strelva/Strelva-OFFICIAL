begin;
set local lock_timeout='3s';
do $$ begin
  if (select count(*) from conn_tools_installer_rollback.fingerprint)<>3 or exists (
    select 1 from conn_tools_installer_rollback.fingerprint f left join pg_proc p on p.oid=to_regprocedure(f.signature)
    where p.oid is null or f.value is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then
    raise exception 'conn_tools_installer_rollback_function_drift';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and not exists(select 1 from conn_tools_installer_rollback.fingerprint f where p.oid=to_regprocedure(f.signature))
    and p.prosrc ~ '\m(read_connected_site_installer|read_connected_site_connection_metadata|create_connected_site_for_installer)\M') then
    raise exception 'conn_tools_installer_rollback_later_caller';
  end if;
end $$;
drop function public.create_connected_site_for_installer(uuid,uuid,text,jsonb);
drop function public.read_connected_site_installer(uuid,uuid,text);
drop function public.read_connected_site_connection_metadata(uuid);
drop table conn_tools_installer_rollback.fingerprint;
drop schema conn_tools_installer_rollback;
notify pgrst,'reload schema';
commit;
