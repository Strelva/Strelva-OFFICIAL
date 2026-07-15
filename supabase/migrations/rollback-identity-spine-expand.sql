-- Rollback for 20260715150000_identity_spine_expand.sql. NOT a migration (kept
-- out of the ledger by the non-timestamp filename). Run manually to fully reverse
-- EXPAND. Safe: the slug FKs are authoritative throughout EXPAND, so dropping the
-- UUID mirror loses nothing. If EXPAND is rolled back, also delete its migration
-- file + `supabase migration repair --status reverted 20260715150000`.

do $$
declare t text;
begin
  foreach t in array array[
    'memberships','invites','domain_claims','content','draft_content','page_config',
    'draft_page_config','activity_log','unified_events','weekly_briefs','mail_log',
    'chat_threads','chat_messages','integrations','reward_members','reward_transactions',
    'auto_approval_streaks','scan_results','scan_history','bookings','newsletter_subscribers',
    'site_snapshots','content_versions','social_posts','search_console_data','audit_logs',
    'inbox_items','chat_sessions','site_metrics','collection_entries','reviews','suggestions',
    'proposals','pay_links','build_payments'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_stable_id_trg', t);
    execute format('drop index if exists %I', t || '_tenant_stable_id_idx');
    execute format('alter table %I drop column if exists tenant_stable_id', t);
  end loop;
end $$;

drop function if exists set_tenant_stable_id();
drop function if exists app_tenant_stable_ids();
