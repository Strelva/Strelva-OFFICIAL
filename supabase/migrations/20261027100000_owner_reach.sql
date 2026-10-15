-- Owner reach: can this business's owner actually be reached, and by whom.
--
-- The agency door lets an agency add a client and issue the owner's claim
-- link. Operator-converted clients have a trusted owner address that is often
-- a staff address, so owner decisions lapse unseen. This migration:
--   * owner_contact_staff_reason: says when an address belongs to platform
--     staff or to the agencies serving a business (generic, no hard-coded
--     domain); owner claims to such an address are refused.
--   * read_agency_client_owner_reach: an address-free read for the agency
--     (owner signed in, contact on record, pending claim or invitation, open
--     owner decisions and when they lapse).
--   * operator_owner_reach_report: the operator's read-only list of every
--     business and why its owner can or cannot be reached.
-- Nothing here sends mail, and no function returns an owner address to an agency.
begin;
set local lock_timeout = '3s';

-- Mailbox providers: a shared domain says nothing about who owns the address.
-- Keep identical to PUBLIC_MAIL_DOMAINS in src/platform/owner-reach/contact.ts.
create function public.owner_reach_public_mail_domains() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','gmx.com','fastmail.com','zoho.com','comcast.net','verizon.net','att.net','roadrunner.com','rochester.rr.com','twc.com']
$$;

