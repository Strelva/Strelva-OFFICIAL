-- Rollback for 20261007140000_model_call_log.sql
-- Forward SHA-256: e2dc485a78dab0bd6b7cb3251b0ecb497f430c73f4af592781ee2bef588bb5f3
-- Batch 1: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_model_calls(jsonb)')))) is distinct from '7aca0e1e96cfa71c7a3bf568549922e9' then raise exception 'rollback_wrong_order_or_function_drift: record_model_calls'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.summarize_model_call_costs(timestamp with time zone,uuid)')))) is distinct from 'ea24929a31fc462876408034e8885f6e' then raise exception 'rollback_wrong_order_or_function_drift: summarize_model_call_costs'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.model_call_log') and attnum>0 and not attisdropped) <> 20 then raise exception 'rollback_wrong_order_or_table_drift: model_call_log'; end if;
end;
$rollback_guard$;
lock table public."model_call_log" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007140000_model_call_log" as table public."model_call_log";
revoke all on release_rollback_archive."m20261007140000_model_call_log" from public, anon, authenticated, service_role;
alter table public."model_call_log" drop constraint "model_call_log_check";
alter table public."model_call_log" drop constraint "model_call_log_check1";
alter table public."model_call_log" drop constraint "model_call_log_check2";
alter table public."model_call_log" drop constraint "model_call_log_step_check";
alter table public."model_call_log" drop constraint "model_call_log_attempt_check";
alter table public."model_call_log" drop constraint "model_call_log_outcome_check";
alter table public."model_call_log" drop constraint "model_call_log_purpose_check";
alter table public."model_call_log" drop constraint "model_call_log_cost_usd_check";
alter table public."model_call_log" drop constraint "model_call_log_actor_kind_check";
alter table public."model_call_log" drop constraint "model_call_log_error_kind_check";
alter table public."model_call_log" drop constraint "model_call_log_latency_ms_check";
alter table public."model_call_log" drop constraint "model_call_log_cost_source_check";
alter table public."model_call_log" drop constraint "model_call_log_model_label_check";
alter table public."model_call_log" drop constraint "model_call_log_input_tokens_check";
alter table public."model_call_log" drop constraint "model_call_log_output_tokens_check";
alter table public."model_call_log" drop constraint "model_call_log_price_table_version_check";
alter table public."model_call_log" drop constraint "model_call_log_tenant_slug_at_call_check";
drop function public.record_model_calls(jsonb);
drop function public.summarize_model_call_costs(timestamp with time zone,uuid);
drop table public."model_call_log";
commit;
