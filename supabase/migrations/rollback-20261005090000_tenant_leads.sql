-- Rollback for 20261005090000_tenant_leads.sql
-- Forward SHA-256: 4937430fc217ecba07b016b91436c57fa4799cd4ed09df771c610e64ac24c34a
-- Batch 0: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_lead_workspace(uuid)')))) is distinct from '5ab8b5b1cdb22afbb7352460294db3e8' then raise exception 'rollback_wrong_order_or_function_drift: tenant_lead_workspace'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_leads_attach_workspace()')))) is distinct from '375b0573eaee336f81849e977e3dc6d9' then raise exception 'rollback_wrong_order_or_function_drift: tenant_leads_attach_workspace'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_tenant_lead(text,jsonb,text)')))) is distinct from 'fa1e99b3b56721f520cccdbd90492063' then raise exception 'rollback_wrong_order_or_function_drift: record_tenant_lead'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_leads(text,integer,timestamp with time zone)')))) is distinct from 'a05b84042e8200557f3a4a5fae7ccaba' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_leads'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.tenant_leads') and attnum>0 and not attisdropped) <> 16 then raise exception 'rollback_wrong_order_or_table_drift: tenant_leads'; end if;
end;
$rollback_guard$;
lock table public."tenant_leads" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261005090000_tenant_leads" as table public."tenant_leads";
revoke all on release_rollback_archive."m20261005090000_tenant_leads" from public, anon, authenticated, service_role;
alter table public."tenant_leads" drop constraint "tenant_leads_name_check";
alter table public."tenant_leads" drop constraint "tenant_leads_email_check";
alter table public."tenant_leads" drop constraint "tenant_leads_fields_check";
alter table public."tenant_leads" drop constraint "tenant_leads_source_check";
alter table public."tenant_leads" drop constraint "tenant_leads_lead_id_check";
alter table public."tenant_leads" drop constraint "tenant_leads_message_check";
alter table public."tenant_leads" drop constraint "tenant_leads_recorded_via_check";
alter table public."tenant_leads" drop constraint "tenant_leads_capability_id_check";
alter table public."tenant_leads" drop constraint "tenant_leads_submission_hash_check";
alter table public."tenant_leads" drop constraint "tenant_leads_capability_version_check";
alter table public."tenant_leads" drop constraint "tenant_leads_tenant_slug_at_capture_check";
drop function public.tenant_lead_workspace(uuid);
drop function public.tenant_leads_attach_workspace();
drop function public.record_tenant_lead(text,jsonb,text);
drop function public.read_tenant_leads(text,integer,timestamp with time zone);
drop table public."tenant_leads";
commit;
