-- Rollback for 20261007160000_operator_queue.sql
-- Forward SHA-256: f68763473e3d2e1a9a7c1f0d53d6f77efa878ec8ab98d5da9eef8b6b5f972086
-- Batch 3: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.operator_queue_append_only()')))) is distinct from '09b3deef3febc77e90515257eebcce58' then raise exception 'rollback_wrong_order_or_function_drift: operator_queue_append_only'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.outside_write_receipt_row(uuid)')))) is distinct from '346a2a07956f6a6811263c6e7130dc50' then raise exception 'rollback_wrong_order_or_function_drift: outside_write_receipt_row'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.operator_queue_mark_row(text,text)')))) is distinct from '2d7c3334957c28dc436c5dbf663dcd6d' then raise exception 'rollback_wrong_order_or_function_drift: operator_queue_mark_row'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_outside_write_receipt(jsonb)')))) is distinct from 'fa0d39a0226799f824aa64e79126f856' then raise exception 'rollback_wrong_order_or_function_drift: record_outside_write_receipt'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_operator_queue_context(uuid,text)')))) is distinct from 'd4a0bbab82d37ff82da8cfc822925df7' then raise exception 'rollback_wrong_order_or_function_drift: read_operator_queue_context'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.operator_queue_assert_operator(uuid,text)')))) is distinct from '6368422081d18fcd5075b7f5579a5a83' then raise exception 'rollback_wrong_order_or_function_drift: operator_queue_assert_operator'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_outside_write_readback(uuid,text,text)')))) is distinct from 'cec94e6509c3f3deed1cd3431cab512a' then raise exception 'rollback_wrong_order_or_function_drift: record_outside_write_readback'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_outside_write_receipts(uuid,text,text,uuid,integer)')))) is distinct from '31ad51b839d282a3fbfe7610720d12d3' then raise exception 'rollback_wrong_order_or_function_drift: read_outside_write_receipts'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.write_operator_queue_mark(uuid,text,uuid,text,text,text,jsonb,text)')))) is distinct from 'ba54f1d1f966a996b411a0229e888d8e' then raise exception 'rollback_wrong_order_or_function_drift: write_operator_queue_mark'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.operator_queue_marks') and attnum>0 and not attisdropped) <> 15 then raise exception 'rollback_wrong_order_or_table_drift: operator_queue_marks'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.operator_queue_mark_events') and attnum>0 and not attisdropped) <> 8 then raise exception 'rollback_wrong_order_or_table_drift: operator_queue_mark_events'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.outside_write_receipts') and attnum>0 and not attisdropped) <> 22 then raise exception 'rollback_wrong_order_or_table_drift: outside_write_receipts'; end if;
end;
$rollback_guard$;
lock table public."operator_queue_mark_events", public."operator_queue_marks", public."outside_write_receipts" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007160000_operator_queue_mark_events" as table public."operator_queue_mark_events";
revoke all on release_rollback_archive."m20261007160000_operator_queue_mark_events" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007160000_operator_queue_marks" as table public."operator_queue_marks";
revoke all on release_rollback_archive."m20261007160000_operator_queue_marks" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007160000_outside_write_receipts" as table public."outside_write_receipts";
revoke all on release_rollback_archive."m20261007160000_outside_write_receipts" from public, anon, authenticated, service_role;
drop trigger "outside_write_receipts_append_only" on public."outside_write_receipts";
drop trigger "operator_queue_mark_events_append_only" on public."operator_queue_mark_events";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_check";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_check1";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_check2";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_check3";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_check1";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_check2";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_check3";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_check4";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_source_check";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_revision_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_undo_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_actor_check";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_source_ref_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_request_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_subject_check";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_closed_state_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_provider_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_readback_check";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_closed_reason_check";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_snooze_reason_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_tenant_id_check";
alter table public."operator_queue_marks" drop constraint "operator_queue_marks_owner_told_via_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_acceptance_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_undo_label_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_write_kind_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_command_key_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_before_state_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_provider_ref_check";
alter table public."operator_queue_mark_events" drop constraint "operator_queue_mark_events_action_check";
alter table public."operator_queue_mark_events" drop constraint "operator_queue_mark_events_payload_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_readback_detail_check";
alter table public."outside_write_receipts" drop constraint "outside_write_receipts_acceptance_detail_check";
drop function public.operator_queue_append_only();
drop function public.outside_write_receipt_row(uuid);
drop function public.operator_queue_mark_row(text,text);
drop function public.record_outside_write_receipt(jsonb);
drop function public.read_operator_queue_context(uuid,text);
drop function public.operator_queue_assert_operator(uuid,text);
drop function public.record_outside_write_readback(uuid,text,text);
drop function public.read_outside_write_receipts(uuid,text,text,uuid,integer);
drop function public.write_operator_queue_mark(uuid,text,uuid,text,text,text,jsonb,text);
drop table public."operator_queue_mark_events", public."operator_queue_marks", public."outside_write_receipts";
commit;
