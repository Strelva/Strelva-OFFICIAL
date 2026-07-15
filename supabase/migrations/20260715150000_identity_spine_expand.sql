-- #6 identity spine — EXPAND phase (2026-07-15). Additive + reversible.
--
-- Adds a UUID mirror (`tenant_stable_id`) of every `tenant_id` slug FK, pointing
-- at the immutable `tenants.stable_id`, kept perfectly in sync with the slug FK
-- by ONE trigger function. Backfills existing rows. Adds the UUID RLS helper.
--
-- NOTHING reads these columns yet — the app still routes on the slug, so this
-- migration is behavior-identical. It exists so the later CONTRACT phase (flip
-- FKs + RLS to the UUID, make the subdomain a renamable label) is a mechanical,
-- already-populated change instead of a risky mass backfill.
--
-- Down (reverse): drop the triggers + `set_tenant_stable_id()` + the 35
-- `tenant_stable_id` columns + `app_tenant_stable_ids()`. No data loss (the slug
-- FKs are untouched and remain authoritative throughout EXPAND).

-- 1) Derive trigger: mirror tenant_id -> tenant_stable_id on every write. A NULL
--    tenant_id (the two set-null FKs) yields a NULL stable id. Making the UUID a
--    derived column means zero app changes and guaranteed consistency.
create or replace function set_tenant_stable_id() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  new.tenant_stable_id := (select stable_id from tenants where id = new.tenant_id);
  return new;
end $$;

-- 2) Cascade tables (33): tenant delete removes the child row — mirror the
--    existing `on delete cascade` FK semantics on the new UUID FK.
do $$
declare t text;
begin
  foreach t in array array[
    'memberships','invites','domain_claims','content','draft_content',
    'page_config','draft_page_config','activity_log','unified_events',
    'weekly_briefs','mail_log','chat_threads','chat_messages','integrations',
    'reward_members','reward_transactions','auto_approval_streaks','scan_results',
    'scan_history','bookings','newsletter_subscribers','site_snapshots',
    'content_versions','social_posts','search_console_data','audit_logs',
    'inbox_items','chat_sessions','site_metrics','collection_entries','reviews',
    'suggestions','proposals'
  ] loop
    execute format(
      'alter table %I add column if not exists tenant_stable_id uuid references tenants(stable_id) on delete cascade', t);
    execute format(
      'update %I x set tenant_stable_id = tn.stable_id from tenants tn where x.tenant_id = tn.id and x.tenant_stable_id is null', t);
    execute format(
      'create index if not exists %I on %I (tenant_stable_id)', t || '_tenant_stable_id_idx', t);
    execute format('drop trigger if exists %I on %I', t || '_stable_id_trg', t);
    execute format(
      'create trigger %I before insert or update on %I for each row execute function set_tenant_stable_id()',
      t || '_stable_id_trg', t);
  end loop;
end $$;

-- 3) Set-null tables (2): tenant_id is NULLABLE and `on delete set null` (an
--    unassigned pay-link / build-payment survives tenant deletion). The UUID FK
--    must match — set null on delete, nullable column.
do $$
declare t text;
begin
  foreach t in array array['pay_links','build_payments'] loop
    execute format(
      'alter table %I add column if not exists tenant_stable_id uuid references tenants(stable_id) on delete set null', t);
    execute format(
      'update %I x set tenant_stable_id = tn.stable_id from tenants tn where x.tenant_id = tn.id and x.tenant_stable_id is null', t);
    execute format(
      'create index if not exists %I on %I (tenant_stable_id)', t || '_tenant_stable_id_idx', t);
    execute format('drop trigger if exists %I on %I', t || '_stable_id_trg', t);
    execute format(
      'create trigger %I before insert or update on %I for each row execute function set_tenant_stable_id()',
      t || '_stable_id_trg', t);
  end loop;
end $$;

-- 4) UUID RLS helper — the stable-id twin of app_tenant_ids(). Added but UNUSED
--    by policies during EXPAND; the CONTRACT phase switches policies onto it in
--    lockstep with dropping the slug comparison.
create or replace function app_tenant_stable_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select tenant_stable_id from memberships where user_id = (select auth.uid());
$$;
