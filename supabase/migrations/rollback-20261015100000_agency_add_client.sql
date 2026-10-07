-- Rollback for 20261015100000_agency_add_client.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Refuses once any agency has added a client or issued an owner claim link:
-- those businesses, seats and owner offers are real records, and removing the
-- `agency_added` source would orphan them. Preserve or end them first.
begin;
set local lock_timeout = '3s';
do $rollback_guard$
begin
  if to_regprocedure('public.agency_add_client(uuid,text,uuid,jsonb,uuid,text)') is null then
    raise exception 'rollback_wrong_order: 20261015100000 is not applied';
  end if;
  if exists (select 1 from public.agency_client_additions) or exists (select 1 from public.agency_client_owner_claims)
    or exists (select 1 from public.workspace_providers where source = 'agency_added')
    or exists (select 1 from public.provider_seats where granted_by_kind = 'agency_added') then
    raise exception 'agency_add_client_rollback_requires_data_preservation';
  end if;
end;
$rollback_guard$;
drop function public.accept_agency_client_owner_claim(text, uuid, text);
drop function public.read_agency_client_owner_claim(text);
drop function public.issue_agency_client_owner_claim(uuid, text, uuid, uuid, text, text, timestamptz);
drop function public.list_agency_client_additions(uuid, text, uuid);
drop function public.agency_add_client(uuid, text, uuid, jsonb, uuid, text);
drop function public.agency_client_addition_json(public.agency_client_additions, boolean);
drop function public.agency_client_waiting_for_owner(uuid);
drop function public.agency_client_assert_actor(uuid, text, uuid);
drop function public.agency_client_add_limits();

-- The three replaced functions, exactly as 20260905190000, 20260921220000 and 20261008151000 left them.
create or replace function public.connected_site_assert_actor(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_manage boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  if not exists(select 1 from public.users where id = p_user_id and lower(email) = lower(p_verified_email) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  select m.role into v_role from public.workspaces w join public.workspace_memberships m on m.workspace_id = w.id
    where w.id = p_workspace_id and w.kind = 'customer' and m.user_id = p_user_id for share of w, m;
  if v_role is null then raise exception 'workspace_access_denied'; end if;
  if p_manage and v_role not in ('owner','admin') then raise exception 'workspace_access_denied'; end if;
  if p_manage and public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  return v_role;
end $$;
revoke all on function public.connected_site_assert_actor(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;

create or replace function public.enter_customer_business(
  p_user_id uuid, p_verified_email text, p_name text, p_business_id uuid,
  p_request_text text, p_command_id uuid, p_command_digest text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  receipt public.workspace_creation_receipts%rowtype;
  business_id uuid;
  request_row public.service_requests%rowtype;
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
    return jsonb_build_object('workspaceId',receipt.workspace_id,'requestId',receipt.request_id,'alreadyCreated',true);
  end if;
  if p_business_id is null then
    if (select count(*) from public.workspaces where created_by=p_user_id) >= 5 then raise exception 'workspace_limit_reached'; end if;
    insert into public.workspaces(kind,name,created_by) values('customer',btrim(p_name),p_user_id) returning id into business_id;
    insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(business_id,p_user_id,'owner',p_user_id);
  else
    perform public.service_request_assert_customer(p_business_id,p_user_id,p_verified_email,true);
    business_id := p_business_id;
  end if;
  if public.workspace_exit_completed(business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_request_text is not null then
    select * into request_row from public.save_service_request(
      p_user_id,p_verified_email,business_id,null,null,'requested',btrim(p_request_text),btrim(p_request_text),
      jsonb_build_object('source','business_entry','workspaceName',(select name from public.workspaces where id=business_id)),
      array['help_request']::text[],'{"kind":"strelva"}'::jsonb,
      'business-entry:'||p_command_id::text,p_command_digest
    );
    if request_row.id is null then raise exception 'business_entry_request_missing'; end if;
  end if;
  insert into public.workspace_creation_receipts(user_id,command_id,command_digest,workspace_id,request_id)
    values(p_user_id,p_command_id,p_command_digest,business_id,request_row.id);
  return jsonb_build_object('workspaceId',business_id,'requestId',request_row.id,'alreadyCreated',false);
end;
$$;

create or replace function public.create_owned_workspace(
  p_user_id uuid,
  p_verified_email text,
  p_kind text,
  p_name text
) returns setof public.workspaces
language plpgsql security definer set search_path = public as $$
declare
  normalized_email text := lower(btrim(p_verified_email));
  created_workspace public.workspaces%rowtype;
begin
  if p_kind not in ('personal', 'agency') then raise exception 'workspace_kind_invalid'; end if;
  if char_length(btrim(p_name)) not between 1 and 120 then raise exception 'workspace_name_invalid'; end if;

  -- Row lock serializes the per-user cap and personal-workspace idempotency.
  perform 1 from public.users u where u.id = p_user_id
    and lower(u.email) = normalized_email and u.verified_at is not null for update;
  if not found then raise exception 'verified_identity_required'; end if;

  if p_kind = 'personal' then
    select * into created_workspace from public.workspaces
      where created_by = p_user_id and kind = 'personal';
    if found then return next created_workspace; return; end if;
  end if;
  if (select count(*) from public.workspaces where created_by = p_user_id) >= 5 then
    raise exception 'workspace_limit_reached';
  end if;

  insert into public.workspaces (kind, name, created_by)
    values (p_kind, btrim(p_name), p_user_id) returning * into created_workspace;
  insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
    values (created_workspace.id, p_user_id, 'owner', p_user_id);
  return next created_workspace;
end;
$$;


drop table public.agency_client_owner_claims;
drop function public.agency_client_owner_claim_guard();
drop table public.agency_client_add_quota;
drop table public.agency_client_additions;
drop function public.agency_client_addition_guard();
alter table public.provider_seats drop constraint provider_seats_granted_by_kind_check;
alter table public.provider_seats add constraint provider_seats_granted_by_kind_check
  check (granted_by_kind in ('owner', 'conversion'));
alter table public.workspace_providers drop constraint workspace_providers_source_check;
alter table public.workspace_providers add constraint workspace_providers_source_check
  check (source in ('tenant_conversion', 'operator', 'business_choice'));
commit;
