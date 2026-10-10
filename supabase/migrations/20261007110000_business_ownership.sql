-- Who owns and operates a converted business (product-model.md, "Problems
-- that cross specs" item 1). Conversion makes the Strelva operator an `admin`
-- member and nobody else, so nobody could invite the real owner, the hosted
-- monthly report had no `owner` to go to, and Strelva's agency home listed none
-- of its converted clients. This migration fixes that once:
--
--   1. workspace_providers + strelva_agency_workspace. A provider mark names
--      the agency that operates a business (ADR 0010 "agency of record"). It
--      grants NOTHING: every access check still reads memberships, delegations
--      and assignments only. Conversion writes the mark (a trigger on
--      tenant_workspace_links) once an operator has designated Strelva's own
--      agency workspace; designating also marks every business converted
--      before it. The agency client list is provider rows intersected with the
--      reader's own direct membership in each business.
--   2. Operator-issued owner invitation (docs/product/specs/owner-entry.md
--      requirements 8 and 9). A Strelva operator (active super admin, `admin`
--      member) may invite exactly one owner for a converted business with no
--      owner. Accepting any owner invitation on a business with linked tenants
--      writes the workspace `owner` membership AND an `owner` row in
--      `memberships` for every linked tenant, in one transaction. Nothing here
--      sends email or runs automatically; the caller sends through
--      src/lib/email/send.ts after the invitation commits.
--   3. resolve_tenant_owner_recipient: the one owner-recipient rule (Reborn §1)
--      keyed by tenant, for the tenant-model notices (leads, reports, reviews).
--   4. Client lead copies outlive a deprovisioned tenant (money-and-data.md
--      decision 5, recommended: keep for a stated period, then delete with a
--      receipt). Leads no longer cascade with the tenant row; unattached leads
--      are kept 365 days, leads attached to a business stay with the business.
--
-- Additive for live clients: no `tenants` column, `/api/v1`, `reb:` key or
-- existing membership changes. Depends on 20261002120000_business_record.sql
-- and 20261005090000_tenant_leads.sql.

-- 1. Provider of record ------------------------------------------------------

create table public.strelva_agency_workspace (
  singleton boolean primary key default true check (singleton),
  workspace_id uuid not null unique references public.workspaces(id) on delete restrict,
  designated_by uuid not null references public.users(id) on delete restrict,
  designated_at timestamptz not null default clock_timestamp()
);

create table public.workspace_providers (
  id uuid primary key default gen_random_uuid(),
  customer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  status text not null default 'active' check (status in ('active','ended')),
  source text not null check (source in ('tenant_conversion','operator')),
  started_by uuid not null references public.users(id) on delete restrict,
  started_at timestamptz not null default clock_timestamp(),
  ended_by uuid references public.users(id) on delete restrict,
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(end_reason) between 1 and 500),
  check (customer_workspace_id <> provider_workspace_id),
  check ((status = 'ended') = (ended_at is not null and ended_by is not null))
);
create unique index workspace_providers_one_active_idx
  on public.workspace_providers(customer_workspace_id) where status = 'active';
create index workspace_providers_provider_idx
  on public.workspace_providers(provider_workspace_id, status, started_at);

alter table public.strelva_agency_workspace enable row level security;
alter table public.workspace_providers enable row level security;
revoke all on public.strelva_agency_workspace, public.workspace_providers
  from public, anon, authenticated, service_role;

-- A provider row names a customer business and an agency. It may only end
-- (active -> ended, with who and when). It is deleted only with its business.
create function public.workspace_provider_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.workspaces where id = new.customer_workspace_id and kind = 'customer')
      or not exists (select 1 from public.workspaces where id = new.provider_workspace_id and kind = 'agency') then
      raise exception 'workspace_provider_invalid';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'active' and new.status = 'ended'
      and (to_jsonb(new) - array['status','ended_by','ended_at','end_reason']::text[])
        = (to_jsonb(old) - array['status','ended_by','ended_at','end_reason']::text[]) then
      return new;
    end if;
    raise exception 'workspace_provider_immutable';
  end if;
  if not exists (select 1 from public.workspaces where id = old.customer_workspace_id) then
    return old;
  end if;
  raise exception 'workspace_provider_immutable';
end;
$$;
create trigger workspace_providers_guard before insert or update or delete on public.workspace_providers
  for each row execute function public.workspace_provider_guard();

