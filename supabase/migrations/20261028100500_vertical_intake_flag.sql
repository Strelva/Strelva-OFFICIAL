begin;
set local lock_timeout='3s';

-- Dental intake (new-patient form): its own row per business, default off.
do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select array_agg(distinct key order by key) into previous from unnest(previous||array['vertical_intake']) key;
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;

revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;

commit;
