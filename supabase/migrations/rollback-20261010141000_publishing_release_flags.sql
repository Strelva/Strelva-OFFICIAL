begin;
set local lock_timeout = '3s';
delete from public.workspace_release_flags where flag in ('publishing', 'publishing_record_google_policy');
alter table public.workspace_release_flag_changes disable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flag_changes where subject in ('publishing', 'publishing_record_google_policy');
alter table public.workspace_release_flag_changes enable trigger workspace_release_flag_changes_immutable_trg;
-- Remove only this stream's keys; never restate other streams' keys (#253).
do $migration$
declare previous text[];
begin
  previous := public.workspace_release_flag_names();
  select array_agg(distinct key order by key) into previous from unnest(previous) key where key <> all(array['publishing','publishing_record_google_policy']);
  execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path = public, pg_temp as %L',
    format('select %L::text[]', previous::text));
end;
$migration$;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;
commit;
