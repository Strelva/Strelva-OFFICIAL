-- Agency 1.0: tenant conversion grants the chosen agency through provider
-- seats and named agency staff. Legacy conversions can be re-routed without
-- restoring direct operator membership. Additive; no tables or data backfill.
-- Depends on 20261009151000_provider_seats and the ordered w6 migration set.
begin;
set local lock_timeout = '3s';

create or replace function public.tenant_workspace_link_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Only the tenant FK's own on-delete behavior may touch a link, or a route
  -- RPC may add its first providerRoute correction to a legacy receipt.
  if tg_op = 'UPDATE' and new.tenant_stable_id is null and old.tenant_stable_id is not null
    and (to_jsonb(new) - 'tenant_stable_id') = (to_jsonb(old) - 'tenant_stable_id') then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and current_setting('strelva.tenant_provider_repath_link', true) = old.id::text
    and not (old.receipt ? 'providerRoute') and new.receipt ? 'providerRoute'
    and (new.receipt - 'providerRoute') = old.receipt
    and (to_jsonb(new) - 'receipt') = (to_jsonb(old) - 'receipt') then
    return new;
  end if;
  -- unlink_tenant_from_business removes exactly the link it names, in the
  -- same transaction that records the unlink receipt.
  if tg_op = 'DELETE' and current_setting('strelva.tenant_unlink_link', true) = old.id::text then
    return old;
  end if;
  raise exception 'tenant_workspace_link_immutable';
end;
$$;