create function public.strelva_agency_workspace_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'strelva_agency_workspace_immutable';
end;
$$;
create trigger strelva_agency_workspace_immutable before update or delete on public.strelva_agency_workspace
  for each row execute function public.strelva_agency_workspace_immutable();

-- Conversion marks Strelva as the business's provider, in the conversion's own
-- transaction, when Strelva's agency workspace is designated and the business
-- has no active provider yet. Joining a second site changes nothing.
create function public.workspace_provider_mark_converted() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare agency uuid;
begin
  select workspace_id into agency from public.strelva_agency_workspace where singleton;
  if agency is null then return new; end if;
  insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
    values (new.workspace_id, agency, 'tenant_conversion', new.linked_by)
    on conflict (customer_workspace_id) where status = 'active' do nothing;
  return new;
end;
$$;
create trigger tenant_workspace_links_mark_provider after insert on public.tenant_workspace_links
  for each row execute function public.workspace_provider_mark_converted();

-- Name Strelva's own agency workspace, once. The operator must be an active
-- super admin and an owner/admin member of that agency. Every converted
-- business without an active provider (and not exited) is marked in the same
-- transaction. Repeating the same designation replays and marks any business
-- converted since; naming a different workspace is refused.
create function public.designate_strelva_agency_workspace(p_operator_email text, p_workspace_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  current_row public.strelva_agency_workspace%rowtype;
  marked integer;
  replayed boolean := false;
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  if p_workspace_id is null then raise exception 'strelva_agency_workspace_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('strelva-agency-workspace', 0));
  perform 1 from public.workspaces w
    join public.workspace_memberships m on m.workspace_id = w.id and m.user_id = operator_id and m.role in ('owner','admin')
    where w.id = p_workspace_id and w.kind = 'agency'
    for share of w, m;
  if not found then raise exception 'strelva_agency_workspace_invalid'; end if;
  select * into current_row from public.strelva_agency_workspace where singleton;
  if found then
    if current_row.workspace_id <> p_workspace_id then raise exception 'strelva_agency_already_designated'; end if;
    replayed := true;
  else
    insert into public.strelva_agency_workspace(workspace_id, designated_by) values (p_workspace_id, operator_id)
      returning * into current_row;
  end if;
  insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
    select distinct l.workspace_id, p_workspace_id, 'tenant_conversion', operator_id
      from public.tenant_workspace_links l
      join public.workspaces w on w.id = l.workspace_id and w.kind = 'customer'
      where not public.workspace_exit_completed(l.workspace_id)
        and not exists (select 1 from public.workspace_providers p
          where p.customer_workspace_id = l.workspace_id and p.status = 'active')
    on conflict (customer_workspace_id) where status = 'active' do nothing;
  get diagnostics marked = row_count;
  return jsonb_build_object('workspaceId', current_row.workspace_id, 'designatedBy', current_row.designated_by,
    'designatedAt', current_row.designated_at, 'marked', marked, 'replayed', replayed);
end;
$$;

-- The businesses an agency operates that this reader can actually open: an
-- active provider row naming the agency, intersected with the reader's own
-- direct membership in each business. The mark never adds a business the
-- reader could not already open. The reader must be a member of the agency.
create function public.list_provided_clients(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null or p_verified_email is null or p_agency_workspace_id is null then
    raise exception 'workspace_provider_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'workspace_provider_access_denied'; end if;
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where m.workspace_id = p_agency_workspace_id and m.user_id = p_user_id;
  if not found then raise exception 'workspace_provider_access_denied'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('customerWorkspaceId', p.customer_workspace_id, 'name', w.name,
        'role', m.role, 'source', p.source,
        'startedAt', to_char(p.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      order by w.name, p.customer_workspace_id)
    from public.workspace_providers p
    join public.workspaces w on w.id = p.customer_workspace_id and w.kind = 'customer'
    join public.workspace_memberships m on m.workspace_id = p.customer_workspace_id and m.user_id = p_user_id
    where p.provider_workspace_id = p_agency_workspace_id and p.status = 'active'
  ), '[]'::jsonb);
end;
$$;

-- 2. Operator-issued owner invitation ----------------------------------------

alter table public.workspace_invitations
  add column issued_by_kind text not null default 'owner' check (issued_by_kind in ('owner','operator'));
alter table public.workspace_invitations
  add constraint workspace_invitations_operator_issues_owner_only check (issued_by_kind = 'owner' or role = 'owner');

-- Shared checks for an operator acting on a converted business's ownership.
-- Returns the operator's user id. Locks the operator's membership FOR SHARE.
create function public.operator_owner_invitation_assert(p_operator_email text, p_workspace_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid;
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  if p_workspace_id is null then raise exception 'operator_owner_invitation_operator_required'; end if;
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'customer'
    where m.workspace_id = p_workspace_id and m.user_id = operator_id and m.role = 'admin'
    for share of m;
  if not found then raise exception 'operator_owner_invitation_operator_required'; end if;
  if not exists (select 1 from public.tenant_workspace_links where workspace_id = p_workspace_id) then
    raise exception 'operator_owner_invitation_not_converted';
  end if;
  return operator_id;
end;
$$;

create function public.operator_owner_invitation_tenants(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('tenantId', t.id, 'tenantStableId', t.stable_id, 'siteName', t.site_name)
      order by l.linked_at, l.id), '[]'::jsonb)
    from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
    where l.workspace_id = p_workspace_id
$$;

-- Read-only state for the operator's dry run: who would be invited, whether
-- an owner or a pending owner invitation already exists, and the linked sites.
create function public.read_operator_owner_invitation_state(p_operator_email text, p_workspace_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid;
begin
  operator_id := public.operator_owner_invitation_assert(p_operator_email, p_workspace_id);
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'workspaceName', (select name from public.workspaces where id = p_workspace_id),
    'operatorId', operator_id,
    'hasOwner', exists (select 1 from public.workspace_memberships where workspace_id = p_workspace_id and role = 'owner'),
    'exited', public.workspace_exit_completed(p_workspace_id),
    'recipient', public.resolve_business_owner_recipient(p_workspace_id),
    'tenants', public.operator_owner_invitation_tenants(p_workspace_id),
    'pending', coalesce((select jsonb_agg(jsonb_build_object('invitationId', i.id, 'recipientEmail', i.recipient_email,
        'expiresAt', i.expires_at, 'createdAt', i.created_at) order by i.created_at)
      from public.workspace_invitations i
      where i.workspace_id = p_workspace_id and i.role = 'owner' and i.issued_by_kind = 'operator'
        and i.status = 'pending' and i.expires_at > clock_timestamp()), '[]'::jsonb));
end;
$$;

create function public.create_operator_owner_invitation(
  p_operator_email text, p_workspace_id uuid, p_recipient_email text, p_token_hash text, p_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  normalized_recipient text := lower(btrim(coalesce(p_recipient_email, '')));
  created public.workspace_invitations%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-invitations:' || coalesce(p_workspace_id::text, ''), 0));
  operator_id := public.operator_owner_invitation_assert(p_operator_email, p_workspace_id);
  perform 1 from public.workspaces where id = p_workspace_id for share;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if exists (select 1 from public.workspace_memberships where workspace_id = p_workspace_id and role = 'owner') then
    raise exception 'operator_owner_invitation_owner_exists';
  end if;
  if normalized_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_recipient) > 254
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '30 days' then
    raise exception 'workspace_invitation_command_invalid';
  end if;
  update public.workspace_invitations set status = 'expired'
    where workspace_id = p_workspace_id and status = 'pending' and expires_at <= clock_timestamp();
  -- Exactly one owner: one live operator-issued owner invitation at a time.
  if exists (select 1 from public.workspace_invitations where workspace_id = p_workspace_id
      and role = 'owner' and issued_by_kind = 'operator' and status = 'pending') then
    raise exception 'operator_owner_invitation_pending';
  end if;
  if exists (select 1 from public.workspace_invitations where workspace_id = p_workspace_id
      and recipient_email = normalized_recipient and status = 'pending') then
    raise exception 'workspace_invitation_pending';
  end if;
  insert into public.workspace_invitations(workspace_id, recipient_email, role, token_hash, expires_at, created_by, issued_by_kind)
    values (p_workspace_id, normalized_recipient, 'owner', p_token_hash, p_expires_at, operator_id, 'operator')
    returning * into created;
  return jsonb_build_object(
    'invitationId', created.id,
    'workspaceId', created.workspace_id,
    'workspaceName', (select name from public.workspaces where id = p_workspace_id),
    'recipientEmail', created.recipient_email,
    'role', created.role,
    'status', created.status,
    'expiresAt', created.expires_at,
    'createdAt', created.created_at,
    'createdBy', created.created_by,
    'tenants', public.operator_owner_invitation_tenants(p_workspace_id));
end;
$$;

-- The operator who can issue an owner invitation can also withdraw it.
create function public.revoke_operator_owner_invitation(p_operator_email text, p_invitation_id uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare invitation public.workspace_invitations%rowtype; operator_id uuid;
begin
  select * into invitation from public.workspace_invitations where id = p_invitation_id for update;
  if not found or invitation.issued_by_kind <> 'operator' then raise exception 'workspace_invitation_not_found'; end if;
  operator_id := public.operator_owner_invitation_assert(p_operator_email, invitation.workspace_id);
  if invitation.status = 'pending' and invitation.expires_at <= clock_timestamp() then
    update public.workspace_invitations set status = 'expired' where id = invitation.id;
    return 'expired';
  end if;
  if invitation.status <> 'pending' then return invitation.status; end if;
  update public.workspace_invitations set status = 'revoked', revoked_by = operator_id, revoked_at = clock_timestamp()
    where id = invitation.id;
  return 'revoked';
end;
$$;

-- Same contract as 20260918130000, plus two rules:
--   * an operator-issued owner invitation is sponsored by the operator's
--     current super-admin + admin standing (rechecked here, like an owner
--     sponsor), and refuses when the business already has another owner;
--   * whoever ends up `owner` of a business with linked tenants also gets an
--     `owner` row in `memberships` for each linked tenant, in this same
--     transaction, so /dashboard and tenant APIs (requireTenantAccess) open
--     for them. Any failure rolls back both.
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
        and sponsor_membership.role='owner'
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

-- Unlink keeps treating every other table that points at the business as
-- use, except the provider mark (identical to 20261002120000 otherwise).
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
  if exists (select 1 from public.workspace_memberships where workspace_id = link.workspace_id
      and not (user_id = link.linked_by and role = 'admin')) then
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
          'public.tenant_workspace_links'::regclass)
        and c.conrelid is distinct from to_regclass('public.tenant_leads')
        -- The provider mark is conversion machinery, like the operator's
        -- membership; it grants nothing and goes with the business.
        and c.conrelid is distinct from to_regclass('public.workspace_providers')
      order by 1, 2
  loop
    execute format('select exists (select 1 from %s where %I = $1)', fk.rel, fk.col) into in_use using link.workspace_id;
    if in_use then reasons := array_append(reasons, ('workspace_in_use:' || fk.rel::text)); end if;
  end loop;

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

-- 3. One owner-recipient rule, keyed by tenant ------------------------------
--
-- Every tenant-model owner notice (lead, report, review, health) asks this.
-- Order: the linked business record's owner_recipient fact; then this tenant's
-- own owner_email (an unconverted tenant always lands here, so live clients
-- see no change); then the business's earliest linked tenant's owner_email.
-- Resolves an address and sends nothing; the caller holds its own authority.
create function public.resolve_tenant_owner_recipient(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tenant_row record; ws uuid; fact jsonb; fallback jsonb;
begin
  select t.id, t.stable_id, t.owner_email into tenant_row from public.tenants t where t.id = p_tenant_id;
  if not found then return null; end if;
  select l.workspace_id into ws from public.tenant_workspace_links l where l.tenant_stable_id = tenant_row.stable_id;
  if ws is not null then
    select jsonb_build_object('email', f.value->>'email', 'name', f.value->>'name', 'from', 'record',
        'workspaceId', ws, 'tenantId', tenant_row.id)
      into fact from public.business_record_facts f
      where f.workspace_id = ws and f.fact_key = 'owner_recipient';
    if fact is not null then return fact; end if;
  end if;
  if nullif(btrim(tenant_row.owner_email), '') is not null then
    return jsonb_build_object('email', lower(btrim(tenant_row.owner_email)), 'name', null, 'from', 'tenant',
      'workspaceId', ws, 'tenantId', tenant_row.id);
  end if;
  if ws is not null then
    fallback := public.resolve_business_owner_recipient(ws);
    if fallback is not null then
      return jsonb_build_object('email', fallback->>'email', 'name', fallback->>'name', 'from', 'linked_tenant',
        'workspaceId', ws, 'tenantId', fallback->>'tenantId');
    end if;
  end if;
  return null;
end;
$$;

-- 4. Client lead copies outlive a deprovisioned tenant ------------------------
--
-- Before: `tenant_leads.tenant_stable_id` cascaded, so deleting the tenant row
-- deleted every copied lead. Now the row keeps its stable id (UUIDs are never
-- reused) and is stamped when the tenant row goes:
--   * a lead attached to a business stays with that business, no deadline;
--   * an unattached lead is kept 365 days (`retain_until`), then
--     purge_expired_tenant_leads deletes it and writes one receipt per tenant
--     in tenant_lead_purges.
-- If the business later goes too, its leads get the same 365 days from then.

create function public.tenant_lead_retention() returns interval
language sql immutable set search_path = public, pg_temp as $$ select interval '365 days' $$;

alter table public.tenant_leads drop constraint tenant_leads_tenant_stable_id_fkey;
alter table public.tenant_leads
  add column tenant_deleted_at timestamptz,
  add column site_name_at_delete text check (site_name_at_delete is null or char_length(site_name_at_delete) <= 200),
  add column retain_until timestamptz,
  add constraint tenant_leads_retention_needs_deletion check (retain_until is null or tenant_deleted_at is not null);
create index tenant_leads_retain_until_idx on public.tenant_leads(retain_until) where retain_until is not null;

create table public.tenant_lead_purges (
  id uuid primary key default gen_random_uuid(),
  tenant_stable_id uuid not null,
  tenant_slug text not null check (char_length(tenant_slug) between 1 and 120),
  site_name text check (site_name is null or char_length(site_name) <= 200),
  tenant_deleted_at timestamptz not null,
  retain_until timestamptz not null,
  purged_count integer not null check (purged_count > 0),
  purged_at timestamptz not null default clock_timestamp()
);
create index tenant_lead_purges_tenant_idx on public.tenant_lead_purges(tenant_stable_id, purged_at desc);
alter table public.tenant_lead_purges enable row level security;
revoke all on public.tenant_lead_purges from public, anon, authenticated, service_role;

create function public.tenant_lead_purge_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'tenant_lead_purge_immutable';
end;
$$;
create trigger tenant_lead_purges_immutable before update or delete on public.tenant_lead_purges
  for each row execute function public.tenant_lead_purge_immutable();

create function public.tenant_leads_retain_on_tenant_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.tenant_leads
    set tenant_deleted_at = clock_timestamp(),
        site_name_at_delete = left(old.site_name, 200),
        retain_until = case when workspace_id is null then clock_timestamp() + public.tenant_lead_retention() end
    where tenant_stable_id = old.stable_id and tenant_deleted_at is null;
  return old;
end;
$$;
create trigger tenants_retain_leads after delete on public.tenants
  for each row execute function public.tenant_leads_retain_on_tenant_delete();

-- A lead of a deleted tenant that loses its business (workspace deleted, FK
-- set null) starts its retention clock then.
create function public.tenant_leads_retain_on_detach() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.workspace_id is null and old.workspace_id is not null
    and new.tenant_deleted_at is not null and new.retain_until is null then
    new.retain_until := clock_timestamp() + public.tenant_lead_retention();
  end if;
  return new;
end;
$$;
create trigger tenant_leads_retain_on_detach before update of workspace_id on public.tenant_leads
  for each row execute function public.tenant_leads_retain_on_detach();

-- Delete leads whose retention has passed, at most p_limit per call, and
-- record one immutable receipt per tenant. Returns {purged, tenants}.
create function public.purge_expired_tenant_leads(p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 10000); v_purged bigint; v_tenants bigint;
begin
  with doomed as (
    select id from public.tenant_leads
      where retain_until is not null and retain_until <= clock_timestamp() and workspace_id is null
      order by retain_until, id limit v_limit for update skip locked
  ), deleted as (
    delete from public.tenant_leads l using doomed d where l.id = d.id
      returning l.tenant_stable_id, l.tenant_slug_at_capture, l.captured_at, l.site_name_at_delete, l.tenant_deleted_at, l.retain_until
  ), receipts as (
    insert into public.tenant_lead_purges(tenant_stable_id, tenant_slug, site_name, tenant_deleted_at, retain_until, purged_count)
      select tenant_stable_id, (array_agg(tenant_slug_at_capture order by captured_at desc))[1], max(site_name_at_delete),
          min(tenant_deleted_at), max(retain_until), count(*)
        from deleted group by tenant_stable_id
      returning purged_count
  )
  select coalesce(sum(purged_count), 0), count(*) into v_purged, v_tenants from receipts;
  return jsonb_build_object('purged', v_purged, 'tenants', v_tenants);
end;
$$;

-- Operator read, as before, now including leads of deleted tenants (their
-- slug at capture and site name at deletion stand in for the tenant row).
create or replace function public.read_tenant_leads(p_tenant_id text, p_limit integer, p_before timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  if p_tenant_id is not null then
    select stable_id into v_stable from public.tenants where id = p_tenant_id;
    if v_stable is null then return '[]'::jsonb; end if;
  end if;
  return coalesce((
    select jsonb_agg(item order by item->>'capturedAt' desc, item->>'id' desc)
    from (
      select jsonb_build_object(
        'id', l.id,
        'tenantId', coalesce(t.id, l.tenant_slug_at_capture),
        'tenantStableId', l.tenant_stable_id,
        'siteName', coalesce(t.site_name, l.site_name_at_delete),
        'tenantSlugAtCapture', l.tenant_slug_at_capture,
        'workspaceId', l.workspace_id,
        'leadId', l.lead_id,
        'name', l.name,
        'email', l.email,
        'message', l.message,
        'source', l.source,
        'fields', l.fields,
        'capabilityId', l.capability_id,
        'capabilityVersion', l.capability_version,
        'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedAt', to_char(l.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedVia', l.recorded_via,
        'tenantDeletedAt', case when l.tenant_deleted_at is null then null
          else to_char(l.tenant_deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
        'retainUntil', case when l.retain_until is null then null
          else to_char(l.retain_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) as item
      from public.tenant_leads l
      left join public.tenants t on t.stable_id = l.tenant_stable_id
      where (v_stable is null or l.tenant_stable_id = v_stable)
        and (p_before is null or l.captured_at < p_before)
      order by l.captured_at desc, l.id desc
      limit v_limit
    ) page
  ), '[]'::jsonb);
end;
$$;

-- Grants. Trigger functions are not callable outside triggers; everything
-- else is service-role only.
revoke all on function public.workspace_provider_guard() from public, anon, authenticated;
revoke all on function public.strelva_agency_workspace_immutable() from public, anon, authenticated;
revoke all on function public.workspace_provider_mark_converted() from public, anon, authenticated;
revoke all on function public.tenant_lead_purge_immutable() from public, anon, authenticated;
revoke all on function public.tenant_leads_retain_on_tenant_delete() from public, anon, authenticated;
revoke all on function public.tenant_leads_retain_on_detach() from public, anon, authenticated;
revoke all on function public.tenant_lead_retention() from public, anon, authenticated;
revoke all on function public.operator_owner_invitation_assert(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.operator_owner_invitation_tenants(uuid) from public, anon, authenticated, service_role;
revoke all on function public.designate_strelva_agency_workspace(text, uuid) from public, anon, authenticated;
revoke all on function public.list_provided_clients(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.read_operator_owner_invitation_state(text, uuid) from public, anon, authenticated;
revoke all on function public.create_operator_owner_invitation(text, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_operator_owner_invitation(text, uuid) from public, anon, authenticated;
revoke all on function public.resolve_tenant_owner_recipient(text) from public, anon, authenticated;
revoke all on function public.purge_expired_tenant_leads(integer) from public, anon, authenticated;
grant execute on function public.designate_strelva_agency_workspace(text, uuid) to service_role;
grant execute on function public.list_provided_clients(uuid, text, uuid) to service_role;
grant execute on function public.read_operator_owner_invitation_state(text, uuid) to service_role;
grant execute on function public.create_operator_owner_invitation(text, uuid, text, text, timestamptz) to service_role;
grant execute on function public.revoke_operator_owner_invitation(text, uuid) to service_role;
grant execute on function public.resolve_tenant_owner_recipient(text) to service_role;
grant execute on function public.purge_expired_tenant_leads(integer) to service_role;
