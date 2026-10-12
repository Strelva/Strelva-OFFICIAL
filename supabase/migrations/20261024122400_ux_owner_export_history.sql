-- Recover an owner's retained archives after navigation without exposing email,
-- tokens, manifests or internal failure details. This reader takes no writer locks.
begin;
set local lock_timeout = '3s';
create function public.list_workspace_export_owner_builds(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.workspace_export_v3_read_role(p_workspace_id, p_user_id, p_verified_email) is distinct from 'owner' then
    raise exception 'workspace_export_denied';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'buildId', v.id, 'workspaceId', v.workspace_id, 'createdAt', v.created_at, 'expiresAt', v.expires_at,
    'status', case
      when v.status = 'ready' and (v.expires_at is null or v.expires_at <= statement_timestamp()) then 'expired'
      when v.status = 'building' and v.created_at < statement_timestamp() - interval '30 minutes' then 'stalled'
      else v.status end) order by v.created_at desc, v.id desc)
    from public.workspace_export_builds v where v.workspace_id = p_workspace_id
      and (v.created_at >= statement_timestamp() - interval '7 days'
        or (v.status = 'ready' and v.expires_at > statement_timestamp()))), '[]'::jsonb);
end $$;
revoke all on function public.list_workspace_export_owner_builds(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.list_workspace_export_owner_builds(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
