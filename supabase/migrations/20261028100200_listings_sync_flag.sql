begin;
set local lock_timeout='3s';

-- Listings in sync App: its own row per business, default off. Operator-switched
-- (not bound in agency_release_flag_system_kind), like care_reports and vertical_intake.
do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select array_agg(distinct key order by key) into previous from unnest(previous||array['listings_sync']) key;
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;

commit;
