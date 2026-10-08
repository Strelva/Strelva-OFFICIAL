-- The exact release flag allowlist after every migration: the union of each
-- stream's keys, matching RELEASE_FLAGS in src/platform/release-flags/resolve.ts.
-- Pinned batch 0-7 migrations restate a literal list; every later stream
-- appends its own keys to the current list (#253), so apply order does not
-- matter. A migration that drops another stream's key fails here.
begin;

do $$
declare
  expected text[] := array['approval_store', 'catalog_reports', 'connected_sites', 'finite_jobs', 'inquiries', 'internal_tool_notices',
    'make_real_live:booking_page', 'make_real_live:hosted_website', 'make_real_live:inquiry_form',
    'make_real_live:internal_app', 'make_real_live:tenant_content',
    'make_real_owner_link', 'newsletter_contacts', 'owner_decision_links', 'owner_entry', 'publishing',
    'publishing_record_google_policy', 'systems', 'website_rebuild'];
  actual text[] := (select array_agg(key order by key) from unnest(public.workspace_release_flag_names()) key);
begin
  if actual is distinct from expected then
    raise exception 'release flag allowlist drifted: expected %, got %', expected, actual;
  end if;
end $$;

rollback;
