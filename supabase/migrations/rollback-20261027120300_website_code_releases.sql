-- Rollback for 20261027120300_website_code_releases.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Refuses when a later migration changed reconcile_website_system_releases or its ACL.
-- Recorded code releases are immutable history: with any rows present this refuses
-- unless run after `set local sites_by_code.allow_drop = '1'`, which also drops them.
begin;
set local lock_timeout='3s';
do $$ begin
 if to_regclass('website_code_releases_rollback.functions') is null or (select count(*) from website_code_releases_rollback.functions)<>1 or exists(
  select 1 from website_code_releases_rollback.functions s left join pg_proc p on p.oid=to_regprocedure(s.signature)
  where p.oid is null or s.after_fingerprint is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then
  raise exception 'website_code_releases_rollback_later_function_or_acl';
 end if;
 if exists(select 1 from public.website_code_releases) and coalesce(current_setting('sites_by_code.allow_drop', true),'') <> '1' then
  raise exception 'website_code_releases_rollback_rows_retained';
 end if;
end $$;

drop function public.agent_record_website_code_release(text,text,uuid,uuid,uuid,text,text,text,text);
drop function public.agent_website_code_release_target(text,text,uuid,uuid);

-- Restore the previous reconcile body, then the helper it no longer needs.
do $$ declare row record; begin
 for row in select * from website_code_releases_rollback.functions where before_definition is not null loop
  execute replace(row.before_definition,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 end loop;
end $$;
drop function public.website_code_release_site(uuid,uuid);

drop trigger website_code_release_immutable_trg on public.website_code_releases;
drop table public.website_code_releases;
drop schema website_code_releases_rollback cascade;
notify pgrst,'reload schema';
commit;
