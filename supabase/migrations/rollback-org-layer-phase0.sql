-- Rollback for 20260729180000_org_layer_phase0_accounts.sql.
-- Dormant org layer only: undo batches 7–0 and reviewed account-aware work first.
-- Production execution is a separate approved recovery operation; never CASCADE.
-- Preserves account rows and tenant account pointers in a private archive.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
do $guard$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='accounts' and column_name='workspace_id')
    or to_regclass('public.tenant_workspace_links') is not null then
    raise exception 'rollback_org_layer_requires_1_0_rollback_first';
  end if;
end; $guard$;
lock table public.tenants, public.accounts, public.account_memberships,
  public.subscriptions, public.subscription_items in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive.m20260729180000_accounts as table public.accounts;
create table release_rollback_archive.m20260729180000_account_memberships as table public.account_memberships;
create table release_rollback_archive.m20260729180000_subscriptions as table public.subscriptions;
create table release_rollback_archive.m20260729180000_subscription_items as table public.subscription_items;
create table release_rollback_archive.m20260729180000_tenant_accounts as
  select id, stable_id, account_id from public.tenants;
revoke all on all tables in schema release_rollback_archive from public, anon, authenticated, service_role;
alter table public.tenants drop column account_id;
drop table public.subscription_items, public.subscriptions, public.account_memberships, public.accounts;
commit;