-- Why an address is not the owner's: platform_operator, agency_member or
-- staff_domain (a non-public domain that staff of the platform or of an
-- agency serving this business also use). Null when it can be the owner's.
create function public.owner_contact_staff_reason(p_customer_workspace_id uuid, p_email text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  d text := split_part(lower(btrim(coalesce(p_email, ''))), '@', 2);
  agencies uuid[];
begin
  if e = '' then return null; end if;
  if exists (select 1 from public.super_admins s where s.revoked_at is null and lower(s.email) = e) then
    return 'platform_operator';
  end if;
  agencies := array(
    select provider_workspace_id from public.workspace_providers
      where customer_workspace_id = p_customer_workspace_id and status = 'active'
    union select agency_workspace_id from public.agency_client_additions where customer_workspace_id = p_customer_workspace_id
    union select agency_workspace_id from public.provider_seats where customer_workspace_id = p_customer_workspace_id and status = 'active');
  if exists (select 1 from public.users u
      join public.workspace_memberships m on m.user_id = u.id
      join public.workspaces a on a.id = m.workspace_id and a.kind = 'agency'
      where lower(u.email) = e and a.id = any(agencies)) then
    return 'agency_member';
  end if;
  if d <> '' and not (d = any(public.owner_reach_public_mail_domains())) and (
    exists (select 1 from public.super_admins s where s.revoked_at is null and split_part(lower(s.email), '@', 2) = d)
    or exists (select 1 from public.users u
      join public.workspace_memberships m on m.user_id = u.id
      join public.workspaces a on a.id = m.workspace_id and a.kind = 'agency'
      where a.id = any(agencies) and split_part(lower(u.email), '@', 2) = d)) then
    return 'staff_domain';
  end if;
  return null;
end;
$$;

create or replace function public.issue_agency_client_owner_claim(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_customer_workspace_id uuid,
  p_recipient_email text, p_token_hash text, p_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  recipient text := lower(btrim(coalesce(p_recipient_email, '')));
  replaced integer;
  created public.agency_client_owner_claims%rowtype;
begin
  perform public.agency_client_assert_actor(p_user_id, p_verified_email, p_agency_workspace_id);
  if p_customer_workspace_id is null then raise exception 'agency_client_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer_workspace_id::text, 7415));
  perform 1 from public.agency_client_additions
    where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id;
  if not found then raise exception 'agency_client_access_denied'; end if;
  perform 1 from public.workspace_providers
    where customer_workspace_id = p_customer_workspace_id and provider_workspace_id = p_agency_workspace_id and status = 'active'
    for share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  perform 1 from public.provider_seats
    where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'active'
    for share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  if public.workspace_exit_completed(p_customer_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not public.agency_client_waiting_for_owner(p_customer_workspace_id) then raise exception 'agency_client_owner_exists'; end if;
  if not public.business_record_email_valid(recipient) or char_length(recipient) > 254
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '30 days' then
    raise exception 'agency_client_claim_invalid';
  end if;
  -- Owner links never go to platform or agency staff (#524).
  if public.owner_contact_staff_reason(p_customer_workspace_id, recipient) is not null then
    raise exception 'agency_client_claim_recipient_staff';
  end if;
  update public.agency_client_owner_claims set status = 'expired'
    where customer_workspace_id = p_customer_workspace_id and status = 'pending' and expires_at <= clock_timestamp();
  update public.agency_client_owner_claims set status = 'revoked', revoked_by = p_user_id, revoked_at = clock_timestamp()
    where customer_workspace_id = p_customer_workspace_id and status = 'pending';
  get diagnostics replaced = row_count;
  insert into public.agency_client_owner_claims(customer_workspace_id, agency_workspace_id, recipient_email, token_hash,
      delivery, created_by, expires_at)
    values (p_customer_workspace_id, p_agency_workspace_id, recipient, p_token_hash,
      jsonb_build_object('status', 'not_sent', 'reason', 'gated', 'decision', 'R08',
        'agencyEmailVerified', public.agency_effect_allowed(p_agency_workspace_id, 'email')),
      p_user_id, p_expires_at)
    returning * into created;
  return jsonb_build_object(
    'claimId', created.id,
    'customerWorkspaceId', created.customer_workspace_id,
    'workspaceName', (select name from public.workspaces where id = created.customer_workspace_id),
    'recipientEmail', created.recipient_email,
    'delivery', created.delivery,
    'expiresAt', to_char(created.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'createdAt', to_char(created.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'replacedPending', replaced > 0);
end;
$$;

-- What an agency may know about whether each client's owner can be reached.
-- Reads each client through the same authority as the client's Home, so a
-- business the actor cannot read is skipped. No address, token or name.
create function public.read_agency_client_owner_reach(
  p_agency_workspace_id uuid, p_user_id uuid, p_verified_email text, p_workspace_ids uuid[]
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  actor_role text;
  ws uuid;
  projection jsonb;
  trust public.business_owner_recipient_trust%rowtype;
  has_trust boolean;
  claim public.agency_client_owner_claims%rowtype;
  invitation public.workspace_invitations%rowtype;
  invite jsonb;
  decisions jsonb;
  result jsonb := '[]'::jsonb;
begin
  perform 1 from public.users where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null;
  if not found then raise exception 'agency_client_access_denied'; end if;
  select m.role into actor_role from public.workspace_memberships m
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where m.workspace_id = p_agency_workspace_id and m.user_id = p_user_id limit 1;
  if actor_role is null then raise exception 'agency_client_access_denied'; end if;
  if cardinality(coalesce(p_workspace_ids, '{}')) > 100 then raise exception 'system_input_invalid'; end if;
  foreach ws in array coalesce(p_workspace_ids, '{}') loop
    begin
      projection := public.read_agency_client_home(ws, p_user_id, p_verified_email);
    exception when others then
      if sqlerrm in ('business_record_access_denied', 'workspace_membership_required', 'workspace_access_denied', 'workspace_exit_future_work_blocked')
        or sqlerrm like '%access_denied%' then
        continue;
      end if;
      raise;
    end;
    select * into trust from public.business_owner_recipient_trust where workspace_id = ws;
    has_trust := found;
    claim := null; invitation := null; invite := null;
    select * into claim from public.agency_client_owner_claims
      where customer_workspace_id = ws and agency_workspace_id = p_agency_workspace_id
        and status = 'pending' and expires_at > clock_timestamp()
      order by created_at desc limit 1;
    select * into invitation from public.workspace_invitations
      where workspace_id = ws and role = 'owner' and status = 'pending' and expires_at > clock_timestamp()
      order by created_at desc limit 1;
    if claim.id is not null and (invitation.id is null or claim.created_at >= invitation.created_at) then
      invite := jsonb_build_object('kind', 'agency_claim', 'expiresAt', public.system_version_ts(claim.expires_at),
        'deliveryStatus', coalesce(claim.delivery->>'status', 'not_sent'),
        'deliveryReason', claim.delivery->>'reason',
        'recipientStaff', public.owner_contact_staff_reason(ws, claim.recipient_email) is not null);
    elsif invitation.id is not null then
      invite := jsonb_build_object('kind', 'owner_invitation', 'expiresAt', public.system_version_ts(invitation.expires_at),
        'deliveryStatus', 'not_sent', 'deliveryReason', 'email_not_requested',
        'recipientStaff', public.owner_contact_staff_reason(ws, invitation.recipient_email) is not null);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'expiresAt', public.system_version_ts(d.expires_at),
        'deliveryState', d.delivery_state) order by d.expires_at, d.id), '[]') into decisions
      from jsonb_array_elements(projection->'decisions') e
      join public.owner_decisions d on d.id = (e->>'id')::uuid and d.workspace_id = ws
      where e->>'state' = 'open';
    result := result || jsonb_build_array(jsonb_build_object(
      'workspaceId', ws,
      'ownerMember', exists (select 1 from public.workspace_memberships where workspace_id = ws and role = 'owner'),
      'contact', case when not has_trust then 'none'
        when public.owner_contact_staff_reason(ws, trust.email) is not null then 'trusted_staff' else 'trusted' end,
      'contactProposed', exists (select 1 from public.business_owner_recipient_events ev
        where ev.workspace_id = ws and ev.event = 'written' and ev.pending
          and (not has_trust or ev.created_at > trust.trusted_at)),
      'invite', invite,
      'canIssueClaim', exists (select 1 from public.agency_client_additions where customer_workspace_id = ws and agency_workspace_id = p_agency_workspace_id)
        and exists (select 1 from public.provider_seats where customer_workspace_id = ws and agency_workspace_id = p_agency_workspace_id and status = 'active')
        and public.agency_client_waiting_for_owner(ws)
        and actor_role in ('owner', 'admin'),
      'decisions', decisions,
      'lapsedRecently', (select count(*) from jsonb_array_elements(projection->'decisions') e where e->>'state' = 'expired')));
  end loop;
  return result;
end;
$$;

-- Operator read: every business, who could be told, and what is waiting.
-- Includes addresses (operators already hold them); never changes anything.
create function public.operator_owner_reach_report(p_operator_user_id uuid, p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u
    where u.id = p_operator_user_id and lower(u.email) = lower(btrim(coalesce(p_verified_email, ''))) and u.verified_at is not null
      and exists (select 1 from public.super_admins s where s.user_id = u.id and s.revoked_at is null);
  if not found then raise exception 'workspace_release_operator_required'; end if;
  return coalesce((select jsonb_agg(obj order by name, id) from (
    select w.id, w.name, jsonb_build_object(
      'workspaceId', w.id, 'name', w.name,
      'sites', coalesce((select jsonb_agg(t.id order by t.id) from public.tenant_workspace_links l
        join public.tenants t on t.stable_id = l.tenant_stable_id where l.workspace_id = w.id), '[]'),
      'ownerMember', exists (select 1 from public.workspace_memberships m where m.workspace_id = w.id and m.role = 'owner'),
      'trusted', (select jsonb_build_object('email', r.email, 'trustedVia', r.trusted_via,
          'staffReason', public.owner_contact_staff_reason(w.id, r.email))
        from public.business_owner_recipient_trust r where r.workspace_id = w.id),
      'tenantOwnerEmails', coalesce((select jsonb_agg(jsonb_build_object('tenantId', t.id, 'email', t.owner_email,
          'staffReason', public.owner_contact_staff_reason(w.id, t.owner_email)) order by t.id)
        from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
        where l.workspace_id = w.id), '[]'),
      'proposed', (select jsonb_build_object('email', ev.email, 'actorKind', ev.actor_kind, 'at', public.system_version_ts(ev.created_at))
        from public.business_owner_recipient_events ev
        where ev.workspace_id = w.id and ev.event = 'written' and ev.pending and ev.email is not null
        order by ev.id desc limit 1),
      'invite', (select x from (
        select created_at, jsonb_build_object('kind', 'agency_claim', 'recipientEmail', c.recipient_email,
            'expiresAt', public.system_version_ts(c.expires_at), 'deliveryStatus', coalesce(c.delivery->>'status', 'not_sent'),
            'recipientStaffReason', public.owner_contact_staff_reason(w.id, c.recipient_email)) x
          from public.agency_client_owner_claims c
          where c.customer_workspace_id = w.id and c.status = 'pending' and c.expires_at > clock_timestamp()
        union all
        select created_at, jsonb_build_object('kind', 'owner_invitation', 'recipientEmail', i.recipient_email,
            'expiresAt', public.system_version_ts(i.expires_at), 'deliveryStatus', 'not_sent',
            'recipientStaffReason', public.owner_contact_staff_reason(w.id, i.recipient_email))
          from public.workspace_invitations i
          where i.workspace_id = w.id and i.role = 'owner' and i.status = 'pending' and i.expires_at > clock_timestamp()
        order by created_at desc limit 1) q),
      'openDecisions', (select count(*) from public.owner_decisions d where d.workspace_id = w.id and d.state = 'open' and d.route = 'owner_decides'),
      'soonestLapse', (select public.system_version_ts(min(d.expires_at)) from public.owner_decisions d
        where d.workspace_id = w.id and d.state = 'open' and d.route = 'owner_decides'),
      'lapsed14d', (select count(*) from public.owner_decisions d where d.workspace_id = w.id and d.state = 'expired'
        and d.route = 'owner_decides' and d.updated_at > clock_timestamp() - interval '14 days')) obj
    from public.workspaces w
    where w.kind = 'customer' and not public.workspace_exit_completed(w.id)) q), '[]'::jsonb);
end;
$$;

revoke all on function public.owner_reach_public_mail_domains() from public, anon, authenticated;
revoke all on function public.owner_contact_staff_reason(uuid, text) from public, anon, authenticated;
revoke all on function public.read_agency_client_owner_reach(uuid, uuid, text, uuid[]) from public, anon, authenticated;
revoke all on function public.operator_owner_reach_report(uuid, text) from public, anon, authenticated;
grant execute on function public.owner_reach_public_mail_domains() to service_role;
grant execute on function public.owner_contact_staff_reason(uuid, text) to service_role;
grant execute on function public.read_agency_client_owner_reach(uuid, uuid, text, uuid[]) to service_role;
grant execute on function public.operator_owner_reach_report(uuid, text) to service_role;

notify pgrst, 'reload schema';
commit;
