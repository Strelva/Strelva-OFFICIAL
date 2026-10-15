-- Rollback for 20261028100200_listings_sync_flag.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
begin;
set local lock_timeout='3s';

delete from public.agency_release_flag_ceilings where flag='listings_sync';
alter table public.workspace_release_flag_changes disable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flag_changes where subject='listings_sync';
alter table public.workspace_release_flag_changes enable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flags where flag='listings_sync';

do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select coalesce(array_agg(key order by ord),array[]::text[]) into previous from unnest(previous) with ordinality t(key,ord) where key<>'listings_sync';
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;

commit;
