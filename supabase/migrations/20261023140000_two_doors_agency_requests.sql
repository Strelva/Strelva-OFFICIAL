-- ADR 0015 (two doors): a business's Request goes to its recorded agency, never
-- to a default. Since 20261020090040 save_service_request accepts only an
-- active agency seat, so business entry that still sent {"kind":"strelva"}
-- rolled back the whole entry, and the failed-plan fallback still wrote rows
-- no provider can act on. Entry now creates the business and holds the brief
-- when there is no single agency; the failed-plan fallback files to the single
-- active agency or files nothing. Historical rows are unchanged.
begin;
set local lock_timeout = '5s';

-- The one active agency seat for a business, or null when there is none or
-- more than one (the owner chooses then).
create function public.business_single_agency(p_business_id uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select case when count(*) = 1 then min(agency_workspace_id::text)::uuid end
    from public.provider_seats where customer_workspace_id = p_business_id and status = 'active';
$$;
revoke all on function public.business_single_agency(uuid) from public, anon, authenticated;
grant execute on function public.business_single_agency(uuid) to service_role;

create or replace function public.enter_customer_business(
  p_user_id uuid, p_verified_email text, p_name text, p_business_id uuid,
  p_request_text text, p_command_id uuid, p_command_digest text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  receipt public.workspace_creation_receipts%rowtype;
  business_id uuid;
  request_row public.service_requests%rowtype;
  agency_id uuid;
  request_held boolean := false;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or (p_business_id is null and coalesce(char_length(btrim(p_name)),0) not between 1 and 120)
    or (p_business_id is not null and p_name is not null)
    or (p_request_text is not null and char_length(btrim(p_request_text)) not between 1 and 3000) then
    raise exception 'business_entry_invalid';
  end if;
  -- Same lock as create_owned_workspace: concurrent entry cannot exceed the cap.
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email))
    and verified_at is not null for update;
  if not found then raise exception 'verified_identity_required'; end if;
  select * into receipt from public.workspace_creation_receipts
    where user_id=p_user_id and command_id=p_command_id for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'business_entry_idempotency_conflict'; end if;
    perform public.service_request_assert_customer(receipt.workspace_id,p_user_id,p_verified_email,true);
    return jsonb_build_object('workspaceId',receipt.workspace_id,'requestId',receipt.request_id,'alreadyCreated',true,
      'agencyRequired',p_request_text is not null and receipt.request_id is null);
  end if;
  if p_business_id is null then
    if (select count(*) from public.workspaces w where w.created_by=p_user_id
        and (not exists (select 1 from public.agency_client_additions a where a.customer_workspace_id=w.id)
          or exists (select 1 from public.workspace_memberships m where m.workspace_id=w.id and m.user_id=p_user_id and m.role='owner'))) >= 5 then
      raise exception 'workspace_limit_reached';
    end if;
    insert into public.workspaces(kind,name,created_by) values('customer',btrim(p_name),p_user_id) returning id into business_id;
    insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(business_id,p_user_id,'owner',p_user_id);
  else
    perform public.service_request_assert_customer(p_business_id,p_user_id,p_verified_email,true);
    business_id := p_business_id;
  end if;
  if public.workspace_exit_completed(business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_request_text is not null then
    agency_id := public.business_single_agency(business_id);
    request_held := agency_id is null;
  end if;
  if p_request_text is not null and agency_id is not null then
    select * into request_row from public.save_service_request(
      p_user_id,p_verified_email,business_id,null,null,'requested',btrim(p_request_text),btrim(p_request_text),
      jsonb_build_object('source','business_entry','workspaceName',(select name from public.workspaces where id=business_id)),
      array['help_request']::text[],jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id),
      'business-entry:'||p_command_id::text,p_command_digest
    );
    if request_row.id is null then raise exception 'business_entry_request_missing'; end if;
  end if;
  insert into public.workspace_creation_receipts(user_id,command_id,command_digest,workspace_id,request_id)
    values(p_user_id,p_command_id,p_command_digest,business_id,request_row.id);
  return jsonb_build_object('workspaceId',business_id,'requestId',request_row.id,'alreadyCreated',false,'agencyRequired',request_held);
end;
$$;

create or replace function public.file_failed_system_plan_request(
  p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_goal text,p_digest text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare receipt public.service_request_commands%rowtype; request_id uuid; request_key text; agency_id uuid;
begin
  perform public.require_system_work_plan_actor(p_workspace_id,p_user_id,p_verified_email);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then raise exception 'service_request_idempotency_invalid'; end if;
  agency_id := public.business_single_agency(p_workspace_id);
  -- No single agency: nobody can receive the Request, so none is filed. The
  -- maker sees the plan failure and can bring in an agency.
  if agency_id is null then return null; end if;
  perform public.service_request_assert_payload('requested',p_goal,p_goal,'{"source":"failed_system_plan"}'::jsonb,
    array['internal_tool'],jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id));
  request_key := 'failed-plan:' || p_user_id::text || ':' || p_digest;
  perform pg_advisory_xact_lock(hashtextextended('service-request:' || p_workspace_id::text || ':' || request_key,0));
  select * into receipt from public.service_request_commands where business_workspace_id=p_workspace_id and idempotency_key=request_key;
  if found then return receipt.request_id; end if;
  insert into public.service_requests(business_workspace_id,status,request_text,outcome,context,scope,provider_kind,provider_agency_workspace_id,history,created_by)
    values(p_workspace_id,'requested',btrim(p_goal),btrim(p_goal),'{"source":"failed_system_plan"}',array['internal_tool'],'agency',agency_id,
      jsonb_build_array(jsonb_build_object('kind','requested','actorId',p_user_id::text,'at',clock_timestamp())),p_user_id)
    returning id into request_id;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values(p_workspace_id,request_key,p_digest,request_id);
  return request_id;
end; $$;

revoke all on function public.enter_customer_business(uuid, text, text, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.enter_customer_business(uuid, text, text, uuid, text, uuid, text) to service_role;
revoke all on function public.file_failed_system_plan_request(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.file_failed_system_plan_request(uuid,uuid,text,text,text) to service_role;
commit;
