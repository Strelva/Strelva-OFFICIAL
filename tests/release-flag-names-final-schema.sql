-- The exact release flag allowlist after every migration: the union of each
-- stream's keys, matching RELEASE_FLAGS in src/platform/release-flags/resolve.ts.
-- Several migrations replace workspace_release_flag_names() with a literal
-- list (#253); a later one that omits an earlier stream's key fails here.
-- Order-insensitive: additive migrations may sort the list.
begin;

do $$
declare
  expected text[] := array['catalog_reports', 'connected_sites', 'inquiries', 'internal_tool_notices',
    'make_real_live:booking_page', 'make_real_live:hosted_website', 'make_real_live:inquiry_form',
    'make_real_live:internal_app', 'make_real_live:tenant_content',
    'make_real_owner_link', 'newsletter_contacts', 'owner_entry', 'publishing',
    'publishing_record_google_policy', 'systems', 'website_rebuild'];
  actual text[] := (select array_agg(key order by key) from unnest(public.workspace_release_flag_names()) key);
begin
  if actual is distinct from expected then
    raise exception 'release flag allowlist drifted: expected %, got %', expected, actual;
  end if;
end $$;

rollback;
