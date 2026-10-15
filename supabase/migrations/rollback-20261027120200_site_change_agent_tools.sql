-- Rollback for 20261027120200_site_change_agent_tools.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Refuses when a later migration changed the three restored functions or their ACLs.
-- Receipts recorded by a coding agent keep their rows; the provenance columns are
-- dropped, so they read as ordinary receipts afterwards. Take a verified dump first.
begin;
set local lock_timeout='3s';
do $$ begin
 if to_regclass('sites_by_code_rollback.functions') is null or (select count(*) from sites_by_code_rollback.functions)<>3 or exists(
  select 1 from sites_by_code_rollback.functions s left join pg_proc p on p.oid=to_regprocedure(s.signature)
  where p.oid is null or s.after_fingerprint is distinct from md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))) then
  raise exception 'sites_by_code_rollback_later_function_or_acl';
 end if;
end $$;

-- Nothing may keep website:code after the code that checks it is gone.
update public.assistant_connections set revoked_at=coalesce(revoked_at,clock_timestamp()) where 'website:code'=any(scopes);
update public.assistant_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where 'website:code'=any(scopes);

drop function public.agent_list_website_change_requests(text,text,uuid);
drop function public.agent_record_website_change(text,text,uuid,uuid,text,jsonb);
drop function public.website_change_may_deploy(uuid,uuid,text);
drop function public.list_website_change_reviews(uuid,uuid,text);

-- Restore the three previous bodies. The web path no longer delegates, so the step function can go.
do $$ declare row record; begin
 for row in select * from sites_by_code_rollback.functions where before_definition is not null loop
  execute replace(row.before_definition,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 end loop;
end $$;
drop function public.website_change_record_step(uuid,uuid,text,uuid,text,jsonb,uuid);
drop function public.website_change_receipts_json(uuid);

alter table public.website_change_receipts
  drop constraint website_change_receipts_preview_fields,
  drop column source_commit_sha,
  drop column branch,
  drop column summary,
  drop column owner_facing,
  drop column reported_by_connection;

drop schema sites_by_code_rollback cascade;
notify pgrst,'reload schema';
commit;
