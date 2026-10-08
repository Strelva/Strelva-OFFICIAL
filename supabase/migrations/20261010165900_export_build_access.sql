-- Owners can retrieve their ready archive while client email is paused.
-- Operators may prepare an export but cannot use the owner's download path.
begin;
set local lock_timeout = '3s';

create function public.read_workspace_export_owner_status(p_build_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.workspace_export_builds%rowtype;
begin
  select * into v from public.workspace_export_builds where id = p_build_id;
  if not found then raise exception 'workspace_export_denied'; end if;
  if public.workspace_export_v3_role(v.workspace_id, p_user_id, p_verified_email) <> 'owner' then
    raise exception 'workspace_export_denied';
  end if;
  return jsonb_build_object('buildId', v.id, 'workspaceId', v.workspace_id, 'status', case
      when v.status = 'ready' and (v.expires_at is null or v.expires_at <= clock_timestamp()) then 'expired'
      when v.status = 'building' and v.created_at < clock_timestamp() - interval '30 minutes' then 'stalled'
      else v.status end,
    'byteSize', v.byte_size, 'partCount', v.part_count, 'manifest', v.manifest,
    'expiresAt', v.expires_at, 'expired', v.expires_at is not null and v.expires_at <= clock_timestamp(),
    'failure', v.failure, 'createdAt', v.created_at, 'completedAt', v.completed_at);
end $$;

create function public.read_workspace_export_owner_part(p_build_id uuid, p_user_id uuid, p_verified_email text, p_part integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.workspace_export_builds%rowtype; v_body text;
begin
  select * into v from public.workspace_export_builds where id = p_build_id;
  if not found then raise exception 'workspace_export_denied'; end if;
  if public.workspace_export_v3_role(v.workspace_id, p_user_id, p_verified_email) <> 'owner' then
    raise exception 'workspace_export_denied';
  end if;
  if v.status <> 'ready' or v.expires_at is null or v.expires_at <= clock_timestamp() then
    raise exception 'workspace_export_link_invalid';
  end if;
  select body into v_body from public.workspace_export_build_parts where build_id = p_build_id and part = p_part;
  if v_body is null then raise exception 'workspace_export_link_invalid'; end if;
  return jsonb_build_object('body', v_body, 'part', p_part, 'partCount', v.part_count, 'workspaceId', v.workspace_id);
end $$;

revoke all on function public.read_workspace_export_owner_status(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.read_workspace_export_owner_part(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.read_workspace_export_owner_status(uuid,uuid,text) to service_role;
grant execute on function public.read_workspace_export_owner_part(uuid,uuid,text,integer) to service_role;
commit;
