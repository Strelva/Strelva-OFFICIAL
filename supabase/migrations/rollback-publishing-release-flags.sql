begin;
set local lock_timeout = '3s';
delete from public.workspace_release_flags where flag in ('publishing', 'publishing_record_google_policy');
alter table public.workspace_release_flag_changes disable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flag_changes where subject in ('publishing', 'publishing_record_google_policy');
alter table public.workspace_release_flag_changes enable trigger workspace_release_flag_changes_immutable_trg;
create or replace function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
    'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
    'make_real_live:booking_page', 'make_real_live:internal_app', 'connected_sites',
    'make_real_owner_link']::text[]
$$;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;
commit;
