begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
-- Refuse to discard consumed/finished evidence or an outstanding sign-in.
do $$ begin
 if exists(select 1 from public.conn_google_agency_oauth_attempts) then raise exception 'conn_google_populated_rollback_refused'; end if;
end $$;
drop function public.conn_google_agency_oauth(uuid,text,uuid,uuid,text,jsonb);
drop table public.conn_google_agency_oauth_attempts;
commit;
