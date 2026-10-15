begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
-- Fence concurrent attempt creation before deciding the store is empty.
lock table public.conn_google_agency_oauth_attempts in share mode;
-- Refuse to discard consumed/finished evidence or an outstanding sign-in.
do $$ begin
 if (select count(*) from conn_google_rollback.functions)<>1 or exists(
  select 1 from conn_google_rollback.functions f left join pg_proc p on p.oid=to_regprocedure(f.signature)
  where p.oid is null or f.fingerprint is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then
  raise exception 'conn_google_rollback_function_drift';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosrc ~ '\mconn_google_agency_oauth\M'
  and not exists(select 1 from conn_google_rollback.functions f where p.oid=to_regprocedure(f.signature))) then
  raise exception 'conn_google_rollback_later_caller';
 end if;
 if exists(select 1 from public.conn_google_agency_oauth_attempts) then raise exception 'conn_google_populated_rollback_refused'; end if;
end $$;
drop function public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb);
drop table public.conn_google_agency_oauth_attempts;
drop table conn_google_rollback.functions;
drop schema conn_google_rollback;
notify pgrst,'reload schema';
commit;
