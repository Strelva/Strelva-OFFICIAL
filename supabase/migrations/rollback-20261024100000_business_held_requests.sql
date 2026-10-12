-- Roll back 20261024100000 (held requests). Refuses once any held request
-- exists, so no owner's request is discarded; then restores enter_customer_business
-- and read_agency_proposals exactly as 20261023140000 / 20261023142000 left them.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from public.business_held_requests) then
    raise exception 'held_requests_rollback_refused: held requests exist';
  end if;
end $$;
drop trigger provider_seats_route_held_requests on public.provider_seats;
drop function public.decide_business_held_request(uuid, text, uuid, uuid, text, uuid);
drop function public.read_business_held_requests(uuid, text, uuid);
drop function public.business_held_requests_on_seat();
drop function public.business_held_request_route(uuid, uuid);
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

create or replace function public.read_agency_proposals(p_user_id uuid, p_verified_email text, p_agency_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.agency_directory_assert_manager(p_agency_id, p_user_id, p_verified_email);
  return coalesce((select jsonb_agg(jsonb_build_object('businessWorkspaceId', b.id, 'businessName', b.name,
      'consent', min(g.consent), 'proposedAt', min(g.proposed_at),
      'scopes', jsonb_agg(jsonb_build_object('scope', g.scope, 'level', g.level) order by g.scope)) order by min(g.proposed_at))
    from public.agency_scope_grants g join public.workspaces b on b.id = g.customer_workspace_id
    where g.agency_workspace_id = p_agency_id and g.status = 'proposed'
    group by b.id, b.name), '[]'::jsonb);
end;
$$;

drop table public.business_held_requests;
commit;
