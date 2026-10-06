-- Make real for an owner with no account (owner-entry open decision 6,
-- needs-you open decision 1 (a)). Additive. Local only until Jacob's yes.
--
-- Why. Make real is owner-only. A signed one-tap link already decides every
-- owner item except access, money and exit, but the make_real source needs a
-- member identity to read the plan and run it, and the owner of a converted
-- business usually has no Strelva account (product model rule 6). The link
-- answered "Sign in to decide this", so a business whose owner never signs in
-- could never make anything real.
--
-- What this adds: a third Strelva (system) purpose, `make_real_link`, bound to
-- ONE open Make real decision and to the owner recipient on record.
--
--   strelva_make_real_link_session(workspace, decision, recipient)
--     Starts a 30-minute session only when: the decision is this business's,
--     lifecycle make_real, routed owner_decides, not sign-in-only and still
--     open; the recipient is the business's owner recipient
--     (resolve_business_owner_recipient, the same rule claim_owner_decision
--     applies to the link); that recipient has no owner account (an owner
--     with one decides as themselves); and Strelva runs the business. It
--     carries the read identity strelva_service_reader would (verified owner,
--     else verified admin), logged with the decision as its subject.
--   record_strelva_service_action
--     Also accepts a make_real_link session, for one `run` only, and only
--     after its decision is approved by owner link and before its outcome is
--     recorded. The run is logged before Make real starts, so nothing runs as
--     Strelva (system) unrecorded.
--
-- The owner stays the approver of record: the decision row says owner_link
-- and the owner's address. claim_owner_decision is unchanged (revision hash =
-- plan fingerprint, recipient, sign-in kinds), and Make real re-reads that
-- record before every step. Access, money and exit still need a sign-in.
--
-- Rollback: drop strelva_make_real_link_session; restore
-- record_strelva_service_action from 20261009100000_strelva_service_actor.sql;
-- then, with the immutability trigger disabled for that statement only,
-- delete strelva_service_actions rows with purpose 'make_real_link' and
-- restore the purpose check to ('needs_you_sync', 'make_real_resume').

set local lock_timeout = '3s';

alter table public.strelva_service_actions drop constraint strelva_service_actions_purpose_check;
alter table public.strelva_service_actions add constraint strelva_service_actions_purpose_check
  check (purpose in ('needs_you_sync', 'make_real_resume', 'make_real_link'));

create function public.strelva_make_real_link_session(p_workspace_id uuid, p_decision_id uuid, p_recipient text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.owner_decisions%rowtype;
  owner_recipient jsonb;
  reader record;
  session_id uuid;
begin
  if p_workspace_id is null or p_decision_id is null or p_recipient is null or btrim(p_recipient) = '' then
    raise exception 'strelva_service_invalid';
  end if;
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id;
  if not found or item.source_lifecycle <> 'make_real' or item.route <> 'owner_decides'
    or item.sign_in_required or item.state <> 'open' then
    raise exception 'strelva_service_access_denied';
  end if;
  owner_recipient := public.resolve_business_owner_recipient(p_workspace_id);
  if owner_recipient is null or lower(btrim(owner_recipient->>'email')) <> lower(btrim(p_recipient)) then
    raise exception 'owner_decision_recipient_not_owner';
  end if;
  -- An owner with an account decides as themselves (needs_you_owner_actor).
  if public.needs_you_owner_actor(p_workspace_id, p_recipient) is not null then
    raise exception 'strelva_service_owner_has_account';
  end if;
  if not public.strelva_runs_business(p_workspace_id) then return null; end if;
  select u.id as user_id, lower(u.email) as email, wm.role into reader
    from public.workspace_memberships wm
    join public.users u on u.id = wm.user_id and u.verified_at is not null
    where wm.workspace_id = p_workspace_id and wm.role in ('owner', 'admin')
    order by case wm.role when 'owner' then 0 else 1 end, wm.created_at, wm.user_id
    limit 1;
  if not found then return null; end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, on_behalf_user_id, on_behalf_role, subject, detail)
    values (p_workspace_id, 'make_real_link', 'session', reader.user_id, reader.role, 'owner_decision:' || item.id::text,
      'Signed owner link for a Make real plan; the owner has no account.')
    returning id into session_id;
  return jsonb_build_object('sessionId', session_id, 'workspaceId', p_workspace_id, 'purpose', 'make_real_link',
    'label', 'Strelva (system)', 'role', reader.role, 'userId', reader.user_id, 'verifiedEmail', reader.email,
    'decisionId', item.id);
end;
$$;

create or replace function public.record_strelva_service_action(
  p_workspace_id uuid, p_session_id uuid, p_action text, p_subject text, p_detail text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  created uuid;
  session_row public.strelva_service_actions%rowtype;
  item public.owner_decisions%rowtype;
begin
  if p_action is null or p_action not in ('resume', 'run', 'reconcile', 'rollback')
    or p_subject is null or char_length(p_subject) not between 1 and 300 then
    raise exception 'strelva_service_invalid';
  end if;
  select * into session_row from public.strelva_service_actions
    where id = p_session_id and workspace_id = p_workspace_id and action = 'session'
      and purpose in ('make_real_resume', 'make_real_link')
      and created_at > clock_timestamp() - interval '30 minutes';
  if not found then raise exception 'strelva_service_access_denied'; end if;
  if session_row.purpose = 'make_real_link' then
    -- One run, for the one decision the session was started for, once the owner's link approved it.
    if p_action <> 'run' then raise exception 'strelva_service_access_denied'; end if;
    select * into item from public.owner_decisions
      where workspace_id = p_workspace_id and id::text = split_part(session_row.subject, ':', 2);
    if not found or item.source_lifecycle <> 'make_real' or item.state <> 'approved'
      or item.decided_by_kind is distinct from 'owner_link' or item.outcome is not null then
      raise exception 'strelva_service_access_denied';
    end if;
    if exists (select 1 from public.strelva_service_actions where session_id = p_session_id and action = 'run') then
      raise exception 'strelva_service_access_denied';
    end if;
  end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, session_id, subject, detail)
    values (p_workspace_id, session_row.purpose, p_action, p_session_id, p_subject, left(p_detail, 500))
    returning id into created;
  return created;
end;
$$;

revoke all on function public.strelva_make_real_link_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_strelva_service_action(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.strelva_make_real_link_session(uuid, uuid, text) to service_role;
grant execute on function public.record_strelva_service_action(uuid, uuid, text, text, text) to service_role;
