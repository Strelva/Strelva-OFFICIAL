-- Rollback for 20261007180000_business_billing.sql
-- Forward SHA-256: 81fc82cf33a4e85c864c28a68cfd83a985eed97ca5d52993ff5546d7d1ef490c
-- Batch 4: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
do $conversion_guard$ begin
  if exists(select 1 from public.tenant_workspace_links) then
    raise exception 'rollback_conversions_first: use the reviewed per-tenant unlink plan before reversing business billing';
  end if;
end; $conversion_guard$;
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_billing_on_link()')))) is distinct from 'c8f16efe99fc4faaad16f376f028f1f8' then raise exception 'rollback_wrong_order_or_function_drift: business_billing_on_link'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_billing_json(uuid)')))) is distinct from '5d6208b5e5272bef5718acddedd0644f' then raise exception 'rollback_wrong_order_or_function_drift: business_billing_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_billing_on_unlink()')))) is distinct from '71e1785b46304bb89eb19b2087177cd6' then raise exception 'rollback_wrong_order_or_function_drift: business_billing_on_unlink'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_billing_state_rank(text)')))) is distinct from '805ba87f8625856a638aa48cdb6302bc' then raise exception 'rollback_wrong_order_or_function_drift: business_billing_state_rank'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_billing_state_from(jsonb)')))) is distinct from 'c8a5abab3f1dbbccb0e2f43689a0cb02' then raise exception 'rollback_wrong_order_or_function_drift: business_billing_state_from'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.resolve_billing_workspace(text,text)')))) is distinct from '88b846f4d0cde37266b6576ebd1f6940' then raise exception 'rollback_wrong_order_or_function_drift: resolve_billing_workspace'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_billing_payment_status(text)')))) is distinct from '4fcd4355454b8b59ef6b46636614b2f8' then raise exception 'rollback_wrong_order_or_function_drift: business_billing_payment_status'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_business_billing(uuid,uuid,text)')))) is distinct from '2a0d5b451c8e54963e591979d1efde75' then raise exception 'rollback_wrong_order_or_function_drift: read_business_billing'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_business_billing_payment(uuid,text,text,timestamp with time zone)')))) is distinct from '1a090c1271006ea26fa2fe1e8c441805' then raise exception 'rollback_wrong_order_or_function_drift: record_business_billing_payment'; end if;
end;
$rollback_guard$;
lock table public."accounts" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007180000_accounts" as table public."accounts";
revoke all on release_rollback_archive."m20261007180000_accounts" from public, anon, authenticated, service_role;
drop trigger "tenant_workspace_links_business_billing" on public."tenant_workspace_links";
drop trigger "tenant_workspace_links_business_billing_unlink" on public."tenant_workspace_links";
alter table public."accounts" drop constraint "accounts_plan_key_check";
alter table public."accounts" drop constraint "accounts_workspace_id_key";
alter table public."accounts" drop constraint "accounts_created_via_check";
alter table public."accounts" drop constraint "accounts_billing_type_check";
alter table public."accounts" drop constraint "accounts_monthly_cents_check";
alter table public."accounts" drop constraint "accounts_payment_status_check";
alter table public."accounts" drop constraint "accounts_billing_sources_check";
alter table public."accounts" drop constraint "accounts_workspace_billing_state";
alter table public."accounts" drop constraint "accounts_grandfathered_terms_check";
alter table public."subscription_items" drop constraint "subscription_items_tenant_id_fkey";
alter table public."accounts" drop column "plan_key";
alter table public."accounts" drop column "created_via";
alter table public."accounts" drop column "billing_type";
alter table public."accounts" drop column "workspace_id";
alter table public."accounts" drop column "monthly_cents";
alter table public."accounts" drop column "payment_status";
alter table public."accounts" drop column "billing_sources";
alter table public."accounts" drop column "payment_updated_at";
alter table public."accounts" drop column "grandfathered_terms";
alter table public."subscription_items" add constraint "subscription_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
revoke all on table public."accounts" from public, anon, authenticated, service_role;
revoke all on table public."subscriptions" from public, anon, authenticated, service_role;
revoke all on table public."subscription_items" from public, anon, authenticated, service_role;
revoke all on table public."account_memberships" from public, anon, authenticated, service_role;
drop function public.business_billing_on_link();
drop function public.business_billing_json(uuid);
drop function public.business_billing_on_unlink();
drop function public.business_billing_state_rank(text);
drop function public.business_billing_state_from(jsonb);
drop function public.resolve_billing_workspace(text,text);
drop function public.business_billing_payment_status(text);
drop function public.read_business_billing(uuid,uuid,text);
drop function public.record_business_billing_payment(uuid,text,text,timestamp with time zone);
commit;
