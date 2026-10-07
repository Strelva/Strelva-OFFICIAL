-- Rollback for 20261009100000_strelva_service_actor.sql
-- Forward SHA-256: 2e80eabbbd085d09fb046c13d93fcb9d761097aa7e8e182a8b42535bf848c3ed
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_runs_business(uuid)')))) is distinct from '81ab49b08b661f8fc1a2b98a3616e86e' then raise exception 'rollback_wrong_order_or_function_drift: strelva_runs_business'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_release_flag_names()')))) is distinct from '4a55ee60822d4746f75d1e2a8a7ce11f' then raise exception 'rollback_wrong_order_or_function_drift: workspace_release_flag_names'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.owner_decision_opened_by_guard()')))) is distinct from 'e5726947eb6826cbed35b22395ed0b68' then raise exception 'rollback_wrong_order_or_function_drift: owner_decision_opened_by_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_service_reader(uuid,text)')))) is distinct from 'ce71a78f85cc5bd517377c06852221c5' then raise exception 'rollback_wrong_order_or_function_drift: strelva_service_reader'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_service_actions_immutable()')))) is distinct from 'be967be8d08bceb0e7b11cc1c1ef8c0d' then raise exception 'rollback_wrong_order_or_function_drift: strelva_service_actions_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.owner_decision_json(owner_decisions)')))) is distinct from '070d215956054a748f0cfca1c4901b73' then raise exception 'rollback_wrong_order_or_function_drift: owner_decision_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_service_session(uuid,uuid,text)')))) is distinct from '365339096e4c397faf06849e89170330' then raise exception 'rollback_wrong_order_or_function_drift: strelva_service_session'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.open_owner_decision_as_service(uuid,uuid,jsonb)')))) is distinct from '3ca156b0313bef4ea85f40c4ecc479ca' then raise exception 'rollback_wrong_order_or_function_drift: open_owner_decision_as_service'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.due_make_real_activations_for_service(integer,integer)')))) is distinct from '5b0425b8598363d8011b8351b1b7cb2e' then raise exception 'rollback_wrong_order_or_function_drift: due_make_real_activations_for_service'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_strelva_service_action(uuid,uuid,text,text,text)')))) is distinct from '30695ba98c2895f6135008dbdf7d8173' then raise exception 'rollback_wrong_order_or_function_drift: record_strelva_service_action'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.strelva_service_actions') and attnum>0 and not attisdropped) <> 11 then raise exception 'rollback_wrong_order_or_table_drift: strelva_service_actions'; end if;
end;
$rollback_guard$;
lock table public."owner_decisions", public."strelva_service_actions" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009100000_owner_decisions" as table public."owner_decisions";
revoke all on release_rollback_archive."m20261009100000_owner_decisions" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009100000_strelva_service_actions" as table public."strelva_service_actions";
revoke all on release_rollback_archive."m20261009100000_strelva_service_actions" from public, anon, authenticated, service_role;
drop trigger "owner_decisions_opened_by_guard" on public."owner_decisions";
drop trigger "strelva_service_actions_immutable" on public."strelva_service_actions";
alter table public."owner_decisions" drop constraint "owner_decisions_opened_by_check";
alter table public."owner_decisions" drop column "opened_by";
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_check";
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_check1";
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_action_check";
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_detail_check";
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_purpose_check";
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_subject_check";
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_actor_label_check";
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_on_behalf_role_check";
drop function public.strelva_runs_business(uuid);
drop function public.owner_decision_opened_by_guard();
drop function public.strelva_service_reader(uuid,text);
drop function public.strelva_service_actions_immutable();
drop function public.strelva_service_session(uuid,uuid,text);
drop function public.open_owner_decision_as_service(uuid,uuid,jsonb);
drop function public.due_make_real_activations_for_service(integer,integer);
drop function public.record_strelva_service_action(uuid,uuid,text,text,text);
drop table public."strelva_service_actions";
CREATE OR REPLACE FUNCTION public.workspace_release_flag_names()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
    'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
    'make_real_live:booking_page', 'make_real_live:internal_app']::text[]
$function$
;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated, service_role;
grant execute on function public.workspace_release_flag_names() to "service_role";
CREATE OR REPLACE FUNCTION public.owner_decision_json(d owner_decisions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('id', d.id, 'workspaceId', d.workspace_id, 'systemId', d.system_id,
    'kind', d.change_kind, 'route', d.route, 'title', d.title, 'detail', d.detail,
    'approveEffect', d.approve_effect, 'notYetEffect', d.not_yet_effect,
    'sourceLifecycle', d.source_lifecycle, 'sourceId', d.source_id, 'revisionHash', d.revision_hash,
    'urgent', d.urgent, 'signInRequired', d.sign_in_required, 'adminMayDecide', d.admin_may_decide,
    'openHref', d.open_href, 'state', d.state, 'outcome', d.outcome, 'outcomeReason', d.outcome_reason,
    'receiptRef', d.receipt_ref, 'decidedByKind', d.decided_by_kind, 'decidedAt', d.decided_at,
    'deliveryState', d.delivery_state, 'operatorNote', d.operator_note, 'openedAt', d.opened_at,
    'expiresAt', d.expires_at, 'reminded1At', d.reminded_1_at, 'reminded2At', d.reminded_2_at,
    'deliveries', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'status', x.status,
        'providerMessageId', x.provider_message_id, 'reason', x.reason, 'at', x.created_at) order by x.created_at, x.id)
      from public.owner_decision_deliveries x where x.decision_id = d.id), '[]'::jsonb))
$function$
;
revoke all on function public.owner_decision_json(owner_decisions) from public, anon, authenticated, service_role;
commit;
