begin;
set local lock_timeout='3s';
do $$ declare saved text; begin
 if exists(select 1 from keep_your_site_home_rollback.functions f left join pg_proc p on p.oid=to_regprocedure(f.signature)
   where p.oid is null or f.after_fingerprint is null
     or f.after_fingerprint is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then
  raise exception 'keep_your_site_home_rollback_drift';
 end if;
 select before_definition into saved from keep_your_site_home_rollback.functions where signature='public.read_agency_client_home(uuid,uuid,text)';
 execute saved;
end $$;
drop schema keep_your_site_home_rollback cascade;
notify pgrst,'reload schema';
commit;
