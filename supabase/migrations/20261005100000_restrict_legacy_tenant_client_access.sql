-- Security hotfix (#528): close tenant-member writes through PostgREST.
--
-- 20260619140000_rls.sql, 20260620120000 and 20260714210000 gave every tenant
-- member, whatever their role, `for all` policies on 38 legacy tables, and
-- Supabase's default grants give `anon` and `authenticated` every table
-- privilege. A viewer holding the public key and their own session could:
--   - read integrations tokens and tenants secret columns;
--   - change tenants.plan_override, auto_publish, owner_email and billing state;
--   - insert an `owner` invite for themselves, which the app then claims;
--   - delete or forge audit_logs rows.
--
-- The app never reads or writes these tables with a user session. Every server
-- read and write uses the service role (src/lib/db/client.ts), which bypasses
-- RLS and keeps its grants. Browser and cookie clients only call auth.*; the
-- proxy's one user-session read is super_admins, which this does not touch.
--
-- So clients get no privilege at all on these tables. The `for all` policies
-- become `for select` policies, owner/admin only for credentials, access, money
-- and audit, so a later read grant cannot reopen writes or secrets to viewers.
-- The prior table ACLs are captured first for the exact rollback.
-- Rollback: rollback-20261005100000_restrict_legacy_tenant_client_access.sql
-- (reopens the hole; production rollback needs Jacob's yes).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create schema if not exists release_rollback_baseline;
revoke all on schema release_rollback_baseline from public, anon, authenticated, service_role;
create table release_rollback_baseline.m20261005100000_legacy_tenant_grants (
  relation_name text primary key,
  relation_oid oid not null,
  owner_oid oid not null,
  grants aclitem[] not null
);
revoke all on release_rollback_baseline.m20261005100000_legacy_tenant_grants
  from public, anon, authenticated, service_role;

do $restrict$
declare
  t text;
  member_read text[] := array[
    'domain_claims','content','draft_content','page_config','draft_page_config',
    'activity_log','unified_events','weekly_briefs','mail_log','chat_threads',
    'chat_messages','reward_members','reward_transactions','auto_approval_streaks',
    'scan_results','scan_history','bookings','newsletter_subscribers',
    'site_snapshots','content_versions','social_posts','search_console_data',
    'inbox_items','chat_sessions','site_metrics',
    'collection_entries','reviews','suggestions','proposals'];
  manager_read text[] := array['integrations','invites','audit_logs'];
  every_table text[] := array['tenants','pay_links','build_payments',
    'decisions','execution_attempts','outcomes'] || member_read || manager_read;
begin
  insert into release_rollback_baseline.m20261005100000_legacy_tenant_grants
  select c.relname, c.oid, c.relowner, coalesce(c.relacl, acldefault('r', c.relowner))
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relname = any(every_table);
  if (select count(*) from release_rollback_baseline.m20261005100000_legacy_tenant_grants) <> 38 then
    raise exception 'legacy_tenant_grant_capture_incomplete';
  end if;

  foreach t in array every_table loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;

  -- Any member reads the tenant's working records.
  foreach t in array member_read loop
    execute format('drop policy %I on public.%I', t || '_tenant_rw', t);
    execute format($f$
      create policy %1$I on public.%2$I for select to authenticated
      using (public.app_is_super_admin() or tenant_id in (select public.app_tenant_ids()))
    $f$, t || '_member_read', t);
  end loop;

  -- Credentials, invitations and the audit trail: owner or admin only.
  foreach t in array manager_read loop
    execute format('drop policy %I on public.%I', t || '_tenant_rw', t);
    execute format($f$
      create policy %1$I on public.%2$I for select to authenticated
      using (public.app_is_super_admin() or exists (
        select 1 from public.memberships m
        where m.user_id = (select auth.uid()) and m.tenant_id = %2$I.tenant_id
          and m.role in ('owner', 'admin')))
    $f$, t || '_manager_read', t);
  end loop;
end $restrict$;

drop policy tenants_member_rw on public.tenants;
create policy tenants_manager_read on public.tenants for select to authenticated
  using (public.app_is_super_admin() or exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.tenant_id = tenants.id
      and m.role in ('owner', 'admin')));

drop policy pay_links_rw on public.pay_links;
create policy pay_links_manager_read on public.pay_links for select to authenticated
  using (public.app_is_super_admin() or (tenant_id is not null and exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.tenant_id = pay_links.tenant_id
      and m.role in ('owner', 'admin'))));

drop policy build_payments_rw on public.build_payments;
create policy build_payments_manager_read on public.build_payments for select to authenticated
  using (public.app_is_super_admin() or (tenant_id is not null and exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.tenant_id = build_payments.tenant_id
      and m.role in ('owner', 'admin'))));

drop policy decisions_tenant_rw on public.decisions;
create policy decisions_member_read on public.decisions for select to authenticated
  using (public.app_is_super_admin() or exists (
    select 1 from public.proposals p
    where p.id = decisions.proposal_id and p.tenant_id in (select public.app_tenant_ids())));

drop policy execution_attempts_tenant_rw on public.execution_attempts;
create policy execution_attempts_member_read on public.execution_attempts for select to authenticated
  using (public.app_is_super_admin() or exists (
    select 1 from public.proposals p
    where p.id = execution_attempts.proposal_id and p.tenant_id in (select public.app_tenant_ids())));

drop policy outcomes_tenant_rw on public.outcomes;
create policy outcomes_member_read on public.outcomes for select to authenticated
  using (public.app_is_super_admin() or exists (
    select 1 from public.execution_attempts ea
    join public.proposals p on p.id = ea.proposal_id
    where ea.id = outcomes.execution_attempt_id and p.tenant_id in (select public.app_tenant_ids())));

-- Fail the whole migration if any client privilege or write policy survives.
do $verify$
begin
  if exists (
    select 1
    from release_rollback_baseline.m20261005100000_legacy_tenant_grants b,
      lateral (values ('anon'), ('authenticated')) r(role_name),
      lateral (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
        ('REFERENCES'), ('TRIGGER')) p(privilege)
    where has_table_privilege(r.role_name, b.relation_oid, p.privilege)
      or (p.privilege in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
        and has_any_column_privilege(r.role_name, b.relation_oid, p.privilege))
  ) then
    raise exception 'legacy_tenant_client_privilege_remains';
  end if;
  if exists (
    select 1 from pg_policies pol
    join release_rollback_baseline.m20261005100000_legacy_tenant_grants b
      on b.relation_name = pol.tablename
    where pol.schemaname = 'public' and pol.cmd <> 'SELECT'
  ) then
    raise exception 'legacy_tenant_write_policy_remains';
  end if;
end $verify$;

commit;
