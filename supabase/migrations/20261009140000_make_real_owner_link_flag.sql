-- Make real by signed email link for an owner with no account gets its own
-- per-business release flag. Additive. Local only until Jacob's yes.
--
-- Why. 20261009131000_make_real_owner_link added the make_real_link session,
-- but in the app it turned on wherever STRELVA_NEEDS_YOU_RELEASE and
-- STRELVA_SYSTEMS_RELEASE were both on (release packet finding 16). Strelva
-- running a real change on an emailed tap deserves its own switch, business
-- by business, independent of Needs you and Systems.
--
-- What this changes: workspace_release_flag_names() gains
-- `make_real_owner_link`. Every earlier key (20261009100000) is kept, in the
-- same order. The app reads it under STRELVA_MAKE_REAL_OWNER_LINK_RELEASE
-- (unset: off everywhere; `workspace`: on only where the business's row says
-- `on`; `1`: on except rows `off`). Off, the link answers "Sign in to decide
-- this" and no make_real_link session is ever asked for. No table, row or
-- grant changes; the existing check constraints call this function, so a
-- `make_real_owner_link` row becomes valid and nothing else does.
--
-- Rollback: delete workspace_release_flags rows with flag
-- 'make_real_owner_link' (and their change history rows, with the history's
-- immutability trigger disabled for that statement only), then restore
-- workspace_release_flag_names() from 20261009100000_strelva_service_actor.sql.

set local lock_timeout = '3s';

create or replace function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
    'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
    'make_real_live:booking_page', 'make_real_live:internal_app', 'connected_sites',
    'make_real_owner_link']::text[]
$$;

revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;
