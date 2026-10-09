begin;
set local lock_timeout='2s';
do $restore$
declare predecessor record;
begin
 for predecessor in select * from public.agency_created_application_predecessors order by signature loop
  if encode(sha256(convert_to(pg_get_functiondef(predecessor.signature::regprocedure),'UTF8')),'hex')<>predecessor.after_sha256 then raise exception 'agency_creator_successor_changed'; end if;
  execute predecessor.before_definition;
 end loop;
end $restore$;
drop function public.read_agency_created_application(uuid,uuid,text,uuid);
drop function public.lock_agency_created_application(uuid,uuid,text,uuid);
drop function public.agency_created_application_work_ids(uuid,uuid,text);
drop function public.agency_can_author_created_application(uuid,uuid,text,uuid);
drop table public.agency_created_application_predecessors;
commit;
