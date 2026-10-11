-- Rollback for 20261008150100_website_domain_owner_approval.sql
-- Forward SHA-256: 872d95f7907bc7a7c06189d8409cea8ff97bb47a779e84a4efa593a5bf8edb32
-- Batch 6: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.website_domain_approval_immutable()')))) is distinct from '9809e64cdcf48d2bc8c35e7da6811d5a' then raise exception 'rollback_wrong_order_or_function_drift: website_domain_approval_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_website_domain_approvals(uuid,uuid,uuid,text)')))) is distinct from '2d862ccc8599aaf3ec74e6c5e15552b8' then raise exception 'rollback_wrong_order_or_function_drift: read_website_domain_approvals'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.approve_website_domain_change(uuid,uuid,uuid,text,text,text)')))) is distinct from '5511fd979441844d4fc2f6fbe6083cf6' then raise exception 'rollback_wrong_order_or_function_drift: approve_website_domain_change'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.authorize_website_domain_change(uuid,uuid,uuid,text,text,text,text)')))) is distinct from 'ea76b4c8ebe81618bdaa405b92acdd58' then raise exception 'rollback_wrong_order_or_function_drift: authorize_website_domain_change'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.website_domain_approvals') and attnum>0 and not attisdropped) <> 8 then raise exception 'rollback_wrong_order_or_table_drift: website_domain_approvals'; end if;
end;
$rollback_guard$;
lock table public."website_domain_approvals" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008150100_website_domain_approvals" as table public."website_domain_approvals";
revoke all on release_rollback_archive."m20261008150100_website_domain_approvals" from public, anon, authenticated, service_role;
drop trigger "website_domain_approvals_immutable" on public."website_domain_approvals";
alter table public."website_domain_approvals" drop constraint "website_domain_approvals_hostname_check";
drop function public.website_domain_approval_immutable();
drop function public.read_website_domain_approvals(uuid,uuid,uuid,text);
drop function public.approve_website_domain_change(uuid,uuid,uuid,text,text,text);
drop function public.authorize_website_domain_change(uuid,uuid,uuid,text,text,text,text);
drop table public."website_domain_approvals";
commit;
