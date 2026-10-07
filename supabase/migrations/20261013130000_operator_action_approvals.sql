begin;

-- Approval is a server-side, single-use record bound to one exact action.
-- Neither a browser boolean nor a caller-supplied approver identity grants it.
create table public.operator_action_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  action_kind text not null check (action_kind in ('owner_invitation.issue', 'workspace_release_flag.on')),
  target jsonb not null check (jsonb_typeof(target) = 'object'),
  approved_by uuid not null references public.users(id) on delete restrict,
  approved_email text not null,
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_by uuid references public.users(id) on delete restrict,
  consumed_at timestamptz,
  check (expires_at > approved_at),
  check ((consumed_by is null) = (consumed_at is null))
);
create index operator_action_approvals_workspace_idx
  on public.operator_action_approvals(workspace_id, approved_at desc);
alter table public.operator_action_approvals enable row level security;
revoke all on public.operator_action_approvals from public, anon, authenticated, service_role;

create function public.operator_action_approval_immutable() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'operator_action_approval_immutable'; end if;
  if row(new.id, new.workspace_id, new.action_kind, new.target, new.approved_by, new.approved_email, new.approved_at, new.expires_at)
      is distinct from row(old.id, old.workspace_id, old.action_kind, old.target, old.approved_by, old.approved_email, old.approved_at, old.expires_at)
    or old.consumed_at is not null or new.consumed_at is null or new.consumed_by is null then
    raise exception 'operator_action_approval_immutable';
  end if;
  return new;
end;
$$;
create trigger operator_action_approvals_immutable_trg
  before update or delete on public.operator_action_approvals
  for each row execute function public.operator_action_approval_immutable();

