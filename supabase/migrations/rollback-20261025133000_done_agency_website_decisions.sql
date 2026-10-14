begin;
set local lock_timeout = '3s';
lock table public.owner_decisions in access exclusive mode;
lock table public.done_agency_website_executions in access exclusive mode;
do $$ begin
  if (select count(*) from public.done_agency_website_catalog_guard) <> 8
    or exists(select 1 from public.done_agency_website_catalog_guard where definition_hash is distinct from md5(pg_get_functiondef(to_regprocedure(signature)))) then
    raise exception 'done_agency_website_rollback_successor_conflict'; end if;
  if exists(select 1 from public.done_agency_website_executions)
    or exists(select 1 from public.owner_decisions where source_lifecycle in ('website_document','website_domain') and decided_by_kind='agency_session') then
    raise exception 'done_agency_website_rollback_recorded_execution'; end if;
end $$;
drop function public.authorize_website_domain_request(uuid,uuid);
alter function public.authorize_website_domain_request_before_done_agency(uuid,uuid) rename to authorize_website_domain_request;
grant execute on function public.authorize_website_domain_request(uuid,uuid) to service_role;
drop function public.publish_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,text);
drop function public.reserve_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,text,uuid,text);
drop function public.approve_website_by_agency_decision(uuid,uuid,uuid,text,integer,text,uuid,text);
drop function public.assert_website_agency_decision(uuid,uuid,uuid,text,integer,text,uuid,text,text);
drop table public.done_agency_website_executions;
drop function public.agency_owner_decision_scopes(public.owner_decisions);
alter function public.agency_owner_decision_scopes_before_done_agency(public.owner_decisions) rename to agency_owner_decision_scopes;
drop table public.done_agency_website_catalog_guard;
notify pgrst, 'reload schema';
commit;
