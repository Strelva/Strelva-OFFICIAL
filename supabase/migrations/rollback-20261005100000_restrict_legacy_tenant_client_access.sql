-- Rollback for 20261005100000_restrict_legacy_tenant_client_access.sql (#528).
-- WARNING: this reopens the hole the forward file closes: every tenant member,
-- viewers included, regains read/write on 38 tables through PostgREST.
-- Prepared SQL only. Production execution requires Jacob's separate yes.
-- Restores the original `for all` policies verbatim and the exact table ACLs
-- the forward file captured. Data is untouched in both directions.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $guard$
begin
  if to_regclass('release_rollback_baseline.m20261005100000_legacy_tenant_grants') is null then
    raise exception 'rollback_legacy_tenant_grant_capture_required';
  end if;
  if (select count(*) from release_rollback_baseline.m20261005100000_legacy_tenant_grants) <> 38
    or exists (select 1 from release_rollback_baseline.m20261005100000_legacy_tenant_grants b
      left join pg_class c on c.oid = to_regclass(format('public.%I', b.relation_name))
      where c.oid is distinct from b.relation_oid or c.relowner is distinct from b.owner_oid) then
    raise exception 'rollback_legacy_tenant_grant_capture_drift';
  end if;
end $guard$;

do $restore$
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
  g record;
begin
  foreach t in array member_read loop
    execute format('drop policy %I on public.%I', t || '_member_read', t);
    execute format($f$
      create policy %1$I on public.%2$I for all to authenticated
      using (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
      with check (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
    $f$, t || '_tenant_rw', t);
  end loop;
  foreach t in array manager_read loop
    execute format('drop policy %I on public.%I', t || '_manager_read', t);
    execute format($f$
      create policy %1$I on public.%2$I for all to authenticated
      using (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
      with check (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
    $f$, t || '_tenant_rw', t);
  end loop;

  -- Re-grant exactly what PUBLIC, anon and authenticated held before.
  for g in
    select b.relation_name, a.privilege_type, a.is_grantable,
      case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee
    from release_rollback_baseline.m20261005100000_legacy_tenant_grants b,
      lateral aclexplode(b.grants) a
    where a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated')
  loop
    execute format('grant %s on table public.%I to %s%s', g.privilege_type, g.relation_name,
      g.grantee, case when g.is_grantable then ' with grant option' else '' end);
  end loop;
end $restore$;

drop policy tenants_manager_read on public.tenants;
create policy tenants_member_rw on public.tenants for all to authenticated
  using (app_is_super_admin() or id in (select app_tenant_ids()))
  with check (app_is_super_admin() or id in (select app_tenant_ids()));

drop policy pay_links_manager_read on public.pay_links;
create policy pay_links_rw on public.pay_links for all to authenticated
  using (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())))
  with check (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())));

drop policy build_payments_manager_read on public.build_payments;
create policy build_payments_rw on public.build_payments for all to authenticated
  using (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())))
  with check (app_is_super_admin() or (tenant_id is not null and tenant_id in (select app_tenant_ids())));

drop policy decisions_member_read on public.decisions;
create policy decisions_tenant_rw on public.decisions for all to authenticated
  using (app_is_super_admin() or exists (
    select 1 from proposals p
    where p.id = decisions.proposal_id and p.tenant_id in (select app_tenant_ids())
  ))
  with check (app_is_super_admin() or exists (
    select 1 from proposals p
    where p.id = decisions.proposal_id and p.tenant_id in (select app_tenant_ids())
  ));

drop policy execution_attempts_member_read on public.execution_attempts;
create policy execution_attempts_tenant_rw on public.execution_attempts for all to authenticated
  using (app_is_super_admin() or exists (
    select 1 from proposals p
    where p.id = execution_attempts.proposal_id and p.tenant_id in (select app_tenant_ids())
  ))
  with check (app_is_super_admin() or exists (
    select 1 from proposals p
    where p.id = execution_attempts.proposal_id and p.tenant_id in (select app_tenant_ids())
  ));

drop policy outcomes_member_read on public.outcomes;
create policy outcomes_tenant_rw on public.outcomes for all to authenticated
  using (app_is_super_admin() or exists (
    select 1 from execution_attempts ea
    join proposals p on p.id = ea.proposal_id
    where ea.id = outcomes.execution_attempt_id and p.tenant_id in (select app_tenant_ids())
  ))
  with check (app_is_super_admin() or exists (
    select 1 from execution_attempts ea
    join proposals p on p.id = ea.proposal_id
    where ea.id = outcomes.execution_attempt_id and p.tenant_id in (select app_tenant_ids())
  ));

drop table release_rollback_baseline.m20261005100000_legacy_tenant_grants;

commit;
