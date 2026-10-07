-- #261: agency Team management. Existing invitation records and acceptance;
-- customer/owner invitations keep their previous authority. No staff-table writes
-- bypass set_agency_client_staff. Bulk staffing is one transaction.
begin;

create or replace function public.create_workspace_invitation(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_verified_email text,
  p_recipient_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
) returns setof public.workspace_invitations
language plpgsql security definer set search_path=public as $$
declare
  normalized_actor text := lower(btrim(coalesce(p_verified_email,'')));
  normalized_recipient text := lower(btrim(coalesce(p_recipient_email,'')));
  created_invitation public.workspace_invitations%rowtype;
begin
  perform 1 from public.users where id=p_actor_id and lower(email)=normalized_actor
    and verified_at is not null for share;
  if not found then raise exception 'workspace_invitation_identity_required'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id
    and user_id=p_actor_id and (role='owner' or (role='admin' and p_role in ('admin','member')
      and exists(select 1 from public.workspaces w where w.id=p_workspace_id and w.kind='agency'))) for share;
  if not found then raise exception 'workspace_invitation_owner_required'; end if;
  perform 1 from public.workspaces where id=p_workspace_id and kind in ('agency','customer') for share;
  if not found then raise exception 'workspace_invitation_workspace_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-invitations:'||p_workspace_id::text,0));
  if normalized_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_recipient)>254 or p_role not in ('owner','admin','member')
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '30 days' then
    raise exception 'workspace_invitation_command_invalid';
  end if;
  update public.workspace_invitations set status='expired'
    where workspace_id=p_workspace_id and recipient_email=normalized_recipient
      and status='pending' and expires_at<=clock_timestamp();
  if exists(select 1 from public.workspace_invitations where workspace_id=p_workspace_id
    and recipient_email=normalized_recipient and status='pending') then
    raise exception 'workspace_invitation_pending';
  end if;
  if (select count(*) from public.workspace_invitations where workspace_id=p_workspace_id
    and status='pending' and expires_at>clock_timestamp())>=50 then
    raise exception 'workspace_invitation_limit_reached';
  end if;
  insert into public.workspace_invitations(
    workspace_id,recipient_email,role,token_hash,expires_at,created_by
  ) values(
    p_workspace_id,normalized_recipient,p_role,p_token_hash,p_expires_at,p_actor_id
  ) returning * into created_invitation;
  return next created_invitation;
end;
$$;

create or replace function public.revoke_workspace_invitation(
  p_invitation_id uuid,
  p_actor_id uuid,
  p_verified_email text
) returns text
language plpgsql security definer set search_path=public as $$
declare
  invitation public.workspace_invitations%rowtype;
  normalized_email text := lower(btrim(coalesce(p_verified_email,'')));
begin
  perform 1 from public.users where id=p_actor_id and lower(email)=normalized_email
    and verified_at is not null for share;
  if not found then raise exception 'workspace_invitation_identity_required'; end if;
  select * into invitation from public.workspace_invitations where id=p_invitation_id for update;
  if not found then raise exception 'workspace_invitation_not_found'; end if;
  perform 1 from public.workspace_memberships where workspace_id=invitation.workspace_id
    and user_id=p_actor_id and (role='owner' or (role='admin' and invitation.role in ('admin','member')
      and exists(select 1 from public.workspaces w where w.id=invitation.workspace_id and w.kind='agency'))) for share;
  if not found then raise exception 'workspace_invitation_owner_required'; end if;
  if invitation.status='pending' and invitation.expires_at<=clock_timestamp() then
    update public.workspace_invitations set status='expired' where id=invitation.id;
    return 'expired';
  end if;
  if invitation.status<>'pending' then return invitation.status; end if;
  update public.workspace_invitations set status='revoked',revoked_by=p_actor_id,
    revoked_at=clock_timestamp() where id=invitation.id;
  return 'revoked';
end;
$$;

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

create function public.agency_team_require(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_write boolean)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role text;
begin
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email))
    and verified_at is not null for share;
  if not found then raise exception 'agency_team_access_denied'; end if;
  select m.role into actor_role from public.workspace_memberships m
    join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
    where m.workspace_id=p_agency_workspace_id and m.user_id=p_user_id for share of m,w;
  if not found or (p_write and actor_role not in ('owner','admin')) then raise exception 'agency_team_access_denied'; end if;
  return actor_role;
