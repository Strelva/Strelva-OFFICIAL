-- Row Level Security (migration Phase 5) — the payoff: tenant isolation becomes a
-- DATABASE guarantee instead of a code discipline. Promoted from supabase/rls-draft.sql
-- (Variant A, Supabase Auth / auth.uid()) once the auth swap was verified working.
--
-- Performance (Supabase lint 0003): auth.uid() is wrapped as (select auth.uid()) so
-- it evaluates once per query (initplan), not per row; helpers are `stable`
-- security-definer; policies are scoped `to authenticated` so they never run for anon.
--
-- SERVICE_ROLE (src/lib/db/client.ts) BYPASSES RLS by design — trusted control-plane
-- code keeps full access. These policies gate the per-user JWT client.

-- ---------------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------------
create or replace function app_is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from super_admins s
    where s.user_id = (select auth.uid()) and s.revoked_at is null
  );
$$;

create or replace function app_tenant_ids() returns setof text
  language sql stable security definer set search_path = public as $$
  select tenant_id from memberships where user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- POLICIES — standard tenant-scoped tables (member or super-admin; else nothing).
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
    if t <> 'tenants' then
      execute format($f$
        create policy %1$I_tenant_rw on %1$I for all to authenticated
        using (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
        with check (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
      $f$, t);
    end if;
  end loop;
end $$;

-- tenants: keyed on id, not tenant_id
create policy tenants_member_rw on tenants for all to authenticated
  using (app_is_super_admin() or id in (select app_tenant_ids()))
  with check (app_is_super_admin() or id in (select app_tenant_ids()));

-- ---------------------------------------------------------------------------
-- IDENTITY + cross-cutting special cases
-- ---------------------------------------------------------------------------
alter table users enable row level security;
create policy users_self on users for select to authenticated
  using (id = (select auth.uid()) or app_is_super_admin());

alter table memberships enable row level security;
create policy memberships_self on memberships for select to authenticated
  using (user_id = (select auth.uid()) or app_is_super_admin());
create policy memberships_admin_write on memberships for all to authenticated
  using (app_is_super_admin()) with check (app_is_super_admin());

alter table super_admins enable row level security;
create policy super_admins_admin_only on super_admins for all to authenticated
  using (app_is_super_admin()) with check (app_is_super_admin());

alter table delivery_leads enable row level security;
create policy delivery_leads_admin_only on delivery_leads for all to authenticated
  using (app_is_super_admin()) with check (app_is_super_admin());

-- pay_links / build_payments: tenant_id is NULLABLE — unassigned rows operator-only.
drop policy if exists pay_links_tenant_rw on pay_links;
alter table pay_links enable row level security;
create policy pay_links_rw on pay_links for all to authenticated
  using (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())))
  with check (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())));
alter table build_payments enable row level security;
create policy build_payments_rw on build_payments for all to authenticated
  using (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())))
  with check (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())));