-- Operator audit records are written inside the same transaction as the
-- approval or invitation. One row is written for each linked tenant.
create function public.record_workspace_operator_audit(
  p_workspace_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_actor_user_id uuid,
  p_actor_email text,
  p_metadata jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  affected_rows integer;
begin
  insert into public.audit_logs(
    id, tenant_id, tenant_stable_id, action, target_type, target_id, time,
    actor_user_id, actor_email, actor_type, actor_is_super_admin, metadata
  )
  select gen_random_uuid()::text, t.id, t.stable_id, p_action, p_target_type, p_target_id,
    clock_timestamp(), p_actor_user_id, lower(btrim(p_actor_email)), 'operator', true, p_metadata
  from public.tenant_workspace_links l
  join public.tenants t on t.stable_id = l.tenant_stable_id
  where l.workspace_id = p_workspace_id;
  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then raise exception 'operator_audit_target_unlinked'; end if;
end;
$$;

create function public.create_operator_action_approval(
  p_approver_email text,
  p_workspace_id uuid,
  p_action_kind text,
  p_target jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  approver_id uuid;
  normalized_email text;
  normalized_reason text;
  canonical_target jsonb;
  approval public.operator_action_approvals%rowtype;
begin
  approver_id := public.workspace_release_assert_operator(p_approver_email);
  perform public.workspace_release_assert_workspace(p_workspace_id);

  if p_action_kind = 'owner_invitation.issue' then
    normalized_email := lower(btrim(coalesce(p_target->>'recipientEmail', '')));
    if p_target is null or jsonb_typeof(p_target) <> 'object' then
      raise exception 'operator_action_approval_invalid';
    end if;
    if p_target - 'recipientEmail' - 'sendEmail' <> '{}'::jsonb
      or not (p_target ? 'recipientEmail') or not (p_target ? 'sendEmail')
      or jsonb_typeof(p_target->'sendEmail') <> 'boolean'
      or (p_target->>'sendEmail')::boolean is true
      or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or char_length(normalized_email) > 254 then
      raise exception 'operator_action_approval_invalid';
    end if;
    canonical_target := jsonb_build_object('recipientEmail', normalized_email, 'sendEmail', (p_target->>'sendEmail')::boolean);
  elsif p_action_kind = 'workspace_release_flag.on' then
    normalized_reason := btrim(coalesce(p_target->>'reason', ''));
    if p_target is null or jsonb_typeof(p_target) <> 'object' then
      raise exception 'operator_action_approval_invalid';
    end if;
    if p_target - 'flag' - 'state' - 'reason' <> '{}'::jsonb
      or not (p_target ? 'flag') or not (p_target ? 'state') or not (p_target ? 'reason')
      or p_target->>'flag' is null or not (p_target->>'flag' = any(public.workspace_release_flag_names()))
      or p_target->>'state' <> 'on' or char_length(normalized_reason) not between 3 and 500 then
      raise exception 'operator_action_approval_invalid';
    end if;
    canonical_target := jsonb_build_object('flag', p_target->>'flag', 'state', 'on', 'reason', normalized_reason);
  else
    raise exception 'operator_action_approval_invalid';
  end if;

  insert into public.operator_action_approvals(workspace_id, action_kind, target, approved_by, approved_email, expires_at)
    values (p_workspace_id, p_action_kind, canonical_target, approver_id, lower(btrim(p_approver_email)), clock_timestamp() + interval '15 minutes')
    returning * into approval;

  perform public.record_workspace_operator_audit(p_workspace_id, 'operator.action-approval.recorded',
    'operator_action_approval', approval.id::text, approver_id, p_approver_email,
    jsonb_build_object('approvalId', approval.id, 'actionKind', approval.action_kind, 'target', approval.target,
      'approvedBy', approval.approved_by, 'approvedAt', approval.approved_at));

  return jsonb_build_object('approvalId', approval.id, 'workspaceId', approval.workspace_id,
    'actionKind', approval.action_kind, 'target', approval.target, 'approvedBy', approval.approved_by,
    'approvedEmail', approval.approved_email, 'approvedAt', approval.approved_at, 'expiresAt', approval.expires_at);
end;
$$;

create function public.consume_operator_action_approval(
  p_operator_email text,
  p_approval_id uuid,
  p_workspace_id uuid,
  p_action_kind text,
  p_target jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  approval public.operator_action_approvals%rowtype;
begin
  operator_id := public.workspace_release_assert_operator(p_operator_email);
  select * into approval from public.operator_action_approvals where id = p_approval_id for update;
  if not found then raise exception 'operator_action_approval_required'; end if;
  if approval.consumed_at is not null then raise exception 'operator_action_approval_used'; end if;
  if approval.expires_at <= clock_timestamp() then raise exception 'operator_action_approval_expired'; end if;
  if approval.approved_by = operator_id then raise exception 'operator_action_approval_not_distinct'; end if;
  if approval.workspace_id <> p_workspace_id or approval.action_kind <> p_action_kind or approval.target <> p_target then
    raise exception 'operator_action_approval_mismatch';
  end if;
  if not exists (
    select 1 from public.users u join public.super_admins sa on sa.user_id = u.id and sa.revoked_at is null
    where u.id = approval.approved_by and u.verified_at is not null
  ) then raise exception 'operator_action_approval_authority_inactive'; end if;
  update public.operator_action_approvals set consumed_by = operator_id, consumed_at = clock_timestamp()
    where id = approval.id;
  return jsonb_build_object('approvalId', approval.id, 'approvedBy', approval.approved_by,
    'approvedEmail', approval.approved_email, 'approvedAt', approval.approved_at);
end;
$$;

create function public.create_operator_owner_invitation_approved(
  p_operator_email text,
  p_workspace_id uuid,
  p_recipient_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_approval_id uuid,
  p_send_email boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  normalized_recipient text := lower(btrim(coalesce(p_recipient_email, '')));
  approval jsonb;
  created jsonb;
begin
  if coalesce(p_send_email, false) then raise exception 'owner_invitation_email_disabled'; end if;
  operator_id := public.operator_owner_invitation_assert(p_operator_email, p_workspace_id);
  if exists (
    select 1 from public.users u where u.id = operator_id and lower(btrim(u.email)) = normalized_recipient
    union all
    select 1 from public.super_admins sa where lower(btrim(coalesce(sa.email, ''))) = normalized_recipient
    union all
    select 1 from public.users u join public.super_admins sa on sa.user_id = u.id
      where lower(btrim(coalesce(u.email, ''))) = normalized_recipient
    union all
    select 1 from auth.users au join public.super_admins sa on sa.user_id = au.id
      where lower(btrim(coalesce(au.email, ''))) = normalized_recipient
    union all
    select 1 from auth.identities ai join public.super_admins sa on sa.user_id = ai.user_id
      where lower(btrim(coalesce(ai.identity_data->>'email', ''))) = normalized_recipient
    union all
    select 1 from auth.identities ai where ai.user_id = operator_id
      and lower(btrim(coalesce(ai.identity_data->>'email', ''))) = normalized_recipient
    union all
    select 1 from public.workspace_memberships m join public.users u on u.id = m.user_id
      where m.user_id = operator_id and lower(btrim(u.email)) = normalized_recipient
    union all
    select 1 from public.memberships m join public.users u on u.id = m.user_id
      where m.user_id = operator_id and lower(btrim(u.email)) = normalized_recipient
  ) then raise exception 'operator_owner_invitation_controlled_recipient'; end if;
  if normalized_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_recipient) > 254
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '30 days' then
    raise exception 'workspace_invitation_command_invalid';
  end if;

  approval := public.consume_operator_action_approval(p_operator_email, p_approval_id, p_workspace_id,
    'owner_invitation.issue', jsonb_build_object('recipientEmail', normalized_recipient, 'sendEmail', coalesce(p_send_email, false)));
  created := public.create_operator_owner_invitation(p_operator_email, p_workspace_id, normalized_recipient, p_token_hash, p_expires_at);
  perform public.record_workspace_operator_audit(p_workspace_id, 'workspace.owner-invitation.issued',
    'workspace_invitation', created->>'invitationId', operator_id, p_operator_email,
    jsonb_build_object('workspaceId', p_workspace_id, 'invitationId', created->>'invitationId',
      'recipientEmail', normalized_recipient, 'sendEmailRequested', coalesce(p_send_email, false),
      'approvalId', approval->>'approvalId', 'approvedBy', approval->>'approvedBy', 'approvedAt', approval->>'approvedAt'));
  return created;
end;
$$;

create function public.revoke_operator_owner_invitation_audited(p_operator_email text, p_invitation_id uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  invitation public.workspace_invitations%rowtype;
  operator_id uuid;
  result text;
begin
  select * into invitation from public.workspace_invitations where id = p_invitation_id for update;
  if not found or invitation.issued_by_kind <> 'operator' then raise exception 'workspace_invitation_not_found'; end if;
  operator_id := public.operator_owner_invitation_assert(p_operator_email, invitation.workspace_id);
  result := public.revoke_operator_owner_invitation(p_operator_email, p_invitation_id);
  if result = 'revoked' then
    perform public.record_workspace_operator_audit(invitation.workspace_id, 'workspace.owner-invitation.revoked',
      'workspace_invitation', invitation.id::text, operator_id, p_operator_email,
      jsonb_build_object('workspaceId', invitation.workspace_id, 'invitationId', invitation.id,
        'recipientEmail', invitation.recipient_email));
  end if;
  return result;
end;
$$;

create function public.set_workspace_release_flag_approved(
  p_operator_email text,
  p_workspace_id uuid,
  p_flag text,
  p_state text,
  p_reason text,
  p_expected_revision bigint,
  p_approval_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  previous text;
  normalized_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.workspace_release_assert_operator(p_operator_email);
  if p_flag is null or not (p_flag = any(public.workspace_release_flag_names())) then raise exception 'workspace_release_flag_unknown'; end if;
  if p_state is null or p_state not in ('unset', 'off', 'operators', 'on') then raise exception 'workspace_release_state_invalid'; end if;
  if p_reason is null or char_length(normalized_reason) not between 3 and 500 then raise exception 'workspace_release_reason_required'; end if;
  perform public.workspace_release_assert_workspace(p_workspace_id);
  select state into previous from public.workspace_release_flags where workspace_id = p_workspace_id and flag = p_flag for update;
  previous := coalesce(previous, 'unset');
  if p_state = 'on' and previous <> 'on' then
    perform public.consume_operator_action_approval(p_operator_email, p_approval_id, p_workspace_id,
      'workspace_release_flag.on', jsonb_build_object('flag', p_flag, 'state', 'on', 'reason', normalized_reason));
  end if;
  return public.set_workspace_release_flag(p_operator_email, p_workspace_id, p_flag, p_state, normalized_reason, p_expected_revision);
end;
$$;

-- All writes must pass through an approval-aware function. The old internal
-- functions remain available only to their SECURITY DEFINER wrappers.
revoke all on function public.create_operator_owner_invitation(text, uuid, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.revoke_operator_owner_invitation(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_workspace_release_flag(text, uuid, text, text, text, bigint) from public, anon, authenticated, service_role;
revoke all on function public.operator_action_approval_immutable() from public, anon, authenticated, service_role;
revoke all on function public.record_workspace_operator_audit(uuid, text, text, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_operator_action_approval(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.consume_operator_action_approval(text, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_operator_owner_invitation_approved(text, uuid, text, text, timestamptz, uuid, boolean) from public, anon, authenticated;
revoke all on function public.revoke_operator_owner_invitation_audited(text, uuid) from public, anon, authenticated;
revoke all on function public.set_workspace_release_flag_approved(text, uuid, text, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.create_operator_action_approval(text, uuid, text, jsonb) to service_role;
grant execute on function public.create_operator_owner_invitation_approved(text, uuid, text, text, timestamptz, uuid, boolean) to service_role;
grant execute on function public.revoke_operator_owner_invitation_audited(text, uuid) to service_role;
grant execute on function public.set_workspace_release_flag_approved(text, uuid, text, text, text, bigint, uuid) to service_role;

commit;
