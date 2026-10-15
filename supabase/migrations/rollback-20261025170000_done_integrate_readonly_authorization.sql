-- Refuse to overwrite any later reader/helper definition or ACL.
begin;
set local lock_timeout='3s';
do $$ declare row record; begin
 if (select count(*) from done_integrate_readonly_rollback.functions)<>7 or exists(
  select 1 from done_integrate_readonly_rollback.functions s left join pg_proc p on p.oid=to_regprocedure(s.signature)
  where p.oid is null or s.after_fingerprint is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then
  raise exception 'done_integrate_readonly_rollback_later_reader_or_helper';
 end if;
 -- A later caller is a successor even when its helper body stayed unchanged.
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosrc ~ '(agency_directory_assert_manager_readonly|inquiry_forwarding_actor_readonly|service_request_assert_agency_client_readonly)\s*\('
  and not exists(select 1 from done_integrate_readonly_rollback.functions s where p.oid=to_regprocedure(s.signature))) then
  raise exception 'done_integrate_readonly_rollback_later_caller';
 end if;
 for row in select * from done_integrate_readonly_rollback.functions where before_definition is not null loop
  execute replace(row.before_definition,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 end loop;
end $$;
drop function public.agency_directory_assert_manager_readonly(uuid,uuid,text);
drop function public.inquiry_forwarding_actor_readonly(uuid,uuid,text);
drop function public.service_request_assert_agency_client_readonly(uuid,uuid,uuid,text);
drop table done_integrate_readonly_rollback.functions;
drop schema done_integrate_readonly_rollback;
notify pgrst,'reload schema';
commit;
