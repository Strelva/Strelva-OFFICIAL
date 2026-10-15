-- Never discard an Outlook holder or an App that declares one, and never replay
-- an older function over a later one. A populated inverse needs a forward-
-- preserving successor.
begin;
set local lock_timeout='3s';
lock table public.connection_holders in share mode;
lock table public.system_version_source_revisions in share mode;
do $$ declare row record; begin
 if exists(select 1 from public.connection_holders where provider='outlook_calendar') then
  raise exception 'conn_outlook_rollback_populated';
 end if;
 if exists(select 1 from public.system_version_source_revisions r where r.declaration ? 'requiredConnections'
  and exists(select 1 from jsonb_array_elements(r.declaration->'requiredConnections') item where item->>'provider'='outlook_calendar')) then
  raise exception 'conn_outlook_rollback_populated';
 end if;
 if (select count(*) from conn_outlook_rollback.functions)<>5 or exists(
  select 1 from conn_outlook_rollback.functions s left join pg_proc p on p.oid=to_regprocedure(s.signature)
  where p.oid is null or s.after_fingerprint is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then
  raise exception 'conn_outlook_rollback_function_drift';
 end if;
 for row in select * from conn_outlook_rollback.functions loop
  execute replace(row.before_definition,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 end loop;
end $$;
alter table public.connection_holders drop constraint connection_holders_provider_check,
 add constraint connection_holders_provider_check check(provider in ('google_business_profile','google_calendar','calendly','highlevel','connected_site','stripe','resend','instagram'));
drop table conn_outlook_rollback.functions;
drop schema conn_outlook_rollback;
notify pgrst,'reload schema';
commit;