create function public.tenant_conversion_provider_route(
  p_customer_workspace_id uuid, p_agency_workspace_id uuid, p_staff_emails jsonb,
  p_operator_id uuid, p_selection_basis text, p_apply boolean, p_repath_only boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_provider public.workspace_providers%rowtype;
  v_seat public.provider_seats%rowtype;
  v_link record;
  v_member record;
  v_staff_ids uuid[] := '{}';
  v_recorded_staff_ids uuid[] := '{}';
  v_staff_input jsonb := '[]'::jsonb;
  v_staff_route jsonb := '[]'::jsonb;
  v_staff_to_add jsonb := '[]'::jsonb;
  v_route jsonb;
  v_existing_route jsonb;
  v_provider_id uuid;
  v_provider_to_end_id uuid;
  v_provider_to_end_workspace_id uuid;
  v_seat_id uuid;
  v_staff_row_id uuid;
  v_provider_source text := 'tenant_conversion';
  v_seat_granted_by_kind text := 'conversion';
  v_provider_created boolean := false;
  v_provider_replaced boolean := false;
  v_staff_created boolean;
  v_provider_exists boolean := false;
  v_seat_exists boolean := false;
  v_seat_status text := 'would_create';
  v_legacy_admin_memberships integer := 0;
  v_legacy_admin_memberships_removed integer := 0;
begin
  if p_customer_workspace_id is null or p_agency_workspace_id is null or p_operator_id is null
    or p_selection_basis is null or p_selection_basis not in ('existing_contract','owner_choice')
    or p_apply is null or p_repath_only is null
    or p_staff_emails is null or jsonb_typeof(p_staff_emails) <> 'array'
    or jsonb_array_length(p_staff_emails) < 1 or jsonb_array_length(p_staff_emails) > 100
    or exists (select 1 from jsonb_array_elements_text(p_staff_emails) as staff(email)
      where btrim(email) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'tenant_conversion_invalid';
  end if;
  if exists (select 1 from (select lower(btrim(staff.email)) email from jsonb_array_elements_text(p_staff_emails) as staff(email)
      group by lower(btrim(staff.email)) having count(*) > 1) duplicate_emails) then
    raise exception 'tenant_conversion_agency_staff_invalid';
  end if;
  perform 1 from public.users where id = p_operator_id and verified_at is not null for key share;
  if not found then raise exception 'tenant_conversion_operator_required'; end if;
  perform 1 from public.workspaces where id = p_customer_workspace_id and kind = 'customer' for update;
  if not found then raise exception 'tenant_conversion_target_invalid'; end if;
  perform 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency' for share;
  if not found or p_customer_workspace_id = p_agency_workspace_id then raise exception 'tenant_conversion_agency_invalid'; end if;
  if public.workspace_exit_completed(p_customer_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;

  select array_agg(m.user_id order by m.user_id),
      jsonb_agg(jsonb_build_object('userId', m.user_id, 'email', m.email) order by m.user_id)
    into v_staff_ids, v_staff_input
    from (
      select u.id user_id, lower(u.email) email
      from jsonb_array_elements_text(p_staff_emails) requested(email)
      join public.users u on lower(u.email) = lower(btrim(requested.email)) and u.verified_at is not null
      join public.workspace_memberships am on am.workspace_id = p_agency_workspace_id and am.user_id = u.id
      group by u.id, u.email
    ) m;
  if coalesce(cardinality(v_staff_ids), 0) <> jsonb_array_length(p_staff_emails) then
    raise exception 'tenant_conversion_agency_staff_invalid';
  end if;

  select l.receipt->'providerRoute' into v_existing_route
    from public.tenant_workspace_links l
    where l.workspace_id = p_customer_workspace_id and l.receipt ? 'providerRoute'
    order by l.linked_at, l.id limit 1;
  if p_repath_only and v_existing_route is not null then
    if v_existing_route->>'agencyWorkspaceId' is distinct from p_agency_workspace_id::text
      or v_existing_route->>'selectionBasis' is distinct from p_selection_basis then
      raise exception 'tenant_conversion_provider_repath_conflict';
    end if;
    select coalesce(array_agg((s->>'userId')::uuid order by (s->>'userId')::uuid), '{}')
      into v_recorded_staff_ids from jsonb_array_elements(coalesce(v_existing_route->'staff','[]'::jsonb)) s;
    if v_recorded_staff_ids is distinct from v_staff_ids then raise exception 'tenant_conversion_provider_repath_conflict'; end if;
    if exists (select 1 from public.tenant_workspace_links l
      where l.workspace_id = p_customer_workspace_id and l.receipt ? 'providerRoute'
        and (l.receipt#>>'{providerRoute,agencyWorkspaceId}' is distinct from p_agency_workspace_id::text
          or l.receipt#>>'{providerRoute,selectionBasis}' is distinct from p_selection_basis)) then
      raise exception 'tenant_conversion_provider_repath_conflict';
    end if;
    select count(*) into v_legacy_admin_memberships
      from public.workspace_memberships m
      where m.workspace_id = p_customer_workspace_id and m.role = 'admin' and m.created_by = m.user_id
        and exists (select 1 from public.tenant_workspace_links l where l.workspace_id = p_customer_workspace_id
          and l.receipt->>'operatorRole' = 'admin' and l.receipt->>'joinedExistingWorkspace' = 'false'
          and l.receipt->>'operatorId' = m.user_id::text);
    if p_apply then
      for v_link in select l.id, l.receipt from public.tenant_workspace_links l
        where l.workspace_id = p_customer_workspace_id and not (l.receipt ? 'providerRoute') for update loop
        perform set_config('strelva.tenant_provider_repath_link', v_link.id::text, true);
        update public.tenant_workspace_links set receipt = receipt || jsonb_build_object('providerRoute', v_existing_route)
          where id = v_link.id;
      end loop;
      perform set_config('strelva.tenant_provider_repath_link', '', true);
      delete from public.workspace_memberships m
        where m.workspace_id = p_customer_workspace_id and m.role = 'admin' and m.created_by = m.user_id
          and exists (select 1 from public.tenant_workspace_links l where l.workspace_id = p_customer_workspace_id
            and l.receipt->>'operatorRole' = 'admin' and l.receipt->>'joinedExistingWorkspace' = 'false'
            and l.receipt->>'operatorId' = m.user_id::text);
      get diagnostics v_legacy_admin_memberships_removed = row_count;
    end if;
    return jsonb_build_object('providerRoute', v_existing_route, 'staffToAdd', '[]'::jsonb,
      'legacyAdminMemberships', v_legacy_admin_memberships,
      'legacyAdminMembershipsRemoved', v_legacy_admin_memberships_removed,
      'alreadyRouted', true, 'applied', p_apply);
  end if;

  select * into v_provider from public.workspace_providers
    where customer_workspace_id = p_customer_workspace_id and status = 'active' for update;
  if found then
    v_provider_exists := true;
    v_provider_id := v_provider.id;
    v_provider_source := v_provider.source;
    if v_provider.provider_workspace_id <> p_agency_workspace_id then
      if not p_repath_only or v_provider.source <> 'tenant_conversion'
        or not exists (select 1 from public.tenant_workspace_links l where l.workspace_id = p_customer_workspace_id
          and l.receipt->>'operatorRole' = 'admin') then
        raise exception 'tenant_conversion_provider_conflict';
      end if;
      -- `tenant_conversion` is the legacy automatic-attribution source. End
      -- that exact row and seat, then install the explicitly selected agency.
      v_provider_replaced := true;
      v_provider_to_end_id := v_provider.id;
      v_provider_to_end_workspace_id := v_provider.provider_workspace_id;
      v_provider_exists := false;
      v_provider_id := null;
      v_provider_source := 'tenant_conversion';
    end if;
  elsif exists (select 1 from public.workspace_providers where customer_workspace_id = p_customer_workspace_id) then
    raise exception 'tenant_conversion_provider_conflict';
  end if;

  select * into v_seat from public.provider_seats
    where customer_workspace_id = p_customer_workspace_id
      and agency_workspace_id = p_agency_workspace_id and status = 'active' for update;
  if found then
    v_seat_exists := true;
    v_seat_id := v_seat.id;
    v_seat_granted_by_kind := v_seat.granted_by_kind;
    v_seat_status := 'active';
    if v_seat.agency_workspace_id <> p_agency_workspace_id then raise exception 'tenant_conversion_provider_conflict'; end if;
  elsif exists (select 1 from public.provider_seats
      where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'ended') then
    raise exception 'tenant_conversion_provider_previously_ended';
  end if;

    select count(*) into v_legacy_admin_memberships
      from public.workspace_memberships m
      where m.workspace_id = p_customer_workspace_id and m.role = 'admin' and m.created_by = m.user_id
      and exists (select 1 from public.tenant_workspace_links l where l.workspace_id = p_customer_workspace_id
        and l.receipt->>'operatorRole' = 'admin' and l.receipt->>'joinedExistingWorkspace' = 'false'
        and l.receipt->>'operatorId' = m.user_id::text);
  select coalesce(jsonb_agg(m.value->>'email' order by m.value->>'userId'), '[]'::jsonb)
    into v_staff_to_add
    from jsonb_array_elements(v_staff_input) as m(value)
    where not exists (select 1 from public.agency_client_staff s
      where s.agency_workspace_id = p_agency_workspace_id and s.customer_workspace_id = p_customer_workspace_id
        and s.user_id = ((m.value)->>'userId')::uuid and s.status = 'active');

  if p_apply then
    if v_provider_replaced then
      update public.workspace_providers set status = 'ended', ended_by = p_operator_id,
          ended_at = clock_timestamp(), end_reason = 'Provider selected during tenant conversion.'
        where id = v_provider_to_end_id and status = 'active';
      if not found then raise exception 'tenant_conversion_provider_conflict'; end if;
    end if;
    if not v_provider_exists then
      insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
        values (p_customer_workspace_id, p_agency_workspace_id, 'tenant_conversion', p_operator_id)
        returning * into v_provider;
      v_provider_id := v_provider.id;
      v_provider_source := v_provider.source;
      v_provider_created := true;
    end if;
    if not v_seat_exists then
      insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
        values (p_customer_workspace_id, p_agency_workspace_id, 'conversion', p_operator_id)
        returning * into v_seat;
      v_seat_id := v_seat.id;
      v_seat_granted_by_kind := v_seat.granted_by_kind;
      v_seat_status := 'active';
    end if;
  else
    v_provider_created := not v_provider_exists;
    if not v_seat_exists then v_seat_granted_by_kind := 'conversion'; end if;
  end if;

  for v_member in select value->>'userId' as user_id, value->>'email' as email from jsonb_array_elements(v_staff_input)
    order by (value->>'userId')::uuid loop
    v_staff_row_id := null;
    v_staff_created := false;
    select s.id into v_staff_row_id from public.agency_client_staff s
      where s.agency_workspace_id = p_agency_workspace_id and s.customer_workspace_id = p_customer_workspace_id
        and s.user_id = v_member.user_id::uuid and s.status = 'active';
    if not found and p_apply then
      insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by)
        values (p_agency_workspace_id, p_customer_workspace_id, v_member.user_id::uuid, p_operator_id)
        returning id into v_staff_row_id;
      v_staff_created := true;
    elsif not found then
      v_staff_created := true;
    end if;
    v_staff_route := v_staff_route || jsonb_build_array(jsonb_build_object(
      'staffId', v_staff_row_id, 'userId', v_member.user_id::uuid, 'email', v_member.email,
      'createdByConversion', v_staff_created));
  end loop;

  v_route := jsonb_build_object('agencyWorkspaceId', p_agency_workspace_id,
    'selectionBasis', p_selection_basis, 'source', v_provider_source,
    'providerId', v_provider_id, 'providerCreatedByConversion', v_provider_created,
    'providerToEndId', v_provider_to_end_id,
    'providerToEndWorkspaceId', v_provider_to_end_workspace_id,
    'seatId', v_seat_id, 'seatGrantedByKind', v_seat_granted_by_kind,
    'staff', v_staff_route, 'routedAt', case when p_apply then clock_timestamp() else null end);

  if p_apply then
    for v_link in select l.id, l.receipt from public.tenant_workspace_links l
      where l.workspace_id = p_customer_workspace_id for update loop
      if v_link.receipt ? 'providerRoute' then
        if v_link.receipt#>>'{providerRoute,agencyWorkspaceId}' is distinct from p_agency_workspace_id::text then
          raise exception 'tenant_conversion_provider_conflict';
        end if;
      else
        perform set_config('strelva.tenant_provider_repath_link', v_link.id::text, true);
        update public.tenant_workspace_links set receipt = receipt || jsonb_build_object('providerRoute', v_route)
          where id = v_link.id;
      end if;
    end loop;
    perform set_config('strelva.tenant_provider_repath_link', '', true);
    delete from public.workspace_memberships m
      where m.workspace_id = p_customer_workspace_id and m.role = 'admin' and m.created_by = m.user_id
        and exists (select 1 from public.tenant_workspace_links l where l.workspace_id = p_customer_workspace_id
          and l.receipt->>'operatorRole' = 'admin' and l.receipt->>'joinedExistingWorkspace' = 'false'
          and l.receipt->>'operatorId' = m.user_id::text);
    get diagnostics v_legacy_admin_memberships_removed = row_count;
  end if;

  return jsonb_build_object('providerRoute', v_route, 'staffToAdd', v_staff_to_add,
    'legacyAdminMemberships', v_legacy_admin_memberships,
    'legacyAdminMembershipsRemoved', v_legacy_admin_memberships_removed,
    'alreadyRouted', false, 'applied', p_apply);
end;
$$;

-- A conversion operator keeps the existing owner-invite workflow through the
-- conversion link. The operator receives no customer workspace membership.
create or replace function public.operator_owner_invitation_assert(p_operator_email text, p_workspace_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid;
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  if p_workspace_id is null then raise exception 'operator_owner_invitation_operator_required'; end if;
  perform 1 from public.tenant_workspace_links l
    join public.workspaces w on w.id = l.workspace_id and w.kind = 'customer'
    where l.workspace_id = p_workspace_id for share of l, w;
  if not found then raise exception 'operator_owner_invitation_not_converted'; end if;
  perform 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = operator_id and m.role = 'admin' for share of m;
  if not found then
    perform 1 from public.tenant_workspace_links l
      where l.workspace_id = p_workspace_id and l.linked_by = operator_id for share of l;
    if not found then raise exception 'operator_owner_invitation_operator_required'; end if;
  end if;
  return operator_id;
end;
$$;

-- Recheck the operator's super-admin standing and lock either their surviving
-- admin membership or the conversion link that sponsored the owner invite.
create or replace function public.accept_workspace_invitation(
  p_token_hash text,
  p_actor_id uuid,
  p_verified_email text
) returns table(
  invitation_id uuid,
  workspace_id uuid,
  workspace_name text,
  invited_role text,
  applied_role text,
  invitation_status text,
  already_accepted boolean
) language plpgsql security definer set search_path=public as $$
declare
  invitation public.workspace_invitations%rowtype;
  workspace_row public.workspaces%rowtype;
  normalized_email text := lower(btrim(coalesce(p_verified_email,'')));
  existing_role text;
  final_role text;
begin
  perform 1 from public.users where id=p_actor_id and lower(email)=normalized_email
    and verified_at is not null for share;
  if not found then raise exception 'workspace_invitation_identity_required'; end if;
  select * into invitation from public.workspace_invitations where token_hash=p_token_hash for update;
  if not found then raise exception 'workspace_invitation_not_found'; end if;
  if invitation.recipient_email<>normalized_email then raise exception 'workspace_invitation_recipient_mismatch'; end if;
  select * into workspace_row from public.workspaces where id=invitation.workspace_id for share;
  if not found or workspace_row.kind not in ('agency','customer') then raise exception 'workspace_invitation_workspace_invalid'; end if;

  -- A pending link is authority offered by its sponsor, not a durable grant.
  -- Recheck and lock that authority immediately before the first membership
  -- write so a removed, demoted, or unverified sponsor cannot grant access.
  if invitation.issued_by_kind='operator' then
    perform 1
      from public.workspace_memberships sponsor_membership
      join public.users sponsor on sponsor.id=invitation.created_by
      join public.super_admins sa on sa.user_id=sponsor.id and sa.revoked_at is null
      where sponsor_membership.workspace_id=invitation.workspace_id
        and sponsor_membership.user_id=invitation.created_by
        and sponsor_membership.role='admin'
        and sponsor.verified_at is not null
      for share of sponsor_membership,sponsor;
    if not found then
      perform 1
        from public.tenant_workspace_links sponsored_link
        join public.users sponsor on sponsor.id=invitation.created_by
        join public.super_admins sa on sa.user_id=sponsor.id and sa.revoked_at is null
        where sponsored_link.workspace_id=invitation.workspace_id
          and sponsored_link.linked_by=invitation.created_by
          and sponsor.verified_at is not null
        for share of sponsored_link,sponsor;
    end if;
  else
    perform 1
      from public.workspace_memberships sponsor_membership
      join public.users sponsor on sponsor.id=invitation.created_by
      where sponsor_membership.workspace_id=invitation.workspace_id
        and sponsor_membership.user_id=invitation.created_by
        and (sponsor_membership.role='owner' or (sponsor_membership.role='admin'
          and workspace_row.kind='agency' and invitation.role in ('admin','member')))
        and sponsor.verified_at is not null
      for share of sponsor_membership,sponsor;
  end if;
  if not found and invitation.status='pending' and invitation.expires_at>clock_timestamp() then
    raise exception 'workspace_invitation_sponsor_invalid';
  end if;
  if invitation.issued_by_kind='operator' and invitation.status='pending' and invitation.expires_at>clock_timestamp()
    and exists(select 1 from public.workspace_memberships other
      where other.workspace_id=invitation.workspace_id and other.role='owner' and other.user_id<>p_actor_id) then
    raise exception 'operator_owner_invitation_owner_exists';
  end if;

  select membership.role into existing_role from public.workspace_memberships membership
    where membership.workspace_id=invitation.workspace_id and membership.user_id=p_actor_id for update;
  final_role := coalesce(existing_role,invitation.role);
  if existing_role is not null and
    (case existing_role when 'owner' then 3 when 'admin' then 2 else 1 end)
      < (case invitation.role when 'owner' then 3 when 'admin' then 2 else 1 end) then
    final_role := invitation.role;
  end if;

  if invitation.status='accepted' then
    if invitation.accepted_by<>p_actor_id then raise exception 'workspace_invitation_recipient_mismatch'; end if;
    if existing_role is null then raise exception 'workspace_invitation_access_removed'; end if;
    return query select invitation.id,invitation.workspace_id,workspace_row.name,
      invitation.role,existing_role,'accepted'::text,true;
    return;
  end if;
  if invitation.status='revoked' then
    return query select invitation.id,invitation.workspace_id,workspace_row.name,
      invitation.role,final_role,'revoked'::text,false;
    return;
  end if;
  if invitation.status='expired' or invitation.expires_at<=clock_timestamp() then
    if invitation.status='pending' then
      update public.workspace_invitations set status='expired' where id=invitation.id;
    end if;
    return query select invitation.id,invitation.workspace_id,workspace_row.name,
      invitation.role,final_role,'expired'::text,false;
    return;
  end if;

  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values(invitation.workspace_id,p_actor_id,final_role,invitation.created_by)
    on conflict on constraint workspace_memberships_pkey do update set role=
      case
        when (case public.workspace_memberships.role when 'owner' then 3 when 'admin' then 2 else 1 end)
          >= (case excluded.role when 'owner' then 3 when 'admin' then 2 else 1 end)
          then public.workspace_memberships.role
        else excluded.role
      end
    returning role into final_role;
  if final_role='owner' and workspace_row.kind='customer' then
    insert into public.memberships(user_id,tenant_id,role,tenant_stable_id)
      select p_actor_id,t.id,'owner',t.stable_id
        from public.tenant_workspace_links l
        join public.tenants t on t.stable_id=l.tenant_stable_id
        where l.workspace_id=invitation.workspace_id
        order by l.linked_at,l.id
      on conflict (user_id,tenant_id) do update set role='owner';
  end if;
  update public.workspace_invitations set status='accepted',accepted_by=p_actor_id,
    accepted_at=clock_timestamp() where id=invitation.id;
  return query select invitation.id,invitation.workspace_id,workspace_row.name,
    invitation.role,final_role,'accepted'::text,false;
end;
$$;

create function public.repath_converted_tenant_provider(
  p_operator_email text, p_tenant_id text, p_agency_workspace_id uuid, p_staff_emails jsonb,
  p_selection_basis text, p_apply boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_operator_id uuid;
  v_tenant record;
  v_link public.tenant_workspace_links%rowtype;
  v_result jsonb;
begin
  if p_apply is null then raise exception 'tenant_conversion_invalid'; end if;
  v_operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select id, stable_id into v_tenant from public.tenants where id = p_tenant_id for share;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tenant-conversion:' || v_tenant.stable_id::text, 0));
  select * into v_link from public.tenant_workspace_links where tenant_stable_id = v_tenant.stable_id for update;
  if not found then raise exception 'tenant_conversion_not_linked'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_link.workspace_id::text, 7415));
  v_result := public.tenant_conversion_provider_route(v_link.workspace_id, p_agency_workspace_id,
    p_staff_emails, v_operator_id, p_selection_basis, p_apply, true);
  return v_result || jsonb_build_object('tenantId', v_tenant.id, 'workspaceId', v_link.workspace_id);
end;
$$;

create or replace function public.tenant_unlink_plan(p_link_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  link public.tenant_workspace_links%rowtype;
  import_rev public.business_record_revisions%rowtype;
  ws public.workspaces%rowtype;
  change jsonb;
  current_state jsonb;
  before_state jsonb;
  after_state jsonb;
  action text;
  actions jsonb := '[]'::jsonb;
  kept jsonb := '[]'::jsonb;
  removing integer := 0;
  restoring integer := 0;
  keeping integer := 0;
  reverted integer := 0;
  remaining bigint;
  reasons text[] := '{}';
  fk record;
  in_use boolean;
  leads bigint := 0;
  adopted bigint := 0;
begin
  select * into link from public.tenant_workspace_links where id = p_link_id;
  if not found then raise exception 'tenant_unlink_not_linked'; end if;
  select * into ws from public.workspaces where id = link.workspace_id;
  select * into import_rev from public.business_record_revisions
    where workspace_id = link.workspace_id and sequence = (link.receipt->>'sequence')::bigint and source = 'tenant_import';
  if not found then raise exception 'tenant_unlink_import_missing'; end if;

  -- One revision may touch an entity more than once (a contact created and
  -- then merged by a later lead), so compare against its net effect: the
  -- first "before" and the last "after".
  for change in
    select jsonb_build_object('entity', x.entity, 'id', x.id,
        'before', (array_agg(t.value->'before' order by t.n))[1],
        'after', (array_agg(t.value->'after' order by t.n desc))[1])
      from jsonb_array_elements(import_rev.changes) with ordinality t(value, n)
      cross join lateral (select t.value->>'entity' as entity, t.value->>'id' as id) x
      group by x.entity, x.id
      order by min(t.n) desc
  loop
    current_state := public.business_record_entity_state(link.workspace_id, change->>'entity', change->>'id');
    before_state := nullif(change->'before', 'null'::jsonb);
    after_state := nullif(change->'after', 'null'::jsonb);
    if before_state is not distinct from after_state then continue; end if;
    action := case
      when current_state is not distinct from before_state then 'already_reverted'
      when current_state is not distinct from after_state then case when before_state is null then 'remove' else 'restore' end
      else 'keep' end;
    case action
      when 'remove' then removing := removing + 1;
      when 'restore' then restoring := restoring + 1;
      when 'keep' then
        keeping := keeping + 1;
        if jsonb_array_length(kept) < 200 then
          kept := kept || jsonb_build_array(jsonb_build_object('entity', change->>'entity', 'id', change->>'id',
            'reason', case when current_state is null then 'deleted_after_import' else 'changed_after_import' end));
        end if;
      else reverted := reverted + 1;
    end case;
    if action in ('remove','restore') then
      actions := actions || jsonb_build_array(jsonb_build_object('entity', change->>'entity', 'id', change->>'id',
        'action', action, 'restoreTo', coalesce(before_state, 'null'::jsonb)));
    end if;
  end loop;

  if coalesce((link.receipt->>'joinedExistingWorkspace')::boolean, true) then
    reasons := array_append(reasons, 'joined_existing_workspace');
  end if;
  if ws.created_by is distinct from link.linked_by then reasons := array_append(reasons, 'workspace_not_created_by_conversion'); end if;
  if exists (select 1 from public.tenant_workspace_links where workspace_id = link.workspace_id and id <> link.id) then
    reasons := array_append(reasons, 'other_sites_linked');
  end if;
  if exists (select 1 from public.workspace_memberships m where m.workspace_id = link.workspace_id
      and not (m.user_id = link.linked_by and m.created_by = link.linked_by and m.role = 'admin'
        and exists (select 1 from public.tenant_workspace_links legacy_link
          where legacy_link.workspace_id = link.workspace_id and legacy_link.receipt->>'operatorRole' = 'admin'
            and legacy_link.receipt->>'joinedExistingWorkspace' = 'false'
            and legacy_link.receipt->>'operatorId' = m.user_id::text))) then
    reasons := array_append(reasons, 'other_members');
  end if;
  remaining := (select count(*) from public.business_record_facts where workspace_id = link.workspace_id)
    + (select count(*) from public.business_services where workspace_id = link.workspace_id)
    + (select count(*) from public.business_people where workspace_id = link.workspace_id)
    + (select count(*) from public.business_contacts where workspace_id = link.workspace_id)
    - removing;
  if remaining > 0 then reasons := array_append(reasons, 'record_has_other_data'); end if;
  if exists (select 1 from public.business_record_revisions where workspace_id = link.workspace_id
      and sequence <> import_rev.sequence and undo_of_sequence is distinct from import_rev.sequence) then
    reasons := array_append(reasons, 'record_history_after_import');
  end if;
  -- Every other table that points at the workspace counts as use. New tables
  -- are covered without changing this function.
  for fk in
    select c.conrelid::regclass as rel, a.attname as col
      from pg_constraint c
      cross join lateral unnest(c.conkey, c.confkey) as k(local_col, ref_col)
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = k.ref_col and ra.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.local_col
      where c.contype = 'f' and c.confrelid = 'public.workspaces'::regclass
        and c.conrelid not in ('public.workspace_memberships'::regclass, 'public.business_records'::regclass,
          'public.tenant_workspace_links'::regclass, 'public.provider_seats'::regclass,
          'public.agency_client_staff'::regclass, 'public.workspace_providers'::regclass)
        and c.conrelid is distinct from to_regclass('public.tenant_leads')
      order by 1, 2
  loop
    execute format('select exists (select 1 from %s where %I = $1)', fk.rel, fk.col) into in_use using link.workspace_id;
    if in_use then reasons := array_append(reasons, ('workspace_in_use:' || fk.rel::text)); end if;
  end loop;
  -- Conversion-created provider state is reversible with the conversion.
  -- Owner-selected or operator-created state, and later agency staff rows,
  -- keep the workspace in place.
  if exists (select 1 from public.workspace_providers p where p.customer_workspace_id = link.workspace_id
      and p.source <> 'tenant_conversion') then
    reasons := array_append(reasons, 'workspace_in_use:public.workspace_providers');
  end if;
  if exists (select 1 from public.provider_seats s where s.customer_workspace_id = link.workspace_id
      and s.granted_by_kind <> 'conversion') then
    reasons := array_append(reasons, 'workspace_in_use:public.provider_seats');
  end if;
  if exists (select 1 from public.agency_client_staff st where st.customer_workspace_id = link.workspace_id
      and not exists (select 1 from public.tenant_workspace_links l
        cross join lateral jsonb_array_elements(coalesce(l.receipt#>'{providerRoute,staff}','[]'::jsonb)) rs
        where l.workspace_id = link.workspace_id and rs->>'staffId' = st.id::text and rs->>'createdByConversion' = 'true')
      and not exists (select 1 from public.tenant_workspace_unlinks u
        cross join lateral jsonb_array_elements(coalesce(u.receipt#>'{conversionReceipt,providerRoute,staff}','[]'::jsonb)) rs
        where u.workspace_id = link.workspace_id and rs->>'staffId' = st.id::text and rs->>'createdByConversion' = 'true')) then
    reasons := array_append(reasons, 'workspace_in_use:public.agency_client_staff');
  end if;

  -- Preserve the existing Systems-aware unlink behavior: a System created only by
  -- conversion adoption is migration machinery, but any independently revised
  -- System keeps the customer workspace in place.
  if 'workspace_in_use:systems' = any(reasons)
      and not exists (select 1 from public.systems s where s.business_workspace_id = link.workspace_id
        and (s.command_digest <> encode(sha256(convert_to('adopt:' || s.id::text, 'UTF8')), 'hex')
          or exists (select 1 from public.system_revisions r where r.system_id = s.id and r.number > 1))) then
    reasons := array_remove(reasons, 'workspace_in_use:systems');
  end if;

  if link.tenant_stable_id is not null and to_regclass('public.tenant_leads') is not null then
    execute 'select count(*) from public.tenant_leads where tenant_stable_id = $1 and workspace_id = $2'
      into leads using link.tenant_stable_id, link.workspace_id;
  end if;
  if link.tenant_stable_id is not null and to_regclass('public.systems') is not null then
    execute $q$select count(*) from public.systems where business_workspace_id = $1 and origin_kind = 'tenant' and origin_ref = $2$q$
      into adopted using link.workspace_id, link.tenant_stable_id::text;
  end if;

  return jsonb_build_object(
    'linkId', link.id,
    'tenantStableId', link.tenant_stable_id,
    'workspaceId', link.workspace_id,
    'workspaceName', ws.name,
    'linkedAt', link.linked_at,
    'importSequence', import_rev.sequence,
    'deleteWorkspace', cardinality(reasons) = 0,
    'workspaceKeptBecause', to_jsonb(reasons),
    'entities', jsonb_build_object('removed', removing, 'restored', restoring, 'kept', keeping, 'alreadyReverted', reverted),
    'kept', kept,
    'leadsDetached', leads,
    'systemsAdoptedFromTenant', adopted,
    'actions', actions);
end;
$$;

create or replace function public.preview_tenant_unlink(p_operator_email text, p_tenant_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid; tenant_row record; link public.tenant_workspace_links%rowtype; last_unlink jsonb;
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id into tenant_row from public.tenants t where t.id = p_tenant_id;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  select u.receipt into last_unlink from public.tenant_workspace_unlinks u
    where u.tenant_stable_id = tenant_row.stable_id order by u.unlinked_at desc, u.id desc limit 1;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if not found then
    return jsonb_build_object('tenantId', tenant_row.id, 'tenantStableId', tenant_row.stable_id, 'plan', null, 'lastUnlink', last_unlink);
  end if;
  return jsonb_build_object('tenantId', tenant_row.id, 'tenantStableId', tenant_row.stable_id,
    'plan', public.tenant_unlink_plan(link.id) - 'actions', 'lastUnlink', last_unlink);
end;
$$;

create or replace function public.unlink_tenant_from_business(
  p_operator_email text, p_tenant_id text, p_workspace_id uuid, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  tenant_row record;
  link public.tenant_workspace_links%rowtype;
  prior public.tenant_workspace_unlinks%rowtype;
  rec public.business_records%rowtype;
  plan jsonb;
  item jsonb;
  before_state jsonb;
  after_state jsonb;
  changes jsonb := '[]'::jsonb;
  leads bigint := 0;
  deleted boolean;
  ended_count bigint := 0;
  profile_changed boolean;
  new_sequence bigint;
  new_revision bigint;
  receipt jsonb;
  provider_link_ended boolean := false;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' or p_workspace_id is null then
    raise exception 'tenant_unlink_invalid';
  end if;
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id into tenant_row from public.tenants t where t.id = p_tenant_id for share;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tenant-conversion:' || tenant_row.stable_id::text, 0));

  select * into prior from public.tenant_workspace_unlinks where command_id = p_command_id;
  if found then
    if prior.command_digest <> p_command_digest or prior.tenant_stable_id <> tenant_row.stable_id then
      raise exception 'tenant_unlink_idempotency_conflict';
    end if;
    return prior.receipt || jsonb_build_object('replayed', true, 'alreadyUnlinked', true);
  end if;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if not found then
    select * into prior from public.tenant_workspace_unlinks
      where tenant_stable_id = tenant_row.stable_id and workspace_id = p_workspace_id
      order by unlinked_at desc, id desc limit 1;
    if found then return prior.receipt || jsonb_build_object('replayed', true, 'alreadyUnlinked', true); end if;
    raise exception 'tenant_unlink_not_linked';
  end if;
  if link.workspace_id <> p_workspace_id then raise exception 'tenant_unlink_workspace_mismatch'; end if;

  perform pg_advisory_xact_lock(hashtextextended(link.workspace_id::text, 7415));
  perform 1 from public.workspaces where id = link.workspace_id for update;
  select * into link from public.tenant_workspace_links where id = link.id for update;

  plan := public.tenant_unlink_plan(link.id);
  deleted := (plan->>'deleteWorkspace')::boolean;
  begin
    for item in select value from jsonb_array_elements(plan->'actions') loop
      before_state := public.business_record_entity_state(link.workspace_id, item->>'entity', item->>'id');
      after_state := nullif(item->'restoreTo', 'null'::jsonb);
      perform public.business_record_entity_write(link.workspace_id, item->>'entity', item->>'id', after_state, operator_id);
      after_state := public.business_record_entity_state(link.workspace_id, item->>'entity', item->>'id');
      changes := changes || jsonb_build_array(jsonb_build_object('entity', item->>'entity', 'id', item->>'id',
        'before', coalesce(before_state, 'null'::jsonb), 'after', coalesce(after_state, 'null'::jsonb)));
    end loop;
  exception when unique_violation or check_violation or foreign_key_violation then
    raise exception 'tenant_unlink_conflict';
  end;

  if link.tenant_stable_id is not null and to_regclass('public.tenant_leads') is not null then
    execute 'update public.tenant_leads set workspace_id = null where tenant_stable_id = $1 and workspace_id = $2'
      using link.tenant_stable_id, link.workspace_id;
    get diagnostics leads = row_count;
  end if;

  -- Older conversions wrote the operator as a direct workspace admin. Remove
  -- only rows whose receipt records that exact conversion-created membership.
  delete from public.workspace_memberships m
    where m.workspace_id = link.workspace_id and m.role = 'admin' and m.created_by = m.user_id
      and exists (select 1 from public.tenant_workspace_links l where l.workspace_id = link.workspace_id
        and l.receipt->>'operatorRole' = 'admin' and l.receipt->>'joinedExistingWorkspace' = 'false'
        and l.receipt->>'operatorId' = m.user_id::text);

  perform set_config('strelva.tenant_unlink_link', link.id::text, true);
  delete from public.tenant_workspace_links where id = link.id;
  perform set_config('strelva.tenant_unlink_link', '', true);

  if not exists (select 1 from public.tenant_workspace_links where workspace_id = link.workspace_id) then
    update public.workspace_providers set status = 'ended', ended_by = operator_id, ended_at = clock_timestamp(),
        end_reason = 'The last tenant conversion link was removed.'
      where customer_workspace_id = link.workspace_id and source = 'tenant_conversion' and status = 'active';
    get diagnostics ended_count = row_count;
    provider_link_ended := ended_count > 0;
  end if;

  if deleted then
    delete from public.workspaces where id = link.workspace_id;
  elsif jsonb_array_length(changes) > 0 then
    -- The kept business records the unlink as one history row.
    select * into rec from public.business_records where workspace_id = link.workspace_id for update;
    profile_changed := exists (select 1 from jsonb_array_elements(changes) c where c->>'entity' in ('fact','service','person'));
    new_sequence := rec.last_sequence + 1;
    new_revision := rec.revision + case when profile_changed then 1 else 0 end;
    insert into public.business_record_revisions(workspace_id, sequence, record_revision, actor_id, actor_kind, source,
        command_id, command_digest, undo_of_sequence, changes, result)
      values (link.workspace_id, new_sequence, new_revision, operator_id, 'operator', 'tenant_import',
        p_command_id, p_command_digest, null, changes,
        jsonb_build_object('workspaceId', link.workspace_id, 'sequence', new_sequence, 'revision', new_revision,
          'changeCount', jsonb_array_length(changes), 'undoOf', null,
          'contacts', jsonb_build_object('created', 0, 'merged', 0, 'unchanged', 0), 'replayed', false,
          'unlinkOf', jsonb_build_object('linkId', link.id, 'importSequence', (plan->>'importSequence')::bigint)));
    update public.business_records set revision = new_revision, last_sequence = new_sequence,
      updated_by = operator_id, updated_at = clock_timestamp() where workspace_id = link.workspace_id;
  end if;

  receipt := jsonb_build_object(
    'kind', 'tenant_unlink',
    'version', 1,
    'tenantId', tenant_row.id,
    'tenantStableId', tenant_row.stable_id,
    'workspaceId', link.workspace_id,
    'workspaceName', plan->'workspaceName',
    'linkId', link.id,
    'linkedAt', link.linked_at,
    'importSequence', plan->'importSequence',
    'operatorId', operator_id,
    'workspaceDeleted', deleted,
    'providerLinkEnded', provider_link_ended,
    'workspaceKeptBecause', plan->'workspaceKeptBecause',
    'entities', plan->'entities',
    'kept', plan->'kept',
    'leadsDetached', leads,
    'systemsAdoptedFromTenant', plan->'systemsAdoptedFromTenant',
    'sequence', new_sequence,
    'revision', new_revision,
    'conversionReceipt', link.receipt,
    'unlinkedAt', clock_timestamp(),
    'replayed', false,
    'alreadyUnlinked', false);
  insert into public.tenant_workspace_unlinks(link_id, tenant_stable_id, tenant_slug_at_unlink, workspace_id, link_command_id,
      unlinked_by, command_id, command_digest, receipt)
    values (link.id, tenant_row.stable_id, tenant_row.id, link.workspace_id, link.command_id,
      operator_id, p_command_id, p_command_digest, receipt);
  return receipt;
end;
$$;

create or replace function public.convert_tenant_to_business(
  p_operator_email text, p_tenant_id text, p_import jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  tenant_row record;
  link public.tenant_workspace_links%rowtype;
  business_id uuid;
  joined boolean := false;
  patch jsonb;
  applied jsonb;
  receipt jsonb;
  workspace_name text;
  agency_id uuid;
  provider_route jsonb;
  agency_basis text;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or p_import is null or jsonb_typeof(p_import) <> 'object'
    or (p_import - array['tenantId','tenantStableId','workspaceName','targetWorkspaceId','separateBusiness',
      'agencyWorkspaceId','agencyStaffEmails','agencySelectionBasis','billing','account','patch','contacts']::text[]) <> '{}'::jsonb
    or not (p_import ? 'agencyWorkspaceId') or jsonb_typeof(p_import->'agencyWorkspaceId') <> 'string'
    or not (p_import ? 'agencyStaffEmails') or jsonb_typeof(p_import->'agencyStaffEmails') <> 'array'
    or jsonb_array_length(coalesce(p_import->'agencyStaffEmails','[]'::jsonb)) not between 1 and 100
    or not (p_import ? 'agencySelectionBasis') or jsonb_typeof(p_import->'agencySelectionBasis') <> 'string'
    or p_import->>'agencySelectionBasis' not in ('existing_contract','owner_choice')
    -- separateBusiness is present only as true, and never with a join target.
    or (p_import ? 'separateBusiness' and (p_import->'separateBusiness' <> 'true'::jsonb or p_import ? 'targetWorkspaceId'))
    or (p_import ? 'billing' and jsonb_typeof(p_import->'billing') not in ('object','null'))
    or (p_import ? 'account' and jsonb_typeof(p_import->'account') not in ('object','null'))
    or octet_length(coalesce(p_import->'billing', 'null')::text) + octet_length(coalesce(p_import->'account', 'null')::text) > 16000 then
    raise exception 'tenant_conversion_invalid';
  end if;
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  begin agency_id := (p_import->>'agencyWorkspaceId')::uuid;
  exception when invalid_text_representation then raise exception 'tenant_conversion_invalid'; end;
  if agency_id is null then raise exception 'tenant_conversion_invalid'; end if;
  agency_basis := p_import->>'agencySelectionBasis';
  select t.id, t.stable_id, t.site_name, t.active into tenant_row from public.tenants t where t.id = p_tenant_id for share;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  if p_import->>'tenantId' is distinct from tenant_row.id
    or p_import->>'tenantStableId' is distinct from tenant_row.stable_id::text then
    raise exception 'tenant_conversion_identity_mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tenant-conversion:' || tenant_row.stable_id::text, 0));

  select * into link from public.tenant_workspace_links where command_id = p_command_id;
  if found then
    if link.command_digest <> p_command_digest then raise exception 'tenant_conversion_idempotency_conflict'; end if;
    return link.receipt || jsonb_build_object('replayed', true, 'alreadyConverted', true);
  end if;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if found then
    return link.receipt || jsonb_build_object('replayed', true, 'alreadyConverted', true);
  end if;

  patch := coalesce(p_import->'patch', '{}'::jsonb);
  if jsonb_typeof(patch) <> 'object' then raise exception 'tenant_conversion_invalid'; end if;
  if p_import->>'targetWorkspaceId' is not null then
    begin business_id := (p_import->>'targetWorkspaceId')::uuid;
    exception when invalid_text_representation then raise exception 'tenant_conversion_invalid'; end;
    -- Joining requires a customer business that already holds a converted
    -- site and that this operator already operates (through the historical
    -- membership or a conversion receipt they created).
    perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
    perform 1 from public.workspaces w where w.id = business_id and w.kind = 'customer' for update;
    if not found or not exists (select 1 from public.tenant_workspace_links l where l.workspace_id = business_id)
      or not (exists (select 1 from public.workspace_memberships m where m.workspace_id = business_id
          and m.user_id = operator_id and m.role in ('owner','admin'))
        or exists (select 1 from public.tenant_workspace_links l where l.workspace_id = business_id and l.linked_by = operator_id)) then
      raise exception 'tenant_conversion_target_invalid';
    end if;
    if public.workspace_exit_completed(business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
    select name into workspace_name from public.workspaces where id = business_id;
    joined := true;
    patch := jsonb_strip_nulls(jsonb_build_object(
      'facts', (select jsonb_object_agg(e.key, e.value) from jsonb_each(coalesce(patch->'facts', '{}'::jsonb)) e
        where not exists (select 1 from public.business_record_facts f where f.workspace_id = business_id and f.fact_key = e.key)),
      'services', case when exists (select 1 from public.business_services where workspace_id = business_id) then null else patch->'services' end,
      'people', case when exists (select 1 from public.business_people where workspace_id = business_id) then null else patch->'people' end));
  else
    workspace_name := left(btrim(coalesce(p_import->>'workspaceName', tenant_row.site_name)), 120);
    if char_length(workspace_name) < 1 then raise exception 'tenant_conversion_invalid'; end if;
    insert into public.workspaces(kind, name, created_by) values ('customer', workspace_name, operator_id)
      returning id into business_id;
    perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
  end if;

  provider_route := (public.tenant_conversion_provider_route(business_id, agency_id,
    p_import->'agencyStaffEmails', operator_id, agency_basis, true, false))->'providerRoute';

  -- Conversion idempotency lives on the link. When this site was converted
  -- into this same business before and then unlinked, the record's history
  -- already holds the command id, so the new import revision gets its own.
  applied := public.business_record_apply(business_id, operator_id, 'operator', 'tenant_import', patch,
    case when jsonb_array_length(coalesce(p_import->'contacts', '[]'::jsonb)) = 0 then null else p_import->'contacts' end,
    null,
    case when exists (select 1 from public.business_record_revisions where workspace_id = business_id and command_id = p_command_id)
      then gen_random_uuid() else p_command_id end,
    p_command_digest);

  receipt := jsonb_build_object(
    'kind', 'tenant_conversion',
    'version', 1,
    'tenantId', tenant_row.id,
    'tenantStableId', tenant_row.stable_id,
    'tenantActive', tenant_row.active,
    'workspaceId', business_id,
    'workspaceName', workspace_name,
    'joinedExistingWorkspace', joined,
    'separateBusiness', coalesce(p_import->'separateBusiness' = 'true'::jsonb, false),
    'operatorId', operator_id,
    'operatorRole', 'none',
    'operatorMembershipCreated', false,
    'providerRoute', provider_route,
    'billing', coalesce(p_import->'billing', 'null'::jsonb),
    'account', coalesce(p_import->'account', 'null'::jsonb),
    'sequence', applied->'sequence',
    'revision', applied->'revision',
    'changeCount', applied->'changeCount',
    'counts', jsonb_build_object(
      'facts', (select count(*) from public.business_record_facts where workspace_id = business_id),
      'services', (select count(*) from public.business_services where workspace_id = business_id),
      'people', (select count(*) from public.business_people where workspace_id = business_id),
      'contacts', (select count(*) from public.business_contacts where workspace_id = business_id),
      'contactsCreated', applied#>'{contacts,created}',
      'contactsMerged', applied#>'{contacts,merged}',
      'contactsUnchanged', applied#>'{contacts,unchanged}'),
    'convertedAt', clock_timestamp(),
    'replayed', false,
    'alreadyConverted', false
  );
  insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by,
      command_id, command_digest, receipt)
    values (tenant_row.stable_id, tenant_row.id, business_id, operator_id, p_command_id, p_command_digest, receipt);
  return receipt;
end;
$$;

revoke all on function public.tenant_workspace_link_guard() from public, anon, authenticated;
revoke all on function public.tenant_conversion_provider_route(uuid, uuid, jsonb, uuid, text, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.repath_converted_tenant_provider(text, text, uuid, jsonb, text, boolean)
  from public, anon, authenticated;
grant execute on function public.repath_converted_tenant_provider(text, text, uuid, jsonb, text, boolean) to service_role;
revoke all on function public.tenant_unlink_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.preview_tenant_unlink(text, text) from public, anon, authenticated;
revoke all on function public.unlink_tenant_from_business(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.convert_tenant_to_business(text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.preview_tenant_unlink(text, text) to service_role;
grant execute on function public.unlink_tenant_from_business(text, text, uuid, uuid, text) to service_role;
grant execute on function public.convert_tenant_to_business(text, text, jsonb, uuid, text) to service_role;
commit;
