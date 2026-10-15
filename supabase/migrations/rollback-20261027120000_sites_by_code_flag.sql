-- Rollback for 20261027120000_sites_by_code_flag.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
begin;
set local lock_timeout='3s';

delete from public.agency_release_flag_ceilings where flag='sites_by_code';
alter table public.workspace_release_flag_changes disable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flag_changes where subject='sites_by_code';
alter table public.workspace_release_flag_changes enable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flags where flag='sites_by_code';

do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select coalesce(array_agg(key order by ord),array[]::text[]) into previous from unnest(previous) with ordinality t(key,ord) where key<>'sites_by_code';
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;

commit;
