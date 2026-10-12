-- Atomic hosted-tenant teardown (audit 2026-10-05, finding 1).
--
-- src/lib/deprovision.ts used to delete each tenant-scoped table in its own
-- request and the tenant last. A workspace website publication or hosted
-- reservation restricts the tenant delete, so that final step failed after
-- every other table was already gone. These service-role functions make the
-- Postgres purge one transaction that refuses before deleting anything while
-- a workspace website still publishes to, or reserved, the tenant.
--
-- Keep tenant_teardown_tables() in step with TENANT_SCOPED_TABLES in
-- src/lib/deprovision.ts (asserted by src/__tests__/deprovision-coverage.test.ts).

create or replace function public.tenant_teardown_tables() returns text[]
language sql immutable set search_path=public,pg_temp as $$
  select array[
    'activity_log','audit_logs','auto_approval_streaks','bookings',
    'build_payments','chat_messages','chat_sessions','chat_threads',
    'collection_entries','reviews','suggestions','content','content_versions',
    'domain_claims','draft_content','draft_page_config','inbox_items',
    'integrations','invites','mail_log','memberships','newsletter_subscribers',
    'inquiry_record_overlays','inquiry_publication_claims','inquiry_workspaces','job_economics',
    'page_config','pay_links','reward_members','reward_transactions',
    'scan_history','scan_results','search_console_data','site_metrics',
    'site_snapshots','social_posts','subscription_items','unified_events',
    'proposals','weekly_briefs'
  ]::text[]
$$;
revoke all on function public.tenant_teardown_tables() from public,anon,authenticated,service_role;

-- What would block a teardown. Dry runs report it without deleting.
create or replace function public.tenant_teardown_blockers(p_tenant_id text) returns table(publications bigint,reservations bigint)
language sql stable security definer set search_path=public,pg_temp as $$
  select (select count(*) from public.website_document_publications p where p.tenant_id=p_tenant_id),
         (select count(*) from public.website_hosted_tenant_reservations r where r.tenant_id=p_tenant_id)
$$;
revoke all on function public.tenant_teardown_blockers(text) from public,anon,authenticated;
grant execute on function public.tenant_teardown_blockers(text) to service_role;

-- Delete every tenant-scoped row and the tenant in one transaction. Raises
-- tenant_teardown_blocked_by_workspace_website before any delete when a
-- workspace website still holds the tenant; any other failure rolls back all.
create or replace function public.deprovision_tenant_rows(p_tenant_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  t text; removed bigint; counts jsonb := '{}'::jsonb; blocked bigint;
begin
  if p_tenant_id is null or p_tenant_id !~ '^[a-z0-9-]{1,100}$' then raise exception 'tenant_teardown_invalid'; end if;
  -- Locking the tenant row blocks a concurrent reservation or publication
  -- (their foreign keys take a key-share lock) until this transaction ends.
  perform 1 from public.tenants where id=p_tenant_id for update;
  select (select count(*) from public.website_document_publications p where p.tenant_id=p_tenant_id)
       + (select count(*) from public.website_hosted_tenant_reservations r where r.tenant_id=p_tenant_id) into blocked;
  if blocked>0 then raise exception 'tenant_teardown_blocked_by_workspace_website'; end if;
  foreach t in array public.tenant_teardown_tables() loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('delete from public.%I where tenant_id=$1',t) using p_tenant_id;
    get diagnostics removed = row_count;
    if removed>0 then counts := counts||jsonb_build_object(t,removed); end if;
  end loop;
  delete from public.tenants where id=p_tenant_id;
  get diagnostics removed = row_count;
  if removed>0 then counts := counts||jsonb_build_object('tenants',removed); end if;
  return counts;
end $$;
revoke all on function public.deprovision_tenant_rows(text) from public,anon,authenticated;
grant execute on function public.deprovision_tenant_rows(text) to service_role;
