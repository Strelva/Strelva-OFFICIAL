-- Lane 13 keep-your-site: a default-off workspace release flag. Held and unapplied.
-- Nothing here turns anything on: no row is written, so every business stays off.
begin;
set local lock_timeout='3s';

do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select array_agg(distinct key order by key) into previous from unnest(previous||array['keep_your_site']) key;
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;

create schema keep_your_site_flag_rollback;
revoke all on schema keep_your_site_flag_rollback from public,anon,authenticated,service_role;
create table keep_your_site_flag_rollback.functions(signature text primary key,before_definition text not null);
alter table keep_your_site_flag_rollback.functions enable row level security;
revoke all on keep_your_site_flag_rollback.functions from public,anon,authenticated,service_role;
insert into keep_your_site_flag_rollback.functions(signature,before_definition)
 select 'public.agency_release_flag_system_kind(text)',pg_get_functiondef(to_regprocedure('public.agency_release_flag_system_kind(text)'));

-- Agency ceilings bind the flag to website Systems, like connected_sites.
create or replace function public.agency_release_flag_system_kind(p_flag text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_flag when 'make_real_live:hosted_website' then 'website' when 'make_real_live:tenant_content' then 'website'
 when 'make_real_live:inquiry_form' then 'inquiry' when 'make_real_live:booking_page' then 'booking'
 when 'make_real_live:internal_app' then 'internal_app' when 'website_rebuild' then 'website'
 when 'connected_sites' then 'website' when 'keep_your_site' then 'website' when 'newsletter_contacts' then 'newsletter' end
$$;

commit;
