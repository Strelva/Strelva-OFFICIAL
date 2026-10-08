-- New channel stays default-off independently of the existing live channels.
do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select array_agg(distinct key order by key) into previous from unnest(previous||array['make_real_live:google_listing']) key;
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;