end;
$$;

create function public.read_agency_team(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role text; members jsonb; invitations jsonb := '[]'::jsonb;
begin
  actor_role := public.agency_team_require(p_user_id,p_verified_email,p_agency_workspace_id,false);
  select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'email',lower(u.email),'role',m.role)
    order by lower(u.email),m.user_id),'[]'::jsonb) into members
    from public.workspace_memberships m join public.users u on u.id=m.user_id where m.workspace_id=p_agency_workspace_id;
  if actor_role in ('owner','admin') then
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'recipientEmail',i.recipient_email,'role',i.role,
      'status','pending','expiresAt',i.expires_at) order by i.created_at desc),'[]'::jsonb) into invitations
      from public.workspace_invitations i where i.workspace_id=p_agency_workspace_id and i.status='pending' and i.expires_at>clock_timestamp();
  end if;
  return jsonb_build_object('agencyWorkspaceId',p_agency_workspace_id,'actorUserId',p_user_id,
    'canManage',actor_role in ('owner','admin'),'members',members,'invitations',invitations,
    'clients',public.read_agency_provider_seats(p_user_id,p_verified_email,p_agency_workspace_id));
end;
$$;

-- Owners and the actor's own membership stay outside this staff-management surface.
-- Removing membership invokes the 7A trigger, ending all that person's staff rows.
create function public.manage_agency_team_member(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid,
  p_staff_user_id uuid, p_role text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_role text;
begin
  perform public.agency_team_require(p_user_id,p_verified_email,p_agency_workspace_id,true);
  if p_staff_user_id is null or p_staff_user_id=p_user_id or (p_role is not null and p_role not in ('admin','member')) then
    raise exception 'agency_team_member_protected';
  end if;
  select role into target_role from public.workspace_memberships
    where workspace_id=p_agency_workspace_id and user_id=p_staff_user_id for update;
  if not found then raise exception 'agency_team_member_missing'; end if;
  if target_role='owner' then raise exception 'agency_team_member_protected'; end if;
  if p_role is null then
    delete from public.workspace_memberships where workspace_id=p_agency_workspace_id and user_id=p_staff_user_id;
  else
    update public.workspace_memberships set role=p_role where workspace_id=p_agency_workspace_id and user_id=p_staff_user_id;
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

create function public.bulk_set_agency_client_staff(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid,
  p_staff_user_ids uuid[], p_workspace_ids uuid[], p_active boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare staff_id uuid; client_id uuid; results jsonb := '[]'::jsonb;
begin
  perform public.agency_team_require(p_user_id,p_verified_email,p_agency_workspace_id,true);
  if p_active is null or coalesce(cardinality(p_staff_user_ids),0)=0 or coalesce(cardinality(p_workspace_ids),0)=0
    or cardinality(p_staff_user_ids)>100 or cardinality(p_workspace_ids)>100
    or cardinality(p_staff_user_ids)*cardinality(p_workspace_ids)>200
    or array_position(p_staff_user_ids,null) is not null or array_position(p_workspace_ids,null) is not null then
    raise exception 'agency_team_bulk_invalid';
  end if;
  -- Ordered client locks and deduplicated targets; any failure rolls back every change.
  for client_id in select distinct unnest(p_workspace_ids) order by 1 loop
    for staff_id in select distinct unnest(p_staff_user_ids) order by 1 loop
      results := results || jsonb_build_array(public.set_agency_client_staff(p_user_id,p_verified_email,
        p_agency_workspace_id,client_id,staff_id,p_active));
    end loop;
  end loop;
  return jsonb_build_object('results',results);
end;
$$;

revoke all on function public.agency_team_require(uuid,text,uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.read_agency_team(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.manage_agency_team_member(uuid,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.bulk_set_agency_client_staff(uuid,text,uuid,uuid[],uuid[],boolean) from public,anon,authenticated;
grant execute on function public.read_agency_team(uuid,text,uuid) to service_role;
grant execute on function public.manage_agency_team_member(uuid,text,uuid,uuid,text) to service_role;
grant execute on function public.bulk_set_agency_client_staff(uuid,text,uuid,uuid[],uuid[],boolean) to service_role;
commit;
