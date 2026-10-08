-- Additive flag names only. No rollout or policy decision is implied.
set local lock_timeout = '3s';
-- Append this stream's keys to the current list; never restate other streams' keys (#253).
do $migration$
declare previous text[];
begin
  previous := public.workspace_release_flag_names();
  select array_agg(distinct key order by key) into previous from unnest(previous || array['publishing','publishing_record_google_policy']) key;
  execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path = public, pg_temp as %L',
    format('select %L::text[]', previous::text));
end;
$migration$;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;
