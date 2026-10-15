-- Refuse populated metadata, successor definitions, ACL changes and later callers.
begin;
set local lock_timeout='3s';
lock table public.connection_holders,public.connection_holder_commands in access exclusive mode;
do $$ declare r record; begin
 if exists(select 1 from public.connection_holders) or exists(select 1 from public.connection_holder_commands) then raise exception 'conn_core_rollback_retained_holders'; end if;
 if (select count(*) from conn_core_rollback.functions)<>13 or exists(select 1 from conn_core_rollback.functions s left join pg_proc p on p.oid=to_regprocedure(s.signature)
 where p.oid is null or s.after_fingerprint is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then raise exception 'conn_core_rollback_successor'; end if;
 if exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace
 and p.prosrc ~ '(connection_lock_source|connection_source_workspace|connection_version_binding_owner|connection_provider_area|connection_agency_holds_area|read_connection_actor_scope|connection_holder_valid|connection_holder_usable|record_connection_holder|read_connection_holders)\s*\('
 and not exists(select 1 from conn_core_rollback.functions s where p.oid=to_regprocedure(s.signature))) then raise exception 'conn_core_rollback_later_caller'; end if;
 for r in select * from conn_core_rollback.functions where before_definition is not null loop
 execute replace(r.before_definition,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION'); end loop;
end $$;
drop function public.connection_lock_source(text,text);
drop function public.connection_source_workspace(text,text,boolean);
drop function public.connection_version_binding_owner(uuid,text,text);
drop function public.record_connection_holder(uuid,uuid,text,text,text,jsonb,jsonb,uuid,text);
drop function public.read_connection_holders(uuid);
drop function public.connection_holder_usable(uuid,uuid,text,text,jsonb,jsonb);
drop function public.connection_holder_valid(jsonb,boolean);
drop function public.read_connection_actor_scope(uuid,uuid,text);
drop function public.connection_agency_holds_area(uuid,uuid,text);
drop function public.connection_provider_area(text);
drop table public.connection_holder_commands,public.connection_holders;
drop table conn_core_rollback.functions;
drop schema conn_core_rollback;
notify pgrst,'reload schema';
commit;
