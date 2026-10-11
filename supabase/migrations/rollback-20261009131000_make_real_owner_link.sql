-- Rollback for 20261009131000_make_real_owner_link.sql
-- Forward SHA-256: d76caeff5f916a41cb5cd8822061289092920b5b7bf601337ac0239c30bd1bd6
-- Batch 7: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_make_real_link_session(uuid,uuid,text)')))) is distinct from 'a0b0ed1c0eb655391a489c5792762e58' then raise exception 'rollback_wrong_order_or_function_drift: strelva_make_real_link_session'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.record_strelva_service_action(uuid,uuid,text,text,text)')))) is distinct from '247d80ca235aa572b4b8c50231098a4e' then raise exception 'rollback_wrong_order_or_function_drift: record_strelva_service_action'; end if;
end;
$rollback_guard$;
lock table public."strelva_service_actions" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009131000_strelva_service_actions" as table public."strelva_service_actions";
revoke all on release_rollback_archive."m20261009131000_strelva_service_actions" from public, anon, authenticated, service_role;
-- Preserve 1.0-only rows before restoring the earlier constraints.
alter table public.strelva_service_actions disable trigger strelva_service_actions_immutable;
delete from public.strelva_service_actions where purpose = 'make_real_link';
alter table public.strelva_service_actions enable trigger strelva_service_actions_immutable;
alter table public."strelva_service_actions" drop constraint "strelva_service_actions_purpose_check";
drop function public.strelva_make_real_link_session(uuid,uuid,text);
CREATE OR REPLACE FUNCTION public.record_strelva_service_action(p_workspace_id uuid, p_session_id uuid, p_action text, p_subject text, p_detail text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare created uuid;
begin
  if p_action is null or p_action not in ('resume', 'run', 'reconcile', 'rollback')
    or p_subject is null or char_length(p_subject) not between 1 and 300 then
    raise exception 'strelva_service_invalid';
  end if;
  perform public.strelva_service_session(p_workspace_id, p_session_id, 'make_real_resume');
  insert into public.strelva_service_actions(workspace_id, purpose, action, session_id, subject, detail)
    values (p_workspace_id, 'make_real_resume', p_action, p_session_id, p_subject, left(p_detail, 500))
    returning id into created;
  return created;
end;
$function$
;
revoke all on function public.record_strelva_service_action(uuid,uuid,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.record_strelva_service_action(uuid,uuid,text,text,text) to "service_role";
alter table public."strelva_service_actions" add constraint "strelva_service_actions_purpose_check" CHECK ((purpose = ANY (ARRAY['needs_you_sync'::text, 'make_real_resume'::text])));
commit;
