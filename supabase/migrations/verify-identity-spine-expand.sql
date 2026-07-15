-- Post-apply verification for 20260715150000_identity_spine_expand.sql.
-- NOT a migration (kept out of the ledger by the non-timestamp filename). Run
-- read-only against the target DB AFTER the EXPAND push to confirm the mirror is
-- complete and the trigger is live. Every row below should return zero problems.

-- 1) All 35 tenant-scoped tables have the tenant_stable_id column.
select 'missing_column' as check, c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relkind = 'r'
  and c.relname = any (array[
    'memberships','invites','domain_claims','content','draft_content','page_config',
    'draft_page_config','activity_log','unified_events','weekly_briefs','mail_log',
    'chat_threads','chat_messages','integrations','reward_members','reward_transactions',
    'auto_approval_streaks','scan_results','scan_history','bookings','newsletter_subscribers',
    'site_snapshots','content_versions','social_posts','search_console_data','audit_logs',
    'inbox_items','chat_sessions','site_metrics','collection_entries','reviews','suggestions',
    'proposals','pay_links','build_payments'])
  and not exists (
    select 1 from pg_attribute a
    where a.attrelid = c.oid and a.attname = 'tenant_stable_id' and not a.attisdropped);

-- 2) Backfill completeness: any row with a non-null tenant_id but null mirror is a
--    backfill miss (should be empty for every table). Spot-checks the hottest tables.
select 'backfill_gap:content' as check, count(*) from content where tenant_id is not null and tenant_stable_id is null
union all select 'backfill_gap:unified_events', count(*) from unified_events where tenant_id is not null and tenant_stable_id is null
union all select 'backfill_gap:memberships', count(*) from memberships where tenant_id is not null and tenant_stable_id is null
union all select 'backfill_gap:proposals', count(*) from proposals where tenant_id is not null and tenant_stable_id is null
union all select 'backfill_gap:integrations', count(*) from integrations where tenant_id is not null and tenant_stable_id is null;

-- 3) Trigger present on all 35 tables (35 rows expected).
select count(*) as tables_with_trigger
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgname like '%_stable_id_trg' and not t.tgisinternal;

-- 4) Mirror integrity: every mirror value matches the slug's stable_id (0 rows = good).
select 'mismatch:content' as check, count(*) from content x join tenants tn on x.tenant_id = tn.id where x.tenant_stable_id is distinct from tn.stable_id
union all select 'mismatch:memberships', count(*) from memberships x join tenants tn on x.tenant_id = tn.id where x.tenant_stable_id is distinct from tn.stable_id;

-- 5) RLS helper exists and is security-definer.
select proname, prosecdef from pg_proc where proname = 'app_tenant_stable_ids';
