-- Refuse to erase submitted evidence or operator decisions. Export/reconcile first.
begin;
set local lock_timeout = '3s';
-- Serialize against every in-flight submission/decision before deciding emptiness.
lock table public.agency_qualification_submissions, public.agency_qualification_decisions, public.agency_verifications in access exclusive mode;
do $$ begin
  if exists(select 1 from public.agency_qualification_submissions) or exists(select 1 from public.agency_qualification_decisions) then
    raise exception 'agency_qualification_populated_rollback_refused';
  end if;
  if (select count(*)<>3 or not bool_and(after_hash is not null and after_hash=md5(pg_get_functiondef(signature::regprocedure))) from ux_agency_qualification_rollback.functions) then
    raise exception 'agency_qualification_rollback_function_drift';
  end if;
end $$;
drop function public.decide_agency_qualification(text,uuid,text,text);
drop function public.read_agency_qualification_desk(text);
drop function public.submit_agency_qualification(uuid,text,uuid,uuid,text,text,text);
drop function public.read_agency_qualification(uuid,text,uuid);
drop function public.agency_qualification_records(uuid);
drop table public.agency_qualification_decisions;
drop table public.agency_qualification_submissions;
drop function public.agency_qualification_immutable();
do $$ declare saved record; begin
  for saved in select before_definition from ux_agency_qualification_rollback.functions loop execute saved.before_definition; end loop;
end $$;
drop schema ux_agency_qualification_rollback cascade;
commit;
