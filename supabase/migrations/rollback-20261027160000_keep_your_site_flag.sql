begin;
set local lock_timeout='3s';
lock table public.workspace_release_flags,public.agency_release_flag_ceilings,public.agency_release_flag_ceiling_history in access exclusive mode;
do $$ begin
 if exists(select 1 from public.agency_release_flag_ceiling_history where flag='keep_your_site') then
  raise exception 'keep_your_site_flag_rollback_has_history';
 end if;
end $$;
delete from public.workspace_release_flags where flag='keep_your_site';
delete from public.agency_release_flag_ceilings where flag='keep_your_site';
do $$ declare saved text; begin
 select before_definition into saved from keep_your_site_flag_rollback.functions where signature='public.agency_release_flag_system_kind(text)';
 if saved is null then raise exception 'keep_your_site_flag_rollback_missing_definition'; end if;
 execute saved;
end $$;
do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select coalesce(array_agg(key order by key),'{}') into previous from unnest(previous) key where key<>'keep_your_site';
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;
drop schema keep_your_site_flag_rollback cascade;
commit;
