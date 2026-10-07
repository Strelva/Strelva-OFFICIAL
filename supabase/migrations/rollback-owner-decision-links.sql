-- Disable STRELVA_OWNER_DECISION_LINKS_RELEASE and deploy that env change
-- before rollback. This removes all new execution entry points; historical
-- sessions, run audits and release-flag history remain append-only evidence.
-- Original RPCs, owner memberships and tenant routes are untouched.
begin;
set local lock_timeout = '3s';
drop function if exists public.reserve_website_by_owner_link(uuid,uuid,uuid,text,integer,text,text,uuid,uuid,text,text);
drop function if exists public.publish_website_by_owner_link(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,uuid,text,text);
drop function if exists public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text);
drop function if exists public.authorize_owner_decision_link_run(uuid,uuid,uuid,text,text);
drop function if exists public.strelva_owner_decision_link_session(uuid,uuid,text,text);
drop function if exists public.assert_owner_decision_link(uuid,uuid,uuid,text,text);
-- Restore batch 7A's service effect map (byte-identical, so 7A's rollback
-- guard still matches); open link sessions then fail their recheck.
create or replace function public.platform_service_effect(p_purpose text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_purpose
    when 'needs_you_sync' then 'email'
    when 'make_real_resume' then 'publish'
    when 'make_real_link' then 'publish' end
$$;
-- owner_decision_link_sessions and its purpose check deliberately remain:
-- rollback must not erase the owner's approval or Strelva's execution trail.

commit;
