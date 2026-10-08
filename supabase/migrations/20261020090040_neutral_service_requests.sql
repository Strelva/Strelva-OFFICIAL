-- ADR0012: retire special platform-admin provider authority. Historical rows,
-- command receipts and commitments are retained unchanged; business members
-- keep read/export access. Old special-provider writes and inbox calls fail closed.
-- Agencies use exact active seats/staff; response locks prevent revocation races.
set local lock_timeout = '3s';

create or replace function public.service_request_assert_provider(
  p_provider_kind text, p_agency_workspace_id uuid, p_user_id uuid, p_verified_email text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'service_request_provider_ineligible'; end if;
  if p_provider_kind = 'agency' then
    if not exists (select 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency')
      or not exists (select 1 from public.workspace_memberships where workspace_id = p_agency_workspace_id and user_id = p_user_id) then
      raise exception 'service_request_provider_ineligible';
    end if;
  else
    raise exception 'service_request_provider_ineligible';
  end if;
end;
$$;

create function public.service_request_assert_agency_client(p_business_id uuid, p_agency_id uuid, p_user_id uuid, p_lock boolean, p_verified_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_lock then
    perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
    if not found then raise exception 'service_request_provider_ineligible'; end if;
    perform 1 from public.provider_seats s
      join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=p_user_id
      join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id
        and st.customer_workspace_id=s.customer_workspace_id and st.user_id=p_user_id and st.status='active'
      where s.customer_workspace_id=p_business_id and s.agency_workspace_id=p_agency_id and s.status='active'
      for share of s,m,st;
  else
    perform 1 from public.provider_seats s
      join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=p_user_id
      join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id
        and st.customer_workspace_id=s.customer_workspace_id and st.user_id=p_user_id and st.status='active'
      where s.customer_workspace_id=p_business_id and s.agency_workspace_id=p_agency_id and s.status='active';
  end if;
  if not found then raise exception 'service_request_provider_ineligible'; end if;
end;
$$;
revoke all on function public.service_request_assert_agency_client(uuid,uuid,uuid,boolean,text) from public,anon,authenticated,service_role;

create or replace function public.save_service_request(
  p_user_id uuid, p_verified_email text, p_business_id uuid, p_request_id uuid,
  p_expected_revision bigint, p_status text, p_request_text text, p_outcome text,
  p_context jsonb, p_scope text[], p_provider jsonb, p_idempotency_key text, p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.service_requests%rowtype;
  created public.service_requests%rowtype;
  receipt public.service_request_commands%rowtype;
  v_provider_kind text := p_provider->>'kind';
  provider_agency_id uuid;
  event_kind text;
begin
  perform public.service_request_assert_customer(p_business_id, p_user_id, p_verified_email, true);
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'service_request_idempotency_invalid';
  end if;
  if v_provider_kind is distinct from 'agency' then raise exception 'service_request_provider_ineligible'; end if;
  perform public.service_request_assert_payload(p_status, p_request_text, p_outcome, p_context, p_scope, p_provider);
  if v_provider_kind = 'agency' then
    begin provider_agency_id := (p_provider->>'agencyWorkspaceId')::uuid;
    exception when invalid_text_representation then raise exception 'service_request_provider_invalid'; end;
    perform 1 from public.provider_seats where customer_workspace_id=p_business_id and agency_workspace_id=provider_agency_id and status='active' for share;
    if not found then raise exception 'service_request_provider_ineligible'; end if;
    if provider_agency_id = p_business_id or not exists (select 1 from public.workspaces where id = provider_agency_id and kind = 'agency') then
      raise exception 'service_request_provider_ineligible';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('service-request:' || p_business_id::text || ':' || p_idempotency_key, 0));
  select * into receipt from public.service_request_commands
    where business_workspace_id = p_business_id and idempotency_key = p_idempotency_key for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'service_request_idempotency_conflict'; end if;
    return query select * from public.service_requests where id = receipt.request_id and business_workspace_id = p_business_id;
    return;
  end if;

  if p_request_id is null then
    event_kind := case when p_status = 'draft' then 'draft_saved' else 'requested' end;
    insert into public.service_requests(
      business_workspace_id,status,request_text,outcome,context,scope,provider_kind,
      provider_agency_workspace_id,history,created_by,updated_at
    ) values (
      p_business_id,p_status,btrim(p_request_text),btrim(p_outcome),p_context,p_scope,v_provider_kind,
      provider_agency_id,jsonb_build_array(jsonb_build_object('kind',event_kind,'actorId',p_user_id::text,'at',clock_timestamp())),p_user_id,clock_timestamp()
    ) returning * into created;
    insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
      values (p_business_id,p_idempotency_key,p_command_digest,created.id);
    return next created;
    return;
  end if;

  select * into existing from public.service_requests
    where id = p_request_id and business_workspace_id = p_business_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if p_expected_revision is null or p_expected_revision <> existing.revision then raise exception 'service_request_revision_conflict'; end if;
  if existing.provider_kind='strelva' then raise exception 'service_request_provider_ineligible'; end if;
  if existing.status = 'withdrawn' or existing.provider_acceptance <> 'pending'
    or (existing.status = 'requested' and p_status = 'draft') then
    raise exception 'service_request_state_invalid';
  end if;
  event_kind := case when p_status = 'draft' then 'draft_saved' else 'requested' end;
  update public.service_requests set
    status = p_status, request_text = btrim(p_request_text), outcome = btrim(p_outcome), context = p_context,
    scope = p_scope, provider_kind = v_provider_kind, provider_agency_workspace_id = provider_agency_id,
    revision = revision + 1, updated_at = clock_timestamp(),
    history = history || jsonb_build_array(jsonb_build_object('kind',event_kind,'actorId',p_user_id::text,'at',clock_timestamp()))
    where id = existing.id
    returning * into created;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values (p_business_id,p_idempotency_key,p_command_digest,created.id);
  return next created;
end;
$$;

create or replace function public.respond_service_request(
  p_user_id uuid, p_verified_email text, p_request_id uuid, p_expected_revision bigint, p_decision text,
  p_note text, p_idempotency_key text, p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.service_requests%rowtype;
  created public.service_requests%rowtype;
  receipt public.service_request_commands%rowtype;
begin
  select * into existing from public.service_requests where id = p_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  perform public.service_request_assert_provider(existing.provider_kind, existing.provider_agency_workspace_id, p_user_id, p_verified_email);
  perform public.service_request_assert_agency_client(existing.business_workspace_id,existing.provider_agency_workspace_id,p_user_id,true,p_verified_email);
  perform public.service_request_assert_provider(existing.provider_kind,existing.provider_agency_workspace_id,p_user_id,p_verified_email);
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'service_request_idempotency_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service-request:' || existing.business_workspace_id::text || ':' || p_idempotency_key, 0));
  select * into receipt from public.service_request_commands
    where business_workspace_id = existing.business_workspace_id and idempotency_key = p_idempotency_key for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'service_request_idempotency_conflict'; end if;
    return query select * from public.service_requests where id = receipt.request_id;
    return;
  end if;
  if p_expected_revision is null or p_expected_revision <> existing.revision then
    raise exception 'service_request_revision_conflict';
  end if;
  if existing.status <> 'requested' or existing.provider_acceptance <> 'pending'
    or p_decision not in ('accepted', 'declined')
    or (p_note is not null and char_length(btrim(p_note)) > 1000) then
    raise exception 'service_request_state_invalid';
  end if;
  update public.service_requests set
    provider_acceptance = p_decision,
    accepted_by = case when p_decision = 'accepted' then p_user_id else null end,
    accepted_at = case when p_decision = 'accepted' then clock_timestamp() else null end,
    acceptance_note = case when p_note is null or btrim(p_note) = '' then null else btrim(p_note) end,
    revision = revision + 1, updated_at = clock_timestamp(),
    history = history || jsonb_build_array(jsonb_build_object('kind',p_decision,'actorId',p_user_id::text,'at',clock_timestamp(),'note',p_note))
    where id = existing.id
    returning * into created;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values (existing.business_workspace_id,p_idempotency_key,p_command_digest,created.id);
  return next created;
end;
$$;

create or replace function public.read_service_request(
  p_user_id uuid, p_verified_email text, p_request_id uuid
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare item public.service_requests%rowtype;
begin
  select * into item from public.service_requests where id = p_request_id;
  if not found then raise exception 'service_request_not_found'; end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'service_request_access_denied'; end if;
  if exists (select 1 from public.workspace_memberships where workspace_id = item.business_workspace_id and user_id = p_user_id) then
    return next item;
    return;
  end if;
  if item.status <> 'requested' then raise exception 'service_request_access_denied'; end if;
  perform public.service_request_assert_provider(item.provider_kind, item.provider_agency_workspace_id, p_user_id, p_verified_email);
  perform public.service_request_assert_agency_client(item.business_workspace_id,item.provider_agency_workspace_id,p_user_id,false,p_verified_email);
  return next item;
end;
$$;

create or replace function public.read_service_requests_for_agency(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.service_request_assert_provider('agency', p_agency_workspace_id, p_user_id, p_verified_email);
  return query select item.* from public.service_requests item
    where item.provider_kind = 'agency'
      and item.provider_agency_workspace_id = p_agency_workspace_id
      and exists (select 1 from public.provider_seats s join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id and st.customer_workspace_id=s.customer_workspace_id and st.user_id=p_user_id and st.status='active' where s.customer_workspace_id=item.business_workspace_id and s.agency_workspace_id=p_agency_workspace_id and s.status='active')
      and item.status = 'requested' and item.provider_acceptance = 'pending'
    order by item.updated_at desc, item.id;
end;
$$;

-- Direct business members can choose only agencies with an owner-granted seat.
-- No platform designation or agency membership of the customer orders this list.
create function public.read_service_request_providers(p_user_id uuid,p_verified_email text,p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists (select 1 from public.users u join public.workspace_memberships m on m.user_id=u.id
    join public.workspaces w on w.id=m.workspace_id and w.kind='customer'
    where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id=p_business_id) then raise exception 'service_request_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('agencyWorkspaceId',a.id,'name',a.name,
    'providerOfRecord',exists(select 1 from public.workspace_providers p where p.customer_workspace_id=p_business_id
      and p.provider_workspace_id=a.id and p.status='active')) order by lower(a.name),a.id)
    from public.provider_seats s join public.workspaces a on a.id=s.agency_workspace_id and a.kind='agency'
    where s.customer_workspace_id=p_business_id and s.status='active'),'[]'::jsonb);
end;
$$;
revoke all on function public.read_service_request_providers(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_service_request_providers(uuid,text,uuid) to service_role;

-- Retire adjacent legacy new-write serving paths without removing retained rows.

create or replace function public.offering_assert_install_payload(
  p_definition_id text,
  p_definition_version text,
  p_business_id uuid,
  p_configuration jsonb,
  p_native_resources jsonb,
  p_responsibility jsonb,
  p_accepted_scope text[],
  p_surface_ids text[]
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  application_id uuid;
  agency_id uuid;
  inquiry_workspace_id uuid;
  website_binding_id uuid;
begin
  if p_responsibility->>'kind'='provider_requested' then
    if p_responsibility->>'providerKind' is distinct from 'agency' then raise exception 'offering_responsibility_invalid'; end if;
    perform 1 from public.provider_seats where customer_workspace_id=p_business_id
      and agency_workspace_id=(p_responsibility->>'agencyWorkspaceId')::uuid and status='active' for share;
    if not found then raise exception 'offering_responsibility_invalid'; end if;
  end if;
  if p_definition_version is distinct from '1.0.0'
    or p_definition_id not in ('private_staff_requests', 'customer_inquiry_intake', 'managed_website_changes') then
    raise exception 'offering_definition_not_installable';
  end if;

  if p_definition_id = 'customer_inquiry_intake' then
    if p_configuration is distinct from '{}'::jsonb then
      raise exception 'offering_configuration_invalid';
    end if;
    if jsonb_typeof(p_native_resources) is distinct from 'array'
      or jsonb_array_length(p_native_resources) <> 1
      or p_native_resources->0->>'kind' <> 'inquiry_workspace'
      or (p_native_resources->0) - array['kind', 'id']::text[] <> '{}'::jsonb then
      raise exception 'offering_native_resources_invalid';
    end if;
    begin
      inquiry_workspace_id := (p_native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1
      from public.inquiry_workspaces inquiry
      where inquiry.id = inquiry_workspace_id
        and inquiry.business_id = p_business_id::text
      for share;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;

    if p_accepted_scope is null
      or not (p_accepted_scope @> array['handle_inquiries']::text[])
      or not (p_accepted_scope <@ array['handle_inquiries']::text[])
      or cardinality(p_accepted_scope) <> 1 then
      raise exception 'offering_scope_invalid';
    end if;
    if p_surface_ids is null
      or not (p_surface_ids @> array['inquiry_workspace']::text[])
      or not (p_surface_ids <@ array['inquiry_workspace']::text[])
      or cardinality(p_surface_ids) <> 1 then
      raise exception 'offering_surfaces_invalid';
    end if;
  elsif p_definition_id = 'managed_website_changes' then
    perform public.offering_assert_metadata(
      p_configuration,
      p_responsibility,
      array['submit_requests', 'review_requests'],
      array['staff_app', 'business_workspace']
    );
    if p_configuration is distinct from '{}'::jsonb
      or p_accepted_scope is distinct from array['request_changes']::text[]
      or p_surface_ids is distinct from array['managed_website']::text[]
      or jsonb_typeof(p_native_resources) is distinct from 'array'
      or jsonb_array_length(p_native_resources) <> 1
      or p_native_resources->0->>'kind' <> 'managed_website'
      or (p_native_resources->0) - array['kind', 'id']::text[] <> '{}'::jsonb then
      raise exception 'offering_native_resources_invalid';
    end if;
    begin
      website_binding_id := (p_native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1
      from public.offering_website_bindings binding
      join public.tenants tenant
        on tenant.stable_id = binding.tenant_stable_id and tenant.active is true
      where binding.id = website_binding_id
        and binding.business_workspace_id = p_business_id
        and binding.status = 'active'
      for share of binding, tenant;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;
  else
    if jsonb_typeof(p_configuration) is distinct from 'object' or char_length(p_configuration::text) > 4000 then
      raise exception 'offering_configuration_invalid';
    end if;
    if p_configuration - array['displayName', 'instructions']::text[] <> '{}'::jsonb
      or (p_configuration ? 'displayName' and (
        jsonb_typeof(p_configuration->'displayName') <> 'string'
        or char_length(btrim(p_configuration->>'displayName')) not between 1 and 80
      ))
      or (p_configuration ? 'instructions' and (
        jsonb_typeof(p_configuration->'instructions') <> 'string'
        or char_length(btrim(p_configuration->>'instructions')) not between 1 and 500
      )) then
      raise exception 'offering_configuration_invalid';
    end if;
    if jsonb_typeof(p_native_resources) is distinct from 'array'
      or jsonb_array_length(p_native_resources) <> 1
      or p_native_resources->0->>'kind' <> 'application'
      or (p_native_resources->0) - array['kind', 'id']::text[] <> '{}'::jsonb then
      raise exception 'offering_native_resources_invalid';
    end if;
    begin
      application_id := (p_native_resources->0->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'offering_native_resources_invalid';
    end;
    perform 1
      from public.saved_product_work work
      join public.application_states app
        on app.work_id = work.id and app.workspace_id = work.workspace_id
      where work.id = application_id
        and work.workspace_id = p_business_id
        and work.product_id = 'applications'
        and work.resource_kind = 'application'
        and app.lifecycle_status = 'installed'
        and app.current_release_version is not null
      for share of work, app;
    if not found then raise exception 'offering_native_resource_outside_business'; end if;

    if p_accepted_scope is null
      or not (p_accepted_scope @> array['submit_requests', 'review_requests']::text[])
      or not (p_accepted_scope <@ array['submit_requests', 'review_requests']::text[])
      or cardinality(p_accepted_scope) <> cardinality(array(select distinct unnest(p_accepted_scope))) then
      raise exception 'offering_scope_invalid';
    end if;
    if p_surface_ids is null
      or not (p_surface_ids @> array['staff_app', 'business_workspace']::text[])
      or not (p_surface_ids <@ array['staff_app', 'business_workspace']::text[])
      or cardinality(p_surface_ids) <> cardinality(array(select distinct unnest(p_surface_ids))) then
      raise exception 'offering_surfaces_invalid';
    end if;
  end if;

  if jsonb_typeof(p_responsibility) is distinct from 'object' then raise exception 'offering_responsibility_invalid'; end if;
  if p_responsibility->>'kind' = 'customer_operated' then
    if p_responsibility - array['kind', 'providerName']::text[] <> '{}'::jsonb
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120 then
      raise exception 'offering_responsibility_invalid';
    end if;
  elsif p_responsibility->>'kind' = 'provider_requested' then
    if jsonb_typeof(p_responsibility->'providerKind') is distinct from 'string'
      or p_responsibility->>'providerKind' not in ('strelva', 'agency', 'named_third_party')
      or jsonb_typeof(p_responsibility->'providerName') is distinct from 'string'
      or char_length(btrim(p_responsibility->>'providerName')) not between 1 and 120
      or (p_responsibility ? 'requestNote' and (
        jsonb_typeof(p_responsibility->'requestNote') is distinct from 'string'
        or char_length(btrim(p_responsibility->>'requestNote')) not between 1 and 500
      )) then
      raise exception 'offering_responsibility_invalid';
    end if;
    if p_responsibility->>'providerKind' = 'agency' then
      begin
        agency_id := (p_responsibility->>'agencyWorkspaceId')::uuid;
      exception when invalid_text_representation then
        raise exception 'offering_responsibility_invalid';
      end;
      if p_responsibility - array['kind', 'providerKind', 'providerName', 'agencyWorkspaceId', 'requestNote']::text[] <> '{}'::jsonb
        or agency_id = p_business_id
        or not exists (select 1 from public.workspaces where id = agency_id and kind = 'agency') then
        raise exception 'offering_responsibility_invalid';
      end if;
    elsif p_responsibility - array['kind', 'providerKind', 'providerName', 'requestNote']::text[] <> '{}'::jsonb
      or p_responsibility ? 'agencyWorkspaceId' then
      raise exception 'offering_responsibility_invalid';
    end if;
  else
    raise exception 'offering_responsibility_invalid';
  end if;
end;
$$;

create or replace function public.request_provider_delivery(
  p_user_id uuid,p_verified_email text,p_business_id uuid,p_installation_id uuid,
  p_assignment_id uuid,p_idempotency_key text,p_command_digest text
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare installation public.offering_installations%rowtype; assignment public.operational_assignments%rowtype;
  responsibility public.saved_product_work%rowtype; prior public.offering_provider_deliveries%rowtype; created public.offering_provider_deliveries%rowtype;
  provider_kind text; agency_id uuid;
begin
  perform public.offering_assert_actor(p_business_id,p_user_id,p_verified_email,true);
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then raise exception 'provider_delivery_idempotency_invalid'; end if;
  select * into installation from public.offering_installations where id=p_installation_id and business_workspace_id=p_business_id for share;
  if not found or installation.status<>'active' or installation.responsibility->>'kind' is distinct from 'provider_requested'
    or installation.responsibility->>'providerKind' is distinct from 'agency' then raise exception 'provider_delivery_installation_invalid'; end if;
  provider_kind:=installation.responsibility->>'providerKind';
  if provider_kind='agency' then
    begin agency_id:=(installation.responsibility->>'agencyWorkspaceId')::uuid; exception when invalid_text_representation then raise exception 'provider_delivery_installation_invalid'; end;
  end if;
  select * into assignment from public.operational_assignments where id=p_assignment_id for share;
  if not found or assignment.workspace_id<>p_business_id or assignment.sponsor_id<>p_user_id
    or assignment.status not in ('offered','accepted') or assignment.expires_at<=clock_timestamp() then raise exception 'provider_delivery_assignment_invalid'; end if;
  perform public.service_request_assert_agency_client(p_business_id,agency_id,assignment.assignee_user_id,true,assignment.assignee_email);
  if provider_kind='agency' then
    if assignment.assignee_kind<>'agency' or assignment.assignee_workspace_id<>agency_id
      or not exists(select 1 from public.workspaces where id=agency_id and kind='agency')
      or not exists(select 1 from public.workspace_memberships where workspace_id=agency_id and user_id=assignment.assignee_user_id) then raise exception 'provider_delivery_assignment_invalid'; end if;
  end if;
  select * into responsibility from public.saved_product_work where id=assignment.work_id and workspace_id=p_business_id for share;
  if not found or exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
      where not exists(select 1 from jsonb_array_elements(installation.native_resources) resource where resource->>'id'=step->>'workId'))
    or exists(select 1 from jsonb_array_elements(installation.native_resources) resource
      where not exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step where step->>'workId'=resource->>'id')) then raise exception 'provider_delivery_target_mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-delivery:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into prior from public.offering_provider_deliveries where business_workspace_id=p_business_id and idempotency_key=p_idempotency_key for update;
  if found then
    if prior.command_digest<>p_command_digest then raise exception 'provider_delivery_idempotency_conflict'; end if;
    return query select * from public.offering_provider_deliveries where id=prior.id; return;
  end if;
  insert into public.offering_provider_deliveries(
    business_workspace_id,installation_id,assignment_id,scope,idempotency_key,command_digest,requested_by,expires_at,history
  ) values (
    p_business_id,p_installation_id,p_assignment_id,installation.accepted_scope,p_idempotency_key,p_command_digest,p_user_id,assignment.expires_at,
    jsonb_build_array(jsonb_build_object('kind','requested','actorId',p_user_id,'at',clock_timestamp(),'note',null))
  ) returning * into created;
  return query select * from public.offering_provider_deliveries where id=created.id;
end $$;

create or replace function public.accept_provider_delivery(
  p_user_id uuid,p_verified_email text,p_delivery_id uuid
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.offering_provider_deliveries%rowtype; assignment public.operational_assignments%rowtype;
  installation public.offering_installations%rowtype; responsibility public.saved_product_work%rowtype; provider_kind text; agency_id uuid;
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'provider_delivery_denied'; end if;
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id for update;
  if not found then raise exception 'provider_delivery_not_found'; end if;
  select * into assignment from public.operational_assignments where id=delivery.assignment_id for share;
  if not found or assignment.assignee_user_id<>p_user_id or assignment.assignee_email<>lower(btrim(p_verified_email))
    or assignment.status<>'accepted' or assignment.expires_at<=clock_timestamp() or delivery.status not in ('requested','accepted') then raise exception 'provider_delivery_denied'; end if;
  select * into installation from public.offering_installations where id=delivery.installation_id and business_workspace_id=delivery.business_workspace_id for share;
  if not found or installation.status<>'active' or installation.responsibility->>'kind' is distinct from 'provider_requested'
    or installation.responsibility->>'providerKind' is distinct from 'agency' then raise exception 'provider_delivery_denied'; end if;
  provider_kind:=installation.responsibility->>'providerKind';
  perform public.service_request_assert_agency_client(delivery.business_workspace_id,(installation.responsibility->>'agencyWorkspaceId')::uuid,p_user_id,true,p_verified_email);
  if provider_kind='agency' then
    begin agency_id:=(installation.responsibility->>'agencyWorkspaceId')::uuid; exception when invalid_text_representation then raise exception 'provider_delivery_denied'; end;
    if assignment.assignee_kind<>'agency' or assignment.assignee_workspace_id<>agency_id
      or not exists(select 1 from public.workspaces where id=agency_id and kind='agency')
      or not exists(select 1 from public.workspace_memberships where workspace_id=agency_id and user_id=p_user_id) then raise exception 'provider_delivery_denied'; end if;
  end if;
  select * into responsibility from public.saved_product_work where id=assignment.work_id and workspace_id=delivery.business_workspace_id for share;
  if not found or exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step
      where not exists(select 1 from jsonb_array_elements(installation.native_resources) resource where resource->>'id'=step->>'workId'))
    or exists(select 1 from jsonb_array_elements(installation.native_resources) resource
      where not exists(select 1 from jsonb_array_elements(responsibility.payload->'steps') step where step->>'workId'=resource->>'id')) then raise exception 'provider_delivery_denied'; end if;
  if delivery.status='accepted' then return query select * from public.offering_provider_deliveries where id=p_delivery_id; return; end if;
  return query update public.offering_provider_deliveries item set status='accepted',revision=item.revision+1,accepted_by=p_user_id,accepted_at=clock_timestamp(),
    history=item.history||jsonb_build_array(jsonb_build_object('kind','accepted','actorId',p_user_id,'at',clock_timestamp(),'note',null)) where item.id=p_delivery_id returning item.*;
end $$;

create or replace function public.offer_operational_assignment(
  p_user_id uuid,p_verified_email text,p_work_id uuid,p_assignee_email text,
  p_assignee_kind text,p_expires_at timestamptz,p_idempotency_key text
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.saved_product_work; assignee_id uuid; prior public.operational_assignments;
  blocking public.operational_assignments; frozen_scope jsonb;
begin
  if p_assignee_kind in ('strelva','agency') then raise exception 'operational_assignment_denied'; end if;
  if p_assignee_kind not in ('agency','staff','strelva','agent')
    or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '90 days'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text
    or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
    or existing.payload ? 'budgetId'
    or jsonb_typeof(existing.payload->'steps') is distinct from 'array'
    or jsonb_array_length(existing.payload->'steps') not between 1 and 20
    or exists(select 1 from jsonb_array_elements(existing.payload->'steps') step
      where coalesce(step->>'maximumCents','')<>'0'
        or coalesce(step->>'capabilityVersion','1')<>'1'
        or coalesce(step->>'operation','') not in ('document.edit','tracker.command','investigation.run','schedule.command')
        or (step->>'operation'='tracker.command' and step->'input'->>'kind'='coordinate_records'))
    or exists(select 1 from public.standing_responsibility_jobs where finite_work_id=existing.id)
  then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id=existing.workspace_id and user_id=p_user_id and role='owner' for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  select id into assignee_id from public.users
    where lower(email)=lower(p_assignee_email) and verified_at is not null;
  if assignee_id is null or assignee_id=p_user_id then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id=existing.workspace_id and user_id=assignee_id for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  frozen_scope:=public.operational_assignment_work_scope(existing.payload);
  -- Serialize a sponsor's key even before its first row exists. Different keys
  -- can proceed independently, and the work lock below serializes one job.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_work_id::text||':'||p_idempotency_key,0));
  select * into prior from public.operational_assignments
    where sponsor_id=p_user_id and work_id=p_work_id and offer_key=p_idempotency_key
    for update;
  if prior.id is null then
    select * into blocking from public.operational_assignments
      where work_id=p_work_id and status in ('offered','accepted')
      order by offered_at desc limit 1 for update;
  end if;
  -- Every path that may lock both records takes the assignment first and the
  -- work row second. The work lock also serializes the first offer for a job.
  select * into existing from public.saved_product_work where id=p_work_id for update;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text
    or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
    or existing.payload ? 'budgetId'
    or public.operational_assignment_work_scope(existing.payload) is distinct from frozen_scope
    or not exists(select 1 from public.workspace_memberships
      where workspace_id=existing.workspace_id and user_id=p_user_id and role='owner')
    or not exists(select 1 from public.workspace_memberships
      where workspace_id=existing.workspace_id and user_id=assignee_id)
  then raise exception 'operational_assignment_denied'; end if;
  -- A concurrent first offer may have committed while this transaction waited
  -- for the work row. Re-read both identities before deciding or inserting.
  select * into prior from public.operational_assignments
    where sponsor_id=p_user_id and work_id=p_work_id and offer_key=p_idempotency_key
    for update;
  if prior.id is null then
    select * into blocking from public.operational_assignments
      where work_id=p_work_id and status in ('offered','accepted')
      order by offered_at desc limit 1 for update;
  end if;
  if prior.id is not null then
    if prior.workspace_id<>existing.workspace_id or prior.work_id<>existing.id
      or prior.assignee_user_id<>assignee_id
      or prior.assignee_email<>lower(p_assignee_email) or prior.assignee_kind<>p_assignee_kind
      or prior.expires_at<>p_expires_at or prior.work_scope is distinct from frozen_scope
    then raise exception 'operational_assignment_conflict'; end if;
    return query select * from public.operational_assignments where id=prior.id;
    return;
  end if;
  if blocking.id is not null and blocking.expires_at<=clock_timestamp() then
    update public.operational_assignments set status='expired' where id=blocking.id;
  elsif blocking.id is not null then
    raise exception 'operational_assignment_conflict';
  end if;
  return query insert into public.operational_assignments(
    workspace_id,work_id,sponsor_id,sponsor_email,assignee_user_id,assignee_email,
    assignee_kind,offer_key,work_scope,expires_at
  ) values(
    existing.workspace_id,existing.id,p_user_id,lower(p_verified_email),assignee_id,
    lower(p_assignee_email),p_assignee_kind,p_idempotency_key,frozen_scope,p_expires_at
  ) returning *;
end $$;

create or replace function public.accept_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments; existing public.saved_product_work;
begin
  if exists(select 1 from public.operational_assignments where id=p_assignment_id and assignee_kind='strelva') then raise exception 'operational_assignment_denied'; end if;
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into item from public.operational_assignments where id=p_assignment_id for update;
  if item.assignee_kind='agency' and item.assignee_workspace_id is not null then perform public.service_request_assert_agency_client(item.workspace_id,item.assignee_workspace_id,p_user_id,true,p_verified_email); end if;
  if not found or item.assignee_user_id<>p_user_id or item.assignee_email<>lower(p_verified_email)
    or item.status not in ('offered','accepted') or item.expires_at<=clock_timestamp()
  then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=item.work_id and workspace_id=item.workspace_id for share;
  if not found or existing.payload->>'ownerId' is distinct from item.sponsor_id::text
    or existing.payload->>'approvedBy' is distinct from item.sponsor_id::text
    or public.operational_assignment_work_scope(existing.payload) is distinct from item.work_scope
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
  then raise exception 'operational_assignment_conflict'; end if;
  perform 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner' for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  if item.assignee_kind='agency' then
    if item.assignee_workspace_id is null
      or not exists(select 1 from public.workspaces where id=item.assignee_workspace_id and kind='agency')
      or not exists(select 1 from public.workspace_memberships where workspace_id=item.assignee_workspace_id and user_id=p_user_id) then
      raise exception 'operational_assignment_denied';
    end if;
  elsif not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id) then
    raise exception 'operational_assignment_denied';
  end if;
  if item.status='accepted' then return query select * from public.operational_assignments where id=p_assignment_id; return; end if;
  return query update public.operational_assignments set status='accepted',accepted_at=clock_timestamp()
    where id=p_assignment_id returning *;
end $$;

create or replace function public.checkpoint_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid,p_expected_revision integer,
  p_payload jsonb,p_phase text
) returns setof public.saved_product_work
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments; existing public.saved_product_work; next_event jsonb;
  prior_step jsonb; next_step jsonb; step_index integer; changed_steps integer:=0; running_index integer:=-1; provider_member boolean;
begin
  if exists(select 1 from public.operational_assignments where id=p_assignment_id and assignee_kind='strelva') then raise exception 'operational_assignment_denied'; end if;
  if p_phase not in ('start','outcome')
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into item from public.operational_assignments where id=p_assignment_id for update;
  if item.assignee_kind='agency' and item.assignee_workspace_id is not null then perform public.service_request_assert_agency_client(item.workspace_id,item.assignee_workspace_id,p_user_id,true,p_verified_email); end if;
  if not found or item.assignee_user_id<>p_user_id or item.assignee_email<>lower(p_verified_email)
  then raise exception 'operational_assignment_denied'; end if;
  if item.assignee_kind='agency' then
    select item.assignee_workspace_id is not null
      and exists(select 1 from public.workspaces where id=item.assignee_workspace_id and kind='agency')
      and exists(select 1 from public.workspace_memberships where workspace_id=item.assignee_workspace_id and user_id=p_user_id)
      into provider_member;
  else
    select exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id) into provider_member;
  end if;
  if not provider_member then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=item.work_id and workspace_id=item.workspace_id for update;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or public.operational_assignment_work_scope(existing.payload) is distinct from item.work_scope
  then raise exception 'operational_assignment_conflict'; end if;
  if p_phase='start' and (
    item.status<>'accepted' or item.expires_at<=clock_timestamp()
    or existing.payload->>'ownerId' is distinct from item.sponsor_id::text
    or existing.payload->>'approvedBy' is distinct from item.sponsor_id::text
    or not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner')
  ) then raise exception 'operational_assignment_denied'; end if;
  if p_expected_revision is null or p_expected_revision<0 or existing.payload->>'revision' is distinct from p_expected_revision::text
  then raise exception 'responsibility_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>1048576
    or p_payload->>'version' is distinct from '1'
    or p_payload->>'revision' is distinct from (p_expected_revision+1)::text
    or public.operational_assignment_work_scope(p_payload) is distinct from item.work_scope
    or p_payload->'title' is distinct from existing.payload->'title'
    or p_payload->'intent' is distinct from existing.payload->'intent'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or coalesce(p_payload->>'status','') not in ('running','waiting','ready','needs_attention','completed','cancelled')
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or jsonb_array_length(p_payload->'history')<>jsonb_array_length(existing.payload->'history')+1
    or jsonb_array_length(p_payload->'history')>1000
    or ((p_payload->'history')-(jsonb_array_length(p_payload->'history')-1)) is distinct from existing.payload->'history'
    or jsonb_array_length(p_payload->'steps')<>jsonb_array_length(existing.payload->'steps')
  then raise exception 'operational_assignment_conflict'; end if;
  next_event:=p_payload->'history'->(jsonb_array_length(p_payload->'history')-1);
  if next_event->>'actorId' is distinct from p_user_id::text
    or next_event->>'revision' is distinct from (p_expected_revision+1)::text
    or (p_phase='start' and next_event->>'kind'<>'started')
    or (p_phase='outcome' and next_event->>'kind'<>'outcome')
  then raise exception 'operational_assignment_denied'; end if;
  for step_index in 0..jsonb_array_length(p_payload->'steps')-1 loop
    prior_step:=existing.payload->'steps'->step_index;
    next_step:=p_payload->'steps'->step_index;
    if prior_step is distinct from next_step then changed_steps:=changed_steps+1; running_index:=step_index; end if;
  end loop;
  if changed_steps<>1 then raise exception 'operational_assignment_conflict'; end if;
  prior_step:=existing.payload->'steps'->running_index;
  next_step:=p_payload->'steps'->running_index;
  if p_phase='start' then
    if existing.payload->>'status' not in ('ready','waiting') or p_payload->>'status'<>'running'
      or prior_step->>'status' not in ('pending','waiting') or next_step->>'status'<>'running'
      or (next_step->>'attempt')::integer<>(prior_step->>'attempt')::integer+1
      or coalesce(next_step->>'leaseId','')='' or coalesce(next_step->>'startedAt','')=''
    then raise exception 'operational_assignment_conflict'; end if;
    update public.operational_assignments set active_step_id=next_step->>'id',active_lease_id=next_step->>'leaseId',
      active_attempt=(next_step->>'attempt')::integer,active_actor_id=p_user_id,active_started_at=(next_step->>'startedAt')::timestamptz
      where id=item.id;
  else
    if existing.payload->>'status' not in ('running','paused','cancelled') or prior_step->>'status'<>'running'
      or next_step->>'status' not in ('waiting','completed','accepted','failed','unknown')
      or next_step->>'leaseId' is distinct from prior_step->>'leaseId'
      or next_step->>'attempt' is distinct from prior_step->>'attempt'
      or item.active_step_id is distinct from prior_step->>'id'
      or item.active_lease_id is distinct from prior_step->>'leaseId'
      or item.active_attempt is distinct from (prior_step->>'attempt')::integer
      or item.active_actor_id is distinct from p_user_id
      or coalesce(next_step->>'finishedAt','')=''
    then raise exception 'operational_assignment_conflict'; end if;
    update public.operational_assignments set active_step_id=null,active_lease_id=null,active_attempt=null,active_actor_id=null,active_started_at=null where id=item.id;
  end if;
  return query update public.saved_product_work set payload=p_payload,title=p_payload->>'title',updated_at=clock_timestamp()
    where id=existing.id returning *;
end $$;

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
  if item.provider_kind='strelva' and operation<>'cancel' then raise exception 'service_request_provider_ineligible'; end if;
  is_provider := operation in ('propose','submit','blocker');
  if is_provider then
    perform public.service_request_assert_agency_client(item.business_workspace_id,item.provider_agency_workspace_id,p_user_id,true,p_verified_email);
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

create or replace function public.read_provider_delivery(
  p_user_id uuid,p_verified_email text,p_delivery_id uuid
) returns setof public.offering_provider_deliveries
language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery public.offering_provider_deliveries%rowtype; assignment public.operational_assignments%rowtype; customer_member boolean;
begin
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id;
  if not found then raise exception 'provider_delivery_not_found'; end if;
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'provider_delivery_denied'; end if;
  select exists(select 1 from public.workspace_memberships wm join public.workspaces w on w.id=wm.workspace_id
    where wm.workspace_id=delivery.business_workspace_id and wm.user_id=p_user_id and w.kind='customer') into customer_member;
  if not customer_member then
    select * into assignment from public.operational_assignments where id=delivery.assignment_id;
    if not found or assignment.assignee_user_id<>p_user_id or assignment.assignee_email<>lower(btrim(p_verified_email))
      or assignment.status not in ('offered','accepted') or assignment.expires_at<=clock_timestamp() then raise exception 'provider_delivery_denied'; end if;
    if assignment.assignee_kind='agency' then
      perform public.service_request_assert_agency_client(delivery.business_workspace_id,assignment.assignee_workspace_id,p_user_id,false,p_verified_email);
      if assignment.assignee_workspace_id is null
        or not exists(select 1 from public.workspaces where id=assignment.assignee_workspace_id and kind='agency')
        or not exists(select 1 from public.workspace_memberships where workspace_id=assignment.assignee_workspace_id and user_id=p_user_id) then raise exception 'provider_delivery_denied'; end if;
    elsif assignment.assignee_kind='strelva' then
      raise exception 'provider_delivery_denied';
      if not exists(select 1 from public.super_admins where user_id=p_user_id and revoked_at is null)
        or not exists(select 1 from public.workspace_memberships where workspace_id=delivery.business_workspace_id and user_id=p_user_id) then raise exception 'provider_delivery_denied'; end if;
    else raise exception 'provider_delivery_denied'; end if;
  end if;
  return query select * from public.offering_provider_deliveries where id=p_delivery_id;
end $$;

create function public.read_business_provider_identity(p_user_id uuid,p_verified_email text,p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.business_record_assert_actor(p_business_id,p_user_id,p_verified_email,false);
  return (select jsonb_build_object('agencyWorkspaceId',a.id,'name',a.name)
    from public.workspace_providers p join public.workspaces a on a.id=p.provider_workspace_id and a.kind='agency'
    where p.customer_workspace_id=p_business_id and p.status='active');
end;
$$;
revoke all on function public.read_business_provider_identity(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_business_provider_identity(uuid,text,uuid) to service_role;

create or replace function public.read_service_delivery_permissions(
  p_user_id uuid,p_verified_email text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.service_requests%rowtype; can_manage boolean; can_operate boolean; bindings jsonb;
begin
  select * into item from public.read_service_request(p_user_id,p_verified_email,p_request_id);
  can_manage := exists(select 1 from public.workspace_memberships where workspace_id=item.business_workspace_id and user_id=p_user_id and role in ('owner','admin'));
  can_operate := item.status='requested' and item.accepted_by=p_user_id and item.provider_kind='agency'
    and exists(select 1 from public.provider_seats s join public.agency_client_staff st
      on st.agency_workspace_id=s.agency_workspace_id and st.customer_workspace_id=s.customer_workspace_id
      and st.user_id=p_user_id and st.status='active'
      join public.workspace_memberships m on m.workspace_id=s.agency_workspace_id and m.user_id=p_user_id
      where s.customer_workspace_id=item.business_workspace_id and s.agency_workspace_id=item.provider_agency_workspace_id and s.status='active');
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',t.site_name,'tenantId',t.id) order by t.site_name),'[]'::jsonb) into bindings
    from public.offering_website_bindings b join public.tenants t on t.stable_id=b.tenant_stable_id
    where b.business_workspace_id=item.business_workspace_id and b.status='active' and t.active is not false
    and (can_manage or exists (
      select 1 from public.agency_managed_website_delivery_target(item.delivery_id,b.id) target
      join public.agency_managed_website_draft_grants g on g.managed_website_binding_id=target.managed_website_binding_id
        and g.delivery_id=target.delivery_id and g.operator_user_id=target.operator_user_id
      where target.operator_user_id=p_user_id and g.status='active' and g.expires_at>clock_timestamp()
    ));
  return jsonb_build_object('canManage',can_manage,'canOperate',coalesce(can_operate,false),
    'stopped',public.workspace_exit_completed(item.business_workspace_id),'websiteBindings',bindings);
end;
$$;

-- Readers are lock-free; commands fence current identity and membership.
create or replace function public.service_request_assert_customer(
  p_business_id uuid, p_user_id uuid, p_verified_email text, p_manage boolean
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor_role text;
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
;
  if not found then raise exception 'service_request_access_denied'; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_business_id and wm.user_id = p_user_id and w.kind = 'customer'
;
  if actor_role is null or (p_manage and actor_role not in ('owner', 'admin')) then
    raise exception 'service_request_access_denied';
  end if;
  if p_manage then
    perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
    if not found then raise exception 'service_request_access_denied'; end if;
    perform 1 from public.workspace_memberships where workspace_id=p_business_id and user_id=p_user_id and role in ('owner','admin') for share;
    if not found then raise exception 'service_request_access_denied'; end if;
  end if;
  return actor_role;
end;
$$;

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
      and exists(select 1 from public.provider_seats s join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id and st.customer_workspace_id=s.customer_workspace_id and st.user_id=p_user_id and st.status='active' where s.customer_workspace_id=item.business_workspace_id and s.agency_workspace_id=p_agency_workspace_id and s.status='active')
      and item.status='requested' and item.provider_acceptance='accepted'
    order by case when item.delivery_commitment->>'status' in ('running','changes_requested') then 0 else 1 end,
      (item.delivery_commitment->>'dueAt')::timestamptz nulls last,item.updated_at desc,item.id;
end;
$$;

create or replace function public.link_service_request_delivery(
  p_user_id uuid,p_verified_email text,p_business_id uuid,p_request_id uuid,
  p_installation_id uuid,p_delivery_id uuid,p_expected_revision bigint,
  p_idempotency_key text,p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.service_requests%rowtype; created public.service_requests%rowtype; receipt public.service_request_commands%rowtype;
  installation public.offering_installations%rowtype; delivery public.offering_provider_deliveries%rowtype; assignment public.operational_assignments%rowtype;
  request_scope text[]; provider_kind text; agency_id uuid; request_agency_id uuid;
begin
  perform public.service_request_assert_customer(p_business_id,p_user_id,p_verified_email,true);
  select * into existing from public.service_requests where id=p_request_id and business_workspace_id=p_business_id for update;
  if existing.provider_kind='strelva' then raise exception 'service_request_provider_ineligible'; end if;
  if not found then raise exception 'service_request_not_found'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$' or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then raise exception 'service_request_idempotency_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('service-request:'||p_business_id::text||':'||p_idempotency_key,0));
  select * into receipt from public.service_request_commands where business_workspace_id=p_business_id and idempotency_key=p_idempotency_key for update;
  if found then
    if receipt.command_digest<>p_command_digest then raise exception 'service_request_idempotency_conflict'; end if;
    return query select * from public.service_requests where id=receipt.request_id and business_workspace_id=p_business_id; return;
  end if;
  if p_expected_revision is null or p_expected_revision<>existing.revision then raise exception 'service_request_revision_conflict'; end if;
  if existing.status<>'requested' or existing.provider_acceptance<>'accepted'
    or existing.installation_id is not null or existing.delivery_id is not null then raise exception 'service_request_delivery_not_ready'; end if;
  select * into installation from public.offering_installations where id=p_installation_id and business_workspace_id=p_business_id for share;
  if not found or installation.status<>'active' then raise exception 'service_request_installation_invalid'; end if;
  select * into delivery from public.offering_provider_deliveries where id=p_delivery_id and business_workspace_id=p_business_id
    and installation_id=p_installation_id for share;
  if not found or delivery.status<>'accepted' then raise exception 'service_request_delivery_missing'; end if;
  if cardinality(existing.scope)<>cardinality(installation.accepted_scope)
    or not(existing.scope<@installation.accepted_scope and installation.accepted_scope<@existing.scope)
    or cardinality(existing.scope)<>cardinality(delivery.scope)
    or not(existing.scope<@delivery.scope and delivery.scope<@existing.scope)
    or cardinality(installation.accepted_scope)<>cardinality(delivery.scope)
    or not(installation.accepted_scope<@delivery.scope and delivery.scope<@installation.accepted_scope) then raise exception 'service_request_scope_mismatch'; end if;
  select * into assignment from public.operational_assignments where id=delivery.assignment_id for share;
  if not found or assignment.workspace_id<>p_business_id or assignment.status not in ('accepted','offered') then raise exception 'service_request_delivery_missing'; end if;
  provider_kind:=installation.responsibility->>'providerKind';
  if existing.provider_kind='strelva' then
    if provider_kind is distinct from 'strelva' or assignment.assignee_kind<>'strelva' or assignment.assignee_workspace_id is not null then raise exception 'service_request_provider_mismatch'; end if;
  else
    begin request_agency_id:=existing.provider_agency_workspace_id; agency_id:=(installation.responsibility->>'agencyWorkspaceId')::uuid; exception when invalid_text_representation then raise exception 'service_request_provider_mismatch'; end;
    if provider_kind is distinct from 'agency' or request_agency_id is distinct from agency_id
      or assignment.assignee_kind<>'agency' or assignment.assignee_workspace_id is distinct from request_agency_id then raise exception 'service_request_provider_mismatch'; end if;
  end if;
  update public.service_requests set installation_id=p_installation_id,delivery_id=p_delivery_id,revision=revision+1,updated_at=clock_timestamp(),
    history=history||jsonb_build_array(jsonb_build_object('kind','delivery_linked','actorId',p_user_id::text,'at',clock_timestamp())) where id=existing.id returning * into created;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id) values(p_business_id,p_idempotency_key,p_command_digest,created.id);
  return next created;
end $$;
