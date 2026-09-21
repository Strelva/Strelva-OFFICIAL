-- Explicit business entry reuses workspaces and service requests. It does not
-- convert personal work, claim a website, grant agency access, or start delivery.
create table public.workspace_creation_receipts (
  user_id uuid not null references public.users(id) on delete cascade,
  command_id uuid not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid references public.service_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);
alter table public.workspace_creation_receipts enable row level security;
revoke all on public.workspace_creation_receipts from public, anon, authenticated, service_role;

create function public.enter_customer_business(
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
revoke all on function public.enter_customer_business(uuid,text,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.enter_customer_business(uuid,text,text,uuid,text,uuid,text) to service_role;
