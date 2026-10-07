-- Rollback for 20261007190200_application_version_history.sql
-- Forward SHA-256: fd6441960c4b918f0b544bc04cff745dff4dae40e9d85d6082e5dd771bcd873f
-- Batch 4: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.application_guard_release_history()')))) is distinct from 'e722fe5bd7aee0319056caf6be58ab43' then raise exception 'rollback_wrong_order_or_function_drift: application_guard_release_history'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.application_window_candidate_versions()')))) is distinct from '60ac377c0f2e7b7a060369c87eaacd1c' then raise exception 'rollback_wrong_order_or_function_drift: application_window_candidate_versions'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.application_window_compatibility_payload()')))) is distinct from 'c70149c00e9fd0ed2df36444bd4ba455' then raise exception 'rollback_wrong_order_or_function_drift: application_window_compatibility_payload'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.application_candidate_version_append_only()')))) is distinct from 'ab86e057e16792e80153250c32613800' then raise exception 'rollback_wrong_order_or_function_drift: application_candidate_version_append_only'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.publish_application_candidate(uuid,uuid,uuid,text,integer,integer)')))) is distinct from 'bdd978e2c4cc12902b509663a037fc25' then raise exception 'rollback_wrong_order_or_function_drift: publish_application_candidate'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.application_candidate_versions') and attnum>0 and not attisdropped) <> 5 then raise exception 'rollback_wrong_order_or_table_drift: application_candidate_versions'; end if;
end;
$rollback_guard$;
lock table public."application_candidate_versions" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007190200_application_candidate_versions" as table public."application_candidate_versions";
revoke all on release_rollback_archive."m20261007190200_application_candidate_versions" from public, anon, authenticated, service_role;
drop trigger "saved_product_work_application_window_trg" on public."saved_product_work";
drop trigger "application_states_candidate_version_window_trg" on public."application_states";
drop trigger "application_candidate_version_append_only_trg" on public."application_candidate_versions";
alter table public."application_candidate_versions" drop constraint "application_candidate_versions_spec_check";
alter table public."application_candidate_versions" drop constraint "application_candidate_versions_version_check";
drop function public.application_window_candidate_versions();
drop function public.application_window_compatibility_payload();
drop function public.application_candidate_version_append_only();
drop table public."application_candidate_versions";
CREATE OR REPLACE FUNCTION public.application_guard_release_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  release_count integer;
begin
  select count(*) into release_count
  from public.application_releases
  where work_id = new.work_id;
  if release_count >= 100 then
    raise exception 'application_release_history_limit_reached';
  end if;
  return new;
end;
$function$
;
revoke all on function public.application_guard_release_history() from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.publish_application_candidate(p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_expected_candidate_revision integer, p_expected_release_version integer)
 RETURNS SETOF application_states
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  state public.application_states%rowtype;
  record_row public.application_records%rowtype;
  next_version integer;
  release_row public.application_releases%rowtype;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, true);
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id = p_work_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if state.candidate_design_revision <> p_expected_candidate_revision then raise exception 'application_design_revision_conflict'; end if;
  if state.current_release_version is distinct from nullif(p_expected_release_version, 0) then raise exception 'application_release_conflict'; end if;
  if state.candidate_rehearsal is null or state.candidate_rehearsal->>'specVersion' is distinct from state.candidate_spec_version::text
    or exists (select 1 from jsonb_array_elements(state.candidate_rehearsal->'checks') as item(value) where coalesce((value->>'passed')::boolean, false) is false) then
    raise exception 'application_rehearsal_required';
  end if;
  if (select count(*) from public.application_releases where work_id = p_work_id) >= 100 then
    raise exception 'application_release_history_limit_reached';
  end if;
  -- This is the publication check, against records committed after rehearsal.
  for record_row in select * from public.application_records where work_id = p_work_id loop
    perform public.validate_application_record(state.candidate_spec, record_row.record_id, record_row.values);
  end loop;
  select coalesce(max(version), 0) + 1 into next_version from public.application_releases where work_id = p_work_id;
  insert into public.application_releases(work_id, workspace_id, version, spec, published_by)
    values (p_work_id, p_workspace_id, next_version, state.candidate_spec, p_user_id)
    returning * into release_row;
  update public.application_states set current_release_version = next_version, lifecycle_status = 'installed', updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.application_touch_compatibility(p_work_id, p_user_id, 'publish_candidate', jsonb_build_object(
    'status', 'installed',
    'release', jsonb_build_object('version', release_row.version, 'spec', release_row.spec, 'publishedAt', release_row.published_at, 'publishedBy', release_row.published_by, 'provenance', release_row.publication_source),
    'releases', coalesce((select payload->'releases' from public.saved_product_work where id = p_work_id), '[]'::jsonb) || jsonb_build_array(jsonb_build_object('version', release_row.version, 'spec', release_row.spec, 'publishedAt', release_row.published_at, 'publishedBy', release_row.published_by, 'provenance', release_row.publication_source))
  ));
  return query select * from public.application_states where work_id = p_work_id;
end;
$function$
;
revoke all on function public.publish_application_candidate(uuid,uuid,uuid,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.publish_application_candidate(uuid,uuid,uuid,text,integer,integer) to "service_role";
commit;
