-- ===========================================================================
-- Strelva RLS — SUPERSEDED / APPLIED (2026-06-19)
-- ===========================================================================
-- This draft has been promoted to a numbered, applied migration:
--   supabase/migrations/20260619140000_rls.sql
-- with the Supabase performance rules folded in ((select auth.uid()) wrapping +
-- `to authenticated` scoping). RLS is LIVE on the scaffold-web project and
-- verified: a tenant member sees only their tenant, a no-access user sees
-- nothing, a super-admin sees all. Kept here for the annotated rationale below;
-- DO NOT re-apply this file — the migration is the source of truth.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- HELPERS — Supabase Auth (auth.uid() is the user id)
-- ---------------------------------------------------------------------------
create or replace function app_is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from super_admins s
    where s.user_id = auth.uid() and s.revoked_at is null
  );
$$;

create or replace function app_tenant_ids() returns setof text
  language sql stable security definer set search_path = public as $$
  select tenant_id from memberships where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- POLICIES (auth-agnostic) — the standard tenant-scoped tables.
-- Every table with a tenant_id: a member of the tenant (or a super-admin) can
-- read/write its rows; nobody else can see them, enforced by the database.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'tenants','domain_claims','content','draft_content','page_config',
    'draft_page_config','activity_log','unified_events','weekly_briefs',
    'mail_log','chat_threads','chat_messages','integrations','reward_members',
    'reward_transactions','auto_approval_streaks','scan_results','scan_history',
    'bookings','newsletter_subscribers','site_snapshots','content_versions',
    'social_posts','search_console_data','audit_logs','inbox_items',
    'chat_sessions','site_metrics','invites'
  ] loop
    execute format('alter table %I enable row level security', t);
    -- tenants table keys on id, not tenant_id; handled as a special case below.
    if t <> 'tenants' then
      execute format($f$
        create policy %1$I_tenant_rw on %1$I for all
        using (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
        with check (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
      $f$, t);
    end if;
  end loop;
end $$;

-- tenants: a member sees/edits their own tenant row (keyed on id)
create policy tenants_member_rw on tenants for all
  using (app_is_super_admin() or id in (select app_tenant_ids()))
  with check (app_is_super_admin() or id in (select app_tenant_ids()));

-- ---------------------------------------------------------------------------
-- POLICIES — identity + cross-cutting special cases
-- ---------------------------------------------------------------------------

-- users: see your own row; super-admins see all
alter table users enable row level security;
create policy users_self on users for select
  using (id = auth.uid() or app_is_super_admin());

-- memberships: see your own; super-admins manage all
alter table memberships enable row level security;
create policy memberships_self on memberships for select
  using (user_id = auth.uid() or app_is_super_admin());
create policy memberships_admin_write on memberships for all
  using (app_is_super_admin()) with check (app_is_super_admin());

-- super_admins: super-admin only (never visible to tenants)
alter table super_admins enable row level security;
create policy super_admins_admin_only on super_admins for all
  using (app_is_super_admin()) with check (app_is_super_admin());

-- delivery_leads: pre-tenant prospects — operator-only, not tenant-scoped
alter table delivery_leads enable row level security;
create policy delivery_leads_admin_only on delivery_leads for all
  using (app_is_super_admin()) with check (app_is_super_admin());

-- pay_links / build_payments: tenant_id is NULLABLE (lead can precede a tenant);
-- override the loop policy so unassigned rows are operator-only.
drop policy if exists pay_links_tenant_rw on pay_links;       -- not in the loop list; explicit:
alter table pay_links enable row level security;
create policy pay_links_rw on pay_links for all
  using (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())))
  with check (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())));
alter table build_payments enable row level security;
create policy build_payments_rw on build_payments for all
  using (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())))
  with check (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())));

-- NOTE: the SERVICE_ROLE key (server client, src/lib/db/client.ts) BYPASSES RLS
-- by design — these policies gate per-user/anon access (the request-scoped client
-- carrying a user JWT), which arrives with the auth migration. Trusted
-- server-side control-plane code keeps using the service-role client.
--
-- REFINEMENT (later): writes could be gated to role >= editor by joining
-- memberships.role; this draft gates at tenant membership, which already
-- delivers the isolation guarantee. Role-granular write policies are a follow-up.
