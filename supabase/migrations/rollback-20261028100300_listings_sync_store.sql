-- Rollback for 20261028100300_listings_sync_store.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Numbered Releases are a record; it refuses while any exist unless dropping is allowed on purpose.
begin;
set local lock_timeout='3s';

do $$ begin
  if exists (select 1 from public.listing_sync_releases) and coalesce(current_setting('listing_sync.allow_drop', true), '') <> '1' then
    raise exception 'listing_sync_rollback_has_data';
  end if;
end $$;

drop function if exists public.read_listing_sync(uuid, uuid, text);
drop function if exists public.listing_sync_open_plan(uuid);
drop function if exists public.listing_sync_due_workspaces(int, text);
drop function if exists public.listing_sync_decline_plan(uuid, bigint, uuid);
drop function if exists public.listing_sync_set_fix(uuid, uuid, text[], text, text, text, uuid);
drop function if exists public.listing_sync_finish_check(uuid, uuid, text, jsonb, int, int, text);
drop function if exists public.listing_sync_save_fixes(uuid, uuid, jsonb);
drop function if exists public.listing_sync_targets(uuid);
drop function if exists public.listing_sync_confirmed_facts(uuid);
drop function if exists public.listing_sync_claim_checks(int, uuid);
drop function if exists public.listing_sync_queue_check(uuid, text, uuid);
drop trigger if exists listing_sync_releases_immutable on public.listing_sync_releases;
drop table if exists public.listing_sync_releases;
drop function if exists public.listing_sync_release_immutable();
drop table if exists public.listing_sync_fixes;
drop table if exists public.listing_sync_checks;

commit;
