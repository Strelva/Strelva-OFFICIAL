-- Member submissions resolve business links and save the record atomically.
-- Separate opt-in RPC; the existing member and resource-grant RPCs stay intact.
begin;
set local lock_timeout = '3s';

create function public.submit_internal_tool_member_record(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_release_version integer, p_expected_records_revision integer,
  p_record_id text, p_values jsonb, p_links jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  state public.application_states%rowtype;
  saved public.application_records%rowtype;
  release_spec jsonb;
  resolved jsonb := '{}'::jsonb;
  next_values jsonb := p_values;
  link jsonb;
  field jsonb;
  conflicts jsonb := '[]'::jsonb;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, false);
  select * into state from public.application_states where work_id=p_work_id and workspace_id=p_workspace_id for update;
  if not found then raise exception 'application_access_denied'; end if;
  if state.lifecycle_status <> 'installed' or state.current_release_version is distinct from p_expected_release_version then
    raise exception 'application_release_conflict';
  end if;
  if p_expected_records_revision is null or state.records_revision <> p_expected_records_revision then
    raise exception 'application_records_revision_conflict';
  end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_values is null or jsonb_typeof(p_values)<>'object' or p_links is null or jsonb_typeof(p_links)<>'array'
    or jsonb_array_length(p_links)>30 then raise exception 'application_record_invalid'; end if;
  select spec into release_spec from public.application_releases where work_id=p_work_id and version=p_expected_release_version;
  if release_spec is null then raise exception 'application_release_conflict'; end if;
  for link in select value from jsonb_array_elements(p_links) loop
    select value into field from jsonb_array_elements(release_spec->'fields') where value->>'id'=link->>'fieldId';
    if field is null or field->>'type' not in ('contact','assigned_person') or field->>'type' is distinct from link->>'kind' then
      raise exception 'application_record_invalid';
    end if;
  end loop;
  if jsonb_array_length(p_links)>0 then
    resolved := public.resolve_internal_tool_links(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_links);
  end if;
  for link in select value from jsonb_array_elements(p_links) loop
    next_values := jsonb_set(next_values,array[link->>'fieldId'],resolved->(link->>'fieldId')->'id');
    if resolved->(link->>'fieldId')->>'conflict'='true' then
      select value into field from jsonb_array_elements(release_spec->'fields') where value->>'id'=link->>'fieldId';
      conflicts := conflicts || jsonb_build_array(field->>'label');
    end if;
  end loop;
  -- Native validation, duplicate/cap checks, link guards and compatibility
  -- receipts remain the authority. Any failure rolls every preceding write back.
  select * into saved from public.submit_application_record(
    p_work_id,p_workspace_id,p_user_id,p_verified_email,
    p_expected_release_version,p_expected_records_revision,p_record_id,next_values);
  return jsonb_build_object('record',jsonb_build_object('id',saved.record_id,'values',saved.values),'conflicts',conflicts);
end;
$$;
revoke all on function public.submit_internal_tool_member_record(uuid,uuid,uuid,text,integer,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_internal_tool_member_record(uuid,uuid,uuid,text,integer,integer,text,jsonb,jsonb) to service_role;
commit;
