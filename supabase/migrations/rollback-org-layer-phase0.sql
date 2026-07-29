-- Rollback for 20260729180000_org_layer_phase0_accounts.sql
-- Safe to run while Phase 0 is dormant (nothing reads these yet). Drops the
-- account grouping FK + the four new tables. Order matters: children first.

alter table public.tenants drop column if exists account_id;

drop table if exists public.subscription_items cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.account_memberships cascade;
drop table if exists public.accounts cascade;
