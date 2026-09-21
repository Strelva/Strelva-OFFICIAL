-- Extend the existing request record. No new execution, billing, or access path.
alter table public.service_requests add column delivery_commitment jsonb;
alter table public.service_requests add constraint service_delivery_commitment_shape check (
  delivery_commitment is null or (
    jsonb_typeof(delivery_commitment) = 'object'
    and delivery_commitment->>'version' = '1'
    and delivery_commitment->>'status' in ('proposed','running','submitted','changes_requested','accepted','cancelled')
    and octet_length(delivery_commitment::text) <= 24000
  )
);

create or replace function public.change_service_delivery_commitment(
  p_user_id uuid, p_verified_email text, p_request_id uuid, p_expected_revision bigint,
  p_change jsonb, p_idempotency_key text, p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  item public.service_requests%rowtype;
  receipt public.service_request_commands%rowtype;
  result_row public.service_requests%rowtype;
  commitment jsonb;
  result_input jsonb;
  operation text := p_change->>'kind';
  now_at timestamptz := clock_timestamp();
  is_provider boolean;
  binding public.offering_website_bindings%rowtype;
  allowed_keys text[];
begin
  select * into item from public.service_requests where id = p_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if operation is null or operation not in ('propose','agree','submit','blocker','accept_result','request_changes','cancel')
    or jsonb_typeof(p_change) is distinct from 'object' then
    raise exception 'service_request_commitment_invalid';
  end if;
  is_provider := operation in ('propose','submit','blocker');
  if is_provider then
    perform public.service_request_assert_provider(item.provider_kind,item.provider_agency_workspace_id,p_user_id,p_verified_email);
    -- Hold the actual provider membership through the mutation and replay.
    if item.provider_kind = 'agency' then
      perform 1 from public.workspace_memberships where workspace_id=item.provider_agency_workspace_id and user_id=p_user_id for share;
      if not found then raise exception 'service_request_access_denied'; end if;
    else
      perform 1 from public.super_admins where user_id=p_user_id and revoked_at is null for share;
      if not found then raise exception 'service_request_access_denied'; end if;
    end if;
    if item.accepted_by is distinct from p_user_id then raise exception 'service_request_access_denied'; end if;
  else
    perform public.service_request_assert_customer(item.business_workspace_id,p_user_id,p_verified_email,true);
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'service_request_idempotency_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service-request:'||item.business_workspace_id::text||':'||p_idempotency_key,0));
  select * into receipt from public.service_request_commands
    where business_workspace_id=item.business_workspace_id and idempotency_key=p_idempotency_key for update;
  if found then
    if receipt.command_digest <> p_command_digest or receipt.request_id <> item.id then
      raise exception 'service_request_idempotency_conflict';
    end if;
    return next item;
    return;
  end if;
  if p_expected_revision is null or p_expected_revision <> item.revision then raise exception 'service_request_revision_conflict'; end if;
  if item.status <> 'requested' or item.provider_acceptance <> 'accepted' then raise exception 'service_request_commitment_not_ready'; end if;
  if public.workspace_exit_completed(item.business_workspace_id) and operation <> 'cancel' then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  now_at := clock_timestamp();
  commitment := item.delivery_commitment;
  if is_provider and commitment is not null and commitment->>'operatorId' <> p_user_id::text then
    raise exception 'service_request_access_denied';
  end if;
  -- A revoked/expired linked delivery cannot be revived by this workflow.
  if operation in ('propose','agree','submit','blocker') and item.delivery_id is not null and not exists (
    select 1 from public.offering_provider_deliveries d
    where d.id=item.delivery_id and d.business_workspace_id=item.business_workspace_id
      and d.status='accepted' and d.expires_at > now_at
  ) then raise exception 'service_request_delivery_missing'; end if;

  allowed_keys := case operation
    when 'propose' then array['kind','termsReference','deliveryDefinition','inputsReady']
    when 'agree' then array['kind']
    when 'submit' then array['kind','result']
    else array['kind','note'] end;
  if p_change - allowed_keys <> '{}'::jsonb then raise exception 'service_request_commitment_invalid'; end if;

  if operation = 'propose' then
    if commitment is not null and commitment->>'status' <> 'proposed' then raise exception 'service_request_commitment_already_started'; end if;
    if p_change->'inputsReady' is distinct from 'true'::jsonb
      or coalesce(char_length(btrim(p_change->>'termsReference')),0) not between 1 and 500
      or coalesce(char_length(btrim(p_change->>'deliveryDefinition')),0) not between 1 and 1000 then
      raise exception 'service_request_commitment_invalid';
    end if;
    commitment := jsonb_build_object(
      'version',1,'status','proposed','operatorId',p_user_id,
      'termsReference',btrim(p_change->>'termsReference'),'deliveryDefinition',btrim(p_change->>'deliveryDefinition'),
      'scope',to_jsonb(item.scope),'proposedAt',now_at,
      'startedAt',null,'dueAt',null,'customerAcceptedBy',null,'customerAcceptedAt',null,
      'blocker',null,'result',null,'decision',null
    );
  elsif commitment is null then
    raise exception 'service_request_commitment_missing';
  elsif operation = 'agree' then
    if commitment->>'status' <> 'proposed' then raise exception 'service_request_commitment_already_started'; end if;
    perform public.service_request_assert_provider(item.provider_kind,item.provider_agency_workspace_id,
      item.accepted_by,(select email from public.users where id=item.accepted_by));
    -- Acceptance is a current owner decision on the exact request revision.
    -- It does not authorize publication, billing, or any provider connection.
    commitment := commitment || jsonb_build_object('status','running','startedAt',now_at,
      'dueAt',now_at + interval '24 hours','customerAcceptedBy',p_user_id,'customerAcceptedAt',now_at);
  elsif operation = 'submit' then
    if commitment->>'status' not in ('running','changes_requested') then raise exception 'service_request_commitment_state_invalid'; end if;
    result_input := p_change->'result';
    if jsonb_typeof(result_input) is distinct from 'object'
      or result_input - array['websiteBindingId','repository','commitSha','reviewUrl','desktopChecked','mobileChecked','primaryActionChecked'] <> '{}'::jsonb
      or coalesce(result_input->>'repository','') !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
      or char_length(result_input->>'repository') > 201
      or coalesce(result_input->>'commitSha','') !~ '^[a-f0-9]{40}$'
      or coalesce(result_input->>'reviewUrl','') !~ '^https://[A-Za-z0-9.-]+[.][A-Za-z0-9-]+(/[^?#]*)?$'
      or char_length(result_input->>'reviewUrl') > 2048
      or result_input->'desktopChecked' is distinct from 'true'::jsonb
      or result_input->'mobileChecked' is distinct from 'true'::jsonb
      or result_input->'primaryActionChecked' is distinct from 'true'::jsonb then
      raise exception 'service_request_delivery_evidence_invalid';
    end if;
    begin
      select * into binding from public.offering_website_bindings
        where id=(result_input->>'websiteBindingId')::uuid
          and business_workspace_id=item.business_workspace_id and status='active' for share;
    exception when invalid_text_representation then raise exception 'service_request_delivery_binding_invalid'; end;
    if binding.id is null or binding.tenant_stable_id is null or not exists (
      select 1 from public.tenants where stable_id=binding.tenant_stable_id and active is not false
    ) then raise exception 'service_request_delivery_binding_invalid'; end if;
    if item.provider_kind='agency' and not exists (
      select 1 from public.agency_managed_website_delivery_target(item.delivery_id,binding.id) target
      join public.agency_managed_website_draft_grants g on g.managed_website_binding_id=target.managed_website_binding_id
        and g.delivery_id=target.delivery_id and g.operator_user_id=target.operator_user_id
      where target.operator_user_id=p_user_id and g.status='active' and g.expires_at>now_at
    ) then raise exception 'service_request_access_denied'; end if;
    commitment := commitment || jsonb_build_object('status','submitted','blocker',null,'decision',null,
      'result',result_input||jsonb_build_object('submittedAt',now_at,'submittedBy',p_user_id));
  elsif operation = 'blocker' then
    if commitment->>'status' not in ('running','changes_requested') then raise exception 'service_request_commitment_state_invalid'; end if;
    if not (p_change ? 'note') or (p_change->'note' <> 'null'::jsonb and coalesce(char_length(btrim(p_change->>'note')),0) not between 1 and 1000) then
      raise exception 'service_request_commitment_invalid';
    end if;
    commitment := commitment || jsonb_build_object('blocker',case when p_change->'note'='null'::jsonb then null
      else jsonb_build_object('note',btrim(p_change->>'note'),'actorId',p_user_id,'at',now_at) end);
  else
    if coalesce(char_length(btrim(p_change->>'note')),0) not between 1 and 1000 then raise exception 'service_request_commitment_invalid'; end if;
    if operation in ('accept_result','request_changes') and commitment->>'status' <> 'submitted' then
      raise exception 'service_request_commitment_state_invalid';
    end if;
    if operation='cancel' and commitment->>'status' in ('accepted','cancelled') then raise exception 'service_request_commitment_state_invalid'; end if;
    if operation='accept_result' and not exists (
      select 1 from public.offering_website_bindings b join public.tenants t on t.stable_id=b.tenant_stable_id
      where b.id=(commitment->'result'->>'websiteBindingId')::uuid and b.business_workspace_id=item.business_workspace_id
        and b.status='active' and t.active is not false
    ) then raise exception 'service_request_delivery_binding_invalid'; end if;
    commitment := commitment || jsonb_build_object('status',case operation when 'accept_result' then 'accepted' when 'request_changes' then 'changes_requested' else 'cancelled' end,
      'decision',jsonb_build_object('kind',case operation when 'accept_result' then 'accepted' when 'request_changes' then 'changes_requested' else 'cancelled' end,
        'note',btrim(p_change->>'note'),'actorId',p_user_id,'at',now_at));
  end if;
  update public.service_requests set delivery_commitment=commitment,
    status=case when operation='cancel' then 'withdrawn' else status end,
    revision=revision+1, updated_at=now_at,
    history=history||jsonb_build_array(jsonb_build_object('kind','delivery_'||operation,'actorId',p_user_id,'at',now_at,'commitment',commitment))
    where id=item.id returning * into result_row;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values(item.business_workspace_id,p_idempotency_key,p_command_digest,item.id);
  return next result_row;
