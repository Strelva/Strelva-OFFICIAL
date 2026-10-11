-- Narrow fallback for a maker's failed plan. Existing owner Request RPCs and
-- flags-off planning remain unchanged. No notification or acceptance is made.
begin;
set local lock_timeout = '3s';
create function public.file_failed_system_plan_request(
  p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_goal text,p_digest text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare receipt public.service_request_commands%rowtype; request_id uuid; request_key text;
begin
  perform public.require_system_work_plan_actor(p_workspace_id,p_user_id,p_verified_email);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then raise exception 'service_request_idempotency_invalid'; end if;
  perform public.service_request_assert_payload('requested',p_goal,p_goal,'{"source":"failed_system_plan"}'::jsonb,
    array['internal_tool'],'{"kind":"strelva"}'::jsonb);
  request_key := 'failed-plan:' || p_user_id::text || ':' || p_digest;
  perform pg_advisory_xact_lock(hashtextextended('service-request:' || p_workspace_id::text || ':' || request_key,0));
  select * into receipt from public.service_request_commands where business_workspace_id=p_workspace_id and idempotency_key=request_key;
  if found then return receipt.request_id; end if;
  insert into public.service_requests(business_workspace_id,status,request_text,outcome,context,scope,provider_kind,history,created_by)
    values(p_workspace_id,'requested',btrim(p_goal),btrim(p_goal),'{"source":"failed_system_plan"}',array['internal_tool'],'strelva',
      jsonb_build_array(jsonb_build_object('kind','requested','actorId',p_user_id::text,'at',clock_timestamp())),p_user_id)
    returning id into request_id;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values(p_workspace_id,request_key,p_digest,request_id);
  return request_id;
end; $$;
revoke all on function public.file_failed_system_plan_request(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.file_failed_system_plan_request(uuid,uuid,text,text,text) to service_role;
commit;