end;
$$;
revoke all on function public.change_service_delivery_commitment(uuid,text,uuid,bigint,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.change_service_delivery_commitment(uuid,text,uuid,bigint,jsonb,text,text) to service_role;

create or replace function public.read_service_delivery_work(
  p_user_id uuid,p_verified_email text,p_provider_kind text,p_agency_workspace_id uuid default null
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.service_request_assert_provider(p_provider_kind,p_agency_workspace_id,p_user_id,p_verified_email);
  return query select item.* from public.service_requests item
    where item.provider_kind=p_provider_kind
      and item.provider_agency_workspace_id is not distinct from p_agency_workspace_id
      and item.status='requested' and item.provider_acceptance='accepted'
    order by case when item.delivery_commitment->>'status' in ('running','changes_requested') then 0 else 1 end,
      (item.delivery_commitment->>'dueAt')::timestamptz nulls last,item.updated_at desc,item.id;
end;
$$;
revoke all on function public.read_service_delivery_work(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.read_service_delivery_work(uuid,text,text,uuid) to service_role;

-- Older withdrawal clients can cancel, but may not strand an active promise.
create or replace function public.guard_service_delivery_commitment_withdrawal()
returns trigger language plpgsql set search_path = public,pg_temp as $$
begin
  if new.status='withdrawn' and old.status<>'withdrawn' and old.delivery_commitment is not null
    and old.delivery_commitment->>'status' not in ('accepted','cancelled')
    and new.delivery_commitment->>'status' is distinct from 'cancelled' then
    raise exception 'service_request_commitment_cancel_required';
  end if;
  return new;
end;
$$;
create trigger service_delivery_commitment_withdrawal_trg before update on public.service_requests
for each row execute function public.guard_service_delivery_commitment_withdrawal();
revoke all on function public.guard_service_delivery_commitment_withdrawal() from public,anon,authenticated;

create or replace function public.read_service_delivery_permissions(
  p_user_id uuid,p_verified_email text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.service_requests%rowtype; can_manage boolean; can_operate boolean; bindings jsonb;
begin
  select * into item from public.read_service_request(p_user_id,p_verified_email,p_request_id);
  can_manage := exists(select 1 from public.workspace_memberships where workspace_id=item.business_workspace_id and user_id=p_user_id and role in ('owner','admin'));
  can_operate := item.status='requested' and item.accepted_by=p_user_id and (
    (item.provider_kind='strelva' and exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null))
    or (item.provider_kind='agency' and exists(select 1 from public.workspace_memberships where workspace_id=item.provider_agency_workspace_id and user_id=p_user_id))
  );
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',t.site_name,'tenantId',t.id) order by t.site_name),'[]'::jsonb) into bindings
    from public.offering_website_bindings b join public.tenants t on t.stable_id=b.tenant_stable_id
    where b.business_workspace_id=item.business_workspace_id and b.status='active' and t.active is not false
    and (can_manage or (can_operate and item.provider_kind='strelva') or exists (
      select 1 from public.agency_managed_website_delivery_target(item.delivery_id,b.id) target
      join public.agency_managed_website_draft_grants g on g.managed_website_binding_id=target.managed_website_binding_id
        and g.delivery_id=target.delivery_id and g.operator_user_id=target.operator_user_id
      where target.operator_user_id=p_user_id and g.status='active' and g.expires_at>clock_timestamp()
    ));
  return jsonb_build_object('canManage',can_manage,'canOperate',coalesce(can_operate,false),
    'stopped',public.workspace_exit_completed(item.business_workspace_id),'websiteBindings',bindings);
end;
$$;
revoke all on function public.read_service_delivery_permissions(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_service_delivery_permissions(uuid,text,uuid) to service_role;
